// The Dungeon's floors (specs/01 §5.2, §6D, §14): 11x13 tile grids with one winding main path and
// pre-authored side loops. Pure data, no Pixi, so the headless sim can load it.
//
// Routing (Dungeon Keeper mode, 01 §14 "later"): a party walks from the entry to each baited chest
// in turn (greedy: the nearest unvisited chest, all purses being equal) and then to the Hoard, by
// BFS over the walkable tiles. On the authored floors that reproduces the polyline loops exactly
// (every corridor is one tile wide); once the player carves path tiles (Dig), heroes take the
// shortest way, so a carved dead-end pocket with a Bait Chest is a custom detour, and a carved
// shortcut is a shortcut. Routes are cached per (grid, bait set), like the idle sim.

export const COLS = 11;
export const ROWS = 13;
export const TILE = 16; // logical px per tile

export type TileKind = 'rock' | 'wall' | 'chamber' | 'path' | 'entry' | 'hoard' | 'chest';
const KINDS: TileKind[] = ['rock', 'wall', 'chamber', 'path', 'entry', 'hoard', 'chest'];
export const K_ROCK = 0;
export const K_WALL = 1;
export const K_CHAMBER = 2;
export const K_PATH = 3;
export const K_ENTRY = 4;
export const K_HOARD = 5;
export const K_CHEST = 6;

export interface FloorDef {
  name: string;
  short: string;
  /** Plunder to open it (kept across Falls). */
  cost: number;
  /** Base bounty multiplier (01 §6D: +20% per floor). */
  bounty: number;
  /**
   * '#' rock, 'w' wall (towers), 'c' chamber (summon lairs), '.' main path, '~' water path (Rogues
   * run 1.3x), 'E' entry, 'H' hoard, lowercase letters loop path, uppercase letters a Bait Chest
   * spot (the far end of a loop, on the path).
   */
  map: string[];
  /** Free Arrow Slits in every starter kit (01 §4); only floor 0 has them. */
  starter: [number, number][];
  /** The build tile onboarding points at ("one more slit, My Liege"). */
  suggested: [number, number];
  /** Head Start free slits (00 §2.5), in order. */
  headStart: [number, number][];
}

export const FLOORS: FloorDef[] = [
  {
    name: 'The Cellar',
    short: 'CELLAR',
    cost: 0,
    bounty: 1,
    map: [
      '##wcwEw####',
      'w.....www##',
      'w.wwwwwwww#',
      'w.bbbwaAaw#',
      'w.wwBwawaw#',
      'c.bbbwawaww',
      'w.wwwwawaww',
      'w.........w',
      '#wwwcwwww.w',
      '#wwwwwwww.w',
      '##wwwwwww.w',
      '#wH.......w',
      '##wwwwcwww#',
    ],
    starter: [[2, 2], [8, 8]],
    suggested: [2, 6],
    headStart: [[7, 6], [8, 9], [0, 2], [5, 10], [10, 8], [3, 8]],
  },
  {
    name: 'The Ossuary',
    short: 'OSSUARY',
    cost: 5000,
    bounty: 1.2,
    map: [
      '#wwwwcwwww#',
      'E..........',
      'wwwwwwwwww.',
      'wwbBbwaAaw.',
      'wwbcbwacaw.',
      'w..........',
      'w.wwdcdwwww',
      'w.wwdDdwwww',
      'w.wwwwwwwcw',
      'w.........w',
      'wcwwwwwww.w',
      'wwH.......w',
      '##wwwcwww##',
    ],
    starter: [],
    suggested: [3, 2],
    headStart: [],
  },
  {
    name: 'Drowned Halls',
    short: 'DROWNED',
    cost: 60000,
    bounty: 1.44,
    map: [
      '#wwcwwwcww#',
      'E.........w',
      'wwwwwwwww.w',
      'waAawbBbw.w',
      'wacawbcbw.w',
      'w~~~~~~~~~w',
      'w.wwdcdwwww',
      'w.wwdDdwwww',
      'w.wwwwwwwcw',
      'w.........w',
      'wcwwwwwww.w',
      'wwH.......w',
      '##wwwFwww##',
    ],
    starter: [],
    suggested: [3, 2],
    headStart: [],
  },
];

export const idx = (x: number, y: number) => y * COLS + x;
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** A tile the player dug (01 §6D): rock -> wall ('w') or chamber ('c'); rock or wall -> path ('p'). */
export interface DugTile {
  i: number;
  k: 'w' | 'c' | 'p';
}

export interface Grid {
  f: number;
  key: string;
  kind: Uint8Array;
  /** Original kind before digging. */
  orig: Uint8Array;
  /** 1 = side-loop / carved path (drawn in the loop colour; lairs prefer main path). */
  loop: Uint8Array;
  water: Uint8Array;
  dug: Uint8Array;
  entry: [number, number];
  hoard: [number, number];
  /** Bait Chest spots (tile indices): the authored loop ends, then carved dead ends. */
  spots: number[];
  /** Number of authored spots (the first entries of `spots`). */
  authored: number;
}

const gridCache = new Map<string, Grid>();

export function gridKey(f: number, dug: DugTile[] | undefined): string {
  return dug && dug.length ? `${f}|${dug.map((d) => `${d.i}${d.k}`).join(',')}` : `${f}`;
}

export function buildGrid(f: number, dug?: DugTile[]): Grid {
  const key = gridKey(f, dug);
  const hit = gridCache.get(key);
  if (hit) return hit;
  const def = FLOORS[f] ?? FLOORS[0];
  const n = COLS * ROWS;
  const kind = new Uint8Array(n);
  const loop = new Uint8Array(n);
  const water = new Uint8Array(n);
  const dugA = new Uint8Array(n);
  let entry: [number, number] = [0, 0];
  let hoard: [number, number] = [0, 0];
  const authored: number[] = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const c = def.map[y]?.[x] ?? '#';
      const i = idx(x, y);
      if (c === 'w') kind[i] = K_WALL;
      else if (c === 'c') kind[i] = K_CHAMBER;
      else if (c === '.') kind[i] = K_PATH;
      else if (c === '~') {
        kind[i] = K_PATH;
        water[i] = 1;
      } else if (c === 'E') {
        kind[i] = K_ENTRY;
        entry = [x, y];
      } else if (c === 'H') {
        kind[i] = K_HOARD;
        hoard = [x, y];
      } else if (c >= 'a' && c <= 'z') {
        kind[i] = K_PATH;
        loop[i] = 1;
      } else if (c >= 'A' && c <= 'Z') {
        kind[i] = K_CHEST;
        loop[i] = 1;
        authored.push(i);
      } else kind[i] = K_ROCK;
    }
  const orig = kind.slice();
  for (const d of dug ?? []) {
    if (d.i < 0 || d.i >= n) continue;
    const o = orig[d.i];
    if (d.k === 'p' ? o !== K_ROCK && o !== K_WALL : o !== K_ROCK) continue;
    kind[d.i] = d.k === 'w' ? K_WALL : d.k === 'c' ? K_CHAMBER : K_PATH;
    if (d.k === 'p') loop[d.i] = 1;
    dugA[d.i] = 1;
  }
  const g: Grid = { f, key, kind, orig, loop, water, dug: dugA, entry, hoard, spots: [], authored: authored.length };
  const spots = [...authored];
  for (let i = 0; i < n; i++) {
    if (!dugA[i] || kind[i] !== K_PATH) continue;
    const x = i % COLS;
    const y = Math.floor(i / COLS);
    let walk = 0;
    for (const [dx, dy] of N4) if (isWalkable(g, x + dx, y + dy)) walk++;
    if (walk === 1) spots.push(i);
  }
  g.spots = spots;
  if (gridCache.size > 48) gridCache.clear();
  gridCache.set(key, g);
  return g;
}

export const kindAt = (g: Grid, x: number, y: number): number => (inBounds(x, y) ? g.kind[idx(x, y)] : K_ROCK);
export const tileKind = (g: Grid, x: number, y: number): TileKind => KINDS[kindAt(g, x, y)];
/** Path tiles that can carry a rune (not the entry, hoard or authored chest spots). */
export const isRuneTile = (g: Grid, x: number, y: number) => kindAt(g, x, y) === K_PATH;
export function isWalkable(g: Grid, x: number, y: number): boolean {
  const k = kindAt(g, x, y);
  return k === K_PATH || k === K_ENTRY || k === K_HOARD || k === K_CHEST;
}
export const isSpot = (g: Grid, i: number) => g.spots.includes(i);

/** Can tile (x, y) be dug into `k`? Rock -> wall / chamber; rock or wall -> path next to a walkable tile. */
export function canDig(g: Grid, x: number, y: number, k: 'w' | 'c' | 'p'): boolean {
  if (!inBounds(x, y)) return false;
  const kd = kindAt(g, x, y);
  if (k !== 'p') return kd === K_ROCK;
  if (kd !== K_ROCK && kd !== K_WALL) return false;
  return N4.some(([dx, dy]) => isWalkable(g, x + dx, y + dy));
}

/** The path tile a lair on chamber (x, y) posts its minions on (prefers the main path). */
export function lairPost(g: Grid, x: number, y: number): [number, number] | null {
  let alt: [number, number] | null = null;
  for (const [dx, dy] of N4) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny) || kindAt(g, nx, ny) !== K_PATH) continue;
    if (!g.loop[idx(nx, ny)]) return [nx, ny];
    alt ??= [nx, ny];
  }
  return alt;
}

// ---------- routes ----------

export interface Route {
  n: number;
  xs: Float64Array;
  ys: Float64Array;
  cum: Float64Array;
  len: number;
  /** Route distance of each baited chest visited (for "visitors loot the chest"). */
  chestAt: number[];
  /** Tile index per point (water lookups, rune triggers). */
  tiles: Int16Array;
}

/** BFS from `from` over walkable tiles; returns the tile path to `to` (inclusive), or null. */
function bfsPath(g: Grid, from: number, to: number): number[] | null {
  if (from === to) return [from];
  const prev = new Int16Array(COLS * ROWS).fill(-1);
  prev[from] = from;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const x = c % COLS;
    const y = Math.floor(c / COLS);
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(g, nx, ny)) continue;
      const ni = idx(nx, ny);
      if (prev[ni] >= 0) continue;
      prev[ni] = c;
      if (ni === to) {
        const out = [to];
        let p = c;
        while (p !== from) {
          out.push(p);
          p = prev[p];
        }
        out.push(from);
        return out.reverse();
      }
      q.push(ni);
    }
  }
  return null;
}

function bfsDist(g: Grid, from: number): Int16Array {
  const d = new Int16Array(COLS * ROWS).fill(-1);
  d[from] = 0;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const x = c % COLS;
    const y = Math.floor(c / COLS);
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(g, nx, ny)) continue;
      const ni = idx(nx, ny);
      if (d[ni] >= 0) continue;
      d[ni] = d[c] + 1;
      q.push(ni);
    }
  }
  return d;
}

const routeCache = new Map<string, Route>();

/** The party route on grid `g` with chests baited at tile indices `bait` (rogues ignore bait). */
export function routeFor(g: Grid, bait: readonly number[], rogue = false): Route {
  const live = rogue ? [] : bait.filter((i) => g.spots.includes(i)).sort((a, b) => a - b);
  const key = `${g.key}|${live.join(',')}`;
  const hit = routeCache.get(key);
  if (hit) return hit;
  const start = idx(...g.entry);
  const end = idx(...g.hoard);
  const tiles: number[] = [start];
  const chestTiles: number[] = [];
  let cur = start;
  const left = new Set(live);
  while (left.size) {
    const d = bfsDist(g, cur);
    let best = -1;
    for (const c of left) if (d[c] >= 0 && (best < 0 || d[c] < d[best] || (d[c] === d[best] && c < best))) best = c;
    if (best < 0) break;
    left.delete(best);
    const p = bfsPath(g, cur, best);
    if (!p) continue;
    tiles.push(...p.slice(1));
    chestTiles.push(tiles.length - 1);
    cur = best;
  }
  const last = bfsPath(g, cur, end) ?? [cur, end];
  tiles.push(...last.slice(1));
  const n = tiles.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const cum = new Float64Array(n);
  tiles.forEach((t, k) => {
    xs[k] = (t % COLS) + 0.5;
    ys[k] = Math.floor(t / COLS) + 0.5;
    if (k > 0) cum[k] = cum[k - 1] + Math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]);
  });
  const r: Route = { n, xs, ys, cum, len: cum[n - 1] || 1, chestAt: chestTiles.map((k) => cum[k]), tiles: Int16Array.from(tiles) };
  if (routeCache.size > 96) routeCache.clear();
  routeCache.set(key, r);
  return r;
}

/** Distance along `rogueRoute` where it passes closest to chest tile `chest` (Caged Bait glance). */
export function entranceOn(g: Grid, rogueRoute: Route, chest: number): number {
  const d = bfsDist(g, chest);
  let best = -1;
  let bd = Infinity;
  for (let k = 0; k < rogueRoute.n; k++) {
    const dd = d[rogueRoute.tiles[k]];
    if (dd >= 0 && dd < bd) {
      bd = dd;
      best = k;
    }
  }
  return best >= 0 ? rogueRoute.cum[best] : 0;
}

/** Floor 0's authored grid (onboarding, tests). */
export const FLOOR0 = buildGrid(0);
export const STARTER_SLITS = FLOORS[0].starter;
export const SUGGESTED_TILE = FLOORS[0].suggested;
