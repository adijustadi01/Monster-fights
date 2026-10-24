// Small math helpers shared by logic (no Three.js here, so the simulation runs in Node).

export const DEG = Math.PI / 180;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Yaw convention: forward direction = (sin(yaw), cos(yaw)) on the XZ plane. */
export function yawTo(fromX, fromZ, toX, toZ) {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

export function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Distance from point p to segment ab on the XZ plane. Returns {d, t}. */
export function pointSegDist2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz || 1e-6;
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return { d: Math.sqrt(dx * dx + dz * dz), t, cx, cz };
}

/** Do 2D segments p1-p2 and q1-q2 intersect? Returns t along p (0..1) or -1. */
export function segIntersect(p1x, p1z, p2x, p2z, q1x, q1z, q2x, q2z) {
  const rx = p2x - p1x;
  const rz = p2z - p1z;
  const sx = q2x - q1x;
  const sz = q2z - q1z;
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-9) return -1;
  const qpx = q1x - p1x;
  const qpz = q1z - p1z;
  const t = (qpx * sz - qpz * sx) / denom;
  const u = (qpx * rz - qpz * rx) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return -1;
}

/** Deterministic seeded RNG (mulberry32) so simulations can be repeated. */
export function makeRng(seed = 12345) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
