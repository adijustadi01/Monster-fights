// Save data in the browser (localStorage): settings, Story Tower progress,
// unlocked difficulties & skins, achievements and per-monster records.

import { MONSTER_ORDER } from './data/monsters.js';
import { ACHIEVEMENTS } from './data/achievements.js';

const KEY = 'monsterFights.save.v1';

function isMobile() {
  return /Android|iPad|iPhone|iPod|Mobile|Tablet/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

function defaults() {
  const records = {};
  const skins = {};
  for (const m of MONSTER_ORDER) {
    records[m] = { w: 0, l: 0 };
    skins[m] = ['default'];
  }
  return {
    settings: { master: 0.8, music: 0.5, sfx: 0.85, quality: isMobile() ? 'low' : 'medium', damageNumbers: false, shake: true, touch: 'auto' },
    unlocked: { hard: false, titan: false },
    towerBeaten: {}, // { korvak: ['normal','hard'] }
    tower: null, // in-progress run { monster, difficulty, floor, skin }
    skins,
    skinChoice: {},
    records,
    achievements: {},
    counters: { reflectedBolts: 0, superEffective: 0, propsDestroyed: 0, versusMatches: 0 },
    arenasWon: {},
  };
}

class Save {
  constructor() {
    this.data = defaults();
    this.listeners = [];
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const def = defaults();
        this.data = { ...def, ...d, settings: { ...def.settings, ...d.settings }, counters: { ...def.counters, ...d.counters }, records: { ...def.records, ...d.records }, skins: { ...def.skins, ...d.skins } };
      }
    } catch (e) {
      console.warn('Save data unreadable, starting fresh', e);
    }
  }

  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      /* storage may be blocked (private mode) - the game still works */
    }
  }

  get settings() {
    return this.data.settings;
  }

  setSetting(k, v) {
    this.data.settings[k] = v;
    this.write();
  }

  onAchievement(fn) {
    this.listeners.push(fn);
  }

  unlock(id) {
    if (this.data.achievements[id]) return false;
    this.data.achievements[id] = Date.now();
    this.write();
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    for (const fn of this.listeners) fn(a);
    return true;
  }

  addCounter(name, n = 1) {
    this.data.counters[name] = (this.data.counters[name] || 0) + n;
    for (const a of ACHIEVEMENTS) if (a.counter === name && this.data.counters[name] >= a.goal) this.unlock(a.id);
    this.write();
  }

  record(monster, won) {
    const r = this.data.records[monster] || (this.data.records[monster] = { w: 0, l: 0 });
    if (won) r.w++;
    else r.l++;
    this.write();
  }

  arenaWin(arena) {
    this.data.arenasWon[arena] = true;
    if (Object.keys(this.data.arenasWon).length >= 5) this.unlock('all_arenas');
    this.write();
  }

  beatTower(monster, difficulty) {
    const list = this.data.towerBeaten[monster] || (this.data.towerBeaten[monster] = []);
    if (!list.includes(difficulty)) list.push(difficulty);
    // skin reward
    this.unlockSkin(monster);
    this.unlock('tower');
    this.data.unlocked.hard = true; // beating the tower on any difficulty unlocks Hard
    if (difficulty === 'hard' || difficulty === 'titan') {
      this.data.unlocked.titan = true;
      this.unlock('tower_hard');
    }
    if (difficulty === 'titan') this.unlock('tower_titan');
    if (MONSTER_ORDER.every((m) => (this.data.towerBeaten[m] || []).length)) this.unlock('tower_all');
    this.data.tower = null;
    this.write();
  }

  unlockSkin(monster) {
    const s = this.data.skins[monster] || (this.data.skins[monster] = ['default']);
    const skinIds = { korvak: 'obsidian', velumora: 'solar', oruvex: 'abyssal', canopyx: 'autumn', prismor: 'ruby' };
    if (!s.includes(skinIds[monster])) s.push(skinIds[monster]);
    this.write();
  }

  reset() {
    const settings = this.data.settings;
    this.data = defaults();
    this.data.settings = settings;
    this.write();
  }
}

export const save = new Save();
export { isMobile };
