// Fighter: the pure-data state of one monster during a battle.
// All behaviour (moves, hits, physics) is driven by Battle in battle.js.

import { MONSTERS, GLOBAL, SHADOW, getDodge } from '../data/monsters.js';

export const BUTTONS = ['jump', 'light', 'heavy', 'ability', 'signature', 'block'];

/** An empty input frame. mx/mz = desired world-space movement (-1..1). */
export function emptyInput() {
  return { mx: 0, mz: 0, jump: false, light: false, heavy: false, ability: false, signature: false, block: false };
}

export class Fighter {
  /**
   * @param {string} monsterId key in MONSTERS
   * @param {number} index 0 = player 1 side, 1 = player 2 side
   * @param {object} opts { shadow: bool, skin: string }
   */
  constructor(monsterId, index, opts = {}) {
    this.id = monsterId;
    this.def = MONSTERS[monsterId];
    if (!this.def) throw new Error('Unknown monster ' + monsterId);
    this.index = index;
    this.shadow = !!opts.shadow;
    this.skin = opts.skin || 'default';
    const s = this.shadow ? SHADOW : null;
    this.hpMult = s ? s.healthMult : 1;
    this.dmgMult = s ? s.damageMult : 1;
    this.speedMult = s ? s.speedMult : 1;
    this.meterMult = s ? s.meterGainMult : 1;
    if (opts.handicap) {
      this.hpMult *= opts.handicap.hp || 1;
      this.dmgMult *= opts.handicap.damage || 1;
    }
    this.maxHp = Math.round(this.def.stats.health * this.hpMult);
    this.radius = this.def.stats.radius;
    this.height = this.def.stats.height;
    this.dodgeDef = getDodge(this.def);
    // Lifetime stats for achievements / results
    this.record = { hitsLanded: 0, damageDealt: 0, blocks: 0, reflects: 0, reflectedBolts: 0, dodges: 0, maxCombo: 0, superEffective: 0, blockUsed: false, signatures: 0 };
    this.resetRound(0, 0, 0);
  }

  resetRound(x, z, yaw) {
    this.pos = { x, y: 0, z };
    this.walkVel = { x: 0, z: 0 }; // velocity from walking (this frame)
    this.kv = { x: 0, z: 0 }; // knockback / external velocity (decays)
    this.vy = 0;
    this.yaw = yaw;
    this.hp = this.maxHp;
    this.meter = 0;
    this.state = 'neutral';
    this.stateTimer = 0;
    this.flying = false;
    this.invuln = 0;
    this.move = null;
    this.moveKey = null;
    this.chain = 0;
    this.phase = null;
    this.pf = 0;
    this.startupLen = 0;
    this.activeLen = 0;
    this.recovLen = 0;
    this.moveContact = false;
    this.moveHit = false;
    this.hitIds = new Set();
    this.cooldowns = { ability: 0, heavy: 0, dodge: 0 };
    this.buf = { light: 0, heavy: 0, ability: 0, signature: 0, jump: 0 };
    this.prevHeld = { jump: false, light: false, heavy: false, ability: false, signature: false, block: false };
    this.prevMove = { x: 0, z: 0 };
    this.input = null;
    this.comboTaken = 0; // hits taken in the current combo against me
    this.rootedTimer = 0;
    this.weakSpotTimer = 0;
    this.coreExposed = false;
    this.guard = GLOBAL.guardMax;
    this.perfectTimer = 0;
    this.prismCharge = false;
    this.streamTicks = 0;
    this.streamTickTimer = 0;
    this.dodgeDir = { x: 0, z: 0 };
    this.slowTimer = 0;
    this.lastHitFrame = -999;
    this.inWater = false;
    this.diveDir = null;
    this.decoyActive = false;
    this.stepPhase = 0;

    // Resource state
    const r = this.def.resource;
    this.res = r.max;
    this.resTimer = 0; // generic timer (regen delay / since fire)
    this.cooledTimer = 0; // korvak
    this.waterLockout = 0; // oruvex
    this.firePause = 0; // canopyx
    this.sinceDamage = 0; // canopyx regen
    this.healing = false;
    this.shieldBroken = 0; // prismor
  }

  get grounded() {
    return !this.flying && this.pos.y <= 0.001;
  }

  get airborne() {
    return this.flying || this.pos.y > 0.4;
  }

  /** Can this fighter start a new action this frame? */
  get actionable() {
    return this.state === 'neutral' || this.state === 'block';
  }

  get isKO() {
    return this.state === 'ko';
  }

  get forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  /** Damage taken multiplier for a damage type. */
  typeMult(type) {
    const m = this.def.typeMultipliers[type];
    return m === undefined ? 1 : m;
  }

  /** Is the fighter currently guarding (normal block or block stun)? */
  get guarding() {
    return this.state === 'block' || this.state === 'blockstun';
  }

  /** Is this fighter's current move giving super armor right now? */
  get hasSuperArmor() {
    if (this.state !== 'attack' || !this.move || !this.move.superArmor) return false;
    if (this.phase === 'recovery') return false;
    if (this.cooledTimer > 0) return false; // cracked armor - no super armor
    return true;
  }

  /** Normalised resource value (0..1) for HUD. */
  get resourceFraction() {
    return Math.max(0, Math.min(1, this.res / this.def.resource.max));
  }
}
