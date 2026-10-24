// Visuals for battle entities: projectiles, Magma Quake rings, water beams,
// Thunder Vortex, wooden barriers, root grabs, Forest Lock and Prismor decoys.

import * as THREE from 'three';
import { TYPE_COLORS } from './effects.js';
import { glow, mat } from './monsters/rig.js';
import { segIntersect } from '../logic/math.js';

const typeColor = (t) => {
  const c = TYPE_COLORS[t] || [1, 1, 1];
  return new THREE.Color(c[0], c[1], c[2]);
};

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(120,220,255,0.0)');
  grad.addColorStop(0.3, 'rgba(160,235,255,0.9)');
  grad.addColorStop(0.5, 'rgba(240,255,255,1)');
  grad.addColorStop(0.7, 'rgba(160,235,255,0.9)');
  grad.addColorStop(1, 'rgba(120,220,255,0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  g.globalAlpha = 0.5;
  for (let i = 0; i < 40; i++) {
    g.fillStyle = '#ffffff';
    g.fillRect(Math.random() * 64, Math.random() * 256, 2 + Math.random() * 6, 10 + Math.random() * 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class EntitiesView {
  constructor(scene, fx, quality, makeDecoyView) {
    this.scene = scene;
    this.fx = fx;
    this.quality = quality;
    this.makeDecoyView = makeDecoyView;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.map = new Map();
    this.waterTex = waterTexture();
    this.t = 0;
    this.spikes = []; // temporary root spikes
    this.sharedGeo = {
      sphere: new THREE.SphereGeometry(1, 16, 12),
      ring: new THREE.TorusGeometry(1, 0.06, 6, 64),
      beam: new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2),
      spike: new THREE.ConeGeometry(0.5, 3, 5).translate(0, 1.5, 0),
      log: new THREE.CylinderGeometry(0.45, 0.55, 1, 7).translate(0, 0.5, 0),
    };
    this.rootMat = mat('#6a4a2a', { roughness: 1 });
    this.rootGlowMat = glow('#9aff5a', 1.2);
  }

  key(obj) {
    return obj;
  }

  sync(battle, views, dt) {
    this.t += dt;
    const seen = new Set();
    // ---- Projectiles ----
    for (const p of battle.projectiles) {
      seen.add(p);
      let v = this.map.get(p);
      if (!v) {
        const col = typeColor(p.spec.type);
        const core = new THREE.Mesh(this.sharedGeo.sphere, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        core.scale.setScalar(p.radius * 0.6);
        const halo = new THREE.Mesh(this.sharedGeo.sphere, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.scale.setScalar(p.radius * 1.6);
        const g = new THREE.Group();
        g.add(core, halo);
        this.group.add(g);
        v = { g, halo, last: new THREE.Vector3(p.x, p.y, p.z), type: 'proj', col };
        this.map.set(p, v);
      }
      if (p.reflected && !v.reflected) {
        v.reflected = true;
        v.halo.material.color.set('#7fe6ff');
      }
      v.g.position.set(p.x, p.y, p.z);
      v.halo.scale.setScalar(p.radius * (1.4 + Math.sin(this.t * 40) * 0.3));
      const c = v.halo.material.color;
      this.fx.burst({ x: p.x, y: p.y, z: p.z }, { count: 3, rgb: [c.r, c.g, c.b], speed: 1, size: 1.4, sizeEnd: 0.1, life: 0.25, drag: 4 });
      if (p.spec.type === 'electric' && Math.random() < 0.5) this.fx.lightning(v.last.clone(), new THREE.Vector3(p.x, p.y, p.z), '#e0d0ff', 0.08, 0.8);
      v.last.set(p.x, p.y, p.z);
    }

    // ---- Quake / slam rings ----
    for (const r of battle.rings) {
      seen.add(r);
      let v = this.map.get(r);
      if (!v) {
        const m = new THREE.MeshBasicMaterial({ color: typeColor(r.spec.type), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 6, 64), m);
        ring.rotation.x = Math.PI / 2;
        this.group.add(ring);
        v = { g: ring, type: 'ring' };
        this.map.set(r, v);
      }
      v.g.position.set(r.x, 0.35, r.z);
      v.g.scale.set(r.r, r.r, r.spec.ringWidth * 4);
      v.g.material.opacity = 0.9 * (1 - r.r / r.spec.ringMaxRadius);
      // lava spurts along the ring edge
      const n = this.quality === 'low' ? 3 : 7;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.burst({ x: r.x + Math.cos(a) * r.r, y: 0.3, z: r.z + Math.sin(a) * r.r }, { count: 1, rgb: [1, 0.45, 0.1], speed: 1.5, up: 7, size: 1.3, sizeEnd: 0.3, life: 0.6, gravity: 14 });
      }
      if (Math.random() < 0.25) this.fx.dust({ x: r.x + Math.cos(this.t * 7) * r.r, y: 0.3, z: r.z + Math.sin(this.t * 7) * r.r }, 0.4);
    }

    // ---- Water beams ----
    for (const f of battle.fighters) {
      const active = f.state === 'attack' && f.phase === 'active' && f.move && (f.move.kind === 'stream' || f.move.kind === 'siege');
      const k = 'beam' + f.index;
      let v = this.map.get(k);
      if (!active) {
        if (v) {
          for (const b of v.beams) b.visible = false;
        }
        continue;
      }
      seen.add(k);
      if (!v) {
        const beams = [];
        for (let i = 0; i < 2; i++) {
          const m = new THREE.MeshBasicMaterial({ map: this.waterTex, color: '#bff4ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
          const b = new THREE.Mesh(this.sharedGeo.beam, m);
          this.group.add(b);
          beams.push(b);
        }
        v = { beams, type: 'beam' };
        this.map.set(k, v);
      }
      const m = f.move;
      const view = views[f.index];
      const offsets = m.kind === 'siege' ? [-m.spreadDegrees, m.spreadDegrees] : [0];
      v.beams.forEach((b, i) => {
        if (i >= offsets.length) {
          b.visible = false;
          return;
        }
        b.visible = true;
        const yaw = f.yaw + (offsets[i] * Math.PI) / 180;
        const anchorName = offsets.length === 1 ? 'cannonR' : i === 0 ? 'cannonL' : 'cannonR';
        const start = view ? view.anchor(anchorName) : new THREE.Vector3(f.pos.x, f.pos.y + f.height * 0.6, f.pos.z);
        const t = battle.targetOf(f);
        const tp = t.pos || t;
        const horiz = Math.max(1, Math.hypot(tp.x - start.x, tp.z - start.z));
        const pitch = Math.max(-0.6, Math.min(0.8, ((tp.y || 0) + (t.height || 3) * 0.5 - start.y) / horiz));
        let len = m.range;
        let ex = start.x + Math.sin(yaw) * len;
        let ez = start.z + Math.cos(yaw) * len;
        for (const bar of battle.barriers) {
          if (bar.owner === f) continue;
          const tt = segIntersect(start.x, start.z, ex, ez, bar.ax, bar.az, bar.bx, bar.bz);
          if (tt >= 0) {
            len *= tt;
            ex = start.x + Math.sin(yaw) * len;
            ez = start.z + Math.cos(yaw) * len;
          }
        }
        const end = new THREE.Vector3(ex, start.y + pitch * len, ez);
        if (end.y < 0) {
          // hits the ground earlier
          const k2 = start.y / Math.max(0.01, start.y - end.y);
          end.lerpVectors(start, end, k2);
        }
        const dir = new THREE.Vector3().subVectors(end, start);
        const L = dir.length();
        b.position.copy(start);
        b.lookAt(end);
        const w = m.beamWidth * (0.55 + Math.sin(this.t * 30 + i) * 0.06);
        b.scale.set(w, w, L);
        b.material.map.offset.y -= dt * 4;
        // spray at impact
        if (Math.random() < 0.9) this.fx.splash(end, 0.35);
        if (Math.random() < 0.5) this.fx.burst(start, { count: 2, rgb: [0.8, 0.95, 1], speed: 3, size: 1, sizeEnd: 0.2, life: 0.3, dir: dir.clone().normalize() });
      });
    }

    // ---- Thunder Vortex ----
    for (const vx of battle.vortexes) {
      seen.add(vx);
      let v = this.map.get(vx);
      if (!v) {
        const g = new THREE.Group();
        const mats = [];
        for (let i = 0; i < 4; i++) {
          const m = new THREE.MeshBasicMaterial({ color: i % 2 ? '#b08cff' : '#e8e0ff', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, wireframe: i === 3 });
          const cone = new THREE.Mesh(new THREE.CylinderGeometry(6 - i * 0.8, 1 + i * 0.3, 14, 20, 4, true), m);
          cone.position.y = 7;
          g.add(cone);
          mats.push(cone);
        }
        this.group.add(g);
        v = { g, cones: mats, type: 'vortex' };
        this.map.set(vx, v);
      }
      v.g.position.set(vx.x, 0, vx.z);
      v.cones.forEach((c, i) => (c.rotation.y = this.t * (3 + i) * (i % 2 ? -1 : 1)));
      const k2 = vx.life / vx.total;
      const s = Math.min(1, (1 - k2) * 5);
      v.g.scale.set(s, s, s);
      // swirling dust & sparks
      for (let i = 0; i < 4; i++) {
        const a = this.t * 6 + i * 1.6;
        const rr = 2 + Math.random() * 6;
        this.fx.burst({ x: vx.x + Math.cos(a) * rr, y: Math.random() * 10, z: vx.z + Math.sin(a) * rr }, { count: 1, rgb: [0.7, 0.6, 1], speed: 2, size: 1, sizeEnd: 0.2, life: 0.4 });
      }
      if (Math.random() < 0.25) this.fx.lightning(new THREE.Vector3(vx.x, 14, vx.z), new THREE.Vector3(vx.x + (Math.random() - 0.5) * 8, Math.random() * 6, vx.z + (Math.random() - 0.5) * 8), '#d8c8ff', 0.1, 1.5);
      if (vx.life < 24) v.cones.forEach((c) => (c.material.opacity = 0.32 + Math.sin(this.t * 40) * 0.2));
    }

    // ---- Barriers ----
    for (const b of battle.barriers) {
      seen.add(b);
      let v = this.map.get(b);
      if (!v) {
        const g = new THREE.Group();
        const n = 9;
        const logs = [];
        const wood = mat('#7a5230', { roughness: 1 });
        const wood2 = mat('#5a3a20', { roughness: 1 });
        for (let i = 0; i < n; i++) {
          const log = new THREE.Mesh(this.sharedGeo.log, i % 2 ? wood : wood2);
          const x = (i / (n - 1) - 0.5) * b.width;
          log.position.set(x, 0, Math.sin(i * 1.7) * 0.3);
          log.userData.h = 4.5 + Math.sin(i * 2.3) * 1.2;
          log.rotation.z = Math.sin(i * 3.1) * 0.1;
          log.castShadow = true;
          g.add(log);
          logs.push(log);
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 4), mat('#5a9a2a'));
          leaf.position.y = 1;
          log.add(leaf);
        }
        g.position.set(b.x, 0, b.z);
        g.rotation.y = b.yaw;
        this.group.add(g);
        v = { g, logs, type: 'barrier', wood };
        this.map.set(b, v);
        this.fx.dust({ x: b.x, y: 0.5, z: b.z }, 1.5, [0.5, 0.4, 0.3]);
        this.fx.leaves({ x: b.x, y: 2, z: b.z }, 14);
      }
      const grow = b.grow;
      const hpK = b.hp / b.maxHp;
      v.logs.forEach((l) => {
        l.scale.y = l.userData.h * grow;
        l.children[0].position.y = 1 - 0.2;
        l.children[0].scale.setScalar(1 / Math.max(0.2, l.scale.y) > 0 ? 1 : 1);
      });
      v.wood.color.setRGB(0.48 * (0.5 + hpK * 0.5), 0.32 * (0.5 + hpK * 0.5), 0.19 * (0.5 + hpK * 0.5));
    }

    // ---- Decoys (ghostly copy of Prismor) ----
    for (const d of battle.decoys) {
      seen.add(d);
      let v = this.map.get(d);
      if (!v) {
        const view = this.makeDecoyView(d);
        v = { view, type: 'decoy' };
        this.map.set(d, v);
        this.fx.shards({ x: d.x, y: 3, z: d.z }, 10);
      }
      if (v.view) {
        v.view.f.pos.x = d.x;
        v.view.f.pos.z = d.z;
        v.view.f.yaw = views[1 - d.owner.index] ? Math.atan2(views[1 - d.owner.index].f.pos.x - d.x, views[1 - d.owner.index].f.pos.z - d.z) : d.yaw;
        v.view.update(dt, battle, views[1 - d.owner.index]);
        for (const m of v.view.mats) m.opacity = 0.35 + Math.sin(this.t * 12) * 0.1;
      }
    }

    // ---- Root grab lines: leave spikes along the path ----
    for (const r of battle.rootlines) {
      seen.add(r);
      let v = this.map.get(r);
      if (!v) {
        v = { type: 'rootline', lastD: 0 };
        this.map.set(r, v);
      }
      while (v.lastD < r.traveled) {
        v.lastD += 1.2;
        const x = r.sx + r.dx * (v.lastD + 2.5);
        const z = r.sz + r.dz * (v.lastD + 2.5);
        this.addSpike(x + (Math.random() - 0.5), z + (Math.random() - 0.5), 0.7 + Math.random() * 0.5, 0.7);
      }
    }

    // ---- Forest Lock zones ----
    for (const z of battle.zones) {
      seen.add(z);
      let v = this.map.get(z);
      if (!v) {
        const m = new THREE.MeshBasicMaterial({ color: '#7eff5a', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.RingGeometry(z.radius - 0.5, z.radius, 48), m);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(z.x, 0.22, z.z);
        const fm = new THREE.MeshBasicMaterial({ color: '#7eff5a', transparent: true, opacity: 0.15, depthWrite: false });
        const fill = new THREE.Mesh(new THREE.CircleGeometry(z.radius, 48), fm);
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(z.x, 0.2, z.z);
        this.group.add(ring, fill);
        v = { ring, fill, type: 'zone', fired: false };
        this.map.set(z, v);
      }
      if (!z.fired) {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 18);
        v.ring.material.opacity = 0.4 + pulse * 0.5;
        if (Math.random() < 0.5) this.fx.leaves({ x: z.x + (Math.random() - 0.5) * z.radius, y: 0.3, z: z.z + (Math.random() - 0.5) * z.radius }, 1);
      } else if (!v.fired) {
        v.fired = true;
        v.ring.visible = false;
        v.fill.visible = false;
        for (let i = 0; i < 22; i++) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.sqrt(Math.random()) * z.radius;
          this.addSpike(z.x + Math.cos(a) * rr, z.z + Math.sin(a) * rr, 1.2 + Math.random() * 1.4, 2.2);
        }
        this.fx.dust({ x: z.x, y: 0.5, z: z.z }, 2.5, [0.45, 0.35, 0.25]);
        this.fx.leaves({ x: z.x, y: 2, z: z.z }, 30);
      }
    }

    // ---- Remove visuals whose entities are gone ----
    for (const [k, v] of this.map) {
      if (seen.has(k)) continue;
      if (v.type === 'beam') continue;
      if (v.type === 'decoy' && v.view) v.view.dispose();
      if (v.g) this.group.remove(v.g);
      if (v.ring) this.group.remove(v.ring, v.fill);
      this.map.delete(k);
    }

    // ---- Animate spikes (erupt then sink) ----
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const s = this.spikes[i];
      s.t += dt;
      const up = Math.min(1, s.t * 8);
      const down = s.t > s.life ? Math.max(0, 1 - (s.t - s.life) * 2) : 1;
      s.m.scale.set(s.size, s.size * up * down, s.size);
      if (s.t > s.life + 0.6) {
        this.group.remove(s.m);
        this.spikes.splice(i, 1);
      }
    }
  }

  addSpike(x, z, size, life) {
    const m = new THREE.Mesh(this.sharedGeo.spike, Math.random() < 0.2 ? this.rootGlowMat : this.rootMat);
    m.position.set(x, 0, z);
    m.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * 6, (Math.random() - 0.5) * 0.6);
    m.scale.set(size, 0.01, size);
    m.castShadow = true;
    this.group.add(m);
    this.spikes.push({ m, t: 0, life, size });
    if (this.spikes.length > 160) {
      const old = this.spikes.shift();
      this.group.remove(old.m);
    }
  }

  clear() {
    for (const [, v] of this.map) {
      if (v.type === 'decoy' && v.view) v.view.dispose();
      if (v.g) this.group.remove(v.g);
      if (v.beams) for (const b of v.beams) this.group.remove(b);
      if (v.ring) this.group.remove(v.ring, v.fill);
    }
    this.map.clear();
    for (const s of this.spikes) this.group.remove(s.m);
    this.spikes.length = 0;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
  }
}
