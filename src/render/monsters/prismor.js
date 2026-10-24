// PRISMOR - three-armed crystal gladiator: cobalt body, iridescent crystal
// armour, vertical glowing face slit, two crystal-cluster fists and a round
// prism shield on the third arm. Two digitigrade legs + three arms, all IK.

import * as THREE from 'three';
import { mat, glow, mesh, Limb, LegSystem, solveKnee, damp, smooth } from './rig.js';

export const PRISMOR_PALETTES = {
  default: { body: '#34488f', body2: '#22306a', crystal: '#d8ecff', crystalGlow: '#8ab4ff', slit: '#d8e8ff', shield: '#c8e0ff' },
  ruby: { body: '#4a1424', body2: '#2a0a14', crystal: '#ffc8d8', crystalGlow: '#ff4a7a', slit: '#ffd8e0', shield: '#ffb0c8' },
  shadow: { body: '#120a14', body2: '#08040a', crystal: '#3a1a24', crystalGlow: '#ff1030', slit: '#ff1020', shield: '#5a0a1a' },
  ghost: { body: '#8a9ab8', body2: '#7a8aa8', crystal: '#e8f4ff', crystalGlow: '#bfe8ff', slit: '#fff', shield: '#e8f4ff' },
};

function crystalCluster(material, size, seed) {
  const g = new THREE.Group();
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 7; i++) {
    const c = mesh(new THREE.OctahedronGeometry(size * (0.45 + r() * 0.35), 0), material);
    c.scale.set(1, 1.6 + r(), 1);
    c.position.set((r() - 0.5) * size, (r() - 0.5) * size, (r() - 0.5) * size);
    c.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(c);
  }
  const core = mesh(new THREE.IcosahedronGeometry(size * 0.75, 0), material);
  g.add(core);
  return g;
}

export function buildPrismor(palette, opts = {}) {
  const P = palette;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const bodyMat = mat(P.body, { roughness: 0.35, metalness: 0.45, flat: true });
  const body2Mat = mat(P.body2, { roughness: 0.4, metalness: 0.4, flat: true });
  const crystalMat = new THREE.MeshStandardMaterial({ color: P.crystal, emissive: P.crystalGlow, emissiveIntensity: 0.45, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.86, flatShading: true });
  const slitMat = glow(P.slit, 4);
  const shieldMat = new THREE.MeshStandardMaterial({ color: P.shield, emissive: P.crystalGlow, emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.75, side: THREE.DoubleSide, flatShading: true });
  const headMat = mat('#16205a', { roughness: 0.1, metalness: 0.7, flat: false });
  const materials = { bodyMat, crystalMat, shieldMat, slitMat };

  // Torso (V-shaped)
  const chest = new THREE.Group();
  chest.position.set(0, 4.0, 0);
  body.add(chest);
  const torso = mesh(new THREE.CylinderGeometry(1.25, 0.65, 2.2, 7), bodyMat);
  torso.scale.z = 0.7;
  chest.add(torso);
  const abs = mesh(new THREE.CylinderGeometry(0.6, 0.55, 1.1, 6), body2Mat);
  abs.position.y = -1.5;
  chest.add(abs);
  const pelvis = mesh(new THREE.CylinderGeometry(0.75, 0.55, 0.6, 6), bodyMat);
  pelvis.position.y = -2.15;
  chest.add(pelvis);
  // crystal shoulder plates & chest shards
  for (const s of [-1, 1]) {
    const sh = crystalCluster(crystalMat, 0.75, s > 0 ? 3 : 7);
    sh.position.set(s * 1.35, 0.9, 0);
    sh.rotation.z = -s * 0.5;
    chest.add(sh);
  }
  const chestShard = crystalCluster(crystalMat, 0.4, 11);
  chestShard.position.set(-0.4, 0.2, 0.75);
  chest.add(chestShard);
  // Head: tall dark visor with vertical glowing slit
  const head = new THREE.Group();
  head.position.set(0, 1.75, 0.1);
  chest.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.55, 18, 14), headMat);
  skull.scale.set(0.9, 1.35, 1);
  head.add(skull);
  const slit = mesh(new THREE.BoxGeometry(0.07, 0.8, 0.05), slitMat, false);
  slit.position.set(0, 0.05, 0.54);
  head.add(slit);

  // Legs (digitigrade: knee bends forward, pole forward)
  const legs = new LegSystem(root, body, { stepDist: 1.3, stepTime: 0.24, lift: 0.7, lead: 0.4, onStep: opts.onStep });
  const legList = [-1, 1].map((s) => {
    const upper = new Limb(root, bodyMat, 0.45, 0.33, 7);
    const lower = new Limb(root, body2Mat, 0.33, 0.24, 7);
    const foot = new THREE.Group();
    for (let k = -1; k <= 1; k++) {
      const claw = mesh(new THREE.OctahedronGeometry(0.32, 0), crystalMat);
      claw.scale.set(0.8, 0.6, 1.6);
      claw.position.set(k * 0.32, 0.15, 0.45);
      foot.add(claw);
    }
    root.add(foot);
    const kneeCap = crystalCluster(crystalMat, 0.35, s > 0 ? 21 : 23);
    root.add(kneeCap);
    return legs.addLeg({ hip: new THREE.Vector3(s * 0.6, 1.85, 0), rest: new THREE.Vector3(s * 1.5, 0, 0.3), l1: 1.35, l2: 1.4, pole: new THREE.Vector3(s * 0.4, 0.3, 1.5), group: s > 0 ? 0 : 1, upper, lower, foot, kneeCap, tuckY: 0.6 });
  });

  // Arms: [0] right fist, [1] left fist, [2] shield arm (lower-left)
  const armDefs = [
    { sh: new THREE.Vector3(-1.5, 4.7, 0.1), pole: new THREE.Vector3(-1, -0.5, -1), fist: 'fist', size: 0.8 },
    { sh: new THREE.Vector3(1.5, 4.7, 0.1), pole: new THREE.Vector3(1, -0.5, -1), fist: 'fist', size: 0.8 },
    { sh: new THREE.Vector3(0.9, 3.7, 0.5), pole: new THREE.Vector3(1, -1, -0.5), fist: 'shield', size: 0.4 },
  ];
  const arms = armDefs.map((d, i) => {
    const upper = new Limb(root, bodyMat, 0.36, 0.3, 7);
    const lower = new Limb(root, body2Mat, 0.3, 0.32, 7);
    const handObj = new THREE.Group();
    if (d.fist === 'fist') {
      const cl = crystalCluster(crystalMat, d.size, 31 + i * 5);
      handObj.add(cl);
    } else {
      const disc = mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.14, 12), shieldMat);
      disc.rotation.x = Math.PI / 2;
      disc.position.z = 0.25;
      handObj.add(disc);
      const rim = mesh(new THREE.TorusGeometry(1.38, 0.08, 6, 24), crystalMat);
      rim.position.z = 0.25;
      handObj.add(rim);
      const center = mesh(new THREE.OctahedronGeometry(0.35, 0), crystalMat);
      center.position.z = 0.4;
      handObj.add(center);
      // lower-arm crystal shards
    }
    root.add(handObj);
    return { ...d, upper, lower, handObj, elbow: new THREE.Vector3(), hand: new THREE.Vector3(), target: new THREE.Vector3(), shW: new THREE.Vector3() };
  });
  const shieldGlow = new THREE.PointLight(P.crystalGlow, 0, 8, 2);
  arms[2].handObj.add(shieldGlow);

  const pose = { y: 0, pitch: 0, roll: 0, twist: 0, crouch: 0, shield: 0 };
  const tmp = new THREE.Vector3();

  function update(a) {
    const dt = a.dt;
    const bounce = Math.abs(Math.sin(a.t * 3.2)) * 0.12;
    let ty = -0.25 + bounce;
    let tp = 0.05;
    let tr = 0;
    let tw = 0;
    let shieldUp = 0;
    // guard stance
    const targets = [
      new THREE.Vector3(-1.3, 4.2, 2.0),
      new THREE.Vector3(1.3, 4.6, 1.6),
      new THREE.Vector3(0.9, 3.6, 2.0),
    ];
    if (a.state === 'attack') {
      const k = a.kind;
      if (k === 'melee' && a.key === 'light') {
        const i = a.chain === 1 ? 1 : 0;
        if (a.chain === 2) {
          // uppercut
          if (a.phase === 'startup') targets[0].set(-1, 2.6, 1.5);
          else if (a.phase === 'active') targets[0].set(-0.4, 6.8, 3.2);
          else targets[0].set(-1, 5.6, 2.5);
          ty -= a.phase === 'startup' ? 0.5 : 0;
          tp = a.phase === 'active' ? -0.15 : 0.1;
        } else {
          if (a.phase === 'startup') targets[i].set(i ? 1.4 : -1.4, 4.3, 0.8);
          else if (a.phase === 'active') targets[i].set(i ? 0.3 : -0.3, 4.4, 4.2);
          else targets[i].set(i ? 1.0 : -1.0, 4.4, 2.6);
          tw = (i ? 1 : -1) * (a.phase === 'active' ? 0.45 : 0.1);
        }
      } else if (k === 'melee' && a.key === 'heavy') {
        // Haymaker: huge wind-up, overhand punch
        if (a.phase === 'startup') {
          const t = smooth(a.phaseT);
          targets[0].set(-2.4, 5.5 + t, -1.8 * t);
          tw = -0.6 * t;
          ty -= 0.3 * t;
        } else if (a.phase === 'active') {
          targets[0].set(0.2, 3.6, 5);
          tw = 0.6;
          tp = 0.25;
        } else {
          targets[0].set(-0.5, 2.8, 3.8);
          tp = 0.3 * (1 - a.phaseT) + (a.fighter && !a.fighter.moveHit ? 0.15 : 0);
        }
      } else if (k === 'decoy') {
        tr = 0.4;
      } else if (k === 'parry') {
        shieldUp = 1.5;
      }
    }
    if (a.guard) shieldUp = Math.max(shieldUp, 1);
    if (shieldUp > 0) {
      targets[2].set(0, 4.2, 2.6);
      targets[0].set(-1.2, 4.4, 1.0);
      targets[1].set(1.2, 4.4, 1.0);
      ty -= 0.2;
    }
    if (a.charged) for (const tgt of targets.slice(0, 2)) tgt.y += Math.sin(a.t * 20) * 0.05;
    if (a.dodge) {
      tr = 0.5;
      ty -= 0.5;
    }
    if (a.hit > 0) {
      tp -= 0.35 * a.hit;
      tw += Math.sin(a.t * 40) * 0.1 * a.hit;
    }
    if (a.knock > 0) {
      tp -= 1.3 * a.knock;
      ty -= 1.4 * a.knock;
    }
    if (a.ko > 0) {
      tp -= 1.35 * a.ko;
      ty -= 1.7 * a.ko;
      targets[0].set(-2.5, 0.8, -1);
      targets[1].set(2.5, 0.8, -1);
    }
    if (a.victory > 0) {
      targets[0].set(-1.8, 7.2, 0.5);
      targets[1].set(1.8, 7.2, 0.5);
      targets[2].set(0.9, 4.8, 2.4);
      tp -= 0.15;
    }
    pose.y = damp(pose.y, ty, 14, dt);
    pose.pitch = damp(pose.pitch, tp, 10, dt);
    pose.roll = damp(pose.roll, tr, 10, dt);
    pose.twist = damp(pose.twist, tw, 16, dt);
    pose.shield = damp(pose.shield, shieldUp, 12, dt);
    body.position.y = pose.y;
    body.rotation.set(pose.pitch, pose.twist, pose.roll, 'YXZ');
    head.rotation.y = -pose.twist * 0.6;
    slitMat.emissiveIntensity = 3 + Math.sin(a.t * 4) * 1 + (a.charged ? 4 : 0);
    shieldMat.emissiveIntensity = 0.5 + pose.shield * 1.2 + (a.fighter && a.fighter.perfectTimer > 0 ? 2 : 0);
    shieldGlow.intensity = pose.shield * 15;
    crystalMat.emissiveIntensity = a.charged ? 1.5 + Math.sin(a.t * 18) * 0.5 : 0.45;

    legs.update(dt, a.vel, a.grounded, a.airborne ? 1 : 0, 1.3);
    legs.draw();

    body.updateMatrixWorld(true);
    arms.forEach((arm, i) => {
      arm.target.lerp(targets[i], 1 - Math.exp(-(a.state === 'attack' ? 30 : 12) * dt));
      // shoulder in root space (follows body rotation)
      const sw = body.localToWorld(tmp.copy(arm.sh));
      arm.shW.copy(root.worldToLocal(sw));
      arm.hand.copy(arm.target);
      solveKnee(arm.shW, arm.hand, 1.7, 1.75, arm.pole, arm.elbow);
      arm.upper.set(arm.shW, arm.elbow);
      arm.lower.set(arm.elbow, arm.hand);
      arm.handObj.position.copy(arm.hand);
      if (i === 2) arm.handObj.rotation.set(0, 0, 0);
      else arm.handObj.rotation.set(a.t * 0.3, a.t * 0.2, 0);
    });
  }

  const anchors = {
    fistR: () => root.localToWorld(arms[0].hand.clone()),
    fistL: () => root.localToWorld(arms[1].hand.clone()),
    shield: () => root.localToWorld(arms[2].hand.clone()),
    center: () => chest.localToWorld(new THREE.Vector3(0, 0, 0)),
    mouth: () => head.localToWorld(new THREE.Vector3(0, 0, 0.6)),
  };

  return { root, body, legs, materials, update, anchors, height: 5.0 };
}
