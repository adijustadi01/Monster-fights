// Diagnostics for one matchup: where does the damage come from?
// Usage: node tools/diag.js korvak velumora [matches] [difficulty]
import { Battle } from '../src/logic/battle.js';
import { AIController } from '../src/logic/ai.js';
import { ARENA_ORDER } from '../src/data/arenas.js';

const [a, b] = [process.argv[2] || 'korvak', process.argv[3] || 'velumora'];
const N = parseInt(process.argv[4] || '40', 10);
const diff = process.argv[5] || 'normal';
const dmgBy = [{}, {}];
const stats = { wins: [0, 0], frames: 0, timeouts: 0, rounds: 0, blocks: [0, 0], sigs: [0, 0], hits: [0, 0], whiffs: [0, 0], moves: [{}, {}] };
for (let k = 0; k < N; k++) {
  const battle = new Battle({ p1: a, p2: b, arena: ARENA_ORDER[k % 5], hazards: false, seed: k + 7 });
  const ai = [new AIController(battle, 0, diff, k * 3 + 1), new AIController(battle, 1, diff, k * 3 + 2)];
  let f = 0;
  while (battle.phase !== 'matchOver' && f < 60 * 60 * 8) {
    battle.step(ai[0].getInput(), ai[1].getInput());
    for (const e of battle.events) {
      if (e.type === 'hit' && e.att >= 0) {
        const key = e.name || '?';
        dmgBy[e.att][key] = (dmgBy[e.att][key] || 0) + e.dmg;
        stats.hits[e.att]++;
      }
      if (e.type === 'block') stats.blocks[e.f]++;
      if (e.type === 'moveStart') stats.moves[e.f][e.key] = (stats.moves[e.f][e.key] || 0) + 1;
      if (e.type === 'roundOver' && e.reason === 'time') stats.timeouts++;
      if (e.type === 'roundOver') stats.rounds++;
    }
    f++;
  }
  stats.frames += f;
  stats.wins[battle.matchWinner]++;
}
console.log(`${a} vs ${b} (${diff}) x${N}: wins ${stats.wins.join(' - ')}, avg match ${(stats.frames / N / 60).toFixed(1)}s, rounds ${stats.rounds}, timeouts ${stats.timeouts}`);
for (const i of [0, 1]) {
  const name = i ? b : a;
  const tot = Object.values(dmgBy[i]).reduce((s, v) => s + v, 0);
  const parts = Object.entries(dmgBy[i]).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${(v / N).toFixed(0)}`).join(', ');
  console.log(`  ${name}: dmg/match ${(tot / N).toFixed(0)} hits ${(stats.hits[i] / N).toFixed(1)} blocks ${(stats.blocks[i] / N).toFixed(1)} | ${parts}`);
  console.log(`     moves/match: ${Object.entries(stats.moves[i]).map(([k, v]) => k + ' ' + (v / N).toFixed(1)).join(', ')}`);
}
