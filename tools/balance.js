// Balance test: AI-vs-AI best-of-3 matches for every matchup using the
// logic-only simulation (no graphics).
// Usage: node tools/balance.js [matchesPerMatchup=200] [difficulty=normal] [--md]
import { MONSTER_ORDER, FAVORABLE, MONSTERS } from '../src/data/monsters.js';
import { runAll } from './sim.js';

const N = parseInt(process.argv[2] || '200', 10);
const DIFF = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'normal';
const t0 = Date.now();
const { results, totals, avgSeconds } = runAll(N, DIFF);
const pct = (v) => (v * 100).toFixed(0).padStart(3) + '%';
console.log(`\n${N} AI-vs-AI matches per matchup (best of 3), difficulty ${DIFF}. Avg match ${avgSeconds.toFixed(1)}s. Took ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
console.log('Row monster win-rate vs column monster:');
console.log('            ' + MONSTER_ORDER.map((m) => m.padStart(9)).join(''));
for (const a of MONSTER_ORDER) {
  let row = a.padEnd(12);
  for (const b of MONSTER_ORDER) {
    if (a === b) row += '      -  ';
    else row += ('   ' + pct(results[a][b]) + (FAVORABLE[a].vs === b ? '*' : ' ')).padStart(9);
  }
  console.log(row + '   overall ' + pct(totals[a].w / totals[a].n));
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
if (process.argv.includes('--md')) {
  console.log('\n| Win rate (row vs column) | ' + MONSTER_ORDER.map((m) => MONSTERS[m].name).join(' | ') + ' | Overall |');
  console.log('|---|' + MONSTER_ORDER.map(() => '---').join('|') + '|---|');
  for (const a of MONSTER_ORDER) {
    console.log(`| **${MONSTERS[a].name}** | ` + MONSTER_ORDER.map((b) => (a === b ? '-' : `${Math.round(results[a][b] * 100)}%${FAVORABLE[a].vs === b ? ' ★' : ''}`)).join(' | ') + ` | ${Math.round((100 * totals[a].w) / totals[a].n)}% |`);
  }
}
process.exit(0);
