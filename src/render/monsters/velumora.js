// VELUMORA - storm flyer with curled crescent membrane wings (procedurally
// flapping geometry with glowing lightning veins) and three ribbon tails.

import * as THREE from 'three';
import { mat, glow, mesh, Limb, LegSystem, Chain, Ribbon, damp, smooth } from './rig.js';

export const VELUMORA_PALETTES = {
  default: { body: '#4c4890', belly: '#d8d8ec', membrane: '#6a4ad8', vein: '#d8b8ff', eye: '#c0a0ff', tip: '#9a7aff' },
  solar: { body: '#6a4a18', belly: '#f0e0b0', membrane: '#e8a020', vein: '#fff4b0', eye: '#ffe080', tip: '#ffb030' },
  shadow: { body: '#120a18', belly: '#3a2a3a', membrane: '#3a0a1a', vein: '#ff2040', eye: '#ff1020', tip: '#ff2040' },
  ghost: { body: '#888', belly: '#aaa', membrane: '#999', vein: '#fff', eye: '#fff', tip: '#fff' },
};

function veinTexture(base, vein) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 128);
  grad.addColorStop(0, base);
  grad.addColorStop(1, '#ffffff');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 128);
  g.globalAlpha = 0.35;
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  g.globalAlpha = 1;
  g.strokeStyle = vein;
  g.shadowColor = vein;
  g.shadowBlur = 6;
  const branch = (x, y, ang, len, w) => {
    if (len < 6 || w < 0.4) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    branch(x2, y2, ang + (Math.random() - 0.5) * 0.9, len * 0.75, w * 0.7);
    if (Math.random() < 0.6) branch(x2, y2, ang + (Math.random() > 0.5 ? 0.8 : -0.8), len * 0.6, w * 0.6);
  };
  for (let i = 0; i < 9; i++) branch(0, 10 + i * 13, (Math.random() - 0.5) * 0.4, 40, 2.5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Crescent wing membrane, rebuilt each frame from flap parameters. */
class Wing {
  constructor(parent, side, material, span = 6.5, rootChord = 3.2) {
    this.side = side;
    this.span = span;
    this.rootChord = rootChord;
    this.N = 14;
    this.M = 5;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array((this.N + 1) * (this.M + 1) * 3);
    const uv = new Float32Array((this.N + 1) * (this.M + 1) * 2);
    const idx = [];
    for (let i = 0; i <= this.N; i++) {
      for (let j = 0; j <= this.M; j++) {
        const k = i * (this.M + 1) + j;
        uv[k * 2] = i / this.N;
        uv[k * 2 + 1] = j / this.M;
        if (i < this.N && j < this.M) {
          const a = k;
          const b = k + this.M + 1;
          if (side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
          else idx.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    // leading-edge bone (thin limb) for definition
    this.edge = [];
  }

  /** flap: -1..1, fold: 0 (open) .. 1 (folded), sweep: backwards sweep amount */
  update(flap, fold, sweep, curl) {
    const N = this.N;
    const M = this.M;
    const s = this.side;
    let x = 0;
    let y = 0;
    const ds = (this.span * (1 - fold * 0.45)) / N;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // bending along span: flap rotates progressively; tip curls up
      const ang = flap * (0.25 + t * 0.9) + fold * 1.1 * (1 - t * 0.3) + (t > 0.7 ? (t - 0.7) * curl * 4 : 0);
      if (i > 0) {
        x += Math.cos(ang) * ds;
        y += Math.sin(ang) * ds;
      }
      // crescent: chord narrows, leading edge sweeps back and hooks forward at the tip
      const chord = this.rootChord * (1 - Math.pow(t, 1.4) * 0.82) * (1 - fold * 0.35);
      const lead = 0.6 - sweep * t * t * 2.2 + (t > 0.82 ? (t - 0.82) * 9 * (1 - fold) : 0);
      for (let j = 0; j <= M; j++) {
        const k = (i * (M + 1) + j) * 3;
        const c = j / M;
        const billow = Math.sin(c * Math.PI) * Math.sin(t * Math.PI) * (0.25 + Math.abs(flap) * 0.2);
        this.pos[k] = s * (0.6 + x);
        this.pos[k + 1] = y - billow * (flap > 0 ? 1 : -0.5);
        this.pos[k + 2] = lead - c * chord;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

export function buildVelumora(palette, opts = {}) {
  const P = palette;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const world = opts.world;

  const bodyMat = mat(P.body, { roughness: 0.35, metalness: 0.5, flat: false });
  const bellyMat = mat(P.belly, { roughness: 0.3, metalness: 0.6, flat: false });
  const eyeMat = glow(P.eye, 3);
  const tipMat = glow(P.tip, 2.5);
  const veinTex = veinTexture(P.membrane, P.vein);
  const membraneMat = new THREE.MeshStandardMaterial({ map: veinTex, emissiveMap: veinTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.55, transparent: true, opacity: 0.88, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.2, depthWrite: true });
  const ribbonMat = new THREE.MeshStandardMaterial({ color: P.body, emissive: P.tip, emissiveIntensity: 0.35, side: THREE.DoubleSide, roughness: 0.3, metalness: 0.5 });
  const materials = { bodyMat, bellyMat, eyeMat, tipMat, membraneMat };

  // Torso: sleek, ray-like
  const torso = mesh(new THREE.SphereGeometry(1, 20, 14), bodyMat);
  torso.scale.set(1.15, 0.7, 2.0);
  body.add(torso);
  const belly = mesh(new THREE.SphereGeometry(1, 16, 10), bellyMat);
  belly.scale.set(0.9, 0.5, 1.7);
  belly.position.set(0, -0.25, 0.1);
  body.add(belly);
  // dorsal ridge
  for (let i = 0; i < 5; i++) {
    const r = mesh(new THREE.ConeGeometry(0.12, 0.6, 5), bellyMat);
    r.position.set(0, 0.62, 1 - i * 0.55);
    r.rotation.x = -0.6;
    body.add(r);
  }
  // Head
  const neck = new THREE.Group();
  neck.position.set(0, 0.15, 1.7);
  body.add(neck);
  const head = mesh(new THREE.SphereGeometry(0.7, 16, 12), bodyMat);
  head.scale.set(1, 0.75, 1.3);
  head.position.set(0, 0.1, 0.5);
  neck.add(head);
  const crest = mesh(new THREE.SphereGeometry(0.5, 12, 8), bellyMat);
  crest.scale.set(1.1, 0.5, 1.4);
  crest.position.set(0, 0.35, 0.35);
  neck.add(crest);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.13, 8, 6), eyeMat, false);
    eye.position.set(s * 0.38, 0.22, 0.95);
    neck.add(eye);
  }
  // Wings
  const wingL = new Wing(body, 1, membraneMat);
  const wingR = new Wing(body, -1, membraneMat);
  // wing arm bones (leading edge)
  const boneL = new Limb(body, bodyMat, 0.22, 0.08, 6);
  const boneR = new Limb(body, bodyMat, 0.22, 0.08, 6);

  // Claws (2 legs with IK so it can perch on the ground)
  const legs = new LegSystem(root, body, { stepDist: 1.4, stepTime: 0.22, lift: 0.5, onStep: opts.onStep });
  const legList = [];
  for (const s of [-1, 1]) {
    const upper = new Limb(root, bodyMat, 0.22, 0.17, 6);
    const lower = new Limb(root, bellyMat, 0.17, 0.12, 6);
    const foot = new THREE.Group();
    for (let k = -1; k <= 1; k++) {
      const claw = mesh(new THREE.ConeGeometry(0.08, 0.5, 5), bodyMat);
      claw.rotation.x = Math.PI / 2 + 0.4;
      claw.position.set(k * 0.15, 0.1, 0.25);
      foot.add(claw);
    }
    root.add(foot);
    legList.push(legs.addLeg({ hip: new THREE.Vector3(s * 0.6, -0.4, 0.6), rest: new THREE.Vector3(s * 0.9, 0, 1.0), l1: 1.2, l2: 1.2, pole: new THREE.Vector3(0, 0.3, 1), group: s > 0 ? 0 : 1, upper, lower, foot, tuckY: 1.3 }));
  }

  // Ribbon tails (simulated in world space)
  const tails = [];
  for (let i = 0; i < 3; i++) {
    const chain = new Chain(18, 0.55, 0.35, 0.86);
    const ribbon = new Ribbon(world, 18, 0.22, ribbonMat);
    const tip = mesh(new THREE.SphereGeometry(0.28, 10, 8), tipMat, false);
    tip.scale.set(1, 1, 1.6);
    world.add(tip);
    tails.push({ chain, ribbon, tip, offset: (i - 1) * 0.35, phase: i * 1.7 });
  }

  const pose = { y: 1.6, pitch: 0, roll: 0, yaw: 0, flap: 0, fold: 0.5, sweep: 0.3, curl: 0.5, flapT: 0, lunge: 0, spin: 0 };
  const tmp = new THREE.Vector3();
  const side = new THREE.Vector3();

  function update(a) {
    const dt = a.dt;
    const flying = a.fly > 0.5 || a.airborne;
    // On the ground Velumora hovers low on slow, gentle wingbeats
    let ty = flying ? 0.5 : 1.9;
    let tp = 0;
    let tr = 0;
    let fold = flying ? 0 : 0.12;
    let sweep = flying ? 0.3 : 0.55;
    let curl = 0.6;
    let flapSpeed = flying ? 3.2 : 1.4;
    let flapAmp = flying ? 0.45 : 0.22;
    let tl = 0;
    let spin = 0;
    // bank into strafes
    if (flying) {
      const fwd = Math.sin(a.fighter.yaw) * a.vel.x + Math.cos(a.fighter.yaw) * a.vel.z;
      const lat = Math.cos(a.fighter.yaw) * a.vel.x - Math.sin(a.fighter.yaw) * a.vel.z;
      tr = -lat * 0.04;
      tp = fwd * 0.02;
      if (a.stamina < 0.25) flapSpeed = 5;
    }
    if (a.state === 'attack') {
      const k = a.kind;
      if (k === 'melee') {
        if (a.chain === 2) {
          // ribbon lash: full spin
          if (a.phase === 'active') spin = Math.PI * 2 * a.phaseT;
          else if (a.phase === 'startup') spin = -0.4 * smooth(a.phaseT);
          fold = 0.3;
        } else {
          const s = a.chain === 0 ? 1 : -1;
          if (a.phase === 'startup') {
            tr = -s * 0.5 * smooth(a.phaseT);
            fold = 0.2;
          } else if (a.phase === 'active') {
            tr = s * 0.6;
            tl = 0.8;
            flapAmp = 0.9;
            fold = 0;
          } else tr = s * 0.3 * (1 - a.phaseT);
        }
      } else if (k === 'dive') {
        if (a.phase === 'startup') {
          tp = -0.5 * smooth(a.phaseT);
          fold = 0;
          flapSpeed = 6;
        } else if (a.phase === 'active') {
          tp = 0.9;
          fold = 0.9;
          sweep = 1.2;
          flapAmp = 0;
        } else {
          tp = 0.2 * (1 - a.phaseT);
          fold = 0.6;
        }
      } else if (k === 'projectile') {
        fold = 0;
        if (a.phase === 'startup') {
          tp = -0.25;
          flapAmp = 0.1;
          curl = 1.2;
        } else tp = 0.1;
      } else if (k === 'vortex') {
        fold = 0;
        curl = 1.4;
        spin = a.phase === 'startup' ? a.phaseT * Math.PI * 4 : 0;
        ty += a.phase === 'startup' ? 0.6 : 0;
      }
    }
    if (a.block > 0) {
      fold = Math.max(fold, 0.9 * a.block);
      sweep = 0.8;
      tp -= 0.2 * a.block;
    }
    if (a.dodge) tr += 0.8;
    if (a.hit > 0) {
      tp -= 0.4 * a.hit;
      flapAmp += 0.5 * a.hit;
    }
    if (a.knock > 0) {
      tr += 1.2 * a.knock;
      ty = 0.4;
      fold = 0.4;
      flapAmp = 0.05;
    }
    if (a.ko > 0) {
      ty = 0.4 * (1 - a.ko) + 0.3;
      tr += 0.9 * a.ko;
      fold = 0.2;
      flapAmp = 0.02;
      flapSpeed = 0.5;
    }
    if (a.victory > 0) {
      fold = 0;
      flapAmp = 0.7;
      flapSpeed = 4;
      tp -= 0.35 * a.victory;
      curl = 1.2;
    }

    pose.flapT += dt * flapSpeed * Math.PI * 2 * 0.5;
    pose.flap = damp(pose.flap, Math.sin(pose.flapT) * flapAmp, 20, dt);
    pose.fold = damp(pose.fold, fold, 6, dt);
    pose.sweep = damp(pose.sweep, sweep, 6, dt);
    pose.curl = damp(pose.curl, curl, 4, dt);
    pose.y = damp(pose.y, ty + (flying ? -pose.flap * 0.4 : Math.sin(a.t * 2) * 0.05), 10, dt);
    pose.pitch = damp(pose.pitch, tp, 8, dt);
    pose.roll = damp(pose.roll, tr, 8, dt);
    pose.lunge = damp(pose.lunge, tl, 12, dt);
    pose.spin = spin ? spin : damp(pose.spin, 0, 10, dt);

    body.position.set(0, pose.y, pose.lunge);
    body.rotation.set(pose.pitch, pose.spin, pose.roll, 'YXZ');
    neck.rotation.x = Math.sin(a.t * 1.3) * 0.08 - pose.pitch * 0.4;

    wingL.update(pose.flap, pose.fold, pose.sweep, pose.curl);
    wingR.update(pose.flap, pose.fold, pose.sweep, pose.curl);
    // leading edge bones follow the first span points of each wing
    const pl = wingL.pos;
    const pr = wingR.pos;
    const mid = wingL.M; // j=0 at leading edge
    void mid;
    const idx = (i) => i * (wingL.M + 1) * 3;
    const e = Math.floor(wingL.N * 0.55);
    boneL.set(new THREE.Vector3(pl[0], pl[1], pl[2]), new THREE.Vector3(pl[idx(e)], pl[idx(e) + 1], pl[idx(e) + 2]));
    boneR.set(new THREE.Vector3(pr[0], pr[1], pr[2]), new THREE.Vector3(pr[idx(e)], pr[idx(e) + 1], pr[idx(e) + 2]));
    // lightning veins flicker
    membraneMat.emissiveIntensity = 0.45 + Math.random() * 0.25 + (a.state === 'attack' && a.phase === 'startup' ? 0.8 : 0);

    legs.update(dt, a.vel, a.grounded && !flying, flying ? 1 : 0);
    legs.draw();

    // Tails: each point eases toward a flowing target trailing behind the body
    body.updateMatrixWorld(true);
    const q = body.getWorldQuaternion(new THREE.Quaternion());
    side.set(1, 0, 0).applyQuaternion(q);
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    tails.forEach((tl2) => {
      const pts = tl2.chain.pts;
      const anchor = body.localToWorld(tmp.set(tl2.offset, -0.1, -1.9));
      if (!tl2.init) {
        pts.forEach((p, k) => p.copy(anchor).addScaledVector(back, k * 0.55));
        tl2.init = true;
      }
      pts[0].copy(anchor);
      for (let k = 1; k < pts.length; k++) {
        const wave = Math.sin(a.t * 2.6 + tl2.phase - k * 0.45);
        const target = new THREE.Vector3().copy(pts[k - 1]).addScaledVector(back, 0.5);
        target.y -= 0.12 + (flying ? 0 : 0.05);
        target.addScaledVector(side, wave * 0.12 * (1 + tl2.offset));
        target.y += Math.cos(a.t * 2.1 + tl2.phase - k * 0.4) * 0.08;
        pts[k].lerp(target, 1 - Math.exp(-(26 - k) * dt));
        // keep segment length
        const d = pts[k].clone().sub(pts[k - 1]);
        const len = d.length() || 1;
        pts[k].copy(pts[k - 1]).addScaledVector(d, Math.min(1, 0.6 / len));
        if (pts[k].y < 0.12) pts[k].y = 0.12;
      }
      tl2.ribbon.update(pts, side);
      tl2.tip.position.copy(pts[pts.length - 1]);
    });
  }

  const anchors = {
    mouth: () => neck.localToWorld(new THREE.Vector3(0, 0, 1.2)),
    center: () => body.localToWorld(new THREE.Vector3(0, 0, 0)),
    wingTipL: () => body.localToWorld(new THREE.Vector3(wingL.pos[wingL.N * (wingL.M + 1) * 3], wingL.pos[wingL.N * (wingL.M + 1) * 3 + 1], wingL.pos[wingL.N * (wingL.M + 1) * 3 + 2])),
  };

  function dispose() {
    for (const t of tails) {
      world.remove(t.ribbon.mesh, t.tip);
      t.ribbon.geo.dispose();
    }
  }

  return { root, body, legs, materials, update, anchors, dispose, height: 2.6 };
}
