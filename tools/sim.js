// Shared logic-only simulation helpers for balance testing.
import { Battle } from '../src/logic/battle.js';
import { AIController } from '../src/logic/ai.js';
import { MONSTER_ORDER } from '../src/data/monsters.js';
import { ARENA_ORDER } from '../src/data/arenas.js';

const MAX_FRAMES = 60 * 60 * 8;

/** One best-of-3 AI-vs-AI match. Returns the winner index (0/1). */
export function runMatch(a, b, seed, diff = 'normal', diff2 = diff) {
  const battle = new Battle({ p1: a, p2: b, arena: ARENA_ORDER[seed % ARENA_ORDER.length], hazards: false, seed });
  const ai = [new AIController(battle, 0, diff, seed * 2 + 1), new AIController(battle, 1, diff2, seed * 2 + 2)];
  let frames = 0;
  while (battle.phase !== 'matchOver' && frames < MAX_FRAMES) {
    battle.step(ai[0].getInput(), ai[1].getInput());
    frames++;
  }
  return { winner: battle.matchWinner, frames };
}

/** All 10 matchups, N matches each (sides alternate). Returns results[a][b] = win rate of a. */
export function runAll(N, diff = 'normal', seedBase = 0) {
  const results = {};
  const totals = {};
  let frames = 0;
  for (const m of MONSTER_ORDER) {
    results[m] = {};
    totals[m] = { w: 0, n: 0 };
  }
  for (let i = 0; i < MONSTER_ORDER.length; i++) {
    for (let j = i + 1; j < MONSTER_ORDER.length; j++) {
      const a = MONSTER_ORDER[i];
      const b = MONSTER_ORDER[j];
      let wa = 0;
      for (let k = 0; k < N; k++) {
        const seed = seedBase + k + 1000 * i + 100 * j;
        const swap = k % 2 === 1;
        const r = swap ? runMatch(b, a, seed, diff) : runMatch(a, b, seed, diff);
        frames += r.frames;
        if (swap ? r.winner === 1 : r.winner === 0) wa++;
      }
      results[a][b] = wa / N;
      results[b][a] = 1 - wa / N;
      totals[a].w += wa;
      totals[a].n += N;
      totals[b].w += N - wa;
      totals[b].n += N;
    }
  }
  return { results, totals, avgSeconds: frames / (N * 10) / 60 };
}
