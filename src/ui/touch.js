// On-screen touch controls: a virtual joystick + big labelled buttons.
// Single player: joystick left, buttons right. Versus: the screen is split -
// Player 1 gets a full set on the left half, Player 2 on the right half.

const BTNS = [
  { k: 'light', label: 'LIGHT' },
  { k: 'heavy', label: 'HEAVY' },
  { k: 'ability', label: 'ABILITY' },
  { k: 'signature', label: 'SIGNATURE' },
  { k: 'jump', label: 'JUMP / FLY' },
  { k: 'block', label: 'BLOCK / DODGE' },
];

export class TouchControls {
  constructor(root, input) {
    this.root = document.createElement('div');
    this.root.className = 'touch hidden';
    root.appendChild(this.root);
    this.input = input;
    this.mode = null;
  }

  /** mode: 'solo' | 'versus' | null (hide) */
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.root.innerHTML = '';
    this.input.touch[0] = this.input.blankTouch();
    this.input.touch[1] = this.input.blankTouch();
    this.root.classList.toggle('hidden', !mode);
    if (!mode) return;
    this.root.classList.toggle('versus', mode === 'versus');
    if (mode === 'solo') this.buildSet(0, 'left', 'right');
    else {
      this.buildSet(0, 'left', 'left');
      this.buildSet(1, 'right', 'right');
    }
    const pause = document.createElement('button');
    pause.className = 'touch-pause';
    pause.textContent = 'II';
    pause.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.input.onPause) this.input.onPause();
    });
    this.root.appendChild(pause);
  }

  buildSet(player, stickSide, btnSide) {
    const set = document.createElement('div');
    set.className = `touch-set p${player + 1} ${this.mode}`;
    const stick = document.createElement('div');
    stick.className = `stick ${stickSide}`;
    stick.innerHTML = '<div class="knob"></div>';
    const btns = document.createElement('div');
    btns.className = `tbtns ${btnSide}`;
    for (const b of BTNS) {
      const e = document.createElement('div');
      e.className = `tbtn b-${b.k}`;
      e.textContent = b.label;
      btns.appendChild(e);
      this.bindButton(e, player, b.k);
    }
    set.appendChild(stick);
    set.appendChild(btns);
    if (this.mode === 'versus') {
      const tag = document.createElement('div');
      tag.className = 'touch-tag';
      tag.textContent = 'P' + (player + 1);
      set.appendChild(tag);
    }
    this.root.appendChild(set);
    this.bindStick(stick, player);
  }

  bindButton(e, player, k) {
    const t = () => this.input.touch[player];
    const down = (ev) => {
      ev.preventDefault();
      e.setPointerCapture && e.setPointerCapture(ev.pointerId);
      t()[k] = true;
      e.classList.add('on');
    };
    const up = (ev) => {
      ev.preventDefault();
      t()[k] = false;
      e.classList.remove('on');
    };
    e.addEventListener('pointerdown', down);
    e.addEventListener('pointerup', up);
    e.addEventListener('pointercancel', up);
    e.addEventListener('lostpointercapture', up);
  }

  bindStick(stick, player) {
    const knob = stick.querySelector('.knob');
    let id = null;
    let cx = 0;
    let cy = 0;
    const R = 60;
    const move = (ev) => {
      if (ev.pointerId !== id) return;
      let dx = ev.clientX - cx;
      let dy = ev.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx *= R / d;
        dy *= R / d;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const t = this.input.touch[player];
      const k = Math.min(1, d / R);
      const dead = d < 10 ? 0 : 1;
      t.mx = (dx / R) * dead;
      t.my = (-dy / R) * dead;
      void k;
    };
    stick.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      id = ev.pointerId;
      stick.setPointerCapture && stick.setPointerCapture(id);
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      move(ev);
    });
    stick.addEventListener('pointermove', move);
    const end = (ev) => {
      if (ev.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      this.input.touch[player].mx = 0;
      this.input.touch[player].my = 0;
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
  }
}
