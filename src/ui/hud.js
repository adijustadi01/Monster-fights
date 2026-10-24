// In-battle HUD (DOM overlay): health, signature meter, resource bar with a
// plain-language status, ability cooldown, timer, round markers, combo
// counter, "SUPER EFFECTIVE!" popups and optional damage numbers.

import { GLOBAL, FPS, DAMAGE_TYPE_COLORS } from '../data/monsters.js';

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class HUD {
  constructor(root) {
    this.root = el('div', 'hud hidden');
    root.appendChild(this.root);
    this.popLayer = el('div', 'pop-layer');
    this.root.appendChild(this.popLayer);
    this.center = el('div', 'hud-center');
    this.root.appendChild(this.center);
    this.sides = [];
    this.showDamage = false;
    this.lastHp = [0, 0];
    this.comboTimers = [0, 0];
  }

  setup(battle, labels = ['P1', 'P2']) {
    this.battle = battle;
    this.root.querySelectorAll('.hud-side, .hud-timer, .training-panel').forEach((n) => n.remove());
    this.sides = battle.fighters.map((f, i) => {
      const s = el('div', `hud-side side-${i}`);
      s.style.setProperty('--mc', f.def.color);
      s.innerHTML = `
        <div class="hud-name"><span class="tag">${labels[i]}</span> ${f.shadow ? 'SHADOW ' : ''}${f.def.name}<span class="wins"></span></div>
        <div class="bar hp"><div class="hp-lag"></div><div class="hp-fill"></div></div>
        <div class="res-row">
          <div class="res-label">${f.def.resource.label}</div>
          <div class="bar res" style="--rc:${f.def.resource.color}"><div class="res-fill"></div></div>
          <div class="ability-pip" title="Ability cooldown"><div class="pip-fill"></div><span>ABL</span></div>
        </div>
        <div class="res-status"></div>
        <div class="meter-wrap"><div class="meter-label">SIGNATURE</div><div class="bar meter"><div class="meter-fill"></div></div><div class="meter-ready">READY! ${i === 0 ? '' : ''}</div></div>
        <div class="combo hidden"><span class="combo-n"></span><span class="combo-t">HITS</span><div class="combo-rank"></div></div>
      `;
      this.root.appendChild(s);
      return {
        root: s,
        hp: s.querySelector('.hp-fill'),
        lag: s.querySelector('.hp-lag'),
        res: s.querySelector('.res-fill'),
        status: s.querySelector('.res-status'),
        meter: s.querySelector('.meter-fill'),
        meterWrap: s.querySelector('.meter-wrap'),
        pip: s.querySelector('.pip-fill'),
        wins: s.querySelector('.wins'),
        combo: s.querySelector('.combo'),
        comboN: s.querySelector('.combo-n'),
        comboRank: s.querySelector('.combo-rank'),
        lagVal: 1,
      };
    });
    this.timer = el('div', 'hud-timer', '99');
    this.root.appendChild(this.timer);
    this.timer.style.display = battle.training ? 'none' : '';
    this.popLayer.innerHTML = '';
    this.center.innerHTML = '';
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  update(dt) {
    const b = this.battle;
    if (!b) return;
    b.fighters.forEach((f, i) => {
      const s = this.sides[i];
      const hpK = Math.max(0, f.hp / f.maxHp);
      s.hp.style.transform = `scaleX(${hpK})`;
      s.hp.classList.toggle('low', hpK < 0.25);
      if (s.lagVal > hpK) s.lagVal = Math.max(hpK, s.lagVal - dt * 0.35);
      else s.lagVal = hpK;
      s.lag.style.transform = `scaleX(${s.lagVal})`;
      s.res.style.transform = `scaleX(${f.resourceFraction})`;
      const mk = f.meter / GLOBAL.meterMax;
      s.meter.style.transform = `scaleX(${mk})`;
      s.meterWrap.classList.toggle('full', mk >= 1);
      const cd = f.def.moves.ability.cooldown || 1;
      s.pip.style.transform = `scaleY(${1 - Math.min(1, f.cooldowns.ability / cd)})`;
      s.status.textContent = this.statusText(f);
      s.status.className = 'res-status ' + this.statusClass(f);
      let w = '';
      for (let k = 0; k < b.cfg.roundsToWin; k++) w += `<i class="${k < b.wins[i] ? 'on' : ''}"></i>`;
      s.wins.innerHTML = b.training ? '' : w;
      if (this.comboTimers[i] > 0) {
        this.comboTimers[i] -= dt;
        if (this.comboTimers[i] <= 0) s.combo.classList.add('hidden');
      }
    });
    const secs = Math.max(0, Math.ceil(b.timer / FPS));
    this.timer.textContent = secs;
    this.timer.classList.toggle('urgent', secs <= 10);
  }

  statusText(f) {
    const r = f.def.resource;
    switch (r.kind) {
      case 'armor':
        if (f.cooledTimer > 0) return 'COOLED! Armor cracked - takes extra damage';
        if (f.weakSpotTimer > 0) return 'VENTS EXPOSED!';
        if (f.res < 35) return 'Armor cooling...';
        return f.state === 'attack' && f.hasSuperArmor ? 'ARMORED - can\'t be interrupted' : '';
      case 'stamina':
        if (f.flying && f.res < 25) return 'Stamina low - must land soon!';
        if (f.flying) return 'FLYING';
        if (f.res < r.minToTakeOff) return 'Resting - can\'t take off yet';
        return f.res < r.max ? 'Recharging on the ground' : 'Ready to fly (Jump)';
      case 'water':
        if (f.waterLockout > 0) return f.inWater ? 'REFILLING (water: fast!) - cannons offline' : 'REFILL WINDOW - cannons offline';
        if (f.inWater) return 'In water - refilling x2';
        return f.res < 30 ? 'Water low!' : '';
      case 'regen':
        if (f.firePause > 0) return 'BURNED! Regeneration stopped';
        if (f.healing) return 'REGENERATING';
        if (f.coreExposed) return 'CORE EXPOSED!';
        return 'Avoid damage to regenerate';
      case 'shield':
        if (f.shieldBroken > 0) return 'SHIELD BROKEN!';
        if (f.prismCharge) return 'PRISM CHARGED! Next punch x2';
        if (f.guarding && f.perfectTimer > 0) return 'PERFECT BLOCK WINDOW';
        return f.res < 30 ? 'Shield energy low' : '';
      default:
        return '';
    }
  }

  statusClass(f) {
    if (f.cooledTimer > 0 || f.firePause > 0 || f.shieldBroken > 0 || f.waterLockout > 0) return 'bad';
    if (f.healing || f.prismCharge || f.weakSpotTimer > 0) return 'good';
    return '';
  }

  /** Big centered message (ROUND 1 / FIGHT! / K.O.). */
  banner(text, cls = '', ms = 1200) {
    const b = el('div', 'banner ' + cls, text);
    this.center.appendChild(b);
    setTimeout(() => b.remove(), ms);
  }

  /** Floating popup at a screen position. */
  popup(x, y, text, cls = '', color = null) {
    const p = el('div', 'popup ' + cls, text);
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    if (color) p.style.color = color;
    this.popLayer.appendChild(p);
    setTimeout(() => p.remove(), cls.includes('big') ? 1300 : 900);
  }

  damageNumber(x, y, dmg, type) {
    if (!this.showDamage) return;
    this.popup(x + (Math.random() - 0.5) * 30, y, String(dmg), 'dmg', DAMAGE_TYPE_COLORS[type]);
  }

  combo(i, hits) {
    const s = this.sides[i];
    if (!s) return;
    s.combo.classList.remove('hidden');
    s.comboN.textContent = hits;
    let rank = '';
    if (hits >= 8) rank = 'TITANIC!';
    else if (hits >= 5) rank = 'GREAT!';
    else if (hits >= 3) rank = 'GOOD!';
    if (rank && s.comboRank.textContent !== rank) {
      s.comboRank.textContent = rank;
      s.comboRank.className = 'combo-rank r' + (hits >= 8 ? 3 : hits >= 5 ? 2 : 1);
      // re-trigger animation
      void s.comboRank.offsetWidth;
      s.comboRank.classList.add('pop');
    }
    if (hits < 3) s.comboRank.textContent = '';
    s.combo.classList.remove('bump');
    void s.combo.offsetWidth;
    s.combo.classList.add('bump');
    this.comboTimers[i] = 1.4;
  }

  /** Training mode: frame data & matchup panel. */
  trainingPanel(html) {
    let p = this.root.querySelector('.training-panel');
    if (!html) {
      if (p) p.remove();
      return;
    }
    if (!p) {
      p = el('div', 'training-panel');
      this.root.appendChild(p);
    }
    p.innerHTML = html;
  }
}
