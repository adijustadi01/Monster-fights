// Audio: every sound is synthesized with the Web Audio API (no external
// files). Includes impacts per damage type, roars, lightning, water, wood,
// crystal, UI sounds, and an epic drum-driven battle music loop.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volumes = { master: 0.8, music: 0.55, sfx: 0.85 };
    this.musicOn = false;
    this.musicMode = 'menu';
    this.loops = {};
  }

  /** Must be called from a user gesture (browser autoplay rules). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(c.destination);
    this.musicGain = c.createGain();
    this.sfxGain = c.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    // simple reverb for epic space
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.5);
    this.reverbGain = c.createGain();
    this.reverbGain.gain.value = 0.25;
    this.reverb.connect(this.reverbGain).connect(this.master);
    this.noiseBuf = this.makeNoise();
    this.applyVolumes();
    if (this.musicWanted) this.startMusic(this.musicMode);
  }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.musicGain.gain.value = this.volumes.music * 0.6;
    this.sfxGain.gain.value = this.volumes.sfx;
  }

  impulse(sec, decay) {
    const c = this.ctx;
    const len = c.sampleRate * sec;
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  makeNoise() {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* ------------------------------------------------------------------ */
  /*  Building blocks                                                    */
  /* ------------------------------------------------------------------ */

  out(dest, rev = 0) {
    const g = this.ctx.createGain();
    g.connect(dest || this.sfxGain);
    if (rev > 0) {
      const r = this.ctx.createGain();
      r.gain.value = rev;
      g.connect(r).connect(this.reverb);
    }
    return g;
  }

  tone({ type = 'sine', f0 = 220, f1 = null, dur = 0.3, vol = 0.5, attack = 0.005, dest = null, rev = 0.1, t = 0, detune = 0 }) {
    const c = this.ctx;
    const now = c.currentTime + t;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, now);
    o.detune.value = detune;
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(this.out(dest, rev));
    o.start(now);
    o.stop(now + dur + 0.05);
  }

  noise({ dur = 0.3, vol = 0.5, filter = 'lowpass', f0 = 1000, f1 = null, q = 1, attack = 0.003, dest = null, rev = 0.1, t = 0 }) {
    const c = this.ctx;
    const now = c.currentTime + t;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = c.createBiquadFilter();
    fl.type = filter;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, now);
    if (f1) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(fl).connect(g).connect(this.out(dest, rev));
    src.start(now, Math.random());
    src.stop(now + dur + 0.05);
  }

  /* ------------------------------------------------------------------ */
  /*  Sound effects                                                      */
  /* ------------------------------------------------------------------ */

  play(name, o = {}) {
    if (!this.ctx) return;
    const fn = this['s_' + name];
    if (fn) fn.call(this, o);
  }

  s_click() {
    this.tone({ type: 'triangle', f0: 880, f1: 660, dur: 0.07, vol: 0.2, rev: 0 });
  }
  s_select() {
    this.tone({ type: 'triangle', f0: 520, f1: 1040, dur: 0.18, vol: 0.25 });
    this.tone({ type: 'sine', f0: 780, f1: 1560, dur: 0.22, vol: 0.15, t: 0.05 });
  }
  s_confirm() {
    this.noise({ dur: 0.6, vol: 0.4, f0: 300, f1: 80, rev: 0.4 });
    this.tone({ type: 'sawtooth', f0: 110, f1: 55, dur: 0.6, vol: 0.3, rev: 0.4 });
  }

  s_impact({ heavy = false, type = 'physical' } = {}) {
    const v = heavy ? 0.9 : 0.5;
    // body thump
    this.tone({ type: 'sine', f0: heavy ? 120 : 180, f1: 40, dur: heavy ? 0.45 : 0.2, vol: v, rev: heavy ? 0.3 : 0.1 });
    this.noise({ dur: heavy ? 0.35 : 0.15, vol: v * 0.7, f0: heavy ? 1800 : 3000, f1: 200, rev: 0.2 });
    switch (type) {
      case 'fire':
        this.noise({ dur: 0.5, vol: 0.35, filter: 'bandpass', f0: 800, f1: 300, q: 0.7 });
        break;
      case 'electric':
        this.s_zap({ vol: 0.4 });
        break;
      case 'water':
        this.s_splash({ vol: 0.45 });
        break;
      case 'root':
        this.s_wood({ vol: 0.4 });
        break;
      case 'energy':
        this.s_crystal({ vol: 0.35 });
        break;
      case 'shockwave':
        this.tone({ type: 'sine', f0: 60, f1: 30, dur: 0.6, vol: 0.6, rev: 0.4 });
        break;
      default:
        this.noise({ dur: 0.12, vol: 0.4, filter: 'highpass', f0: 2500 });
    }
  }

  s_block({ perfect = false } = {}) {
    this.tone({ type: 'square', f0: 220, f1: 110, dur: 0.12, vol: 0.25 });
    this.noise({ dur: 0.1, vol: 0.3, filter: 'bandpass', f0: 1500, q: 2 });
    if (perfect) this.s_crystal({ vol: 0.5 });
  }

  s_whoosh({ heavy = false } = {}) {
    this.noise({ dur: heavy ? 0.4 : 0.22, vol: heavy ? 0.35 : 0.2, filter: 'bandpass', f0: 400, f1: 2400, q: 1.2, attack: 0.05 });
  }

  s_zap({ vol = 0.5 } = {}) {
    for (let i = 0; i < 4; i++) this.tone({ type: 'sawtooth', f0: 1400 + Math.random() * 1600, f1: 200, dur: 0.12, vol: vol * 0.4, t: i * 0.03, rev: 0.2 });
    this.noise({ dur: 0.25, vol: vol * 0.6, filter: 'highpass', f0: 3000, f1: 6000 });
  }

  s_thunder() {
    this.noise({ dur: 0.08, vol: 0.9, filter: 'highpass', f0: 2000 });
    this.noise({ dur: 2.2, vol: 0.8, f0: 600, f1: 60, attack: 0.02, rev: 0.6 });
    this.tone({ type: 'sine', f0: 70, f1: 30, dur: 1.5, vol: 0.6, rev: 0.5 });
  }

  s_splash({ vol = 0.5 } = {}) {
    this.noise({ dur: 0.45, vol, filter: 'bandpass', f0: 1200, f1: 400, q: 0.6, rev: 0.2 });
    for (let i = 0; i < 3; i++) this.tone({ type: 'sine', f0: 600 + Math.random() * 800, f1: 1600, dur: 0.06, vol: vol * 0.2, t: Math.random() * 0.15 });
  }

  s_wood({ vol = 0.5 } = {}) {
    this.tone({ type: 'triangle', f0: 180, f1: 90, dur: 0.18, vol, rev: 0.15 });
    this.noise({ dur: 0.2, vol: vol * 0.7, filter: 'bandpass', f0: 900, q: 3 });
  }

  s_crystal({ vol = 0.5 } = {}) {
    for (const f of [1760, 2349, 2794, 3520]) this.tone({ type: 'sine', f0: f, dur: 0.6 + Math.random() * 0.4, vol: vol * 0.25, rev: 0.5, t: Math.random() * 0.04 });
  }

  s_roar({ monster = 'korvak', vol = 0.7 } = {}) {
    const base = { korvak: 70, velumora: 300, oruvex: 110, canopyx: 90, prismor: 160 }[monster] || 100;
    const dur = 1.1;
    this.tone({ type: 'sawtooth', f0: base, f1: base * 0.6, dur, vol: vol * 0.45, attack: 0.08, rev: 0.6 });
    this.tone({ type: 'sawtooth', f0: base * 1.5, f1: base * 0.8, dur, vol: vol * 0.25, attack: 0.1, rev: 0.6, detune: 15 });
    this.noise({ dur, vol: vol * 0.5, filter: 'bandpass', f0: base * 4, f1: base * 2, q: 1.5, attack: 0.1, rev: 0.5 });
    if (monster === 'velumora') this.tone({ type: 'square', f0: 900, f1: 600, dur: 0.8, vol: 0.12, rev: 0.6 });
    if (monster === 'prismor') this.s_crystal({ vol: 0.4 });
  }

  s_step({ heavy = true } = {}) {
    this.tone({ type: 'sine', f0: heavy ? 55 : 90, f1: 30, dur: heavy ? 0.3 : 0.15, vol: heavy ? 0.45 : 0.18, rev: 0.15 });
    if (heavy) this.noise({ dur: 0.2, vol: 0.12, f0: 300 });
  }

  s_slam() {
    this.tone({ type: 'sine', f0: 90, f1: 25, dur: 1.0, vol: 1, rev: 0.6 });
    this.noise({ dur: 0.9, vol: 0.7, f0: 1200, f1: 80, rev: 0.5 });
  }

  s_fireWhoosh() {
    this.noise({ dur: 0.8, vol: 0.4, filter: 'bandpass', f0: 300, f1: 1200, q: 0.6, attack: 0.1, rev: 0.3 });
  }

  s_stream() {
    this.noise({ dur: 0.35, vol: 0.25, filter: 'bandpass', f0: 900, f1: 1300, q: 0.5, attack: 0.05 });
  }

  s_superEffective() {
    // rising fanfare + boom
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone({ type: 'square', f0: f, dur: 0.18, vol: 0.18, t: i * 0.06, rev: 0.4 }));
    this.tone({ type: 'sawtooth', f0: 1047, f1: 2093, dur: 0.4, vol: 0.15, t: 0.24, rev: 0.5 });
    this.tone({ type: 'sine', f0: 80, f1: 35, dur: 0.6, vol: 0.7, rev: 0.4 });
  }

  s_resisted() {
    this.tone({ type: 'square', f0: 200, f1: 120, dur: 0.25, vol: 0.18 });
    this.tone({ type: 'square', f0: 150, f1: 90, dur: 0.3, vol: 0.16, t: 0.1 });
  }

  s_ko() {
    this.tone({ type: 'sine', f0: 100, f1: 20, dur: 2.5, vol: 1, rev: 0.8 });
    this.noise({ dur: 2, vol: 0.8, f0: 2000, f1: 50, rev: 0.8 });
    this.tone({ type: 'sawtooth', f0: 55, f1: 40, dur: 2, vol: 0.4, rev: 0.8 });
  }

  s_gong() {
    for (const [f, v] of [[110, 0.5], [165, 0.3], [220, 0.25], [293, 0.15]]) this.tone({ type: 'sine', f0: f, f1: f * 0.98, dur: 2.5, vol: v, attack: 0.01, rev: 0.6 });
    this.noise({ dur: 0.3, vol: 0.4, f0: 3000, f1: 300 });
  }

  s_countdown() {
    this.tone({ type: 'square', f0: 440, dur: 0.15, vol: 0.2 });
  }

  s_meterFull() {
    this.tone({ type: 'triangle', f0: 660, f1: 1320, dur: 0.35, vol: 0.25, rev: 0.4 });
    this.tone({ type: 'triangle', f0: 990, f1: 1980, dur: 0.35, vol: 0.18, t: 0.08, rev: 0.4 });
  }

  s_shatter() {
    this.s_crystal({ vol: 0.6 });
    this.noise({ dur: 0.4, vol: 0.5, filter: 'highpass', f0: 3000, f1: 1500 });
  }

  s_crash() {
    this.noise({ dur: 1.2, vol: 0.8, f0: 1500, f1: 100, rev: 0.5 });
    this.tone({ type: 'sine', f0: 70, f1: 30, dur: 0.8, vol: 0.6, rev: 0.4 });
    for (let i = 0; i < 5; i++) this.noise({ dur: 0.1, vol: 0.3, filter: 'bandpass', f0: 500 + Math.random() * 2000, q: 4, t: 0.1 + Math.random() * 0.6 });
  }

  s_warning() {
    this.tone({ type: 'square', f0: 880, dur: 0.12, vol: 0.12 });
    this.tone({ type: 'square', f0: 660, dur: 0.12, vol: 0.12, t: 0.15 });
  }

  s_wave() {
    this.noise({ dur: 3, vol: 0.7, f0: 300, f1: 1500, attack: 1, rev: 0.6 });
  }

  s_lava() {
    this.noise({ dur: 1.2, vol: 0.7, f0: 400, f1: 100, rev: 0.4 });
    this.tone({ type: 'sine', f0: 60, f1: 40, dur: 1, vol: 0.5 });
  }

  s_achievement() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.3, vol: 0.2, t: i * 0.09, rev: 0.4 }));
  }

  /* ------------------------------------------------------------------ */
  /*  Music: drum-driven loop with a lookahead scheduler                  */
  /* ------------------------------------------------------------------ */

  startMusic(mode = 'battle') {
    this.musicWanted = true;
    this.musicMode = mode;
    if (!this.ctx) return;
    if (this.musicOn) return;
    this.musicOn = true;
    this.bpm = 112;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.bar = 0;
    this.timerId = setInterval(() => this.schedule(), 50);
  }

  setMusicMode(mode) {
    this.musicMode = mode;
  }

  stopMusic() {
    this.musicWanted = false;
    this.musicOn = false;
    clearInterval(this.timerId);
  }

  schedule() {
    const c = this.ctx;
    const spb = 60 / this.bpm / 4; // 16th notes
    while (this.nextTime < c.currentTime + 0.2) {
      this.playStep(this.step, this.nextTime - c.currentTime);
      this.nextTime += spb;
      this.step = (this.step + 1) % 64;
    }
  }

  drum(t, f0, f1, dur, vol) {
    this.tone({ type: 'sine', f0, f1, dur, vol, t, dest: this.musicGain, rev: 0.3 });
  }

  playStep(s, t) {
    const mode = this.musicMode;
    const battle = mode === 'battle' || mode === 'boss';
    const intense = mode === 'boss';
    const s16 = s % 16;
    const bar = Math.floor(s / 16);
    const t0 = Math.max(0, t);
    // Taiko-style big drum
    const kickPattern = battle ? [0, 3, 6, 8, 10, 14] : [0, 8];
    if (kickPattern.includes(s16)) this.drum(t0, 110, 38, 0.5, battle ? 0.7 : 0.4);
    // snare / clack
    if (battle && (s16 === 4 || s16 === 12)) this.noise({ dur: 0.18, vol: 0.35, filter: 'bandpass', f0: 1800, q: 0.8, t: t0, dest: this.musicGain, rev: 0.25 });
    if (battle && s16 % 2 === 1 && Math.random() < (intense ? 0.8 : 0.45)) this.noise({ dur: 0.05, vol: 0.08, filter: 'highpass', f0: 7000, t: t0, dest: this.musicGain });
    // tom fill at end of 4 bars
    if (battle && bar === 3 && s16 >= 12) this.drum(t0, 220 - (s16 - 12) * 30, 80, 0.25, 0.45);
    // bass drone/riff
    const roots = [55, 55, 49, 52]; // A, A, G, G#ish
    const root = roots[bar];
    if (s16 === 0) this.tone({ type: 'sawtooth', f0: root, dur: 1.9, vol: battle ? 0.22 : 0.12, attack: 0.05, t: t0, dest: this.musicGain, rev: 0.2 });
    if (battle && (s16 === 6 || s16 === 10)) this.tone({ type: 'sawtooth', f0: root * 2, dur: 0.25, vol: 0.12, t: t0, dest: this.musicGain });
    // brass stabs
    if (battle && s16 === 0 && (bar === 0 || bar === 2)) {
      for (const m of [1, 1.5, 2]) this.tone({ type: 'sawtooth', f0: root * 4 * m, dur: 0.5, vol: 0.05, attack: 0.03, t: t0, dest: this.musicGain, rev: 0.5, detune: 8 });
    }
    // menu: ambient bell
    if (!battle && s16 === 0 && bar % 2 === 0) this.tone({ type: 'sine', f0: root * 8, dur: 2.5, vol: 0.07, t: t0, dest: this.musicGain, rev: 0.7 });
    if (intense && s16 % 4 === 2) this.tone({ type: 'square', f0: root * 6, dur: 0.1, vol: 0.04, t: t0, dest: this.musicGain });
  }
}

export const audio = new AudioEngine();
