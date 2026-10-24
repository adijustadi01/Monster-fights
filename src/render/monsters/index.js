// Registry of procedural monster builders and their colour palettes.
import { buildKorvak, KORVAK_PALETTES } from './korvak.js';
import { buildVelumora, VELUMORA_PALETTES } from './velumora.js';
import { buildOruvex, ORUVEX_PALETTES } from './oruvex.js';
import { buildCanopyx, CANOPYX_PALETTES } from './canopyx.js';
import { buildPrismor, PRISMOR_PALETTES } from './prismor.js';

export const BUILDERS = {
  korvak: buildKorvak,
  velumora: buildVelumora,
  oruvex: buildOruvex,
  canopyx: buildCanopyx,
  prismor: buildPrismor,
};

export const PALETTES = {
  korvak: KORVAK_PALETTES,
  velumora: VELUMORA_PALETTES,
  oruvex: ORUVEX_PALETTES,
  canopyx: CANOPYX_PALETTES,
  prismor: PRISMOR_PALETTES,
};
