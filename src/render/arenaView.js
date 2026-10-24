// ArenaView: builds an arena scene (sky, fog, lights, ground, backdrop, props,
// hazard visuals) and animates destruction & hazard warnings from battle events.

import * as THREE from 'three';
import { ARENAS } from '../data/arenas.js';
import { GLOBAL } from '../data/monsters.js';
import { buildSky, buildBackdrop, buildProp, groundTexture } from './scenery.js';
import { glow } from './monsters/rig.js';

export class ArenaView {
  constructor(scene, renderer, arenaId, quality, effects) {
    this.scene = scene;
    this.def = ARENAS[arenaId] || ARENAS.volcanic;
    this.id = this.def.id;
    this.quality = quality;
    this.fx = effects;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.anim = [];
    this.warnings = [];
    this.falling = [];
    this.t = 0;
    const mood = this.def.mood;
    this.mood = mood;

    // Sky, fog, environment lighting
    this.sky = buildSky(mood);
    this.group.add(this.sky);
    scene.fog = new THREE.Fog(mood.fog, mood.fogNear, mood.fogFar * 1.6);
    scene.background = new THREE.Color(mood.skyMid);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(buildSky(mood));
    this.envMap = pmrem.fromScene(envScene, 0.04).texture;
    scene.environment = this.envMap;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(mood.skyMid, mood.ground2, mood.ambientIntensity * 1.3);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(mood.sun, mood.sunIntensity);
    const sd = new THREE.Vector3(...mood.sunDir).normalize();
    sun.position.copy(sd).multiplyScalar(80);
    sun.target.position.set(0, 0, 0);
    this.group.add(sun.target);
    if (quality !== 'low') {
      sun.castShadow = true;
      const s = quality === 'high' ? 2048 : 1024;
      sun.shadow.mapSize.set(s, s);
      const c = sun.shadow.camera;
      c.left = c.bottom = -45;
      c.right = c.top = 45;
      c.near = 10;
      c.far = 200;
      sun.shadow.bias = -0.0008;
      sun.shadow.normalBias = 0.05;
    }
    this.group.add(sun);
    this.sun = sun;
    // Soft fill light from the opposite side so monsters never turn into black silhouettes
    const fill = new THREE.DirectionalLight(mood.skyMid, mood.sunIntensity * 0.45);
    fill.position.set(-sd.x * 60, 40, -sd.z * 60);
    this.group.add(fill);

    // Ground
    const tex = groundTexture(mood, this.id);
    const groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: this.id === 'saltflats' ? 0.35 : 0.95, metalness: this.id === 'saltflats' ? 0.15 : 0 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
    this.ground = ground;

    // Arena edge: glowing boundary ring so players see the limits
    const edge = new THREE.Mesh(new THREE.RingGeometry(GLOBAL.arenaRadius - 0.3, GLOBAL.arenaRadius + 0.3, 96), new THREE.MeshBasicMaterial({ color: mood.groundCrack, transparent: true, opacity: 0.35, depthWrite: false }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.04;
    this.group.add(edge);

    // Water areas (harbor shallows, valley river)
    this.waterMeshes = [];
    for (const w of this.def.water) {
      let geo;
      let pos;
      if (w.kind === 'halfplane') {
        geo = new THREE.PlaneGeometry(GLOBAL.arenaRadius * 2 + 140, 120);
        pos = new THREE.Vector3(0, 0.12, w.min + 60);
      } else {
        geo = new THREE.PlaneGeometry(GLOBAL.arenaRadius * 2 + 200, w.max - w.min);
        pos = new THREE.Vector3(0, 0.1, (w.min + w.max) / 2);
      }
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.MeshStandardMaterial({ color: mood.water, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.72, depthWrite: false });
      const wm = new THREE.Mesh(geo, m);
      wm.position.copy(pos);
      wm.receiveShadow = true;
      this.group.add(wm);
      this.waterMeshes.push(wm);
    }

    buildBackdrop(this.id, mood, this.group, this.anim);

    // Props
    this.props = this.def.props.map((p, i) => {
      const pp = { ...p, id: i };
      const g = buildProp(pp, mood);
      g.position.set(p.x, 0, p.z);
      this.group.add(g);
      return { def: pp, group: g, alive: true, flash: 0, baseY: 0 };
    });

    this.buildHazardVisuals();

    // Ambient particle style
    this.ambient = mood.particles;
  }

  buildHazardVisuals() {
    const h = this.def.hazard;
    this.hz = {};
    if (h.kind === 'lavaVents') {
      this.hz.vents = h.vents.map((v) => {
        const g = new THREE.Group();
        g.position.set(v.x, 0, v.z);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(h.radius * 0.6, 0.6, 6, 16), new THREE.MeshStandardMaterial({ color: '#2a201c', roughness: 1, flatShading: true }));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.2;
        g.add(rim);
        const poolMat = glow('#ff4a10', 1.2);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(h.radius * 0.55, 16), poolMat);
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = 0.15;
        g.add(pool);
        const colMat = glow('#ff6a20', 3, { transparent: true, opacity: 0.85 });
        const column = new THREE.Mesh(new THREE.CylinderGeometry(h.radius * 0.45, h.radius * 0.7, 12, 12, 1, true), colMat);
        column.position.y = 6;
        column.visible = false;
        g.add(column);
        this.group.add(g);
        return { g, pool, poolMat, column, state: 'idle', t: 0 };
      });
    }
    if (h.kind === 'saltCrust') {
      this.hz.patches = h.patches.map((p) => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g2 = c.getContext('2d');
        g2.strokeStyle = '#7a8aa0';
        g2.lineWidth = 3;
        for (let i = 0; i < 14; i++) {
          g2.beginPath();
          g2.moveTo(64, 64);
          let x = 64;
          let y = 64;
          const a = (i / 14) * Math.PI * 2;
          for (let k = 0; k < 5; k++) {
            x += Math.cos(a + (Math.random() - 0.5)) * 12;
            y += Math.sin(a + (Math.random() - 0.5)) * 12;
            g2.lineTo(x, y);
          }
          g2.stroke();
        }
        const tex = new THREE.CanvasTexture(c);
        const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.0, depthWrite: false });
        const decal = new THREE.Mesh(new THREE.CircleGeometry(h.patchRadius, 24), m);
        decal.rotation.x = -Math.PI / 2;
        decal.position.set(p.x, 0.07, p.z);
        this.group.add(decal);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(h.patchRadius * 0.9, 24), new THREE.MeshStandardMaterial({ color: '#8a96a8', roughness: 1, transparent: true, opacity: 0 }));
        hole.rotation.x = -Math.PI / 2;
        hole.position.set(p.x, 0.08, p.z);
        this.group.add(hole);
        // faint outline so players can spot crust patches
        const outline = new THREE.Mesh(new THREE.RingGeometry(h.patchRadius - 0.15, h.patchRadius, 32), new THREE.MeshBasicMaterial({ color: '#a8b8cc', transparent: true, opacity: 0.6, depthWrite: false }));
        outline.rotation.x = -Math.PI / 2;
        outline.position.set(p.x, 0.06, p.z);
        this.group.add(outline);
        return { decal, hole, outline };
      });
    }
    if (h.kind === 'tidalWave') {
      const geo = new THREE.CylinderGeometry(3, 3, GLOBAL.arenaRadius * 2.6, 16, 1, false, 0, Math.PI);
      geo.rotateZ(Math.PI / 2);
      const m = new THREE.MeshStandardMaterial({ color: '#3ad0e8', emissive: '#106878', emissiveIntensity: 0.5, transparent: true, opacity: 0.8, roughness: 0.1 });
      const wave = new THREE.Mesh(geo, m);
      wave.scale.set(1, 1.6, 1.2);
      wave.visible = false;
      this.group.add(wave);
      const foam = new THREE.Mesh(new THREE.BoxGeometry(GLOBAL.arenaRadius * 2.6, 0.8, 1.5), new THREE.MeshStandardMaterial({ color: '#f4ffff', emissive: '#a0d0e0', emissiveIntensity: 0.4 }));
      wave.add(foam);
      foam.position.set(0, 2.9, 1.2);
      this.hz.wave = wave;
    }
  }

  /** React to battle events (hazards & props). */
  onEvent(e) {
    const h = this.def.hazard;
    switch (e.type) {
      case 'propHit': {
        const p = this.props[e.id];
        if (p) p.flash = 0.15;
        if (p) this.fx.dust({ x: p.def.x, y: 1.5, z: p.def.z }, 0.5);
        break;
      }
      case 'propDestroyed':
        this.destroyProp(e.id);
        break;
      case 'hazardWarn':
        this.addWarning(e);
        break;
      case 'hazardFire':
        this.fireHazard(e);
        break;
      case 'hazardEnd':
        break;
      default:
        break;
    }
    void h;
  }

  addWarning(e) {
    const frames = e.frames || 90;
    if (e.hazard === 'lava' || e.hazard === 'lightning' || e.hazard === 'salt') {
      const color = e.hazard === 'lava' ? '#ff3a10' : e.hazard === 'lightning' ? '#c8a8ff' : '#7fa8ff';
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(e.radius - 0.5, e.radius, 40), m);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(e.x, 0.2, e.z);
      const fillM = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false });
      const fill = new THREE.Mesh(new THREE.CircleGeometry(e.radius, 40), fillM);
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(e.x, 0.18, e.z);
      this.group.add(ring, fill);
      this.warnings.push({ objs: [ring, fill], t: 0, life: frames / 60, kind: e.hazard });
      if (e.hazard === 'lava') {
        const v = this.hz.vents && this.hz.vents.find((vv) => Math.abs(vv.g.position.x - e.x) < 0.1 && Math.abs(vv.g.position.z - e.z) < 0.1);
        if (v) v.state = 'warn';
      }
      if (e.hazard === 'salt' && this.hz.patches) {
        const p = this.hz.patches[e.id];
        if (p) p.cracking = frames / 60;
      }
    }
  }

  fireHazard(e) {
    if (e.hazard === 'lava') {
      const v = this.hz.vents && this.hz.vents.find((vv) => Math.abs(vv.g.position.x - e.x) < 0.1 && Math.abs(vv.g.position.z - e.z) < 0.1);
      if (v) {
        v.state = 'erupt';
        v.t = 0;
      }
      this.fx.burst({ x: e.x, y: 1, z: e.z }, { count: 80, rgb: [1, 0.4, 0.05], speed: 6, up: 22, size: 1.6, sizeEnd: 0.3, life: 1.4, gravity: 20, vertical: 0.3 });
      this.fx.debrisBurst({ x: e.x, y: 1, z: e.z }, '#2a1a14', 8, 0.6, 6, 18);
      this.fx.groundRing({ x: e.x, z: e.z }, '#ff5a10', e.radius * 1.4, 0.6);
    } else if (e.hazard === 'lightning') {
      this.fx.skyStrike({ x: e.x, y: 0, z: e.z });
    } else if (e.hazard === 'wave') {
      if (this.hz.wave) {
        this.hz.wave.visible = true;
      }
    } else if (e.hazard === 'salt') {
      if (this.hz.patches) {
        const p = this.hz.patches[e.id];
        if (p) p.sunk = this.def.hazard.sinkDuration / 60;
      }
      this.fx.dust({ x: e.x, y: 0.5, z: e.z }, 1.5, [0.9, 0.92, 0.95]);
      this.fx.debrisBurst({ x: e.x, y: 0.3, z: e.z }, '#e8eef4', 10, 0.5, 6, 6);
    }
  }

  destroyProp(id) {
    const p = this.props[id];
    if (!p || !p.alive) return;
    p.alive = false;
    const pos = { x: p.def.x, y: p.group.userData.height * 0.4, z: p.def.z };
    const color = p.group.userData.color;
    this.fx.debrisBurst(pos, color, 22, 0.9, 9, 12);
    this.fx.dust(pos, 2.2);
    this.fx.dust({ x: pos.x, y: 0.5, z: pos.z }, 2);
    if (p.group.userData.tall) {
      // Topple over before vanishing
      const ang = Math.random() * Math.PI * 2;
      this.falling.push({ p, t: 0, axis: new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)) });
    } else {
      p.group.visible = false;
      this.leaveRubble(p);
    }
  }

  leaveRubble(p) {
    const color = p.group.userData.color;
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random() * 0.5, 0), new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
      r.position.set(p.def.x + (Math.random() - 0.5) * 3, 0.3, p.def.z + (Math.random() - 0.5) * 3);
      r.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      r.castShadow = true;
      this.group.add(r);
    }
  }

  update(dt, battle, camPos) {
    this.t += dt;
    // Props flash when hit / spinning rotors
    for (const p of this.props) {
      if (p.flash > 0) {
        p.flash -= dt;
        p.group.position.x = p.def.x + Math.sin(this.t * 80) * 0.15;
      } else p.group.position.x = p.def.x;
      if (p.group.userData.rotor && p.alive) p.group.userData.rotor.rotation.z += dt * 1.5;
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      const ang = Math.min(Math.PI / 2, f.t * f.t * 2.2);
      f.p.group.setRotationFromAxisAngle(new THREE.Vector3(f.axis.z, 0, -f.axis.x), ang);
      if (ang >= Math.PI / 2 && !f.landed) {
        f.landed = true;
        const h = f.p.group.userData.height;
        const land = { x: f.p.def.x + f.axis.x * h * 0.6, y: 1, z: f.p.def.z + f.axis.z * h * 0.6 };
        this.fx.dust(land, 3);
        this.fx.debrisBurst(land, f.p.group.userData.color, 16, 0.8, 7, 8);
        this.onShake && this.onShake(0.6);
      }
      if (f.t > 1.6) {
        f.p.group.visible = false;
        this.leaveRubble(f.p);
        this.falling.splice(i, 1);
      }
    }
    // Warnings pulse
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i];
      w.t += dt;
      const pulse = 0.5 + 0.5 * Math.sin(w.t * (8 + w.t * 14));
      w.objs[0].material.opacity = 0.4 + pulse * 0.6;
      w.objs[1].material.opacity = 0.1 + pulse * 0.2 * (w.t / w.life);
      if (w.t >= w.life) {
        for (const o of w.objs) {
          this.group.remove(o);
          o.material.dispose();
          o.geometry.dispose();
        }
        this.warnings.splice(i, 1);
      }
    }
    // Lava vents
    if (this.hz.vents) {
      for (const v of this.hz.vents) {
        v.t += dt;
        if (v.state === 'warn') {
          v.poolMat.emissiveIntensity = 2 + Math.sin(this.t * 20) * 1.5;
          if (Math.random() < 0.3) this.fx.embers({ x: v.g.position.x, y: 0.5, z: v.g.position.z }, 1);
          if (Math.random() < 0.2) this.fx.steam({ x: v.g.position.x, y: 0.5, z: v.g.position.z }, 1);
        } else if (v.state === 'erupt') {
          v.column.visible = true;
          const k = Math.min(1, v.t * 6) * (v.t > 1.1 ? Math.max(0, 1 - (v.t - 1.1) * 4) : 1);
          v.column.scale.set(1, Math.max(0.01, k), 1);
          v.column.position.y = 6 * k;
          if (Math.random() < 0.8) this.fx.burst({ x: v.g.position.x, y: 2, z: v.g.position.z }, { count: 4, rgb: [1, 0.45, 0.1], speed: 3, up: 16, size: 1.2, sizeEnd: 0.3, life: 1, gravity: 18 });
          if (v.t > 1.4) {
            v.state = 'idle';
            v.column.visible = false;
          }
        } else {
          v.poolMat.emissiveIntensity = 1 + Math.sin(this.t * 2 + v.g.position.x) * 0.3;
          if (Math.random() < 0.02) this.fx.embers({ x: v.g.position.x, y: 0.5, z: v.g.position.z }, 1);
        }
      }
    }
    // Tidal wave follows logic position
    if (this.hz.wave && battle) {
      const w = battle.arena.wave;
      if (w) {
        this.hz.wave.visible = true;
        this.hz.wave.position.set(0, 1.5, w.z);
        if (Math.random() < 0.8) this.fx.splash({ x: (Math.random() - 0.5) * 60, y: 3, z: w.z + 1 }, 0.5);
      } else this.hz.wave.visible = false;
    }
    // Salt patches
    if (this.hz.patches && battle && battle.arena.patches) {
      battle.arena.patches.forEach((lp, i) => {
        const v = this.hz.patches[i];
        const crack = lp.state === 'crack' ? 0.4 + 0.5 * Math.abs(Math.sin(this.t * 10)) : lp.state === 'sink' ? 1 : lp.state === 'reform' ? 0.5 : Math.min(0.5, lp.stand / 60);
        v.decal.material.opacity = crack;
        v.hole.material.opacity = lp.state === 'sink' ? 0.85 : 0;
        v.hole.position.y = lp.state === 'sink' ? 0.09 : 0.08;
      });
    }
    // Wind gusts: streaks blowing across the arena (warning = light streaks)
    if (battle && battle.arena.gust) {
      const g = battle.arena.gust;
      const warn = g.timer > this.def.hazard.gustDuration;
      const n = warn ? 1 : 4;
      for (let i = 0; i < n; i++) {
        const sx = (Math.random() - 0.5) * 70 - g.dx * 30;
        const sz = (Math.random() - 0.5) * 70 - g.dz * 30;
        this.fx.burst({ x: sx, y: 0.5 + Math.random() * 8, z: sz }, { count: 1, rgb: [0.9, 0.95, 1], speed: 0, vel: { x: g.dx * 40, z: g.dz * 40 }, size: 0.6, sizeEnd: 0.2, life: 1.2, alpha: warn ? 0.35 : 0.8, drag: 0, additive: false });
      }
    }
    // River surge: foam rushing along the river band
    if (battle && this.def.hazard.kind === 'river') {
      const h = this.def.hazard;
      const surge = !!battle.arena.surge;
      if (Math.random() < (surge ? 1 : 0.25)) {
        for (let i = 0; i < (surge ? 4 : 1); i++) this.fx.burst({ x: -40 + Math.random() * 20, y: 0.3, z: h.bandMin + Math.random() * (h.bandMax - h.bandMin) }, { count: 1, rgb: [0.92, 0.97, 1], speed: 0, vel: { x: surge ? 22 : 8, z: 0 }, size: surge ? 2 : 1.2, sizeEnd: surge ? 3 : 1.6, life: 4, alpha: 0.6, drag: 0, additive: false });
      }
    }
    // Backdrop animation
    for (const a of this.anim) {
      if (a.kind === 'spin') a.obj.rotation.z += dt * a.speed;
      else if (a.kind === 'smoke' && Math.random() < 0.3) this.fx.burst({ x: a.x, y: a.y, z: a.z }, { count: 2, rgb: [0.35, 0.3, 0.3], speed: 2, up: 6, size: 18, sizeEnd: 40, life: 5, additive: false, alpha: 0.5, drag: 0.2 });
      else if (a.kind === 'mist' && Math.random() < 0.2) this.fx.burst({ x: a.x, y: a.y, z: a.z }, { count: 2, rgb: [0.95, 0.97, 1], speed: 3, up: 3, size: 8, sizeEnd: 16, life: 3, additive: false, alpha: 0.35, drag: 0.5 });
    }
    // Water shimmer
    for (const w of this.waterMeshes) w.material.opacity = 0.68 + Math.sin(this.t * 1.5) * 0.04;
    // Ambient particles around the camera target
    if (camPos) this.ambientParticles(dt, camPos);
  }

  ambientParticles(dt, c) {
    const fx = this.fx;
    const r = () => (Math.random() - 0.5) * 70;
    switch (this.ambient) {
      case 'embers':
        if (Math.random() < 0.6) fx.burst({ x: c.x + r(), y: 0.5 + Math.random() * 3, z: c.z + r() }, { count: 1, rgb: [1, 0.5, 0.15], speed: 0.5, up: 3, size: 0.45, sizeEnd: 0.1, life: 3, gravity: -0.5, drag: 0.2 });
        break;
      case 'rain':
        for (let i = 0; i < 3; i++) fx.burst({ x: c.x + r(), y: 25, z: c.z + r() }, { count: 1, rgb: [0.75, 0.8, 0.95], speed: 0, up: -40, size: 0.35, sizeEnd: 0.35, life: 0.7, alpha: 0.6, drag: 0, additive: false });
        break;
      case 'spray':
        if (Math.random() < 0.15) fx.burst({ x: c.x + r(), y: 0.4, z: 20 + Math.random() * 14 }, { count: 2, rgb: [0.9, 0.97, 1], speed: 1, up: 2, size: 1.5, sizeEnd: 3, life: 1.5, additive: false, alpha: 0.4 });
        break;
      case 'leaves':
        if (Math.random() < 0.25) fx.burst({ x: c.x + r(), y: 10 + Math.random() * 8, z: c.z + r() }, { count: 1, rgb: [0.55, 0.75, 0.2], speed: 2, up: -1, size: 0.6, sizeEnd: 0.6, life: 5, additive: false, gravity: 0.6, drag: 0.5 });
        break;
      case 'glitter':
        if (Math.random() < 0.4) fx.burst({ x: c.x + r(), y: 0.2 + Math.random() * 2, z: c.z + r() }, { count: 1, rgb: [0.9, 0.95, 1], speed: 0.2, up: 0.3, size: 0.4, sizeEnd: 0.05, life: 1.2, drag: 0.2 });
        break;
      default:
        break;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    if (this.envMap) this.envMap.dispose();
  }
}
