// Checks that AI difficulty levels are ordered: each level vs Normal, mirror matches.
import { MONSTER_ORDER } from '../src/data/monsters.js';
import { runMatch } from './sim.js';
const N = parseInt(process.argv[2] || '10', 10);
for (const d of ['easy', 'hard', 'titan']) {
  let w = 0;
  let n = 0;
  for (const m of MONSTER_ORDER) {
    for (let k = 0; k < N; k++) {
      const swap = k % 2;
      const r = swap ? runMatch(m, m, k + 50, 'normal', d) : runMatch(m, m, k + 50, d, 'normal');
      if (swap ? r.winner === 1 : r.winner === 0) w++;
      n++;
    }
  }
  console.log(`${d.padEnd(6)} vs normal (mirror matches): wins ${((100 * w) / n).toFixed(0)}%`);
}
