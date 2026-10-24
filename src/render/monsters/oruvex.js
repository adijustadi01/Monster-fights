// ORUVEX - pearl-white tidal colossus: three tentacle legs (IK), two siphon
// cannon arms, glowing turquoise pressure sacs and a coral-pink frill.

import * as THREE from 'three';
import { mat, glow, mesh, Limb, LegSystem, solveKnee, damp, smooth } from './rig.js';

export const ORUVEX_PALETTES = {
  default: { shell: '#e8e4dc', shell2: '#c8d8d8', sac: '#2ae0d0', frill: '#ff8a8a', eye: '#40f0ff', inner: '#1a4a5a' },
  abyssal: { shell: '#2a3a5a', shell2: '#1a2a44', sac: '#8a3aff', frill: '#3affc8', eye: '#c8a0ff', inner: '#0a0a20' },
  shadow: { shell: '#2a2228', shell2: '#1a1418', sac: '#c0102a', frill: '#5a0a1a', eye: '#ff1020', inner: '#000000' },
  ghost: { shell: '#aaa', shell2: '#999', sac: '#ddd', frill: '#ccc', eye: '#fff', inner: '#555' },
};

export function buildOruvex(palette, opts = {}) {
  const P = palette;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const shellMat = mat(P.shell, { roughness: 0.25, metalness: 0.35, flat: false });
  const shell2Mat = mat(P.shell2, { roughness: 0.3, metalness: 0.3, flat: false });
  const sacMat = new THREE.MeshStandardMaterial({ color: P.sac, emissive: P.sac, emissiveIntensity: 1.1, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.88 });
  const frillMat = mat(P.frill, { roughness: 0.6, flat: true, side: THREE.DoubleSide, emissive: P.frill, emissiveIntensity: 0.15 });
  const eyeMat = glow(P.eye, 3);
  const innerMat = mat(P.inner, { roughness: 0.6 });
  const materials = { shellMat, sacMat, frillMat, eyeMat };

  // Torso: ribbed shell around glowing sacs
  const torso = new THREE.Group();
  torso.position.set(0, 4.3, 0);
  body.add(torso);
  const core = mesh(new THREE.SphereGeometry(1, 20, 16), sacMat);
  core.scale.set(1.45, 1.25, 1.35);
  torso.add(core);
  const sacs = [];
  const sacPos = [[0.9, 0.2, 0.8], [-0.9, 0.2, 0.8], [1.2, -0.3, 0], [-1.2, -0.3, 0], [0.6, -0.6, 0.9], [-0.6, -0.6, 0.9], [0, 0.4, 1.1]];
  for (const [x, y, z] of sacPos) {
    const s = mesh(new THREE.SphereGeometry(0.45, 12, 10), sacMat);
    s.position.set(x, y, z);
    torso.add(s);
    sacs.push(s);
  }
  // Ribs
  for (let i = 0; i < 6; i++) {
    const rib = mesh(new THREE.TorusGeometry(1.5 - Math.abs(i - 2.5) * 0.12, 0.14, 6, 20, Math.PI * 1.35), shellMat);
    rib.position.set(0, 0.9 - i * 0.36, 0.1);
    rib.rotation.set(Math.PI / 2, 0, Math.PI * 0.82);
    rib.scale.set(1, 1.05, 1);
    torso.add(rib);
  }
  const back = mesh(new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
  back.scale.set(1.55, 1.2, 1.5);
  back.rotation.x = -Math.PI / 2.2;
  back.position.set(0, 0.2, -0.35);
  torso.add(back);

  // Head: shell hood with three eyes and frill
  const head = new THREE.Group();
  head.position.set(0, 1.25, 0.75);
  torso.add(head);
  const hood = mesh(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), shellMat);
  hood.scale.set(1.2, 0.7, 1.25);
  hood.position.set(0, 0.1, 0.2);
  head.add(hood);
  const jaw = mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.35), shell2Mat);
  jaw.scale.set(1.1, 0.6, 1.15);
  jaw.position.set(0, 0.0, 0.25);
  head.add(jaw);
  const mouth = mesh(new THREE.BoxGeometry(1.6, 0.18, 0.4), innerMat);
  mouth.position.set(0, 0.05, 1.25);
  head.add(mouth);
  for (let i = -1; i <= 1; i++) {
    const e = mesh(new THREE.SphereGeometry(0.12, 10, 8), eyeMat, false);
    e.position.set(i * 0.32, 0.22, 1.28);
    head.add(e);
  }
  // Coral frill: radial fan of thin blades around the head
  const frill = new THREE.Group();
  frill.position.set(0, 0.05, 0.05);
  head.add(frill);
  for (let i = 0; i < 28; i++) {
    const a = -Math.PI * 0.75 + (i / 27) * Math.PI * 1.5;
    const blade = mesh(new THREE.ConeGeometry(0.16, 1.5 + (i % 3) * 0.25, 4), frillMat, false);
    blade.position.set(Math.sin(a) * 1.2, Math.cos(a) * 0.95, -0.1);
    blade.rotation.z = -a;
    blade.scale.z = 0.25;
    frill.add(blade);
  }

  // Legs (3): front-left, front-right, rear
  const legs = new LegSystem(root, body, { stepDist: 2.2, stepTime: 0.5, lift: 1.1, lead: 0.3, onStep: opts.onStep });
  const legDefs = [
    { hx: 1.1, hz: 0.7, rx: 3.4, rz: 2.6, g: 0 },
    { hx: -1.1, hz: 0.7, rx: -3.4, rz: 2.6, g: 1 },
    { hx: 0, hz: -1.0, rx: 0, rz: -3.6, g: 1 },
  ];
  const legList = legDefs.map((d) => {
    const upper = new Limb(root, shellMat, 0.75, 0.55, 10);
    const lower = new Limb(root, shell2Mat, 0.55, 0.42, 10);
    const foot = new THREE.Group();
    const pad = mesh(new THREE.CylinderGeometry(0.9, 1.25, 0.5, 12), shellMat);
    pad.position.y = 0.25;
    foot.add(pad);
    const rim = mesh(new THREE.TorusGeometry(1.1, 0.15, 6, 16), shell2Mat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.1;
    foot.add(rim);
    root.add(foot);
    const kneeCap = mesh(new THREE.SphereGeometry(0.6, 12, 10), shellMat);
    root.add(kneeCap);
    return legs.addLeg({
      hip: new THREE.Vector3(d.hx, 3.3, d.hz),
      rest: new THREE.Vector3(d.rx, 0, d.rz),
      l1: 3.0,
      l2: 2.9,
      pole: new THREE.Vector3(d.hx * 1.5 || 0, 2, d.hz > 0 ? 0.6 : -1.5),
      group: d.g,
      upper,
      lower,
      foot,
      kneeCap,
      tuckY: 0.4,
    });
  });

  // Siphon arms: shoulder -> elbow -> nozzle (IK toward an aim point)
  const arms = [-1, 1].map((s) => {
    const upper = new Limb(root, shellMat, 0.42, 0.36, 10);
    const lower = new Limb(root, shell2Mat, 0.36, 0.42, 10);
    const nozzle = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(0.55, 0.2, 8, 18), shellMat);
    nozzle.add(ring);
    const hole = mesh(new THREE.CircleGeometry(0.5, 16), innerMat);
    hole.position.z = 0.02;
    nozzle.add(hole);
    const tube = mesh(new THREE.CylinderGeometry(0.45, 0.4, 0.8, 12, 1, true), shellMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.z = -0.35;
    nozzle.add(tube);
    root.add(nozzle);
    return { s, upper, lower, nozzle, elbow: new THREE.Vector3(), hand: new THREE.Vector3(), shoulder: new THREE.Vector3(), target: new THREE.Vector3(s * 3.5, 4.5, 1.5) };
  });

  const pose = { y: 0, pitch: 0, roll: 0, headPitch: 0, crouch: 0, frill: 0 };
  const overrides = new Map();
  const tmp = new THREE.Vector3();
  const aimLocal = new THREE.Vector3();

  function update(a) {
    const dt = a.dt;
    let ty = Math.sin(a.t * 1.4) * 0.12;
    let tp = 0;
    let tr = Math.sin(a.t * 0.9) * 0.03;
    let th = 0;
    let frillOpen = 0;
    overrides.clear();
    // default arm poses: curled out to the sides
    const sway = Math.sin(a.t * 1.6);
    const armTargets = [
      new THREE.Vector3(-3.9, 4.2 + sway * 0.3, 2.0),
      new THREE.Vector3(3.9, 4.2 - sway * 0.3, 2.0),
    ];
    // aim at opponent (root-local)
    root.updateMatrixWorld(true);
    aimLocal.copy(a.aim);
    root.worldToLocal(aimLocal);
    const aimDir = aimLocal.clone().sub(new THREE.Vector3(0, 4.5, 0)).normalize();

    if (a.state === 'attack') {
      const k = a.kind;
      if (k === 'melee' && a.key === 'light') {
        const i = a.chain % 2;
        const s = i === 0 ? -1 : 1;
        if (a.phase === 'startup') armTargets[i].set(s * 3.2, 6.2 + smooth(a.phaseT), -0.5);
        else if (a.phase === 'active') armTargets[i].set(s * (2.4 - a.phaseT * 4.5), 3.8, 5.6);
        else armTargets[i].set(s * 2.8, 4.2, 3.5 - a.phaseT * 2);
        if (a.chain === 2) {
          const o = 1 - i;
          armTargets[o].copy(armTargets[i]).multiply(new THREE.Vector3(-1, 1, 1));
        }
      } else if (k === 'melee' && a.key === 'heavy') {
        // Pressure blast: both cannons pull back, then thrust forward
        frillOpen = 1;
        for (let i = 0; i < 2; i++) {
          const s = i === 0 ? -1 : 1;
          if (a.phase === 'startup') armTargets[i].set(s * 1.8, 5.2, -0.8 + (1 - smooth(a.phaseT)) * 0.5);
          else armTargets[i].set(s * 1.1, 4.4, 5.2);
        }
        tp = a.phase === 'startup' ? -0.12 : 0.12;
      } else if (k === 'stream' || k === 'siege') {
        frillOpen = 1;
        const both = k === 'siege';
        for (let i = 0; i < 2; i++) {
          if (!both && i === 0) continue;
          const s = i === 0 ? -1 : 1;
          armTargets[i].set(s * 1.3, 4.5, 1).addScaledVector(aimDir, 4.2);
        }
        if (both) {
          ty -= 0.7;
          th = 0.1;
          // anchor: feet spread wide
          legList.forEach((l, li) => {
            const r = l.rest.clone().multiplyScalar(1.25);
            overrides.set(l, root.localToWorld(r));
            void li;
          });
        }
      }
    }
    if (a.block > 0) {
      armTargets[0].set(-1.2, 5.2, 2.6);
      armTargets[1].set(1.2, 5.2, 2.6);
      ty -= 0.5 * a.block;
    }
    if (a.hit > 0) {
      tp -= 0.2 * a.hit;
      tr += Math.sin(a.t * 37) * 0.06 * a.hit;
      frillOpen = 1;
    }
    if (a.knock > 0) {
      tr += 0.8 * a.knock;
      ty -= 1.6 * a.knock;
    }
    if (a.ko > 0) {
      ty -= 2.0 * a.ko;
      tr += 0.6 * a.ko;
      th = 0.5 * a.ko;
      armTargets[0].set(-3.5, 0.5, 2);
      armTargets[1].set(3.5, 0.5, 2);
    }
    if (a.victory > 0) {
      frillOpen = 1;
      th = -0.4 * a.victory;
      armTargets[0].set(-2.5, 8.5, 1);
      armTargets[1].set(2.5, 8.5, 1);
      ty += 0.4 * a.victory;
    }

    pose.y = damp(pose.y, ty, 8, dt);
    pose.pitch = damp(pose.pitch, tp, 8, dt);
    pose.roll = damp(pose.roll, tr, 6, dt);
    pose.headPitch = damp(pose.headPitch, th, 6, dt);
    pose.frill = damp(pose.frill, frillOpen, 6, dt);
    body.position.y = pose.y;
    body.rotation.set(-pose.pitch, 0, pose.roll);
    head.rotation.x = pose.headPitch;
    frill.scale.setScalar(1 + pose.frill * 0.25 + Math.sin(a.t * 3) * 0.03);
    // sacs pulse (brighter when hit by electricity / when firing)
    const pulse = 1 + Math.sin(a.t * 3) * 0.25 + (a.state === 'attack' ? 0.6 : 0);
    sacMat.emissiveIntensity = pulse;
    sacs.forEach((s, i) => s.scale.setScalar(1 + Math.sin(a.t * 3 + i) * 0.06));

    legs.update(dt, a.vel, a.grounded, a.airborne ? 1 : 0);
    legs.draw(overrides);

    // Arms IK (in root space)
    body.updateMatrixWorld(true);
    arms.forEach((arm, i) => {
      arm.target.lerp(armTargets[i], 1 - Math.exp(-14 * dt));
      const shoulderW = body.localToWorld(tmp.set(arm.s * 1.45, 4.6, 0.6));
      arm.shoulder.copy(root.worldToLocal(shoulderW));
      arm.hand.copy(arm.target);
      solveKnee(arm.shoulder, arm.hand, 2.0, 2.0, new THREE.Vector3(arm.s * 1.6, 0.5, -0.8), arm.elbow);
      arm.upper.set(arm.shoulder, arm.elbow);
      arm.lower.set(arm.elbow, arm.hand);
      arm.nozzle.position.copy(arm.hand);
      const dir = arm.hand.clone().sub(arm.elbow).normalize();
      arm.nozzle.lookAt(arm.nozzle.position.clone().add(dir));
    });
  }

  const anchors = {
    cannonL: () => root.localToWorld(arms[0].hand.clone().add(arms[0].hand.clone().sub(arms[0].elbow).normalize().multiplyScalar(0.4))),
    cannonR: () => root.localToWorld(arms[1].hand.clone().add(arms[1].hand.clone().sub(arms[1].elbow).normalize().multiplyScalar(0.4))),
    center: () => torso.localToWorld(new THREE.Vector3(0, 0, 0)),
    mouth: () => head.localToWorld(new THREE.Vector3(0, 0, 1.3)),
  };

  return { root, body, legs, materials, update, anchors, height: 5.6 };
}
