// Arena scenery & destructible prop meshes (all procedural).
// Each arena builder adds distant backdrop pieces; buildProp() creates the
// breakable objects that sit inside the arena.

import * as THREE from 'three';
import { mat, glow, rockGeo, mesh, seeded } from './monsters/rig.js';

/* ------------------------------------------------------------------------ */
/*  Ground texture                                                           */
/* ------------------------------------------------------------------------ */

export function groundTexture(mood, kind) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = mood.ground;
  g.fillRect(0, 0, S, S);
  const rnd = seeded(kind.length * 31 + 7);
  // blotches
  for (let i = 0; i < 260; i++) {
    g.fillStyle = i % 2 ? mood.ground2 : mood.ground;
    g.globalAlpha = 0.25 + rnd() * 0.35;
    const r = 8 + rnd() * 40;
    g.beginPath();
    g.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // cracks
  const crackCount = kind === 'saltflats' ? 70 : kind === 'volcanic' ? 22 : 14;
  g.strokeStyle = kind === 'saltflats' ? '#b8c6d4' : kind === 'volcanic' ? mood.groundCrack : 'rgba(0,0,0,0.25)';
  g.lineWidth = kind === 'volcanic' ? 1.6 : 1.2;
  for (let i = 0; i < crackCount; i++) {
    let x = rnd() * S;
    let y = rnd() * S;
    g.globalAlpha = kind === 'volcanic' ? 0.45 : 0.4;
    g.beginPath();
    g.moveTo(x, y);
    const n = 4 + rnd() * 6;
    for (let k = 0; k < n; k++) {
      x += (rnd() - 0.5) * 50;
      y += (rnd() - 0.5) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // grass tufts / pebbles
  if (kind === 'valley') {
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rnd() > 0.5 ? '#6f9a3a' : '#4f7a2a';
      g.globalAlpha = 0.6;
      g.fillRect(rnd() * S, rnd() * S, 2, 4 + rnd() * 4);
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 7);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ------------------------------------------------------------------------ */
/*  Sky                                                                      */
/* ------------------------------------------------------------------------ */

export function buildSky(mood) {
  const geo = new THREE.SphereGeometry(500, 32, 16);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(mood.skyTop) },
      mid: { value: new THREE.Color(mood.skyMid) },
      bottom: { value: new THREE.Color(mood.skyBottom) },
      sunDir: { value: new THREE.Vector3(...mood.sunDir).normalize() },
      sunColor: { value: new THREE.Color(mood.sun) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
      varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = h > 0.08 ? mix(mid, top, smoothstep(0.08, 0.7, h)) : mix(bottom, mid, smoothstep(-0.05, 0.08, h));
        float s = max(0.0, dot(normalize(vDir), normalize(sunDir)));
        c += sunColor * (pow(s, 64.0) * 1.2 + pow(s, 6.0) * 0.25);
        // soft cloud bands
        float band = sin(vDir.x * 9.0 + vDir.z * 5.0) * sin(vDir.y * 30.0 + vDir.x * 4.0);
        c = mix(c, vec3(1.0), smoothstep(0.75, 1.0, band) * 0.12 * smoothstep(0.0, 0.3, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(geo, m);
  sky.renderOrder = -10;
  return sky;
}

/* ------------------------------------------------------------------------ */
/*  Backdrops per arena                                                      */
/* ------------------------------------------------------------------------ */

function seaPlane(color, y = -0.4, size = 1400) {
  const g = new THREE.PlaneGeometry(size, size, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.3 });
  const s = new THREE.Mesh(g, m);
  s.position.y = y;
  s.receiveShadow = false;
  return s;
}

function mountain(h, r, color, seed, snow = null) {
  const g = rockGeo(1, 1, 0.25, seed, [r, h, r]);
  const m = new THREE.Mesh(g, mat(color, { roughness: 1 }));
  m.position.y = h * 0.35;
  const grp = new THREE.Group();
  grp.add(m);
  if (snow) {
    const cap = new THREE.Mesh(rockGeo(1, 1, 0.2, seed + 1, [r * 0.35, h * 0.3, r * 0.35]), mat(snow));
    cap.position.y = h * 1.05;
    grp.add(cap);
  }
  return grp;
}

export function buildBackdrop(arenaId, mood, group, anim) {
  const rnd = seeded(arenaId.length * 13 + 5);
  if (arenaId === 'volcanic') {
    group.add(seaPlane('#a8604a', -0.6));
    // Volcano with lava streaks
    const volcano = mountain(70, 60, '#3a2a28', 3);
    volcano.position.set(-120, 0, -230);
    group.add(volcano);
    const crater = new THREE.Mesh(new THREE.CylinderGeometry(10, 16, 6, 12, 1, true), glow('#ff4a10', 2.5, { side: THREE.DoubleSide }));
    crater.position.set(-120, 74, -230);
    group.add(crater);
    for (let i = 0; i < 5; i++) {
      const streak = new THREE.Mesh(new THREE.BoxGeometry(2.4, 50, 1), glow('#ff5a10', 2));
      streak.position.set(-120 + (i - 2) * 9, 45, -200 + Math.abs(i - 2) * 3);
      streak.rotation.z = (i - 2) * 0.32;
      group.add(streak);
    }
    anim.push({ kind: 'smoke', x: -120, y: 80, z: -230 });
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 120 + rnd() * 150;
      const mtn = mountain(16 + rnd() * 34, 20 + rnd() * 24, i % 2 ? '#4a3430' : '#3a2826', 10 + i);
      mtn.position.set(Math.cos(a) * d, -1, Math.sin(a) * d);
      group.add(mtn);
    }
    // sea stacks
    for (let i = 0; i < 6; i++) {
      const s = mountain(8 + rnd() * 10, 4 + rnd() * 4, '#5a4038', 30 + i);
      s.position.set(60 + rnd() * 80, -1, 40 + rnd() * 120);
      group.add(s);
    }
  } else if (arenaId === 'stormsea') {
    group.add(seaPlane('#2c4c6a', -2));
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 70 + rnd() * 200;
      const t = buildTurbine(0.7 + rnd() * 0.5, '#e8ecf0');
      t.position.set(Math.cos(a) * d, -2, Math.sin(a) * d);
      t.rotation.y = rnd() * Math.PI;
      group.add(t);
      anim.push({ kind: 'spin', obj: t.userData.rotor, speed: 0.8 + rnd() * 1.2 });
    }
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 120 + rnd() * 160;
      const isl = mountain(8 + rnd() * 18, 20 + rnd() * 25, '#3a4a4a', 50 + i);
      isl.position.set(Math.cos(a) * d, -3, Math.sin(a) * d);
      group.add(isl);
    }
    // dark storm cloud discs
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(30 + rnd() * 30, 10, 6), new THREE.MeshStandardMaterial({ color: '#59647a', transparent: true, opacity: 0.55, roughness: 1, depthWrite: false }));
      const a = rnd() * Math.PI * 2;
      const d = 120 + rnd() * 200;
      c.position.set(Math.cos(a) * d, 70 + rnd() * 40, Math.sin(a) * d);
      c.scale.y = 0.35;
      group.add(c);
    }
  } else if (arenaId === 'harbor') {
    const sea = seaPlane('#1fa5c0', -0.25);
    group.add(sea);
    // Town: colourful houses on hills behind (negative z = land side)
    const hill = mountain(30, 120, '#6a8a4a', 70);
    hill.position.set(0, -6, -170);
    group.add(hill);
    const houseCols = ['#f0e0c8', '#e8c8a0', '#f4f0e8', '#e8b090', '#d8d0c0'];
    for (let i = 0; i < 70; i++) {
      const w = 4 + rnd() * 5;
      const h = 4 + rnd() * 8;
      const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), mat(houseCols[i % houseCols.length]));
      const x = (rnd() - 0.5) * 260;
      const z = -70 - rnd() * 90;
      house.position.set(x, h / 2 + Math.max(0, (-z - 70) * 0.2), z);
      group.add(house);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, 2.5, 4), mat('#c0603a'));
      roof.position.set(x, house.position.y + h / 2 + 1.2, z);
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
    }
    const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 26, 5), mat('#e8d8b8'));
    tower.position.set(-40, 13, -95);
    group.add(tower);
    for (let i = 0; i < 6; i++) {
      const cliff = mountain(20 + rnd() * 20, 30, '#7a7a5a', 80 + i);
      cliff.position.set((i < 3 ? -1 : 1) * (140 + rnd() * 60), -2, -40 + rnd() * 120);
      group.add(cliff);
    }
  } else if (arenaId === 'valley') {
    // Cliffs with waterfalls all around
    const waterMat = new THREE.MeshStandardMaterial({ color: '#d8f0ff', emissive: '#4080a0', emissiveIntensity: 0.3, transparent: true, opacity: 0.85, roughness: 0.2 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rnd() * 0.2;
      const d = 95 + rnd() * 40;
      const h = 40 + rnd() * 40;
      const cliff = mountain(h, 26 + rnd() * 14, i % 2 ? '#5a6a4a' : '#6a7050', 90 + i, null);
      cliff.position.set(Math.cos(a) * d, -2, Math.sin(a) * d);
      group.add(cliff);
      // trees on top
      for (let k = 0; k < 4; k++) {
        const tree = new THREE.Mesh(new THREE.ConeGeometry(4, 10, 6), mat('#3a6a2a'));
        tree.position.set(cliff.position.x + (rnd() - 0.5) * 20, h * 0.7 + 5, cliff.position.z + (rnd() - 0.5) * 20);
        group.add(tree);
      }
      if (i % 3 === 0) {
        const fall = new THREE.Mesh(new THREE.PlaneGeometry(6, h * 0.9), waterMat);
        fall.position.set(Math.cos(a) * (d - 22), h * 0.45, Math.sin(a) * (d - 22));
        fall.lookAt(0, h * 0.45, 0);
        group.add(fall);
        anim.push({ kind: 'mist', x: fall.position.x, y: 2, z: fall.position.z });
      }
    }
    // distant river water plane
    const river = new THREE.Mesh(new THREE.PlaneGeometry(400, 9), new THREE.MeshStandardMaterial({ color: mood.water, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 }));
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, 0.06, -1);
    group.add(river);
    anim.push({ kind: 'river', obj: river });
    // castle on a far hill
    const castle = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 10), mat('#c8c0b0'));
    castle.position.set(150, 30, 60);
    group.add(castle);
  } else if (arenaId === 'saltflats') {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rnd() * 0.3;
      const d = 200 + rnd() * 80;
      const m = mountain(18 + rnd() * 26, 40 + rnd() * 30, '#7a7aa0', 110 + i, '#e8eef8');
      m.position.set(Math.cos(a) * d, -2, Math.sin(a) * d);
      group.add(m);
    }
    // distant research vehicles
    for (let i = 0; i < 6; i++) {
      const t = buildTruck('#f4f4f4');
      const a = rnd() * Math.PI * 2;
      const d = 60 + rnd() * 60;
      t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      t.rotation.y = rnd() * 6;
      group.add(t);
    }
  }
}

/* ------------------------------------------------------------------------ */
/*  Props                                                                    */
/* ------------------------------------------------------------------------ */

export function buildTurbine(scale = 1, color = '#e8ecf0') {
  const g = new THREE.Group();
  const m = mat(color, { roughness: 0.5, flat: false });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * scale, 0.7 * scale, 22 * scale, 10), m);
  tower.position.y = 11 * scale;
  g.add(tower);
  const nac = new THREE.Mesh(new THREE.BoxGeometry(1.2 * scale, 1.2 * scale, 3 * scale), m);
  nac.position.set(0, 22 * scale, 0);
  g.add(nac);
  const rotor = new THREE.Group();
  rotor.position.set(0, 22 * scale, 1.6 * scale);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 10 * scale, 0.15 * scale), m);
    blade.position.y = 5 * scale;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    holder.add(blade);
    rotor.add(holder);
  }
  g.add(rotor);
  g.userData.rotor = rotor;
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export function buildTruck(color = '#f0f0f0') {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 4.2), mat(color, { roughness: 0.5 }));
  body.position.y = 1.4;
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.3, 1.4), mat('#3a4a5a', { roughness: 0.3 }));
  cab.position.set(0, 1.6, 2.6);
  g.add(cab);
  for (const [x, z] of [[1.1, 1.6], [-1.1, 1.6], [1.1, -1.4], [-1.1, -1.4]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10), mat('#222'));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.5, z);
    g.add(w);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/**
 * Destructible prop. Returns a Group with userData {height, color, tall}.
 * Visual scale is a bit bigger than the logic radius.
 */
export function buildProp(p, mood) {
  const g = new THREE.Group();
  let height = 6;
  let color = '#777';
  let tall = false;
  const r = Math.max(p.r, 1);
  switch (p.kind) {
    case 'basaltPillar': {
      color = '#3a2e2c';
      for (let i = 0; i < 5; i++) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.5, 7 + i * 1.5, 6), mat(i % 2 ? '#3a2e2c' : '#2e2422'));
        col.position.set(Math.cos(i * 1.3) * r * 0.5, (7 + i * 1.5) / 2, Math.sin(i * 1.3) * r * 0.5);
        g.add(col);
      }
      const lava = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, 0.15, 6, 16), glow(mood.groundCrack, 1.8));
      lava.rotation.x = Math.PI / 2;
      lava.position.y = 0.1;
      g.add(lava);
      height = 12;
      tall = true;
      break;
    }
    case 'rockArch':
    case 'rock':
    case 'boulder': {
      color = p.kind === 'boulder' ? '#7a7a6a' : '#4a3a34';
      const b = new THREE.Mesh(rockGeo(r * 1.1, 1, 0.25, p.id + 5, [1, 0.8, 1]), mat(color));
      b.position.y = r * 0.7;
      g.add(b);
      const b2 = new THREE.Mesh(rockGeo(r * 0.6, 0, 0.3, p.id + 9), mat(color));
      b2.position.set(r * 0.6, r * 1.4, 0.3);
      g.add(b2);
      if (p.kind === 'boulder') {
        const moss = new THREE.Mesh(rockGeo(r * 0.8, 1, 0.2, p.id + 3, [1.1, 0.3, 1.1]), mat('#4a7a2a'));
        moss.position.y = r * 1.3;
        g.add(moss);
      }
      height = r * 2;
      break;
    }
    case 'oldCrane': {
      color = '#8a5a2a';
      const m = mat('#a8642a', { roughness: 0.7 });
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.8, 14, 0.8), m);
      mast.position.y = 7;
      g.add(mast);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 10), m);
      arm.position.set(0, 13.5, 3.5);
      g.add(arm);
      const base = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3), mat('#444'));
      base.position.y = 0.5;
      g.add(base);
      height = 14;
      tall = true;
      break;
    }
    case 'turbine': {
      const t = buildTurbine(0.62);
      g.add(t);
      g.userData.rotor = t.userData.rotor;
      color = '#e8ecf0';
      height = 15;
      tall = true;
      break;
    }
    case 'boat': {
      color = '#c84a3a';
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 6), mat('#c84a3a'));
      hull.position.y = 0.6;
      g.add(hull);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 5.6), mat('#d8c8a8'));
      deck.position.y = 1.35;
      g.add(deck);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.8), mat('#f4f4f4'));
      cabin.position.set(0, 2.1, -0.8);
      g.add(cabin);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6), mat('#ddd'));
      mast.position.set(0, 4, 0.8);
      g.add(mast);
      g.rotation.y = p.id * 0.7;
      height = 4;
      break;
    }
    case 'pier': {
      color = '#8a6a4a';
      const deck = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 9), mat('#8a6a4a'));
      deck.position.y = 1.4;
      g.add(deck);
      for (let i = 0; i < 4; i++) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2), mat('#5a4a3a'));
        post.position.set(i % 2 ? 1.3 : -1.3, 0.6, -3.5 + Math.floor(i / 2) * 7);
        g.add(post);
      }
      height = 2;
      break;
    }
    case 'container': {
      color = p.id % 2 ? '#2a6aa8' : '#c8582a';
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 5.5), mat(color, { roughness: 0.6 }));
      box.position.y = 1.3;
      g.add(box);
      const box2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 5.5), mat(p.id % 2 ? '#d8a82a' : '#3a8a5a', { roughness: 0.6 }));
      box2.position.set(0, 3.9, 0.3);
      box2.rotation.y = 0.1;
      g.add(box2);
      g.rotation.y = p.id * 1.1;
      height = 5.2;
      break;
    }
    case 'lighthouse': {
      color = '#f0f0f0';
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 14, 12), mat('#f4f4f4', { flat: false }));
      t.position.y = 7;
      g.add(t);
      for (let i = 0; i < 3; i++) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(1.25 + (2 - i) * 0.17, 1.35 + (2 - i) * 0.17, 1.4, 12), mat('#d83a3a', { flat: false }));
        band.position.y = 2.5 + i * 4;
        g.add(band);
      }
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.6, 10), glow('#fff4c0', 1.5));
      lamp.position.y = 14.8;
      g.add(lamp);
      height = 16;
      tall = true;
      break;
    }
    case 'stoneBridge': {
      color = '#9a948a';
      const sm = mat('#a09a8a');
      for (let i = 0; i < 9; i++) {
        const a = (i / 8) * Math.PI;
        const blk = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 6), sm);
        blk.position.set(Math.cos(a) * -8, Math.sin(a) * 5 + 0.5, 0);
        blk.rotation.z = a - Math.PI / 2;
        g.add(blk);
      }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 6), sm);
      deck.position.y = 6;
      g.add(deck);
      g.rotation.y = Math.PI / 2;
      g.position.y = 0;
      height = 7;
      tall = false;
      break;
    }
    case 'truck': {
      const t = buildTruck(p.id % 2 ? '#f4f4f4' : '#e8e0c8');
      t.scale.setScalar(1.15);
      g.add(t);
      g.rotation.y = p.id * 1.3;
      color = '#f0f0f0';
      height = 3;
      break;
    }
    case 'trailer': {
      color = '#e8e8e8';
      const t = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 8), mat('#f0f0f0', { roughness: 0.5 }));
      t.position.y = 2;
      g.add(t);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.4, 8.05), mat('#3a7ac8'));
      stripe.position.y = 2.4;
      g.add(stripe);
      g.rotation.y = 0.4;
      height = 3.5;
      break;
    }
    case 'dish': {
      color = '#e8e8e8';
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 5, 8), mat('#d0d0d0'));
      base.position.y = 2.5;
      g.add(base);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), mat('#f4f4f4', { flat: false, side: THREE.DoubleSide }));
      dish.position.y = 6;
      dish.rotation.x = -Math.PI / 2.6;
      g.add(dish);
      const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3), mat('#999'));
      horn.position.set(0, 7.3, 1.6);
      horn.rotation.x = 0.9;
      g.add(horn);
      height = 9;
      tall = true;
      break;
    }
    default: {
      const b = new THREE.Mesh(rockGeo(r, 1, 0.2, p.id), mat('#777'));
      b.position.y = r;
      g.add(b);
    }
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  g.userData = { ...g.userData, height, color, tall };
  return g;
}
