// Troll Bridge pixel art: travelers composed from large swappable parts, Grumm, icons.
// Travelers are drawn into a reused Graphics (cleared and redrawn only when the traveler
// changes). Fixed art (icons, Grumm frames, particles) is cached in GraphicsContexts with a
// bounded key space, so nothing grows over time.
import { Graphics, GraphicsContext } from 'pixi.js';
import { CLOAKS, HAIRS, SKINS, SEALS, type Look } from './model';

export const OUTLINE = 0x140c1c;
export const GOLD = 0xe8c04a;
export const WOOD = 0x7a4a2a;
export const WOOD_D = 0x4a2a16;
export const WOOD_L = 0xa06a3a;
export const STEEL = 0xc8d0dc;
export const STEEL_D = 0x7a8494;
export const TAN = 0xc8a060;
export const TAN_D = 0x8a6a3a;

export const TRAV_W = 24;
export const TRAV_H = 42;

function dark(c: number, k = 0.65): number {
  const r = Math.floor(((c >> 16) & 255) * k);
  const g = Math.floor(((c >> 8) & 255) * k);
  const b = Math.floor((c & 255) * k);
  return (r << 16) | (g << 8) | b;
}

function light(c: number, k = 0.35): number {
  const f = (v: number) => Math.min(255, Math.floor(v + (255 - v) * k));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
}

type R = (x: number, y: number, w: number, h: number, c: number, a?: number) => void;

function painter(g: Graphics, ox: number, oy: number, px: number, flip: boolean): R {
  return (x, y, w, h, c, a = 1) => {
    const xx = flip ? TRAV_W - x - w : x;
    g.rect(ox + xx * px, oy + y * px, w * px, h * px).fill(a < 1 ? { color: c, alpha: a } : c);
  };
}

export interface DrawOpts {
  px?: number;
  flip?: boolean;
  face?: 'calm' | 'shock' | 'angry' | 'happy';
  /** Revealed hero: the disguise is gone (unmask). */
  revealed?: boolean;
  lidOpen?: boolean;
  /** Decree picture (wave 1): draw only this slot in colour, the rest as a dim mannequin. */
  only?: string;
}

const SIL = 0x4a3a5a;

/** A Decree tile: a dim mannequin wearing one part in full colour (24x42 at px). */
export function drawDecreePart(g: Graphics, slot: string, part: string, ox: number, oy: number, px = 1): void {
  const look: Look = { hat: 'none', body: 'patched', feet: 'worn', hand: 'none', belt: 'none', pack: 'none', aura: 'none', cloak: 5, hair: 1, skin: 0, mark: 0 };
  (look as unknown as Record<string, string | number>)[slot] = part;
  drawTraveler(g, look, ox, oy, { px, only: slot });
}

/** Draws a traveler (24x42 at px=1, feet on the bottom row) into g at (ox, oy). */
export function drawTraveler(g: Graphics, look: Look, ox: number, oy: number, o: DrawOpts = {}): void {
  const px = o.px ?? 1;
  const r0 = painter(g, ox, oy, px, !!o.flip);
  // Decree tiles: everything outside the `only` slot is a flat silhouette.
  let sec = '';
  const r: R = o.only ? (x, y, w, h, c, a = 1) => (sec === o.only ? r0(x, y, w, h, c, a) : r0(x, y, w, h, SIL)) : r0;
  let L = look;
  if (o.revealed) L = { ...look, hat: 'helm', body: 'armor', feet: 'steel', hand: 'sword', belt: 'none', pack: 'shield', aura: 'glow' };
  const cloak = CLOAKS[L.cloak] ?? CLOAKS[0];
  const hair = HAIRS[L.hair] ?? HAIRS[0];
  const skin = SKINS[L.skin] ?? SKINS[0];

  // ---- aura (behind) ----
  sec = 'aura';
  if (L.aura === 'glow') {
    const y = 0xfff08a;
    r(4, 14, 1, 22, y, 0.6);
    r(19, 14, 1, 22, y, 0.6);
    r(6, 39, 12, 1, y, 0.7);
    r(2, 20, 1, 1, 0xffffff);
    r(21, 26, 1, 1, 0xffffff);
    r(3, 33, 1, 1, y);
    r(20, 17, 1, 1, y);
    r(8, 6, 8, 1, y, 0.8); // halo
    r(7, 7, 1, 1, y, 0.8);
    r(16, 7, 1, 1, y, 0.8);
  } else if (L.aura === 'perfume') {
    for (const [x, y] of [[3, 9], [5, 6], [19, 8], [21, 12], [2, 14]]) r(x, y, 1, 1, 0xf090c0);
    r(4, 7, 1, 1, 0xffc0e0);
  } else if (L.aura === 'notes') {
    // music notes drifting off the lute
    for (const [x, y] of [[20, 6], [3, 10], [22, 14]]) {
      r(x, y, 1, 3, 0x3a2a5a);
      r(x - 1, y + 2, 1, 1, 0x3a2a5a);
      r(x + 1, y, 1, 1, 0x3a2a5a);
    }
  } else if (L.aura === 'flies') {
    for (const [x, y] of [[3, 12], [20, 10], [1, 18], [22, 22], [4, 30]]) r(x, y, 1, 1, OUTLINE);
  }

  // ---- pack (behind) ----
  sec = 'pack';
  const p = L.pack;
  if (p === 'sack') {
    r(2, 18, 7, 9, TAN_D);
    r(3, 19, 5, 7, TAN);
    r(4, 17, 2, 2, TAN_D);
  } else if (p === 'bedroll') {
    r(3, 16, 18, 4, dark(cloak, 0.5));
    r(4, 17, 16, 2, light(cloak, 0.2));
    r(3, 17, 1, 2, OUTLINE);
    r(20, 17, 1, 2, OUTLINE);
  } else if (p === 'satchel') {
    r(3, 19, 6, 8, WOOD_D);
    r(4, 20, 4, 6, WOOD);
    r(5, 22, 2, 1, GOLD);
  } else if (p === 'bulge') {
    r(0, 7, 11, 27, TAN_D);
    r(1, 8, 9, 25, TAN);
    r(2, 5, 6, 3, TAN_D);
    r(3, 6, 4, 2, TAN);
    r(1, 14, 3, 3, light(TAN, 0.3));
    r(5, 22, 4, 3, light(TAN, 0.3));
    r(4, 4, 2, 2, TAN_D); // tied neck
  } else if (p === 'barrel') {
    r(0, 9, 11, 22, WOOD_D);
    r(1, 10, 9, 20, WOOD);
    r(1, 10, 2, 20, WOOD_L);
    r(0, 13, 11, 2, 0x3a3a44);
    r(0, 25, 11, 2, 0x3a3a44);
    if (o.lidOpen) {
      r(0, 4, 8, 2, WOOD_D);
      r(4, 7, 3, 2, 0x5a9ab8);
      r(6, 6, 2, 1, 0x5a9ab8);
    } else r(1, 8, 9, 2, WOOD_D);
  } else if (p === 'shield') {
    r(0, 15, 9, 15, STEEL_D);
    r(1, 16, 7, 13, 0x3a5ab0);
    r(1, 29, 7, 2, STEEL_D);
    r(3, 30, 3, 2, STEEL_D);
    r(4, 17, 1, 11, GOLD);
    r(2, 20, 5, 1, GOLD);
  }

  // ---- legs ----
  sec = 'legs';
  const pants = dark(cloak, 0.45);
  r(9, 32, 2, 6, pants);
  r(13, 32, 2, 6, pants);

  // ---- feet ----
  sec = 'feet';
  const f = L.feet;
  if (f === 'bare') {
    r(8, 38, 3, 3, skin);
    r(13, 38, 3, 3, skin);
    r(8, 41, 3, 1, dark(skin));
    r(13, 41, 3, 1, dark(skin));
  } else if (f === 'worn') {
    r(8, 37, 4, 5, 0x4a3020);
    r(13, 37, 4, 5, 0x4a3020);
    r(9, 40, 1, 1, skin); // hole
    r(15, 39, 1, 1, 0x6a4a30);
  } else if (f === 'fancy') {
    const fc = 0x8a2a6a;
    r(8, 38, 4, 4, fc);
    r(13, 38, 4, 4, fc);
    r(12, 39, 1, 2, fc);
    r(17, 39, 1, 2, fc);
    r(12, 38, 1, 1, GOLD);
    r(17, 38, 1, 1, GOLD);
  } else if (f === 'boots') {
    r(8, 35, 4, 7, 0x5a3a22);
    r(13, 35, 4, 7, 0x5a3a22);
    r(8, 35, 4, 1, 0x7a5a3a);
    r(13, 35, 4, 1, 0x7a5a3a);
  } else if (f === 'newboots') {
    r(8, 36, 4, 6, 0xd0803a);
    r(13, 36, 4, 6, 0xd0803a);
    r(9, 37, 1, 2, 0xffffff);
    r(14, 37, 1, 2, 0xffffff);
    r(8, 41, 4, 1, 0x8a4a1a);
    r(13, 41, 4, 1, 0x8a4a1a);
  } else if (f === 'steel') {
    r(8, 35, 4, 7, STEEL);
    r(13, 35, 4, 7, STEEL);
    r(8, 38, 4, 1, STEEL_D);
    r(13, 38, 4, 1, STEEL_D);
    r(9, 36, 1, 1, 0xffffff);
    r(14, 36, 1, 1, 0xffffff);
    r(8, 41, 4, 1, GOLD);
    r(13, 41, 4, 1, GOLD);
  }

  // ---- body ----
  sec = 'body';
  const b = L.body;
  const arm = (c: number) => {
    r(5, 19, 2, 9, c);
    r(17, 19, 2, 9, c);
    r(5, 28, 2, 2, skin);
    r(17, 28, 2, 2, skin);
  };
  if (b === 'patched') {
    const c = dark(cloak, 0.8);
    r(7, 18, 10, 15, c);
    arm(c);
    r(8, 21, 3, 3, TAN);
    r(13, 26, 3, 3, 0x8a6a9a);
    r(8, 21, 1, 1, OUTLINE);
    r(10, 32, 1, 1, OUTLINE);
    r(15, 32, 2, 1, dark(c));
  } else if (b === 'robe') {
    const c = light(cloak, 0.45);
    r(7, 18, 10, 20, c);
    r(6, 30, 12, 8, c);
    arm(c);
    r(11, 18, 2, 4, dark(c));
    r(6, 37, 12, 1, dark(c));
    // prayer beads
    for (const [x, y] of [[9, 20], [10, 22], [11, 23], [13, 22], [14, 20]]) r(x, y, 1, 1, 0x6a3a2a);
  } else if (b === 'coat') {
    const c = cloak;
    r(7, 18, 10, 16, c);
    arm(c);
    r(7, 18, 10, 2, 0xf4ecd8); // fur collar
    r(11, 20, 2, 14, dark(c));
    for (const y of [21, 24, 27, 30]) r(11, y, 1, 1, GOLD);
    r(7, 33, 10, 1, GOLD);
    r(5, 27, 2, 1, 0xf4ecd8);
    r(17, 27, 2, 1, 0xf4ecd8);
  } else if (b === 'armor') {
    r(7, 18, 10, 15, dark(cloak, 0.7));
    r(8, 19, 8, 9, STEEL);
    r(5, 18, 3, 3, STEEL_D);
    r(16, 18, 3, 3, STEEL_D);
    r(5, 21, 2, 7, STEEL_D);
    r(17, 21, 2, 7, STEEL_D);
    r(5, 28, 2, 2, skin);
    r(17, 28, 2, 2, skin);
    r(10, 21, 3, 1, STEEL_D); // scratches
    r(12, 24, 2, 1, STEEL_D);
    r(10, 28, 4, 5, cloak); // tabard
  }

  // ---- belt ----
  sec = 'belt';
  const bl = L.belt;
  if (bl === 'rope' || bl === 'purse') r(7, 29, 10, 1, TAN);
  if (bl === 'purse') {
    r(14, 29, 4, 4, 0xb08a20);
    r(15, 30, 2, 2, GOLD);
    r(15, 28, 2, 1, TAN_D);
  } else if (bl === 'hilt') {
    r(7, 29, 10, 1, 0x3a2a1a);
    r(3, 30, 6, 1, GOLD); // crossguard
    r(5, 26, 2, 4, 0x5a3a22); // grip
    r(5, 25, 2, 1, GOLD); // pommel
    r(5, 31, 2, 2, STEEL); // tip of blade under the cloak hem
  }

  // ---- head ----
  sec = 'head';
  r(8, 10, 8, 8, skin);
  r(8, 10, 8, 2, hair);
  r(8, 12, 1, 3, hair);
  r(15, 12, 1, 3, hair);
  const face = o.face ?? 'calm';
  if (face === 'shock') {
    r(10, 13, 1, 2, OUTLINE);
    r(13, 13, 1, 2, OUTLINE);
    r(11, 15, 2, 2, OUTLINE);
  } else {
    r(10, 13, 1, 1, OUTLINE);
    r(13, 13, 1, 1, OUTLINE);
    if (face === 'angry') {
      r(9, 12, 2, 1, OUTLINE);
      r(13, 12, 2, 1, OUTLINE);
      r(11, 16, 2, 1, OUTLINE);
    } else if (face === 'happy') {
      r(10, 15, 1, 1, OUTLINE);
      r(13, 15, 1, 1, OUTLINE);
      r(11, 16, 2, 1, OUTLINE);
    } else r(11, 16, 2, 1, dark(skin, 0.6));
  }
  if (L.mark === 1) {
    r(8, 12, 8, 1, OUTLINE);
    r(12, 12, 3, 3, OUTLINE);
  } else if (L.mark === 2) {
    r(9, 15, 6, 1, hair);
    r(9, 16, 1, 1, hair);
    r(14, 16, 1, 1, hair);
  } else if (L.mark === 3) {
    r(9, 12, 1, 1, 0xc03a3a);
    r(10, 13, 1, 1, 0xc03a3a);
    r(9, 14, 1, 1, 0xc03a3a);
  }

  // ---- hat ----
  sec = 'hat';
  const h = L.hat;
  if (h === 'straw') {
    r(4, 9, 16, 2, 0xe0c060);
    r(8, 5, 8, 4, 0xe0c060);
    r(8, 8, 8, 1, 0xa08a3a);
  } else if (h === 'hood') {
    const c = dark(light(cloak, 0.45), 0.85);
    r(7, 8, 10, 3, c);
    r(7, 11, 2, 7, c);
    r(15, 11, 2, 7, c);
    r(10, 7, 4, 1, c);
  } else if (h === 'cap') {
    r(7, 7, 11, 3, 0x8a2a3a);
    r(8, 6, 8, 1, 0x8a2a3a);
    r(7, 10, 10, 1, GOLD);
    r(17, 8, 1, 3, GOLD);
  } else if (h === 'helm') {
    r(7, 7, 10, 5, STEEL);
    r(8, 6, 8, 1, STEEL);
    r(7, 11, 10, 1, STEEL_D);
    r(11, 12, 2, 3, STEEL_D);
    r(9, 8, 1, 2, 0xffffff);
  } else if (h === 'feather') {
    r(5, 9, 14, 2, 0x5a2a7a);
    r(8, 6, 8, 3, 0x5a2a7a);
    r(8, 8, 8, 1, GOLD);
    r(15, 2, 2, 5, 0xffffff);
    r(17, 1, 2, 3, 0xffffff);
    r(19, 0, 2, 2, 0xf0f0f0);
  } else if (h === 'tall') {
    r(8, 0, 8, 10, 0x4a4a5a);
    r(7, 9, 10, 2, 0x4a4a5a);
    r(9, 2, 2, 2, 0x6a6a7a);
    r(13, 5, 2, 2, 0x6a6a7a);
    r(16, 1, 3, 2, 0x5a9ab8); // an eel tail poking out
    r(18, 0, 1, 1, 0x5a9ab8);
  }

  // ---- held item ----
  sec = 'hand';
  const it = L.hand;
  if (it === 'hoe') {
    r(20, 12, 1, 27, WOOD);
    r(17, 11, 4, 2, STEEL_D);
  } else if (it === 'staff') {
    r(20, 6, 1, 35, WOOD);
    r(20, 5, 3, 1, WOOD);
    r(22, 6, 1, 2, WOOD);
  } else if (it === 'scales') {
    r(19, 25, 1, 4, GOLD);
    r(17, 25, 6, 1, GOLD);
    r(17, 26, 1, 2, GOLD);
    r(22, 26, 1, 2, GOLD);
    r(16, 28, 3, 1, GOLD);
    r(21, 28, 3, 1, GOLD);
  } else if (it === 'sword') {
    r(20, 8, 2, 18, STEEL);
    r(20, 8, 1, 18, 0xffffff);
    r(18, 26, 6, 1, GOLD);
    r(20, 27, 2, 3, 0x5a3a22);
  } else if (it === 'lute') {
    r(17, 24, 6, 5, 0xc0803a);
    r(18, 23, 4, 1, 0xc0803a);
    r(18, 29, 4, 1, 0xa0602a);
    r(19, 26, 2, 2, 0x4a2a16);
    r(21, 15, 1, 9, WOOD_D);
    r(20, 14, 3, 2, WOOD_D);
  } else if (it === 'fan') {
    r(18, 22, 5, 1, 0xf090c0);
    r(18, 23, 5, 2, 0xd060a0);
    r(19, 25, 3, 1, 0xd060a0);
    r(20, 26, 1, 2, WOOD);
  }
}

// ---------- icons (9x9) ----------

const ICON_ROWS: Record<string, string[]> = {
  peasant: ['.........', '..yyyyy..', '.yyyyyyy.', 'yyyyyyyyy', '..sssss..', '..sksks..', '..sssss..', '...sss...', '..ppppp..'],
  pilgrim: ['...hhh...', '..hhhhh..', '.hhsssh..', '.hsksksh.', '.hsssssh.', '.hhssshh.', '.hhhhhhh.', '.wwwwwww.', '.wwwwwww.'],
  merchant: ['..rrrrr..', '.rrrrrrr.', '.ggggggg.', '..sssss..', '..sksks..', '..sssss..', '.fffffff.', '.cgcccgc.', '.ccccccc.'],
  adventurer: ['..iiiii..', '.iwiiiii.', '.iiiiiii.', '.iisssii.', '..sksks..', '..sssss..', '.iiiiiii.', '.iiiiiii.', '.iiiiiii.'],
  bard: ['..rrrrr..', '.rrrrrrrw', '..sssss.w', '..sksks..', '..sssss..', '.yyy.....', 'yyyyy.ccc', 'yykyy.ccc', '.yyy..ccc'],
  hat: ['.........', '...kkk...', '...kkk...', '...kkk...', '...kkk...', '.kkkkkkk.', '.........', '.........', '.........'],
  pack: ['...tt....', '..tttt...', '.tttttt..', '.tyyttt..', '.tttttt..', '.tttyyt..', '.tttttt..', '..tttt...', '.........'],
  belt: ['.........', '.........', '.........', 'ttttttttt', 'tttyyyttt', 'tttyktttt', 'tttyyyttt', 'ttttttttt', '.........'],
  hand: ['......i..', '.....ii..', '....ii...', '...ii....', '..ii.....', '.yyy.....', '..t......', '.t.......', '.........'],
  body: ['...sss...', '.ccccccc.', 'ccccccccc', 'c.ccccc.c', 'c.ccccc.c', 's.ccccc.s', '..ccccc..', '..c...c..', '..c...c..'],
  crate: ['ttttttttt', 'tkkkkkkkt', 'tktt.ttkt', 'tkt.t.tkt', 'tk.ttt.kt', 'tkt.t.tkt', 'tktt.ttkt', 'tkkkkkkkt', 'ttttttttt'],
  shift: ['.........', '...G.....', '..GG.....', '.GGGGGGG.', '..GG.....', '.....oo..', '.ooooooo.', '.....oo..', '.........'],
  noble: ['......w..', '.....ww..', '.pppppw..', 'ppppppppp', '..ggggg..', '..sksks..', '..sssss..', '.pppppp..', '.pgpppp..'],
  farm: ['....y....', '.y.yyy.y.', '.yyyyyyy.', '..yyyyy..', '...yyy...', '...ttt...', '..ttttt..', '.tt.t.tt.', '.........'],
  shrine: ['....y....', '...iii...', '..iiiii..', '.iiiiiii.', '..i.i.i..', '..i.i.i..', '..i.i.i..', '.iiiiiii.', 'iiiiiiiii'],
  market: ['ryryryryr', 'ryryryryr', '.........', '.t.....t.', '.t.ygy.t.', '.ttttttt.', '.t.....t.', '.t.....t.', '.........'],
  fort: ['.i.i.i.i.', '.iiiiiii.', '..iiiii..', '..iiiii..', '..iikii..', '..iikii..', '..iiiii..', '.iiiiiii.', '.iiiiiii.'],
  castle: ['..r......', '..rr.....', '..i...i..', 'i.i.i.i.i', 'iiiiiiiii', 'iiiiiiiii', 'iiiikiiii', 'iiikkkiii', 'iiikkkiii'],
  writ: ['.........', '.ttttttt.', 'ttttttttt', '.t.....t.', '.tttttt..', '.t....SS.', '.tttt.SS.', 'tttttttt.', '.........'],
  coin: ['.........', '...ggg...', '..gyyyg..', '.gyygyyg.', '.gygyyyg.', '.gyygyyg.', '..gyyyg..', '...ggg...', '.........'],
  mask: ['.........', '.........', 'kkkkkkkkk', 'kwwkkkwwk', 'kwwkkkwwk', '.kkkkkkk.', '..kk.kk..', '.........', '.........'],
  barrel: ['..ttttt..', '.ttttttt.', '.kkkkkkk.', '.ttttttt.', '.ttttttt.', '.ttttttt.', '.kkkkkkk.', '.ttttttt.', '..ttttt..'],
  eye: ['.........', '.........', '..wwwww..', '.wwbbbww.', 'wwbbkbbww', '.wwbbbww.', '..wwwww..', '.........', '.........'],
  zzz: ['.....wwww', '.......w.', '......w..', '.....wwww', 'wwww.....', '..w......', '.w.......', 'wwww.....', '.........'],
  check: ['.........', '........G', '.......GG', '......GG.', 'G....GG..', 'GG..GG...', '.GGGG....', '..GG.....', '.........'],
  cross: ['.........', '.R.....R.', '.RR...RR.', '..RR.RR..', '...RRR...', '..RR.RR..', '.RR...RR.', '.R.....R.', '.........'],
  goon: ['.........', '..ggggg..', '.gkgggkg.', '.ggggggg.', '.gwgggwg.', '..ggggg..', '.ggggggg.', 'gg.ggg.gg', '..g...g..'],
  poster: ['ttttttttt', 'tyyyyyyyt', 'tyykkkyyt', 'tyykkkyyt', 'tyyykyyyt', 'tyykkkyyt', 'tyyyyyyyt', 'tyrryrryt', 'ttttttttt'],
  heart: ['.........', '.RR...RR.', 'RRRR.RRRR', 'RRRRRRRRR', 'RRRRRRRRR', '.RRRRRRR.', '..RRRRR..', '...RRR...', '....R....'],
  up: ['....G....', '...GGG...', '..GGGGG..', '.GGGGGGG.', '...GGG...', '...GGG...', '...GGG...', '...GGG...', '.........'],
  boot: ['.........', '..iii....', '..iii....', '..iii....', '..iiw....', '..iiiiii.', '..iiiiiii', '..yyyyyyy', '.........'],
  glow: ['....y....', '.y..y..y.', '..y.y.y..', '...yyy...', 'yyyywyyyy', '...yyy...', '..y.y.y..', '.y..y..y.', '....y....'],
  question: ['..kkkkk..', '.kk...kk.', '......kk.', '.....kk..', '....kk...', '....kk...', '.........', '....kk...', '....kk...'],
  bang: ['....R....', '...RRR...', '...RRR...', '...RRR...', '....R....', '....R....', '.........', '....R....', '...RRR...'],
  point: ['....g....', '...gwg...', '...ggg...', '...ggg...', '.g.ggggg.', '.gggggggg', '.gggggggg', '..ggggggg', '...ggggg.'],
  sign: ['.ttttttt.', 'tkkkkkkkt', 'tkwkwkwkt', 'tkkkkkkkt', 'tkkwwwkkt', '.ttttttt.', '....t....', '....t....', '....t....'],
  star: ['....y....', '....y....', '...yyy...', 'yyyyyyyyy', '.yyyyyyy.', '..yyyyy..', '..yy.yy..', '.yy...yy.', '.........'],
  blush: ['.........', '..ggggg..', '.ggggggg.', '.gkgggkg.', '.ggggggg.', '.RRgggRR.', '..ggkgg..', '...ggg...', '.........'],
  // mood faces
  moodHappy: ['..yyyyy..', '.yyyyyyy.', 'yykyyykyy', 'yyyyyyyyy', 'ykyyyyyky', 'yykkkkkyy', 'yyyyyyyyy', '.yyyyyyy.', '..yyyyy..'],
  moodHmm: ['..yyyyy..', '.yyyyyyy.', 'yykyyykyy', 'yyyyyyyyy', 'yyyyyyyyy', 'yykkkkkyy', 'yyyyyyyyy', '.yyyyyyy.', '..yyyyy..'],
  moodAnnoyed: ['..ooooo..', '.ooooooo.', 'okkooookk', 'ooko.okoo', 'ooooooooo', 'ooookkooo', 'oookookoo', '.ooooooo.', '..ooooo..'],
  moodFurious: ['..RRRRR..', '.RRRRRRR.', 'RkkRRRkkR', 'RRkRRRkRR', 'RRRRRRRRR', 'RRkkkkkRR', 'RkRRRRRkR', '.RRRRRRR.', '..RRRRR..'],
};

const ICON_PAL: Record<string, number> = {
  y: 0xe8c04a,
  g: 0x6a9a4a,
  G: 0x8fd14f,
  s: 0xf0c8a0,
  k: 0x140c1c,
  p: 0x8a5aa8,
  h: 0x8a6a4a,
  w: 0xf4e8c1,
  r: 0xc03a3a,
  R: 0xe05050,
  f: 0xf4ecd8,
  c: 0x3a6ea8,
  i: 0xa8b0bc,
  t: 0x8a5a2a,
  b: 0x3a8ad0,
  o: 0xe08a3a,
};

const iconCache = new Map<string, GraphicsContext>();

/** A shared 9x9 icon context (bounded: one per icon name and seal colour). */
export function icon(name: string, seal = -1): GraphicsContext {
  const key = `${name}:${seal}`;
  let c = iconCache.get(key);
  if (c) return c;
  c = new GraphicsContext();
  const rows = ICON_ROWS[name] ?? ICON_ROWS.question;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = ch === 'S' ? (SEALS[seal] ?? 0xd03030) : ICON_PAL[ch];
      if (col === undefined) continue;
      c.rect(x, y, 1, 1).fill(col);
    }
  });
  iconCache.set(key, c);
  return c;
}

// ---------- Grumm (in-scene, 36x40) ----------

export type GrummExpr = 'chew' | 'squint' | 'grin' | 'blush' | 'nap' | 'thump';
const grummCache = new Map<string, GraphicsContext>();
const SKIN_G = 0x6a8a4a;
const SKIN_GD = 0x4a6a32;
const SKIN_GL = 0x8aaa62;

export function grummArt(expr: GrummExpr, frame: number): GraphicsContext {
  const key = `${expr}:${frame & 1}`;
  let c = grummCache.get(key);
  if (c) return c;
  c = new GraphicsContext();
  const r = (x: number, y: number, w: number, h: number, col: number) => c!.rect(x, y, w, h).fill(col);
  const f = frame & 1;
  if (expr === 'nap') {
    // Slumped against the gate post, sitting.
    r(4, 22, 28, 18, SKIN_GD);
    r(5, 23, 26, 16, SKIN_G);
    r(8, 14, 18, 12, SKIN_GD);
    r(9, 15, 16, 10, SKIN_G);
    r(11, 19, 4, 1, OUTLINE);
    r(19, 19, 4, 1, OUTLINE);
    r(14, 22, 6, 2 + f, OUTLINE);
    r(6, 30, 24, 3, 0x6a4a2a); // loincloth
    r(2, 34, 8, 6, SKIN_GD);
    r(26, 34, 8, 6, SKIN_GD);
    return c;
  }
  const bob = expr === 'thump' ? f : 0;
  // legs
  r(9, 32, 7, 8, SKIN_GD);
  r(20, 32, 7, 8, SKIN_GD);
  r(8, 38, 9, 2, SKIN_G);
  r(19, 38, 9, 2, SKIN_G);
  // body
  r(5, 14 + bob, 26, 20, SKIN_GD);
  r(6, 15 + bob, 24, 18, SKIN_G);
  r(8, 17 + bob, 20, 6, SKIN_GL);
  r(6, 28 + bob, 24, 5, 0x6a4a2a);
  r(6, 28 + bob, 24, 1, 0x8a6a3a);
  // arms
  if (expr === 'thump') {
    r(10, 16 + bob, 6, 6, SKIN_GD);
    r(20, 16 + bob, 6, 6, SKIN_GD);
  } else {
    r(1, 16, 5, 16, SKIN_GD);
    r(30, 16, 5, 16, SKIN_GD);
    r(0, 30, 6, 4, SKIN_G);
    r(30, 30, 6, 4, SKIN_G);
  }
  // head
  const hy = 2 + bob;
  r(9, hy, 18, 14, SKIN_GD);
  r(10, hy + 1, 16, 12, SKIN_G);
  r(8, hy + 3, 2, 4, SKIN_GD); // ears
  r(26, hy + 3, 2, 4, SKIN_GD);
  r(12, hy + 1, 12, 1, SKIN_GL);
  // brow + eyes
  r(11, hy + 4, 14, 1, SKIN_GD);
  if (expr === 'squint') {
    r(12, hy + 6, 4, 1, OUTLINE);
    r(20, hy + 6, 4, 1, OUTLINE);
  } else if (expr === 'grin') {
    r(12, hy + 5, 4, 1, OUTLINE);
    r(20, hy + 5, 4, 1, OUTLINE);
    r(12, hy + 6, 1, 1, OUTLINE);
    r(15, hy + 6, 1, 1, OUTLINE);
    r(20, hy + 6, 1, 1, OUTLINE);
    r(23, hy + 6, 1, 1, OUTLINE);
  } else {
    r(13, hy + 5, 3, 3, 0xf4e8c1);
    r(20, hy + 5, 3, 3, 0xf4e8c1);
    r(14, hy + 6, 1, 2, OUTLINE);
    r(21, hy + 6, 1, 2, OUTLINE);
  }
  if (expr === 'blush') {
    r(11, hy + 8, 3, 2, 0xe07070);
    r(22, hy + 8, 3, 2, 0xe07070);
  }
  // nose
  r(17, hy + 7, 2, 2, SKIN_GD);
  // mouth: underbite with tusks
  const open = expr === 'chew' ? f : expr === 'grin' || expr === 'thump' ? 1 : 0;
  if (expr === 'grin') {
    r(12, hy + 10, 12, 2, OUTLINE);
    r(13, hy + 10, 10, 1, 0xf4e8c1);
  } else {
    r(13, hy + 10, 10, 1 + open, OUTLINE);
  }
  r(13, hy + 8 + (open ? 0 : 1), 1, 2, 0xf4e8c1);
  r(22, hy + 8 + (open ? 0 : 1), 1, 2, 0xf4e8c1);
  grummCache.set(key, c);
  return c;
}

// ---------- goons (10x10) ----------

const goonCache: GraphicsContext[] = [];
export function goonArt(frame: number): GraphicsContext {
  const f = frame & 1;
  if (goonCache[f]) return goonCache[f];
  const c = new GraphicsContext();
  const r = (x: number, y: number, w: number, h: number, col: number) => c.rect(x, y, w, h).fill(col);
  r(1, 3 + f, 8, 7 - f, SKIN_GD);
  r(2, 4 + f, 6, 5 - f, SKIN_G);
  r(3, 5 + f, 1, 1, OUTLINE);
  r(6, 5 + f, 1, 1, OUTLINE);
  r(3, 8, 4, 1, OUTLINE);
  r(3, 7 + f, 1, 1, 0xf4e8c1);
  r(6, 7 + f, 1, 1, 0xf4e8c1);
  r(0, 4 + f, 1, 2, SKIN_GD);
  r(9, 4 + f, 1, 2, SKIN_GD);
  goonCache[f] = c;
  return c;
}

// ---------- particles ----------

const partCache = new Map<string, GraphicsContext>();
export function particle(kind: 'coin' | 'star' | 'eel' | 'poof' | 'spark' | 'cloth'): GraphicsContext {
  let c = partCache.get(kind);
  if (c) return c;
  c = new GraphicsContext();
  if (kind === 'coin') {
    c.rect(0, 0, 4, 4).fill(0xa07a20);
    c.rect(0, 0, 3, 3).fill(GOLD);
    c.rect(1, 1, 1, 1).fill(0xfff0a0);
  } else if (kind === 'star') {
    c.rect(1, 0, 1, 3).fill(0xfff08a);
    c.rect(0, 1, 3, 1).fill(0xfff08a);
  } else if (kind === 'eel') {
    c.rect(0, 1, 6, 2).fill(0x5a9ab8);
    c.rect(6, 0, 2, 1).fill(0x5a9ab8);
    c.rect(6, 3, 2, 1).fill(0x5a9ab8);
    c.rect(1, 1, 1, 1).fill(OUTLINE);
  } else if (kind === 'poof') {
    c.rect(1, 0, 4, 6).fill(0xe8e0f0);
    c.rect(0, 1, 6, 4).fill(0xe8e0f0);
    c.rect(1, 1, 2, 2).fill(0xffffff);
  } else if (kind === 'spark') {
    c.rect(0, 0, 2, 2).fill(0xffffff);
  } else {
    c.rect(0, 0, 3, 2).fill(0x8a6a4a);
    c.rect(1, 2, 2, 1).fill(0x6a4a2a);
  }
  partCache.set(kind, c);
  return c;
}

// ---------- manager portrait (12x12, two frames) ----------

export const GRUMM_PAL: Record<string, string> = {
  g: '#6a8a4a',
  G: '#4a6a32',
  l: '#8aaa62',
  k: '#140c1c',
  w: '#f4e8c1',
  b: '#6a4a2a',
  B: '#2a1a3a',
};

export const GRUMM_IDLE = [
  'BBBBBBBBBBBB',
  'BBBGGGGGGBBB',
  'BBGglllllgGB',
  'BGGgggggggGG',
  'BGgkwgggwkgG',
  'BBGggggggGGB',
  'BBGgggGgggBB',
  'BBGwkkkkwgBB',
  'BBBGgggggGBB',
  'BBGGGGGGGGGB',
  'BGgggbbbgggG',
  'GgggbbbbbgggG',
].map((r) => r.slice(0, 12));

export const GRUMM_TALK = [
  'BBBBBBBBBBBB',
  'BBBGGGGGGBBB',
  'BBGglllllgGB',
  'BGGgggggggGG',
  'BGgkwgggwkgG',
  'BBGggggggGGB',
  'BBGgggGgggBB',
  'BBGwkkkkwgBB',
  'BBBGkkkkkGBB',
  'BBGGGGGGGGGB',
  'BGgggbbbgggG',
  'GgggbbbbbgggG',
].map((r) => r.slice(0, 12));
