/**
 * ARENA DATA
 * Layout (props, water areas), hazard timing/damage, and mood (sky, fog, light).
 * Positions are in game units; the arena is a circle of radius GLOBAL.arenaRadius (34).
 * Hazard times are in frames (60 = 1 second). Every hazard has a WARNING phase.
 */

export const ARENAS = {
  volcanic: {
    id: 'volcanic',
    name: 'VOLCANIC COAST',
    home: 'korvak',
    description: 'Cracked basalt above a burning sea. Lava vents erupt without mercy.',
    mood: {
      skyTop: '#3a1a2e', skyMid: '#e0784a', skyBottom: '#ffc88a',
      fog: '#c97a5a', fogNear: 40, fogFar: 170,
      sun: '#ffb070', sunIntensity: 2.6, sunDir: [-0.6, 0.45, -0.5],
      ambient: '#7a4a5a', ambientIntensity: 0.9,
      ground: '#3b2e2a', ground2: '#5a3a2a', groundCrack: '#ff5a10',
      water: '#c7704a', particles: 'embers',
    },
    water: [], // no refill water
    props: [
      { kind: 'basaltPillar', x: -20, z: 14, r: 2.2, hp: 160 },
      { kind: 'basaltPillar', x: 22, z: -12, r: 2.4, hp: 160 },
      { kind: 'basaltPillar', x: 8, z: 24, r: 1.8, hp: 120 },
      { kind: 'rockArch', x: -24, z: -16, r: 3, hp: 220 },
      { kind: 'oldCrane', x: 26, z: 16, r: 1.6, hp: 140 },
    ],
    hazard: {
      kind: 'lavaVents',
      label: 'LAVA VENTS',
      vents: [{ x: -10, z: -6 }, { x: 11, z: 7 }, { x: -4, z: 15 }, { x: 6, z: -16 }, { x: 18, z: -2 }],
      cycle: 420, warning: 100, erupt: 80, radius: 3.6, tickEvery: 10, tickDamage: 9, type: 'fire', launch: 7, firstDelay: 360,
      ventsPerCycle: 2,
    },
  },

  stormsea: {
    id: 'stormsea',
    name: 'STORMY SEA',
    home: 'velumora',
    description: 'A rocky platform among offshore wind turbines. Lightning hunts the marked ground.',
    mood: {
      skyTop: '#1d2a4a', skyMid: '#6b7fa8', skyBottom: '#c9d6e8',
      fog: '#7d8ca8', fogNear: 45, fogFar: 190,
      sun: '#dfe8ff', sunIntensity: 2.0, sunDir: [0.4, 0.6, -0.4],
      ambient: '#5a6a9a', ambientIntensity: 1.1,
      ground: '#4a5560', ground2: '#5f6b72', groundCrack: '#b48cff',
      water: '#2a4a6a', particles: 'rain',
    },
    water: [],
    props: [
      { kind: 'turbine', x: -26, z: 10, r: 1.2, hp: 130 },
      { kind: 'turbine', x: 24, z: 18, r: 1.2, hp: 130 },
      { kind: 'turbine', x: 20, z: -22, r: 1.2, hp: 130 },
      { kind: 'turbine', x: -18, z: -24, r: 1.2, hp: 130 },
      { kind: 'rock', x: 4, z: 27, r: 2.5, hp: 150 },
    ],
    hazard: {
      kind: 'storm',
      label: 'LIGHTNING & GUSTS',
      lightningEvery: 300, lightningWarning: 100, lightningRadius: 4.4, lightningDamage: 70, type: 'electric',
      gustEvery: 660, gustWarning: 80, gustDuration: 150, gustForce: 6.5, firstDelay: 300,
    },
  },

  harbor: {
    id: 'harbor',
    name: 'HARBOR SHORELINE',
    home: 'oruvex',
    description: 'An evacuated harbor town. Every so often, the tide comes roaring in.',
    mood: {
      skyTop: '#2a78c8', skyMid: '#7ab8e8', skyBottom: '#d8ecf8',
      fog: '#a8d0e8', fogNear: 60, fogFar: 220,
      sun: '#fff4e0', sunIntensity: 2.8, sunDir: [0.5, 0.75, 0.3],
      ambient: '#8ab8d8', ambientIntensity: 1.2,
      ground: '#c8b48a', ground2: '#a89a78', groundCrack: '#38d7ff',
      water: '#1fb5c8', particles: 'spray',
    },
    // Shallow water: the half of the arena with z > 6 (shoreline). Oruvex refills faster here.
    water: [{ kind: 'halfplane', axis: 'z', min: 6 }],
    props: [
      { kind: 'boat', x: -18, z: 22, r: 2.6, hp: 120 },
      { kind: 'boat', x: 14, z: 26, r: 2.6, hp: 120 },
      { kind: 'pier', x: 0, z: 26, r: 2.2, hp: 150 },
      { kind: 'container', x: -24, z: -14, r: 2.3, hp: 140 },
      { kind: 'container', x: 22, z: -18, r: 2.3, hp: 140 },
      { kind: 'lighthouse', x: 28, z: 8, r: 2.0, hp: 200 },
    ],
    hazard: {
      kind: 'tidalWave',
      label: 'TIDAL WAVE',
      every: 900, warning: 160, speed: 15, width: 4, damage: 40, push: 16, type: 'water', firstDelay: 600,
    },
  },

  valley: {
    id: 'valley',
    name: 'WATERFALL RIVER VALLEY',
    home: 'canopyx',
    description: 'A golden floodplain under roaring waterfalls. The river current never rests.',
    mood: {
      skyTop: '#3a88d8', skyMid: '#9ac8e8', skyBottom: '#f4e2b8',
      fog: '#c8d8c0', fogNear: 50, fogFar: 200,
      sun: '#ffe2a0', sunIntensity: 2.6, sunDir: [-0.4, 0.6, 0.5],
      ambient: '#7aa070', ambientIntensity: 1.1,
      ground: '#5a7a3a', ground2: '#7a8a4a', groundCrack: '#ffd36b',
      water: '#4aa0b8', particles: 'leaves',
    },
    // The river: a band across the arena (z between -5 and 3). Pushes fighters along +x.
    water: [{ kind: 'band', axis: 'z', min: -5, max: 3 }],
    props: [
      { kind: 'stoneBridge', x: 0, z: -1, r: 0, hp: 260, span: true }, // decorative arch over the river, breaks into chunks
      { kind: 'boulder', x: -20, z: 16, r: 2.4, hp: 150 },
      { kind: 'boulder', x: 18, z: 18, r: 2.0, hp: 130 },
      { kind: 'boulder', x: -16, z: -20, r: 2.2, hp: 140 },
      { kind: 'boulder', x: 22, z: -16, r: 2.6, hp: 160 },
    ],
    hazard: {
      kind: 'river',
      label: 'RIVER CURRENT',
      bandMin: -5, bandMax: 3, push: 3.2, surgeEvery: 600, surgeWarning: 90, surgeDuration: 180, surgePush: 7.5, firstDelay: 420,
    },
  },

  saltflats: {
    id: 'saltflats',
    name: 'SALT FLATS',
    home: 'prismor',
    description: 'A mirror-white plain with a research station. The salt crust cracks underfoot.',
    mood: {
      skyTop: '#1a5ac8', skyMid: '#6aa8f0', skyBottom: '#e8f0fa',
      fog: '#d0e0f0', fogNear: 70, fogFar: 260,
      sun: '#ffffff', sunIntensity: 3.0, sunDir: [0.3, 0.8, -0.3],
      ambient: '#a0b8e0', ambientIntensity: 1.3,
      ground: '#e8eef4', ground2: '#c8d4e0', groundCrack: '#7fe6ff',
      water: '#c8dcf0', particles: 'glitter',
    },
    water: [],
    props: [
      { kind: 'truck', x: -22, z: 18, r: 2.2, hp: 110 },
      { kind: 'truck', x: 20, z: 22, r: 2.2, hp: 110 },
      { kind: 'trailer', x: -26, z: -8, r: 2.6, hp: 130 },
      { kind: 'dish', x: 24, z: -16, r: 2.6, hp: 180 },
      { kind: 'truck', x: 4, z: -27, r: 2.2, hp: 110 },
    ],
    hazard: {
      kind: 'saltCrust',
      label: 'CRACKING SALT',
      patches: [{ x: -9, z: 4 }, { x: 10, z: -6 }, { x: 0, z: 14 }, { x: -6, z: -15 }, { x: 16, z: 9 }, { x: -17, z: -3 }],
      patchRadius: 3.6, crackAfter: 45, warning: 60, sinkDuration: 360, slowMult: 0.5, reform: 240,
    },
  },
};

export const ARENA_ORDER = ['volcanic', 'stormsea', 'harbor', 'valley', 'saltflats'];
