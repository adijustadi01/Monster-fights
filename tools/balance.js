// Balance test: AI-vs-AI battles for every matchup using the logic-only
// simulation (no graphics). Usage: node tools/balance.js [battlesPerMatchup] [difficulty]
import { Battle } from '../src/logic/battle.js';
import { AIController } from '../src/logic/ai.js';
import { MONSTER_ORDER, FAVORABLE } from '../src/data/monsters.js';
import { ARENA_ORDER } from '../src/data/arenas.js';

const N = parseInt(process.argv[2] || '200', 10);
const DIFF = process.argv[3] || 'normal';
const MAX_FRAMES = 60 * 60 * 8; // safety cap per match

export function runMatch(a, b, seed, diff = DIFF) {
  const battle = new Battle({ p1: a, p2: b, arena: ARENA_ORDER[seed % ARENA_ORDER.length], hazards: false, seed });
  const ai = [new AIController(battle, 0, diff, seed * 2 + 1), new AIController(battle, 1, diff, seed * 2 + 2)];
  let frames = 0;
  while (battle.phase !== 'matchOver' && frames < MAX_FRAMES) {
    battle.step(ai[0].getInput(), ai[1].getInput());
    frames++;
  }
  return { winner: battle.matchWinner, frames, rounds: battle.round, timeouts: 0 };
}

const results = {}; // results[a][b] = wins of a vs b
const totals = {};
for (const m of MONSTER_ORDER) {
  results[m] = {};
  totals[m] = { w: 0, n: 0 };
}
const t0 = Date.now();
let totalFrames = 0;
for (let i = 0; i < MONSTER_ORDER.length; i++) {
  for (let j = i + 1; j < MONSTER_ORDER.length; j++) {
    const a = MONSTER_ORDER[i];
    const b = MONSTER_ORDER[j];
    let wa = 0;
    for (let k = 0; k < N; k++) {
      const swap = k % 2 === 1; // alternate sides to cancel any side bias
      const r = swap ? runMatch(b, a, k + 1000 * i + 100 * j) : runMatch(a, b, k + 1000 * i + 100 * j);
      totalFrames += r.frames;
      const aWon = swap ? r.winner === 1 : r.winner === 0;
      if (aWon) wa++;
    }
    results[a][b] = wa / N;
    results[b][a] = 1 - wa / N;
    totals[a].w += wa;
    totals[a].n += N;
    totals[b].w += N - wa;
    totals[b].n += N;
  }
}
const pct = (v) => (v * 100).toFixed(0).padStart(3) + '%';
console.log(`\n${N} AI-vs-AI matches per matchup (best of 3), difficulty ${DIFF}. Avg match ${(totalFrames / (N * 10) / 60).toFixed(1)}s. Took ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
console.log('Row monster win-rate vs column monster:');
console.log('            ' + MONSTER_ORDER.map((m) => m.padStart(9)).join(''));
for (const a of MONSTER_ORDER) {
  let row = a.padEnd(12);
  for (const b of MONSTER_ORDER) {
    if (a === b) row += '      -  ';
    else {
      const fav = FAVORABLE[a].vs === b ? '*' : ' ';
      row += ('   ' + pct(results[a][b]) + fav).padStart(9);
    }
  }
  row += '   overall ' + pct(totals[a].w / totals[a].n);
  console.log(row);
}
console.log('\n* = favorable matchup from the guide (target 55-65%). Others target 40-60%. Overall target <= 60%.');
let ok = true;
for (const a of MONSTER_ORDER) {
  for (const b of MONSTER_ORDER) {
    if (a === b) continue;
    const v = results[a][b];
    if (FAVORABLE[a].vs === b) {
      if (v < 0.55 || v > 0.65) { ok = false; console.log(`  OUT OF TARGET: ${a} vs ${b} (favorable) ${pct(v)}`); }
    } else if (FAVORABLE[b].vs !== a && (v < 0.4 || v > 0.6)) { ok = false; console.log(`  OUT OF TARGET: ${a} vs ${b} ${pct(v)}`); }
  }
  if (totals[a].w / totals[a].n > 0.6) { ok = false; console.log(`  OUT OF TARGET: ${a} overall`); }
}
console.log(ok ? '\nALL TARGETS MET' : '\nSome targets missed');
if (process.argv.includes('--json')) console.log(JSON.stringify({ results, totals }));
