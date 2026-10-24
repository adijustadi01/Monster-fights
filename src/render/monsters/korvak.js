// KORVAK - six-legged volcanic colossus built from primitives.
// Dark basalt plates over a glowing lava body = glowing cracks between plates.

import * as THREE from 'three';
import { mat, glow, rockGeo, mesh, Limb, LegSystem, damp, smooth } from './rig.js';

export const KORVAK_PALETTES = {
  default: { rock: '#7a5e4c', rock2: '#5a4436', lava: '#ff5a10', eye: '#ffb020', vent: '#ff7a1a' },
  obsidian: { rock: '#3a4458', rock2: '#283044', lava: '#2aa8ff', eye: '#9ff0ff', vent: '#3ac8ff' },
  shadow: { rock: '#2a2030', rock2: '#1a1220', lava: '#c0102a', eye: '#ff1020', vent: '#ff2040' },
  ghost: { rock: '#888888', rock2: '#666666', lava: '#aaaaaa', eye: '#ffffff', vent: '#cccccc' },
};

export function buildKorvak(palette, opts = {}) {
  const P = palette;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const rockMat = mat(P.rock, { roughness: 0.95 });
  const rock2Mat = mat(P.rock2, { roughness: 1 });
  const lavaMat = glow(P.lava, 2.4);
  const ventMat = glow(P.vent, 2.5);
  const eyeMat = glow(P.eye, 3);
  const materials = { rockMat, rock2Mat, lavaMat, ventMat, eyeMat };

  // --- Lava core (shows through gaps between plates) ---
  const coreGeo = new THREE.SphereGeometry(1, 20, 14);
  const core = mesh(coreGeo, lavaMat);
  core.scale.set(1.95, 1.15, 2.7);
  core.position.set(0, 2.55, 0);
  body.add(core);

  // --- Shell plates on the upper ellipsoid ---
  const plates = new THREE.Group();
  body.add(plates);
  const N = 46;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 1.25; // upper ~60% of sphere
    if (y < -0.25) continue;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    const nx = Math.cos(th) * r;
    const nz = Math.sin(th) * r;
    const g = rockGeo(0.56 + (i % 3) * 0.07, 0, 0.25, i + 3, [1.15, 0.45, 1.15]);
    const p = mesh(g, i % 4 === 0 ? rock2Mat : rockMat);
    p.position.set(nx * 2.05, 2.55 + y * 1.25, nz * 2.8);
    p.lookAt(p.position.x * 2, (p.position.y - 2.55) * 2 + 2.55, p.position.z * 2);
    p.rotateX(Math.PI / 2);
    plates.add(p);
  }
  // Belly plate
  const belly = mesh(rockGeo(1, 1, 0.12, 77, [1.8, 0.5, 2.5]), rock2Mat);
  belly.position.set(0, 1.75, 0);
  body.add(belly);

  // --- Shoulder vents (weak spot after big attacks) ---
  const vents = [];
  for (const s of [-1, 1]) {
    const ring = mesh(new THREE.TorusGeometry(0.62, 0.3, 8, 14), rockMat);
    ring.position.set(s * 1.35, 3.55, 1.0);
    ring.rotation.set(-1.0, 0, s * 0.5);
    body.add(ring);
    const hole = mesh(new THREE.CircleGeometry(0.55, 14), ventMat);
    hole.position.copy(ring.position);
    hole.rotation.copy(ring.rotation);
    hole.translateZ(0.05);
    body.add(hole);
    const holeBack = hole.clone();
    holeBack.rotation.y += Math.PI;
    body.add(holeBack);
    vents.push(ring);
  }

  // --- Head ---
  const neck = new THREE.Group();
  neck.position.set(0, 2.35, 2.55);
  body.add(neck);
  const head = new THREE.Group();
  neck.add(head);
  const skull = mesh(rockGeo(1, 1, 0.15, 11, [0.95, 0.7, 1.15]), rockMat);
  skull.position.set(0, 0.15, 0.7);
  head.add(skull);
  const brow = mesh(rockGeo(0.6, 0, 0.2, 12, [1.6, 0.5, 0.8]), rock2Mat);
  brow.position.set(0, 0.62, 1.05);
  head.add(brow);
  const beak = mesh(new THREE.ConeGeometry(0.45, 0.9, 5), rock2Mat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.05, 1.85);
  head.add(beak);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.25, 0.5);
  head.add(jaw);
  const jawMesh = mesh(rockGeo(0.8, 0, 0.2, 13, [1.05, 0.35, 1.2]), rock2Mat);
  jawMesh.position.set(0, -0.15, 0.7);
  jaw.add(jawMesh);
  const mouthGlow = mesh(new THREE.BoxGeometry(1.1, 0.12, 1.2), lavaMat);
  mouthGlow.position.set(0, -0.12, 1.0);
  head.add(mouthGlow);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.13, 8, 6), eyeMat, false);
    eye.position.set(s * 0.55, 0.38, 1.38);
    head.add(eye);
  }
  // back ridge spikes
  for (let i = 0; i < 5; i++) {
    const sp = mesh(rockGeo(0.35, 0, 0.3, 40 + i, [0.7, 1.6, 0.7]), rock2Mat);
    sp.position.set(0, 3.85 - Math.abs(i - 1.5) * 0.12, 1.2 - i * 0.85);
    sp.rotation.x = -0.4;
    body.add(sp);
  }
  // tail stub
  const tail = mesh(rockGeo(0.7, 0, 0.2, 99, [0.8, 0.6, 1.5]), rockMat);
  tail.position.set(0, 1.9, -2.9);
  body.add(tail);

  // --- Six legs with IK ---
  const legs = new LegSystem(root, body, { stepDist: 1.5, stepTime: 0.42, lift: 0.8, lead: 0.3, onStep: opts.onStep });
  const legDefs = [
    { x: 1.75, z: 1.55, rx: 2.9, rz: 2.5, g: 0 },
    { x: -1.75, z: 1.55, rx: -2.9, rz: 2.5, g: 1 },
    { x: 1.9, z: 0, rx: 3.25, rz: 0.1, g: 1 },
    { x: -1.9, z: 0, rx: -3.25, rz: 0.1, g: 0 },
    { x: 1.75, z: -1.55, rx: 2.9, rz: -2.2, g: 0 },
    { x: -1.75, z: -1.55, rx: -2.9, rz: -2.2, g: 1 },
  ];
  const legList = [];
  for (const d of legDefs) {
    const upper = new Limb(root, rockMat, 0.78, 0.62, 7);
    const lower = new Limb(root, rock2Mat, 0.62, 0.52, 7);
    const foot = new THREE.Group();
    const footMesh = mesh(rockGeo(0.62, 0, 0.2, 5 + legList.length, [1.15, 0.55, 1.25]), rockMat);
    footMesh.position.y = 0.2;
    foot.add(footMesh);
    for (let t = -1; t <= 1; t++) {
      const toe = mesh(new THREE.ConeGeometry(0.18, 0.45, 5), rock2Mat);
      toe.rotation.x = Math.PI / 2;
      toe.position.set(t * 0.33, 0.12, 0.62);
      foot.add(toe);
    }
    // lava glow at the knee
    const kneeCap = mesh(rockGeo(0.55, 0, 0.25, 60 + legList.length), rockMat);
    root.add(kneeCap);
    root.add(foot);
    const leg = legs.addLeg({
      hip: new THREE.Vector3(d.x, 2.2, d.z),
      rest: new THREE.Vector3(d.rx, 0, d.rz),
      l1: 1.95,
      l2: 1.9,
      pole: new THREE.Vector3(Math.sign(d.x) * 1, 1.2, 0.2),
      group: d.g,
      upper,
      lower,
      foot,
      kneeCap,
      tuckY: 0.5,
    });
    legList.push(leg);
  }

  // Smoothed pose values
  const pose = { y: 0, pitch: 0, roll: 0, lunge: 0, headPitch: 0, jaw: 0, crouch: 0 };
  const overrides = new Map();
  const tmp = new THREE.Vector3();

  function update(a) {
    const dt = a.dt;
    let ty = 0;
    let tp = 0;
    let tr = 0;
    let tl = 0;
    let th = 0;
    let tj = 0.05;
    overrides.clear();
    const breathe = Math.sin(a.t * 1.6) * 0.06;
    ty += breathe;

    // walking bob
    ty += Math.abs(Math.sin(a.stepPhase * 1.4)) * 0.08 * Math.min(1, a.speed / 3);

    if (a.state === 'attack') {
      const k = a.kind;
      if (k === 'melee') {
        // Claw swipe with a front leg (alternating by chain)
        const leg = legList[a.chain % 2];
        const side = a.chain % 2 === 0 ? 1 : -1;
        let fx;
        let fy;
        let fz;
        if (a.phase === 'startup') {
          const t = smooth(a.phaseT);
          fx = side * (2.6 + t * 0.8);
          fy = 1 + t * 3.2;
          fz = 2.4 + t * 0.8;
          tp = -0.12 * t;
          tr = -side * 0.08 * t;
          tj = 0.3 * t;
        } else if (a.phase === 'active') {
          fx = side * (0.8 - a.phaseT * 1.6);
          fy = 1.2 - a.phaseT * 0.9;
          fz = 4.6;
          tp = 0.15;
          tl = 0.4;
          tj = 0.5;
        } else {
          const t = smooth(a.phaseT);
          fx = side * (-0.8 + t * 3.7);
          fy = 0.3 * (1 - t);
          fz = 4.6 - t * 2.2;
          tp = 0.1 * (1 - t);
        }
        if (a.chain === 2) {
          tj = 0.7;
          fy += 0.4;
        }
        overrides.set(leg, root.localToWorld(tmp.set(fx, fy, fz)).clone());
      } else if (k === 'charge') {
        if (a.phase === 'startup') {
          tp = -0.18 * smooth(a.phaseT);
          ty -= 0.4 * smooth(a.phaseT);
          th = 0.3;
          tj = 0.4;
        } else if (a.phase === 'active') {
          tp = 0.22;
          ty -= 0.35;
          th = 0.45;
          tj = 0.2;
        } else {
          tp = 0.1 * (1 - a.phaseT);
        }
      } else if (k === 'slam' || k === 'quake') {
        const big = k === 'quake' ? 1.35 : 1;
        if (a.phase === 'startup') {
          const t = smooth(a.phaseT);
          tp = -0.55 * t * big;
          ty += 1.0 * t * big;
          tj = 0.8 * t;
          for (let i = 0; i < 2; i++) {
            const s = i === 0 ? 1 : -1;
            overrides.set(legList[i], root.localToWorld(tmp.set(s * 2.4, 2.5 + 3 * t * big, 2.6 + t)).clone());
          }
        } else if (a.phase === 'active') {
          tp = 0.2;
          ty -= 0.3;
          tj = 0.9;
          for (let i = 0; i < 2; i++) {
            const s = i === 0 ? 1 : -1;
            overrides.set(legList[i], root.localToWorld(tmp.set(s * 2.2, 0, 3.6)).clone());
          }
        } else {
          tp = 0.2 * (1 - a.phaseT);
          ty -= 0.3 * (1 - a.phaseT);
          tj = 0.5 * (1 - a.phaseT);
        }
      }
    }
    if (a.block > 0) {
      ty -= 0.55 * a.block;
      tp += 0.18 * a.block;
      th += 0.35 * a.block;
    }
    if (a.hit > 0) {
      tp -= 0.25 * a.hit;
      tr += Math.sin(a.t * 40) * 0.05 * a.hit;
      tj = Math.max(tj, 0.4 * a.hit);
    }
    if (a.knock > 0) {
      tr += 0.9 * a.knock;
      ty -= 0.6 * a.knock;
    }
    if (a.victory > 0) {
      tp -= 0.45 * a.victory;
      ty += 0.8 * a.victory;
      tj = 0.9 * a.victory + Math.sin(a.t * 18) * 0.05;
      th -= 0.5 * a.victory;
    }
    if (a.ko > 0) {
      ty -= 1.2 * a.ko;
      tr += 0.35 * a.ko;
      th += 0.6 * a.ko;
      tj = 0.3;
    }

    pose.y = damp(pose.y, ty, 14, dt);
    pose.pitch = damp(pose.pitch, tp, 12, dt);
    pose.roll = damp(pose.roll, tr, 10, dt);
    pose.lunge = damp(pose.lunge, tl, 14, dt);
    pose.headPitch = damp(pose.headPitch, th, 10, dt);
    pose.jaw = damp(pose.jaw, tj, 16, dt);

    body.position.set(0, pose.y, pose.lunge);
    body.rotation.set(-pose.pitch, 0, pose.roll);
    neck.rotation.x = pose.headPitch + Math.sin(a.t * 1.6 + 1) * 0.03;
    neck.rotation.y = Math.sin(a.t * 0.7) * 0.06;
    jaw.rotation.x = pose.jaw * 0.6;

    // Glow: cooled armor dims the lava, exposed vents flare
    const cooled = a.cooled ? 1 : 0;
    lavaMat.emissiveIntensity = damp(lavaMat.emissiveIntensity, cooled ? 0.35 : 2.2 + Math.sin(a.t * 3) * 0.25, 6, dt);
    lavaMat.emissive.set(cooled ? '#7a2a10' : P.lava);
    ventMat.emissiveIntensity = a.weak ? 4 + Math.sin(a.t * 14) * 1.8 : cooled ? 0.3 : 1.8;
    rockMat.color.set(cooled ? '#7a8590' : P.rock);

    legs.update(dt, a.vel, a.grounded, a.airborne ? 1 : 0, 1);
    legs.draw(overrides);
  }

  // Effect anchor points (in body space)
  const anchors = {
    mouth: () => head.localToWorld(new THREE.Vector3(0, 0, 2.0)),
    ventL: () => body.localToWorld(new THREE.Vector3(1.35, 3.6, 1.0)),
    ventR: () => body.localToWorld(new THREE.Vector3(-1.35, 3.6, 1.0)),
    front: () => root.localToWorld(new THREE.Vector3(0, 0.2, 3.8)),
    center: () => body.localToWorld(new THREE.Vector3(0, 2.6, 0)),
  };

  return { root, body, legs, materials, update, anchors, height: 4.6, headObj: head };
}
