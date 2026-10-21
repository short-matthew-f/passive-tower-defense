// The Dungeon's pixel art: heroes, minions, towers, lairs, runes, chests, coins, and Ledger-Bones.
// Everything is built once into cached GraphicsContexts and swapped onto Graphics, so nothing is
// tessellated per frame. Palette: dark purples and greens; gold is the only saturated warm colour.
import { GraphicsContext } from 'pixi.js';
import type { HeroType, PieceKind } from './model';

export const OUTLINE = 0x0a0410;
export const GOLD = 0xe8c04a;
export const GOLD_LIGHT = 0xfff0a0;
export const GOLD_DARK = 0xa07a20;
export const BONE = 0xe8e0c8;
export const BONE_D = 0xa89c84;

export const PAL = {
  rock: 0x150d1d,
  rockSpeck: 0x22172c,
  wall: 0x3b2d4a,
  wallLight: 0x4d3c5e,
  wallDark: 0x2a1f37,
  chamber: 0x1e2a22,
  chamberLight: 0x2c3d30,
  path: 0x5a4a5e,
  pathLight: 0x6a5970,
  pathDark: 0x4a3b4f,
  loop: 0x4e4466,
  loopLight: 0x5e5378,
};

const cache = new Map<string, GraphicsContext>();
function cached(key: string, build: (c: GraphicsContext) => void): GraphicsContext {
  let c = cache.get(key);
  if (!c) {
    c = new GraphicsContext();
    build(c);
    cache.set(key, c);
  }
  return c;
}

/** Draws palette rows at (ox, oy), merging horizontal runs; optional 1px auto-outline. */
function rows(c: GraphicsContext, data: string[], pal: Record<string, number>, ox: number, oy: number, outline = true, white = false): void {
  const h = data.length;
  const w = Math.max(...data.map((r) => r.length));
  const solid = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x < w && data[y][x] !== undefined && data[y][x] !== '.';
  if (outline) {
    for (let y = -1; y <= h; y++)
      for (let x = -1; x <= w; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) c.rect(ox + x, oy + y, 1, 1).fill(OUTLINE);
      }
  }
  for (let y = 0; y < h; y++) {
    const row = data[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || pal[ch] === undefined) {
        x++;
        continue;
      }
      let e = x + 1;
      while (e < row.length && row[e] === ch) e++;
      c.rect(ox + x, oy + y, e - x, 1).fill(white ? 0xffffff : pal[ch]);
      x = e;
    }
  }
}

// ---------- heroes (anchored at their feet-centre; x -4..4) ----------

const HERO_PAL: Record<string, number> = {
  h: 0xa8a8b8, // helmet steel
  H: 0x707088,
  f: 0xf0c090, // face
  b: 0x3a6ad0, // squire tabard
  B: 0x284a9a,
  W: 0xe0e8ff,
  s: 0xd0d0e0, // blade
  l: 0x5a4a3a, // legs
  k: 0x2a1a1a, // boots
  g: 0x3a9a4a, // rogue hood
  G: 0x22663a,
  d: 0x1a2a1a, // shadowed face
  a: 0xb8c0d0, // knight armour
  A: 0x7880a0,
  v: 0x1a1a2a, // visor
  p: 0x9a5ac0, // plume
  r: 0xb02a3a, // champion cape
  R: 0x7a1a2a,
  y: GOLD,
  Y: GOLD_DARK,
};

const HERO_ROWS: Record<HeroType, [string[], string[]]> = {
  squire: [
    ['..hhh..', '.hhhhh.', '.hfffh.', '..fff.s', '.bbbbbs', 'fbbWbbs', '.BbbbB.', '.ll.ll.', '.k...k.'],
    ['..hhh..', '.hhhhh.', '.hfffh.', '..fff.s', '.bbbbbs', 'fbbWbbs', '.BbbbB.', '..lll..', '..k.k..'],
  ],
  rogue: [
    ['..ggg..', '.ggggg.', '.gdddg.', '.gdddg.', 'sGgggG.', '.GgggGs', '.GgggG.', '.ll.ll.', '.k...k.'],
    ['..ggg..', '.ggggg.', '.gdddg.', '.gdddg.', '.GgggGs', 'sGgggG.', '.GgggG.', '..lll..', '..k.k..'],
  ],
  knight: [
    ['...p....', '..aaa...', '.aaaaa..', '.avvva.s', '.aaaaa.s', 'AaaaaaAs', 'AaAaAaA.', '.aaaaa..', '.AA.AA..', '.kk.kk..'],
    ['...p....', '..aaa...', '.aaaaa..', '.avvva.s', '.aaaaa.s', 'AaaaaaAs', 'AaAaAaA.', '.aaaaa..', '..AAA...', '..kkk...'],
  ],
  champ: [
    [
      '...y.y.y...', '...yyyyy...', '...aaaaa...', '..aavvvaa..', '..aaaaaaa..', '.raaaaaaar.s', 'rraaayaaarrs',
      'rrAaaaaaArrs', 'rrAaaaaaArr.', '.RaaaaaaaR..', '..aaa.aaa...', '..AA...AA...', '..kk...kk...',
    ],
    [
      '...y.y.y...', '...yyyyy...', '...aaaaa...', '..aavvvaa..', '..aaaaaaa..', '.raaaaaaar.s', 'rraaayaaarrs',
      'rrAaaaaaArrs', 'rrAaaaaaArr.', '.RaaaaaaaR..', '...aaaaa....', '...AA.AA....', '...kk.kk....',
    ],
  ],
};

export function heroArt(t: HeroType, frame: number, flash = false): GraphicsContext {
  return cached(`hero.${t}.${frame}.${flash}`, (c) => {
    const data = HERO_ROWS[t][frame];
    const w = Math.max(...data.map((r) => r.length));
    rows(c, data, HERO_PAL, -Math.floor(w / 2), -data.length + 1, true, flash);
  });
}

export function sackArt(): GraphicsContext {
  return cached('sack', (c) => {
    rows(c, ['.Y.', 'yyy', 'yYy', '.y.'], { y: GOLD, Y: GOLD_DARK }, -1, 0);
  });
}

// ---------- minions ----------

export function minionArt(kind: 'crypt' | 'ogre', frame: number, tier: number): GraphicsContext {
  return cached(`minion.${kind}.${frame}.${tier}`, (c) => {
    const eye = tier >= 2 ? 0x6aff8a : tier >= 1 ? 0x4ac06a : OUTLINE;
    if (kind === 'crypt') {
      const data = frame
        ? ['.www.', 'wkwkw', '.www.', '..w.s', 'wwwws', '.www.', '.w.w.', 'ww.ww']
        : ['.www.', 'wkwkw', '.www.', 's.w..', 'swwww', '.www.', '.w.w.', 'ww.ww'];
      rows(c, data, { w: BONE, k: eye, s: 0xb0b0c0 }, -2, -7);
    } else {
      const data = frame
        ? ['....cc....', '.gggcc....', 'gyggyg....', 'gggggg.cc.', 'GgggggGcc.', 'GggggggG..', '.gggggg...', '.GG..GG...']
        : ['.......cc.', '.gggg..cc.', 'gyggyg.c..', 'ggggggc...', 'GgggggG...', 'GggggggG..', '.gggggg...', '.GG..GG...'];
      rows(c, data, { g: 0x7a9a4a, G: 0x4a6a2a, y: tier >= 1 ? 0xffe060 : 0xd0c040, c: 0x6a4a2a }, -4, -7);
    }
  });
}

// ---------- pieces (16x16, origin = tile top-left) ----------

const TIER_BAND = [0x8a6a50, 0x6ac0d0, GOLD];

function band(c: GraphicsContext, tier: number, x: number, y: number, w: number): void {
  c.rect(x, y, w, 1).fill(TIER_BAND[tier]);
}

export function pieceArt(k: PieceKind, tier: number, branch: number, frame = 0): GraphicsContext {
  return cached(`piece.${k}.${tier}.${branch}.${frame}`, (c) => {
    switch (k) {
      case 'arrow': {
        const stone = 0x8a7a9a;
        const shade = 0x5e4f70;
        c.rect(3, 3, 10, 12).fill(OUTLINE);
        c.rect(4, 4, 8, 10).fill(stone);
        c.rect(11, 4, 1, 10).fill(shade);
        c.rect(4, 13, 8, 1).fill(shade);
        for (const x of [3, 7, 11]) {
          c.rect(x, 1, 2, 3).fill(OUTLINE);
          c.rect(x, 2, 2, 2).fill(stone);
        }
        c.rect(7, 6, 2, 6).fill(OUTLINE);
        c.rect(6, 8, 4, 1).fill(OUTLINE);
        band(c, tier, 4, 12, 8);
        if (branch === 1) {
          c.rect(5, 5, 6, 1).fill(0x8a5a30);
          c.rect(7, 4, 2, 3).fill(0xc0c0d0);
        } else if (branch === 2) {
          c.rect(5, 10, 1, 1).fill(0xc03a3a).rect(10, 10, 1, 1).fill(0xc03a3a).rect(5, 6, 1, 1).fill(0xc03a3a).rect(10, 6, 1, 1).fill(0xc03a3a);
        }
        if (tier >= 2) c.rect(7, 2, 2, 1).fill(GOLD_LIGHT);
        break;
      }
      case 'brazier': {
        const iron = branch === 2 ? 0x6a6a8a : 0x4a4a5a;
        c.rect(2, 8, 12, 4).fill(OUTLINE);
        c.rect(3, 9, 10, 2).fill(iron);
        c.rect(4, 11, 8, 1).fill(OUTLINE);
        c.rect(4, 12, 1, 3).fill(OUTLINE).rect(11, 12, 1, 3).fill(OUTLINE).rect(7, 12, 2, 3).fill(OUTLINE);
        band(c, tier, 3, 10, 10);
        const hot = branch === 2 ? 0xe0f0ff : 0xffd040;
        const warm = branch === 2 ? 0x7ab0ff : 0xf07a20;
        const deep = branch === 2 ? 0x4a6ad0 : 0xc03a1a;
        const f = frame;
        c.rect(4, 6, 8, 3).fill(deep);
        c.rect(5, 4 + f, 6, 4 - f).fill(warm);
        c.rect(6, 2 + f, 2, 3).fill(warm).rect(9, 3 - f, 2, 3).fill(warm);
        c.rect(6, 5, 4, 3).fill(hot);
        c.rect(7, 3 + f, 1, 2).fill(hot);
        if (branch === 1) c.rect(2, 7, 1, 1).fill(warm).rect(13, 7, 1, 1).fill(warm);
        break;
      }
      case 'ballista': {
        const wood = 0x6a4a3a;
        const bow = branch === 1 ? 0xc0c0d0 : BONE;
        c.rect(3, 10, 10, 5).fill(OUTLINE);
        c.rect(4, 11, 8, 3).fill(wood);
        c.rect(4, 13, 8, 1).fill(0x4a3226);
        band(c, tier, 4, 11, 8);
        c.rect(1, 5, 14, 3).fill(OUTLINE);
        c.rect(2, 6, 12, 1).fill(bow);
        c.rect(1, 4, 2, 2).fill(OUTLINE).rect(13, 4, 2, 2).fill(OUTLINE);
        c.rect(2, 5, 1, 1).fill(bow).rect(13, 5, 1, 1).fill(bow);
        c.rect(6, 1, 4, 11).fill(OUTLINE);
        c.rect(7, 2, 2, 9).fill(BONE_D);
        c.rect(7, 1, 2, 2).fill(branch === 2 ? 0xc03a3a : 0xd0d0e0);
        if (branch === 2) c.rect(6, 4, 1, 1).fill(BONE).rect(9, 4, 1, 1).fill(BONE);
        if (tier >= 2) c.rect(7, 8, 2, 1).fill(GOLD);
        break;
      }
      case 'crypt': {
        const stone = branch === 2 ? 0x7a7a9a : 0x6a6a7a;
        c.rect(2, 3, 12, 12).fill(OUTLINE);
        c.rect(3, 4, 10, 10).fill(stone);
        c.rect(4, 2, 8, 2).fill(OUTLINE);
        c.rect(5, 3, 6, 1).fill(stone);
        c.rect(5, 7, 6, 7).fill(OUTLINE);
        c.rect(6, 8, 4, 6).fill(0x1a0e22);
        c.rect(7, 4, 2, 2).fill(BONE);
        const eye = tier >= 2 ? 0x6aff8a : tier >= 1 ? 0x4ac06a : 0x2a1a2a;
        c.rect(7, 10, 1, 1).fill(eye).rect(9, 10, 1, 1).fill(eye);
        band(c, tier, 3, 13, 10);
        if (branch === 1) c.rect(3, 5, 1, 1).fill(BONE).rect(12, 5, 1, 1).fill(BONE);
        break;
      }
      case 'ogre': {
        c.rect(1, 4, 14, 11).fill(OUTLINE);
        c.rect(2, 5, 12, 9).fill(0x5a4030);
        c.rect(3, 3, 10, 2).fill(OUTLINE);
        c.rect(4, 4, 8, 1).fill(0x6a5040);
        c.rect(4, 8, 8, 6).fill(0x0e0812);
        const eye = branch === 1 ? 0xff6040 : 0xffd040;
        c.rect(6, 10, 1, 1).fill(eye).rect(9, 10, 1, 1).fill(eye);
        band(c, tier, 2, 13, 12);
        if (branch === 2) c.rect(2, 6, 2, 1).fill(0x9a9aaa).rect(12, 6, 2, 1).fill(0x9a9aaa);
        break;
      }
      case 'mire': {
        const col = branch === 2 ? 0x3a2a4a : branch === 1 ? 0x2a2a1a : 0x2a5a2a;
        const glow = tier >= 2 ? 0x9aff6a : tier >= 1 ? 0x7ad04a : 0x5aa03a;
        c.rect(3, 4, 10, 8).fill({ color: col, alpha: 0.9 });
        c.rect(4, 3, 8, 10).fill({ color: col, alpha: 0.9 });
        c.rect(5, 5, 6, 1).fill(glow).rect(5, 5, 1, 5).fill(glow).rect(5, 10, 5, 1).fill(glow).rect(10, 7, 1, 4).fill(glow);
        c.rect(7, 7, 2, 1).fill(glow).rect(8, 7, 1, 2).fill(glow);
        break;
      }
      case 'spikes': {
        const tip = branch === 1 ? 0xe05050 : 0xd8d8e8;
        const base = 0x3a3040;
        for (const [x, y] of [[3, 3], [7, 3], [11, 3], [5, 7], [9, 7], [3, 11], [7, 11], [11, 11]]) {
          c.rect(x - 1, y, 3, 2).fill(base);
          if (frame === 0) {
            c.rect(x, y - 2, 1, 3).fill(tip);
            c.rect(x - 1, y, 3, 1).fill(0x8a8a9a);
          }
        }
        if (tier >= 1) c.rect(7, 7, 2, 2).fill(TIER_BAND[tier]);
        break;
      }
    }
  });
}

export function chestArt(owned: boolean, glint: boolean): GraphicsContext {
  return cached(`chest.${owned}.${glint}`, (c) => {
    if (!owned) {
      // A dashed gold outline where a chest could sit.
      for (let i = 3; i < 13; i += 2) c.rect(i, 5, 1, 1).fill(GOLD_DARK).rect(i, 13, 1, 1).fill(GOLD_DARK);
      for (let j = 5; j < 14; j += 2) c.rect(3, j, 1, 1).fill(GOLD_DARK).rect(12, j, 1, 1).fill(GOLD_DARK);
      c.rect(7, 8, 2, 1).fill(GOLD_DARK).rect(8, 9, 1, 1).fill(GOLD_DARK).rect(7, 11, 1, 1).fill(GOLD_DARK);
      return;
    }
    c.rect(2, 5, 12, 10).fill(OUTLINE);
    c.rect(3, 6, 10, 3).fill(0x9a6a32);
    c.rect(3, 9, 10, 5).fill(0x7a4e22);
    c.rect(3, 8, 10, 1).fill(OUTLINE);
    c.rect(5, 6, 1, 8).fill(GOLD).rect(10, 6, 1, 8).fill(GOLD);
    c.rect(7, 8, 2, 3).fill(GOLD_LIGHT);
    c.rect(4, 4, 8, 1).fill(OUTLINE);
    c.rect(5, 3, 3, 3).fill(GOLD).rect(9, 3, 2, 3).fill(GOLD);
    c.rect(6, 2, 1, 1).fill(GOLD_LIGHT);
    if (glint) {
      c.rect(11, 1, 1, 3).fill(0xffffff).rect(10, 2, 3, 1).fill(0xffffff);
    }
  });
}

export function coinArt(): GraphicsContext {
  return cached('coin', (c) => {
    c.rect(-2, -3, 4, 6).fill(OUTLINE).rect(-3, -2, 6, 4).fill(OUTLINE);
    c.rect(-1, -2, 2, 4).fill(GOLD).rect(-2, -1, 4, 2).fill(GOLD);
    c.rect(-1, -2, 1, 1).fill(GOLD_LIGHT);
  });
}

/** Ledger-Bones in miniature beside the Hoard (frame 1 = throwing). */
export function clerkArt(frame: number): GraphicsContext {
  return cached(`clerk.${frame}`, (c) => {
    const data = frame
      ? ['.www..w', 'wkwkw..', '.www..', '.ggg..', 'wgggw..', '.ggg...', '.w.w...']
      : ['.www...', 'wkwkw..', '.www...', 'wgggw.q', '.ggg..q', '.ggg...', '.w.w...'];
    rows(c, data, { w: BONE, k: OUTLINE, g: 0x4a3a6a, q: 0xc03a3a }, -3, -7);
  });
}

export function hoardArt(level: number): GraphicsContext {
  return cached(`hoard.${level}`, (c) => {
    const hgt = 4 + level;
    for (let i = 0; i < hgt; i++) {
      const w = 2 + Math.round((14 - 2) * (i / Math.max(1, hgt - 1)));
      const x = Math.floor((16 - w) / 2);
      const y = 15 - hgt + i;
      c.rect(x - 1, y, w + 2, 1).fill(OUTLINE);
      c.rect(x, y, w, 1).fill(i % 3 === 0 ? GOLD_LIGHT : i % 2 ? GOLD : GOLD_DARK);
    }
    c.rect(4, 15 - hgt + 2, 1, 1).fill(0xffffff).rect(10, 15 - hgt + 4, 1, 1).fill(0xffffff);
  });
}

/** 5x5 hero head icons for the party preview. */
export function heroIcon(t: HeroType): GraphicsContext {
  return cached(`icon.${t}`, (c) => {
    const data: Record<HeroType, string[]> = {
      squire: ['.hhh.', 'hhhhh', 'hfffh', '.fff.', 'bbbbb'],
      rogue: ['.ggg.', 'ggggg', 'gdddg', 'gdddg', 'GgggG'],
      knight: ['..p..', '.aaa.', 'avvva', 'aaaaa', 'AaaaA'],
      champ: ['y.y.y', 'yyyyy', 'avvva', 'aaaaa', 'rAaAr'],
    };
    rows(c, data[t], HERO_PAL, 0, 0);
  });
}

// ---------- manager portrait (12x12, two frames) ----------

export const BONES_PALETTE: Record<string, string> = {
  B: '#2a1a3a',
  w: '#e8e0c8',
  s: '#a89c84',
  k: '#0a0410',
  g: '#e8c04a',
  q: '#c03a3a',
  Q: '#f4e8c1',
};

export const BONES_IDLE = [
  'BBBBBBBBBBBq',
  'BBBwwwwwwBqQ',
  'BBwwwwwwwwqB',
  'BwwwwwwwwwsB',
  'BgggwwwgggsB',
  'BgkgggggkgsB',
  'BgggwwwgggsB',
  'BwwwwkwwwwsB',
  'BBswwwwwwsBB',
  'BBwkwkwkwsBB',
  'BBswwwwwsBBB',
  'BBBssssBBBBB',
];

export const BONES_TALK = [
  'BBBBBBBBBBBq',
  'BBBwwwwwwBqQ',
  'BBwwwwwwwwqB',
  'BwwwwwwwwwsB',
  'BgggwwwgggsB',
  'BgkgggggkgsB',
  'BgggwwwgggsB',
  'BwwwwkwwwwsB',
  'BBswwwwwwsBB',
  'BBkkkkkkkBBB',
  'BBwkwkwkwsBB',
  'BBBswwwsBBBB',
];
