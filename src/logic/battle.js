// Battle: the complete fight simulation for two monsters. Pure logic - no
// graphics, no DOM - so it runs identically in the browser and in Node (for
// the AI-vs-AI balance test). Advance it with step(inputA, inputB) at 60 Hz.
//
// The renderer reads fighters/entities each frame and consumes `events`
// (hits, popups, sounds, hazards...) emitted during the last step.

import { GLOBAL, FPS } from '../data/monsters.js';
import { Fighter, emptyInput } from './fighter.js';
import { ArenaLogic } from './arenaLogic.js';
import { DEG, clamp, wrapAngle, yawTo, pointSegDist2D, segIntersect, makeRng } from './math.js';

const DT = 1 / FPS;
const AIR_CONTROL_STATES = new Set(['neutral', 'block']);

export class Battle {
  /**
   * cfg = {
   *   p1, p2: monster ids; p1Opts/p2Opts: { shadow, skin, handicap }
   *   arena: arena id, hazards: bool, roundsToWin, timer: bool,
   *   training: bool, seed
   * }
   */
  constructor(cfg) {
    this.cfg = { hazards: true, roundsToWin: GLOBAL.roundsToWin, timer: true, training: false, seed: 1, ...cfg };
    this.rng = makeRng(this.cfg.seed);
    this.fighters = [new Fighter(cfg.p1, 0, cfg.p1Opts || {}), new Fighter(cfg.p2, 1, cfg.p2Opts || {})];
    this.arena = new ArenaLogic(this.cfg.arena || 'volcanic', this.rng, this.cfg.hazards && !this.cfg.training);
    this.events = [];
    this.frame = 0;
    this.round = 0;
    this.wins = [0, 0];
    this.hitPause = 0;
    this.matchWinner = -1;
    this.training = this.cfg.training;
    this.trainingOpts = { infiniteMeter: false, dummyRefill: true };
    this.startRound();
  }

  emit(evt) {
    evt.frame = this.frame;
    this.events.push(evt);
  }

  startRound() {
    this.round++;
    this.projectiles = [];
    this.rings = [];
    this.streams = []; // visual + hit info for active water beams (rebuilt each frame)
    this.vortexes = [];
    this.zones = [];
    this.rootlines = [];
    this.barriers = [];
    this.decoys = [];
    this.timer = GLOBAL.roundTimeSeconds * FPS;
    const [a, b] = this.fighters;
    a.resetRound(-9, 0, Math.PI / 2);
    b.resetRound(9, 0, -Math.PI / 2);
    this.arena.reset();
    this.phase = 'ready';
    this.phaseTimer = this.training ? 30 : 110;
    this.roundWinner = -1;
    this.emit({ type: 'roundStart', round: this.round });
  }

  /** Who/what is this fighter aiming at? (An enemy decoy steals targeting.) */
  targetOf(f) {
    const opp = this.fighters[1 - f.index];
    for (const d of this.decoys) if (d.owner === opp) return d;
    return opp;
  }

  /* ====================================================================== */
  /*  MAIN STEP                                                              */
  /* ====================================================================== */

  step(inA, inB) {
    this.events.length = 0;
    this.frame++;
    const inputs = [inA || emptyInput(), inB || emptyInput()];

    if (this.phase === 'matchOver') return;

    if (this.hitPause > 0) {
      // Freeze-frame on heavy hits: keep buffering inputs only.
      this.hitPause--;
      for (const f of this.fighters) this.readInput(f, inputs[f.index], true);
      return;
    }

    if (this.phase === 'ready') {
      for (const f of this.fighters) this.readInput(f, emptyInput(), false);
      if (--this.phaseTimer <= 0) {
        this.phase = 'fight';
        this.emit({ type: 'fight' });
      }
      for (const f of this.fighters) this.physics(f);
      return;
    }

    const fighting = this.phase === 'fight';

    for (const f of this.fighters) {
      this.readInput(f, fighting ? inputs[f.index] : emptyInput(), false);
      this.updateTimers(f);
      this.updateResource(f);
      if (fighting || f.state === 'ko' || f.state === 'victory') this.updateState(f);
      else this.updateState(f, true);
      this.physics(f);
    }

    this.updateEntities();
    this.arena.update(this);
    this.separate();

    if (fighting) {
      if (this.training) this.trainingRules();
      else this.checkRoundEnd();
    } else if (this.phase === 'roundOver') {
      if (--this.phaseTimer <= 0) this.endRound();
    }
  }

  /* ====================================================================== */
  /*  INPUT                                                                  */
  /* ====================================================================== */

  readInput(f, input, pausedOnly) {
    // Turn held buttons into "pressed this frame" buffers.
    for (const k of ['light', 'heavy', 'ability', 'signature', 'jump']) {
      const pressed = input[k] && !f.prevHeld[k];
      if (pressed) f.buf[k] = GLOBAL.inputBufferFrames;
      else if (f.buf[k] > 0 && !pausedOnly) f.buf[k]--;
      f.prevHeld[k] = input[k];
    }
    f.blockPressed = input.block && !f.prevHeld.block;
    f.prevHeld.block = input.block;
    f.input = input;
  }

  consume(f, k) {
    f.buf[k] = 0;
  }

  /* ====================================================================== */
  /*  TIMERS & RESOURCES                                                     */
  /* ====================================================================== */

  updateTimers(f) {
    if (f.invuln > 0) f.invuln--;
    if (f.cooldowns.ability > 0) f.cooldowns.ability--;
    if (f.cooldowns.heavy > 0) f.cooldowns.heavy--;
    if (f.cooldowns.dodge > 0) f.cooldowns.dodge--;
    if (f.rootedTimer > 0) f.rootedTimer--;
    if (f.weakSpotTimer > 0) f.weakSpotTimer--;
    if (f.perfectTimer > 0) f.perfectTimer--;
    if (f.streamTickTimer > 0) {
      if (--f.streamTickTimer === 0) f.streamTicks = 0;
    }
    if (!f.guarding) f.guard = Math.min(GLOBAL.guardMax, f.guard + GLOBAL.guardRegenPerSecond * DT);
    f.inWater = this.arena.isInWater(f.pos.x, f.pos.z) && f.grounded;
    if (this.training && this.trainingOpts.infiniteMeter) f.meter = GLOBAL.meterMax;
  }

  updateResource(f) {
    const r = f.def.resource;
    switch (r.kind) {
      case 'armor':
        if (f.cooledTimer > 0) {
          if (--f.cooledTimer === 0) {
            f.res = r.max;
            this.emit({ type: 'reheated', f: f.index });
          }
        } else if (f.resTimer > 0) f.resTimer--;
        else f.res = Math.min(r.max, f.res + r.regenPerSecond * DT);
        break;
      case 'stamina':
        if (f.flying) {
          f.res -= r.drainPerSecond * DT;
          if (f.res <= 0) {
            f.res = 0;
            f.flying = false;
            this.emit({ type: 'tired', f: f.index });
          }
        } else if (f.grounded) f.res = Math.min(r.max, f.res + r.refillPerSecond * DT);
        break;
      case 'water': {
        const mult = f.inWater ? r.inWaterMult : 1;
        if (f.waterLockout > 0) {
          f.waterLockout -= mult;
          f.res = Math.min(r.max, f.res + (r.max / r.emptyLockout) * mult * 0.6);
          if (f.waterLockout <= 0) {
            f.waterLockout = 0;
            this.emit({ type: 'refilled', f: f.index });
          }
        } else if (f.resTimer > 0) f.resTimer--;
        else f.res = Math.min(r.max, f.res + r.refillPerSecond * mult * DT);
        break;
      }
      case 'regen':
        if (f.firePause > 0) {
          f.firePause--;
          f.healing = false;
          f.res = 0;
        } else {
          f.sinceDamage++;
          f.res = Math.min(r.max, (f.sinceDamage / r.delayFrames) * r.max);
          f.healing = f.sinceDamage >= r.delayFrames && f.hp < f.maxHp && f.hp > 0 && f.state !== 'ko';
          if (f.healing) f.hp = Math.min(f.maxHp, f.hp + r.healPerSecond * DT);
        }
        break;
      case 'shield':
        if (f.shieldBroken > 0) f.shieldBroken--;
        if (f.state === 'block') {
          f.res -= r.drainPerSecondHeld * DT;
          f.resTimer = r.regenDelay;
          if (f.res <= 0) this.shieldBreak(f);
        } else if (f.resTimer > 0) f.resTimer--;
        else f.res = Math.min(r.max, f.res + r.regenPerSecond * DT);
        break;
    }
  }

  shieldBreak(f) {
    const r = f.def.resource;
    f.res = 0;
    f.shieldBroken = r.breakStun + 60;
    this.setStun(f, 'stagger', r.breakStun);
    this.emit({ type: 'shieldBreak', f: f.index, x: f.pos.x, y: f.pos.y + f.height * 0.6, z: f.pos.z });
  }

  /* ====================================================================== */
  /*  STATE MACHINE                                                          */
  /* ====================================================================== */

  updateState(f, frozen = false) {
    const input = f.input;
    switch (f.state) {
      case 'ko':
      case 'victory':
        return;
      case 'hitstun':
      case 'stagger':
        if (--f.stateTimer <= 0 && (f.grounded || f.flying)) this.toNeutral(f);
        return;
      case 'knockdown':
        if (f.grounded && --f.stateTimer <= 0) {
          f.state = 'getup';
          f.stateTimer = GLOBAL.getupFrames;
          f.invuln = GLOBAL.getupFrames + 4;
        }
        return;
      case 'getup':
        if (--f.stateTimer <= 0) this.toNeutral(f);
        return;
      case 'blockstun':
        if (--f.stateTimer <= 0) {
          if (input.block && this.canBlock(f)) f.state = 'block';
          else this.toNeutral(f);
        }
        return;
      case 'dodge':
        f.stateTimer--;
        if (f.stateTimer <= 0) this.toNeutral(f);
        return;
      case 'attack':
        this.updateAttack(f);
        return;
      case 'block':
      case 'neutral':
        if (frozen) return;
        this.updateNeutral(f, input);
        return;
    }
  }

  toNeutral(f) {
    if (f.comboTaken > 1) this.emit({ type: 'comboEnd', f: 1 - f.index, hits: f.comboTaken });
    f.comboTaken = 0;
    f.state = 'neutral';
    f.stateTimer = 0;
    f.move = null;
    f.moveKey = null;
    f.coreExposed = false;
  }

  canBlock(f) {
    if (f.def.resource.kind === 'shield') return f.shieldBroken <= 0 && f.res > 1;
    return true;
  }

  /** Main "free to act" logic: start attacks, jump, block, dodge, move. */
  updateNeutral(f, input) {
    const moving = Math.abs(input.mx) + Math.abs(input.mz) > 0.3;
    const meterFull = f.meter >= GLOBAL.meterMax;

    // Attacks (priority: signature > ability > heavy > light)
    if (f.buf.signature > 0 && meterFull) return this.startMove(f, 'signature');
    if (f.buf.ability > 0 && this.abilityReady(f)) return this.startMove(f, 'ability');
    if (f.buf.heavy > 0 && f.cooldowns.heavy <= 0) return this.startMove(f, 'heavy');
    if (f.buf.light > 0) return this.startMove(f, 'light', 0);

    // Jump / take off / land
    if (f.buf.jump > 0 && f.rootedTimer <= 0) {
      this.consume(f, 'jump');
      if (f.def.resource.kind === 'stamina') {
        if (f.flying) {
          f.flying = false;
          this.emit({ type: 'land', f: f.index });
        } else if (f.res >= f.def.resource.minToTakeOff) {
          f.flying = true;
          f.vy = 0;
          this.emit({ type: 'takeoff', f: f.index });
        } else {
          this.emit({ type: 'noStamina', f: f.index });
        }
      } else if (f.grounded) {
        f.vy = f.def.stats.jumpVelocity;
        this.emit({ type: 'jump', f: f.index });
      }
    }

    // Block & dodge
    if (input.block && this.canBlock(f) && (f.grounded || f.flying)) {
      const wantsDodge = moving && (f.blockPressed || (f.state === 'block' && f.prevMoveMag < 0.3));
      if (wantsDodge && f.cooldowns.dodge <= 0 && f.rootedTimer <= 0) return this.startDodge(f, input);
      if (f.state !== 'block') {
        f.state = 'block';
        f.record.blockUsed = true;
        f.perfectTimer = f.def.resource.perfectWindow || 0;
        this.emit({ type: 'guard', f: f.index });
      }
    } else if (f.state === 'block') {
      f.state = 'neutral';
    }
    f.prevMoveMag = Math.abs(input.mx) + Math.abs(input.mz);
  }

  abilityReady(f) {
    if (f.cooldowns.ability > 0) return false;
    const m = f.def.moves.ability;
    if (f.def.resource.kind === 'water') {
      if (f.waterLockout > 0) return false;
      if (f.res < (m.resourceCost || 0)) return false;
    }
    return true;
  }

  startDodge(f, input) {
    const d = f.dodgeDef;
    const mag = Math.hypot(input.mx, input.mz) || 1;
    f.state = 'dodge';
    f.stateTimer = d.frames;
    f.dodgeDir = { x: input.mx / mag, z: input.mz / mag };
    f.cooldowns.dodge = d.cooldown;
    f.dodgeFrame = 0;
    f.record.dodges++;
    this.emit({ type: 'dodge', f: f.index });
  }

  /* ---------------------------------------------------------------------- */
  /*  MOVES                                                                  */
  /* ---------------------------------------------------------------------- */

  getMove(f, key, chain) {
    return key === 'light' ? f.def.moves.light[chain] : f.def.moves[key];
  }

  startMove(f, key, chain = 0, chained = false) {
    const m = this.getMove(f, key, chain);
    for (const k of ['light', 'heavy', 'ability', 'signature']) this.consume(f, k);
    // Resource checks for Oruvex's heavy (pressure blast needs water)
    if (key === 'heavy' && m.resourceCost && f.def.resource.kind === 'water') {
      if (f.waterLockout > 0 || f.res < m.resourceCost) {
        this.emit({ type: 'noResource', f: f.index });
        return;
      }
      this.spendWater(f, m.resourceCost);
    }
    if (key === 'ability' && m.resourceCost && f.def.resource.kind === 'water') this.spendWater(f, m.resourceCost);
    if (key === 'signature') {
      f.meter = 0;
      f.record.signatures++;
    }
    if (key === 'ability') f.cooldowns.ability = m.cooldown || 0;
    if (key === 'heavy') f.cooldowns.heavy = m.cooldown || 0;

    f.state = 'attack';
    f.moveStartFrame = this.frame;
    f.move = m;
    f.moveKey = key;
    f.chain = chain;
    f.phase = 'startup';
    f.pf = 0;
    f.startupLen = chained ? Math.max(4, Math.round(m.startup * GLOBAL.chainStartupFactor)) : m.startup;
    f.activeLen = m.active;
    f.recovLen = m.recovery;
    f.moveContact = false;
    f.moveHit = false;
    f.hitIds = new Set();
    f.charged = false;
    if (f.prismCharge && (key === 'light' || key === 'heavy')) {
      f.charged = true;
      f.prismCharge = false;
    }
    if (m.kind === 'quake') f.activeLen = m.ringInterval * (m.rings - 1) + m.active;
    if (m.exposesWeakSpot === true) f.coreExposed = true;
    if (m.kind === 'dive' && !f.airborne) {
      // From the ground: leap up first (a quick hop when chained from a combo).
      f.vy = chained ? 11 : 15;
      if (!chained) f.startupLen += 10;
    }
    if (m.kind === 'decoy') this.spawnDecoy(f, m);
    this.emit({ type: 'moveStart', f: f.index, key, chain, name: m.name, kind: m.kind, damageType: m.type, startup: f.startupLen, chained });
  }

  spendWater(f, amount) {
    f.res -= amount;
    f.resTimer = f.def.resource.refillDelay;
    if (f.res <= 0) {
      f.res = 0;
      f.waterLockout = f.def.resource.emptyLockout;
      this.emit({ type: 'waterEmpty', f: f.index });
    }
  }

  updateAttack(f) {
    const m = f.move;
    // --- combo cancels (only after the attack touched the enemy) ---
    if (f.moveContact && f.phase !== 'startup') {
      if (f.moveKey === 'light') {
        if (f.buf.light > 0 && f.chain < f.def.moves.light.length - 1) return this.startMove(f, 'light', f.chain + 1, true);
        if (f.buf.heavy > 0 && f.chain >= 1 && f.cooldowns.heavy <= 0) return this.startMove(f, 'heavy', 0, true);
      }
      if ((f.moveKey === 'light' || f.moveKey === 'heavy') && f.buf.ability > 0 && this.abilityReady(f)) {
        this.emit({ type: 'cancel', f: f.index });
        return this.startMove(f, 'ability', 0, true);
      }
      if (f.moveKey === 'heavy' && f.buf.signature > 0 && f.meter >= GLOBAL.meterMax) {
        this.emit({ type: 'cancel', f: f.index });
        return this.startMove(f, 'signature', 0, true);
      }
    }

    f.pf++;
    if (f.phase === 'startup') {
      this.startupFrame(f, m);
      if (f.pf >= f.startupLen) {
        f.phase = 'active';
        f.pf = 0;
        this.activeStart(f, m);
        if (f.state === 'attack' && f.phase === 'active') this.activeFrame(f, m);
      }
    } else if (f.phase === 'active') {
      if (f.pf >= f.activeLen) this.enterRecovery(f, m);
      else this.activeFrame(f, m);
    } else if (f.phase === 'recovery') {
      this.recoveryFrame(f, m);
      if (f.pf >= f.recovLen) this.endMove(f, m);
    }
  }

  enterRecovery(f, m) {
    f.phase = 'recovery';
    f.pf = 0;
    f.recovLen = m.whiffRecovery && !f.moveHit ? m.whiffRecovery : m.recovery;
    if (m.whiffRecovery && !f.moveHit && m.kind !== 'grab') this.emit({ type: 'whiff', f: f.index, name: m.name });
    if (m.kind === 'stream' || m.kind === 'siege') this.emit({ type: 'streamEnd', f: f.index });
    if (m.kind === 'parry') this.emit({ type: 'parryEnd', f: f.index });
  }

  endMove(f, m) {
    if (m.exposesWeakSpot && m.exposesWeakSpot !== true) {
      f.weakSpotTimer = m.exposesWeakSpot;
      this.emit({ type: 'weakSpotOpen', f: f.index, frames: m.exposesWeakSpot });
    }
    f.coreExposed = false;
    this.toNeutral(f);
  }

  startupFrame(f, m) {
    // Lunge forward during wind-up for melee moves
    if (m.lunge && (m.kind === 'melee')) this.pushForward(f, m.lunge * 0.4);
    if (m.kind === 'grab' && f.pf === 1) this.emit({ type: 'rootWindup', f: f.index, frames: f.startupLen });
    if (m.kind === 'dive' && f.pos.y > 0.5) f.vy = Math.max(f.vy, 0) * 0.9;
  }

  activeStart(f, m) {
    const opp = this.fighters[1 - f.index];
    switch (m.kind) {
      case 'slam':
        this.emit({ type: 'slam', f: f.index, x: f.pos.x, z: f.pos.z, radius: m.radius });
        this.circleHit(f, m, f.pos.x, f.pos.z, m.radius);
        break;
      case 'projectile':
        this.spawnProjectile(f, m);
        break;
      case 'vortex':
        this.spawnVortex(f, m);
        break;
      case 'barrier':
        this.spawnBarrier(f, m);
        break;
      case 'forestlock':
        this.spawnForestLock(f, m);
        break;
      case 'grab':
        this.spawnRootline(f, m);
        break;
      case 'dive': {
        const t = this.targetOf(f);
        const ty = (t.pos ? t.pos.y : t.y || 0) + 1;
        const tx = t.pos ? t.pos.x : t.x;
        const tz = t.pos ? t.pos.z : t.z;
        const dx = tx - f.pos.x;
        const dz = tz - f.pos.z;
        const dy = ty - f.pos.y - 1;
        const len = Math.hypot(dx, dy, dz) || 1;
        f.diveDir = { x: dx / len, y: Math.min(-0.25, dy / len), z: dz / len };
        f.yaw = Math.atan2(dx, dz);
        f.flying = false;
        this.emit({ type: 'dive', f: f.index });
        break;
      }
      case 'charge':
        this.emit({ type: 'charge', f: f.index });
        break;
      case 'parry':
        this.emit({ type: 'parryStart', f: f.index });
        break;
      case 'stream':
      case 'siege':
        this.emit({ type: 'streamStart', f: f.index, kind: m.kind });
        break;
      case 'melee':
        this.emit({ type: 'swing', f: f.index, name: m.name, heavy: !!m.heavyHit, damageType: m.type });
        break;
    }
  }

  activeFrame(f, m) {
    switch (m.kind) {
      case 'melee':
        if (m.lunge) this.pushForward(f, m.lunge * 0.6);
        this.meleeHit(f, m);
        break;
      case 'charge':
        this.turnToward(f, 0.25);
        this.pushForward(f, m.chargeSpeed * (f.cooledTimer > 0 ? f.def.resource.cooledSpeedMult : 1));
        this.meleeHit(f, m);
        if (f.moveHit) this.enterRecovery(f, m);
        break;
      case 'quake': {
        const k = f.pf;
        if (k % m.ringInterval === 0 && k / m.ringInterval < m.rings) {
          this.rings.push({ owner: f, x: f.pos.x + f.forward.x * 2, z: f.pos.z + f.forward.z * 2, r: 1, spec: m, hit: new Set(), idx: k / m.ringInterval });
          this.emit({ type: 'quakeRing', f: f.index, x: f.pos.x, z: f.pos.z, idx: k / m.ringInterval });
        }
        break;
      }
      case 'dive': {
        if (!f.diveDir) break;
        const s = m.diveSpeed * DT;
        f.pos.x += f.diveDir.x * s;
        f.pos.z += f.diveDir.z * s;
        f.pos.y = Math.max(0, f.pos.y + f.diveDir.y * s);
        f.vy = 0;
        if (!f.moveHit) this.meleeHit(f, m, true);
        if (f.pos.y <= 0 || f.moveHit) {
          f.pos.y = Math.max(0, f.pos.y);
          if (f.pos.y <= 0) this.emit({ type: 'diveLand', f: f.index, x: f.pos.x, z: f.pos.z });
          this.enterRecovery(f, m);
        }
        break;
      }
      case 'stream':
        this.turnToward(f, 0.35);
        if (f.pf % m.tickEvery === 0) {
          if (f.res <= 0 || f.waterLockout > 0) {
            this.enterRecovery(f, m);
            break;
          }
          this.spendWater(f, m.costPerTick);
          this.beamTick(f, m, 0);
        }
        this.streams.push({ owner: f, kind: 'stream', spec: m });
        break;
      case 'siege':
        this.turnToward(f, 0.15);
        if (f.pf % m.tickEvery === 0) {
          this.beamTick(f, m, -m.spreadDegrees * DEG);
          this.beamTick(f, m, m.spreadDegrees * DEG);
        }
        break;
      case 'grab':
        // the rootline entity resolves the grab; end early once it's done
        if (f.pf > 2 && !this.rootlines.some((r) => r.owner === f)) this.enterRecovery(f, m);
        break;
    }
  }

  recoveryFrame(f, m) {
    if (m.kind === 'charge' && !f.moveHit && f.pf < 10) this.pushForward(f, m.chargeSpeed * (1 - f.pf / 10) * 0.6);
  }

  pushForward(f, speed) {
    const fw = f.forward;
    const s = speed * DT;
    f.pos.x += fw.x * s;
    f.pos.z += fw.z * s;
  }

  turnToward(f, rateMult = 1) {
    const t = this.targetOf(f);
    const tx = t.pos ? t.pos.x : t.x;
    const tz = t.pos ? t.pos.z : t.z;
    const want = yawTo(f.pos.x, f.pos.z, tx, tz);
    const diff = wrapAngle(want - f.yaw);
    const maxTurn = f.def.stats.turnRate * DEG * DT * rateMult * f.speedMult;
    f.yaw = wrapAngle(f.yaw + clamp(diff, -maxTurn, maxTurn));
  }

  /* ---------------------------------------------------------------------- */
  /*  SPAWNING ENTITIES                                                      */
  /* ---------------------------------------------------------------------- */

  muzzle(f, up = 0.65, fwd = 1) {
    const fw = f.forward;
    return { x: f.pos.x + fw.x * f.radius * fwd, y: f.pos.y + f.height * up, z: f.pos.z + fw.z * f.radius * fwd };
  }

  spawnProjectile(f, m, overrides = {}) {
    const t = this.targetOf(f);
    const o = this.muzzle(f, 0.7, 1.1);
    const tp = t.pos || t;
    const th = t.height || 3;
    const dx = tp.x - o.x;
    const dy = (tp.y || 0) + th * 0.5 - o.y;
    const dz = tp.z - o.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const p = {
      owner: f,
      x: o.x, y: o.y, z: o.z,
      vx: (dx / len) * m.speed, vy: (dy / len) * m.speed, vz: (dz / len) * m.speed,
      radius: m.projRadius,
      life: m.life,
      spec: { ...m },
      reflected: false,
      id: this.frame * 10 + f.index,
      ...overrides,
    };
    this.projectiles.push(p);
    this.emit({ type: 'projectile', f: f.index, damageType: m.type, x: o.x, y: o.y, z: o.z });
    return p;
  }

  spawnVortex(f, m) {
    const fw = f.forward;
    this.vortexes.push({ owner: f, x: f.pos.x + fw.x * 5, z: f.pos.z + fw.z * 5, life: m.duration, total: m.duration, spec: m, tick: 0 });
    this.emit({ type: 'vortex', f: f.index });
  }

  spawnBarrier(f, m) {
    // Only one barrier at a time
    this.barriers = this.barriers.filter((b) => b.owner !== f);
    const fw = f.forward;
    const b = {
      owner: f,
      x: f.pos.x + fw.x * (f.radius + m.barrierDistance),
      z: f.pos.z + fw.z * (f.radius + m.barrierDistance),
      yaw: f.yaw,
      width: m.barrierWidth,
      hp: m.barrierHp,
      maxHp: m.barrierHp,
      life: m.barrierLife,
      spec: m,
      grow: 0,
    };
    this.updateBarrierEnds(b);
    this.barriers.push(b);
    this.emit({ type: 'barrier', f: f.index, x: b.x, z: b.z });
  }

  updateBarrierEnds(b) {
    const px = Math.cos(b.yaw);
    const pz = -Math.sin(b.yaw);
    b.ax = b.x + px * b.width * 0.5;
    b.az = b.z + pz * b.width * 0.5;
    b.bx = b.x - px * b.width * 0.5;
    b.bz = b.z - pz * b.width * 0.5;
  }

  spawnForestLock(f, m) {
    const t = this.fighters[1 - f.index]; // roots go for the real monster, not a decoy
    this.zones.push({ owner: f, x: t.pos.x, z: t.pos.z, timer: m.warning, radius: m.radius, spec: m, fired: false, life: m.warning + 60 });
    this.emit({ type: 'forestLockWarn', f: f.index, x: t.pos.x, z: t.pos.z, radius: m.radius, frames: m.warning });
  }

  spawnRootline(f, m) {
    const fw = f.forward;
    this.rootlines.push({ owner: f, x: f.pos.x + fw.x * f.radius, z: f.pos.z + fw.z * f.radius, sx: f.pos.x, sz: f.pos.z, dx: fw.x, dz: fw.z, traveled: 0, spec: m, done: false });
    this.emit({ type: 'rootline', f: f.index });
  }

  spawnDecoy(f, m) {
    this.decoys = this.decoys.filter((d) => d.owner !== f);
    this.decoys.push({ owner: f, x: f.pos.x, y: f.pos.y, z: f.pos.z, pos: null, yaw: f.yaw, life: m.decoyLife, height: f.height, radius: f.radius });
    const d = this.decoys[this.decoys.length - 1];
    d.pos = { x: d.x, y: d.y, z: d.z };
    // Slip sideways (left or right, whichever side is further from the arena edge)
    const side = { x: Math.cos(f.yaw), z: -Math.sin(f.yaw) };
    const sgn = (f.pos.x + side.x * 4) ** 2 + (f.pos.z + side.z * 4) ** 2 < (f.pos.x - side.x * 4) ** 2 + (f.pos.z - side.z * 4) ** 2 ? 1 : -1;
    f.kv.x += side.x * sgn * m.sidestep * 3.2;
    f.kv.z += side.z * sgn * m.sidestep * 3.2;
    f.invuln = Math.max(f.invuln, 14);
    this.emit({ type: 'decoy', f: f.index, x: d.x, z: d.z });
  }

  /* ---------------------------------------------------------------------- */
  /*  HIT DETECTION                                                          */
  /* ---------------------------------------------------------------------- */

  /** Melee hitbox: an arc in front of the attacker. */
  meleeHit(f, m, sphere = false) {
    const opp = this.fighters[1 - f.index];
    // Decoys
    for (const d of this.decoys) {
      if (d.owner === f) continue;
      if (this.inArc(f, d.x, d.z, d.y || 0, d.radius, d.height, m, sphere)) this.shatterDecoy(d, f);
    }
    // Props
    for (const p of this.arena.props) {
      if (!p.alive || f.hitIds.has('p' + p.id)) continue;
      if (p.r > 0 && this.inArc(f, p.x, p.z, 0, p.r, 8, m, sphere)) {
        f.hitIds.add('p' + p.id);
        this.damageProp(p, (m.damage || 30) * 0.8);
        f.moveContact = true;
      }
    }
    if (f.hitIds.has(opp.index)) return;
    if (!this.inArc(f, opp.pos.x, opp.pos.z, opp.pos.y, opp.radius, opp.height, m, sphere)) return;
    // A barrier between attacker and defender absorbs the blow
    const bar = this.barrierBetween(f, opp.pos.x, opp.pos.z);
    if (bar) {
      if (!f.hitIds.has('b')) {
        f.hitIds.add('b');
        this.damageBarrier(bar, m.damage * f.dmgMult, m.type);
        f.moveContact = true;
        if (m.kind === 'charge') f.moveHit = true;
      }
      return;
    }
    f.hitIds.add(opp.index);
    const spec = this.chargedSpec(f, m);
    const res = this.resolveHit(f, opp, spec, f.pos.x, f.pos.z, 'melee');
    if (res !== 'miss') f.moveContact = true;
    if (res === 'hit') f.moveHit = true;
    if (res === 'blocked' || res === 'parried') f.moveHit = f.moveHit || m.kind === 'charge';
  }

  chargedSpec(f, m) {
    if (!f.charged) return m;
    const c = f.def.moves.signature;
    return { ...m, damage: m.damage * (c.chargedPunchMult || 1.8), type: 'energy', heavyHit: true, knockback: (m.knockback || 4) + 6, charged: true };
  }

  inArc(f, tx, tz, ty, tr, th, m, sphere) {
    const dx = tx - f.pos.x;
    const dz = tz - f.pos.z;
    const d = Math.hypot(dx, dz);
    const reach = m.range + tr * 0.8;
    if (d > reach) return false;
    // Vertical overlap
    const top = f.pos.y + (m.yReach || 6);
    const bottom = f.pos.y - (sphere ? 4 : 1.5);
    if (ty > top || ty + th < bottom) return false;
    if (sphere || d < tr) return true;
    const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - f.yaw));
    const half = ((m.arc || 90) * DEG) / 2 + Math.atan2(tr, d);
    return ang <= half;
  }

  circleHit(f, m, cx, cz, radius) {
    const opp = this.fighters[1 - f.index];
    for (const d of this.decoys) if (d.owner !== f && Math.hypot(d.x - cx, d.z - cz) < radius + d.radius) this.shatterDecoy(d, f);
    for (const p of this.arena.props) if (p.alive && p.r > 0 && Math.hypot(p.x - cx, p.z - cz) < radius + p.r) this.damageProp(p, m.damage);
    for (const b of this.barriers) if (b.owner !== f && Math.hypot(b.x - cx, b.z - cz) < radius + b.width * 0.5) this.damageBarrier(b, m.damage, m.type);
    if (m.groundOnly && opp.airborne) return;
    if (Math.hypot(opp.pos.x - cx, opp.pos.z - cz) < radius + opp.radius * 0.6) {
      const res = this.resolveHit(f, opp, m, cx, cz, 'area');
      if (res !== 'miss') f.moveContact = true;
      if (res === 'hit') f.moveHit = true;
    }
  }

  /** One damage tick of a water beam. yawOffset for Tidal Siege's twin streams. */
  beamTick(f, m, yawOffset) {
    const opp = this.fighters[1 - f.index];
    const yaw = f.yaw + yawOffset;
    const o = this.muzzle(f, 0.62, 1.0);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // Pitch the beam towards the target's height (so it can hit flyers)
    const t = this.targetOf(f);
    const tp = t.pos || t;
    const horiz = Math.max(1, Math.hypot(tp.x - o.x, tp.z - o.z));
    const pitch = clamp(((tp.y || 0) + (t.height || 3) * 0.5 - o.y) / horiz, -0.6, 0.8);
    let len = m.range;
    let ex = o.x + fx * len;
    let ez = o.z + fz * len;
    // Barrier cuts the beam
    for (const b of this.barriers) {
      if (b.owner === f) continue;
      const tt = segIntersect(o.x, o.z, ex, ez, b.ax, b.az, b.bx, b.bz);
      if (tt >= 0) {
        len *= tt;
        ex = o.x + fx * len;
        ez = o.z + fz * len;
        this.damageBarrier(b, m.damage * 1.2, m.type);
      }
    }
    // Decoys
    for (const d of this.decoys) {
      if (d.owner === f) continue;
      if (pointSegDist2D(d.x, d.z, o.x, o.z, ex, ez).d < m.beamWidth + d.radius) this.shatterDecoy(d, f);
    }
    // Props
    for (const p of this.arena.props) {
      if (p.alive && p.r > 0 && pointSegDist2D(p.x, p.z, o.x, o.z, ex, ez).d < m.beamWidth + p.r) this.damageProp(p, m.damage * 0.6);
    }
    const ps = pointSegDist2D(opp.pos.x, opp.pos.z, o.x, o.z, ex, ez);
    if (ps.d > m.beamWidth + opp.radius * 0.7) return;
    const beamY = o.y + pitch * ps.t * len;
    if (beamY < opp.pos.y - 1.5 || beamY > opp.pos.y + opp.height + 1.5) return;
    const spec = { ...m, knockback: 0 };
    const res = this.resolveHit(f, opp, spec, o.x, o.z, 'stream');
    if (res === 'hit' || res === 'blocked' || res === 'armor') {
      // Water pushes the target back along the beam
      const push = m.push * (res === 'blocked' ? 0.6 : 1) * opp.def.stats.weight * 0.35;
      opp.kv.x += fx * push;
      opp.kv.z += fz * push;
      f.moveContact = true;
      if (res === 'hit') f.moveHit = true;
      if (opp.flying) {
        opp.streamTicks++;
        opp.streamTickTimer = 30;
        if (m.forceLand || (m.forceLandAfterTicks && opp.streamTicks >= m.forceLandAfterTicks)) this.forceLand(opp, f);
      }
    }
  }

  barrierBetween(att, tx, tz) {
    for (const b of this.barriers) {
      if (b.owner === att) continue;
      if (segIntersect(att.pos.x, att.pos.z, tx, tz, b.ax, b.az, b.bx, b.bz) >= 0) return b;
    }
    return null;
  }

  damageBarrier(b, dmg, type) {
    const mult = type === 'fire' ? b.spec.fireDamageMult : 1;
    b.hp -= dmg * mult;
    this.emit({ type: 'barrierHit', x: b.x, z: b.z, fire: type === 'fire' });
    if (b.hp <= 0) b.life = 0;
  }

  shatterDecoy(d, by) {
    if (d.life <= 0) return;
    d.life = 0;
    by.moveContact = true;
    this.emit({ type: 'decoyShatter', x: d.x, y: d.y, z: d.z, f: d.owner.index });
  }

  damageProp(p, dmg) {
    if (!p.alive) return;
    p.hp -= dmg;
    p.hitFlash = 8;
    this.emit({ type: 'propHit', id: p.id, x: p.x, z: p.z });
    if (p.hp <= 0) {
      p.alive = false;
      this.emit({ type: 'propDestroyed', id: p.id, x: p.x, z: p.z, kind: p.kind });
    }
  }

  isFrontal(def, srcX, srcZ, arcDeg) {
    const ang = Math.abs(wrapAngle(yawTo(def.pos.x, def.pos.z, srcX, srcZ) - def.yaw));
    return ang <= (arcDeg * DEG) / 2;
  }

  /**
   * Resolve an attack touching a defender.
   * Returns 'miss' | 'blocked' | 'parried' | 'armor' | 'hit'
   */
  resolveHit(att, def, spec, srcX, srcZ, via) {
    if (def.state === 'ko' || def.state === 'knockdown' || def.state === 'getup') return 'miss';
    if (def.invuln > 0) return 'miss';
    if (spec.groundOnly && def.airborne) return 'miss';
    if (def.state === 'dodge' && def.dodgeFrame >= def.dodgeDef.invulnStart && def.dodgeFrame <= def.dodgeDef.invulnEnd) {
      this.emit({ type: 'evade', f: def.index });
      return 'miss';
    }

    const type = spec.type;
    const isRoot = type === 'root';
    const res = def.def.resource;

    // --- Prism Reversal (Prismor signature): parry stance ---
    if (def.state === 'attack' && def.move && def.move.kind === 'parry' && def.phase === 'active' && !isRoot && !spec.unblockable && this.isFrontal(def, srcX, srcZ, res.shieldArcDegrees || 140)) {
      def.prismCharge = true;
      this.emit({ type: 'parry', f: def.index, x: def.pos.x, y: def.pos.y + def.height * 0.6, z: def.pos.z });
      if (via === 'melee' && att) {
        // Instant crystal counter-punch
        const c = def.move;
        this.enterRecovery(def, c);
        def.recovLen = 12;
        const cs = { type: 'energy', damage: c.damage, hitstun: c.counterHitstun, knockback: c.knockback, launch: c.launch, knockdown: true, heavyHit: true, name: 'Prism Counter' };
        this.resolveHit(def, att, cs, def.pos.x, def.pos.z, 'counter');
      }
      return 'parried';
    }

    // --- Blocking ---
    const blocking = def.guarding && !spec.unblockable && !(isRoot && res.kind === 'shield');
    const arc = res.kind === 'shield' ? res.shieldArcDegrees : GLOBAL.blockArcDegrees;
    if (blocking && this.isFrontal(def, srcX, srcZ, arc)) {
      let chipMult = GLOBAL.blockChip;
      if (res.kind === 'shield') {
        def.res -= spec.damage * res.drainPerBlockedDamage;
        def.resTimer = res.regenDelay;
        if (def.perfectTimer > 0) chipMult = 0;
      } else {
        def.guard -= spec.damage;
      }
      const chip = spec.damage * chipMult * (att ? att.dmgMult : 1) * def.typeMult(type) * this.armorFor(def, type);
      def.hp = Math.max(1, def.hp - chip);
      def.state = 'blockstun';
      def.stateTimer = spec.blockstun || Math.round((spec.hitstun || 20) * 0.5);
      const kb = (spec.knockback || 0) * 0.4 * def.def.stats.weight;
      this.applyKnockback(def, srcX, srcZ, kb);
      def.record.blocks++;
      if (att) att.meter = Math.min(GLOBAL.meterMax, att.meter + spec.damage * 0.03 * att.meterMult);
      this.emit({ type: 'block', f: def.index, att: att ? att.index : -1, x: def.pos.x, y: def.pos.y + def.height * 0.6, z: def.pos.z, perfect: def.perfectTimer > 0, damageType: type, heavy: !!spec.heavyHit });
      if (res.kind === 'shield' && def.res <= 0) this.shieldBreak(def);
      else if (res.kind !== 'shield' && def.guard <= 0) {
        def.guard = GLOBAL.guardMax;
        this.setStun(def, 'stagger', GLOBAL.guardCrushStun);
        this.emit({ type: 'guardCrush', f: def.index, x: def.pos.x, y: def.pos.y + def.height * 0.6, z: def.pos.z });
      }
      if (spec.heavyHit) this.hitPause = Math.max(this.hitPause, 3);
      return 'blocked';
    }

    // --- Damage ---
    const tm = def.typeMult(type);
    let dmg = spec.damage * (att ? att.dmgMult : 1) * tm * this.armorFor(def, type);
    let label = null;
    if (tm >= GLOBAL.superEffectiveAt) label = 'SUPER EFFECTIVE!';
    else if (tm <= GLOBAL.resistedAt) label = 'RESISTED!';
    let weak = null;
    if (def.def.weakSpot && (def.weakSpotTimer > 0 || def.coreExposed)) {
      dmg *= def.def.weakSpot.mult;
      weak = def.def.weakSpot.label;
    }
    if (def.cooledTimer > 0) dmg *= res.cooledDamageMult;
    if (def.flying && def.def.wingHitMult && type !== 'electric') {
      dmg *= def.def.wingHitMult;
      weak = weak || 'WING HIT!';
    }
    // Combo scaling
    const inCombo = def.state === 'hitstun' || def.state === 'stagger' || (def.rootedTimer > 0 && def.comboTaken > 0);
    def.comboTaken = inCombo ? def.comboTaken + 1 : 1;
    const scale = Math.max(GLOBAL.comboMinScale, 1 - GLOBAL.comboDamageScaling * (def.comboTaken - 1));
    dmg *= scale;
    dmg = Math.max(1, Math.round(dmg));

    def.hp -= dmg;
    def.lastHitFrame = this.frame;
    if (att) {
      att.meter = Math.min(GLOBAL.meterMax, att.meter + dmg * GLOBAL.meterPerDamageDealt * att.meterMult);
      att.record.hitsLanded++;
      att.record.damageDealt += dmg;
      att.record.maxCombo = Math.max(att.record.maxCombo, def.comboTaken);
      if (label === 'SUPER EFFECTIVE!') att.record.superEffective++;
    }
    def.meter = Math.min(GLOBAL.meterMax, def.meter + dmg * GLOBAL.meterPerDamageTaken * def.meterMult);

    // Resource reactions
    if (res.kind === 'armor' && type === 'water' && def.cooledTimer <= 0) {
      def.res -= spec.damage * res.waterDrainPerDamage;
      def.resTimer = res.regenDelay;
      if (def.res <= 0) {
        def.res = 0;
        def.cooledTimer = res.cooledDuration;
        this.emit({ type: 'cooled', f: def.index, x: def.pos.x, y: def.pos.y + def.height, z: def.pos.z });
      }
    }
    if (res.kind === 'regen') {
      def.sinceDamage = 0;
      def.healing = false;
      if (type === 'fire') {
        if (def.firePause <= 0) this.emit({ type: 'regenBurned', f: def.index });
        def.firePause = res.firePause;
      }
    }

    const heavy = !!spec.heavyHit;
    this.emit({
      type: 'hit', f: def.index, att: att ? att.index : -1, dmg, label, weak, damageType: type, heavy, via,
      x: def.pos.x, y: def.pos.y + def.height * 0.6, z: def.pos.z, combo: def.comboTaken, charged: !!spec.charged,
      name: spec.name,
    });
    if (def.comboTaken >= 2 && att) this.emit({ type: 'combo', f: att.index, hits: def.comboTaken });

    // Super armor absorbs the stun (but not the damage)
    const armored = def.hasSuperArmor && !spec.breaksArmor;
    if (def.hp <= 0) {
      def.hp = 0;
      this.hitPause = Math.max(this.hitPause, 10);
      this.knockOut(def, att, srcX, srcZ, spec);
      return 'hit';
    }
    if (via !== 'stream') this.hitPause = Math.max(this.hitPause, heavy ? GLOBAL.heavyHitPause : GLOBAL.lightHitPause);

    if (armored) {
      this.emit({ type: 'armor', f: def.index, x: def.pos.x, y: def.pos.y + def.height * 0.6, z: def.pos.z });
      return 'armor';
    }

    if (spec.breaksArmor && def.hasSuperArmor === false && def.state === 'attack' && def.move && def.move.superArmor) {
      this.emit({ type: 'interrupt', f: def.index });
    }

    // Stun
    const hs = Math.max(8, Math.round((spec.hitstun || 20) - GLOBAL.comboHitstunDecay * (def.comboTaken - 1)));
    const wasFlying = def.flying;
    if (spec.forceLand && def.flying) this.forceLand(def, att);
    if (spec.knockdown) {
      def.state = 'knockdown';
      def.stateTimer = GLOBAL.knockdownFrames;
      def.flying = false;
      def.vy = Math.max(def.vy, spec.launch || 4);
      def.move = null;
      def.coreExposed = false;
    } else if (via === 'stream') {
      // Streams only flinch briefly
      if (def.state !== 'attack' || def.phase !== 'active' || def.move.kind === 'melee') this.setStun(def, 'hitstun', hs);
    } else {
      this.setStun(def, 'hitstun', hs);
      if (spec.launch && !wasFlying) def.vy = Math.max(def.vy, spec.launch);
    }
    if (via === 'grab' || spec.rootFrames) def.rootedTimer = Math.max(def.rootedTimer, spec.rootFrames || 0);
    this.applyKnockback(def, srcX, srcZ, (spec.knockback || 0) * def.def.stats.weight);
    return 'hit';
  }

  /** Armor multiplier vs a damage type (some types slip past armor, see armorBypassTypes). */
  armorFor(def, type) {
    const bypass = def.def.armorBypassTypes;
    return bypass && bypass.includes(type) ? 1 : def.def.stats.armor;
  }

  setStun(f, kind, frames) {
    f.state = kind;
    f.stateTimer = frames;
    f.move = null;
    f.moveKey = null;
    f.coreExposed = false;
  }

  applyKnockback(f, srcX, srcZ, amount) {
    if (!amount) return;
    let dx = f.pos.x - srcX;
    let dz = f.pos.z - srcZ;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) {
      dx = -Math.sin(f.yaw);
      dz = -Math.cos(f.yaw);
    } else {
      dx /= len;
      dz /= len;
    }
    f.kv.x += dx * amount;
    f.kv.z += dz * amount;
  }

  forceLand(f, by) {
    if (!f.flying) return;
    f.flying = false;
    f.streamTicks = 0;
    this.setStun(f, 'hitstun', GLOBAL.forcedLandingStun);
    this.emit({ type: 'forceLand', f: f.index, x: f.pos.x, y: f.pos.y, z: f.pos.z, label: 'GROUNDED!' });
  }

  /** Damage from the arena itself (hazards). */
  envHit(f, spec, srcX, srcZ, name) {
    if (this.phase !== 'fight') return;
    if (f.state === 'ko' || f.invuln > 0 || f.state === 'knockdown' || f.state === 'getup') return;
    if (this.training && this.trainingOpts.noHazards) return;
    const s = { name, hitstun: 20, ...spec };
    // Hazards can't be blocked and don't build combos
    const saved = f.state;
    if (saved === 'block' || saved === 'blockstun') f.state = 'neutral';
    f.comboTaken = 0;
    this.resolveHit(null, f, s, srcX, srcZ, 'env');
    if (f.hp <= 0 && f.state !== 'ko') this.knockOut(f, null, srcX, srcZ, s);
  }

  knockOut(f, att, srcX, srcZ, spec) {
    if (this.training) {
      // Dummies never die in training
      f.hp = 1;
      return;
    }
    f.state = 'ko';
    f.flying = false;
    f.move = null;
    f.vy = 7;
    this.applyKnockback(f, srcX, srcZ, 10 * f.def.stats.weight);
    const winner = att ? att.index : 1 - f.index;
    this.emit({ type: 'ko', f: f.index, winner, x: f.pos.x, y: f.pos.y, z: f.pos.z, finisher: spec ? spec.name : null });
  }

  /* ---------------------------------------------------------------------- */
  /*  ENTITIES                                                               */
  /* ---------------------------------------------------------------------- */

  updateEntities() {
    // Streams are rebuilt each frame for the renderer
    this.streams = [];
    for (const f of this.fighters) {
      if (f.state === 'attack' && f.phase === 'active' && f.move && (f.move.kind === 'stream' || f.move.kind === 'siege')) {
        this.streams.push({ owner: f, kind: f.move.kind, spec: f.move, pitchTarget: this.targetOf(f) });
      }
    }

    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.z += p.vz * DT;
      p.life--;
      let dead = p.life <= 0 || p.y < -0.5 || Math.hypot(p.x, p.z) > GLOBAL.arenaRadius + 10;
      const owner = p.owner;
      const opp = this.fighters[1 - owner.index];
      // barrier
      if (!dead) {
        for (const b of this.barriers) {
          if (b.owner === owner) continue;
          if (pointSegDist2D(p.x, p.z, b.ax, b.az, b.bx, b.bz).d < p.radius + 0.5 && p.y < 6) {
            this.damageBarrier(b, p.spec.damage, p.spec.type);
            dead = true;
          }
        }
      }
      if (!dead) {
        for (const d of this.decoys) {
          if (d.owner === owner) continue;
          if (Math.hypot(p.x - d.x, p.z - d.z) < p.radius + d.radius && p.y < d.y + d.height + 1) {
            this.shatterDecoy(d, owner);
            dead = true;
          }
        }
      }
      if (!dead) {
        for (const pr of this.arena.props) {
          if (pr.alive && pr.r > 0 && Math.hypot(p.x - pr.x, p.z - pr.z) < p.radius + pr.r && p.y < 7) {
            this.damageProp(pr, p.spec.damage * 0.6);
            dead = true;
          }
        }
      }
      if (!dead && opp.state !== 'ko') {
        const dx = p.x - opp.pos.x;
        const dz = p.z - opp.pos.z;
        if (Math.hypot(dx, dz) < p.radius + opp.radius && p.y > opp.pos.y - 0.5 && p.y < opp.pos.y + opp.height + 0.8) {
          if (this.tryReflect(opp, p)) {
            // reflected - keeps flying
          } else {
            this.resolveHit(owner, opp, p.spec, p.x - p.vx * 0.05, p.z - p.vz * 0.05, 'projectile');
            dead = true;
          }
        }
      }
      if (dead) {
        this.emit({ type: 'projectileEnd', x: p.x, y: p.y, z: p.z, damageType: p.spec.type });
        this.projectiles.splice(i, 1);
      }
    }

    // Rings (Magma Quake)
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      const m = r.spec;
      r.r += m.ringSpeed * DT;
      const opp = this.fighters[1 - r.owner.index];
      if (!r.hit.has(opp.index) && !opp.airborne) {
        const d = Math.hypot(opp.pos.x - r.x, opp.pos.z - r.z);
        if (Math.abs(d - r.r) < m.ringWidth + opp.radius * 0.5) {
          r.hit.add(opp.index);
          this.resolveHit(r.owner, opp, m, r.x, r.z, 'ring');
        }
      }
      for (const p of this.arena.props) {
        if (p.alive && p.r > 0 && !r.hit.has('p' + p.id) && Math.abs(Math.hypot(p.x - r.x, p.z - r.z) - r.r) < m.ringWidth + p.r) {
          r.hit.add('p' + p.id);
          this.damageProp(p, m.damage * 0.8);
        }
      }
      for (const b of this.barriers) {
        if (b.owner !== r.owner && !r.hit.has(b) && Math.abs(Math.hypot(b.x - r.x, b.z - r.z) - r.r) < m.ringWidth + 1) {
          r.hit.add(b);
          this.damageBarrier(b, m.damage, m.type);
        }
      }
      for (const d of this.decoys) if (d.owner !== r.owner && Math.abs(Math.hypot(d.x - r.x, d.z - r.z) - r.r) < m.ringWidth + d.radius) this.shatterDecoy(d, r.owner);
      if (r.r > m.ringMaxRadius) this.rings.splice(i, 1);
    }

    // Vortex (Thunder Vortex)
    for (let i = this.vortexes.length - 1; i >= 0; i--) {
      const v = this.vortexes[i];
      const m = v.spec;
      const opp = this.fighters[1 - v.owner.index];
      v.life--;
      // drift towards the enemy
      const dx = opp.pos.x - v.x;
      const dz = opp.pos.z - v.z;
      const d = Math.hypot(dx, dz) || 1;
      v.x += (dx / d) * m.vortexSpeed * DT;
      v.z += (dz / d) * m.vortexSpeed * DT;
      if (d < m.pullRadius && opp.state !== 'ko' && opp.state !== 'dodge' && opp.invuln <= 0) {
        const pull = m.pullStrength * (1 - (d / m.pullRadius) * 0.5) * DT;
        opp.pos.x -= (dx / d) * Math.min(pull, d);
        opp.pos.z -= (dz / d) * Math.min(pull, d);
        if (++v.tick % m.tickEvery === 0 && d < m.pullRadius * 0.6 && this.phase === 'fight') {
          // light chip damage, no stun
          const chip = Math.round(m.tickDamage * opp.typeMult(m.type));
          opp.hp = Math.max(1, opp.hp - chip);
          this.emit({ type: 'tick', f: opp.index, dmg: chip, x: opp.pos.x, y: opp.pos.y + opp.height, z: opp.pos.z, damageType: m.type });
        }
      }
      if (v.life === 24) this.emit({ type: 'vortexWarn', x: v.x, z: v.z });
      if (v.life <= 0) {
        this.emit({ type: 'vortexStrike', x: v.x, z: v.z, radius: m.strikeRadius });
        for (const dd of this.decoys) if (dd.owner !== v.owner && Math.hypot(dd.x - v.x, dd.z - v.z) < m.strikeRadius + dd.radius) this.shatterDecoy(dd, v.owner);
        for (const p of this.arena.props) if (p.alive && p.r > 0 && Math.hypot(p.x - v.x, p.z - v.z) < m.strikeRadius + p.r) this.damageProp(p, m.damage);
        if (Math.hypot(opp.pos.x - v.x, opp.pos.z - v.z) < m.strikeRadius + opp.radius * 0.6) {
          this.resolveHit(v.owner, opp, m, v.x, v.z, 'area');
        }
        this.vortexes.splice(i, 1);
      }
    }

    // Forest Lock zones
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life--;
      if (!z.fired && --z.timer <= 0) {
        z.fired = true;
        const m = z.spec;
        this.emit({ type: 'forestLock', f: z.owner.index, x: z.x, z: z.z, radius: z.radius });
        const opp = this.fighters[1 - z.owner.index];
        if (!opp.airborne && Math.hypot(opp.pos.x - z.x, opp.pos.z - z.z) < z.radius + opp.radius * 0.5) {
          this.resolveHit(z.owner, opp, m, z.x, z.z, 'grab');
        }
        for (const d of this.decoys) if (d.owner !== z.owner && Math.hypot(d.x - z.x, d.z - z.z) < z.radius) this.shatterDecoy(d, z.owner);
      }
      if (z.life <= 0) this.zones.splice(i, 1);
    }

    // Root grab lines
    for (let i = this.rootlines.length - 1; i >= 0; i--) {
      const r = this.rootlines[i];
      const m = r.spec;
      const step = m.travelSpeed * DT;
      r.x += r.dx * step;
      r.z += r.dz * step;
      r.traveled += step;
      const opp = this.fighters[1 - r.owner.index];
      for (const d of this.decoys) if (d.owner !== r.owner && Math.hypot(d.x - r.x, d.z - r.z) < m.tipRadius + d.radius) this.shatterDecoy(d, r.owner);
      if (!r.done && !opp.airborne && Math.hypot(opp.pos.x - r.x, opp.pos.z - r.z) < m.tipRadius + opp.radius) {
        r.done = true;
        const res = this.resolveHit(r.owner, opp, m, r.owner.pos.x, r.owner.pos.z, 'grab');
        if (res === 'hit') {
          r.owner.moveHit = true;
          r.owner.moveContact = true;
          this.emit({ type: 'rooted', f: opp.index, x: opp.pos.x, z: opp.pos.z });
        }
      }
      if (r.done || r.traveled >= m.range) {
        this.rootlines.splice(i, 1);
      }
    }

    // Barriers
    for (let i = this.barriers.length - 1; i >= 0; i--) {
      const b = this.barriers[i];
      b.life--;
      b.grow = Math.min(1, b.grow + 0.08);
      if (b.life <= 0) {
        this.emit({ type: 'barrierBreak', x: b.x, z: b.z, yaw: b.yaw });
        this.barriers.splice(i, 1);
      }
    }

    // Decoys
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.life--;
      if (d.life <= 0) {
        if (d.life === 0) this.emit({ type: 'decoyFade', x: d.x, z: d.z });
        this.decoys.splice(i, 1);
      }
    }
  }

  /** Prismor perfect-block / Prism Reversal reflecting a projectile. */
  tryReflect(f, p) {
    const res = f.def.resource;
    if (res.kind !== 'shield' || p.reflected && p.owner === f) return false;
    if (!(res.reflectableTypes || []).includes(p.spec.type) || !p.spec.reflectable && p.spec.type !== 'energy') return false;
    const parrying = f.state === 'attack' && f.move && f.move.kind === 'parry' && f.phase === 'active';
    const perfect = f.guarding && f.perfectTimer > 0;
    if (!parrying && !perfect) return false;
    if (!this.isFrontal(f, p.x, p.z, res.shieldArcDegrees)) return false;
    // Send it back at the shooter, harder, as prism ENERGY
    const target = p.owner;
    const dx = target.pos.x - p.x;
    const dy = target.pos.y + target.height * 0.5 - p.y;
    const dz = target.pos.z - p.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const speed = Math.hypot(p.vx, p.vy, p.vz) * 1.15;
    p.vx = (dx / len) * speed;
    p.vy = (dy / len) * speed;
    p.vz = (dz / len) * speed;
    if (p.spec.type === 'electric') f.record.reflectedBolts++;
    p.owner = f;
    p.reflected = true;
    p.life = 70;
    p.spec = { ...p.spec, damage: p.spec.damage * res.reflectDamageMult, type: 'energy', name: 'Reflected Bolt', heavyHit: true, knockdown: false };
    f.record.reflects++;
    if (parrying) f.prismCharge = true;
    this.emit({ type: 'reflect', f: f.index, x: p.x, y: p.y, z: p.z, perfect: true });
    return true;
  }

  /* ====================================================================== */
  /*  PHYSICS & MOVEMENT                                                     */
  /* ====================================================================== */

  physics(f) {
    const input = f.input || emptyInput();
    const st = f.def.stats;
    const slow = this.arena.slowAt(f.pos.x, f.pos.z);
    const cooled = f.cooledTimer > 0 ? f.def.resource.cooledSpeedMult : 1;

    // --- Facing ---
    if (f.state === 'neutral' || f.state === 'block' || f.state === 'blockstun') this.turnToward(f, 1);
    else if (f.state === 'attack' && f.phase === 'startup' && f.move.kind !== 'charge') this.turnToward(f, 0.5);
    else if (f.state === 'attack' && f.phase === 'active' && f.move.kind === 'projectile') this.turnToward(f, 0.5);

    // --- Walking / flying ---
    let wx = 0;
    let wz = 0;
    const canWalk = (f.state === 'neutral' && f.rootedTimer <= 0) || (f.state === 'block' && f.flying);
    if (canWalk && this.phase === 'fight') {
      let mx = input.mx;
      let mz = input.mz;
      const mag = Math.hypot(mx, mz);
      if (mag > 1) {
        mx /= mag;
        mz /= mag;
      }
      if (mag > 0.15) {
        const fw = f.forward;
        const along = mx * fw.x + mz * fw.z; // + forward, - backward
        const sx = Math.cos(f.yaw);
        const sz = -Math.sin(f.yaw);
        const side = mx * sx + mz * sz;
        const base = (f.flying ? st.flySpeed : st.walkSpeed) * f.speedMult * cooled * (f.flying ? 1 : slow);
        const fwdSpeed = along * base * (along < 0 ? st.backSpeedMult : 1);
        const sideSpeed = side * base * (f.flying ? 1 : st.strafeMult);
        let airMult = 1;
        if (!f.flying && f.pos.y > 0.05) airMult = st.airControl;
        wx = (fw.x * fwdSpeed + sx * sideSpeed) * airMult;
        wz = (fw.z * fwdSpeed + sz * sideSpeed) * airMult;
      }
    }
    if (f.state === 'dodge') {
      const d = f.dodgeDef;
      f.dodgeFrame = (f.dodgeFrame || 0) + 1;
      const t = f.dodgeFrame / d.frames;
      const sp = d.speed * (1 - t * 0.6) * (f.flying ? 1.1 : slow);
      wx = f.dodgeDir.x * sp;
      wz = f.dodgeDir.z * sp;
    }
    if (f.state === 'attack' && f.move && f.move.anchored) {
      wx = 0;
      wz = 0;
    }
    f.walkVel.x = wx;
    f.walkVel.z = wz;

    // --- Knockback velocity (decays) ---
    const fr = Math.exp(-GLOBAL.knockbackFriction * DT * (f.grounded ? 1 : 0.4));
    f.pos.x += (wx + f.kv.x) * DT;
    f.pos.z += (wz + f.kv.z) * DT;
    f.kv.x *= fr;
    f.kv.z *= fr;

    // --- Vertical ---
    const isDiving = f.state === 'attack' && f.move && f.move.kind === 'dive' && f.phase === 'active';
    if (f.flying && f.state !== 'knockdown' && f.state !== 'ko') {
      const target = st.flyAltitude;
      f.pos.y += (target - f.pos.y) * Math.min(1, 6 * DT);
      f.vy = 0;
    } else if (!isDiving) {
      f.vy -= GLOBAL.gravity * DT;
      f.pos.y += f.vy * DT;
      if (f.pos.y <= 0) {
        if (f.vy < -8) this.emit({ type: 'landHeavy', f: f.index, x: f.pos.x, z: f.pos.z, v: -f.vy });
        f.pos.y = 0;
        f.vy = 0;
      }
    }

    // --- Arena bounds ---
    const R = GLOBAL.arenaRadius - f.radius;
    const d = Math.hypot(f.pos.x, f.pos.z);
    if (d > R) {
      f.pos.x *= R / d;
      f.pos.z *= R / d;
      // Slam into the invisible wall: bounce a bit
      const vOut = (f.kv.x * f.pos.x + f.kv.z * f.pos.z) / R;
      if (vOut > 0) {
        f.kv.x -= (f.pos.x / R) * vOut * 1.5;
        f.kv.z -= (f.pos.z / R) * vOut * 1.5;
        if (vOut > 8) this.emit({ type: 'wallHit', f: f.index, x: f.pos.x, z: f.pos.z });
      }
    }

    // --- Props are solid; flying into them at speed breaks them ---
    for (const p of this.arena.props) {
      if (!p.alive || p.r <= 0 || f.pos.y > 7) continue;
      const dx = f.pos.x - p.x;
      const dz = f.pos.z - p.z;
      const dd = Math.hypot(dx, dz);
      const min = p.r + f.radius * 0.8;
      if (dd < min && dd > 0.001) {
        const speed = Math.hypot(f.kv.x, f.kv.z) + (f.state === 'attack' && f.move && f.move.kind === 'charge' ? 15 : 0);
        if (speed > 7) this.damageProp(p, speed * 5);
        f.pos.x = p.x + (dx / dd) * min;
        f.pos.z = p.z + (dz / dd) * min;
      }
    }

    // --- Barriers are solid walls for the enemy ---
    for (const b of this.barriers) {
      if (b.owner === f || f.pos.y > 6) continue;
      const ps = pointSegDist2D(f.pos.x, f.pos.z, b.ax, b.az, b.bx, b.bz);
      const min = f.radius * 0.9 + 0.6;
      if (ps.d < min) {
        const nx = (f.pos.x - ps.cx) / (ps.d || 1);
        const nz = (f.pos.z - ps.cz) / (ps.d || 1);
        f.pos.x = ps.cx + nx * min;
        f.pos.z = ps.cz + nz * min;
        if (f.state === 'attack' && f.move && f.move.kind === 'charge' && !f.moveHit) {
          this.damageBarrier(b, f.move.damage, f.move.type);
          f.moveHit = true;
          this.enterRecovery(f, f.move);
        }
      }
    }

    // Footstep cadence for the renderer (distance walked)
    const sp = Math.hypot(wx, wz);
    if (f.grounded && sp > 0.5) {
      f.stepPhase += sp * DT;
    }
  }

  /** Keep the two monsters from overlapping. Heavier monsters move less. */
  separate() {
    const [a, b] = this.fighters;
    if (Math.abs(a.pos.y - b.pos.y) > Math.max(a.height, b.height) * 0.9) return;
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz) || 0.001;
    const min = (a.radius + b.radius) * 0.85;
    if (d < min) {
      const push = min - d;
      const wa = 1 / Math.max(0.3, a.def.stats.weight);
      const wb = 1 / Math.max(0.3, b.def.stats.weight);
      const ta = wb / (wa + wb);
      const tb = 1 - ta;
      a.pos.x -= (dx / d) * push * ta;
      a.pos.z -= (dz / d) * push * ta;
      b.pos.x += (dx / d) * push * tb;
      b.pos.z += (dz / d) * push * tb;
    }
  }

  /* ====================================================================== */
  /*  ROUNDS                                                                 */
  /* ====================================================================== */

  checkRoundEnd() {
    const [a, b] = this.fighters;
    if (this.cfg.timer) this.timer--;
    let winner = -1;
    let reason = null;
    if (a.state === 'ko' || b.state === 'ko') {
      if (a.state === 'ko' && b.state === 'ko') winner = a.hp >= b.hp ? 0 : 1;
      else winner = a.state === 'ko' ? 1 : 0;
      reason = 'ko';
    } else if (this.cfg.timer && this.timer <= 0) {
      const ra = a.hp / a.maxHp;
      const rb = b.hp / b.maxHp;
      winner = ra === rb ? (this.rng() < 0.5 ? 0 : 1) : ra > rb ? 0 : 1;
      reason = 'time';
    }
    if (winner >= 0) {
      this.roundWinner = winner;
      this.wins[winner]++;
      this.phase = 'roundOver';
      this.phaseTimer = 170;
      const w = this.fighters[winner];
      this.emit({ type: 'roundOver', winner, reason, perfect: w.hp >= w.maxHp });
      w.state = w.state === 'ko' ? 'ko' : 'victory';
      if (reason === 'time') this.fighters[1 - winner].state = 'ko';
    }
  }

  endRound() {
    if (this.wins[0] >= this.cfg.roundsToWin || this.wins[1] >= this.cfg.roundsToWin) {
      this.phase = 'matchOver';
      this.matchWinner = this.wins[0] > this.wins[1] ? 0 : 1;
      this.emit({ type: 'matchOver', winner: this.matchWinner });
      return;
    }
    this.startRound();
  }

  trainingRules() {
    for (const f of this.fighters) {
      if (f.state === 'ko') f.state = 'neutral';
      if (this.trainingOpts.dummyRefill && f.index === 1 && f.comboTaken === 0 && f.state === 'neutral' && this.frame - f.lastHitFrame > 90) {
        f.hp = f.maxHp;
      }
      if (f.index === 0 && f.hp < f.maxHp * 0.3 && this.frame - f.lastHitFrame > 90) f.hp = f.maxHp;
    }
  }
}
