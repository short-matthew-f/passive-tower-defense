// Goblin Mines pixel art: rock tiles per stratum, cracks, goblins, the gauntlet, the drum.
// Everything is built once into shared GraphicsContexts and swapped onto Graphics, so a
// tile changing state never re-tessellates.
import { GraphicsContext } from 'pixi.js';

export const OUTLINE = 0x140c1c;
export const GOLD = 0xe8c04a;
export const GOLD_LIGHT = 0xfff0a0;
export const GOLD_DARK = 0xa07a20;

export interface Stratum {
  name: string;
  base: number;
  light: number;
  dark: number;
  speck: number;
  bg: number;
  bgDark: number;
  /** CSS colour for chip particles / text. */
  chip: number;
}

export const STRATA_PAL: Stratum[] = [
  { name: 'DIRT', base: 0x8a5a3a, light: 0xb07a52, dark: 0x5a3822, speck: 0x6a4428, bg: 0x2e1c14, bgDark: 0x1e120c, chip: 0xa06a44 },
  { name: 'STONE', base: 0x7c7c86, light: 0xa8a8b2, dark: 0x4a4a56, speck: 0x5e5e6a, bg: 0x22222a, bgDark: 0x16161c, chip: 0x9a9aa4 },
  { name: 'IRON', base: 0x7a5a52, light: 0xa27a6a, dark: 0x4a322c, speck: 0xc0603a, bg: 0x261a16, bgDark: 0x160e0c, chip: 0xb06a4a },
  { name: 'CRYSTAL', base: 0x5a6aa6, light: 0x8ca2dc, dark: 0x343e6c, speck: 0xc8e8ff, bg: 0x161a30, bgDark: 0x0c0e1e, chip: 0x9ab8f0 },
  { name: 'MAGMA', base: 0x52302c, light: 0x7a463a, dark: 0x2a1414, speck: 0xff7a2a, bg: 0x220c0a, bgDark: 0x140404, chip: 0xff8a3a },
  { name: 'ABYSS', base: 0x3e2c52, light: 0x604878, dark: 0x1e142a, speck: 0x4ae0c0, bg: 0x120a1a, bgDark: 0x08040e, chip: 0x6ae8d0 },
];

/** Deterministic little RNG for art. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

/** Row extents [x0, x1) of a rounded rock blob of size s; variant chips a corner. */
export function profile(s: number, v: number): [number, number][] {
  const r = Math.max(3, Math.floor(s * 0.22));
  const out: [number, number][] = [];
  for (let y = 0; y < s; y++) {
    const dy = y < r ? r - y : y >= s - r ? y - (s - r - 1) : 0;
    const inset = dy > 0 ? r - Math.round(Math.sqrt(Math.max(0, r * r - dy * dy))) : 0;
    let l = inset;
    let rr = inset;
    if (v === 1 && y < s * 0.4) rr += Math.max(0, 4 - Math.floor(y / 2));
    if (v === 2 && y > s * 0.6) l += Math.max(0, Math.floor((y - s * 0.6) / 2));
    if (v === 0 && y > s * 0.3 && y < s * 0.45) rr += 1;
    out.push([l, s - rr]);
  }
  return out;
}

function blob(c: GraphicsContext, s: number, v: number, base: number, light: number, dark: number, ox = 0, oy = 0): void {
  const p = profile(s, v);
  for (let y = 0; y < s; y++) {
    const [a, b] = p[y];
    if (b > a) c.rect(ox + a, oy + y, b - a, 1).fill(OUTLINE);
  }
  for (let y = 1; y < s - 1; y++) {
    const a = Math.max(p[y][0], p[y - 1][0], p[y + 1][0]) + 1;
    const b = Math.min(p[y][1], p[y - 1][1], p[y + 1][1]) - 1;
    if (b <= a) continue;
    c.rect(ox + a, oy + y, b - a, 1).fill(base);
    if (y <= 2) c.rect(ox + a, oy + y, b - a, 1).fill(light);
    else if (y >= s - 3) c.rect(ox + a, oy + y, b - a, 1).fill(dark);
    else {
      if (y < s * 0.65) c.rect(ox + a, oy + y, 1, 1).fill(light);
      if (y > s * 0.35) c.rect(ox + b - 1, oy + y, 1, 1).fill(dark);
    }
  }
}

function inside(p: [number, number][], x: number, y: number, m = 3): boolean {
  if (y < m || y >= p.length - m) return false;
  return x >= p[y][0] + m && x < p[y][1] - m;
}

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

export type ArtKind = 'common' | 'vein' | 'geode' | 'keg' | 'rubble' | 'sprout';

export function rockArt(kind: ArtKind, stratum: number, v: number, s: number): GraphicsContext {
  return cached(`rock.${kind}.${stratum}.${v}.${s}`, (c) => {
    const pal = STRATA_PAL[stratum];
    const r = rng(stratum * 97 + v * 13 + s);
    if (kind === 'keg') return drawKeg(c, s);
    if (kind === 'rubble') {
      const pieces = [
        [2, s - 8, 8],
        [9, s - 7, 7],
        [15, s - 9, 9],
        [s - 9, s - 7, 6],
      ];
      for (const [x, y, w] of pieces) blob(c, w, (x + y) % 3, pal.dark, pal.base, OUTLINE, x, y);
      return;
    }
    if (kind === 'sprout') {
      const ss = Math.floor(s * 0.45);
      blob(c, ss, v, pal.base, pal.light, pal.dark, Math.floor((s - ss) / 2), s - ss - 1);
      return;
    }
    const p = profile(s, v);
    const geode = kind === 'geode';
    blob(c, s, v, geode ? pal.dark : pal.base, geode ? pal.base : pal.light, geode ? OUTLINE : pal.dark);
    // Specks and strata streaks.
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(r() * s);
      const y = Math.floor(r() * s);
      if (inside(p, x, y) && inside(p, x + 1, y)) c.rect(x, y, 2, 1).fill(pal.speck);
    }
    const sy = Math.floor(s * (0.4 + r() * 0.25));
    if (inside(p, 4, sy, 2)) c.rect(p[sy][0] + 3, sy, Math.floor((p[sy][1] - p[sy][0]) * 0.5), 1).fill(pal.dark);
    if (kind === 'vein') {
      for (let i = 0, n = 0; i < 30 && n < 5; i++) {
        const x = Math.floor(r() * s);
        const y = Math.floor(r() * s);
        if (!inside(p, x, y, 4) || !inside(p, x + 3, y + 2, 4)) continue;
        c.rect(x, y, 3, 2).fill(GOLD);
        c.rect(x + 1, y + 2, 2, 1).fill(GOLD_DARK);
        c.rect(x, y, 1, 1).fill(GOLD_LIGHT);
        n++;
      }
    }
    if (geode) {
      const cx = Math.floor(s / 2);
      const cy = Math.floor(s / 2);
      c.rect(cx - 4, cy - 3, 8, 7).fill(0x2a1438);
      c.rect(cx - 3, cy - 2, 2, 4).fill(0xb070e0);
      c.rect(cx, cy - 3, 2, 5).fill(0xd090ff);
      c.rect(cx + 2, cy - 1, 1, 3).fill(0xb070e0);
      c.rect(cx, cy - 3, 1, 1).fill(0xffffff);
    }
  });
}

function drawKeg(c: GraphicsContext, s: number): void {
  const w = Math.floor(s * 0.62);
  const h = Math.floor(s * 0.72);
  const x = Math.floor((s - w) / 2);
  const y = s - h - 1;
  c.rect(x + 1, y, w - 2, h).fill(OUTLINE);
  c.rect(x, y + 1, w, h - 2).fill(OUTLINE);
  c.rect(x + 1, y + 1, w - 2, h - 2).fill(0xa8322a);
  c.rect(x + 1, y + 1, 2, h - 2).fill(0xd04a3a);
  c.rect(x + w - 3, y + 1, 2, h - 2).fill(0x701e1a);
  // Iron bands.
  c.rect(x, y + 3, w, 2).fill(0x3a3440);
  c.rect(x, y + h - 5, w, 2).fill(0x3a3440);
  // Skull.
  const cx = Math.floor(s / 2) - 2;
  const cy = y + Math.floor(h / 2) - 2;
  c.rect(cx, cy, 5, 3).fill(0xf4e8c1);
  c.rect(cx + 1, cy + 3, 3, 1).fill(0xf4e8c1);
  c.rect(cx + 1, cy + 1, 1, 1).fill(OUTLINE);
  c.rect(cx + 3, cy + 1, 1, 1).fill(OUTLINE);
  // Fuse.
  c.rect(Math.floor(s / 2), y - 4, 1, 4).fill(0x3a2a20);
  c.rect(Math.floor(s / 2) + 1, y - 5, 1, 2).fill(0x3a2a20);
}

export function crackArt(stage: number, v: number, s: number): GraphicsContext {
  return cached(`crack.${stage}.${v}.${s}`, (c) => {
    const r = rng(v * 31 + stage * 7 + s);
    const p = profile(s, v);
    const n = stage === 1 ? 2 : 5;
    const len = stage === 1 ? s * 0.28 : s * 0.42;
    const cx = Math.floor(s / 2 + (r() - 0.5) * 6);
    const cy = Math.floor(s / 2 + (r() - 0.5) * 6);
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + r() * 1.2;
      let x = cx;
      let y = cy;
      for (let k = 0; k < len; k++) {
        a += (r() - 0.5) * 0.8;
        x += Math.cos(a);
        y += Math.sin(a);
        const px = Math.round(x);
        const py = Math.round(y);
        if (!inside(p, px, py, 2)) break;
        c.rect(px, py, 1, 1).fill(OUTLINE);
        if (stage === 2 && k % 4 === 2) c.rect(px + 1, py, 1, 1).fill(OUTLINE);
      }
    }
    if (stage === 2) c.rect(cx - 1, cy - 1, 3, 3).fill(OUTLINE);
  });
}

export function flashArt(v: number, s: number): GraphicsContext {
  return cached(`flash.${v}.${s}`, (c) => {
    const p = profile(s, v);
    for (let y = 0; y < s; y++) if (p[y][1] > p[y][0]) c.rect(p[y][0], y, p[y][1] - p[y][0], 1).fill(0xffffff);
  });
}

// ---------- goblins ----------

const GOB_PAL: Record<string, number> = {
  k: 0x1a1020,
  g: 0x7ab84a,
  G: 0x4a7a2e,
  y: 0xf4e04a,
  w: 0xf4f0e0,
  t: 0x8a4a2a,
  T: 0x5a2e1a,
  b: 0x3a2a20,
  s: 0x2a2a30,
  r: 0xc03a3a,
};

const GOB_BODY = [
  '...kkkk...',
  '..kggggk..',
  'gkggggykk.',
  '.kgggggggk',
  '..kgwgwk..',
  '..ktttk...',
  '.kttTttgk.',
  '.kttTttk..',
  '..ktttk...',
  '..kb.kb...',
  '..bb..bb..',
];

function sprite(c: GraphicsContext, rows: string[], pal: Record<string, number>, ox = 0, oy = 0): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (col !== undefined) c.rect(ox + x, oy + y, 1, 1).fill(col);
    }
  });
}

/** Goblin frames: 0 = pick raised, 1 = pick down (strike), 2 = hop. Origin is the feet centre. */
export function goblinArt(frame: number, sapper: boolean): GraphicsContext {
  return cached(`gob.${frame}.${sapper}`, (c) => {
    const ox = -5;
    const oy = -11;
    if (sapper) {
      c.rect(ox - 2, oy + 4, 4, 4).fill(0x1a1020);
      c.rect(ox - 1, oy + 5, 2, 2).fill(0x4a4a54);
      c.rect(ox - 1, oy + 2, 1, 2).fill(0xe8c04a);
    }
    sprite(c, frame === 2 ? GOB_BODY.slice(0, 9).concat(['..kb..kb..', '..b....b..']) : GOB_BODY, GOB_PAL, ox, oy);
    if (sapper) c.rect(ox + 2, oy, 6, 1).fill(0xc03a3a);
    const handle = 0xa07040;
    const head = 0xb0b0b8;
    const headD = 0x6a6a74;
    if (frame === 0) {
      // raised behind the head
      c.rect(ox + 7, oy + 5, 1, 2).fill(handle);
      c.rect(ox + 8, oy + 3, 1, 2).fill(handle);
      c.rect(ox + 9, oy + 1, 1, 2).fill(handle);
      c.rect(ox + 7, oy - 1, 5, 2).fill(head);
      c.rect(ox + 7, oy + 0, 1, 1).fill(headD);
      c.rect(ox + 11, oy + 0, 1, 2).fill(headD);
    } else if (frame === 1) {
      c.rect(ox + 8, oy + 6, 2, 1).fill(handle);
      c.rect(ox + 10, oy + 7, 2, 1).fill(handle);
      c.rect(ox + 12, oy + 5, 2, 6).fill(head);
      c.rect(ox + 12, oy + 10, 2, 1).fill(headD);
    } else {
      c.rect(ox + 8, oy + 4, 1, 3).fill(handle);
      c.rect(ox + 7, oy + 3, 3, 1).fill(head);
    }
  });
}

/** Drummer goblin with two mallets; frame 0 up, 1 down. */
export function drummerArt(frame: number): GraphicsContext {
  return cached(`drummer.${frame}`, (c) => {
    sprite(c, GOB_BODY, GOB_PAL, -5, -11);
    const m = 0xa07040;
    if (frame === 0) {
      c.rect(-6, -10, 1, 4).fill(m);
      c.rect(5, -10, 1, 4).fill(m);
      c.rect(-7, -12, 3, 2).fill(0xf4e8c1);
      c.rect(4, -12, 3, 2).fill(0xf4e8c1);
    } else {
      c.rect(-7, -5, 3, 1).fill(m);
      c.rect(4, -5, 3, 1).fill(m);
      c.rect(-9, -6, 2, 2).fill(0xf4e8c1);
      c.rect(7, -6, 2, 2).fill(0xf4e8c1);
    }
  });
}

// ---------- gauntlet ----------

const FIST = [
  '.kkkkkkk..',
  'kHhHhHhHk.',
  'kHhHhHhHkk',
  'kHHHHHHHhk',
  'kHHHHHHHhk',
  'krrrrrrrk.',
  '.kRRRRRk..',
];

export function gauntletArt(heavy: boolean): GraphicsContext {
  return cached(`fist.${heavy}`, (c) => {
    const pal = { k: 0x1a1020, H: heavy ? 0xe8c04a : 0xa8aebc, h: heavy ? 0xa07a20 : 0x5e6474, r: 0x8a2a2a, R: 0x5a1a1a };
    sprite(c, FIST, pal, -5, -3);
  });
}

// ---------- the Doom Drum ----------

/** The drum on the top ledge. owned=false draws the covered silhouette. Origin: bottom centre. */
export function drumArt(owned: boolean, pulse: boolean, skin: number): GraphicsContext {
  return cached(`drum.${owned}.${pulse}.${skin}`, (c) => {
    const w = 24;
    const h = 16;
    const x = -w / 2;
    const y = -h;
    if (!owned) {
      // tarp
      c.rect(x + 2, y - 1, w - 4, 1).fill(OUTLINE);
      c.rect(x, y, w, h).fill(OUTLINE);
      c.rect(x + 1, y + 1, w - 2, h - 2).fill(0x5a5048);
      c.rect(x + 1, y + 1, w - 2, 2).fill(0x7a7064);
      for (let i = 0; i < 4; i++) c.rect(x + 3 + i * 6, y + 3, 1, h - 5).fill(0x463e38);
      c.rect(x + 3, y + h - 4, w - 6, 1).fill(0x8a6a40); // rope
      return;
    }
    const body = skin >= 2 ? 0x4a1a5a : skin >= 1 ? 0x2a2a3a : 0x8a2a2a;
    const bodyL = skin >= 2 ? 0x7a3a8a : skin >= 1 ? 0x4a4a5e : 0xb03a32;
    const rim = skin >= 1 ? GOLD : 0xc8a050;
    c.rect(x, y + 3, w, h - 3).fill(OUTLINE);
    c.rect(x + 1, y + 4, w - 2, h - 5).fill(body);
    c.rect(x + 1, y + 4, 3, h - 5).fill(bodyL);
    // lacing
    for (let i = 0; i < 5; i++) {
      c.rect(x + 3 + i * 4, y + 6, 1, 1).fill(rim);
      c.rect(x + 5 + i * 4, y + h - 4, 1, 1).fill(rim);
      c.rect(x + 4 + i * 4, y + 7, 1, h - 11).fill(0xd8c8a0);
    }
    c.rect(x, y + h - 2, w, 1).fill(rim);
    // drumhead (top ellipse), brighter on the beat
    const head = pulse ? 0xfff8e0 : 0xe8d8b0;
    c.rect(x + 2, y, w - 4, 1).fill(OUTLINE);
    c.rect(x + 1, y + 1, w - 2, 3).fill(OUTLINE);
    c.rect(x + 2, y + 1, w - 4, 2).fill(head);
    c.rect(x + 1, y + 3, w - 2, 1).fill(rim);
    // skull emblem
    c.rect(-2, y + 8, 5, 3).fill(0xf4e8c1);
    c.rect(-1, y + 11, 3, 1).fill(0xf4e8c1);
    c.rect(-1, y + 9, 1, 1).fill(OUTLINE);
    c.rect(1, y + 9, 1, 1).fill(OUTLINE);
  });
}

/** A wall torch; frame alternates the flame; big for Frenzy. Origin: bracket bottom. */
export function torchArt(frame: number, big: boolean): GraphicsContext {
  return cached(`torch.${frame}.${big}`, (c) => {
    c.rect(-1, -6, 3, 6).fill(0x5a3a22);
    c.rect(-2, -7, 5, 2).fill(0x3a3440);
    const f = big ? 2 : 0;
    const o = frame ? 1 : 0;
    c.rect(-1 - (big ? 1 : 0), -11 - f, 3 + (big ? 2 : 0), 4 + f).fill(0xe0601a);
    c.rect(0 - o, -13 - f * 2, 2, 3 + f).fill(0xf0a030);
    c.rect(0, -10 - f, 1, 2).fill(0xfff0a0);
  });
}

// ---------- Gritch ----------

export const GRITCH_PALETTE: Record<string, string> = {
  B: '#3a2a22',
  k: '#1a1020',
  g: '#7ab84a',
  G: '#4a7a2e',
  y: '#f4e04a',
  w: '#f4f0e0',
  h: '#d8a83a',
  H: '#8a6420',
  c: '#ff9a30',
  C: '#fff0a0',
  r: '#6a1a1a',
  t: '#8a4a2a',
};

export const GRITCH_IDLE = [
  'BBBBBCBBBBBB',
  'BBBBBcBBBBBB',
  'BBBBhhhhBBBB',
  'BBBhhhhHhBBB',
  'gBHHHHHHHHBg',
  'ggGggggggGgg',
  'BgGykggykGgB',
  'BBggggGgggBB',
  'BBgkwkkkwkBB',
  'BBBgggggggBB',
  'BBBBttttBBBB',
  'BBBttttttBBB',
];

export const GRITCH_TALK = [
  'BBBBBCBBBBBB',
  'BBBBBcBBBBBB',
  'BBBBhhhhBBBB',
  'BBBhhhhHhBBB',
  'gBHHHHHHHHBg',
  'ggGggggggGgg',
  'BgGykggykGgB',
  'BBggggGgggBB',
  'BBgwrrrrwgBB',
  'BBBgrrrrgBBB',
  'BBBBggggBBBB',
  'BBBttttttBBB',
];
