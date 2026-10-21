// Spire pixel art: one small canvas texture per orb tier (palette AND silhouette per 04 §13),
// the Head Sorcerer's portrait and the lab palette. Orb textures are built once per page and
// cached for its lifetime (12 tiny textures), never per frame.
import { CanvasSource, Texture } from 'pixi.js';
import { TIERS } from './def';

export const PAL = {
  bg: 0x120a1e,
  brick: 0x1c1230,
  brickHi: 0x241a3a,
  glass: 0x9ad8e8,
  glassLo: 0x4a7a8a,
  glassIn: 0x0e1a26,
  brass: 0xc8963a,
  brassHi: 0xf0c870,
  brassLo: 0x6a4a1a,
  fire: 0xf08a30,
  fireHi: 0xfff2a0,
  fireLo: 0xc03a1a,
  coal: 0x2a1a1a,
  steam: 0xa8f0b0,
  brim: 0x8fd14f,
  warn: 0xe05050,
  rune: 0xc070ff,
  ink: 0x0a0410,
  white: 0xffffff,
};

/** Tier display colors [base, light, dark] (index = tier). */
export const ORB_COL: [string, string, string][] = [
  ['#000', '#000', '#000'],
  ['#f8e060', '#fffbe0', '#b08a20'], // 1 Spark
  ['#f08a30', '#ffc880', '#9a3a10'], // 2 Ember
  ['#6ad8e8', '#d0f8ff', '#2a7a98'], // 3 Wisp
  ['#7ad04a', '#c8f08a', '#2e6a1a'], // 4 Glimmer
  ['#a05ae0', '#d8b0ff', '#4e2280'], // 5 Hexball
  ['#d03a3a', '#ff9a8a', '#701418'], // 6 Bloodmoon
  ['#3ad8a0', '#b8ffe0', '#127050'], // 7 Soulfire
  ['#4a6ae8', '#a8c4ff', '#1e2a80'], // 8 Stormheart
  ['#2a1838', '#f0c040', '#0a0410'], // 9 Eclipse
  ['#e8dce4', '#ffffff', '#8a6a80'], // 10 Abyssal Eye
  ['#08040c', '#ffffff', '#3a1a5a'], // 11 Void Star
];
export const orbColor = (t: number) => parseInt(ORB_COL[Math.max(1, Math.min(11, t))][0].slice(1), 16);
export const orbLight = (t: number) => parseInt(ORB_COL[Math.max(1, Math.min(11, t))][1].slice(1), 16);

type Px = (x: number, y: number, c: string) => void;

function drawOrb(px: Px, tier: number, closed: boolean): void {
  const r = TIERS[tier].r;
  const D = r * 2;
  const [base, light, dark] = ORB_COL[tier];
  const ink = '#0a0410';
  const inside = (x: number, y: number): boolean => {
    const dx = x + 0.5 - r;
    const dy = y + 0.5 - r;
    if (tier === 1) {
      // 4-point star (astroid).
      return Math.abs(dx) ** 0.8 + Math.abs(dy) ** 0.8 <= r ** 0.8 * 1.12;
    }
    if (tier === 5) {
      // Flat-topped hexagon.
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      return ay <= r * 0.9 && ax * 0.866 + ay * 0.5 <= r * 0.9;
    }
    return dx * dx + dy * dy <= r * r;
  };
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      const d = Math.hypot(dx, dy);
      let c = base;
      if (dx + dy < -r * 0.55) c = light;
      else if (dx + dy > r * 0.65) c = dark;
      if (tier === 9) {
        // Eclipse: a dark core inside a blazing corona ring.
        c = d > r * 0.7 ? (d > r * 0.86 ? '#f0c040' : '#fff2a0') : dx + dy < -r * 0.6 ? '#3a2850' : base;
      } else if (tier === 11) {
        // Void Star: black with a white rim and a faint violet glow.
        c = d > r - 2.2 ? '#ffffff' : d > r - 4 ? '#3a1a5a' : base;
      }
      px(x, y, edge && tier !== 11 ? ink : c);
    }
  }
  const cx = r;
  const cy = r;
  const dot = (x: number, y: number, c: string, s = 1) => {
    for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) px(Math.floor(x) + i, Math.floor(y) + j, c);
  };
  // Highlight glint.
  if (tier !== 9 && tier !== 11 && tier !== 1) dot(cx - r * 0.5, cy - r * 0.55, '#ffffff', r >= 12 ? 2 : 1);

  // Silhouette details.
  if (tier === 1) {
    dot(cx - 1, cy - 1, '#ffffff', 2);
    dot(cx - 1, cy - 2, light);
  } else if (tier === 4) {
    dot(cx + r * 0.45, cy - r * 0.5, '#ffffff');
    dot(cx - r * 0.6, cy + r * 0.3, light);
  } else if (tier === 5) {
    // A rune: a tiny inner hexagon outline.
    for (const [ox, oy] of [[-2, -3], [-1, -3], [0, -3], [1, -3], [-3, -1], [2, -1], [-3, 0], [2, 0], [-2, 2], [-1, 2], [0, 2], [1, 2]]) dot(cx + ox, cy + oy + 1, light);
  } else if (tier === 6) {
    // Craters.
    dot(cx + r * 0.3, cy + r * 0.25, dark, 2);
    dot(cx - r * 0.55, cy + r * 0.05, dark, 2);
    dot(cx + r * 0.05, cy - r * 0.55, dark);
  } else if (tier === 7) {
    // A pale flame rising inside.
    for (let i = 0; i < Math.floor(r * 0.9); i++) {
      const w = Math.max(1, Math.round((i / (r * 0.9)) * r * 0.5));
      for (let k = -w; k <= w; k++) px(Math.floor(cx + k), Math.floor(cy + r * 0.55 - i), i > r * 0.6 ? light : '#7af0c8');
    }
  } else if (tier === 8) {
    // Lightning bolt.
    const bolt = [[1, -8], [0, -7], [0, -6], [-1, -5], [-1, -4], [-2, -3], [-2, -2], [-1, -2], [0, -2], [1, -2], [1, -1], [0, 0], [0, 1], [-1, 2], [-1, 3], [-2, 4], [-2, 5]];
    for (const [bx, by] of bolt) dot(cx + bx * 1.4 + 2, cy + by * 1.4 + 2, '#fff070', 2);
  } else if (tier === 10) {
    if (closed) {
      // Lid shut: dark violet lid with a lash line.
      for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
        const dx = x + 0.5 - r;
        const dy = y + 0.5 - r;
        const d = Math.hypot(dx, dy);
        if (d < r - 1) px(x, y, Math.abs(dy - 1) < 1 ? ink : dy < 1 ? '#5a2a7a' : '#4a1e66');
      }
    } else {
      // Iris, pupil, veins.
      for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
        const dx = x + 0.5 - r;
        const dy = y + 0.5 - r;
        const d = Math.hypot(dx, dy);
        if (d < r * 0.2) px(x, y, ink);
        else if (d < r * 0.45) px(x, y, d < r * 0.3 ? '#c070ff' : '#7a2ab0');
      }
      dot(cx - r * 0.12, cy - r * 0.15, '#ffffff', 2);
      for (const a of [0.3, 1.9, 3.6, 5.0]) {
        for (let k = 0; k < 4; k++) {
          const rr = r * (0.62 + k * 0.08);
          dot(cx + Math.cos(a + k * 0.12) * rr, cy + Math.sin(a + k * 0.12) * rr, '#d04050');
        }
      }
    }
  } else if (tier === 11) {
    for (const [sx, sy] of [[-0.3, -0.2], [0.25, -0.4], [0.1, 0.3], [-0.4, 0.35], [0.45, 0.1]]) dot(cx + sx * r, cy + sy * r, '#ffffff');
    dot(cx - 1, cy - 1, '#c070ff', 2);
  }

  // Faces on the friendly middle tiers (2-8): two eyes and, when there's room, a mouth.
  if (tier >= 2 && tier <= 8) {
    const s = r >= 12 ? 2 : 1;
    const e = Math.max(1.5, r * 0.32);
    const ey = cy - (tier === 8 ? r * 0.05 : 0);
    const ex1 = cx - e - (s - 1) * 0.5;
    const ex2 = cx + e - (s - 1) * 0.5 - (r < 6 ? 1 : 0);
    const eyeC = tier === 8 ? '#0a0410' : ink;
    dot(ex1, ey - s / 2, eyeC, s);
    dot(ex2, ey - s / 2, eyeC, s);
    if (r >= 8) {
      const my = cy + r * 0.35;
      const mw = Math.max(1, Math.round(r * 0.2));
      for (let k = -mw; k < mw; k++) px(Math.floor(cx + k), Math.floor(my), ink);
      if (tier === 6 || tier === 7) px(Math.floor(cx), Math.floor(my) + 1, ink); // a toothy grin
    }
  }
}

const cache = new Map<string, Texture>();

function makeTexture(tier: number, closed: boolean): Texture {
  const r = TIERS[tier].r;
  const D = r * 2;
  const canvas = document.createElement('canvas');
  canvas.width = D;
  canvas.height = D;
  const g = canvas.getContext('2d')!;
  drawOrb((x, y, c) => {
    if (x < 0 || y < 0 || x >= D || y >= D) return;
    g.fillStyle = c;
    g.fillRect(x, y, 1, 1);
  }, tier, closed);
  return new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'nearest' }) });
}

/** The orb texture for a tier (and the Abyssal Eye's blink frame). Built once, cached. */
export function orbTexture(tier: number, closed = false): Texture {
  const t = Math.max(1, Math.min(11, tier));
  const key = `${t}${closed && t === 10 ? 'c' : ''}`;
  let tex = cache.get(key);
  if (!tex || tex.destroyed) {
    tex = makeTexture(t, closed && t === 10);
    cache.set(key, tex);
  }
  return tex;
}

// ---------- the Head Sorcerer (a nervous, singed lich), 12x12, two frames ----------

const SORC_IDLE = [
  '...pppppp...',
  '..pPPPPPPp..',
  '.pPswwwwsPp.',
  '.pPwwwwwwPp.',
  '.pwkkwwkkwp.',
  '.pwkewwekwp.',
  '.pPwwkkwwPp.',
  '.pPgwwwwgPp.',
  '..pPwkwkPp..',
  '.ppPgwwgPpp.',
  'pPPPhPPhPPPp',
  'pPPhhwwhhPPp',
];
const SORC_TALK = [
  '...pppppp...',
  '..pPPPPPPp..',
  '.pPswwwwsPp.',
  '.pPwwwwwwPp.',
  '.pwkkwwkkwp.',
  '.pwkewwekwp.',
  '.pPwwkkwwPp.',
  '.pPgwkkwgPp.',
  '..pPkrrkPp..',
  '.ppPgkkgPpp.',
  'pPPPhPPhPPPp',
  'pPPhhwwhhPPp',
];
export const SORC_PORTRAIT: [string[], string[]] = [SORC_IDLE, SORC_TALK];
export const SORC_PAL: Record<string, string> = {
  p: '#2a1640',
  P: '#5a2e86',
  w: '#e8e0c8',
  g: '#a8a090',
  k: '#140818',
  e: '#8fff6a',
  s: '#4a3a3a',
  h: '#d8d0b8',
  r: '#7a2030',
};

/** The in-scene sprite (left gutter) mirrors his mood (04 §18 expressions). */
const SORC_SCARED = SORC_IDLE.map((row, y) => (y === 4 ? '.pwkeweekwp.'.replace('week', 'wwek') : y === 8 ? '..pPkkkkPp..' : row));
const SORC_SINGED = SORC_IDLE.map((row, y) => (y === 2 ? '.pPsswwssPp.' : y === 3 ? '.pPswwwwsPp.' : y === 5 ? '.pwkswwskwp.' : row));
export function SORC_IDLE_FRAME(mood: 'calm' | 'scared' | 'singed' | 'happy'): string[] {
  if (mood === 'scared') return SORC_SCARED;
  if (mood === 'singed') return SORC_SINGED;
  if (mood === 'happy') return SORC_TALK;
  return SORC_IDLE;
}
