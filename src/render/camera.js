// Cinematic fight camera: low angle (makes monsters feel giant), always frames
// both fighters, zooms smoothly with distance, shakes on heavy hits, and does
// a slow-motion close-up on the finishing blow.

import * as THREE from 'three';

export class FightCamera {
  constructor(camera) {
    this.cam = camera;
    this.target = new THREE.Vector3(0, 3, 0);
    this.pos = new THREE.Vector3(0, 6, 30);
    this.side = 1;
    this.shakeAmt = 0;
    this.shakeT = 0;
    this.closeup = null; // { focus: Vector3, from: Vector3, t }
    this.intro = null;
    this.mode = 'fight';
    this.orbit = 0;
    this.portrait = false;
  }

  shake(amount) {
    this.shakeAmt = Math.min(2.2, this.shakeAmt + amount);
  }

  /** Dramatic close-up of the loser getting KO'd (winner in the background). */
  startCloseup(loserPos, winnerPos) {
    this.closeup = { loser: loserPos.clone(), winner: winnerPos.clone(), t: 0 };
  }

  /** Orbit around one monster (fighter intro / victory). */
  startIntro(pos, height) {
    this.intro = { pos: pos.clone(), h: height, t: 0 };
  }

  stopSpecial() {
    this.closeup = null;
    this.intro = null;
  }

  snap() {
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.target);
  }

  update(dt, a, b, opts = {}) {
    const cam = this.cam;
    let wantPos;
    let wantTarget;
    let lerpK = 1 - Math.exp(-4 * dt);

    if (this.intro) {
      const it = this.intro;
      it.t += dt;
      const ang = 0.6 + it.t * 0.35;
      const r = 9 + it.h * 1.6;
      wantTarget = new THREE.Vector3(it.pos.x, it.h * 0.55, it.pos.z);
      wantPos = new THREE.Vector3(it.pos.x + Math.sin(ang) * r, 1.6 + it.h * 0.15, it.pos.z + Math.cos(ang) * r);
      lerpK = 1 - Math.exp(-3 * dt);
    } else if (this.closeup) {
      const c = this.closeup;
      c.t += dt;
      const dir = new THREE.Vector3().subVectors(c.loser, c.winner).setY(0).normalize();
      const sideV = new THREE.Vector3(-dir.z, 0, dir.x);
      wantTarget = c.loser.clone().setY(2.5);
      wantPos = c.loser.clone().addScaledVector(dir, 6 + c.t * 2).addScaledVector(sideV, 9).setY(1.4);
      lerpK = 1 - Math.exp(-2.5 * dt);
    } else {
      // Fight framing
      const mid = new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const sep = Math.hypot(dx, dz) || 0.001;
      // perpendicular to the fighter axis; keep the same side as before (no flipping)
      let px = -dz / sep;
      let pz = dx / sep;
      const curDir = new THREE.Vector3().subVectors(this.pos, this.target).setY(0);
      if (curDir.x * px + curDir.z * pz < 0) {
        px = -px;
        pz = -pz;
      }
      const portraitBoost = this.portrait ? 1.55 : 1;
      const dist = Math.min(56, Math.max(14, sep * 0.82 + 10)) * portraitBoost;
      // low camera = giant monsters
      const height = 2.2 + dist * 0.1 + Math.max(a.y, b.y) * 0.35;
      // keep the camera inside a reasonable radius so scenery doesn't block it
      const lookY = 3.6 + Math.max(a.y, b.y) * 0.4;
      wantTarget = new THREE.Vector3(mid.x, lookY, mid.z);
      // slight angle from behind player 1 for depth
      const back = 0.18;
      const ax = (a.x - mid.x) / (sep / 2 || 1);
      const az = (a.z - mid.z) / (sep / 2 || 1);
      wantPos = new THREE.Vector3(mid.x + px * dist + ax * dist * back, height, mid.z + pz * dist + az * dist * back);
      // don't let the camera swing too fast when fighters cross over
      lerpK = 1 - Math.exp(-3.2 * dt);
    }

    this.pos.lerp(wantPos, lerpK);
    this.target.lerp(wantTarget, 1 - Math.exp(-6 * dt));

    cam.position.copy(this.pos);
    // shake
    if (this.shakeAmt > 0.001) {
      this.shakeT += dt * 60;
      const s = this.shakeAmt;
      cam.position.x += (Math.sin(this.shakeT * 1.7) + Math.sin(this.shakeT * 3.1)) * 0.25 * s;
      cam.position.y += (Math.sin(this.shakeT * 2.3) + Math.sin(this.shakeT * 4.7)) * 0.2 * s;
      cam.position.z += Math.sin(this.shakeT * 2.9) * 0.2 * s;
      this.shakeAmt *= Math.exp(-7 * dt);
    }
    if (cam.position.y < 0.8) cam.position.y = 0.8;
    cam.lookAt(this.target);
  }
}
