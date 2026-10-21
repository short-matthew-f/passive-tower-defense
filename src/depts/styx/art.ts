// River Styx pixel art: Pilk's portrait, soul sprites (cached GraphicsContexts, bounded: one per
// species and frame), the Overlord on the dock, imps and the skiff.
import { GraphicsContext } from 'pixi.js';
import { drawSprite } from '../../ui/widgets';

// ---------- Pilk (12x12, two frames) ----------

export const PILK_PAL: Record<string, string> = {
  k: '#e8dcc0', // horns
  c: '#34506a', // hood
  C: '#1e3044', // cloak
  r: '#c8503c', // skin
  R: '#8a2e24',
  y: '#f0d040',
  p: '#1a0a0a',
  m: '#3a0a0a',
  w: '#f4e8c1',
  b: '#8a6a3a', // pole
};

export const PILK_IDLE = [
  '.k........k.',
  '.kk.cccc.kk.',
  '..kccccccck.',
  '.cccccccccc.',
  'rcCrrrrrrCcr',
  'rcryprrypRcr',
  '.crrrrRrrrc.',
  '.crmrrrrmrc.',
  '.ccrmmmmrcc.',
  '..ccrrrrccb.',
  '.CCCccccCCb.',
  'CCCCCCCCCCbC',
];

export const PILK_TALK = [
  '.k........k.',
  '.kk.cccc.kk.',
  '..kccccccck.',
  '.cccccccccc.',
  'rcCrrrrrrCcr',
  'rcryprrypRcr',
  '.crrrrRrrrc.',
  '.crrmmmmrrc.',
  '.ccrmwwmrcc.',
  '..ccrmmrccb.',
  '.CCCccccCCb.',
  'CCCCCCCCCCbC',
];

// ---------- souls ----------

interface SoulArt {
  rows: string[];
  pal: Record<string, number>;
}

const EYE = 0x10141c;
// Each sprite: rows for the head/body; the last row alternates between two tail frames.
const SOULS: Record<string, { rows: string[]; tail: [string, string]; pal: Record<string, number> }> = {
  clerk: {
    rows: ['..aaaaa..', '.aaaaaaa.', 'aawaaawaa', 'aaeaaaeaa', 'aaaammaaa', 'aaaammaab', 'baaaaaabb', 'bbaaaabbb'],
    tail: ['b.bb.bb..', '.bb.bb.b.'],
    pal: { a: 0xc8d4e0, b: 0x8a9cb0, e: EYE, w: 0xffffff, m: 0x2a3040 },
  },
  tourist: {
    rows: ['..hhhhh..', 'hhhhhhhhh', '.aaaaaaa.', 'aaeaaaeaa', 'aaaammaaa', 'aaaaaaaab', 'baccaaabb', 'bbccaabbb'],
    tail: ['b.bb.bb..', '.bb.bb.b.'],
    pal: { a: 0x9ad8b0, b: 0x5a9a78, e: EYE, h: 0xe8c860, m: 0x2a3040, c: 0x404858 },
  },
  knight: {
    rows: ['..sssss..', '.sssssss.', 'ssddddds.', 'sseddeds.', 'sssssssss', '.aaaaaaab', 'baaaaaabb', 'bbaaaabbb'],
    tail: ['b.bb.bb..', '.bb.bb.b.'],
    pal: { a: 0xa8b4c8, b: 0x6a7890, e: 0xe05050, s: 0xc0c8d0, d: 0x303844 },
  },
  poet: {
    rows: ['....f....', '.hhhhfh..', 'hhhhhhhh.', '.aaaaaaa.', 'aaeaaaeaa', 'aaaawaaab', 'baaaaaabb', 'bbaaaabbb'],
    tail: ['b.bb.bb..', '.bb.bb.b.'],
    pal: { a: 0x8ad070, b: 0x4a8a3a, e: EYE, h: 0x5a2a6a, f: 0xf4e8c1, w: 0x2a3040 },
  },
  wraiths: {
    rows: ['.aa...aa.', 'aaaa.aaaa', 'eaea.eaea', 'aaaa.aaaa', 'aaab.aaab', 'baab.baab', 'bbab.bbab', 'bb.b.bb.b'],
    tail: ['b..b.b..b', '.b.b..b.b'],
    pal: { a: 0x70d8d0, b: 0x3a8a8a, e: EYE },
  },
  witch: {
    rows: ['....h....', '...hhh...', '..hhhhh..', 'hhhhhhhhh', '.aaaaaaa.', 'aaeaaaeaa', 'aaaammaab', 'bbaaaabbb'],
    tail: ['b.bb.bb..', '.bb.bb.b.'],
    pal: { a: 0xc8a0f0, b: 0x7a58a8, e: 0xf0e060, h: 0x3a1a5a, m: 0x2a1040 },
  },
  bishop: {
    rows: ['...hgh...', '..hhghh..', '..hhghh..', '.aaaaaaa.', 'aaeaaaeaa', 'aaaaaaaaa', 'bawwwwwab', 'bbaaaaabb'],
    tail: ['b.bb.bb..', '.bb.bb.b.'],
    pal: { a: 0xe8e4d8, b: 0xa8a090, e: EYE, h: 0xf4f0e0, g: 0xe8c04a, w: 0xc03a3a },
  },
  choir: {
    rows: ['..aaaaa..', '.aaaaaaa.', 'aaeaaaeaa', 'aaaaaaaaa', 'aaaaoaaaa', 'wwwwwwwww', 'baaaaaabb', 'bbaaaabbb'],
    tail: ['b.bb.bb..', '.bb.bb.b.'],
    pal: { a: 0xa0c8f8, b: 0x5a80b8, e: EYE, o: 0x1a2040, w: 0xf4f4ff },
  },
  king: {
    rows: ['.g.g.g.g.g.', '.ggggggggg.', '.gggrgrggg.', '.aaaaaaaaa.', 'aaeeaaaeeaa', 'aaaaaaaaaaa', 'aaaammmaaab', 'baaaaaaaabb', 'bbaaaaaabbb'],
    tail: ['b.bb.bb.bb.', '.bb.bb.bb.b'],
    pal: { a: 0x7888b8, b: 0x485888, e: 0xf0f0ff, g: 0xe8c04a, r: 0xc03a3a, m: 0x1a2040 },
  },
  echo: {
    rows: [
      '....hhhh....',
      '...hhhhhh...',
      '..hhHHHHhh..',
      '..hddddddh..',
      '..aaeaaeaa..',
      '.aaaaaaaaaa.',
      'saaaaaaaaaas',
      'saaaayyaaaas',
      '.aaaayyaaaab',
      'baaaaaaaaabb',
      'bbaaaaaaabbb',
    ],
    tail: ['b.bbb.bbb.b.', '.bb.bbb.bbb.'],
    pal: { a: 0xf8e080, b: 0xc8a040, e: 0xffffff, h: 0xe8c04a, H: 0xfff4c0, d: 0x7a5a20, y: 0xffffff, s: 0xd8d8e8 },
  },
};

const soulCache = new Map<string, GraphicsContext>();

/** A soul sprite as a shared context, centred on (0,0). Frame 0/1 = drift tail wiggle. */
export function soulArt(id: string, frame: number): GraphicsContext {
  const key = `${id}:${frame & 1}`;
  let c = soulCache.get(key);
  if (!c) {
    const s = SOULS[id] ?? SOULS.clerk;
    const rows = [...s.rows, s.tail[frame & 1]];
    const w = rows[0].length;
    const h = rows.length;
    c = new GraphicsContext();
    drawSprite(c as any, rows, s.pal, -Math.floor(w / 2), -Math.floor(h / 2));
    soulCache.set(key, c);
  }
  return c;
}

export function soulSize(id: string): { w: number; h: number } {
  const s = SOULS[id] ?? SOULS.clerk;
  return { w: s.rows[0].length, h: s.rows.length + 1 };
}

export function soulArtRaw(id: string): SoulArt {
  const s = SOULS[id] ?? SOULS.clerk;
  return { rows: [...s.rows, s.tail[0]], pal: s.pal };
}

// ---------- props ----------

export const OVERLORD = [
  '.k....k.',
  '.kpppkk.',
  '..pppp..',
  '..peep..',
  '..pppp..',
  '.ccppcc.',
  'cccppccc',
  'ccpppppc',
  'ccpppppc',
  'cccpppcc',
  'ccccpccc',
  '.cc..cc.',
];
export const OVERLORD_PAL = { k: 0xe8dcc0, p: 0x3a2a4a, e: 0xff5040, c: 0x7a1a3a };

export const IMP = ['k...k', '.rrr.', 'ryryr', '.rrr.', 'rrrrr', '.r.r.'];
export const IMP_PAL = { k: 0xe8dcc0, r: 0xc8503c, y: 0xf0d040 };

export const JAR = ['.www.', 'w...w', 'w...w', 'w...w', '.www.'];

export const BAIT_COLOR: Record<string, number> = { worm: 0xd08080, promise: 0x80a0f0, debt: 0x60d060, gilded: 0xe8c04a };
