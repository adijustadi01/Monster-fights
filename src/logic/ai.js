// AI opponent. Produces the same input frames a human would (held buttons +
// a world-space move vector), so it can't cheat with direct state changes.
//
// It sees the opponent through a REACTION DELAY (difficulty-based), reacts to
// attack wind-ups (block / jump shockwaves / dodge roots), punishes whiffs,
// continues combos, prefers super-effective attacks, and on Hard/Titan learns
// the opponent's habits. Each monster has its own play style (data/monsters.js -> ai).

import { DIFFICULTY, GLOBAL } from '../data/monsters.js';
import { emptyInput } from './fighter.js';
import { makeRng, wrapAngle } from './math.js';

const GROUND_ONLY_KINDS = new Set(['slam', 'quake', 'grab', 'forestlock']);

export class AIController {
  constructor(battle, index, difficulty = 'normal', seed = 7) {
    this.b = battle;
    this.i = index;
    this.setDifficulty(difficulty);
    this.rng = makeRng(seed * 31 + index * 7 + 3);
    this.held = { light: 0, heavy: 0, ability: 0, signature: 0, jump: 0, block: 0 };
    this.prev = emptyInput();
    this.history = [];
    this.moveMode = 'approach';
    this.modeTimer = 0;
    this.strafeDir = 1;
    this.nextDecision = 0;
    this.reactedTo = -1;
    this.blockFor = 0;
    this.dodgeWant = null;
    this.jumpWant = 0;
    this.comboPlan = null;
    this.habits = { closeAttack: 0, rangedAttack: 0, jumps: 0, wakeupAttack: 0, total: 0, lastKind: {} };
    this.lastOppMoveStart = -1;
    this.waitPress = null;
    this.nextGuardCheck = 0;
    this.lastBlockFrame = -999;
    this.lastOwnMove = -1;
  }

  setDifficulty(d) {
    this.diffName = d;
    this.d = DIFFICULTY[d] || DIFFICULTY.normal;
  }

  get me() {
    return this.b.fighters[this.i];
  }

  get opp() {
    return this.b.fighters[1 - this.i];
  }

  chance(p) {
    return this.rng() < p;
  }

  /** Snapshot what the opponent is doing (to read later, with delay). */
  snapshot() {
    const o = this.opp;
    this.history.push({
      frame: this.b.frame,
      state: o.state,
      kind: o.move ? o.move.kind : null,
      key: o.moveKey,
      phase: o.phase,
      pf: o.pf,
      startupLen: o.startupLen,
      moveId: o.state === 'attack' ? o.moveStartFrame : -1,
      x: o.pos.x, y: o.pos.y, z: o.pos.z,
      flying: o.flying, airborne: o.airborne,
      whiff: o.state === 'attack' && o.phase === 'recovery' && !o.moveHit,
    });
    if (this.history.length > 80) this.history.shift();
  }

  perceived() {
    const idx = Math.max(0, this.history.length - 1 - this.d.reaction);
    return this.history[idx];
  }

  /* ------------------------------------------------------------------ */

  getInput() {
    const me = this.me;
    const opp = this.opp;
    const out = emptyInput();
    this.snapshot();
    this.learn(opp);
    if (me.state === 'blockstun') this.lastBlockFrame = this.b.frame;

    if (this.b.phase !== 'fight' || me.state === 'ko') return this.finish(out);

    const p = this.perceived();
    const dx = p.x - me.pos.x;
    const dz = p.z - me.pos.z;
    const dist = Math.hypot(dx, dz);
    const realDist = Math.hypot(opp.pos.x - me.pos.x, opp.pos.z - me.pos.z);

    // ---------- 1. Combo continuation ----------
    if (me.state === 'attack') {
      this.continueCombo(me, realDist);
      // While in a stream, keep facing (handled by logic). Nothing else to do.
      this.applyMovement(out, me, dx, dz, dist, true);
      return this.finish(out);
    }

    // ---------- 2. Defence: react to perceived wind-ups ----------
    if (me.state === 'blockstun' && this.blockFor < 6) this.blockFor = 6;
    if (this.blockFor > 0) {
      this.blockFor--;
      out.block = true;
      this.held.block = 2;
      if (me.def.resource.kind === 'shield' && me.res < 15) this.blockFor = 0;
      if (this.blockFor > 0 && me.state !== 'blockstun') {
        // keep blocking, but bail if the threat is gone
        if (opp.state !== 'attack' && opp.state !== 'neutral' && opp.state !== 'block' && this.b.projectiles.length === 0) this.blockFor = 0;
      }
      return this.finish(out);
    }
    if (this.dodgeWant) {
      out.block = true;
      out.mx = this.dodgeWant.x;
      out.mz = this.dodgeWant.z;
      this.dodgeWant = null;
      this.held.block = 0;
      return this.finish(out, true);
    }

    if (me.actionable) {
      const reacted = this.reactToThreat(me, opp, p, dist);
      if (reacted) return this.finish(out);
      // Incoming projectiles
      if (this.reactToProjectiles(me)) return this.finish(out);
    }

    // ---------- 2b. Anticipation: guard when the enemy is in striking range ----------
    if (me.actionable && this.b.frame >= this.nextGuardCheck) {
      this.nextGuardCheck = this.b.frame + 10;
      const oppReach = opp.def.moves.light[0].range + me.radius + 1.5;
      const threatClose = realDist < oppReach && opp.state !== 'knockdown' && opp.state !== 'hitstun';
      if (threatClose && this.chance(this.d.defense * 0.35 * (me.def.ai.blockBias || 1))) {
        this.blockFor = 14 + Math.floor(this.rng() * 22);
        out.block = true;
        return this.finish(out);
      }
    }
    // Punish right after blocking something unsafe
    if (me.actionable && opp.state === 'attack' && opp.phase === 'recovery' && this.lastBlockFrame > this.b.frame - 30 && realDist < 8 && this.chance(this.d.punish)) {
      if (this.tryAttack(me, opp, realDist, true)) return this.finish(out);
    }

    // ---------- 3. Punish whiffs / unsafe moves ----------
    if (me.actionable && p.state === 'attack' && p.phase === 'recovery' && this.chance(this.d.punish * 0.25)) {
      if (this.tryAttack(me, opp, realDist, true)) return this.finish(out);
    }
    // Wake-up pressure / don't attack invulnerable opponents
    const oppInvuln = opp.state === 'knockdown' || opp.state === 'getup' || opp.invuln > 0;

    // ---------- 4. Neutral decisions ----------
    if (this.b.frame >= this.nextDecision && me.actionable) {
      this.nextDecision = this.b.frame + this.d.decisionEvery + Math.floor(this.rng() * 6);
      this.chooseMode(me, opp, dist);
      if (!oppInvuln && this.chance(this.d.aggression)) this.tryAttack(me, opp, realDist, false);
      this.flightLogic(me, opp, dist);
    }

    this.applyMovement(out, me, dx, dz, dist, false);
    return this.finish(out);
  }

  /** Learn the opponent's habits (Hard/Titan use this to pre-empt). */
  learn(opp) {
    if (opp.state === 'attack' && opp.pf === 1 && opp.phase === 'startup') {
      const d = Math.hypot(opp.pos.x - this.me.pos.x, opp.pos.z - this.me.pos.z);
      this.habits.total++;
      if (d < 7) this.habits.closeAttack++;
      else this.habits.rangedAttack++;
      this.habits.lastKind[opp.move.kind] = (this.habits.lastKind[opp.move.kind] || 0) + 1;
    }
  }

  /** React (once per enemy move) to a perceived attack wind-up. */
  reactToThreat(me, opp, p, dist) {
    if (p.state !== 'attack' || p.phase !== 'startup') return false;
    if (p.moveId === this.reactedTo) return false;
    this.reactedTo = p.moveId;
    if (!opp.move) return false;
    const m = opp.move;
    const kind = m.kind;
    // Is it a threat at this distance?
    let threat = false;
    if (kind === 'melee' || kind === 'charge' || kind === 'dive') threat = dist < (m.range || 5) + 4 + (kind === 'charge' ? 14 : 0) + (kind === 'dive' ? 12 : 0);
    else if (kind === 'slam') threat = dist < m.radius + 3;
    else if (kind === 'quake') threat = dist < m.ringMaxRadius;
    else if (kind === 'grab') threat = dist < m.range + 2;
    else if (kind === 'forestlock' || kind === 'vortex' || kind === 'stream' || kind === 'siege' || kind === 'projectile') threat = true;
    if (!threat) return false;

    // Pattern reading improves defence against habits
    const habitBoost = this.d.readPatterns * Math.min(0.25, (this.habits.lastKind[kind] || 0) / Math.max(4, this.habits.total));
    if (!this.chance(this.d.defense + habitBoost)) return false;

    const away = this.dirAway(me, opp);
    const side = { x: -away.z * this.strafeDir, z: away.x * this.strafeDir };

    if (GROUND_ONLY_KINDS.has(kind)) {
      if (me.def.resource.kind === 'stamina' && !me.flying && me.res > 25) {
        this.press('jump');
        return true;
      }
      if (kind === 'quake' || kind === 'slam') {
        // Jump the shockwave at the right moment
        if (kind === 'quake' || dist < m.radius + 1) {
          this.scheduleJump(kind === 'quake' ? Math.max(0, (dist - 2) / m.ringSpeed * 60 + (opp.startupLen - opp.pf) - 14) : opp.startupLen - opp.pf - 8);
          return true;
        }
      }
      // roots: dodge sideways
      this.dodgeWant = kind === 'grab' ? side : away;
      if (kind === 'forestlock') this.dodgeWant = { x: side.x * 0.6 + away.x * 0.4, z: side.z * 0.6 + away.z * 0.4 };
      return true;
    }
    // Canopyx: grow a barrier against charges, projectiles and water streams
    if (me.def.moves.ability.kind === 'barrier' && me.cooldowns.ability <= 0 && (kind === 'charge' || kind === 'projectile' || kind === 'stream' || kind === 'siege') && dist > 6 && this.chance(this.d.counterUse)) {
      this.press('ability');
      return true;
    }
    if (kind === 'vortex') {
      this.dodgeWant = away;
      return true;
    }
    if (kind === 'dive' && this.chance(0.7)) {
      this.dodgeWant = side;
      return true;
    }
    if (kind === 'charge' && this.chance(0.6)) {
      this.dodgeWant = side;
      return true;
    }
    if (m.whiffRecovery && this.chance(0.5)) {
      // Dodge a slow haymaker to punish it
      this.dodgeWant = side;
      return true;
    }
    if (kind === 'projectile') return false; // handled by projectile tracking
    // Block it (Prismor: shield; time for perfect block on Hard+)
    this.blockFor = (opp.startupLen - opp.pf) + (m.active || 4) + 8;
    if (kind === 'stream' || kind === 'siege') {
      // Shield won't last forever vs a stream: sidestep instead sometimes
      if (me.def.resource.kind === 'shield' || this.chance(0.5)) {
        this.blockFor = 0;
        this.dodgeWant = side;
        this.moveMode = 'strafe';
        this.modeTimer = 40;
        return true;
      }
      this.blockFor = 30;
    }
    return true;
  }

  reactToProjectiles(me) {
    for (const pr of this.b.projectiles) {
      if (pr.owner === me) continue;
      const dx = me.pos.x - pr.x;
      const dz = me.pos.z - pr.z;
      const d = Math.hypot(dx, dz);
      // approaching?
      const closing = -(dx * pr.vx + dz * pr.vz) / (d || 1) < 0;
      const speed = Math.hypot(pr.vx, pr.vz);
      const framesToHit = (d / Math.max(1, speed)) * 60;
      if (closing) continue;
      if (pr.aiSeen === this.i) continue;
      // can only notice after reaction delay of travel
      if (framesToHit > 40) continue;
      pr.aiSeen = this.i;
      if (!this.chance(this.d.defense)) return false;
      const res = me.def.resource;
      if (res.kind === 'shield' && (res.reflectableTypes || []).includes(pr.spec.type)) {
        // Perfect block: raise the shield just before impact
        const meterFull = me.meter >= GLOBAL.meterMax;
        if (meterFull && this.chance(0.5)) {
          this.press('signature');
          return true;
        }
        const perfectSkill = { easy: 0.15, normal: 0.45, hard: 0.75, titan: 0.92 }[this.diffName] || 0.4;
        if (this.chance(perfectSkill)) {
          this.waitPress = { at: this.b.frame + Math.max(0, Math.floor(framesToHit - 6)), what: 'block', hold: 14 };
          return true;
        }
      }
      if (this.chance(0.5)) {
        const away = this.dirAway(me, this.opp);
        this.dodgeWant = { x: -away.z * this.strafeDir, z: away.x * this.strafeDir };
      } else this.blockFor = Math.ceil(framesToHit) + 6;
      return true;
    }
    return false;
  }

  scheduleJump(delayFrames) {
    this.waitPress = { at: this.b.frame + Math.max(0, Math.floor(delayFrames)), what: 'jump', hold: 3 };
  }

  continueCombo(me, dist) {
    if (me.moveStartFrame !== this.lastOwnMove) {
      // a new move (possibly a chained one) has started: plan again
      this.lastOwnMove = me.moveStartFrame;
      this.comboPlan = null;
    }
    if (!me.moveContact || this.comboPlan === 'done') return;
    const m = me.move;
    if (me.moveKey === 'light') {
      if (this.comboPlan === null) {
        // decide once per combo step
        if (!this.chance(this.d.comboSkill)) {
          this.comboPlan = 'done';
          return;
        }
        const last = me.chain >= me.def.moves.light.length - 1;
        const canAbility = me.cooldowns.ability <= 0 && this.abilityUsefulInCombo(me);
        if (me.chain >= 1 && me.cooldowns.heavy <= 0 && this.chance(0.45)) this.comboPlan = 'heavy';
        else if (last && canAbility && this.chance(this.d.comboSkill * 0.6)) this.comboPlan = 'ability';
        else if (!last) this.comboPlan = 'light';
        else this.comboPlan = canAbility ? 'ability' : 'done';
        // timing: press a few frames after the hit (inside the window)
        this.comboAt = this.b.frame + 2 + Math.floor(this.rng() * (this.diffName === 'easy' ? 14 : 6));
      }
      if (this.comboPlan !== 'done' && this.b.frame >= this.comboAt) {
        this.press(this.comboPlan);
        this.comboPlan = 'done';
      }
    } else if (me.moveKey === 'heavy' && me.moveHit && this.comboPlan === null) {
      this.comboPlan = 'done';
      if (me.meter >= GLOBAL.meterMax && this.chance(this.d.comboSkill * 0.6) && this.signatureGood(me, this.opp, dist, true)) this.press('signature');
      else if (me.cooldowns.ability <= 0 && this.abilityUsefulInCombo(me) && this.chance(this.d.comboSkill * 0.5)) this.press('ability');
    }
  }

  abilityUsefulInCombo(me) {
    const k = me.def.moves.ability.kind;
    return k === 'slam' || k === 'projectile' || k === 'stream';
  }

  /** Pick an attack that suits the distance and the matchup. */
  tryAttack(me, opp, dist, punishing) {
    const moves = me.def.moves;
    const options = [];
    const eff = (type) => {
      const m = opp.typeMult(type);
      return 1 + (m - 1) * 1.6 * this.d.counterUse;
    };
    const lightRange = moves.light[0].range + opp.radius * 0.6;
    const flyingOpp = opp.flying;
    const tallEnough = (m) => !flyingOpp || (m.yReach || 6) >= opp.pos.y + 0.5;

    if (dist <= lightRange && tallEnough(moves.light[0])) options.push(['light', 3 * eff(moves.light[0].type)]);

    const h = moves.heavy;
    const heavyReady = me.cooldowns.heavy <= 0;
    if (heavyReady && h.kind === 'melee' && dist <= h.range + opp.radius * 0.5 && tallEnough(h)) options.push(['heavy', (punishing ? 3 : 1.1) * eff(h.type) * (h.resourceCost && me.res < h.resourceCost + 5 ? 0 : 1)]);
    if (heavyReady && h.kind === 'charge' && dist > 4 && dist < 14 && !flyingOpp) options.push(['heavy', 1.5 * eff(h.type)]);
    if (heavyReady && h.kind === 'dive' && (me.flying || me.res > 30) && dist < 16) options.push(['heavy', (me.flying ? 1.6 : 0.5) * eff(h.type)]);
    if (heavyReady && h.kind === 'grab' && !flyingOpp && dist > 4 && dist < h.range - 1) options.push(['heavy', (opp.state === 'attack' && opp.phase !== 'startup' ? 2.5 : 0.9) * eff(h.type)]);

    const a = moves.ability;
    if (me.cooldowns.ability <= 0) {
      if (a.kind === 'slam' && dist < a.radius && !flyingOpp) options.push(['ability', 2.2 * eff(a.type)]);
      if (a.kind === 'projectile' && dist > 6) options.push(['ability', 2.0 * eff(a.type) * (opp.def.resource.kind === 'shield' ? 0.4 : 1)]);
      if (a.kind === 'stream' && dist > 4 && dist < a.range - 2 && me.res > 40 && me.waterLockout <= 0) options.push(['ability', 2.0 * eff(a.type)]);
      if (a.kind === 'barrier' && dist > 7 && (opp.def.ai.style === 'zoner' || opp.def.ai.style === 'kite' || this.b.projectiles.length)) options.push(['ability', 1.5]);
      if (a.kind === 'barrier' && dist > 4 && opp.id === 'korvak' && opp.state === 'neutral') options.push(['ability', 0.4]);
      if (a.kind === 'decoy' && dist < 9) options.push(['ability', 0.5]);
    }
    if (me.meter >= GLOBAL.meterMax && this.chance(this.d.useSignature) && this.signatureGood(me, opp, dist, false)) options.push(['signature', 6]);

    if (!options.length) return false;
    // Mistakes: sometimes pick at random (including bad ideas)
    let pick;
    if (this.chance(this.d.mistakes)) pick = options[Math.floor(this.rng() * options.length)][0];
    else {
      let total = 0;
      for (const o of options) total += o[1];
      let r = this.rng() * total;
      for (const o of options) {
        r -= o[1];
        if (r <= 0) {
          pick = o[0];
          break;
        }
      }
      pick = pick || options[0][0];
    }
    this.press(pick);
    this.comboPlan = null;
    return true;
  }

  signatureGood(me, opp, dist, inCombo) {
    const s = me.def.moves.signature;
    switch (s.kind) {
      case 'quake':
        return dist < 13 && !opp.airborne;
      case 'vortex':
        return dist > 4 && dist < 18;
      case 'siege':
        return dist > 5 && dist < s.range - 3;
      case 'forestlock':
        return !opp.airborne && (inCombo || opp.rootedTimer > 0 || opp.state === 'attack' || this.chance(0.4));
      case 'parry':
        // Reversal when the opponent is about to commit (lightning, melee) - or hold it for projectiles
        return opp.state === 'attack' && opp.phase === 'startup' && dist < 9;
      default:
        return true;
    }
  }

  chooseMode(me, opp, dist) {
    const [lo, hi] = me.def.ai.preferredRange;
    if (--this.modeTimer > 0) return;
    let lo2 = lo;
    let hi2 = hi;
    // Stay away from Korvak when he's cooled? Rush Korvak when cooled.
    if (opp.cooledTimer > 0) {
      lo2 = 2;
      hi2 = 6;
    }
    // Low health zoners keep more distance; aggression shrinks the range
    if (dist > hi2) this.moveMode = 'approach';
    else if (dist < lo2) this.moveMode = this.chance(0.7) ? 'retreat' : 'strafe';
    else this.moveMode = this.chance(0.5) ? 'strafe' : this.chance(this.d.aggression) ? 'approach' : 'hold';
    if (this.chance(0.15)) this.strafeDir *= -1;
    this.modeTimer = 2;
  }

  flightLogic(me, opp, dist) {
    const r = me.def.resource;
    if (r.kind !== 'stamina') return;
    const bias = me.def.ai.flyBias;
    if (!me.flying && me.grounded && me.res > 70 && this.chance(bias)) this.press('jump');
    else if (me.flying && me.res < 18) this.press('jump');
    // Flee from Oruvex's stream range a bit when not flying? handled by kite style
  }

  dirAway(me, opp) {
    const dx = me.pos.x - opp.pos.x;
    const dz = me.pos.z - opp.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    let x = dx / d;
    let z = dz / d;
    // Avoid backing into the arena wall: bend sideways near the edge
    const nx = me.pos.x + x * 6;
    const nz = me.pos.z + z * 6;
    if (Math.hypot(nx, nz) > GLOBAL.arenaRadius - 4) {
      const tx = -z * this.strafeDir;
      const tz = x * this.strafeDir;
      x = tx;
      z = tz;
    }
    return { x, z };
  }

  applyMovement(out, me, dx, dz, dist, attacking) {
    if (attacking) return;
    const d = dist || 1;
    const tx = dx / d;
    const tz = dz / d;
    let mx = 0;
    let mz = 0;
    switch (this.moveMode) {
      case 'approach':
        mx = tx;
        mz = tz;
        // weave slightly
        mx += -tz * 0.25 * this.strafeDir;
        mz += tx * 0.25 * this.strafeDir;
        break;
      case 'retreat': {
        const a = this.dirAway(me, this.opp);
        mx = a.x;
        mz = a.z;
        break;
      }
      case 'strafe':
        mx = -tz * this.strafeDir + tx * 0.15;
        mz = tx * this.strafeDir + tz * 0.15;
        break;
      default:
        break;
    }
    // keep inside arena
    const nx = me.pos.x + mx * 3;
    const nz = me.pos.z + mz * 3;
    if (Math.hypot(nx, nz) > GLOBAL.arenaRadius - 3) {
      this.strafeDir *= -1;
      mx = -me.pos.x * 0.05 + mx * 0.3;
      mz = -me.pos.z * 0.05 + mz * 0.3;
    }
    out.mx = mx;
    out.mz = mz;
  }

  press(btn) {
    this.held[btn] = this.prev[btn] ? -1 : 3; // -1 = release first, then press next frame
  }

  finish(out, keepBlock = false) {
    // scheduled presses (timed jumps / perfect blocks)
    if (this.waitPress && this.b.frame >= this.waitPress.at) {
      const w = this.waitPress;
      this.waitPress = null;
      if (w.what === 'block') this.blockFor = w.hold;
      else this.press(w.what);
    }
    for (const k of ['light', 'heavy', 'ability', 'signature', 'jump']) {
      const h = this.held[k];
      if (h === -1) {
        out[k] = false;
        this.held[k] = 3;
      } else if (h > 0) {
        out[k] = true;
        this.held[k]--;
      }
    }
    if (this.blockFor > 0 && !keepBlock) out.block = true;
    this.prev = out;
    return out;
  }
}

/** Training-dummy behaviours: stand, block, jump, or full CPU. */
export class DummyController {
  constructor(battle, index, mode = 'stand') {
    this.b = battle;
    this.i = index;
    this.mode = mode;
    this.t = 0;
    this.cpu = new AIController(battle, index, 'normal', 99);
  }

  getInput() {
    this.t++;
    const out = emptyInput();
    if (this.mode === 'cpu') return this.cpu.getInput();
    if (this.mode === 'block') out.block = true;
    if (this.mode === 'jump') out.jump = this.t % 70 < 4;
    if (this.mode === 'attack') out.light = this.t % 90 < 3;
    this.cpu.snapshot();
    return out;
  }
}

export function angleBetween(a, b) {
  return Math.abs(wrapAngle(a - b));
}
