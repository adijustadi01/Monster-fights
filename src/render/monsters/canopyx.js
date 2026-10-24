// CANOPYX - living forest fortress: seed-pod body with a glowing golden core,
// a broad leaf canopy, a turtle-like head and five root limbs (4 walking legs
// + 1 grabbing arm), all IK driven.

import * as THREE from 'three';
import { mat, glow, mesh, rockGeo, Limb, LegSystem, solveKnee, damp, smooth } from './rig.js';

export const CANOPYX_PALETTES = {
  default: { bark: '#6a5232', bark2: '#4a3a24', moss: '#5a8a2a', leaf: '#5a9a2a', leaf2: '#a8a830', core: '#ffc23a', eye: '#ffd84a' },
  autumn: { bark: '#5a3a2a', bark2: '#3a2418', moss: '#8a6a2a', leaf: '#d8601a', leaf2: '#f0a020', core: '#ff7a2a', eye: '#ffb04a' },
  shadow: { bark: '#1a1414', bark2: '#100a0a', moss: '#2a1a1a', leaf: '#3a0a14', leaf2: '#5a1020', core: '#ff1030', eye: '#ff1020' },
  ghost: { bark: '#999', bark2: '#888', moss: '#aaa', leaf: '#bbb', leaf2: '#ccc', core: '#fff', eye: '#fff' },
};

function leafGeometry(len, width) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(width, len * 0.35, 0, len);
  s.quadraticCurveTo(-width, len * 0.35, 0, 0);
  const g = new THREE.ShapeGeometry(s, 4);
  // bend leaf downward along its length
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setZ(i, -Math.pow(y / len, 2) * len * 0.35);
  }
  g.computeVertexNormals();
  return g;
}

export function buildCanopyx(palette, opts = {}) {
  const P = palette;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const barkMat = mat(P.bark, { roughness: 1 });
  const bark2Mat = mat(P.bark2, { roughness: 1 });
  const mossMat = mat(P.moss, { roughness: 1 });
  const leafMat = mat(P.leaf, { roughness: 0.8, side: THREE.DoubleSide, flat: false });
  const leaf2Mat = mat(P.leaf2, { roughness: 0.8, side: THREE.DoubleSide, flat: false });
  const coreMat = glow(P.core, 2.2);
  const eyeMat = glow(P.eye, 3);
  const materials = { barkMat, coreMat, leafMat };

  // Seed-pod body: husk slats around a glowing core
  const pod = new THREE.Group();
  pod.position.set(0, 3.6, 0);
  body.add(pod);
  const core = mesh(new THREE.SphereGeometry(1.25, 18, 14), coreMat);
  core.scale.set(1.15, 1.05, 1.3);
  pod.add(core);
  const slats = 10;
  for (let i = 0; i < slats; i++) {
    const a = (i / slats) * Math.PI * 2;
    const slat = mesh(new THREE.SphereGeometry(1, 8, 12, 0, 0.5, 0, Math.PI), i % 2 ? barkMat : bark2Mat);
    slat.scale.set(1.75, 1.5, 1.95);
    slat.rotation.y = a;
    pod.add(slat);
  }
  // moss clumps and hanging vines
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const m = mesh(rockGeo(0.45, 0, 0.3, i + 20, [1.4, 0.6, 1.4]), mossMat);
    m.position.set(Math.cos(a) * 1.5, 0.9 + (i % 3) * 0.2, Math.sin(a) * 1.7);
    pod.add(m);
    const vine = mesh(new THREE.ConeGeometry(0.08, 1.4 + (i % 4) * 0.3, 4), mossMat, false);
    vine.position.set(Math.cos(a) * 1.7, -0.8, Math.sin(a) * 1.85);
    vine.rotation.x = Math.PI;
    pod.add(vine);
  }

  // Canopy of leaves
  const canopy = new THREE.Group();
  canopy.position.set(0, 1.4, -0.2);
  pod.add(canopy);
  const leafG = leafGeometry(3.4, 0.9);
  const leafG2 = leafGeometry(2.6, 0.75);
  const leaves = [];
  for (let ring = 0; ring < 3; ring++) {
    const n = 9 + ring * 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.3;
      const leaf = mesh(ring === 2 ? leafG2 : leafG, (i + ring) % 3 === 0 ? leaf2Mat : leafMat, true);
      const holder = new THREE.Group();
      holder.rotation.y = a;
      holder.position.y = ring * 0.25;
      leaf.rotation.x = -Math.PI / 2 + 0.35 + ring * 0.25;
      holder.add(leaf);
      canopy.add(holder);
      leaves.push(holder);
    }
  }
  canopy.scale.set(1.3, 1, 1.15);

  // Head (turtle-like, glowing eyes)
  const neck = new THREE.Group();
  neck.position.set(0, 3.9, 2.0);
  body.add(neck);
  const neckMesh = mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.4, 8), barkMat);
  neckMesh.rotation.x = Math.PI / 2.6;
  neckMesh.position.set(0, 0.2, 0.4);
  neck.add(neckMesh);
  const head = mesh(rockGeo(0.85, 1, 0.08, 7, [0.95, 0.75, 1.2]), barkMat);
  head.position.set(0, 0.45, 1.25);
  neck.add(head);
  const brow = mesh(rockGeo(0.5, 0, 0.2, 8, [1.7, 0.4, 0.8]), mossMat);
  brow.position.set(0, 0.95, 1.4);
  neck.add(brow);
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.15, 10, 8), eyeMat, false);
    e.position.set(s * 0.38, 0.62, 2.05);
    neck.add(e);
  }

  // Limbs: 4 legs + 1 arm (root bundles)
  const legs = new LegSystem(root, body, { stepDist: 1.8, stepTime: 0.45, lift: 1.0, lead: 0.3, onStep: opts.onStep });
  const makeLimb = (r1, r2) => {
    const upper = new Limb(root, barkMat, r1, r2, 6);
    const lower = new Limb(root, bark2Mat, r2, r2 * 0.75, 6);
    // twisting root strands along the lower limb
    return { upper, lower };
  };
  const legDefs = [
    { x: 1.5, z: 1.1, rx: 2.9, rz: 2.3, g: 0 },
    { x: -1.5, z: 1.1, rx: -2.9, rz: 2.3, g: 1 },
    { x: 1.5, z: -1.2, rx: 2.9, rz: -2.4, g: 1 },
    { x: -1.5, z: -1.2, rx: -2.9, rz: -2.4, g: 0 },
  ];
  const legList = legDefs.map((d) => {
    const { upper, lower } = makeLimb(0.85, 0.66);
    const foot = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const toe = mesh(new THREE.ConeGeometry(0.3, 1.3, 5), bark2Mat);
      const a = (k / 4) * Math.PI * 2 + 0.4;
      toe.position.set(Math.cos(a) * 0.4, 0.2, Math.sin(a) * 0.4);
      toe.rotation.set(Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3);
      foot.add(toe);
    }
    const knob = mesh(rockGeo(0.7, 0, 0.25, 3), barkMat);
    knob.position.y = 0.3;
    foot.add(knob);
    root.add(foot);
    const kneeCap = mesh(rockGeo(0.75, 0, 0.3, 30), mossMat);
    root.add(kneeCap);
    return legs.addLeg({ hip: new THREE.Vector3(d.x, 2.9, d.z), rest: new THREE.Vector3(d.rx, 0, d.rz), l1: 2.1, l2: 2.0, pole: new THREE.Vector3(Math.sign(d.x) * 1, 0.9, d.z > 0 ? 0.6 : -0.6), group: d.g, upper, lower, foot, kneeCap, tuckY: 0.4 });
  });
  // Grabbing arm (5th limb)
  const arm = makeLimb(0.5, 0.4);
  const hand = new THREE.Group();
  const fingers = [];
  for (let k = 0; k < 4; k++) {
    const f = mesh(new THREE.ConeGeometry(0.16, 1.0, 5), bark2Mat);
    f.position.set((k - 1.5) * 0.25, 0, 0.45);
    f.rotation.x = Math.PI / 2;
    hand.add(f);
    fingers.push(f);
  }
  const palm = mesh(rockGeo(0.45, 0, 0.2, 77), barkMat);
  hand.add(palm);
  const handGlow = mesh(new THREE.SphereGeometry(0.3, 8, 6), coreMat, false);
  handGlow.position.z = 0.3;
  hand.add(handGlow);
  root.add(hand);
  const armState = { shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), hand: new THREE.Vector3(2.4, 2.8, 3.6), target: new THREE.Vector3() };

  const pose = { y: 0, pitch: 0, roll: 0, headPitch: 0, canopy: 0, core: 2.2 };
  const tmp = new THREE.Vector3();
  const overrides = new Map();

  function update(a) {
    const dt = a.dt;
    let ty = Math.sin(a.t * 1.2) * 0.1;
    let tp = 0;
    let tr = 0;
    let th = Math.sin(a.t * 0.8) * 0.05;
    let canopyRustle = 0.03;
    let handTarget = new THREE.Vector3(2.6, 2.6 + Math.sin(a.t * 1.5) * 0.3, 3.6);
    let coreI = 2.0 + Math.sin(a.t * 2) * 0.3;
    let fingerCurl = 0.2;
    overrides.clear();
    if (a.state === 'attack') {
      const k = a.kind;
      if (k === 'melee') {
        if (a.phase === 'startup') handTarget.set(3.4, 6 + smooth(a.phaseT) * 0.8, 0.5);
        else if (a.phase === 'active') {
          handTarget.set(2.6 - a.phaseT * 5, 2.4, 6.3);
          tp = 0.12;
          fingerCurl = 0.8;
        } else handTarget.set(2.6, 3, 4);
        if (a.chain === 2) {
          tr = a.phase === 'active' ? -0.25 : 0;
          handTarget.y -= 0.6;
        }
      } else if (k === 'grab') {
        // visible wind-up: rear back, core & hand glow, then plunge into the ground
        if (a.phase === 'startup') {
          const t = smooth(a.phaseT);
          handTarget.set(2.2, 6.5 + t, -0.5);
          tp = -0.25 * t;
          coreI = 2.5 + t * 3 + Math.sin(a.t * 30) * 0.6;
          canopyRustle = 0.2;
        } else {
          handTarget.set(1.5, 0.2, 4.2);
          tp = 0.22;
          coreI = 4;
          fingerCurl = 1;
        }
      } else if (k === 'barrier') {
        handTarget.set(0.5, a.phase === 'startup' ? 6 : 0.5, 3.5);
        tp = a.phase === 'startup' ? -0.15 : 0.1;
      } else if (k === 'forestlock') {
        const t = a.phase === 'startup' ? smooth(a.phaseT) : 1;
        tp = -0.35 * t;
        ty += 0.8 * t;
        coreI = 3 + t * 4;
        canopyRustle = 0.3;
        handTarget.set(3, 7, 1);
        legList.slice(0, 2).forEach((l, i) => overrides.set(l, root.localToWorld(new THREE.Vector3((i ? -1 : 1) * 2.8, 2.5 * t, 3.2))));
        if (a.phase !== 'startup') {
          tp = 0.2;
          ty = -0.3;
          legList.slice(0, 2).forEach((l, i) => overrides.set(l, root.localToWorld(new THREE.Vector3((i ? -1 : 1) * 2.8, 0, 3.8))));
        }
      }
    }
    if (a.weak) coreI += 2 + Math.sin(a.t * 16) * 1.5;
    if (a.healing) coreI += 0.5;
    if (a.block > 0) {
      ty -= 0.7 * a.block;
      th += 0.4 * a.block;
      handTarget.set(0.4, 3.4, 3.2);
    }
    if (a.hit > 0) {
      tp -= 0.2 * a.hit;
      canopyRustle = 0.3;
    }
    if (a.knock > 0) {
      tr += 0.85 * a.knock;
      ty -= 1 * a.knock;
    }
    if (a.ko > 0) {
      ty -= 1.8 * a.ko;
      tr += 0.4 * a.ko;
      th += 0.5;
      coreI = 0.4;
    }
    if (a.victory > 0) {
      tp -= 0.3 * a.victory;
      ty += 0.6 * a.victory;
      handTarget.set(2, 8, 1);
      canopyRustle = 0.2;
    }
    pose.y = damp(pose.y, ty, 8, dt);
    pose.pitch = damp(pose.pitch, tp, 8, dt);
    pose.roll = damp(pose.roll, tr, 7, dt);
    pose.headPitch = damp(pose.headPitch, th, 6, dt);
    pose.core = damp(pose.core, coreI, 10, dt);
    body.position.y = pose.y;
    body.rotation.set(-pose.pitch, 0, pose.roll);
    neck.rotation.x = pose.headPitch;
    coreMat.emissiveIntensity = pose.core;
    leaves.forEach((l, i) => {
      l.rotation.z = Math.sin(a.t * 2.2 + i) * canopyRustle;
    });

    legs.update(dt, a.vel, a.grounded, a.airborne ? 1 : 0);
    legs.draw(overrides);

    // Arm IK
    body.updateMatrixWorld(true);
    armState.target.lerp(handTarget, 1 - Math.exp(-12 * dt));
    armState.shoulder.copy(root.worldToLocal(body.localToWorld(tmp.set(1.4, 3.6, 1.5))));
    armState.hand.copy(armState.target);
    solveKnee(armState.shoulder, armState.hand, 2.3, 2.3, new THREE.Vector3(1.5, 1, -0.5), armState.elbow);
    arm.upper.set(armState.shoulder, armState.elbow);
    arm.lower.set(armState.elbow, armState.hand);
    hand.position.copy(armState.hand);
    const dir = armState.hand.clone().sub(armState.elbow).normalize();
    hand.lookAt(hand.position.clone().add(dir));
    fingers.forEach((f, i) => (f.rotation.y = (i - 1.5) * 0.25 * (1 - fingerCurl)));
  }

  const anchors = {
    core: () => pod.localToWorld(new THREE.Vector3(0, 0, 1.3)),
    center: () => pod.localToWorld(new THREE.Vector3(0, 0, 0)),
    hand: () => root.localToWorld(armState.hand.clone()),
  };

  return { root, body, legs, materials, update, anchors, height: 5.3 };
}
