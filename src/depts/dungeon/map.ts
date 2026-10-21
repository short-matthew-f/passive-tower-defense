// The Dungeon, Floor 1 (specs/01 §5.2, §14): an 11x13 tile grid with one winding main path and
// two pre-authored side loops (U-shaped pockets). Pure data, no Pixi, so the headless sim can
// load it. Routes are polylines of tile centres in tile units.

export const COLS = 11;
export const ROWS = 13;
export const TILE = 16; // logical px per tile

/**
 * '#' rock, 'w' wall (towers), 'c' chamber (summon lairs), '.' main path, 'E' entry, 'H' hoard,
 * 'a'/'b' loop A/B path, 'A'/'B' loop A/B bait-chest spot (the far end of the loop, on the path).
 */
export const MAP = [
  '##wcwEw####',
  'w.....www##',
  'w.wwwwwwww#',
  'w.bbbwaAaw#',
  'w.wwBwawaw#',
  'c.bbbwawaww',
  'w.wwwwawaww',
  'w.........w',
  '#wwwcwwww.w',
  '#wwwwwwww.c',
  '##wwwwwww.w',
  '#wH.......w',
  '##wwwwcwww#',
];

export type TileKind = 'rock' | 'wall' | 'chamber' | 'path' | 'entry' | 'hoard' | 'chest';

export const idx = (x: number, y: number) => y * COLS + x;
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const ch = (x: number, y: number) => (inBounds(x, y) ? MAP[y][x] : '#');

export function tileKind(x: number, y: number): TileKind {
  const c = ch(x, y);
  if (c === 'w') return 'wall';
  if (c === 'c') return 'chamber';
  if (c === '.' || c === 'a' || c === 'b') return 'path';
  if (c === 'E') return 'entry';
  if (c === 'H') return 'hoard';
  if (c === 'A' || c === 'B') return 'chest';
  return 'rock';
}

/** Path tiles that can carry a rune (not the entry, hoard or chest spots). */
export const isRuneTile = (x: number, y: number) => tileKind(x, y) === 'path';
export const isWalkable = (x: number, y: number) => {
  const k = tileKind(x, y);
  return k === 'path' || k === 'entry' || k === 'hoard' || k === 'chest';
};

const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function find(c: string): [number, number] {
  for (let y = 0; y < ROWS; y++) {
    const x = MAP[y].indexOf(c);
    if (x >= 0) return [x, y];
  }
  throw new Error(`map: no ${c}`);
}

/** Main path from E to H, traced through '.' tiles. */
function traceMain(): [number, number][] {
  const out: [number, number][] = [find('E')];
  const seen = new Set([idx(...out[0])]);
  for (;;) {
    const [x, y] = out[out.length - 1];
    if (ch(x, y) === 'H') return out;
    const next = N4.map(([dx, dy]) => [x + dx, y + dy] as [number, number]).find(
      ([nx, ny]) => (ch(nx, ny) === '.' || ch(nx, ny) === 'H') && !seen.has(idx(nx, ny)),
    );
    if (!next) throw new Error('map: main path broken');
    seen.add(idx(...next));
    out.push(next);
  }
}

export interface Loop {
  name: string;
  /** Index in MAIN of the tile where the loop leaves and where it rejoins. */
  from: number;
  to: number;
  tiles: [number, number][];
  chest: [number, number];
}

function traceLoop(main: [number, number][], lc: string, chestC: string): Loop {
  const mainIdx = new Map(main.map(([x, y], i) => [idx(x, y), i]));
  const isLoop = (x: number, y: number) => ch(x, y) === lc || ch(x, y) === chestC;
  // Start: the loop tile next to the earliest main tile.
  let best: { from: number; start: [number, number] } | null = null;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      if (!isLoop(x, y)) continue;
      for (const [dx, dy] of N4) {
        const mi = mainIdx.get(idx(x + dx, y + dy));
        if (mi !== undefined && inBounds(x + dx, y + dy) && (!best || mi < best.from)) best = { from: mi, start: [x, y] };
      }
    }
  if (!best) throw new Error(`map: loop ${lc} detached`);
  const tiles: [number, number][] = [best.start];
  const seen = new Set([idx(...best.start)]);
  for (;;) {
    const [x, y] = tiles[tiles.length - 1];
    const next = N4.map(([dx, dy]) => [x + dx, y + dy] as [number, number]).find(([nx, ny]) => isLoop(nx, ny) && !seen.has(idx(nx, ny)));
    if (!next) break;
    seen.add(idx(...next));
    tiles.push(next);
  }
  const [lx, ly] = tiles[tiles.length - 1];
  let to = -1;
  for (const [dx, dy] of N4) {
    const mi = mainIdx.get(idx(lx + dx, ly + dy));
    if (mi !== undefined && mi > best.from) to = mi;
  }
  if (to < 0) throw new Error(`map: loop ${lc} does not rejoin`);
  return { name: lc.toUpperCase(), from: best.from, to, tiles, chest: find(chestC) };
}

export const MAIN = traceMain();
/** Loop 0 = A (east pocket off the middle run), loop 1 = B (west pocket off the first descent). */
export const LOOPS: Loop[] = [traceLoop(MAIN, 'a', 'A'), traceLoop(MAIN, 'b', 'B')];
export const ENTRY = MAIN[0];
export const HOARD = MAIN[MAIN.length - 1];

export interface Route {
  n: number;
  xs: Float64Array;
  ys: Float64Array;
  cum: Float64Array;
  len: number;
  /** Route distance of each baited chest (for "visitors loot the chest"). */
  chestAt: number[];
}

function buildRoute(mask: number): Route {
  const pts: [number, number][] = [];
  const chestTiles: [number, number][] = [];
  // Splice baited loops into the main path, in path order.
  const loops = LOOPS.map((l, i) => ({ l, on: (mask >> i) & 1 })).filter((o) => o.on).sort((a, b) => a.l.from - b.l.from);
  let i = 0;
  for (const { l } of loops) {
    while (i <= l.from) pts.push(MAIN[i++]);
    pts.push(...l.tiles);
    chestTiles.push(l.chest);
    i = l.to;
  }
  while (i < MAIN.length) pts.push(MAIN[i++]);
  const n = pts.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const cum = new Float64Array(n);
  pts.forEach(([x, y], k) => {
    xs[k] = x + 0.5;
    ys[k] = y + 0.5;
    if (k > 0) cum[k] = cum[k - 1] + Math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]);
  });
  const chestAt = chestTiles.map(([cx, cy]) => cum[pts.findIndex(([x, y]) => x === cx && y === cy)]);
  return { n, xs, ys, cum, len: cum[n - 1], chestAt };
}

/** ROUTES[mask]: bit i set = loop i baited. */
export const ROUTES: Route[] = [0, 1, 2, 3].map(buildRoute);

/** The path tile a lair on chamber (x, y) posts its minions on (prefers the main path). */
export function lairPost(x: number, y: number): [number, number] | null {
  let alt: [number, number] | null = null;
  for (const [dx, dy] of N4) {
    const c = ch(x + dx, y + dy);
    if (!inBounds(x + dx, y + dy)) continue;
    if (c === '.') return [x + dx, y + dy];
    if (c === 'a' || c === 'b') alt = [x + dx, y + dy];
  }
  return alt;
}

/** Free Arrow Slits in every starter kit (01 §4): beside the first bend and the middle run. */
export const STARTER_SLITS: [number, number][] = [[2, 2], [8, 8]];
/** The build tile onboarding points at ("one more slit, My Liege"). */
export const SUGGESTED_TILE: [number, number] = [2, 6];
