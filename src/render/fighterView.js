// FighterView: turns a logic Fighter into an animated 3D monster.
// Builds either the procedural model or a .glb (see src/data/models.js),
// computes an animation snapshot from the fighter state each frame, and
// adds per-monster flourishes (steam when cooled, regen pulse, auras...).

import * as THREE from 'three';
import { MODELS } from '../data/models.js';
import { BUILDERS, PALETTES } from './monsters/index.js';
import { GlbModel } from './glbModel.js';
import { damp } from './monsters/rig.js';

export class FighterView {
  constructor(scene, worldGroup, fighter, opts) {
    this.scene = scene;
    this.f = fighter;
    this.fx = opts.fx;
    this.opts = opts;
    this.t = Math.random() * 10;
    this.yaw = fighter.yaw;
    this.anim = {
      dt: 0, t: 0, state: 'neutral', kind: null, key: null, chain: 0, phase: null, phaseT: 0,
      speed: 0, vel: { x: 0, z: 0 }, grounded: true, airborne: false, flying: false, stepPhase: 0,
      hit: 0, block: 0, knock: 0, ko: 0, victory: 0, weak: false, cooled: false, healing: false,
      aim: new THREE.Vector3(), charged: false, fly: 0, guard: false, decoy: false,
    };
    this.prevPos = new THREE.Vector3(fighter.pos.x, fighter.pos.y, fighter.pos.z);
    this.flash = 0;
    this.hitDir = 0;
    this.footSide = 0;
    this.build(opts);
  }

  build(opts) {
    const id = this.f.id;
    const cfg = MODELS[id] || { type: 'procedural' };
    const paletteKey = opts.ghost ? 'ghost' : this.f.shadow ? 'shadow' : opts.skin || 'default';
    const palettes = PALETTES[id];
    const palette = palettes[paletteKey] || palettes.default;
    const onStep = (leg, pos) => this.onFootstep(pos);
    if (cfg.type === 'glb') {
      this.model = new GlbModel(cfg, this.f, { onStep, scene: this.scene });
    } else {
      this.model = BUILDERS[id](palette, { onStep, world: opts.worldGroup || this.scene, quality: opts.quality });
    }
    this.root = this.model.root;
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = opts.quality !== 'low';
        o.receiveShadow = false;
      }
    });
    this.scene.add(this.root);
    // Collect materials for hit flashes
    this.mats = [];
    this.root.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive) {
        if (!this.mats.includes(o.material)) this.mats.push(o.material);
      }
    });
    this.baseEmissive = this.mats.map((m) => ({ c: m.emissive.clone(), i: m.emissiveIntensity }));
    if (opts.ghost) {
      for (const m of this.mats) {
        m.transparent = true;
        m.opacity = 0.45;
        m.depthWrite = false;
        m.emissive = new THREE.Color('#9fe8ff');
        m.emissiveIntensity = 0.8;
      }
    }
    // Shadow boss aura light
    if (this.f.shadow) {
      this.aura = new THREE.PointLight('#ff2040', 30, 14, 2);
      this.aura.position.y = 3;
      this.root.add(this.aura);
    }
    this.place(true);
  }

  onFootstep(pos) {
    const heavy = this.f.def.stats.weight < 0.8;
    this.fx.dust({ x: pos.x, y: 0.3, z: pos.z }, heavy ? 0.6 : 0.3, this.opts.dustColor);
    if (this.opts.onFootstep) this.opts.onFootstep(this, heavy);
  }

  place(snap = false) {
    const f = this.f;
    this.root.position.set(f.pos.x, f.pos.y, f.pos.z);
    if (snap) this.yaw = f.yaw;
  }

  /** Called for each battle event that concerns this fighter. */
  onEvent(e) {
    if (e.type === 'hit' && e.f === this.f.index) {
      this.anim.hit = e.heavy ? 1 : 0.6;
      this.flash = e.heavy ? 0.16 : 0.09;
    }
  }

  update(dt, battle, opponentView) {
    const f = this.f;
    const a = this.anim;
    this.t += dt;
    a.dt = dt;
    a.t = this.t;
    // Velocity (for leg stepping)
    const vx = (f.pos.x - this.prevPos.x) / Math.max(dt, 1e-4);
    const vz = (f.pos.z - this.prevPos.z) / Math.max(dt, 1e-4);
    this.prevPos.set(f.pos.x, f.pos.y, f.pos.z);
    a.vel.x = Math.abs(vx) > 60 ? 0 : vx;
    a.vel.z = Math.abs(vz) > 60 ? 0 : vz;
    a.speed = Math.hypot(a.vel.x, a.vel.z);
    a.stepPhase += a.speed * dt;
    a.state = f.state;
    a.kind = f.move ? f.move.kind : null;
    a.key = f.moveKey;
    a.chain = f.chain;
    a.phase = f.phase;
    if (f.state === 'attack') {
      const len = f.phase === 'startup' ? f.startupLen : f.phase === 'active' ? f.activeLen : f.recovLen;
      a.phaseT = Math.min(1, f.pf / Math.max(1, len));
    } else a.phaseT = 0;
    a.grounded = f.grounded;
    a.airborne = f.airborne;
    a.flying = f.flying;
    a.fly = damp(a.fly, f.flying || f.pos.y > 0.5 ? 1 : 0, 6, dt);
    a.hit = Math.max(0, a.hit - dt * 3.5);
    if (f.state === 'hitstun' || f.state === 'stagger') a.hit = Math.max(a.hit, 0.45);
    a.block = damp(a.block, f.guarding ? 1 : 0, 18, dt);
    a.guard = f.guarding;
    a.knock = damp(a.knock, f.state === 'knockdown' ? 1 : 0, 8, dt);
    a.ko = damp(a.ko, f.state === 'ko' ? 1 : 0, 3, dt);
    a.victory = damp(a.victory, f.state === 'victory' ? 1 : 0, 3, dt);
    a.weak = f.weakSpotTimer > 0 || f.coreExposed;
    a.cooled = f.cooledTimer > 0;
    a.healing = f.healing;
    a.charged = f.prismCharge || f.charged;
    a.stamina = f.def.resource.kind === 'stamina' ? f.res / f.def.resource.max : 1;
    a.rooted = f.rootedTimer > 0;
    a.dodge = f.state === 'dodge';
    a.fighter = f;
    if (opponentView) a.aim.copy(opponentView.root.position).setY(opponentView.f.pos.y + opponentView.f.height * 0.5);

    // Smooth yaw for visuals
    let dy = f.yaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 18);
    this.root.rotation.y = this.yaw;
    this.place();

    this.model.update(a);

    // Hit flash (white emissive pulse)
    if (this.flash > 0) {
      this.flash -= dt;
      const k = Math.max(0, this.flash) * 6;
      for (const m of this.mats) {
        m.emissive.setRGB(1, 1, 1);
        m.emissiveIntensity = k;
      }
      if (this.flash <= 0) this.restoreEmissive();
    }

    // Status particles
    if (a.cooled && Math.random() < 0.5) {
      const p = this.root.position;
      this.fx.steam({ x: p.x + (Math.random() - 0.5) * 3, y: p.y + f.height * 0.8, z: p.z + (Math.random() - 0.5) * 3 }, 1);
    }
    if (a.weak && Math.random() < 0.4 && this.model.anchors && this.model.anchors.ventL) {
      this.fx.embers(this.model.anchors.ventL(), 1);
      this.fx.embers(this.model.anchors.ventR(), 1);
    }
    if (a.healing && Math.random() < 0.3) {
      const p = this.root.position;
      this.fx.burst({ x: p.x, y: p.y + f.height * 0.6, z: p.z }, { count: 2, rgb: [0.4, 1, 0.4], speed: 2, up: 3, size: 1.2, sizeEnd: 0.2, life: 1, jitter: 3 });
    }
    if (a.rooted && Math.random() < 0.3) this.fx.leaves({ x: f.pos.x, y: 0.5, z: f.pos.z }, 2);
    if (a.charged && Math.random() < 0.5 && this.model.anchors && this.model.anchors.fistR) {
      this.fx.burst(this.model.anchors.fistR(), { count: 2, rgb: [0.6, 1, 1], speed: 2, size: 1, sizeEnd: 0.1, life: 0.4 });
    }
    if (this.aura) {
      this.aura.intensity = 25 + Math.sin(this.t * 4) * 10;
      if (Math.random() < 0.4) {
        const p = this.root.position;
        this.fx.burst({ x: p.x, y: p.y + Math.random() * f.height, z: p.z }, { count: 1, rgb: [0.5, 0.05, 0.15], speed: 1, up: 2, size: 2.5, sizeEnd: 0.5, life: 1, jitter: 3, alpha: 0.6 });
      }
    }
  }

  restoreEmissive() {
    this.mats.forEach((m, i) => {
      m.emissive.copy(this.baseEmissive[i].c);
      m.emissiveIntensity = this.baseEmissive[i].i;
    });
  }

  anchor(name) {
    const an = this.model.anchors;
    if (an && an[name]) return an[name]();
    const p = this.root.position;
    return new THREE.Vector3(p.x, p.y + this.f.height * 0.6, p.z);
  }

  dispose() {
    this.scene.remove(this.root);
    if (this.model.dispose) this.model.dispose();
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) m.dispose();
      }
    });
  }
}
