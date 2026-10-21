// War Pit pixel art: 12x10 beast sprites (drawn at 2x on 34x40 cards), 7x7 trigger and item
// glyphs, 12x10 food sprites and Snarl's 12x12 portrait. Every texture is built once per page
// from the rows below and cached for its lifetime (a fixed, bounded set), never per frame.
import { CanvasSource, Texture } from 'pixi.js';
import type { FoodId, ItemId, Trig, UnitId } from './units';

export const PAL = {
  sand: 0x6a4a2a,
  sandHi: 0x8a6438,
  sandLo: 0x4a3018,
  sandRed: 0x7a2a1a,
  wall: 0x2a1a20,
  wallHi: 0x3a2630,
  bar: 0x1a1014,
  iron: 0x5a5060,
  ironHi: 0x8a8090,
  ink: 0x0a0410,
  card: 0x2a1a2a,
  cardRival: 0x2a1a1a,
  gold: 0xe8c04a,
  atk: 0xd05a2a,
  hp: 0x4a9a3a,
  sel: 0xf4e8c1,
  frozen: 0x6ac8f0,
};

/** Card border colour by tier (T6 = the Huntmaster). */
export const TIER_COL = [0x5c3a6e, 0x8a7a6a, 0x4a9a5a, 0x4a7ad8, 0xa05ae0, 0xe8a03a, 0xe04040];

type Rows = string[];

const B: Record<UnitId, { rows: Rows; a: string; b: string; c: string; e?: string }> = {
  rat: { a: '#8a8078', b: '#5a5048', c: '#e0a0a0', rows: ['', '..kk', '.kcck', 'kaaaakkkk', 'keaaaaaaak', 'wkaaaaaaaak', '.kaaaaaaaakc', '..kbk..kbk.c'] },
  stirge: { a: '#b05040', b: '#702a20', c: '#e0c0a0', rows: ['', '.k......k', 'kck....kck', 'kcck.kkcck', '.kcckeekck', '..kaaaaak', 'wwkaaaaak', '...kbbbk', '....kk'] },
  piglet: { a: '#e8a0a8', b: '#a86068', c: '#ffd0d8', rows: ['', '', '..k.k', '.kakakkkk', 'kaeaaaaaak', 'ccaaaaaaaak', 'kwaaaaaaaak', '.kaaaaaaak', '..kb.kb.kb'] },
  dung: { a: '#6a4a2a', b: '#3a2a1a', c: '#a07a4a', rows: ['', '', '....kkkk', '.k.kccaak', 'kekaaaaaak', 'kkaabaabak', '.kaaaaaaak', '.kkbkbkbkk'] },
  crow: { a: '#3a3448', b: '#1a1424', c: '#6a6080', e: '#e8c04a', rows: ['', '...kk', '..kaak', '.yyeak', '..kaaakkk', '...kaaaaakk', '...kaaaaaaak', '....kbbbbk', '.....y..y'] },
  leech: { a: '#4a6a3a', b: '#2a4020', c: '#8aa060', rows: ['', '', '', '..kkkkkk', '.krcaaaakk', 'kwrcaaaaaak', 'kaaaaaaaaaak', '.kbbbbbbbbk'] },
  wolf: { a: '#7a8898', b: '#4a5868', c: '#b8c8d8', e: '#e8c04a', rows: ['', '.k.k', '.kakk', 'kaeaak', 'wwaaaakkkkk', '.kaaaaaaaaak', '..kaaaaaaak', '..kak..kak', '..kbk..kbk'] },
  spider: { a: '#5a3a6a', b: '#2a1a3a', c: '#8a6a9a', rows: ['', '', '....kkkk', '...kaaaak', '.kkeeaaaakk', 'k.kaaaaaak.k', '.k.kaaaak.k', 'k.k.kkkk.k.k'] },
  rust: { a: '#b8642a', b: '#7a3a1a', c: '#e8a060', rows: ['', '', 'w...kkkkk', 'wk.kccaaak', '.kkaaaaaaak', 'kekaabaabak', '.kaaaaaaaak', '..kbkbkbkk'] },
  ember: { a: '#c84a2a', b: '#8a2a1a', c: '#f0a040', e: '#fff2a0', rows: ['', '.k......y.y', 'kak....yrry', 'kaek..kkrrk', 'wwaakkaaaak', '.kaaaaaaaak', '..kaaaaaak', '..kak..kak'] },
  mimic: { a: '#8a5a2a', b: '#5a3a1a', c: '#c89a4a', rows: ['', '', '.kkkkkkkkk', '.kaaaaaaak', '.kyyyyyyyk', '.kwkwkwkwk', '.kerkkkerk', '.kaaaaaaak', '.kbbbbbbbk'] },
  bat: { a: '#4a3a5a', b: '#2a1a3a', c: '#7a6a8a', rows: ['', 'k..........k', 'kak.k..k.kak', 'kaakaeeakaak', '.kaaaaaaaak', '..kaawwaak', '...kaaaak', '....k..k'] },
  boar: { a: '#7a5030', b: '#4a3018', c: '#a87850', rows: ['', '..k', '.kakkkkkk', 'kaeaaaaaakk', 'ccaaaaaaaaak', 'wwaaaaaaaaak', '.wkaaaaaaak', '..kbk..kbk', '..kk...kk'] },
  gorgon: { a: '#5a8a3a', b: '#3a5a20', c: '#9ac060', e: '#e8c04a', rows: ['', '.r.r.r', 'kkkkkk', 'keaaaak', 'kaaaaakkkk', '.kaaaaaaaakk', '..kaaaaaaa.k', '..kbk.kbk'] },
  owlbear: { a: '#7a5a3a', b: '#4a3420', c: '#d8c8a0', rows: ['', '.kk..kk', 'kcckkcck', 'kcekkeck', '.kcyyck.kk', 'kaaaaaakaak', 'kaaaaaaaaak', '.kaaaaaaak', '..kbk.kbk'] },
  wasp: { a: '#e8c03a', b: '#1a1424', c: '#d8f0ff', rows: ['', '....cc.cc', '....kcckck', '..kkkkkkkk', '.keayayayk', 'kwkayayayakk', '..kkkkkkkk.w', '...k.k.k'] },
  manticore: { a: '#c06a3a', b: '#7a3a1a', c: '#e8a050', e: '#fff2a0', rows: ['.........kk', '..kk....kwak', '.kcck......k', 'kceccak....k', 'wkcaaakkkkk', '.kaaaaaaaak', '..kaaaaaak', '..kak..kak'] },
  wyvern: { a: '#3a8a5a', b: '#205a3a', c: '#8ad0a0', rows: ['', '......kkk', '..kk.kcccck', '.kaekkccccck', 'wwaaakaaak', '..kaaaaaaakk', '...kaaaaa..k', '...kbk.kbk'] },
  sabre: { a: '#c8a060', b: '#8a6a3a', c: '#f0d8a0', rows: ['', '.k.k', 'kakak', 'kaeaakkkkkk', 'kaaaaaaaaaak', 'wkwaaaaaaak', '..kaaaaaak', '..kak..kak'] },
  gargoyle: { a: '#7a7880', b: '#4a4850', c: '#a8a6b0', e: '#e05050', rows: ['.w......w', '.kk....kk', 'kaak..kaak', 'kcekkkkeck', 'kaaaaaaaak', 'kkaaaaaakk', 'kaaaaaaaak', '.kaak.kaak', '.kbbk.kbbk'] },
  ogre: { a: '#8a9a5a', b: '#5a6a3a', c: '#e8e0c8', rows: ['...kkkk', '..kaaaak', '..keaeak', '..kawwak', '.kkaaaakk', 'kaakcckaak', 'kak.cc.kak', '...kaak', '..kbk.kbk'] },
  hydra: { a: '#2a8a8a', b: '#1a5a5a', c: '#7ad0c8', rows: ['.kk..kk..kk', 'kek.kek.kek', '.kak.kak.kk', '..kak.kakk', '...kaaaak', '..kaaaaaak', '..kaaaaaak', '...kbk.kbk'] },
  dragon: { a: '#c03030', b: '#7a1818', c: '#f0a040', e: '#fff2a0', rows: ['..kk...kkk', '.kaek.kccck', 'kaaaakccccck', 'wwaaaakcccck', '.kkaaaaaaakk', '..kaaaaaaaak', '..kaaaaaaak', '..kbk..kbk'] },
  ratling: { a: '#8a8078', b: '#5a5048', c: '#e0a0a0', rows: ['', '', '', '....kk', '...kcak', '..keaaakk', '..kaaaaak.c', '...kbkbk.c'] },
  brood: { a: '#5a3a6a', b: '#2a1a3a', c: '#8a6a9a', rows: ['', '', '', '....kkk', '..k.keak.k', '.k.kaaaak.k', '..k.kkkk.k'] },
  head: { a: '#2a8a8a', b: '#1a5a5a', c: '#7ad0c8', rows: ['', '..kkk', '.keaak', 'wwaaak', '..kaak', '...kak', '...kaak', '...kbbk'] },
  shade: { a: '#8ab8d8', b: '#4a6a8a', c: '#d8f0ff', e: '#1a1424', rows: ['', '....kkk', '...kaaak', '..kaeaeak', '..kaaaaak', '..kaaaaak', '..kakakak', '...k.k.k'] },
  hunt: { a: '#4a6a3a', b: '#2a3a20', c: '#e0b080', rows: ['...kkkkk', '..kyyyyyk', '.kkkkkkkkk', '...kccck', '...kcekc', '..kaaaaak', '.kcaaaaack', '.k.kaaak.k', '...kb.bk', '...kk.kk'] },
};

const FOOD_ART: Record<FoodId, { rows: Rows; a: string; b: string; c: string }> = {
  haunch: { a: '#c05a3a', b: '#7a2a1a', c: '#f0e0c0', rows: ['', '', '...kkkk', '..kaaaak', '.kaaabaak', '.kaabaaak', '..kaaakck', '...kkkcck', '......kcc', '.......k'] },
  toy: { a: '#e8e0c8', b: '#a8a088', c: '#ffffff', rows: ['', '', '', '.kk....kk', 'kcck..kcck', '.kaakkaak', 'kcck..kcck', '.kk....kk'] },
  pudding: { a: '#8a1a2a', b: '#5a0a1a', c: '#e05060', rows: ['', '', '....kk', '...kcck', '..kaaaak', '.kaaaaaak', '.kabaabak', '.kaaaaaak', '..kkkkkk'] },
  collar: { a: '#5a3a2a', b: '#3a2018', c: '#d8d8e0', rows: ['', '', '..c.c.c', '.kkkkkkk', 'kaaaaaaak', 'ka.....ak', 'kaaaaaaak', '.kkkkkkk', '..c.c.c'] },
  lunch: { a: '#4a6aa8', b: '#2a3a6a', c: '#e8c04a', rows: ['', '', '...kkkk', '...k..k', '.kkkkkkkk', '.kaaaaaak', '.kaccccak', '.kaaaaaak', '.kbbbbbbk', '.kkkkkkkk'] },
  charm: { a: '#e8e0c8', b: '#a8a088', c: '#8a1a2a', rows: ['', '....k', '...kck', '....k', '..kkkkk', '.kaaaaak', '.kakakak', '.kaaaaak', '..kbbbk', '...kkk'] },
};

// 7x7 glyphs: '1' = colour, '2' = accent.
const TRIG_ART: Record<Exclude<Trig, 'none'>, { rows: Rows; c: string; d?: string }> = {
  faint: { c: '#e8e0c8', rows: ['.11111.', '1111111', '1.1.1.1', '1111111', '.11.11.', '.1.1.1.', '.......'] },
  hurt: { c: '#e05050', rows: ['.11.11.', '1111111', '1111111', '.11111.', '..111..', '...1...', '.......'] },
  start: { c: '#e8c04a', d: '#8a6a3a', rows: ['2111...', '21111..', '211111.', '2111...', '2......', '2......', '2......'] },
  attack: { c: '#f0f0f0', d: '#e05050', rows: ['1.....1', '11...11', '.1...1.', '.11.11.', '..2.2..', '..222..', '...2...'] },
  ko: { c: '#fff2a0', rows: ['...1...', '...1...', '1111111', '.11111.', '..111..', '.11.11.', '.1...1.'] },
  buy: { c: '#e8c04a', d: '#8a6a3a', rows: ['..111..', '.11111.', '1122211', '1121111', '1122211', '.11111.', '..111..'] },
  sell: { c: '#e8c04a', d: '#8a6a3a', rows: ['..111..', '.11111.', '1122211', '1121111', '1122211', '.11111.', '..111..'] },
  endshop: { c: '#a8d0e0', d: '#5a8aa0', rows: ['...1...', '..111..', '.11111.', '.11111.', '1111111', '..222..', '...2...'] },
  ahead: { c: '#8fd14f', rows: ['...1...', '..11...', '.111111', '1111111', '.111111', '..11...', '...1...'] },
  passive: { c: '#a8a6b0', d: '#5a5860', rows: ['1111111', '1222221', '1222221', '1222221', '.12221.', '..121..', '...1...'] },
};

const ITEM_ART: Record<ItemId, { rows: Rows; c: string; d?: string }> = {
  toy: { c: '#e8e0c8', rows: ['11...11', '111.111', '.11111.', '..111..', '.11111.', '111.111', '11...11'] },
  collar: { c: '#c8c8d0', d: '#5a3a2a', rows: ['.1.1.1.', '2222222', '2.....2', '2.....2', '2.....2', '2222222', '.1.1.1.'] },
  charm: { c: '#e8e0c8', d: '#c03030', rows: ['...2...', '..2.2..', '.11111.', '1111111', '1.1.1.1', '1111111', '.1.1.1.'] },
};

/** Status glyphs for the card's status slot: armor, thorns, netted. */
const STATUS_ART: Record<'armor' | 'thorns' | 'net' | 'crown' | 'frozen', { rows: Rows; c: string; d?: string }> = {
  armor: { c: '#a8a6b0', d: '#5a5860', rows: ['1111111', '1222221', '1222221', '1222221', '.12221.', '..121..', '...1...'] },
  thorns: { c: '#8fd14f', rows: ['1..1..1', '.1.1.1.', '..111..', '1111111', '..111..', '.1.1.1.', '1..1..1'] },
  net: { c: '#c8b890', rows: ['1.1.1.1', '.1.1.1.', '1.1.1.1', '.1.1.1.', '1.1.1.1', '.1.1.1.', '1.1.1.1'] },
  crown: { c: '#e8c04a', d: '#c03030', rows: ['.......', '1..1..1', '11.1.11', '1121211', '1111111', '1111111', '.......'] },
  frozen: { c: '#d8f4ff', d: '#6ac8f0', rows: ['...1...', '1.212.1', '.12221.', '1122211', '.12221.', '1.212.1', '...1...'] },
};

const cache = new Map<string, Texture>();

function build(key: string, w: number, h: number, rows: Rows, colorOf: (ch: string) => string | null): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < Math.min(w, row.length); x++) {
      const c = colorOf(row[x]);
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  const tex = new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'nearest' }) });
  cache.set(key, tex);
  return tex;
}

function beastColor(p: { a: string; b: string; c: string; e?: string }) {
  return (ch: string): string | null => {
    switch (ch) {
      case 'k':
        return '#140a10';
      case 'a':
        return p.a;
      case 'b':
        return p.b;
      case 'c':
        return p.c;
      case 'e':
        return p.e ?? '#ff4a3a';
      case 'w':
        return '#f4ecd8';
      case 'r':
        return '#c03030';
      case 'y':
        return '#e8c04a';
      case 'n':
        return '#2a1a10';
      default:
        return null;
    }
  };
}

/** 12x10 beast sprite (scale 2 on cards). */
export function beastTex(k: UnitId): Texture {
  const p = B[k];
  return build(`b.${k}`, 12, 10, p.rows, beastColor(p));
}

export function foodTex(f: FoodId): Texture {
  const p = FOOD_ART[f];
  return build(`f.${f}`, 12, 10, p.rows, beastColor(p));
}

function glyph(key: string, a: { rows: Rows; c: string; d?: string }): Texture {
  return build(key, 7, 7, a.rows, (ch) => (ch === '1' ? a.c : ch === '2' ? (a.d ?? a.c) : null));
}

export function trigTex(t: Trig): Texture | null {
  if (t === 'none') return null;
  return glyph(`t.${t}`, TRIG_ART[t]);
}

export function itemTex(i: ItemId): Texture {
  return glyph(`i.${i}`, ITEM_ART[i]);
}

export function statusTex(s: keyof typeof STATUS_ART): Texture {
  return glyph(`s.${s}`, STATUS_ART[s]);
}

// ---------- Snarl, the gnoll pitmaster (07 §18): 12x12, two frames ----------

export const SNARL_PAL: Record<string, string> = {
  k: '#1a0f0a',
  a: '#c8a060', // fur
  b: '#7a5a30', // spots / inner ear
  c: '#e8d0a0', // muzzle
  e: '#f0d040', // eyes
  s: '#c04a4a', // scar
  n: '#2a1a10', // nose
  w: '#f4ecd8', // teeth
  r: '#8a2a2a', // mouth
  g: '#5a3a2a', // leather collar
  m: '#c8c8d0', // whistle
};

export const SNARL_IDLE = [
  '.kk......kk.',
  'kbak....kabk',
  'kaaakkkkaaak',
  '.kabaaaabak.',
  '.kaesaaaeak.',
  '.kaasaaaaak.',
  '..kaacccak..',
  '..kacnnack..',
  '..kcwkkwckm.',
  '...kcccckm..',
  '..ggkkkkgg..',
  '.gggggggggg.',
];

export const SNARL_TALK = [
  '.kk......kk.',
  'kbak....kabk',
  'kaaakkkkaaak',
  '.kabaaaabak.',
  '.kaesaaaeak.',
  '.kaasaaaaak.',
  '..kaacccak..',
  '..kacnnack..',
  '..kckkkkck..',
  '..kwrrrrwk..',
  '..ggkkkkgg..',
  '.gggggggggg.',
];
