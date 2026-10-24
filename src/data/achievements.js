// Achievements. `check` is evaluated by src/save.js after each battle/event.
export const ACHIEVEMENTS = [
  { id: 'first_win', name: 'First Roar', desc: 'Win your first battle.' },
  { id: 'no_block', name: 'Best Defense Is Offense', desc: 'Win a battle without blocking.' },
  { id: 'reflect10', name: 'Mirror Master', desc: 'Reflect 10 lightning bolts with Prismor.', goal: 10, counter: 'reflectedBolts' },
  { id: 'korvak_oruvex', name: 'Against the Tide', desc: 'Win with Korvak against Oruvex (its counter).' },
  { id: 'oruvex_velumora', name: 'Lightning Rod', desc: 'Win with Oruvex against Velumora (its counter).' },
  { id: 'canopyx_korvak', name: 'Fireproof Forest', desc: 'Win with Canopyx against Korvak (its counter).' },
  { id: 'prismor_canopyx', name: 'Root Breaker', desc: 'Win with Prismor against Canopyx (its counter).' },
  { id: 'velumora_prismor', name: 'Storm Through Glass', desc: 'Win with Velumora against Prismor (its counter).' },
  { id: 'combo8', name: 'TITANIC!', desc: 'Land an 8-hit combo.' },
  { id: 'super25', name: 'Super Effective!', desc: 'Land 25 super-effective hits.', goal: 25, counter: 'superEffective' },
  { id: 'perfect', name: 'Flawless Titan', desc: 'Win a round without taking any damage.' },
  { id: 'comeback', name: 'Last Stand', desc: 'Win a round with less than 10% health left.' },
  { id: 'signature_ko', name: 'Showstopper', desc: 'Finish a round with a Signature Move.' },
  { id: 'destroy25', name: 'Demolition Derby', desc: 'Destroy 25 arena props.', goal: 25, counter: 'propsDestroyed' },
  { id: 'tower', name: 'Tower Conqueror', desc: 'Beat the Story Tower.' },
  { id: 'tower_hard', name: 'Hard as Basalt', desc: 'Beat the Story Tower on Hard.' },
  { id: 'tower_titan', name: 'Titan Slayer', desc: 'Beat the Story Tower on Titan.' },
  { id: 'tower_all', name: 'Master of Monsters', desc: 'Beat the Story Tower with all 5 monsters.' },
  { id: 'versus10', name: 'Living Room Legend', desc: 'Play 10 Versus matches.', goal: 10, counter: 'versusMatches' },
  { id: 'all_arenas', name: 'World Tour', desc: 'Win a battle in all 5 arenas.' },
];

/** Win with X against its counter -> achievement id */
export const COUNTER_WINS = {
  korvak: { vs: 'oruvex', id: 'korvak_oruvex' },
  oruvex: { vs: 'velumora', id: 'oruvex_velumora' },
  canopyx: { vs: 'korvak', id: 'canopyx_korvak' },
  prismor: { vs: 'canopyx', id: 'prismor_canopyx' },
  velumora: { vs: 'prismor', id: 'velumora_prismor' },
};
