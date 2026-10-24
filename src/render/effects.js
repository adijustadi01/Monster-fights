// Visual effects: pooled GPU particles (glow + smoke), falling debris chunks,
// lightning bolts, ground shock rings and impact flashes.

import * as THREE from 'three';

function makeSpriteTexture(soft = true) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

const VERT = `
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = alpha;
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D uTex;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`;

class ParticleSystem {
  constructor(scene, max, additive) {
    this.max = max;
    this.count = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: makeSpriteTexture(true) }, uScale: { value: 300 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 5;
    scene.add(this.points);
    // per particle sim data
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.next = 0;
  }

  spawn(x, y, z, vx, vy, vz, life, size0, size1, r, g, b, alpha = 1, gravity = 0, drag = 0) {
    // ring buffer: overwrite oldest
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    if (this.count < this.max) this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = size0;
    this.s1[i] = size1;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.a0[i] = alpha;
    this.grav[i] = gravity;
    this.drag[i] = drag;
  }

  update(dt) {
    const n = this.max;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05 && this.grav[i] > 0) {
        this.pos[i * 3 + 1] = 0.05;
        this.vel[i * 3 + 1] *= -0.3;
        this.vel[i * 3] *= 0.6;
        this.vel[i * 3 + 2] *= 0.6;
      }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
  }
}

/** Falling rock / wood / metal chunks for destruction. */
class Debris {
  constructor(scene, max) {
    this.max = max;
    const g = new THREE.DodecahedronGeometry(0.5, 0);
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    this.mesh = new THREE.InstancedMesh(g, m, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 1, life: 0 });
      this.mesh.setColorAt(i, new THREE.Color('#888'));
    }
    this.next = 0;
    this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
    this.hideAll();
  }

  hideAll() {
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(pos, color, count, size = 1, speed = 8, upward = 8) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const it = this.items[i];
      it.alive = true;
      it.p.set(pos.x + (Math.random() - 0.5) * 2 * size, pos.y + Math.random() * 2 * size, pos.z + (Math.random() - 0.5) * 2 * size);
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random());
      it.v.set(Math.cos(a) * sp, upward * (0.4 + Math.random()), Math.sin(a) * sp);
      it.w.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      it.s = size * (0.4 + Math.random() * 0.9);
      it.life = 3 + Math.random() * 2;
      const shade = 0.75 + Math.random() * 0.4;
      this.mesh.setColorAt(i, c.clone().multiplyScalar(shade));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (!it.alive) continue;
      any = true;
      it.life -= dt;
      it.v.y -= 25 * dt;
      it.p.addScaledVector(it.v, dt);
      if (it.p.y < it.s * 0.4) {
        it.p.y = it.s * 0.4;
        it.v.y *= -0.25;
        it.v.x *= 0.5;
        it.v.z *= 0.5;
        it.w.multiplyScalar(0.5);
      }
      it.r.x += it.w.x * dt;
      it.r.y += it.w.y * dt;
      it.r.z += it.w.z * dt;
      const sc = it.life < 0.6 ? it.s * (it.life / 0.6) : it.s;
      this.dummy.position.copy(it.p);
      this.dummy.rotation.copy(it.r);
      this.dummy.scale.setScalar(Math.max(0, sc));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      if (it.life <= 0) it.alive = false;
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const TYPE_COLORS = {
  physical: [1, 0.92, 0.8],
  fire: [1, 0.45, 0.08],
  electric: [0.75, 0.55, 1],
  water: [0.3, 0.85, 1],
  root: [0.55, 0.95, 0.35],
  energy: [0.55, 0.95, 1],
  shockwave: [1, 0.85, 0.45],
};

export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    const q = quality === 'low' ? 0.45 : quality === 'medium' ? 0.75 : 1;
    this.q = q;
    this.glow = new ParticleSystem(scene, Math.round(2600 * q), true);
    this.smoke = new ParticleSystem(scene, Math.round(1600 * q), false);
    this.debris = new Debris(scene, Math.round(220 * q) + 40);
    this.bolts = [];
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48, 1);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringGeo = ringGeo;
    this.flash = new THREE.PointLight('#ffffff', 0, 30, 2);
    scene.add(this.flash);
    this.flashT = 0;
  }

  setPixelScale(heightPx) {
    this.glow.material.uniforms.uScale.value = heightPx * 0.9;
    this.smoke.material.uniforms.uScale.value = heightPx * 0.9;
  }

  n(count) {
    return Math.max(1, Math.round(count * this.q));
  }

  /** Generic radial burst. */
  burst(p, o) {
    const sys = o.additive === false ? this.smoke : this.glow;
    const count = this.n(o.count || 20);
    const [r, g, b] = o.rgb || [1, 1, 1];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI * (o.vertical ?? 0.5);
      const sp = (o.speed || 8) * (0.3 + Math.random() * 0.9);
      const vx = Math.cos(a) * Math.cos(e) * sp + (o.dir ? o.dir.x * sp : 0);
      const vy = Math.sin(e) * sp + (o.up || 0) * (0.5 + Math.random());
      const vz = Math.sin(a) * Math.cos(e) * sp + (o.dir ? o.dir.z * sp : 0);
      const life = (o.life || 0.6) * (0.6 + Math.random() * 0.7);
      const jitter = o.jitter || 0;
      sys.spawn(
        p.x + (Math.random() - 0.5) * jitter, p.y + (Math.random() - 0.5) * jitter, p.z + (Math.random() - 0.5) * jitter,
        vx, vy, vz, life, (o.size || 1) * (0.6 + Math.random() * 0.8), (o.sizeEnd ?? o.size ?? 1) * (0.6 + Math.random()),
        r * (0.85 + Math.random() * 0.3), g * (0.85 + Math.random() * 0.3), b * (0.85 + Math.random() * 0.3),
        o.alpha ?? 1, o.gravity || 0, o.drag ?? 2,
      );
    }
  }

  impact(p, type, heavy, scale = 1) {
    const rgb = TYPE_COLORS[type] || TYPE_COLORS.physical;
    this.burst(p, { count: (heavy ? 45 : 18) * scale, rgb, speed: heavy ? 16 : 9, size: heavy ? 1.6 : 1, sizeEnd: 0.2, life: heavy ? 0.6 : 0.35, vertical: 1, drag: 3 });
    this.burst(p, { count: 3, rgb: [1, 1, 1], speed: 0.5, size: heavy ? 7 : 4, sizeEnd: heavy ? 10 : 6, life: 0.15, drag: 1 });
    if (type === 'water') this.splash(p, heavy ? 1.4 : 0.7);
    if (type === 'fire') this.burst(p, { count: 14, rgb: [1, 0.3, 0.05], speed: 5, up: 4, size: 1.4, sizeEnd: 0.1, life: 0.8, gravity: -2 });
    if (type === 'root') this.leaves(p, heavy ? 16 : 8);
    if (type === 'energy') this.shards(p, heavy ? 14 : 6);
    if (type === 'electric') this.sparkle(p, heavy ? 1.2 : 0.6, rgb);
    if (heavy) this.flashAt(p, rgb, 6 * scale);
  }

  sparkle(p, s, rgb = [0.75, 0.55, 1]) {
    this.burst(p, { count: 20 * s, rgb, speed: 18, size: 0.5, sizeEnd: 0.1, life: 0.25, vertical: 1, drag: 4 });
    for (let i = 0; i < 2; i++) {
      const to = new THREE.Vector3(p.x + (Math.random() - 0.5) * 6 * s, p.y + (Math.random() - 0.5) * 4 * s, p.z + (Math.random() - 0.5) * 6 * s);
      this.lightning(p, to, '#c8a8ff', 0.12, 0.6);
    }
  }

  flashAt(p, rgb, intensity = 6) {
    this.flash.position.set(p.x, p.y + 1, p.z);
    this.flash.color.setRGB(rgb[0], rgb[1], rgb[2]);
    this.flash.intensity = intensity * 20;
    this.flashT = 0.15;
  }

  dust(p, amount = 1, color = [0.6, 0.55, 0.5]) {
    this.burst(p, { count: 14 * amount, rgb: color, speed: 5 * amount, size: 2.5, sizeEnd: 5, life: 1.1, vertical: 0.15, additive: false, alpha: 0.55, drag: 2.5, up: 1.2 });
  }

  steam(p, amount = 1) {
    this.burst(p, { count: 4 * amount, rgb: [0.85, 0.88, 0.92], speed: 1.2, up: 4, size: 1.5, sizeEnd: 4.5, life: 1.4, additive: false, alpha: 0.45, drag: 1, jitter: 1 });
  }

  embers(p, amount = 1) {
    this.burst(p, { count: 6 * amount, rgb: [1, 0.45, 0.1], speed: 2, up: 5, size: 0.5, sizeEnd: 0.1, life: 1.4, gravity: -1, drag: 0.5, jitter: 1.5 });
  }

  splash(p, amount = 1) {
    this.burst(p, { count: 30 * amount, rgb: [0.75, 0.95, 1], speed: 7, up: 8, size: 0.9, sizeEnd: 0.3, life: 0.9, gravity: 22, drag: 0.5, vertical: 0.8 });
    this.burst(p, { count: 6 * amount, rgb: [0.9, 0.97, 1], speed: 2, up: 2, size: 3, sizeEnd: 6, life: 0.8, additive: false, alpha: 0.5 });
  }

  leaves(p, count = 10) {
    this.burst(p, { count, rgb: [0.4, 0.75, 0.2], speed: 6, up: 6, size: 0.8, sizeEnd: 0.6, life: 1.6, gravity: 6, drag: 2, additive: false, vertical: 1 });
    this.burst(p, { count: count / 2, rgb: [0.55, 0.4, 0.2], speed: 8, up: 5, size: 0.6, sizeEnd: 0.4, life: 1.2, gravity: 14, drag: 1, additive: false, vertical: 1 });
  }

  shards(p, count = 10) {
    this.burst(p, { count, rgb: [0.7, 0.9, 1], speed: 12, up: 3, size: 0.7, sizeEnd: 0.2, life: 0.8, gravity: 15, drag: 1, vertical: 1 });
    this.burst(p, { count: count / 2, rgb: [1, 0.7, 1], speed: 10, up: 3, size: 0.6, sizeEnd: 0.2, life: 0.7, gravity: 15, drag: 1, vertical: 1 });
  }

  /** Jagged lightning bolt from a to b. */
  lightning(a, b, color = '#d0b8ff', life = 0.2, jag = 1.2) {
    const pts = [];
    const segs = 10;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const off = i === 0 || i === segs ? 0 : jag;
      pts.push(new THREE.Vector3(
        a.x + (b.x - a.x) * t + (Math.random() - 0.5) * off,
        a.y + (b.y - a.y) * t + (Math.random() - 0.5) * off,
        a.z + (b.z - a.z) * t + (Math.random() - 0.5) * off,
      ));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(g, m);
    this.scene.add(line);
    this.bolts.push({ line, life, max: life });
  }

  /** Big strike from the sky. */
  skyStrike(p, color = '#d8c8ff') {
    const top = new THREE.Vector3(p.x + (Math.random() - 0.5) * 4, 60, p.z + (Math.random() - 0.5) * 4);
    for (let i = 0; i < 3; i++) this.lightning(top, new THREE.Vector3(p.x, 0, p.z), color, 0.35, 4);
    this.burst(p, { count: 50, rgb: [0.8, 0.7, 1], speed: 18, up: 6, size: 1.2, sizeEnd: 0.1, life: 0.5, vertical: 0.6 });
    this.flashAt({ x: p.x, y: 6, z: p.z }, [0.8, 0.7, 1], 14);
    this.groundRing(p, '#c8a8ff', 6, 0.5);
  }

  /** Expanding flat ring on the ground. */
  groundRing(p, color, maxR = 6, life = 0.5) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.ringGeo, m);
    mesh.position.set(p.x, 0.15, p.z);
    this.scene.add(mesh);
    this.rings.push({ mesh, life, max: life, maxR });
  }

  debrisBurst(p, color, count, size, speed = 8, up = 10) {
    this.debris.spawn(p, color, Math.max(2, Math.round(count * (0.4 + this.q * 0.6))), size, speed, up);
  }

  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    this.debris.update(dt);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.line.material.opacity = Math.max(0, b.life / b.max) * (Math.random() > 0.3 ? 1 : 0.4);
      if (b.life <= 0) {
        this.scene.remove(b.line);
        b.line.geometry.dispose();
        b.line.material.dispose();
        this.bolts.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.5 + t * r.maxR);
      r.mesh.material.opacity = (1 - t) * 0.9;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.intensity *= 0.82;
      if (this.flashT <= 0) this.flash.intensity = 0;
    }
  }

  clear() {
    this.glow.clear();
    this.smoke.clear();
    for (const b of this.bolts) this.scene.remove(b.line);
    this.bolts.length = 0;
    for (const r of this.rings) this.scene.remove(r.mesh);
    this.rings.length = 0;
  }
}

export { TYPE_COLORS };
