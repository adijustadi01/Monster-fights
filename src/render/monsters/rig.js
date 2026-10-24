// Procedural rig helpers shared by all monster models:
//  - materials & jittered "rock" geometry
//  - Limb: a tapered cylinder stretched between two points
//  - solveKnee: 2-bone inverse kinematics
//  - LegSystem: feet that plant on the ground and take steps (with footstep callbacks)

import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

/** Standard material helper. */
export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.8,
    metalness: opts.metalness ?? 0.05,
    flatShading: opts.flat ?? true,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? true,
  });
}

/** Glowing material (emissive colour = colour). */
export function glow(color, intensity = 2, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.5,
    metalness: 0,
    flatShading: opts.flat ?? false,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? true,
  });
}

/** Deterministic pseudo-random for geometry jitter. */
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Low-poly rock: an icosahedron with jittered vertices. */
export function rockGeo(radius, detail = 1, jitter = 0.18, seed = 1, stretch = [1, 1, 1]) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.attributes.position;
  const rnd = seeded(seed * 9973 + 17);
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = 1 + (rnd() - 0.5) * 2 * jitter;
      map.set(key, k);
    }
    pos.setXYZ(i, pos.getX(i) * k * stretch[0], pos.getY(i) * k * stretch[1], pos.getZ(i) * k * stretch[2]);
  }
  g.computeVertexNormals();
  return g;
}

/** A mesh with shadows enabled per quality. */
export function mesh(geo, material, castShadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = castShadow;
  m.receiveShadow = false;
  return m;
}

/**
 * Limb: tapered cylinder between two points in the parent's local space.
 * Built once; call set(a, b) every frame.
 */
export class Limb {
  constructor(parent, material, rStart, rEnd, radial = 7, castShadow = true) {
    const g = new THREE.CylinderGeometry(rEnd, rStart, 1, radial, 1);
    g.translate(0, 0.5, 0);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.castShadow = castShadow;
    parent.add(this.mesh);
  }

  set(a, b) {
    tmpA.subVectors(b, a);
    const len = tmpA.length() || 0.001;
    this.mesh.position.copy(a);
    tmpQ.setFromUnitVectors(UP, tmpA.divideScalar(len));
    this.mesh.quaternion.copy(tmpQ);
    this.mesh.scale.set(1, len, 1);
  }
}

/** 2-bone IK: returns the knee position for hip->foot with bone lengths l1,l2. */
export function solveKnee(hip, foot, l1, l2, pole, out = new THREE.Vector3()) {
  const dir = tmpB.subVectors(foot, hip);
  let d = dir.length();
  const maxD = (l1 + l2) * 0.999;
  if (d > maxD) {
    dir.multiplyScalar(maxD / d);
    foot.copy(hip).add(dir);
    d = maxD;
  }
  d = Math.max(d, Math.abs(l1 - l2) + 0.01);
  dir.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = tmpC.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-6) p.set(0, 1, 0);
  p.normalize();
  out.copy(hip).addScaledVector(dir, a).addScaledVector(p, h);
  return out;
}

/**
 * LegSystem: procedural walking. Each leg has a hip (in body space) and a rest
 * foot spot (in root space). Feet stay planted in the world until they drift
 * too far from the rest spot, then step in an arc. Legs in group 0 and group 1
 * alternate so the gait looks natural.
 */
export class LegSystem {
  constructor(root, body, opts = {}) {
    this.root = root;
    this.body = body;
    this.legs = [];
    this.stepDist = opts.stepDist ?? 1.6;
    this.stepTime = opts.stepTime ?? 0.32;
    this.lift = opts.lift ?? 0.9;
    this.onStep = opts.onStep || null;
    this.lead = opts.lead ?? 0.35; // how far ahead feet aim when moving
    this.initialized = false;
  }

  /**
   * hip: Vector3 in BODY space. rest: Vector3 in ROOT space (y=0).
   * l1/l2: bone lengths. pole: Vector3 in ROOT space (knee bend direction).
   * limbs: { upper: Limb, lower: Limb, foot: Object3D (optional) }
   */
  addLeg(def) {
    const leg = {
      ...def,
      footWorld: new THREE.Vector3(),
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      t: -1,
      hipW: new THREE.Vector3(),
      knee: new THREE.Vector3(),
    };
    this.legs.push(leg);
    return leg;
  }

  resetFeet() {
    this.root.updateMatrixWorld(true);
    for (const l of this.legs) {
      l.footWorld.copy(l.rest).applyMatrix4(this.root.matrixWorld);
      l.footWorld.y = 0;
      l.t = -1;
    }
    this.initialized = true;
  }

  /**
   * velocity: world velocity {x,z}. grounded: are we standing?
   * tuck: 0..1 how much to pull feet up (flying / jumping).
   */
  update(dt, velocity, grounded, tuck = 0, speedMult = 1) {
    if (!this.initialized) this.resetFeet();
    const root = this.root;
    root.updateMatrixWorld(true);
    const speed = Math.hypot(velocity.x, velocity.z);
    const stepTime = this.stepTime / Math.max(0.6, Math.min(2.2, speedMult * (0.7 + speed * 0.08)));
    const anyStepping = [false, false];
    for (const l of this.legs) if (l.t >= 0) anyStepping[l.group] = true;

    for (const l of this.legs) {
      const desired = tmpA.copy(l.rest).applyMatrix4(root.matrixWorld);
      desired.x += velocity.x * this.lead * stepTime * 2;
      desired.z += velocity.z * this.lead * stepTime * 2;
      desired.y = 0;
      if (!grounded) {
        // Feet dangle / tuck relative to the body
        const hang = tmpB.copy(l.rest);
        hang.y = (l.tuckY ?? 0.6) * tuck * 3;
        hang.applyMatrix4(root.matrixWorld);
        l.footWorld.lerp(hang, Math.min(1, dt * 10));
        l.t = -1;
        continue;
      }
      if (l.t < 0) {
        const far = l.footWorld.distanceTo(desired);
        const other = 1 - l.group;
        if (far > this.stepDist && !anyStepping[other]) {
          l.t = 0;
          l.from.copy(l.footWorld);
          l.to.copy(desired);
          anyStepping[l.group] = true;
        } else if (l.footWorld.y > 0.01) {
          l.footWorld.y = Math.max(0, l.footWorld.y - dt * 20);
        }
      }
      if (l.t >= 0) {
        l.t += dt / stepTime;
        l.to.lerp(desired, Math.min(1, dt * 8));
        const t = Math.min(1, l.t);
        const e = t * t * (3 - 2 * t);
        l.footWorld.lerpVectors(l.from, l.to, e);
        l.footWorld.y = Math.sin(Math.PI * t) * this.lift;
        if (l.t >= 1) {
          l.t = -1;
          l.footWorld.y = 0;
          if (this.onStep) this.onStep(l, l.footWorld);
        }
      }
    }
  }

  /** Solve IK and place limb meshes. Call after body pose is set. */
  draw(overrides) {
    const root = this.root;
    this.body.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    const inv = tmpQ; // unused placeholder to keep allocations zero
    void inv;
    for (const l of this.legs) {
      // hip in root space
      l.hipW.copy(l.hip).applyMatrix4(this.body.matrixWorld);
      const hipLocal = root.worldToLocal(tmpA.copy(l.hipW));
      const target = overrides && overrides.get(l) ? overrides.get(l) : l.footWorld;
      const footLocal = root.worldToLocal(tmpB.copy(target));
      const kneeLocal = solveKnee(hipLocal, footLocal, l.l1, l.l2, l.pole, l.knee);
      l.upper.set(hipLocal, kneeLocal);
      l.lower.set(kneeLocal, footLocal);
      if (l.foot) {
        l.foot.position.copy(footLocal);
        if (l.footYaw !== undefined) l.foot.rotation.y = l.footYaw;
      }
      if (l.kneeCap) l.kneeCap.position.copy(kneeLocal);
    }
  }
}

/** Simple follow-the-leader chain (ribbon tails, vines). Points in world space. */
export class Chain {
  constructor(count, segLen, gravity = 0.6, damping = 0.9) {
    this.pts = [];
    this.prev = [];
    for (let i = 0; i < count; i++) {
      this.pts.push(new THREE.Vector3());
      this.prev.push(new THREE.Vector3());
    }
    this.segLen = segLen;
    this.gravity = gravity;
    this.damping = damping;
    this.init = false;
  }

  update(anchor, dt, extraForce) {
    const pts = this.pts;
    if (!this.init) {
      for (let i = 0; i < pts.length; i++) {
        pts[i].copy(anchor).add(new THREE.Vector3(0, -i * this.segLen, -i * this.segLen * 0.5));
        this.prev[i].copy(pts[i]);
      }
      this.init = true;
    }
    pts[0].copy(anchor);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const v = tmpA.subVectors(p, this.prev[i]).multiplyScalar(this.damping);
      this.prev[i].copy(p);
      p.add(v);
      p.y -= this.gravity * dt;
      if (extraForce) extraForce(p, i, tmpB);
    }
    for (let k = 0; k < 2; k++) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const d = tmpC.subVectors(b, a);
        const len = d.length() || 0.0001;
        b.copy(a).addScaledVector(d, this.segLen / len);
      }
    }
  }
}

/** Ribbon mesh following a chain of points (flat strip, width tapers). */
export class Ribbon {
  constructor(parent, count, width, material) {
    this.count = count;
    this.width = width;
    const g = new THREE.BufferGeometry();
    this.positions = new Float32Array(count * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const uv = new Float32Array(count * 2 * 2);
    const idx = [];
    for (let i = 0; i < count; i++) {
      uv[i * 4] = 0;
      uv[i * 4 + 1] = i / (count - 1);
      uv[i * 4 + 2] = 1;
      uv[i * 4 + 3] = i / (count - 1);
      if (i < count - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  /** pts: world points; side: world vector for the ribbon width direction */
  update(pts, side) {
    const p = this.positions;
    for (let i = 0; i < this.count; i++) {
      const w = this.width * (1 - (i / this.count) * 0.7);
      const pt = pts[i];
      p[i * 6] = pt.x + side.x * w;
      p[i * 6 + 1] = pt.y + side.y * w;
      p[i * 6 + 2] = pt.z + side.z * w;
      p[i * 6 + 3] = pt.x - side.x * w;
      p[i * 6 + 4] = pt.y - side.y * w;
      p[i * 6 + 5] = pt.z - side.z * w;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}

export function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}
export function easeIn(t) {
  return t * t;
}
export function smooth(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

/** Exponential approach helper for smooth animation. */
export function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
