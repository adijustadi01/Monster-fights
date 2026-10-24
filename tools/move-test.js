// Logic test: every move of every monster lands on a standing dummy, plus the
// special matchup rules from the character guide. Run: node tools/move-test.js
import { Battle } from '../src/logic/battle.js';
import { emptyInput } from '../src/logic/fighter.js';
import { MONSTER_ORDER, MONSTERS } from '../src/data/monsters.js';

let failures = 0;
const check = (cond, msg) => {
  if (!cond) failures++;
  console.log((cond ? '  ok   ' : '  FAIL ') + msg);
};

function setup(a, b, dist = 4, opts = {}) {
  const battle = new Battle({ p1: a, p2: b, arena: 'volcanic', hazards: false, training: false, seed: 3 });
  battle.phase = 'fight';
  const [f, d] = battle.fighters;
  f.pos.x = -dist / 2; d.pos.x = dist / 2; f.pos.z = d.pos.z = 0;
  f.yaw = Math.PI / 2; d.yaw = -Math.PI / 2;
  if (opts.meter) f.meter = 100;
  return battle;
}

function run(battle, frames, inputA = () => emptyInput(), inputB = () => emptyInput()) {
  const events = [];
  for (let i = 0; i < frames; i++) {
    battle.step(inputA(i), inputB(i));
    events.push(...battle.events);
  }
  return events;
}

const press = (btn, at = 0, extra = {}) => (i) => ({ ...emptyInput(), ...extra, [btn]: i === at });
const hits = (ev, f = 1) => ev.filter((e) => e.type === 'hit' && e.f === f);

for (const id of MONSTER_ORDER) {
  console.log(`\n${MONSTERS[id].name}`);
  const mv = MONSTERS[id].moves;
  // Light
  let b = setup(id, 'korvak', 4.5);
  let ev = run(b, 60, press('light'));
  check(hits(ev).length === 1, `light (${mv.light[0].name}) hits`);
  // Light chain x3
  b = setup(id, 'korvak', 4.5);
  ev = run(b, 120, (i) => ({ ...emptyInput(), light: [0, 14, 28].some((t) => i === t || i === t + 1) && i % 2 === 0 }));
  const h3 = hits(ev);
  check(h3.length >= 3 && Math.max(...h3.map((e) => e.combo)) >= 3, `L > L > L combo (${h3.length} hits, combo ${Math.max(0, ...h3.map((e) => e.combo))})`);
  // L > L > H
  b = setup(id, 'korvak', 4.5);
  ev = run(b, 140, (i) => ({ ...emptyInput(), light: i === 0 || i === 14, heavy: i === 28 }));
  const hh = hits(ev);
  check(hh.length >= 3 && hh.some((e) => e.combo >= 3), `L > L > H combo (${hh.map((e) => e.name || '').length} hits, max combo ${Math.max(0, ...hh.map((e) => e.combo))})`);
  // Heavy
  const heavyDist = mv.heavy.kind === 'grab' ? 9 : mv.heavy.kind === 'charge' ? 8 : mv.heavy.kind === 'dive' ? 6 : 4.5;
  b = setup(id, 'canopyx', heavyDist);
  ev = run(b, 160, press('heavy'));
  check(hits(ev).length >= 1, `heavy (${mv.heavy.name}) hits at ${heavyDist}`);
  // Ability
  const abDist = { slam: 5, projectile: 12, stream: 10, barrier: 6, decoy: 5 }[mv.ability.kind];
  b = setup(id, 'prismor', abDist);
  ev = run(b, 160, press('ability'));
  if (mv.ability.kind === 'barrier') check(b.barriers.length === 1 || ev.some((e) => e.type === 'barrier'), 'ability (Wooden Barrier) spawns');
  else if (mv.ability.kind === 'decoy') check(ev.some((e) => e.type === 'decoy'), 'ability (Decoy) spawns');
  else check(hits(ev).length >= 1, `ability (${mv.ability.name}) hits at ${abDist}`);
  // Light > Ability cancel
  if (['slam', 'projectile', 'stream'].includes(mv.ability.kind)) {
    b = setup(id, 'korvak', 4.5);
    ev = run(b, 120, (i) => ({ ...emptyInput(), light: i === 0, ability: i === 12 }));
    check(ev.some((e) => e.type === 'cancel'), 'light > ability cancel');
  }
  // Signature
  const sigDist = { quake: 8, vortex: 9, siege: 12, forestlock: 10, parry: 4 }[mv.signature.kind];
  b = setup(id, 'korvak', sigDist, { meter: true });
  if (mv.signature.kind === 'parry') {
    // opponent swings into the reversal
    ev = run(b, 140, press('signature'), press('light', 10));
    check(ev.some((e) => e.type === 'parry') && hits(ev, 1).length >= 1, 'signature (Prism Reversal) parries & counters');
  } else {
    ev = run(b, 320, press('signature'));
    check(hits(ev).length >= 1, `signature (${mv.signature.name}) hits at ${sigDist}`);
  }
}

console.log('\nSPECIAL RULES');
// Water cools Korvak
let b = setup('oruvex', 'korvak', 10);
let ev = run(b, 400, (i) => ({ ...emptyInput(), ability: i % 140 === 0 }));
check(ev.some((e) => e.type === 'cooled'), 'water cannon cools Korvak (armor cracked)');
check(ev.some((e) => e.type === 'hit' && e.label === 'SUPER EFFECTIVE!'), 'water is SUPER EFFECTIVE on Korvak');
// Pressure blast interrupts Korvak's armored charge
b = setup('oruvex', 'korvak', 14);
ev = run(b, 120, press('heavy', 14), press('heavy', 0));
check(ev.some((e) => e.type === 'hit' && e.f === 1 && e.name === 'Pressure Blast'), 'pressure blast hits charging Korvak');
check(b.fighters[1].state !== 'attack' || b.fighters[1].move?.kind !== 'charge', 'charge interrupted');
// Korvak charge is not interrupted by light hits
b = setup('prismor', 'korvak', 6);
ev = run(b, 80, press('light', 8), press('heavy', 0));
check(ev.some((e) => e.type === 'armor'), 'Korvak charge absorbs light hit (super armor)');
// Fire stops Canopyx regen
b = setup('korvak', 'canopyx', 4.5, { meter: true });
ev = run(b, 300, press('signature'));
check(ev.some((e) => e.type === 'regenBurned'), 'fire burns Canopyx regeneration');
// Canopyx regenerates
b = setup('canopyx', 'korvak', 30);
b.fighters[0].hp = 500;
run(b, 400);
check(b.fighters[0].hp > 500, `Canopyx regenerates (${Math.round(b.fighters[0].hp)} hp)`);
// Electric super effective on Oruvex
b = setup('velumora', 'oruvex', 12);
ev = run(b, 120, press('ability'));
check(ev.some((e) => e.type === 'hit' && e.label === 'SUPER EFFECTIVE!'), 'lightning is SUPER EFFECTIVE on Oruvex');
// Prismor perfect block reflects a bolt
b = setup('velumora', 'prismor', 14);
ev = run(b, 120, press('ability'), (i) => ({ ...emptyInput(), block: i >= 22 }));
const refl = ev.some((e) => e.type === 'reflect');
check(refl, 'Prismor perfect block reflects lightning');
check(ev.some((e) => e.type === 'hit' && e.f === 0 && e.label === 'SUPER EFFECTIVE!'), 'reflected bolt is SUPER EFFECTIVE on Velumora');
// Normal (late) block does not reflect
b = setup('velumora', 'prismor', 14);
ev = run(b, 120, press('ability'), (i) => ({ ...emptyInput(), block: i >= 2 }));
check(!ev.some((e) => e.type === 'reflect') && ev.some((e) => e.type === 'block'), 'early (non-perfect) block just blocks');
// Prismor cannot reflect water
b = setup('oruvex', 'prismor', 10);
ev = run(b, 100, press('ability'), (i) => ({ ...emptyInput(), block: i >= 12 }));
check(!ev.some((e) => e.type === 'reflect'), 'Prismor cannot reflect water');
// Roots bypass Prismor's shield
b = setup('canopyx', 'prismor', 9);
ev = run(b, 120, press('heavy'), () => ({ ...emptyInput(), block: true }));
check(ev.some((e) => e.type === 'hit' && e.f === 1 && e.damageType === 'root') && ev.some((e) => e.type === 'rooted'), 'root grab goes through Prismor shield and roots it');
// Oruvex forces Velumora to land
b = setup('oruvex', 'velumora', 7);
b.fighters[1].flying = true; b.fighters[1].pos.y = 4.6;
ev = run(b, 80, press('heavy'));
check(ev.some((e) => e.type === 'forceLand'), 'pressure blast knocks Velumora out of the sky');
// Velumora stamina drains and forces landing
b = setup('velumora', 'korvak', 20);
ev = run(b, 900, press('jump'));
check(ev.some((e) => e.type === 'takeoff') && ev.some((e) => e.type === 'tired'), 'Velumora must land when stamina runs out');
// Flying Velumora is immune to shockwaves
b = setup('korvak', 'velumora', 5);
b.fighters[1].flying = true; b.fighters[1].pos.y = 4.6;
ev = run(b, 80, press('ability'));
check(!ev.some((e) => e.type === 'hit' && e.f === 1), 'Ground Slam cannot hit a flying Velumora');
// Barrier blocks a bolt
b = setup('velumora', 'canopyx', 16);
ev = run(b, 140, press('ability', 30), press('ability', 0));
check(ev.some((e) => e.type === 'barrierHit') && !ev.some((e) => e.type === 'hit' && e.f === 1), 'Canopyx barrier blocks lightning');
// Decoy draws targeting & shatters
b = setup('prismor', 'velumora', 12);
ev = run(b, 140, press('ability'), press('ability', 20));
check(ev.some((e) => e.type === 'decoyShatter'), 'decoy draws the bolt and shatters');
// Water empty -> refill window
b = setup('oruvex', 'korvak', 30);
ev = run(b, 900, (i) => ({ ...emptyInput(), ability: i % 120 === 0 }));
check(ev.some((e) => e.type === 'waterEmpty') && ev.some((e) => e.type === 'refilled'), 'Oruvex water empties and refills');
// Korvak vents exposed after heavy
b = setup('korvak', 'oruvex', 30);
ev = run(b, 120, press('heavy'));
check(ev.some((e) => e.type === 'weakSpotOpen'), 'Korvak vents exposed after heavy');
// Haymaker whiff leaves Prismor exposed
b = setup('prismor', 'korvak', 25);
ev = run(b, 120, press('heavy'));
check(ev.some((e) => e.type === 'whiff'), 'missed haymaker = whiff, long recovery');
// Dodge invulnerability
b = setup('korvak', 'prismor', 4.5);
ev = run(b, 60, press('light', 0), (i) => ({ ...emptyInput(), block: i >= 2, mz: 1 }));
check(ev.some((e) => e.type === 'evade') || ev.some((e) => e.type === 'dodge'), 'dodge (block + direction) evades');
// Full match completes
b = new Battle({ p1: 'korvak', p2: 'velumora', arena: 'harbor', hazards: true, seed: 9 });
let frames = 0;
const rnd = (() => { let s = 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
while (b.phase !== 'matchOver' && frames < 60 * 60 * 6) {
  const r = () => ({ mx: rnd() * 2 - 1, mz: rnd() * 2 - 1, light: rnd() < 0.2, heavy: rnd() < 0.03, ability: rnd() < 0.02, signature: rnd() < 0.05, jump: rnd() < 0.02, block: rnd() < 0.1 });
  b.step(r(), r());
  frames++;
}
check(b.phase === 'matchOver', `random-input match with hazards finishes (${(frames / 60).toFixed(0)}s, rounds ${b.round})`);

console.log(failures ? `\n${failures} FAILURES` : '\nALL MOVE TESTS PASSED');
process.exit(failures ? 1 : 0);
