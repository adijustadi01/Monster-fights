// Story Tower texts. Opponents are fought in roster order (skipping your own
// monster), then the final boss: a Shadow version of yourself.
export const STORY_INTROS = {
  korvak: 'The ground splits and the sky turns orange. KORVAK, the Walking Volcano, climbs out of the burning coast. Its armor shrugs off claws and fire alike... but water makes it crack.',
  velumora: 'Wind turbines spin wildly as a purple storm rolls in. VELUMORA hunts from above, striking with lightning. Bring it down to earth - it can\'t fly forever.',
  oruvex: 'The tide pulls back from the empty harbor. ORUVEX rises from the waves, siphon cannons roaring. Get past its water and strike the glowing pressure sacs.',
  canopyx: 'Roots burst through the river valley. CANOPYX, the Living Fortress, heals while you wait and traps whoever comes close. Keep up the pressure - and watch for its wind-ups.',
  prismor: 'Light shatters into rainbows over the salt flats. PRISMOR, the Mirror Gladiator, returns every bolt you throw. Don\'t feed its shield - out-think it.',
};

export const SHADOW_INTRO = (name) => `The tower's summit is silent... until a dark reflection steps out of the storm. SHADOW ${name}: every move you know, stronger and crueler, with burning red eyes. Beat yourself to claim the crown.`;

export const STORY_VICTORY = (name) => `${name} stands alone atop the tower. The shadow fades, the skies clear, and every monster bows to the new champion.`;

export const TOWER_ARENA_FOR = {
  korvak: 'volcanic',
  velumora: 'stormsea',
  oruvex: 'harbor',
  canopyx: 'valley',
  prismor: 'saltflats',
};
