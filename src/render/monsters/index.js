// Registry of procedural monster builders and their colour palettes.
import { buildKorvak, KORVAK_PALETTES } from './korvak.js';

export const BUILDERS = {
  korvak: buildKorvak,
  velumora: buildKorvak,
  oruvex: buildKorvak,
  canopyx: buildKorvak,
  prismor: buildKorvak,
};

export const PALETTES = {
  korvak: KORVAK_PALETTES,
  velumora: KORVAK_PALETTES,
  oruvex: KORVAK_PALETTES,
  canopyx: KORVAK_PALETTES,
  prismor: KORVAK_PALETTES,
};
