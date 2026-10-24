/**
 * MONSTER FIGHTS - BALANCE & MOVE DATA
 * =====================================
 * Every number that affects a fight lives in this file: health, speed,
 * damage, frame data, cooldowns, resources, type weaknesses, AI tuning and
 * difficulty. To rebalance the game, edit numbers here and nothing else.
 *
 * UNITS
 *   - Time is in FRAMES at 60 frames per second (60 = one second).
 *   - Distances are in metres-ish "game units". A monster is ~5 units tall,
 *     the arena is ~68 units across.
 *   - Speeds are units per second.
 *   - Damage multipliers: 1.0 = normal, 1.5 = takes 50% more, 0.5 = half.
 *
 * FRAME DATA (every attack)
 *   startup  = wind-up frames before the hit can connect (the "tell")
 *   active   = frames the attack can hit
 *   recovery = frames after the attack before you can act again
 *   hitstun  = frames the victim is stunned on hit (bigger than the next
 *              attack's startup = a true combo)
 *   blockstun= frames the blocker is stuck guarding
 *
 * DAMAGE TYPES: physical, fire, electric, water, root, energy, shockwave
 */

export const FPS = 60;

export const DAMAGE_TYPES = ['physical', 'fire', 'electric', 'water', 'root', 'energy', 'shockwave'];

/** Colours used for damage numbers / UI for each damage type. */
export const DAMAGE_TYPE_COLORS = {
  physical: '#e8e2d6',
  fire: '#ff7a1a',
  electric: '#b48cff',
  water: '#38d7ff',
  root: '#7ed957',
  energy: '#7fe6ff',
  shockwave: '#ffd36b',
};

/** Rules shared by every fighter. */
export const GLOBAL = {
  roundTimeSeconds: 99,
  roundsToWin: 2, // best of 3
  arenaRadius: 34,
  gravity: 32,

  // Special (signature) meter. 100 = full.
  meterMax: 100,
  meterPerDamageDealt: 0.085,
  meterPerDamageTaken: 0.06,

  // Combos: each extra hit in a combo deals less damage (stops infinite combos).
  comboDamageScaling: 0.09, // -9% per hit after the first
  comboMinScale: 0.45,
  comboHitstunDecay: 1.5, // frames removed from hitstun per combo hit
  chainStartupFactor: 0.6, // cancelled (chained) moves start up faster
  inputBufferFrames: 8, // press a button up to 8 frames early and it still counts

  // Type effectiveness popups
  superEffectiveAt: 1.3, // multiplier >= this shows "SUPER EFFECTIVE!"
  resistedAt: 0.7, // multiplier <= this shows "RESISTED!"

  // Blocking (everyone except Prismor, who uses its shield resource)
  blockChip: 0.18, // fraction of damage taken through a block
  blockArcDegrees: 170, // blocks only work against attacks from the front
  guardMax: 260, // blocked damage before the guard is crushed
  guardRegenPerSecond: 45,
  guardCrushStun: 48,

  // Hit-pause & knockdown
  heavyHitPause: 7,
  lightHitPause: 2,
  knockdownFrames: 46,
  getupFrames: 18, // invulnerable while standing up
  knockbackFriction: 7.5,

  // Velumora (or anyone) knocked out of the sky
  forcedLandingStun: 40,
};

/** Shadow boss modifiers (Story Tower final boss). */
export const SHADOW = {
  healthMult: 1.3,
  damageMult: 1.15,
  speedMult: 1.06,
  meterGainMult: 1.25,
};

/**
 * AI difficulty settings.
 *   reaction      frames before the AI notices what you are doing
 *   defense       chance to block/dodge an attack it has noticed
 *   comboSkill    chance to continue a combo after a hit
 *   punish        chance to punish a whiffed / blocked heavy attack
 *   aggression    0..1 how much it attacks vs. waits
 *   counterUse    how strongly it prefers super-effective attacks
 *   readPatterns  learns your habits and pre-empts them
 *   mistakes      chance per decision to do something sloppy
 */
export const DIFFICULTY = {
  easy: { label: 'EASY', reaction: 34, defense: 0.18, comboSkill: 0.25, punish: 0.15, aggression: 0.35, counterUse: 0.2, readPatterns: 0, mistakes: 0.3, decisionEvery: 22, useSignature: 0.4 },
  normal: { label: 'NORMAL', reaction: 20, defense: 0.45, comboSkill: 0.6, punish: 0.5, aggression: 0.55, counterUse: 0.6, readPatterns: 0.15, mistakes: 0.12, decisionEvery: 14, useSignature: 0.8 },
  hard: { label: 'HARD', reaction: 12, defense: 0.68, comboSkill: 0.85, punish: 0.8, aggression: 0.65, counterUse: 0.9, readPatterns: 0.55, mistakes: 0.04, decisionEvery: 9, useSignature: 1 },
  titan: { label: 'TITAN', reaction: 7, defense: 0.82, comboSkill: 0.97, punish: 0.95, aggression: 0.72, counterUse: 1, readPatterns: 0.85, mistakes: 0.01, decisionEvery: 6, useSignature: 1 },
};

/** Default dodge used by every monster unless overridden in its stats. */
const DODGE = { frames: 20, speed: 13, invulnStart: 2, invulnEnd: 14, cooldown: 42 };

/* ------------------------------------------------------------------------ */
/*  THE ROSTER                                                               */
/* ------------------------------------------------------------------------ */

export const MONSTERS = {
  /* ====================================================================== */
  korvak: {
    id: 'korvak',
    name: 'KORVAK',
    title: 'The Six-Limbed Volcanic Colossus',
    epithet: 'The Walking Volcano',
    role: 'Heavy close-range bruiser',
    color: '#ff7a1a',
    image: 'assets/korvak.jpg',
    homeArena: 'volcanic',
    taunts: ['The ground itself bows to me.', 'I am the mountain that walks.', 'Your armor melts. Mine does not.'],
    displayStats: { power: 5, speed: 1, defense: 5, range: 2 },
    strengths: ['Highest armor & close-range damage', 'Heavy charge cannot be interrupted', 'Ground Slam hits everything nearby'],
    weaknesses: ['Slow to move and turn', 'Water cools & cracks its armor', 'Shoulder vents exposed after big attacks'],

    stats: {
      health: 1210,
      armor: 0.8, // all incoming damage x0.8
      walkSpeed: 4.3,
      backSpeedMult: 0.75,
      strafeMult: 0.85,
      turnRate: 150, // degrees per second - slow!
      radius: 2.6,
      height: 4.6,
      weight: 0.55, // knockback taken multiplier
      jumpVelocity: 9.5,
      airControl: 0.5,
      dodge: { frames: 24, speed: 10, invulnStart: 3, invulnEnd: 15, cooldown: 50 },
    },

    // Damage taken multiplier by type (missing = 1.0)
    typeMultipliers: { water: 1.45, fire: 0.5, physical: 0.9, root: 0.85, shockwave: 0.8 },

    resource: {
      kind: 'armor',
      label: 'MAGMA ARMOR',
      color: '#ff8a2a',
      max: 100,
      waterDrainPerDamage: 0.95, // water damage removes this much armor per point
      regenPerSecond: 7,
      regenDelay: 90,
      cooledDuration: 240, // frames spent "Cooled" when armor hits 0
      cooledDamageMult: 1.3, // takes extra damage while Cooled
      cooledSpeedMult: 0.85,
    },

    weakSpot: { name: 'vents', label: 'VENT HIT!', mult: 1.3 },

    moves: {
      light: [
        { name: 'Claw Swipe', kind: 'melee', type: 'physical', damage: 42, startup: 11, active: 4, recovery: 16, range: 4.7, arc: 110, yReach: 6, hitstun: 27, blockstun: 14, knockback: 2.5, lunge: 3 },
        { name: 'Claw Swipe II', kind: 'melee', type: 'physical', damage: 46, startup: 10, active: 4, recovery: 18, range: 4.9, arc: 110, yReach: 6, hitstun: 29, blockstun: 14, knockback: 3, lunge: 3 },
        { name: 'Magma Claw', kind: 'melee', type: 'fire', damage: 60, startup: 13, active: 5, recovery: 24, range: 5.1, arc: 120, yReach: 6, hitstun: 34, blockstun: 16, knockback: 7, lunge: 4, heavyHit: true },
      ],
      heavy: {
        name: 'Armored Charge', kind: 'charge', type: 'physical', damage: 105, startup: 24, active: 30, recovery: 30,
        chargeSpeed: 15, range: 3.4, arc: 100, yReach: 5.5, hitstun: 40, blockstun: 22, knockback: 13, launch: 7,
        knockdown: true, superArmor: true, heavyHit: true, exposesWeakSpot: 150,
      },
      ability: {
        name: 'Ground Slam', kind: 'slam', type: 'shockwave', damage: 82, startup: 26, active: 4, recovery: 28,
        radius: 7.2, groundOnly: true, hitstun: 36, blockstun: 18, knockback: 7, launch: 6, knockdown: true,
        cooldown: 330, heavyHit: true,
      },
      signature: {
        name: 'Magma Quake', kind: 'quake', type: 'fire', damage: 62, startup: 40, active: 6, recovery: 46,
        rings: 3, ringInterval: 22, ringSpeed: 16, ringMaxRadius: 24, ringWidth: 1.7, groundOnly: true,
        hitstun: 32, blockstun: 16, knockback: 6, launch: 4, superArmor: true, heavyHit: true,
        meterCost: 100, exposesWeakSpot: 180,
        description: 'Slams the front limbs down: three expanding fire shockwaves. Jump them!',
      },
    },

    ai: { preferredRange: [2.5, 5.5], style: 'rushdown', jumpRings: 0.1, blockBias: 0.9, chargeFrom: [6, 14] },
  },

  /* ====================================================================== */
  velumora: {
    id: 'velumora',
    name: 'VELUMORA',
    title: 'Sail of the Storm',
    epithet: 'The Storm Hunter',
    role: 'Fast aerial attacker',
    color: '#a875ff',
    image: 'assets/velumora.jpg',
    homeArena: 'stormsea',
    taunts: ['Catch me if you can, groundling.', 'The storm answers only to me.', 'Look up. That is where your defeat comes from.'],
    displayStats: { power: 3, speed: 5, defense: 1, range: 4 },
    strengths: ['Fastest monster', 'Flies over shockwaves & roots', 'Ranged lightning bolts'],
    weaknesses: ['Lowest health, fragile wings', 'Strong water jets force it to land', 'Must land to recover flight stamina'],

    stats: {
      health: 830,
      armor: 1.0,
      walkSpeed: 7.0,
      backSpeedMult: 0.9,
      strafeMult: 1.0,
      flySpeed: 9.6,
      flyAltitude: 4.6,
      turnRate: 560,
      radius: 1.9,
      height: 2.6,
      weight: 1.15,
      jumpVelocity: 12,
      airControl: 1,
      dodge: { frames: 18, speed: 16, invulnStart: 2, invulnEnd: 13, cooldown: 38 },
    },

    typeMultipliers: { electric: 0.5, energy: 1.4, water: 1.15 },
    wingHitMult: 1.15, // extra damage taken while flying (wing membranes), non-electric hits

    resource: {
      kind: 'stamina',
      label: 'FLIGHT STAMINA',
      color: '#c9a2ff',
      max: 100,
      drainPerSecond: 12,
      refillPerSecond: 30,
      minToTakeOff: 25,
    },

    moves: {
      light: [
        { name: 'Wing Slash', kind: 'melee', type: 'electric', damage: 31, startup: 7, active: 4, recovery: 13, range: 4.9, arc: 130, yReach: 7, hitstun: 23, blockstun: 11, knockback: 2, lunge: 6 },
        { name: 'Wing Slash II', kind: 'melee', type: 'physical', damage: 33, startup: 7, active: 4, recovery: 14, range: 4.9, arc: 130, yReach: 7, hitstun: 25, blockstun: 11, knockback: 2.5, lunge: 6 },
        { name: 'Ribbon Lash', kind: 'melee', type: 'electric', damage: 44, startup: 10, active: 5, recovery: 20, range: 5.4, arc: 150, yReach: 7, hitstun: 30, blockstun: 14, knockback: 6, lunge: 5, heavyHit: true },
      ],
      heavy: {
        name: 'Dive Strike', kind: 'dive', type: 'electric', damage: 96, startup: 16, active: 40, recovery: 32, whiffRecovery: 44,
        diveSpeed: 27, range: 3.2, yReach: 6, hitstun: 38, blockstun: 20, knockback: 10, launch: 5, knockdown: true, heavyHit: true,
        description: 'From the air: dive onto the enemy. From the ground: leap up, then dive.',
      },
      ability: {
        name: 'Lightning Bolt', kind: 'projectile', type: 'electric', damage: 50, startup: 14, active: 1, recovery: 18,
        speed: 36, projRadius: 0.9, life: 60, hitstun: 24, blockstun: 12, knockback: 3, cooldown: 78, reflectable: true,
      },
      signature: {
        name: 'Thunder Vortex', kind: 'vortex', type: 'electric', damage: 150, startup: 24, active: 4, recovery: 30,
        duration: 150, vortexSpeed: 7, pullRadius: 10.5, pullStrength: 9.5, tickDamage: 4, tickEvery: 10,
        strikeRadius: 5, hitstun: 44, blockstun: 22, knockback: 9, launch: 8, knockdown: true, heavyHit: true, meterCost: 100,
        description: 'A moving cyclone that drags the enemy in, then a lightning strike. Dodge out of the pull!',
      },
    },

    ai: { preferredRange: [9, 16], style: 'kite', flyBias: 0.75 },
  },

  /* ====================================================================== */
  oruvex: {
    id: 'oruvex',
    name: 'ORUVEX',
    title: 'The Pearl Tidal Colossus',
    epithet: 'The Tidebreaker',
    role: 'Ranged fighter with water cannons',
    color: '#38e0d0',
    image: 'assets/oruvex.jpg',
    homeArena: 'harbor',
    taunts: ['The tide always wins.', 'Stand still. It hurts less.', 'I will wash you off this coast.'],
    displayStats: { power: 3, speed: 2, defense: 3, range: 5 },
    strengths: ['Longest sustained range', 'Water cannons push, stop charges & cool armor', 'Three-legged stance resists knockback'],
    weaknesses: ['Slow sideways movement', 'Pressure sacs weak to electricity', 'Empty water reserve = refill window'],

    stats: {
      health: 1060,
      armor: 0.95,
      walkSpeed: 4.8,
      backSpeedMult: 0.85,
      strafeMult: 0.45, // slow sideways
      turnRate: 220,
      radius: 2.4,
      height: 5.6,
      weight: 0.45, // resists knockback
      jumpVelocity: 10,
      airControl: 0.5,
      dodge: { frames: 22, speed: 11, invulnStart: 2, invulnEnd: 14, cooldown: 46 },
    },

    typeMultipliers: { electric: 1.5, water: 0.5, fire: 0.8 },

    resource: {
      kind: 'water',
      label: 'WATER RESERVE',
      color: '#3cd8ff',
      max: 100,
      refillPerSecond: 15,
      refillDelay: 40, // frames after firing before refilling starts
      emptyLockout: 160, // refill window when the reserve hits zero
      inWaterMult: 2.2, // standing in water refills faster
    },

    moves: {
      light: [
        { name: 'Siphon Whip', kind: 'melee', type: 'physical', damage: 34, startup: 10, active: 5, recovery: 16, range: 6.3, arc: 70, yReach: 8, hitstun: 25, blockstun: 12, knockback: 2.5, lunge: 2 },
        { name: 'Siphon Whip II', kind: 'melee', type: 'physical', damage: 36, startup: 10, active: 5, recovery: 17, range: 6.3, arc: 70, yReach: 8, hitstun: 27, blockstun: 12, knockback: 3, lunge: 2 },
        { name: 'Tide Lash', kind: 'melee', type: 'water', damage: 47, startup: 12, active: 5, recovery: 22, range: 6.6, arc: 80, yReach: 8, hitstun: 32, blockstun: 15, knockback: 6, lunge: 2, heavyHit: true },
      ],
      heavy: {
        name: 'Pressure Blast', kind: 'melee', type: 'water', damage: 86, startup: 20, active: 6, recovery: 28,
        range: 8.8, arc: 60, yReach: 9, hitstun: 38, blockstun: 22, knockback: 16, launch: 4, knockdown: true,
        breaksArmor: true, forceLand: true, heavyHit: true, resourceCost: 20,
        description: 'Huge knockback. Interrupts armored charges and knocks flyers out of the sky.',
      },
      ability: {
        name: 'Water Cannon', kind: 'stream', type: 'water', damage: 11, startup: 12, active: 80, recovery: 18,
        range: 19, beamWidth: 1.4, tickEvery: 8, costPerTick: 4, push: 5, hitstun: 13, blockstun: 10,
        forceLandAfterTicks: 3, cooldown: 40, resourceCost: 8,
        description: 'Hold-style stream. Drains the water reserve. Three hits knock a flyer down.',
      },
      signature: {
        name: 'Tidal Siege', kind: 'siege', type: 'water', damage: 12, startup: 26, active: 140, recovery: 30,
        range: 24, beamWidth: 2.2, spreadDegrees: 9, tickEvery: 6, push: 8, hitstun: 12, blockstun: 9,
        forceLand: true, anchored: true, superArmor: true, meterCost: 100,
        description: 'Anchors all three feet and fires two huge streams. Cannot move while firing.',
      },
    },

    ai: { preferredRange: [8, 15], style: 'zoner' },
  },

  /* ====================================================================== */
  canopyx: {
    id: 'canopyx',
    name: 'CANOPYX',
    title: 'Guardian of the Golden Floodplain',
    epithet: 'The Living Fortress',
    role: 'Defender with roots and regeneration',
    color: '#8fd14f',
    image: 'assets/canopyx.jpg',
    homeArena: 'valley',
    taunts: ['The forest is patient. So am I.', 'Every root is a chain.', 'I grow back. You will not.'],
    displayStats: { power: 3, speed: 2, defense: 4, range: 4 },
    strengths: ['Roots grab & immobilize', 'Grows wooden barriers', 'Regenerates when not hit'],
    weaknesses: ['Fire burns barriers & stops healing', 'Root attacks have a visible wind-up', 'Multi-root attacks expose the golden core'],

    stats: {
      health: 1130,
      armor: 0.9,
      walkSpeed: 4.6,
      backSpeedMult: 0.8,
      strafeMult: 0.8,
      turnRate: 230,
      radius: 2.6,
      height: 5.3,
      weight: 0.7,
      jumpVelocity: 10,
      airControl: 0.55,
      dodge: { frames: 22, speed: 11, invulnStart: 2, invulnEnd: 14, cooldown: 46 },
    },

    typeMultipliers: { fire: 1.5, water: 0.6, root: 0.5, physical: 0.95 },

    resource: {
      kind: 'regen',
      label: 'REGENERATION',
      color: '#7ed957',
      max: 100,
      delayFrames: 190, // frames without taking damage before healing starts
      healPerSecond: 13,
      firePause: 300, // fire stops regeneration this long
    },

    weakSpot: { name: 'core', label: 'CORE HIT!', mult: 1.3 },

    moves: {
      light: [
        { name: 'Root Lash', kind: 'melee', type: 'root', damage: 36, startup: 10, active: 4, recovery: 16, range: 5.7, arc: 90, yReach: 7, hitstun: 25, blockstun: 12, knockback: 2.5, lunge: 2 },
        { name: 'Root Lash II', kind: 'melee', type: 'root', damage: 38, startup: 10, active: 4, recovery: 17, range: 5.7, arc: 90, yReach: 7, hitstun: 27, blockstun: 12, knockback: 3, lunge: 2 },
        { name: 'Trunk Club', kind: 'melee', type: 'physical', damage: 52, startup: 13, active: 5, recovery: 22, range: 5.2, arc: 110, yReach: 7, hitstun: 32, blockstun: 15, knockback: 7, lunge: 3, heavyHit: true },
      ],
      heavy: {
        name: 'Root Grab', kind: 'grab', type: 'root', damage: 64, startup: 30, active: 22, recovery: 28, whiffRecovery: 40,
        travelSpeed: 34, range: 13.5, tipRadius: 1.8, rootFrames: 80, hitstun: 30, unblockable: true, groundOnly: true,
        exposesWeakSpot: true, heavyHit: true,
        description: 'Slow, glowing wind-up, then roots race along the ground and immobilize. Cannot be blocked - jump or dodge it!',
      },
      ability: {
        name: 'Wooden Barrier', kind: 'barrier', type: 'root', damage: 0, startup: 18, active: 2, recovery: 16,
        barrierHp: 230, barrierLife: 420, barrierDistance: 3.6, barrierWidth: 6.5, fireDamageMult: 3, cooldown: 480,
        description: 'Grows a wall that stops attacks and projectiles. Fire burns it down fast.',
      },
      signature: {
        name: 'Forest Lock', kind: 'forestlock', type: 'root', damage: 112, startup: 20, active: 6, recovery: 30,
        warning: 38, radius: 6.8, rootFrames: 140, hitstun: 30, groundOnly: true, unblockable: true,
        exposesWeakSpot: true, heavyHit: true, meterCost: 100,
        description: 'Roots erupt under the enemy after a warning, trapping grounded foes.',
      },
    },

    ai: { preferredRange: [5, 11], style: 'trapper' },
  },

  /* ====================================================================== */
  prismor: {
    id: 'prismor',
    name: 'PRISMOR',
    title: 'Three-Armed Crystal Colossus',
    epithet: 'The Mirror Gladiator',
    role: 'Agile melee fighter and trickster',
    color: '#5aa8ff',
    image: 'assets/prismor.jpg',
    homeArena: 'saltflats',
    taunts: ['Every strike you throw, I return.', 'Which of me is real?', 'Shine brighter... and break.'],
    displayStats: { power: 4, speed: 4, defense: 3, range: 2 },
    strengths: ['Quick dodges & strong combos', 'Perfect block reflects energy & lightning', 'Decoy illusion'],
    weaknesses: ['Shield is front-only and uses energy', 'Cannot reflect physical, roots, shockwaves, water', 'Missed haymakers leave it exposed'],

    stats: {
      health: 975,
      armor: 1.0,
      walkSpeed: 6.1,
      backSpeedMult: 0.85,
      strafeMult: 1.0,
      turnRate: 420,
      radius: 2.1,
      height: 5.0,
      weight: 0.95,
      jumpVelocity: 12,
      airControl: 0.8,
      dodge: { frames: 17, speed: 16, invulnStart: 1, invulnEnd: 13, cooldown: 30 },
    },

    typeMultipliers: { root: 1.45, energy: 0.55, electric: 0.8, shockwave: 1.1 },

    resource: {
      kind: 'shield',
      label: 'SHIELD ENERGY',
      color: '#7fe6ff',
      max: 100,
      drainPerSecondHeld: 16,
      drainPerBlockedDamage: 0.55,
      regenPerSecond: 20,
      regenDelay: 40,
      breakStun: 60, // stagger when the shield runs dry
      perfectWindow: 9, // frames after raising the shield that count as a PERFECT block
      reflectDamageMult: 1.5, // reflected projectiles hit this much harder (and become ENERGY)
      shieldArcDegrees: 140, // front-only
      reflectableTypes: ['energy', 'electric'],
    },

    moves: {
      light: [
        { name: 'Crystal Jab', kind: 'melee', type: 'energy', damage: 26, startup: 5, active: 3, recovery: 10, range: 4.5, arc: 100, yReach: 7, hitstun: 20, blockstun: 10, knockback: 1.5, lunge: 5 },
        { name: 'Crystal Cross', kind: 'melee', type: 'physical', damage: 29, startup: 5, active: 3, recovery: 11, range: 4.5, arc: 100, yReach: 7, hitstun: 22, blockstun: 10, knockback: 2, lunge: 5 },
        { name: 'Prism Uppercut', kind: 'melee', type: 'energy', damage: 42, startup: 8, active: 4, recovery: 18, range: 4.7, arc: 110, yReach: 8, hitstun: 30, blockstun: 13, knockback: 5, launch: 3, lunge: 5, heavyHit: true },
      ],
      heavy: {
        name: 'Crystal Haymaker', kind: 'melee', type: 'physical', damage: 118, startup: 20, active: 5, recovery: 22, whiffRecovery: 54,
        range: 5.3, arc: 90, yReach: 7, hitstun: 42, blockstun: 22, knockback: 13, launch: 5, knockdown: true, lunge: 9, heavyHit: true,
        description: 'Massive punch. If it misses, Prismor is left wide open.',
      },
      ability: {
        name: 'Decoy', kind: 'decoy', type: 'energy', damage: 0, startup: 6, active: 1, recovery: 10,
        decoyLife: 200, sidestep: 6.5, cooldown: 420,
        description: 'Leaves a crystal illusion that draws attacks and enemy targeting while Prismor slips aside.',
      },
      signature: {
        name: 'Prism Reversal', kind: 'parry', type: 'energy', damage: 80, startup: 4, active: 75, recovery: 20,
        chargedPunchMult: 1.9, counterHitstun: 40, knockback: 12, launch: 6, knockdown: true, heavyHit: true, meterCost: 100,
        description: 'Raise the prism shield: reflects energy & lightning, counter-punches melee. Success powers up the next punch.',
      },
    },

    ai: { preferredRange: [3, 6], style: 'counter' },
  },
};

export const MONSTER_ORDER = ['korvak', 'velumora', 'oruvex', 'canopyx', 'prismor'];

/** Favorable matchups from the guide (attacker -> favored opponent). */
export const FAVORABLE = {
  korvak: { vs: 'canopyx', reason: 'Heat burns its defenses and interrupts healing.' },
  velumora: { vs: 'oruvex', reason: 'Electricity exploits its exposed pressure sacs.' },
  oruvex: { vs: 'korvak', reason: 'Water weakens its armor and stops its charges.' },
  canopyx: { vs: 'prismor', reason: 'Roots bypass its reflective shield and restrict dodging.' },
  prismor: { vs: 'velumora', reason: 'Well-timed blocks send lightning back at the flyer.' },
};

export function getDodge(def) {
  return def.stats.dodge || DODGE;
}
