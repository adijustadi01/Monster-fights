// Arena logic: destructible props, water areas and hazards (no rendering).
// Every hazard goes through a WARNING phase before it hurts anyone, and emits
// events so the renderer can show the warning and the effect.

import { ARENAS } from '../data/arenas.js';
import { GLOBAL } from '../data/monsters.js';

export class ArenaLogic {
  constructor(arenaId, rng, hazardsEnabled = true) {
    this.def = ARENAS[arenaId] || ARENAS.volcanic;
    this.id = this.def.id;
    this.rng = rng;
    this.hazardsEnabled = hazardsEnabled;
    this.radius = GLOBAL.arenaRadius;
    this.props = this.def.props.map((p, i) => ({ ...p, id: i, maxHp: p.hp, alive: true, hitFlash: 0 }));
    this.reset();
  }

  /** Called at the start of every round. Props stay broken across rounds (it's a battle!). */
  reset() {
    const h = this.def.hazard;
    this.t = 0;
    this.active = []; // visible hazard instances for the renderer
    this.gust = null;
    this.surge = null;
    this.wave = null;
    this.nextEvent = h.firstDelay || 300;
    if (h.kind === 'saltCrust') {
      this.patches = h.patches.map((p, i) => ({ ...p, id: i, state: 'solid', timer: 0, stand: 0 }));
    }
    if (h.kind === 'lavaVents') {
      this.vents = h.vents.map((v, i) => ({ ...v, id: i, state: 'idle', timer: 0 }));
    }
    this.strikes = [];
  }

  isInWater(x, z) {
    for (const w of this.def.water) {
      if (w.kind === 'halfplane' && (w.axis === 'z' ? z : x) >= w.min) return true;
      if (w.kind === 'band') {
        const v = w.axis === 'z' ? z : x;
        if (v >= w.min && v <= w.max) return true;
      }
    }
    return false;
  }

  /** Movement speed multiplier at a position (salt sinkholes slow you down). */
  slowAt(x, z) {
    if (!this.patches) return 1;
    const h = this.def.hazard;
    for (const p of this.patches) {
      if (p.state !== 'sink') continue;
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < h.patchRadius * h.patchRadius) return h.slowMult;
    }
    return 1;
  }

  /**
   * Advance hazards one frame.
   * battle provides: fighters, emit(evt), envHit(fighter, spec, srcX, srcZ)
   */
  update(battle) {
    this.t++;
    for (const p of this.props) if (p.hitFlash > 0) p.hitFlash--;
    const h = this.def.hazard;
    const fighters = battle.fighters;

    // Constant effects (river current, sinkhole state) run even before the first event.
    if (h.kind === 'river') this.updateRiver(battle, h, fighters);
    if (h.kind === 'saltCrust') this.updateSalt(battle, h, fighters);

    if (!this.hazardsEnabled) return;

    if (h.kind === 'lavaVents') this.updateLava(battle, h, fighters);
    else if (h.kind === 'storm') this.updateStorm(battle, h, fighters);
    else if (h.kind === 'tidalWave') this.updateWave(battle, h, fighters);
  }

  updateLava(battle, h, fighters) {
    this.nextEvent--;
    if (this.nextEvent <= 0) {
      this.nextEvent = h.cycle;
      // Pick vents nearest to the fighters so the hazard matters.
      const picks = new Set();
      for (let i = 0; i < h.ventsPerCycle; i++) {
        const target = fighters[i % fighters.length];
        let best = null;
        let bestD = 1e9;
        for (const v of this.vents) {
          if (v.state !== 'idle' || picks.has(v.id)) continue;
          const d = Math.hypot(v.x - target.pos.x, v.z - target.pos.z) + this.rng() * 8;
          if (d < bestD) {
            bestD = d;
            best = v;
          }
        }
        if (best) picks.add(best.id);
      }
      for (const v of this.vents) {
        if (picks.has(v.id)) {
          v.state = 'warn';
          v.timer = h.warning;
          battle.emit({ type: 'hazardWarn', hazard: 'lava', x: v.x, z: v.z, radius: h.radius, frames: h.warning });
        }
      }
    }
    for (const v of this.vents) {
      if (v.state === 'warn') {
        if (--v.timer <= 0) {
          v.state = 'erupt';
          v.timer = h.erupt;
          battle.emit({ type: 'hazardFire', hazard: 'lava', x: v.x, z: v.z, radius: h.radius });
        }
      } else if (v.state === 'erupt') {
        v.timer--;
        if (v.timer % h.tickEvery === 0) {
          for (const f of fighters) {
            if (f.flying || f.pos.y > 3) continue;
            const d = Math.hypot(f.pos.x - v.x, f.pos.z - v.z);
            if (d < h.radius + f.radius * 0.5) {
              battle.envHit(f, { type: h.type, damage: h.tickDamage, hitstun: 10, knockback: 4, launch: v.timer > h.erupt - h.tickEvery - 1 ? h.launch : 0 }, v.x, v.z, 'LAVA');
            }
          }
        }
        if (v.timer <= 0) v.state = 'idle';
      }
    }
  }

  updateStorm(battle, h, fighters) {
    this.nextEvent--;
    if (this.nextEvent <= 0) {
      this.nextEvent = h.lightningEvery;
      const target = fighters[Math.floor(this.rng() * fighters.length)];
      const x = target.pos.x + (this.rng() - 0.5) * 6;
      const z = target.pos.z + (this.rng() - 0.5) * 6;
      this.strikes.push({ x, z, timer: h.lightningWarning });
      battle.emit({ type: 'hazardWarn', hazard: 'lightning', x, z, radius: h.lightningRadius, frames: h.lightningWarning });
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      if (--s.timer <= 0) {
        battle.emit({ type: 'hazardFire', hazard: 'lightning', x: s.x, z: s.z, radius: h.lightningRadius });
        for (const f of fighters) {
          const d = Math.hypot(f.pos.x - s.x, f.pos.z - s.z);
          if (d < h.lightningRadius + f.radius * 0.5) {
            battle.envHit(f, { type: h.type, damage: h.lightningDamage, hitstun: 30, knockback: 6, launch: 5, knockdown: true, heavyHit: true }, s.x, s.z, 'LIGHTNING');
          }
        }
        // Lightning can topple turbines too
        for (const p of this.props) {
          if (p.alive && Math.hypot(p.x - s.x, p.z - s.z) < h.lightningRadius + p.r) battle.damageProp(p, 60);
        }
        this.strikes.splice(i, 1);
      }
    }
    // Wind gusts
    if (!this.gust && this.t % h.gustEvery === h.gustEvery - h.gustWarning) {
      const ang = this.rng() * Math.PI * 2;
      this.gust = { dx: Math.sin(ang), dz: Math.cos(ang), timer: h.gustWarning + h.gustDuration, warn: h.gustWarning };
      battle.emit({ type: 'hazardWarn', hazard: 'gust', dx: this.gust.dx, dz: this.gust.dz, frames: h.gustWarning });
    }
    if (this.gust) {
      const g = this.gust;
      g.timer--;
      if (g.timer === h.gustDuration) battle.emit({ type: 'hazardFire', hazard: 'gust', dx: g.dx, dz: g.dz });
      if (g.timer < h.gustDuration) {
        for (const f of fighters) {
          const mult = f.flying ? 1.6 : 1 / Math.max(0.4, f.def.stats.weight < 0.6 ? 2 : 1);
          f.kv.x += g.dx * h.gustForce * mult * 0.06;
          f.kv.z += g.dz * h.gustForce * mult * 0.06;
        }
      }
      if (g.timer <= 0) this.gust = null;
    }
  }

  updateWave(battle, h, fighters) {
    if (!this.wave) {
      this.nextEvent--;
      if (this.nextEvent === h.warning) {
        battle.emit({ type: 'hazardWarn', hazard: 'wave', frames: h.warning });
      }
      if (this.nextEvent <= 0) {
        this.nextEvent = h.every;
        // The wave rolls in from the sea (+z) towards the land (-z).
        this.wave = { z: this.radius + 4, hit: new Set() };
        battle.emit({ type: 'hazardFire', hazard: 'wave' });
      }
      return;
    }
    const w = this.wave;
    w.z -= h.speed / 60;
    for (const f of fighters) {
      if (w.hit.has(f.index) || f.pos.y > 5) continue;
      if (Math.abs(f.pos.z - w.z) < h.width + f.radius * 0.5) {
        w.hit.add(f.index);
        battle.envHit(f, { type: h.type, damage: h.damage, hitstun: 26, knockback: 0, launch: 3, forceLand: true }, f.pos.x, f.pos.z + 5, 'TIDAL WAVE');
        f.kv.z -= h.push;
      }
    }
    for (const p of this.props) {
      if (p.alive && !p.waveHit && Math.abs(p.z - w.z) < h.width) {
        p.waveHit = true;
        battle.damageProp(p, 50);
      }
    }
    if (w.z < -this.radius - 4) {
      this.wave = null;
      for (const p of this.props) p.waveHit = false;
    }
  }

  updateRiver(battle, h, fighters) {
    let push = h.push;
    if (this.hazardsEnabled) {
      this.nextEvent--;
      if (!this.surge && this.nextEvent === h.surgeWarning) battle.emit({ type: 'hazardWarn', hazard: 'surge', frames: h.surgeWarning });
      if (!this.surge && this.nextEvent <= 0) {
        this.nextEvent = h.surgeEvery;
        this.surge = { timer: h.surgeDuration };
        battle.emit({ type: 'hazardFire', hazard: 'surge' });
      }
      if (this.surge) {
        push = h.surgePush;
        if (--this.surge.timer <= 0) this.surge = null;
      }
    }
    for (const f of fighters) {
      if (f.flying || f.pos.y > 1) continue;
      if (f.pos.z >= h.bandMin && f.pos.z <= h.bandMax) {
        // Heavier monsters resist the current a little.
        f.pos.x += (push / 60) * (0.6 + 0.4 * Math.min(1.2, f.def.stats.weight));
      }
    }
  }

  updateSalt(battle, h, fighters) {
    for (const p of this.patches) {
      if (p.state === 'solid') {
        let someone = false;
        for (const f of fighters) {
          if (f.flying || f.pos.y > 0.5) continue;
          if (Math.hypot(f.pos.x - p.x, f.pos.z - p.z) < h.patchRadius) someone = true;
        }
        p.stand = someone ? p.stand + 1 : Math.max(0, p.stand - 1);
        if (this.hazardsEnabled && p.stand >= h.crackAfter) {
          p.state = 'crack';
          p.timer = h.warning;
          battle.emit({ type: 'hazardWarn', hazard: 'salt', x: p.x, z: p.z, radius: h.patchRadius, frames: h.warning, id: p.id });
        }
      } else if (p.state === 'crack') {
        if (--p.timer <= 0) {
          p.state = 'sink';
          p.timer = h.sinkDuration;
          battle.emit({ type: 'hazardFire', hazard: 'salt', x: p.x, z: p.z, radius: h.patchRadius, id: p.id });
        }
      } else if (p.state === 'sink') {
        if (--p.timer <= 0) {
          p.state = 'reform';
          p.timer = h.reform;
          battle.emit({ type: 'hazardEnd', hazard: 'salt', id: p.id });
        }
      } else if (p.state === 'reform') {
        if (--p.timer <= 0) {
          p.state = 'solid';
          p.stand = 0;
        }
      }
    }
  }
}
