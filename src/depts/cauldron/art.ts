// Cauldron pixel art: ingredient sprites, Granny's portrait and the kitchen palette.
import { Graphics, type Renderer, Texture } from 'pixi.js';
import { drawSprite } from '../../ui/widgets';
import type { IngId } from './sim';

export const PAL = {
  bg: 0x170f22,
  board: 0x1f1530,
  boardEdge: 0x3a2850,
  rail: 0x4a3326,
  railTop: 0x7a5636,
  iron: 0x8c8a9c,
  ironHi: 0xd8d4e8,
  ironLo: 0x4c4858,
  gold: 0xe8c04a,
  goldHi: 0xfff2a0,
  ladle: 0x8fd14f,
  ladleHi: 0xd8ff9a,
  bumper: 0xc03a3a,
  bumperHi: 0xff8a6a,
  copper: 0xa8582a,
  copperHi: 0xe0904a,
  copperLo: 0x5e2c14,
  bile: 0x9ad43a,
  bileHi: 0xd2f27a,
  bileLo: 0x5a8a1a,
  toad: 0x5aa040,
  ink: 0x0a0410,
};

/** Bucket body colors from Dregs (0) to the center (4). */
export const BUCKET_COL = [0x5a3a2a, 0x4a4a5e, 0x2e6a6a, 0x4a8a2a, 0xb08a20];

export const ING_COLOR: Record<IngId, string> = {
  newt: '#f0d040',
  toad: '#6ac048',
  bat: '#b070f0',
  mandrake: '#f08a30',
};

const SPRITES: Record<IngId, string[]> = {
  newt: [
    '.kkkkk.',
    'kwyyyyk',
    'kyykyyk',
    'kyykyyk',
    'kyykyrk',
    'kryyyyk',
    '.kkkkk.',
  ],
  toad: [
    'kk...kk',
    'wkk.kkw',
    'kgggggk',
    'kgdggdk',
    'kgggggk',
    'kgdgdgk',
    '.kkkkk.',
  ],
  bat: [
    'k.....k',
    'kpk.kpk',
    'kpppppk',
    'kpPpPpk',
    'kpppppk',
    'kpkpkpk',
    '.k.k.k.',
  ],
  mandrake: [
    '.g...g.',
    '..ggg..',
    '.kkgkk.',
    'koooook',
    'kokokok',
    'koooook',
    '.kokok.',
  ],
};

const SPRITE_PAL: Record<IngId, Record<string, string>> = {
  newt: { k: '#2a1a0a', y: '#f0d040', w: '#fff8c0', r: '#d04030' },
  toad: { k: '#14300a', g: '#6ac048', d: '#3a7a28', w: '#f0f0c0' },
  bat: { k: '#200a30', p: '#b070f0', P: '#e0b0ff' },
  mandrake: { k: '#3a1a0a', o: '#f08a30', g: '#6ac048' },
};

const texCache = new Map<string, Texture>();

/** 7x7 ingredient texture (cached per renderer lifetime). */
export function ingTexture(renderer: Renderer, ing: IngId): Texture {
  const hit = texCache.get(ing);
  if (hit && !hit.destroyed) return hit;
  const g = new Graphics();
  drawSprite(g, SPRITES[ing], SPRITE_PAL[ing]);
  const tex = renderer.generateTexture({ target: g, resolution: 1, antialias: false });
  tex.source.scaleMode = 'nearest';
  g.destroy();
  texCache.set(ing, tex);
  return tex;
}

export function drawIng(g: Graphics, ing: IngId, x: number, y: number): void {
  drawSprite(g, SPRITES[ing], SPRITE_PAL[ing], x, y);
}

// ---------- Granny Gristle, 12x12, idle and talking ----------

const GRANNY_IDLE = [
  '.....pp.....',
  '....pppp....',
  '...ppPppp...',
  '.pppppppppp.',
  '..whggggwh..',
  '..wgyggygw..',
  '..wggnnggw..',
  '..wggnggdw..',
  '..wgmmmmgw..',
  '...gggggg...',
  '..ssssssss..',
  '.ssSssssSss.',
];
const GRANNY_TALK = [
  '.....pp.....',
  '....pppp....',
  '...ppPppp...',
  '.pppppppppp.',
  '..whggggwh..',
  '..wgyggygw..',
  '..wggnnggw..',
  '..wggnggdw..',
  '..wgmrrmgw..',
  '...gmmmmg...',
  '..ssssssss..',
  '.ssSssssSss.',
];

export const GRANNY_PORTRAIT: [string[], string[]] = [GRANNY_IDLE, GRANNY_TALK];
export const GRANNY_PAL: Record<string, string> = {
  p: '#4a2a6a',
  P: '#9ad43a',
  w: '#d8d0c0',
  h: '#a8a090',
  g: '#8aa86a',
  y: '#f0e040',
  n: '#5e7e44',
  d: '#3e5a26',
  m: '#3a1010',
  r: '#c04040',
  s: '#6a3a4a',
  S: '#9a5a6a',
};
