// Automated balance tuner (developer tool). Adjusts, IN MEMORY, a damage scale
// per monster (its overall power) and the five counter multipliers, re-simulating
// each iteration. With --write it bakes the result into src/data/monsters.js
// (multiplying every `damage:` number of that monster) so the file stays plain numbers.
// Usage: node tools/tune.js [iterations=10] [matchesPerIteration=60] [--write]
import fs from 'fs';
import { MONSTERS, MONSTER_ORDER, FAVORABLE } from '../src/data/monsters.js';
import { runAll } from './sim.js';

const ITER = parseInt(process.argv[2] || '10', 10);
const N = parseInt(process.argv[3] || '60', 10);
const EDGE = { korvak: 'fire', velumora: 'electric', oruvex: 'water', canopyx: 'root', prismor: 'energy' };
const counterOf = {};
for (const [a, f] of Object.entries(FAVORABLE)) counterOf[f.vs] = a;

// Snapshot base damage numbers so scaling is applied from the original values
const scale = Object.fromEntries(MONSTER_ORDER.map((m) => [m, 1]));
const base = {};
function movesOf(m) {
  const mv = MONSTERS[m].moves;
  return [...mv.light, mv.heavy, mv.ability, mv.signature];
}
for (const m of MONSTER_ORDER) base[m] = movesOf(m).map((x) => ({ d: x.damage, t: x.tickDamage }));
function applyScale(m) {
  movesOf(m).forEach((x, i) => {
    x.damage = Math.round(base[m][i].d * scale[m]);
    if (base[m][i].t) x.tickDamage = Math.max(1, Math.round(base[m][i].t * scale[m]));
  });
}

let best = null;
for (let it = 0; it < ITER; it++) {
  const { results, totals } = runAll(N, 'normal', it * 7919 + 13);
  let score = 0;
  const line = [];
  for (const m of MONSTER_ORDER) {
    let err = 0;
    for (const o of MONSTER_ORDER) {
      if (o === m) continue;
      const fav = FAVORABLE[m].vs === o;
      const ctr = counterOf[m] === o;
      const target = fav ? 0.6 : ctr ? 0.4 : 0.5;
      err += results[m][o] - target;
      const lo = fav ? 0.55 : ctr ? 0.35 : 0.4;
      const hi = fav ? 0.65 : ctr ? 0.45 : 0.6;
      score += Math.max(0, lo - results[m][o], results[m][o] - hi);
    }
    err /= 4;
    line.push(`${m} ${(err * 100).toFixed(0)}% x${scale[m].toFixed(2)}`);
  }
  if (!best || score < best.score) best = { score, scale: { ...scale }, tm: Object.fromEntries(MONSTER_ORDER.map((m) => [m, { ...MONSTERS[m].typeMultipliers }])) };
  const edges = MONSTER_ORDER.map((a) => `${a.slice(0, 3)}>${FAVORABLE[a].vs.slice(0, 3)} ${(results[a][FAVORABLE[a].vs] * 100).toFixed(0)}% ${EDGE[a]}x${MONSTERS[FAVORABLE[a].vs].typeMultipliers[EDGE[a]]}`);
  console.log(`iter ${it} score ${score.toFixed(2)}: ${line.join(' | ')}\n          ${edges.join(' | ')}`);
  // update
  for (const m of MONSTER_ORDER) {
    let err = 0;
    for (const o of MONSTER_ORDER) {
      if (o === m) continue;
      const target = FAVORABLE[m].vs === o ? 0.6 : counterOf[m] === o ? 0.4 : 0.5;
      err += results[m][o] - target;
    }
    err /= 4;
    scale[m] *= 1 + Math.max(-0.06, Math.min(0.06, -err * 0.5));
    applyScale(m);
  }
  for (const a of MONSTER_ORDER) {
    const b = FAVORABLE[a].vs;
    const r = results[a][b] - 0.6;
    const tm = MONSTERS[b].typeMultipliers;
    tm[EDGE[a]] = Math.max(1.3, Math.min(2.0, +(tm[EDGE[a]] * (1 - r * 0.4)).toFixed(2)));
  }
  void totals;
}
console.log('\nBest iteration score', best.score.toFixed(2));
for (const m of MONSTER_ORDER) console.log(`  ${m}: damage x${best.scale[m].toFixed(3)} typeMultipliers ${JSON.stringify(best.tm[m])}`);

if (process.argv.includes('--write')) {
  let src = fs.readFileSync(new URL('../src/data/monsters.js', import.meta.url), 'utf8');
  const starts = MONSTER_ORDER.map((m) => src.indexOf(`  ${m}: {\n    id: '${m}'`));
  const end = src.indexOf('export const MONSTER_ORDER');
  let out = src.slice(0, starts[0]);
  MONSTER_ORDER.forEach((m, i) => {
    let block = src.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : end);
    const k = best.scale[m];
    block = block.replace(/(\b(?:damage|tickDamage): )(\d+)/g, (_, p, n) => p + Math.max(1, Math.round(parseInt(n, 10) * k)));
    block = block.replace(/typeMultipliers: \{[^}]*\}/, 'typeMultipliers: ' + JSON.stringify(best.tm[m]).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ').replace('{', '{ ').replace(/}$/, ' }'));
    out += block;
  });
  out += src.slice(end);
  fs.writeFileSync(new URL('../src/data/monsters.js', import.meta.url), out);
  console.log('Wrote src/data/monsters.js');
}
