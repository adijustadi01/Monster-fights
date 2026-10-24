// Game: the conductor. Owns the screens, the battle loop (fixed 60 Hz logic,
// variable-rate rendering), the controllers (human / AI / dummy), slow-motion
// finishes, pause, and all progression hooks (records, achievements, unlocks).

import { Battle } from './logic/battle.js';
import { AIController, DummyController } from './logic/ai.js';
import { MONSTERS, MONSTER_ORDER, GLOBAL } from './data/monsters.js';
import { ARENAS } from './data/arenas.js';
import { STORY_INTROS, SHADOW_INTRO, STORY_VICTORY, TOWER_ARENA_FOR } from './data/story.js';
import { COUNTER_WINS } from './data/achievements.js';
import { GameView } from './render/gameView.js';
import { HUD } from './ui/hud.js';
import { TouchControls } from './ui/touch.js';
import { Screens } from './ui/screens.js';
import { InputManager } from './input/input.js';
import { audio } from './audio/audio.js';
import { save, isMobile } from './save.js';

const STEP = 1 / 60;

class HumanController {
  constructor(game, player, solo) {
    this.game = game;
    this.player = player;
    this.solo = solo;
    this.human = true;
  }

  getInput() {
    return this.game.input.get(this.player, this.game.camBasis(), { solo: this.solo });
  }
}

export class Game {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#scene');
    this.ui = root.querySelector('#ui');
    this.input = new InputManager();
    this.view = new GameView(this.canvas, save.settings.quality);
    this.hud = new HUD(this.ui);
    this.touch = new TouchControls(this.ui, this.input);
    this.screens = new Screens(this);
    this.battle = null;
    this.controllers = [];
    this.paused = false;
    this.acc = 0;
    this.slowmoT = 0;
    this.introT = 0;
    this.mode = null;
    this.last = performance.now();
    this.fps = 60;
    this.isTouch = isMobile() || 'ontouchstart' in window;
    audio.setVolumes(save.settings);
    this.hud.showDamage = save.settings.damageNumbers;
    this.view.on((e) => {
      if (e.type === 'footstep' && e.heavy && this.battle) {
        this.stepSoundT = (this.stepSoundT || 0);
        if (performance.now() - this.stepSoundT > 120) {
          this.stepSoundT = performance.now();
          audio.play('step', { heavy: true });
        }
      }
    });
    this.input.onPause = () => this.togglePause();
    save.onAchievement((a) => this.screens.toastAchievement(a));
    // Unlock audio on the first interaction
    const unlock = () => {
      audio.unlock();
      if (!audio.musicOn) audio.startMusic(this.battle ? 'battle' : 'menu');
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    window.__game = this; // handy for debugging & automated tests
    this.screens.show('title');
    requestAnimationFrame((t) => this.frame(t));
  }

  get touchMode() {
    const s = save.settings.touch;
    if (s === 'on') return true;
    if (s === 'off') return false;
    return this.isTouch;
  }

  /** Horizontal camera forward vector for camera-relative movement. */
  camBasis() {
    const cam = this.view.camera;
    const t = this.view.fightCam.target;
    let fx = t.x - cam.position.x;
    let fz = t.z - cam.position.z;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    return { fx, fz };
  }

  /* ====================================================================== */
  /*  BATTLE SETUP                                                           */
  /* ====================================================================== */

  /**
   * cfg = { mode: 'story'|'versus'|'training'|'cpu',
   *         p1: { id, skin, control: 'human'|'ai'|'dummy', difficulty, shadow },
   *         p2: { ... }, arena, intro: bool }
   */
  startBattle(cfg) {
    this.cfg = cfg;
    this.mode = cfg.mode;
    this.screens.hideAll();
    const training = cfg.mode === 'training';
    this.battle = new Battle({
      p1: cfg.p1.id,
      p2: cfg.p2.id,
      p1Opts: { shadow: cfg.p1.shadow, skin: cfg.p1.skin },
      p2Opts: { shadow: cfg.p2.shadow, skin: cfg.p2.skin },
      arena: cfg.arena,
      hazards: cfg.hazards !== false,
      training,
      seed: (Math.random() * 1e9) | 0,
    });
    if (training && this.trainingOpts) Object.assign(this.battle.trainingOpts, this.trainingOpts);
    const solo = cfg.p2.control !== 'human';
    this.controllers = [cfg.p1, cfg.p2].map((p, i) => {
      if (p.control === 'human') return new HumanController(this, i, solo && i === 0);
      if (p.control === 'dummy') return new DummyController(this.battle, i, p.dummyMode || 'stand');
      return new AIController(this.battle, i, p.difficulty || 'normal', (Math.random() * 1e6) | 0);
    });
    this.view.applyQuality(save.settings.quality);
    this.view.setupBattle(this.battle, { skins: [cfg.p1.skin, cfg.p2.skin] });
    const labels = cfg.mode === 'versus' ? ['P1', 'P2'] : cfg.mode === 'training' ? ['YOU', 'DUMMY'] : ['YOU', cfg.p2.shadow ? 'BOSS' : 'CPU'];
    this.hud.setup(this.battle, labels);
    this.hud.showDamage = save.settings.damageNumbers || (training && this.trainingOpts && this.trainingOpts.damageNumbers);
    this.prevMeterFull = [false, false];
    this.paused = false;
    this.acc = 0;
    this.slowmoT = 0;
    this.matchEnded = false;
    this.trackers = { blocked: [false, false], damageTaken: [0, 0], propsDestroyed: 0 };
    audio.setMusicMode(cfg.p2.shadow ? 'boss' : 'battle');
    if (!audio.musicOn) audio.startMusic('battle');
    this.touch.setMode(null);
    if (cfg.intro !== false && !training) this.startIntro();
    else this.beginFight();
  }

  startIntro() {
    this.phase = 'intro';
    this.introStep = 0;
    this.introT = 0;
    this.hud.show(false);
    this.showIntroCard(0);
  }

  showIntroCard(i) {
    const f = this.battle.fighters[i];
    this.view.fightCam.startIntro(this.view.views[i].root.position, f.height);
    this.screens.introCard(f, i, this.cfg);
    audio.play('roar', { monster: f.id });
    this.view.views[i].f.state = 'victory';
  }

  skipIntro() {
    if (this.phase !== 'intro') return;
    this.introT = 99;
  }

  updateIntro(dt) {
    this.introT += dt;
    if (this.introT > 2.6) {
      this.battle.fighters[this.introStep].state = 'neutral';
      this.introStep++;
      this.introT = 0;
      if (this.introStep >= 2) {
        this.screens.hideIntro();
        this.view.fightCam.stopSpecial();
        this.beginFight();
        return;
      }
      this.showIntroCard(this.introStep);
    }
  }

  beginFight() {
    this.phase = 'battle';
    this.hud.show(true);
    if (this.touchMode) this.touch.setMode(this.cfg.mode === 'versus' && this.cfg.p2.control === 'human' ? 'versus' : 'solo');
    if (this.mode === 'training') this.screens.trainingBar();
    this.hud.banner(this.mode === 'training' ? 'TRAINING' : 'ROUND ' + this.battle.round, 'round', 1400);
    audio.play('gong');
  }

  quitBattle() {
    this.battle = null;
    this.phase = null;
    this.paused = false;
    this.view.teardown();
    this.hud.show(false);
    this.hud.trainingPanel(null);
    this.touch.setMode(null);
    this.screens.hideIntro();
    this.screens.hideTrainingBar();
    audio.setMusicMode('menu');
  }

  togglePause() {
    if (!this.battle || this.phase !== 'battle' || this.matchEnded) return;
    this.paused = !this.paused;
    if (this.paused) this.screens.show('pause');
    else this.screens.hideAll();
  }

  /* ====================================================================== */
  /*  MAIN LOOP                                                              */
  /* ====================================================================== */

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    this.screens.pollGamepad();

    if (!this.battle) return;

    if (this.phase === 'intro') {
      this.updateIntro(dt);
      this.view.update(dt);
      this.view.render();
      return;
    }

    let scale = 1;
    if (this.slowmoT > 0) {
      this.slowmoT -= dt;
      scale = 0.22;
    }
    if (!this.paused) {
      this.acc += dt * scale;
      let steps = 0;
      while (this.acc >= STEP && steps < 6) {
        this.stepBattle();
        this.acc -= STEP;
        steps++;
        if (!this.battle) return;
      }
      if (steps >= 6) this.acc = 0;
      this.view.update(dt * scale);
      this.hud.update(dt);
      if (this.mode === 'training') this.screens.updateTrainingPanel();
    }
    this.view.render();
  }

  stepBattle() {
    const b = this.battle;
    const inputs = this.controllers.map((c) => c.getInput());
    b.step(inputs[0], inputs[1]);
    for (const e of b.events) this.onEvent(e);
    // signature meter ready cue
    b.fighters.forEach((f, i) => {
      const full = f.meter >= GLOBAL.meterMax;
      if (full && !this.prevMeterFull[i] && b.phase === 'fight') {
        audio.play('meterFull');
        const v = this.view.views[i];
        if (v) this.popupAt(v.root.position.x, v.f.height + 3, v.root.position.z, 'SIGNATURE READY!', 'ready');
      }
      this.prevMeterFull[i] = full;
    });
    // looping stream sound
    for (const f of b.fighters) {
      if (f.state === 'attack' && f.phase === 'active' && f.move && (f.move.kind === 'stream' || f.move.kind === 'siege') && f.pf % 14 === 0) audio.play('stream');
    }
  }

  popupAt(x, y, z, text, cls = '', color = null) {
    const p = this.view.toScreen(x, y, z);
    if (!p.visible) return;
    this.hud.popup(p.x, p.y, text, cls, color);
  }

  isHuman(i) {
    return this.controllers[i] && this.controllers[i].human;
  }

  onEvent(e) {
    this.view.handleEvent(e);
    const b = this.battle;
    switch (e.type) {
      case 'hit': {
        audio.play('impact', { heavy: e.heavy, type: e.damageType });
        const p = this.view.toScreen(e.x, e.y + 1.5, e.z);
        if (e.label === 'SUPER EFFECTIVE!') {
          audio.play('superEffective');
          this.hud.popup(p.x, p.y - 30, 'SUPER EFFECTIVE!', 'big super');
          if (this.isHuman(e.att) && this.mode !== 'training') save.addCounter('superEffective');
        } else if (e.label === 'RESISTED!') {
          audio.play('resisted');
          this.hud.popup(p.x, p.y - 20, 'RESISTED!', 'resist');
        }
        if (e.weak) this.hud.popup(p.x + 40, p.y + 10, e.weak, 'weak');
        if (e.charged) this.hud.popup(p.x, p.y + 30, 'PRISM PUNCH!', 'weak');
        this.hud.damageNumber(p.x, p.y + 20, e.dmg, e.damageType);
        if (this.trackers) this.trackers.damageTaken[e.f] += e.dmg;
        if (e.combo >= 8 && e.att >= 0 && this.isHuman(e.att) && this.mode !== 'training') save.unlock('combo8');
        break;
      }
      case 'tick':
        if (this.trackers) this.trackers.damageTaken[e.f] += e.dmg;
        break;
      case 'combo':
        this.hud.combo(e.f, e.hits);
        break;
      case 'block': {
        audio.play('block', { perfect: e.perfect });
        if (e.perfect) this.popupAt(e.x, e.y + 2, e.z, 'PERFECT BLOCK!', 'weak');
        break;
      }
      case 'guard':
        if (this.trackers) this.trackers.blocked[e.f] = true;
        break;
      case 'reflect':
        audio.play('crystal', { vol: 0.8 });
        this.popupAt(e.x, e.y + 1, e.z, 'REFLECTED!', 'big reflect');
        if (this.isHuman(e.f) && this.mode !== 'training') save.addCounter('reflectedBolts');
        break;
      case 'parry':
        audio.play('crystal', { vol: 0.8 });
        this.popupAt(e.x, e.y + 2, e.z, 'PRISM REVERSAL!', 'big reflect');
        break;
      case 'moveStart': {
        const f = b.fighters[e.f];
        if (e.key === 'signature') {
          audio.play('roar', { monster: f.id });
          this.hud.banner(f.move.name.toUpperCase() + '!', 'sig side' + e.f, 1300);
          this.view.fightCam.shake(0.5);
        } else if (e.kind === 'melee' || e.kind === 'charge' || e.kind === 'dive') audio.play('whoosh', { heavy: e.key === 'heavy' });
        if (e.kind === 'grab') audio.play('wood', { vol: 0.6 });
        if (e.kind === 'decoy') audio.play('crystal', { vol: 0.5 });
        if (this.mode === 'training' && e.f === 0) this.lastMove = { key: e.key, chain: e.chain, name: e.name };
        break;
      }
      case 'swing':
        if (e.damageType === 'fire') audio.play('fireWhoosh');
        break;
      case 'slam':
      case 'quakeRing':
        audio.play('slam');
        break;
      case 'diveLand':
        audio.play('slam');
        break;
      case 'projectile':
        audio.play('zap', { vol: 0.5 });
        break;
      case 'vortex':
        audio.play('whoosh', { heavy: true });
        break;
      case 'vortexStrike':
        audio.play('thunder');
        break;
      case 'barrier':
        audio.play('wood', { vol: 0.7 });
        break;
      case 'barrierBreak':
        audio.play('crash');
        break;
      case 'decoyShatter':
        audio.play('shatter');
        this.popupAt(e.x, e.y + 4, e.z, 'DECOY!', 'resist');
        break;
      case 'cooled':
        audio.play('splash', { vol: 0.6 });
        this.popupAt(e.x, e.y + 1, e.z, 'COOLED! ARMOR CRACKED', 'big super');
        break;
      case 'reheated':
        this.popupFighter(e.f, 'ARMOR RESTORED', 'weak');
        break;
      case 'forceLand':
        this.popupAt(e.x, e.y + 3, e.z, 'GROUNDED!', 'big super');
        break;
      case 'tired':
        this.popupFighter(e.f, 'OUT OF STAMINA!', 'resist');
        break;
      case 'noStamina':
        this.popupFighter(e.f, 'TOO TIRED TO FLY', 'resist');
        break;
      case 'waterEmpty':
        this.popupFighter(e.f, 'WATER EMPTY!', 'resist');
        break;
      case 'noResource':
        this.popupFighter(e.f, 'NOT ENOUGH WATER', 'resist');
        break;
      case 'refilled':
        this.popupFighter(e.f, 'CANNONS READY', 'weak');
        break;
      case 'regenBurned':
        this.popupFighter(e.f, 'REGEN BURNED!', 'resist');
        break;
      case 'rooted':
        this.popupFighter(e.f, 'ROOTED!', 'big super');
        break;
      case 'forestLock':
        audio.play('wood', { vol: 0.9 });
        audio.play('slam');
        break;
      case 'shieldBreak':
        audio.play('shatter');
        this.popupAt(e.x, e.y + 2, e.z, 'SHIELD BREAK!', 'big super');
        break;
      case 'guardCrush':
        audio.play('crash');
        this.popupAt(e.x, e.y + 2, e.z, 'GUARD CRUSH!', 'big super');
        break;
      case 'armor':
        this.popupAt(e.x, e.y + 2, e.z, 'ARMOR!', 'resist');
        break;
      case 'interrupt':
        this.popupFighter(e.f, 'CHARGE STOPPED!', 'big super');
        break;
      case 'weakSpotOpen':
        this.popupFighter(e.f, b.fighters[e.f].id === 'korvak' ? 'VENTS EXPOSED!' : 'WEAK SPOT!', 'weak');
        break;
      case 'whiff':
        if (e.name && b.fighters[e.f].def.moves.heavy.whiffRecovery) this.popupFighter(e.f, 'WHIFF! EXPOSED', 'resist');
        break;
      case 'evade':
        this.popupFighter(e.f, 'DODGE!', 'resist');
        break;
      case 'hazardWarn':
        audio.play('warning');
        this.screens.hazardWarning(e);
        break;
      case 'hazardFire':
        if (e.hazard === 'lava') audio.play('lava');
        else if (e.hazard === 'lightning') audio.play('thunder');
        else if (e.hazard === 'wave') audio.play('wave');
        else if (e.hazard === 'gust' || e.hazard === 'surge') audio.play('whoosh', { heavy: true });
        else if (e.hazard === 'salt') audio.play('crash');
        break;
      case 'propDestroyed':
        audio.play('crash');
        if (this.mode !== 'training') save.addCounter('propsDestroyed');
        break;
      case 'roundStart':
        if (b.round > 1) {
          this.hud.banner('ROUND ' + b.round, 'round', 1400);
          audio.play('gong');
        }
        this.trackers.damageTaken = [0, 0];
        this.trackers.blockedRound = [false, false];
        this.view.views.forEach((v) => v.legsReset && v.legsReset());
        break;
      case 'fight':
        this.hud.banner('FIGHT!', 'fight', 900);
        audio.play('confirm');
        break;
      case 'ko': {
        audio.play('ko');
        this.slowmoT = 1.6;
        this.hud.banner('K.O.!', 'ko', 2200);
        const w = b.fighters[e.winner];
        if (this.isHuman(e.winner) && this.mode !== 'training' && e.finisher && w.def.moves.signature.name === e.finisher) save.unlock('signature_ko');
        break;
      }
      case 'roundOver': {
        const w = b.fighters[e.winner];
        if (e.reason === 'time') this.hud.banner('TIME!', 'ko', 1600);
        if (e.perfect) setTimeout(() => this.hud.banner('PERFECT!', 'fight', 1400), 900);
        if (this.isHuman(e.winner) && this.mode !== 'training') {
          if (this.trackers.damageTaken[e.winner] === 0 || e.perfect) save.unlock('perfect');
          if (w.hp / w.maxHp < 0.1) save.unlock('comeback');
        }
        setTimeout(() => audio.play('roar', { monster: w.id }), 600);
        break;
      }
      case 'matchOver':
        this.onMatchOver(e.winner);
        break;
      default:
        break;
    }
  }

  popupFighter(i, text, cls) {
    const v = this.view.views[i];
    if (!v) return;
    this.popupAt(v.root.position.x, v.f.pos.y + v.f.height + 2, v.root.position.z, text, cls);
  }

  /* ====================================================================== */
  /*  RESULTS & PROGRESSION                                                  */
  /* ====================================================================== */

  onMatchOver(winner) {
    this.matchEnded = true;
    const b = this.battle;
    const cfg = this.cfg;
    const humans = [0, 1].filter((i) => this.isHuman(i));
    const result = { winner, cfg, fighters: b.fighters.map((f) => ({ id: f.id, name: f.def.name, record: { ...f.record }, shadow: f.shadow })), wins: [...b.wins] };
    if (this.mode !== 'training') {
      for (const i of humans) {
        const f = b.fighters[i];
        const won = winner === i;
        save.record(f.id, won);
        if (won) {
          save.unlock('first_win');
          if (!f.record.blockUsed) save.unlock('no_block');
          const cw = COUNTER_WINS[f.id];
          const opp = b.fighters[1 - i];
          if (cw && opp.id === cw.vs) save.unlock(cw.id);
          save.arenaWin(b.arena.id);
        }
      }
      if (this.mode === 'versus') save.addCounter('versusMatches');
    }
    setTimeout(() => {
      if (this.mode === 'story') this.storyResult(winner === 0, result);
      else this.screens.show('results', result);
    }, 2600);
  }

  /* ----------------------------- Story Tower ----------------------------- */

  startTower(monster, difficulty, skin) {
    save.data.tower = { monster, difficulty, floor: 0, skin };
    save.write();
    this.screens.show('tower');
  }

  towerOpponents(monster) {
    const list = MONSTER_ORDER.filter((m) => m !== monster).map((m) => ({ id: m, shadow: false }));
    list.push({ id: monster, shadow: true });
    return list;
  }

  towerFight() {
    const t = save.data.tower;
    if (!t) return;
    const opp = this.towerOpponents(t.monster)[t.floor];
    const diffOrder = ['easy', 'normal', 'hard', 'titan'];
    let diff = t.difficulty;
    // The boss fights one level smarter (capped at Titan)
    if (opp.shadow) diff = diffOrder[Math.min(3, diffOrder.indexOf(t.difficulty) + 1)];
    this.startBattle({
      mode: 'story',
      p1: { id: t.monster, skin: t.skin, control: 'human' },
      p2: { id: opp.id, control: 'ai', difficulty: diff, shadow: opp.shadow, skin: 'default' },
      arena: opp.shadow ? TOWER_ARENA_FOR[t.monster] : TOWER_ARENA_FOR[opp.id],
    });
  }

  towerIntroText(t) {
    const opp = this.towerOpponents(t.monster)[t.floor];
    return opp.shadow ? SHADOW_INTRO(MONSTERS[t.monster].name) : STORY_INTROS[opp.id];
  }

  storyResult(won, result) {
    const t = save.data.tower;
    if (!t) return this.screens.show('results', result);
    if (won) {
      t.floor++;
      save.write();
      if (t.floor >= 5) {
        const m = t.monster;
        const d = t.difficulty;
        save.beatTower(m, d);
        this.quitBattle();
        this.screens.show('towerVictory', { monster: m, difficulty: d, text: STORY_VICTORY(MONSTERS[m].name) });
        return;
      }
    }
    this.quitBattle();
    this.screens.show('tower', { lost: !won });
  }

  /* -------------------------------- misc -------------------------------- */

  applySettings() {
    const s = save.settings;
    audio.setVolumes(s);
    this.hud.showDamage = s.damageNumbers;
    this.view.applyQuality(s.quality);
    this.view.resize();
  }

  arenaName(id) {
    return ARENAS[id].name;
  }
}
