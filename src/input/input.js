// Input: keyboard (2 players), gamepads (Gamepad API) and on-screen touch
// controls. Produces logic input frames with world-space movement derived
// from the camera, so "up" on the stick always means "into the screen".

import { emptyInput } from '../logic/fighter.js';

export const KEYMAP = [
  // Player 1
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], jump: ['Space'], light: ['KeyJ'], heavy: ['KeyK'], ability: ['KeyL'], signature: ['KeyI'], block: ['ShiftLeft'] },
  // Player 2
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ControlRight'], light: ['Numpad1'], heavy: ['Numpad2'], ability: ['Numpad3'], signature: ['Numpad5'], block: ['Numpad0'] },
];

// Standard gamepad layout (Xbox naming): A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7, dpad 12-15
export const PADMAP = { jump: [0], light: [2], heavy: [3], ability: [1], signature: [5, 7], block: [4, 6], pause: [9] };

const BUTTONS = ['jump', 'light', 'heavy', 'ability', 'signature', 'block'];

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.touch = [this.blankTouch(), this.blankTouch()];
    this.onPause = null;
    this.onAnyKey = null;
    this.pauseHeld = [false, false];
    this.lastDevice = 'keyboard';
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.onPause) this.onPause();
      if (this.onAnyKey) this.onAnyKey(e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  blankTouch() {
    return { mx: 0, my: 0, jump: false, light: false, heavy: false, ability: false, signature: false, block: false };
  }

  key(codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  pads() {
    if (!navigator.getGamepads) return [];
    return Array.from(navigator.getGamepads()).filter((p) => p && p.connected);
  }

  /** Raw (screen-space) input for a player: ix = right, iy = up (into screen). */
  raw(player, opts = {}) {
    const km = KEYMAP[player];
    const r = { ix: 0, iy: 0, jump: false, light: false, heavy: false, ability: false, signature: false, block: false };
    // Keyboard (in single player, P1 may also use player-2 keys)
    const maps = opts.solo ? [KEYMAP[0], KEYMAP[1]] : [km];
    for (const m of maps) {
      if (this.key(m.left)) r.ix -= 1;
      if (this.key(m.right)) r.ix += 1;
      if (this.key(m.up)) r.iy += 1;
      if (this.key(m.down)) r.iy -= 1;
      for (const b of BUTTONS) if (this.key(m[b])) r[b] = true;
    }
    // Gamepad (pad index = player index; solo: any pad)
    const pads = this.pads();
    const usePads = opts.solo ? pads : pads.filter((p, i) => i === player);
    for (const p of usePads) {
      const ax = p.axes[0] || 0;
      const ay = p.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.22) {
        r.ix += ax;
        r.iy -= ay;
        this.lastDevice = 'gamepad';
      }
      const btn = (i) => p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5);
      if (btn(12)) r.iy += 1;
      if (btn(13)) r.iy -= 1;
      if (btn(14)) r.ix -= 1;
      if (btn(15)) r.ix += 1;
      for (const b of BUTTONS) for (const i of PADMAP[b]) if (btn(i)) r[b] = true;
      const pause = btn(9);
      if (pause && !this.pauseHeld[player] && this.onPause) this.onPause();
      this.pauseHeld[player] = pause;
    }
    // Touch
    const t = this.touch[player];
    if (t) {
      r.ix += t.mx;
      r.iy += t.my;
      for (const b of BUTTONS) if (t[b]) r[b] = true;
    }
    const mag = Math.hypot(r.ix, r.iy);
    if (mag > 1) {
      r.ix /= mag;
      r.iy /= mag;
    }
    return r;
  }

  /**
   * Logic input for a player. cam = { fx, fz } horizontal forward direction of
   * the camera; movement is converted to world space relative to it.
   */
  get(player, cam, opts = {}) {
    const r = this.raw(player, opts);
    const out = emptyInput();
    const fx = cam.fx;
    const fz = cam.fz;
    // right vector = (-fz, fx)
    out.mx = -fz * r.ix + fx * r.iy;
    out.mz = fx * r.ix + fz * r.iy;
    for (const b of BUTTONS) out[b] = r[b];
    return out;
  }

  anyPadButton() {
    for (const p of this.pads()) for (const b of p.buttons) if (b.pressed) return true;
    return false;
  }
}
