// GlbModel: loads a .glb file (see src/data/models.js) and animates it.
// Uses the file's animation clips when they exist, otherwise simple
// procedural motion (bob, lean, recoil) so ANY static model works.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { damp } from './monsters/rig.js';

const loader = new GLTFLoader();
const cache = new Map();

export class GlbModel {
  constructor(cfg, fighter, opts) {
    this.cfg = cfg;
    this.f = fighter;
    this.opts = opts;
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.inner);
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.pose = { y: 0, pitch: 0, roll: 0 };
    this.stepAcc = 0;
    // Placeholder while loading
    const ph = new THREE.Mesh(new THREE.CapsuleGeometry(fighter.radius * 0.8, fighter.height * 0.6, 4, 8), new THREE.MeshStandardMaterial({ color: '#888', transparent: true, opacity: 0.4 }));
    ph.position.y = fighter.height * 0.5;
    this.inner.add(ph);
    this.placeholder = ph;
    this.load();
  }

  load() {
    const url = this.cfg.url;
    const p = cache.get(url) || loader.loadAsync(url);
    cache.set(url, p);
    p.then((gltf) => {
      const scene = gltf.scene.clone(true);
      // Auto-fit to the monster's logical height unless a scale is given
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const scale = this.cfg.scale ?? this.f.height / Math.max(0.001, size.y);
      scene.scale.setScalar(scale);
      scene.position.y = -box.min.y * scale + (this.cfg.yOffset || 0);
      scene.rotation.y = this.cfg.rotationY || 0;
      scene.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      this.inner.remove(this.placeholder);
      this.inner.add(scene);
      if (gltf.animations && gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(scene);
        const names = this.cfg.animations || {};
        for (const [k, clipName] of Object.entries(names)) {
          const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
          if (clip) this.actions[k] = this.mixer.clipAction(clip);
        }
        if (!this.actions.idle) this.actions.idle = this.mixer.clipAction(gltf.animations[0]);
        this.play('idle');
      }
    }).catch((err) => {
      console.warn('Could not load model', url, err);
    });
  }

  play(name) {
    const act = this.actions[name] || this.actions.idle;
    if (!act || act === this.current) return;
    act.reset().fadeIn(0.15).play();
    if (name === 'ko' || name === 'victory') {
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = true;
    }
    if (this.current) this.current.fadeOut(0.15);
    this.current = act;
  }

  update(a) {
    const dt = a.dt;
    if (this.mixer) {
      let want = 'idle';
      if (a.state === 'ko') want = 'ko';
      else if (a.state === 'victory') want = 'victory';
      else if (a.state === 'hitstun' || a.state === 'stagger' || a.state === 'knockdown') want = 'hit';
      else if (a.state === 'attack') want = 'attack';
      else if (a.guard) want = 'block';
      else if (a.flying) want = 'fly';
      else if (a.speed > 1) want = 'walk';
      this.play(want);
      this.mixer.update(dt);
    }
    // Procedural layer (works with or without clips)
    let ty = Math.sin(a.t * 2) * 0.05;
    let tp = 0;
    let tr = 0;
    if (a.state === 'attack') tp = a.phase === 'startup' ? -0.15 * a.phaseT : a.phase === 'active' ? 0.2 : 0.1 * (1 - a.phaseT);
    if (a.hit > 0) tp -= 0.3 * a.hit;
    if (a.block > 0) ty -= 0.3 * a.block;
    if (a.knock > 0) tr = 1.2 * a.knock;
    if (a.ko > 0) tr = 1.3 * a.ko;
    this.pose.y = damp(this.pose.y, ty, 10, dt);
    this.pose.pitch = damp(this.pose.pitch, tp, 10, dt);
    this.pose.roll = damp(this.pose.roll, tr, 8, dt);
    this.inner.position.y = this.pose.y;
    this.inner.rotation.set(this.pose.pitch, 0, this.pose.roll);
    // Footstep pulses for dust & shake
    if (a.grounded && a.speed > 0.5) {
      this.stepAcc += a.speed * dt;
      if (this.stepAcc > 2.2) {
        this.stepAcc = 0;
        if (this.opts.onStep) this.opts.onStep(null, this.root.position);
      }
    }
  }
}
