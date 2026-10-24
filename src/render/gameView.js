// GameView: owns the WebGL renderer, scene and camera, and turns a Battle
// (pure logic) into a cinematic 3D fight every frame.

import * as THREE from 'three';
import { FightCamera } from './camera.js';
import { Effects } from './effects.js';
import { ArenaView } from './arenaView.js';
import { FighterView } from './fighterView.js';
import { EntitiesView } from './entitiesView.js';

const DUST = {
  volcanic: [0.45, 0.36, 0.32],
  stormsea: [0.55, 0.58, 0.6],
  harbor: [0.8, 0.75, 0.62],
  valley: [0.5, 0.45, 0.32],
  saltflats: [0.92, 0.94, 0.97],
};

export class GameView {
  constructor(canvas, quality = 'medium') {
    this.canvas = canvas;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.applyQuality(quality);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 1200);
    this.fightCam = new FightCamera(this.camera);
    this.views = [];
    this.battle = null;
    this.arena = null;
    this.listeners = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  applyQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const ratio = q === 'low' ? Math.min(dpr, 1) * 0.85 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.fightCam.portrait = w / h < 1;
    this.camera.updateProjectionMatrix();
    if (this.fx) this.fx.setPixelScale(h * this.renderer.getPixelRatio());
  }

  /** Build the scene for a battle. opts: { skins: [s1,s2] } */
  setupBattle(battle, opts = {}) {
    this.teardown();
    this.battle = battle;
    this.fx = new Effects(this.scene, this.quality);
    this.fx.setPixelScale((this.canvas.clientHeight || window.innerHeight) * this.renderer.getPixelRatio());
    this.arena = new ArenaView(this.scene, this.renderer, battle.arena.id, this.quality, this.fx);
    this.arena.onShake = (a) => this.fightCam.shake(a);
    const dust = DUST[battle.arena.id];
    this.views = battle.fighters.map((f, i) => new FighterView(this.scene, null, f, {
      fx: this.fx,
      quality: this.quality,
      skin: (opts.skins || [])[i],
      dustColor: dust,
      onFootstep: (view, heavy) => {
        if (heavy) this.fightCam.shake(view.f.id === 'korvak' ? 0.18 : 0.1);
        this.emit({ type: 'footstep', f: view.f.index, heavy });
      },
    }));
    this.entities = new EntitiesView(this.scene, this.fx, this.quality, (d) => {
      const fake = {
        ...d.owner,
        pos: { x: d.x, y: 0, z: d.z },
        state: 'block',
        move: null,
        def: d.owner.def,
        shadow: false,
        index: d.owner.index,
      };
      return new FighterView(this.scene, null, fake, { fx: this.fx, quality: 'low', ghost: true });
    });
    this.fightCam.stopSpecial();
    this.fightCam.pos.set(0, 8, 34);
    this.fightCam.target.set(0, 3, 0);
    this.fightCam.snap();
    this.slowmo = 1;
  }

  teardown() {
    for (const v of this.views) v.dispose();
    this.views = [];
    if (this.entities) this.entities.dispose();
    this.entities = null;
    if (this.arena) this.arena.dispose();
    this.arena = null;
    if (this.fx) {
      this.fx.clear();
      this.scene.remove(this.fx.glow.points, this.fx.smoke.points, this.fx.debris.mesh, this.fx.flash);
    }
    this.fx = null;
    // Remove anything left
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
    this.scene.environment = null;
    this.battle = null;
  }

  on(fn) {
    this.listeners.push(fn);
  }

  emit(e) {
    for (const fn of this.listeners) fn(e);
  }

  /** Handle a logic event visually (effects, camera). */
  handleEvent(e) {
    if (!this.battle) return;
    const fx = this.fx;
    const cam = this.fightCam;
    this.arena.onEvent(e);
    const v = e.f !== undefined ? this.views[e.f] : null;
    if (v) v.onEvent(e);
    switch (e.type) {
      case 'hit': {
        const p = { x: e.x, y: e.y, z: e.z };
        fx.impact(p, e.damageType, e.heavy, e.label === 'SUPER EFFECTIVE!' ? 1.6 : 1);
        if (e.heavy) cam.shake(e.label === 'SUPER EFFECTIVE!' ? 1.3 : 0.9);
        else cam.shake(0.25);
        if (e.weak) fx.burst(p, { count: 30, rgb: [1, 0.9, 0.3], speed: 12, size: 1.2, sizeEnd: 0.1, life: 0.5 });
        break;
      }
      case 'block':
        fx.burst({ x: e.x, y: e.y, z: e.z }, { count: 14, rgb: e.perfect ? [0.6, 1, 1] : [0.9, 0.9, 1], speed: 7, size: 0.8, sizeEnd: 0.1, life: 0.25 });
        if (e.heavy) cam.shake(0.3);
        break;
      case 'parry':
      case 'reflect':
        fx.shards({ x: e.x, y: e.y, z: e.z }, 16);
        fx.flashAt({ x: e.x, y: e.y, z: e.z }, [0.6, 1, 1], 8);
        cam.shake(0.4);
        break;
      case 'slam':
        fx.groundRing({ x: e.x, z: e.z }, '#ffcc70', e.radius, 0.45);
        fx.dust({ x: e.x, y: 0.5, z: e.z }, 3, DUST[this.battle.arena.id]);
        fx.debrisBurst({ x: e.x, y: 0.5, z: e.z }, '#4a3a30', 14, 0.6, 9, 10);
        cam.shake(1.4);
        break;
      case 'quakeRing':
        cam.shake(1.1);
        fx.debrisBurst({ x: e.x, y: 0.5, z: e.z }, '#3a2a24', 10, 0.7, 8, 12);
        break;
      case 'diveLand':
        fx.groundRing({ x: e.x, z: e.z }, '#c8a8ff', 5, 0.4);
        fx.dust({ x: e.x, y: 0.5, z: e.z }, 1.5, DUST[this.battle.arena.id]);
        cam.shake(0.7);
        break;
      case 'landHeavy':
        fx.dust({ x: e.x, y: 0.4, z: e.z }, 1.2, DUST[this.battle.arena.id]);
        cam.shake(Math.min(1, e.v / 20));
        break;
      case 'wallHit':
        fx.dust({ x: e.x, y: 2, z: e.z }, 1.5);
        cam.shake(0.6);
        break;
      case 'vortexStrike':
        fx.skyStrike({ x: e.x, y: 0, z: e.z });
        cam.shake(1.5);
        break;
      case 'barrierHit':
        fx.burst({ x: e.x, y: 2.5, z: e.z }, { count: 10, rgb: e.fire ? [1, 0.5, 0.1] : [0.6, 0.45, 0.25], speed: 6, size: 0.8, life: 0.5, gravity: 10, additive: e.fire });
        break;
      case 'barrierBreak':
        fx.debrisBurst({ x: e.x, y: 2, z: e.z }, '#6a4a2a', 18, 0.6, 8, 8);
        fx.leaves({ x: e.x, y: 2, z: e.z }, 20);
        fx.dust({ x: e.x, y: 1, z: e.z }, 1.5, [0.5, 0.4, 0.3]);
        break;
      case 'decoyShatter':
        fx.shards({ x: e.x, y: 3, z: e.z }, 30);
        fx.debrisBurst({ x: e.x, y: 3, z: e.z }, '#9fd8ff', 10, 0.4, 8, 8);
        break;
      case 'cooled':
        fx.steam({ x: e.x, y: e.y, z: e.z }, 8);
        break;
      case 'shieldBreak':
      case 'guardCrush':
        fx.shards({ x: e.x, y: e.y, z: e.z }, 24);
        cam.shake(0.7);
        break;
      case 'forceLand':
        fx.splash({ x: e.x, y: e.y + 2, z: e.z }, 1.2);
        cam.shake(0.6);
        break;
      case 'takeoff':
        if (v) fx.dust({ x: v.f.pos.x, y: 0.3, z: v.f.pos.z }, 1.5, DUST[this.battle.arena.id]);
        break;
      case 'ko': {
        const loser = this.views[e.f];
        const winner = this.views[e.winner];
        if (loser && winner) cam.startCloseup(loser.root.position, winner.root.position);
        cam.shake(2);
        fx.flashAt({ x: e.x, y: 4, z: e.z }, [1, 1, 1], 18);
        this.slowmoT = 1.8;
        break;
      }
      case 'roundStart':
        cam.stopSpecial();
        this.slowmoT = 0;
        break;
      default:
        break;
    }
  }

  /** Per-frame visual update. dt = real seconds (already slow-mo scaled). */
  update(dt) {
    if (!this.battle) return;
    const [a, b] = this.views;
    if (a && b) {
      a.update(dt, this.battle, b);
      b.update(dt, this.battle, a);
    }
    this.entities.sync(this.battle, this.views, dt);
    this.fx.update(dt);
    const fa = this.battle.fighters[0].pos;
    const fb = this.battle.fighters[1].pos;
    this.fightCam.update(dt, fa, fb);
    this.arena.update(dt, this.battle, this.fightCam.target);
    // Windup glow for readable attacks (roots, slams)
    for (const v of this.views) {
      const f = v.f;
      if (f.state === 'attack' && f.phase === 'startup' && f.move && (f.move.kind === 'grab' || f.move.kind === 'slam' || f.move.kind === 'quake' || f.move.kind === 'charge' || f.move.heavyHit) && Math.random() < 0.5) {
        const p = v.root.position;
        const col = f.move.type === 'root' ? [0.5, 1, 0.3] : f.move.type === 'fire' ? [1, 0.5, 0.1] : f.move.type === 'water' ? [0.4, 0.9, 1] : f.move.type === 'electric' ? [0.7, 0.5, 1] : [1, 0.9, 0.6];
        this.fx.burst({ x: p.x, y: p.y + f.height * 0.5, z: p.z }, { count: 2, rgb: col, speed: 4, size: 1.2, sizeEnd: 0.1, life: 0.35, jitter: f.radius * 2 });
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Project a world position to screen pixels (for popups). */
  toScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 };
  }
}
