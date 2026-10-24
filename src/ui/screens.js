// All menu screens, built as DOM overlays. Navigable with mouse/touch,
// keyboard (arrows/WASD + Enter/Space/J, Esc/K = back) and gamepad.

import { MONSTERS, MONSTER_ORDER, FAVORABLE, DIFFICULTY, DAMAGE_TYPES, DAMAGE_TYPE_COLORS, GLOBAL } from '../data/monsters.js';
import { ARENAS, ARENA_ORDER } from '../data/arenas.js';
import { SKINS } from '../data/models.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { save } from '../save.js';
import { audio } from '../audio/audio.js';

const COUNTER_OF = {}; // who counters me
for (const [m, f] of Object.entries(FAVORABLE)) COUNTER_OF[f.vs] = m;

function h(strings, ...vals) {
  return strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] : ''), '');
}

function statBar(label, v) {
  let pips = '';
  for (let i = 1; i <= 5; i++) pips += `<i class="${i <= v ? 'on' : ''}"></i>`;
  return `<div class="stat"><span>${label}</span><div class="pips">${pips}</div></div>`;
}

const TYPE_ICON = { physical: '✊', fire: '🔥', electric: '⚡', water: '💧', root: '🌿', energy: '✦', shockwave: '◎' };

export class Screens {
  constructor(game) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.id = 'screen';
    game.ui.appendChild(this.root);
    this.overlay = document.createElement('div');
    this.overlay.className = 'intro-layer';
    game.ui.appendChild(this.overlay);
    this.toasts = document.createElement('div');
    this.toasts.className = 'toasts';
    game.ui.appendChild(this.toasts);
    this.warn = document.createElement('div');
    this.warn.className = 'hazard-warn';
    game.ui.appendChild(this.warn);
    this.current = null;
    this.focusIdx = 0;
    this.padPrev = {};
    this.sel = {};
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  /* ------------------------------------------------------------------ */
  /*  Navigation                                                         */
  /* ------------------------------------------------------------------ */

  navItems() {
    return Array.from(this.root.querySelectorAll('.nav:not(.disabled)')).filter((n) => n.offsetParent !== null);
  }

  focus(i) {
    const items = this.navItems();
    if (!items.length) return;
    this.focusIdx = (i + items.length) % items.length;
    items.forEach((n, k) => n.classList.toggle('focus', k === this.focusIdx));
    const n = items[this.focusIdx];
    if (n.dataset.hover) n.dispatchEvent(new Event('mouseenter'));
  }

  move(dx, dy) {
    const items = this.navItems();
    if (!items.length) return;
    const cur = items[this.focusIdx] || items[0];
    const r0 = cur.getBoundingClientRect();
    const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
    let best = -1;
    let bestScore = 1e9;
    items.forEach((n, i) => {
      if (n === cur) return;
      const r = n.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const vx = c.x - c0.x;
      const vy = c.y - c0.y;
      const along = vx * dx + vy * dy;
      if (along <= 4) return;
      const across = Math.abs(vx * dy) + Math.abs(vy * dx);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) {
      this.focus(best);
      audio.play('click');
    }
  }

  activate() {
    const items = this.navItems();
    const n = items[this.focusIdx];
    if (n) n.click();
  }

  back() {
    const b = this.root.querySelector('[data-back]');
    if (b) b.click();
  }

  onKey(e) {
    const g = this.game;
    if (g.phase === 'intro') {
      g.skipIntro();
      return;
    }
    if (this.current === 'title') {
      this.show('menu');
      audio.play('confirm');
      return;
    }
    if (!this.current || (g.battle && !g.paused && !this.root.classList.contains('active-in-battle'))) {
      if (g.mode === 'training' && g.phase === 'battle' && e.code === 'KeyT') this.toggleTrainingOptions();
      return;
    }
    const c = e.code;
    if (c === 'ArrowUp' || c === 'KeyW') this.move(0, -1);
    else if (c === 'ArrowDown' || c === 'KeyS') this.move(0, 1);
    else if (c === 'ArrowLeft' || c === 'KeyA') this.move(-1, 0);
    else if (c === 'ArrowRight' || c === 'KeyD') this.move(1, 0);
    else if (c === 'Enter' || c === 'Space' || c === 'KeyJ' || c === 'Numpad1' || c === 'NumpadEnter') {
      e.preventDefault();
      this.activate();
    } else if ((c === 'Escape' || c === 'KeyK' || c === 'Backspace' || c === 'Numpad2') && this.current !== 'pause') this.back();
  }

  pollGamepad() {
    const pads = this.game.input.pads();
    if (!pads.length) return;
    const p = pads[0];
    const st = {
      up: p.buttons[12]?.pressed || p.axes[1] < -0.6,
      down: p.buttons[13]?.pressed || p.axes[1] > 0.6,
      left: p.buttons[14]?.pressed || p.axes[0] < -0.6,
      right: p.buttons[15]?.pressed || p.axes[0] > 0.6,
      a: p.buttons[0]?.pressed,
      b: p.buttons[1]?.pressed,
    };
    const edge = (k) => st[k] && !this.padPrev[k];
    const g = this.game;
    if (g.phase === 'intro' && (edge('a') || edge('b'))) g.skipIntro();
    else if (this.current === 'title' && edge('a')) this.show('menu');
    else if (this.current && (!g.battle || g.paused || this.current === 'results' || this.current === 'tower')) {
      if (edge('up')) this.move(0, -1);
      if (edge('down')) this.move(0, 1);
      if (edge('left')) this.move(-1, 0);
      if (edge('right')) this.move(1, 0);
      if (edge('a')) this.activate();
      if (edge('b') && this.current !== 'pause') this.back();
    }
    this.padPrev = st;
  }

  /* ------------------------------------------------------------------ */

  hideAll() {
    this.root.innerHTML = '';
    this.root.className = '';
    this.current = null;
  }

  show(name, data) {
    this.current = name;
    this.root.className = 'screen-' + name;
    this.focusIdx = 0;
    const fn = this['s_' + name];
    this.root.innerHTML = '';
    fn.call(this, data);
    this.bindCommon();
    setTimeout(() => this.focus(0), 0);
  }

  bindCommon() {
    this.root.querySelectorAll('.nav').forEach((n, i) => {
      n.addEventListener('mouseenter', () => {
        const items = this.navItems();
        const k = items.indexOf(n);
        if (k >= 0) {
          this.focusIdx = k;
          items.forEach((m, j) => m.classList.toggle('focus', j === k));
        }
      });
      void i;
    });
  }

  on(sel, fn) {
    this.root.querySelectorAll(sel).forEach((n) => n.addEventListener('click', (e) => {
      audio.play('select');
      fn(n, e);
    }));
  }

  /* ------------------------------------------------------------------ */
  /*  TITLE & MENU                                                       */
  /* ------------------------------------------------------------------ */

  s_title() {
    this.root.innerHTML = h`
      <div class="bg-roster"></div>
      <div class="title-wrap">
        <div class="logo"><span>MONSTER</span><span>FIGHTS</span></div>
        <div class="tagline">FIVE TITANS. ONE ARENA.</div>
        <div class="press">${this.game.isTouch ? 'TAP TO START' : 'PRESS ANY KEY'}</div>
      </div>`;
    this.root.addEventListener('pointerdown', () => {
      if (this.current === 'title') {
        audio.play('confirm');
        this.show('menu');
      }
    }, { once: true });
  }

  s_menu() {
    this.root.innerHTML = h`
      <div class="bg-roster dim"></div>
      <div class="menu-wrap">
        <div class="logo small"><span>MONSTER</span><span>FIGHTS</span></div>
        <div class="menu-list">
          <button class="nav btn big" data-go="story">STORY TOWER<small>Climb the tower. Face your Shadow.</small></button>
          <button class="nav btn big" data-go="versus">VERSUS<small>2 players, one device. Best of 3.</small></button>
          <button class="nav btn big" data-go="training">TRAINING<small>Practice combos, frame data & matchups.</small></button>
          <div class="menu-row">
            <button class="nav btn" data-go="controls">CONTROLS</button>
            <button class="nav btn" data-go="settings">SETTINGS</button>
            <button class="nav btn" data-go="records">RECORDS</button>
          </div>
        </div>
      </div>`;
    this.on('[data-go]', (n) => {
      const go = n.dataset.go;
      if (go === 'story') {
        if (save.data.tower) this.show('tower');
        else this.show('select', { mode: 'story', step: 0 });
      } else if (go === 'versus') this.show('select', { mode: 'versus', step: 0 });
      else if (go === 'training') this.show('select', { mode: 'training', step: 0 });
      else this.show(go, { from: 'menu' });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  CHARACTER SELECT (styled like the roster board)                    */
  /* ------------------------------------------------------------------ */

  s_select(data) {
    const mode = data.mode;
    const step = data.step || 0; // versus: 0 = P1, 1 = P2. training: 0 = you, 1 = dummy
    this.sel = data;
    const title = mode === 'versus' ? (step === 0 ? 'PLAYER 1 - CHOOSE YOUR MONSTER' : 'PLAYER 2 - CHOOSE YOUR MONSTER') : mode === 'training' ? (step === 0 ? 'TRAINING - CHOOSE YOUR MONSTER' : 'CHOOSE THE TRAINING DUMMY') : 'STORY TOWER - CHOOSE YOUR MONSTER';
    const cards = MONSTER_ORDER.map((id, i) => {
      const m = MONSTERS[id];
      const taken = (mode === 'versus' || mode === 'training') && step === 1 && data.p1 && data.p1.id === id;
      return `<div class="card nav ${i < 3 ? 'top' : 'bottom'}" data-id="${id}" style="--mc:${m.color}">
        <div class="card-img" style="background-image:url(${m.image})"></div>
        <div class="card-name"><span>${m.name}</span></div>
        ${taken ? '<div class="card-tag">P1</div>' : ''}
      </div>`;
    }).join('');
    this.root.innerHTML = h`
      <div class="select-bg"></div>
      <div class="select-head"><button class="nav btn back" data-back>&larr; BACK</button><h1>${title}</h1></div>
      <div class="select-body">
        <div class="roster">${cards}</div>
        <div class="details"></div>
      </div>`;
    const showDetails = (id) => {
      this.sel.hover = id;
      this.root.querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
      this.renderDetails(id, mode, step);
    };
    this.root.querySelectorAll('.card').forEach((c) => {
      c.dataset.hover = '1';
      c.addEventListener('mouseenter', () => showDetails(c.dataset.id));
      c.addEventListener('click', () => {
        audio.play('select');
        if (this.sel.hover === c.dataset.id && this.root.querySelector('.confirm')) {
          this.root.querySelector('.confirm').click();
        } else showDetails(c.dataset.id);
      });
    });
    showDetails(data.hover || (step === 1 && data.p1 ? MONSTER_ORDER.find((m) => m !== data.p1.id) : 'korvak'));
    this.on('[data-back]', () => {
      if (step === 1) this.show('select', { mode, step: 0 });
      else this.show('menu');
    });
  }

  renderDetails(id, mode, step) {
    const m = MONSTERS[id];
    const d = this.root.querySelector('.details');
    const fav = FAVORABLE[id];
    const counter = COUNTER_OF[id];
    const rec = save.data.records[id] || { w: 0, l: 0 };
    const skins = SKINS[id];
    const owned = save.data.skins[id] || ['default'];
    const skinChoice = this.sel.skin && this.sel.skinFor === id ? this.sel.skin : save.data.skinChoice[id] || 'default';
    const skinHtml = skins.map((s) => {
      const unlocked = owned.includes(s.id);
      return `<button class="nav chip ${s.id === skinChoice ? 'on' : ''} ${unlocked ? '' : 'disabled locked'}" data-skin="${s.id}" title="${unlocked ? '' : 'Beat the Story Tower with ' + m.name + ' to unlock'}">${unlocked ? s.name : '🔒 ' + s.name}</button>`;
    }).join('');
    let extra = '';
    if (mode === 'story') {
      const diffs = ['easy', 'normal', 'hard', 'titan'];
      const cur = this.sel.difficulty || 'normal';
      extra = `<div class="diff-row"><span>DIFFICULTY</span>${diffs.map((k) => {
        const locked = (k === 'hard' && !save.data.unlocked.hard) || (k === 'titan' && !save.data.unlocked.titan);
        const tip = k === 'hard' ? 'Beat the Story Tower to unlock' : k === 'titan' ? 'Beat the Story Tower on Hard to unlock' : '';
        return `<button class="nav chip ${k === cur ? 'on' : ''} ${locked ? 'disabled locked' : ''}" data-diff="${k}" title="${locked ? tip : ''}">${locked ? '🔒 ' : ''}${DIFFICULTY[k].label}</button>`;
      }).join('')}</div>`;
    }
    if (mode === 'versus' && step === 1) {
      const ctl = this.sel.p2control || 'human';
      const cur = this.sel.difficulty || 'normal';
      extra = `<div class="diff-row"><span>PLAYER 2</span>
        <button class="nav chip ${ctl === 'human' ? 'on' : ''}" data-p2="human">HUMAN</button>
        <button class="nav chip ${ctl === 'ai' ? 'on' : ''}" data-p2="ai">CPU</button></div>
        ${ctl === 'ai' ? `<div class="diff-row"><span>CPU LEVEL</span>${['easy', 'normal', 'hard', 'titan'].map((k) => {
          const locked = (k === 'hard' && !save.data.unlocked.hard) || (k === 'titan' && !save.data.unlocked.titan);
          return `<button class="nav chip ${k === cur ? 'on' : ''} ${locked ? 'disabled locked' : ''}" data-diff="${k}">${locked ? '🔒 ' : ''}${DIFFICULTY[k].label}</button>`;
        }).join('')}</div>` : ''}`;
    }
    const sig = m.moves.signature;
    d.style.setProperty('--mc', m.color);
    d.innerHTML = h`
      <div class="d-name">${m.name}</div>
      <div class="d-title">${m.title}</div>
      <div class="d-role">${m.epithet} &middot; ${m.role}</div>
      <div class="stats">${statBar('POWER', m.displayStats.power)}${statBar('SPEED', m.displayStats.speed)}${statBar('DEFENSE', m.displayStats.defense)}${statBar('RANGE', m.displayStats.range)}</div>
      <div class="d-sig"><b>SIGNATURE: ${sig.name.toUpperCase()}</b><p>${sig.description || ''}</p></div>
      <div class="d-cols">
        <div><b>STRENGTHS</b><ul>${m.strengths.map((s) => `<li>${s}</li>`).join('')}</ul></div>
        <div><b>WEAKNESSES</b><ul>${m.weaknesses.map((s) => `<li>${s}</li>`).join('')}</ul></div>
      </div>
      <div class="d-match"><span class="good">STRONG VS ${MONSTERS[fav.vs].name}</span><span class="bad">COUNTERED BY ${MONSTERS[counter].name}</span></div>
      <div class="d-res"><b>${m.resource.label}</b> &middot; W ${rec.w} / L ${rec.l}</div>
      <div class="diff-row"><span>SKIN</span>${skinHtml}</div>
      ${extra}
      <button class="nav btn big confirm">${mode === 'story' ? 'START TOWER' : 'CONFIRM ' + m.name}</button>`;
    // bind detail controls
    d.querySelectorAll('[data-skin]').forEach((n) => n.addEventListener('click', () => {
      if (n.classList.contains('disabled')) return;
      audio.play('click');
      this.sel.skin = n.dataset.skin;
      this.sel.skinFor = id;
      save.data.skinChoice[id] = n.dataset.skin;
      save.write();
      this.renderDetails(id, mode, step);
    }));
    d.querySelectorAll('[data-diff]').forEach((n) => n.addEventListener('click', () => {
      if (n.classList.contains('disabled')) return;
      audio.play('click');
      this.sel.difficulty = n.dataset.diff;
      this.renderDetails(id, mode, step);
    }));
    d.querySelectorAll('[data-p2]').forEach((n) => n.addEventListener('click', () => {
      audio.play('click');
      this.sel.p2control = n.dataset.p2;
      this.renderDetails(id, mode, step);
    }));
    d.querySelector('.confirm').addEventListener('click', () => {
      audio.play('confirm');
      const skin = save.data.skinChoice[id] || 'default';
      if (mode === 'story') {
        this.game.startTower(id, this.sel.difficulty || 'normal', skin);
      } else if (step === 0) {
        this.show('select', { mode, step: 1, p1: { id, skin }, difficulty: this.sel.difficulty, p2control: this.sel.p2control });
      } else {
        const p1 = this.sel.p1;
        let p2skin = skin;
        if (p1.id === id && p2skin === p1.skin) p2skin = (save.data.skins[id] || []).find((s) => s !== p1.skin) || 'default';
        this.show('arena', { mode, p1, p2: { id, skin: p2skin }, p2control: this.sel.p2control || 'human', difficulty: this.sel.difficulty || 'normal' });
      }
    });
    this.bindCommon();
  }

  /* ------------------------------------------------------------------ */
  /*  ARENA SELECT                                                       */
  /* ------------------------------------------------------------------ */

  s_arena(data) {
    this.sel = data;
    const hz = data.hazards !== false;
    const cards = ARENA_ORDER.map((id) => {
      const a = ARENAS[id];
      const md = a.mood;
      return `<div class="arena-card nav" data-arena="${id}" style="background: linear-gradient(180deg, ${md.skyTop} 0%, ${md.skyMid} 45%, ${md.skyBottom} 62%, ${md.ground} 63%, ${md.ground2} 100%)">
        <div class="a-name">${a.name}</div>
        <div class="a-home">Home of ${MONSTERS[a.home].name}</div>
        <div class="a-desc">${a.description}</div>
        <div class="a-hz">⚠ ${a.hazard.label}</div>
      </div>`;
    }).join('');
    this.root.innerHTML = h`
      <div class="select-bg"></div>
      <div class="select-head"><button class="nav btn back" data-back>&larr; BACK</button><h1>CHOOSE THE ARENA</h1></div>
      <div class="arena-grid">${cards}
        <div class="arena-card nav random" data-arena="random"><div class="a-name">RANDOM</div><div class="a-desc">Let fate decide.</div></div>
      </div>
      <div class="arena-opts">
        <button class="nav chip ${hz ? 'on' : ''}" data-hz>${hz ? 'HAZARDS: ON' : 'HAZARDS: OFF'}</button>
      </div>`;
    this.on('[data-back]', () => this.show('select', { mode: data.mode, step: 1, p1: data.p1, p2control: data.p2control, difficulty: data.difficulty }));
    this.on('[data-hz]', () => this.show('arena', { ...data, hazards: !hz }));
    this.on('[data-arena]', (n) => {
      let arena = n.dataset.arena;
      if (arena === 'random') arena = ARENA_ORDER[Math.floor(Math.random() * 5)];
      this.lastArena = { ...data };
      const training = data.mode === 'training';
      this.game.startBattle({
        mode: training ? 'training' : 'versus',
        p1: { id: data.p1.id, skin: data.p1.skin, control: 'human' },
        p2: training ? { id: data.p2.id, skin: data.p2.skin, control: 'dummy', dummyMode: (this.game.trainingOpts && this.game.trainingOpts.dummyMode) || 'stand' } : { id: data.p2.id, skin: data.p2.skin, control: data.p2control === 'ai' ? 'ai' : 'human', difficulty: data.difficulty },
        arena,
        hazards: hz && !training,
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  STORY TOWER                                                        */
  /* ------------------------------------------------------------------ */

  s_tower(data = {}) {
    const t = save.data.tower;
    if (!t) return this.show('menu');
    const opps = this.game.towerOpponents(t.monster);
    const me = MONSTERS[t.monster];
    const floors = opps.map((o, i) => {
      const m = MONSTERS[o.id];
      const state = i < t.floor ? 'done' : i === t.floor ? 'current' : 'locked';
      return `<div class="floor ${state} ${o.shadow ? 'boss' : ''}" style="--mc:${m.color}">
        <div class="f-num">${o.shadow ? 'SUMMIT' : 'FLOOR ' + (i + 1)}</div>
        <div class="f-img ${o.shadow ? 'shadow' : ''}" style="background-image:url(${m.image})"></div>
        <div class="f-name">${o.shadow ? 'SHADOW ' + m.name : m.name}</div>
        <div class="f-state">${state === 'done' ? '✔ DEFEATED' : state === 'current' ? 'NEXT' : '?'}</div>
      </div>`;
    }).reverse().join('');
    this.root.innerHTML = h`
      <div class="select-bg tower-bg"></div>
      <div class="select-head"><button class="nav btn back" data-back>&larr; MENU</button><h1>STORY TOWER &middot; ${me.name} &middot; ${DIFFICULTY[t.difficulty].label}</h1></div>
      <div class="tower-body">
        <div class="tower">${floors}</div>
        <div class="tower-side" style="--mc:${MONSTERS[opps[t.floor].id].color}">
          ${data.lost ? '<div class="lost">DEFEATED! Shake it off and try again.</div>' : ''}
          <div class="story-text">${this.game.towerIntroText(t)}</div>
          <button class="nav btn big" data-fight>${data.lost ? 'RETRY FIGHT' : 'FIGHT!'}</button>
          <button class="nav btn" data-abandon>ABANDON TOWER</button>
        </div>
      </div>`;
    this.on('[data-back]', () => this.show('menu'));
    this.on('[data-fight]', () => this.game.towerFight());
    this.on('[data-abandon]', () => {
      save.data.tower = null;
      save.write();
      this.show('menu');
    });
  }

  s_towerVictory(data) {
    const m = MONSTERS[data.monster];
    const skin = SKINS[data.monster][1];
    this.root.innerHTML = h`
      <div class="victory-bg" style="background-image:url(${m.image})"></div>
      <div class="victory-wrap" style="--mc:${m.color}">
        <div class="v-title">CHAMPION!</div>
        <div class="v-name">${m.name}</div>
        <div class="story-text">${data.text}</div>
        <div class="unlocks">
          <div>🔓 HARD difficulty unlocked</div>
          ${data.difficulty === 'hard' || data.difficulty === 'titan' ? '<div>🔓 TITAN difficulty unlocked</div>' : '<div class="dim">Beat the tower on HARD to unlock TITAN</div>'}
          <div>🎨 New skin: ${skin.name}</div>
        </div>
        <button class="nav btn big" data-menu>CONTINUE</button>
      </div>`;
    audio.play('achievement');
    this.on('[data-menu]', () => this.show('menu'));
  }

  /* ------------------------------------------------------------------ */
  /*  FIGHTER INTRO                                                      */
  /* ------------------------------------------------------------------ */

  introCard(f, i, cfg) {
    const m = f.def;
    const taunt = m.taunts[Math.floor(Math.random() * m.taunts.length)];
    this.overlay.innerHTML = h`
      <div class="intro-card side${i}" style="--mc:${f.shadow ? '#ff2040' : m.color}">
        <div class="i-label">${cfg.mode === 'versus' ? 'PLAYER ' + (i + 1) : i === 0 ? 'YOU' : f.shadow ? 'FINAL BOSS' : 'CHALLENGER'}</div>
        <div class="i-name">${f.shadow ? 'SHADOW ' : ''}${m.name}</div>
        <div class="i-title">${m.title}</div>
        <div class="i-taunt">"${taunt}"</div>
      </div>
      ${i === 1 ? '<div class="i-vs">VS</div>' : ''}
      <div class="i-skip">${this.game.isTouch ? 'Tap' : 'Press any key'} to skip</div>`;
    this.overlay.classList.add('on');
    this.overlay.onpointerdown = () => this.game.skipIntro();
  }

  hideIntro() {
    this.overlay.classList.remove('on');
    this.overlay.innerHTML = '';
  }

  /* ------------------------------------------------------------------ */
  /*  PAUSE / RESULTS                                                    */
  /* ------------------------------------------------------------------ */

  s_pause() {
    this.root.classList.add('active-in-battle');
    this.root.innerHTML = h`
      <div class="pause-wrap">
        <h1>PAUSED</h1>
        <button class="nav btn big" data-resume>RESUME</button>
        <button class="nav btn" data-moves>MOVE LIST</button>
        <button class="nav btn" data-controls>CONTROLS</button>
        <button class="nav btn" data-settings>SETTINGS</button>
        ${this.game.mode === 'story' ? '' : '<button class="nav btn" data-restart>RESTART</button>'}
        <button class="nav btn" data-quit>QUIT TO MENU</button>
      </div>`;
    this.on('[data-resume]', () => this.game.togglePause());
    this.on('[data-moves]', () => this.show('moves', { from: 'pause' }));
    this.on('[data-controls]', () => this.show('controls', { from: 'pause' }));
    this.on('[data-settings]', () => this.show('settings', { from: 'pause' }));
    this.on('[data-restart]', () => this.game.startBattle({ ...this.game.cfg, intro: false }));
    this.on('[data-quit]', () => {
      this.game.quitBattle();
      this.show(this.game.mode === 'story' ? 'tower' : 'menu');
    });
  }

  s_moves(data) {
    this.root.classList.add('active-in-battle');
    const b = this.game.battle;
    const ids = b ? [...new Set(b.fighters.map((f) => f.id))] : MONSTER_ORDER;
    const rows = ids.map((id) => this.moveTable(id)).join('');
    this.root.innerHTML = h`
      <div class="panel-wrap wide">
        <div class="select-head"><button class="nav btn back" data-back>&larr; BACK</button><h1>MOVE LIST</h1></div>
        <div class="scroll">${rows}</div>
      </div>`;
    this.on('[data-back]', () => this.show(data.from || 'menu'));
  }

  moveTable(id) {
    const m = MONSTERS[id];
    const mv = m.moves;
    const row = (input, x) => `<tr><td>${input}</td><td>${x.name}</td><td style="color:${DAMAGE_TYPE_COLORS[x.type]}">${TYPE_ICON[x.type]} ${x.type}</td><td>${x.damage || '-'}</td><td>${x.startup}</td><td>${x.active}</td><td>${x.recovery}${x.whiffRecovery ? ' (' + x.whiffRecovery + ' miss)' : ''}</td><td>${x.cooldown ? (x.cooldown / 60).toFixed(1) + 's' : x.meterCost ? 'FULL METER' : ''}</td></tr>`;
    return `<div class="mv" style="--mc:${m.color}"><h2>${m.name}</h2><table>
      <tr><th>INPUT</th><th>MOVE</th><th>TYPE</th><th>DMG</th><th>STARTUP</th><th>ACTIVE</th><th>RECOVERY</th><th>COST</th></tr>
      ${mv.light.map((x, i) => row('LIGHT' + (i ? ' > LIGHT'.repeat(i) : ''), x)).join('')}
      ${row('HEAVY', mv.heavy)}${row('ABILITY', mv.ability)}${row('SIGNATURE', mv.signature)}
    </table>
    <p class="tip">Combos: LIGHT > LIGHT > HEAVY on hit. Cancel any hit into ABILITY. HEAVY can cancel into SIGNATURE when the meter is full. Frame data at 60 frames per second.</p></div>`;
  }

  s_results(r) {
    const g = this.game;
    const w = r.fighters[r.winner];
    const wm = MONSTERS[w.id];
    const label = g.mode === 'versus' ? `PLAYER ${r.winner + 1} WINS!` : r.winner === 0 ? 'YOU WIN!' : 'YOU LOSE';
    this.root.classList.add('active-in-battle');
    const statRows = (f) => `<div class="rs"><b>${f.shadow ? 'SHADOW ' : ''}${f.name}</b>
      <span>Hits ${f.record.hitsLanded}</span><span>Best combo ${f.record.maxCombo}</span><span>Super effective ${f.record.superEffective}</span><span>Blocks ${f.record.blocks}</span>${f.record.reflects ? `<span>Reflects ${f.record.reflects}</span>` : ''}</div>`;
    this.root.innerHTML = h`
      <div class="victory-bg" style="background-image:url(${wm.image})"></div>
      <div class="results-wrap" style="--mc:${wm.color}">
        <div class="v-title">${label}</div>
        <div class="v-name">${w.shadow ? 'SHADOW ' : ''}${wm.name} &middot; ${r.wins[0]} - ${r.wins[1]}</div>
        <div class="results-stats">${statRows(r.fighters[0])}${statRows(r.fighters[1])}</div>
        <div class="row">
          <button class="nav btn big" data-rematch>REMATCH</button>
          <button class="nav btn" data-change>CHANGE FIGHTER</button>
          <button class="nav btn" data-menu>MENU</button>
        </div>
      </div>`;
    this.on('[data-rematch]', () => g.startBattle({ ...g.cfg, intro: false }));
    this.on('[data-change]', () => {
      const mode = g.mode;
      g.quitBattle();
      this.show('select', { mode: mode === 'story' ? 'story' : mode, step: 0 });
    });
    this.on('[data-menu]', () => {
      g.quitBattle();
      this.show('menu');
    });
  }

  /* ------------------------------------------------------------------ */
  /*  CONTROLS (with pictures)                                           */
  /* ------------------------------------------------------------------ */

  s_controls(data = {}) {
    if (data.from === 'pause') this.root.classList.add('active-in-battle');
    const key = (k, cls = '') => `<span class="key ${cls}">${k}</span>`;
    const kb = (p) => p === 1 ? h`
      <div class="kb">
        <div class="kb-move">${key('W')}<div>${key('A')}${key('S')}${key('D')}</div><small>MOVE</small></div>
        <div class="kb-acts">
          <div>${key('J', 'a-light')} LIGHT</div><div>${key('K', 'a-heavy')} HEAVY</div><div>${key('L', 'a-ability')} ABILITY</div>
          <div>${key('I', 'a-sig')} SIGNATURE</div><div>${key('SPACE', 'wide a-jump')} JUMP / FLY</div><div>${key('L-SHIFT', 'wide a-block')} BLOCK (+ move = DODGE)</div>
        </div></div>` : h`
      <div class="kb">
        <div class="kb-move">${key('↑')}<div>${key('←')}${key('↓')}${key('→')}</div><small>MOVE</small></div>
        <div class="kb-acts">
          <div>${key('NUM 1', 'a-light')} LIGHT</div><div>${key('NUM 2', 'a-heavy')} HEAVY</div><div>${key('NUM 3', 'a-ability')} ABILITY</div>
          <div>${key('NUM 5', 'a-sig')} SIGNATURE</div><div>${key('R-CTRL', 'wide a-jump')} JUMP / FLY</div><div>${key('NUM 0', 'wide a-block')} BLOCK (+ move = DODGE)</div>
        </div></div>`;
    const pad = h`
      <svg viewBox="0 0 320 190" class="pad">
        <path d="M60 40 Q160 15 260 40 Q310 55 305 120 Q300 175 255 170 Q225 165 205 130 L115 130 Q95 165 65 170 Q20 175 15 120 Q10 55 60 40Z" fill="#1d2433" stroke="#7fa8ff" stroke-width="3"/>
        <circle cx="95" cy="95" r="22" fill="#0d1220" stroke="#aaa"/><text x="95" y="135" class="pl">MOVE</text>
        <rect x="70" y="50" width="16" height="16" fill="#333"/><text x="78" y="62" class="pk">+</text>
        <circle cx="230" cy="110" r="12" fill="#3a9a3a"/><text x="230" y="114" class="pk">A</text>
        <circle cx="255" cy="85" r="12" fill="#c83a3a"/><text x="255" y="89" class="pk">B</text>
        <circle cx="205" cy="85" r="12" fill="#3a6ac8"/><text x="205" y="89" class="pk">X</text>
        <circle cx="230" cy="60" r="12" fill="#c8a83a"/><text x="230" y="64" class="pk">Y</text>
        <rect x="45" y="18" width="60" height="14" rx="6" fill="#555"/><text x="75" y="29" class="pk">LB/LT</text>
        <rect x="215" y="18" width="60" height="14" rx="6" fill="#555"/><text x="245" y="29" class="pk">RB/RT</text>
      </svg>
      <div class="pad-legend"><span><b class="g">A</b> JUMP / FLY</span><span><b class="b2">X</b> LIGHT</span><span><b class="y">Y</b> HEAVY</span><span><b class="r">B</b> ABILITY</span><span><b>RB / RT</b> SIGNATURE</span><span><b>LB / LT</b> BLOCK (+ stick = DODGE)</span><span><b>START</b> PAUSE</span></div>`;
    const touch = h`
      <div class="touch-demo">
        <div class="td-screen">
          <div class="td-stick"></div>
          <div class="td-btns"><i>L</i><i>H</i><i>A</i><i>S</i><i>J</i><i>B</i></div>
        </div>
        <p>Left thumb: joystick. Right thumb: LIGHT, HEAVY, ABILITY, SIGNATURE, JUMP, BLOCK. In Versus the screen splits: Player 1 uses the left half, Player 2 the right half.</p>
      </div>`;
    this.root.innerHTML = h`
      <div class="select-bg"></div>
      <div class="panel-wrap wide">
        <div class="select-head"><button class="nav btn back" data-back>&larr; BACK</button><h1>CONTROLS</h1></div>
        <div class="scroll controls">
          <div class="ctl-grid">
            <div class="ctl"><h2>PLAYER 1 &middot; KEYBOARD</h2>${kb(1)}</div>
            <div class="ctl"><h2>PLAYER 2 &middot; KEYBOARD</h2>${kb(2)}</div>
            <div class="ctl"><h2>GAMEPAD (1 per player)</h2>${pad}</div>
            <div class="ctl"><h2>TABLET / TOUCH</h2>${touch}</div>
          </div>
          <div class="ctl tips"><h2>HOW TO FIGHT</h2><ul>
            <li><b>Combos:</b> LIGHT &gt; LIGHT &gt; LIGHT, or LIGHT &gt; LIGHT &gt; HEAVY. Press the next button right after a hit lands.</li>
            <li><b>Cancel:</b> after any hit, press ABILITY to cancel straight into it. Skilled players: HEAVY &gt; SIGNATURE.</li>
            <li><b>Block</b> holds a guard (front only). <b>Block + direction</b> = quick dodge with invincibility.</li>
            <li><b>Signature Move</b> needs a full meter. The meter fills when you deal AND take damage.</li>
            <li><b>Counters:</b> hit a monster with its weakness for <span class="se">SUPER EFFECTIVE!</span> damage. RESISTED means pick another attack.</li>
            <li><b>Read the wind-up:</b> big attacks glow before they hit. Jump shockwaves, dodge roots, punish whiffs.</li>
            <li><b>Velumora:</b> JUMP takes off and lands. Flying uses stamina. <b>Prismor:</b> block right before a bolt hits to reflect it.</li>
            <li><b>Pause:</b> Esc / P / START, or the II button on touch.</li>
          </ul></div>
        </div>
      </div>`;
    this.on('[data-back]', () => this.show(data.from || 'menu'));
  }

  /* ------------------------------------------------------------------ */
  /*  SETTINGS                                                           */
  /* ------------------------------------------------------------------ */

  s_settings(data = {}) {
    if (data.from === 'pause') this.root.classList.add('active-in-battle');
    const s = save.settings;
    const slider = (k, label) => `<label class="setting"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${s[k]}" data-vol="${k}"><b>${Math.round(s[k] * 100)}</b></label>`;
    const choice = (k, label, opts) => `<div class="setting"><span>${label}</span>${opts.map(([v, t]) => `<button class="nav chip ${s[k] === v ? 'on' : ''}" data-set="${k}" data-val="${v}">${t}</button>`).join('')}</div>`;
    this.root.innerHTML = h`
      <div class="select-bg"></div>
      <div class="panel-wrap">
        <div class="select-head"><button class="nav btn back" data-back>&larr; BACK</button><h1>SETTINGS</h1></div>
        <div class="settings">
          ${slider('master', 'MASTER VOLUME')}${slider('music', 'MUSIC')}${slider('sfx', 'SOUND EFFECTS')}
          ${choice('quality', 'GRAPHICS QUALITY', [['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']])}
          ${choice('damageNumbers', 'DAMAGE NUMBERS', [[true, 'ON'], [false, 'OFF']])}
          ${choice('touch', 'TOUCH CONTROLS', [['auto', 'AUTO'], ['on', 'ON'], ['off', 'OFF']])}
          <div class="setting"><span>SAVE DATA</span><button class="nav chip danger" data-reset>RESET PROGRESS</button></div>
          <p class="tip">Quality LOW is best for tablets (30+ fps). Changes to quality fully apply from the next battle. FPS now: ${Math.round(this.game.fps)}</p>
        </div>
      </div>`;
    this.root.querySelectorAll('[data-vol]').forEach((inp) => inp.addEventListener('input', () => {
      save.setSetting(inp.dataset.vol, parseFloat(inp.value));
      inp.nextElementSibling.textContent = Math.round(inp.value * 100);
      this.game.applySettings();
    }));
    this.on('[data-set]', (n) => {
      let v = n.dataset.val;
      if (v === 'true') v = true;
      if (v === 'false') v = false;
      save.setSetting(n.dataset.set, v);
      this.game.applySettings();
      this.show('settings', data);
    });
    this.on('[data-reset]', (n) => {
      if (n.dataset.confirm) {
        save.reset();
        this.show('settings', data);
      } else {
        n.dataset.confirm = '1';
        n.textContent = 'PRESS AGAIN TO CONFIRM';
      }
    });
    this.on('[data-back]', () => this.show(data.from || 'menu'));
  }

  /* ------------------------------------------------------------------ */
  /*  RECORDS & ACHIEVEMENTS                                             */
  /* ------------------------------------------------------------------ */

  s_records(data = {}) {
    const recs = MONSTER_ORDER.map((id) => {
      const m = MONSTERS[id];
      const r = save.data.records[id] || { w: 0, l: 0 };
      const beaten = (save.data.towerBeaten[id] || []).map((d) => DIFFICULTY[d].label).join(', ') || '-';
      return `<tr style="--mc:${m.color}"><td class="mname">${m.name}</td><td>${r.w}</td><td>${r.l}</td><td>${r.w + r.l ? Math.round((100 * r.w) / (r.w + r.l)) + '%' : '-'}</td><td>${beaten}</td><td>${(save.data.skins[id] || []).length}/2</td></tr>`;
    }).join('');
    const ach = ACHIEVEMENTS.map((a) => {
      const got = !!save.data.achievements[a.id];
      const prog = a.counter ? ` (${Math.min(a.goal, save.data.counters[a.counter] || 0)}/${a.goal})` : '';
      return `<div class="ach ${got ? 'got' : ''}"><b>${got ? '🏆' : '🔒'} ${a.name}</b><span>${a.desc}${got ? '' : prog}</span></div>`;
    }).join('');
    const count = Object.keys(save.data.achievements).length;
    this.root.innerHTML = h`
      <div class="select-bg"></div>
      <div class="panel-wrap wide">
        <div class="select-head"><button class="nav btn back" data-back>&larr; BACK</button><h1>RECORDS &amp; ACHIEVEMENTS</h1></div>
        <div class="scroll">
          <table class="records"><tr><th>MONSTER</th><th>WINS</th><th>LOSSES</th><th>WIN %</th><th>TOWER BEATEN</th><th>SKINS</th></tr>${recs}</table>
          <h2 class="ach-h">ACHIEVEMENTS ${count}/${ACHIEVEMENTS.length}</h2>
          <div class="ach-grid">${ach}</div>
          <h2 class="ach-h">MATCHUP CHART</h2>
          ${this.matchupChart()}
        </div>
      </div>`;
    this.on('[data-back]', () => this.show(data.from || 'menu'));
  }

  matchupChart() {
    const head = DAMAGE_TYPES.map((t) => `<th style="color:${DAMAGE_TYPE_COLORS[t]}">${TYPE_ICON[t]}<br>${t}</th>`).join('');
    const rows = MONSTER_ORDER.map((id) => {
      const m = MONSTERS[id];
      const cells = DAMAGE_TYPES.map((t) => {
        const v = m.typeMultipliers[t] ?? 1;
        const cls = v >= GLOBAL.superEffectiveAt ? 'weak' : v <= GLOBAL.resistedAt ? 'res' : v > 1 ? 'weakish' : v < 1 ? 'resish' : '';
        return `<td class="${cls}">x${v}</td>`;
      }).join('');
      return `<tr><td class="mname" style="color:${m.color}">${m.name}</td>${cells}<td>${MONSTERS[FAVORABLE[id].vs].name}</td></tr>`;
    }).join('');
    return `<table class="chart"><tr><th>DAMAGE TAKEN</th>${head}<th>STRONG VS</th></tr>${rows}</table>
      <p class="tip">Red = weakness (SUPER EFFECTIVE!), blue = resistance (RESISTED!). Extra: Korvak's vents & Canopyx's core are weak spots after big attacks; Velumora's wings take extra damage while flying; water drains Korvak's armor; fire stops Canopyx healing; Prismor reflects energy & lightning.</p>`;
  }

  /* ------------------------------------------------------------------ */
  /*  TRAINING                                                           */
  /* ------------------------------------------------------------------ */

  trainingBar() {
    let bar = this.game.ui.querySelector('.training-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'training-bar';
      this.game.ui.appendChild(bar);
    }
    bar.innerHTML = `<button class="tb-opt">TRAINING OPTIONS (T)</button>`;
    bar.querySelector('.tb-opt').onclick = () => this.toggleTrainingOptions();
    if (!this.game.trainingOpts) this.game.trainingOpts = { dummyMode: 'stand', damageNumbers: true, frameData: true, chart: false, infiniteMeter: false };
    this.game.hud.showDamage = this.game.trainingOpts.damageNumbers;
    if (this.game.battle) this.game.battle.trainingOpts.infiniteMeter = this.game.trainingOpts.infiniteMeter;
  }

  hideTrainingBar() {
    const bar = this.game.ui.querySelector('.training-bar');
    if (bar) bar.remove();
    const p = this.game.ui.querySelector('.training-opts');
    if (p) p.remove();
  }

  toggleTrainingOptions() {
    let p = this.game.ui.querySelector('.training-opts');
    if (p) {
      p.remove();
      return;
    }
    const o = this.game.trainingOpts;
    p = document.createElement('div');
    p.className = 'training-opts';
    const opt = (k, label, vals) => `<div class="setting"><span>${label}</span>${vals.map(([v, t]) => `<button class="chip ${o[k] === v ? 'on' : ''}" data-k="${k}" data-v="${v}">${t}</button>`).join('')}</div>`;
    p.innerHTML = `<h2>TRAINING OPTIONS</h2>
      ${opt('dummyMode', 'DUMMY', [['stand', 'STAND'], ['block', 'BLOCK'], ['jump', 'JUMP'], ['attack', 'ATTACK'], ['cpu', 'CPU']])}
      ${opt('damageNumbers', 'DAMAGE NUMBERS', [[true, 'ON'], [false, 'OFF']])}
      ${opt('frameData', 'FRAME DATA', [[true, 'ON'], [false, 'OFF']])}
      ${opt('chart', 'MATCHUP CHART', [[true, 'ON'], [false, 'OFF']])}
      ${opt('infiniteMeter', 'INFINITE METER', [[true, 'ON'], [false, 'OFF']])}
      <button class="chip" data-close>CLOSE</button>`;
    this.game.ui.appendChild(p);
    p.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
      let v = b.dataset.v;
      if (v === 'true') v = true;
      if (v === 'false') v = false;
      o[b.dataset.k] = v;
      const g = this.game;
      g.hud.showDamage = o.damageNumbers;
      if (g.battle) {
        g.battle.trainingOpts.infiniteMeter = o.infiniteMeter;
        if (b.dataset.k === 'dummyMode' && g.controllers[1] && g.controllers[1].mode !== undefined) g.controllers[1].mode = v;
      }
      p.remove();
      this.toggleTrainingOptions();
    }));
    p.querySelector('[data-close]').onclick = () => p.remove();
  }

  updateTrainingPanel() {
    const g = this.game;
    const o = g.trainingOpts || {};
    this.trainT = (this.trainT || 0) + 1;
    if (this.trainT % 10) return;
    let html = '';
    if (o.frameData) {
      const f = g.battle.fighters[0];
      const lm = g.lastMove;
      let fd = '<i>Do an attack to see its frame data.</i>';
      if (lm) {
        const m = lm.key === 'light' ? f.def.moves.light[lm.chain] : f.def.moves[lm.key];
        const adv = m.blockstun ? m.blockstun - (m.active - 1) - m.recovery : null;
        fd = `<b>${m.name}</b> <span style="color:${DAMAGE_TYPE_COLORS[m.type]}">${m.type}</span><br>Damage ${m.damage} &middot; Startup ${m.startup}f &middot; Active ${m.active}f &middot; Recovery ${m.recovery}f${m.whiffRecovery ? ' (miss ' + m.whiffRecovery + 'f)' : ''}<br>Hitstun ${m.hitstun || '-'}f &middot; ${adv !== null ? 'On block ' + (adv >= 0 ? '+' : '') + adv + 'f' : ''}`;
      }
      const d = g.battle.fighters[1];
      html += `<div class="tp-fd">${fd}<br><span class="dim">Dummy combo taken: ${d.comboTaken} &middot; Dummy HP ${Math.round(d.hp)}</span></div>`;
    }
    if (o.chart) html += this.matchupChart();
    g.hud.trainingPanel(html || null);
  }

  /* ------------------------------------------------------------------ */
  /*  Toasts & warnings                                                  */
  /* ------------------------------------------------------------------ */

  toastAchievement(a) {
    if (!a) return;
    audio.play('achievement');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<b>🏆 ACHIEVEMENT</b><span>${a.name}</span>`;
    this.toasts.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  hazardWarning(e) {
    const names = { lava: '⚠ LAVA VENT ABOUT TO ERUPT!', lightning: '⚠ LIGHTNING STRIKE INCOMING!', gust: '⚠ WIND GUST!', wave: '⚠ TIDAL WAVE INCOMING!', surge: '⚠ RIVER SURGE!', salt: '⚠ SALT CRUST CRACKING!' };
    this.warn.textContent = names[e.hazard] || '⚠ HAZARD!';
    this.warn.classList.remove('on');
    void this.warn.offsetWidth;
    this.warn.classList.add('on');
  }
}
