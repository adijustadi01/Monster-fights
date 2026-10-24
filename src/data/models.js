/**
 * MONSTER MODEL CONFIG
 * ====================
 * Each monster currently uses a PROCEDURAL model (built from Three.js shapes in
 * src/render/monsters/). To swap in your own 3D model:
 *
 *   1. Put the file in  public/models/   e.g.  public/models/korvak.glb
 *   2. Change that monster's line below from
 *         korvak: { type: 'procedural' },
 *      to
 *         korvak: { type: 'glb', url: 'models/korvak.glb' },
 *
 * Optional settings for a glb model:
 *   scale:      number   - size multiplier (default: auto-fit to the monster's height)
 *   yOffset:    number   - raise/lower the model (game units)
 *   rotationY:  number   - turn the model (radians; Math.PI = 180°) if it faces backwards
 *   animations: object   - names of animation clips inside the .glb to play for each
 *                          situation, e.g. { idle: 'Idle', walk: 'Walk', attack: 'Attack',
 *                          hit: 'Hit', block: 'Block', ko: 'Death', victory: 'Roar', fly: 'Fly' }
 *                          Missing clips are fine: the game falls back to simple
 *                          procedural motion (bobbing, leaning, recoil).
 *
 * The fight logic never changes - hitboxes come from src/data/monsters.js.
 */
export const MODELS = {
  korvak: { type: 'procedural' },
  velumora: { type: 'procedural' },
  oruvex: { type: 'procedural' },
  canopyx: { type: 'procedural' },
  prismor: { type: 'procedural' },
};

/**
 * Colour skins. 'default' is always unlocked; the second skin is earned by
 * beating the Story Tower with that monster. 'shadow' is the final boss look.
 */
export const SKINS = {
  korvak: [{ id: 'default', name: 'Magma' }, { id: 'obsidian', name: 'Blue Inferno' }],
  velumora: [{ id: 'default', name: 'Storm' }, { id: 'solar', name: 'Solar Flare' }],
  oruvex: [{ id: 'default', name: 'Pearl' }, { id: 'abyssal', name: 'Abyssal' }],
  canopyx: [{ id: 'default', name: 'Summer' }, { id: 'autumn', name: 'Autumn Blaze' }],
  prismor: [{ id: 'default', name: 'Cobalt' }, { id: 'ruby', name: 'Ruby Prism' }],
};
