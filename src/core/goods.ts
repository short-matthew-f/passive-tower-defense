// Goods: the cross-department by-products (specs/00 §4, §3.1, §5.2, §7). Pure data and functions
// over the save, shared by the game (game.ts, the Armory, the report) and the balance sim.
//
// Each department exports one Good and imports two; each Good has two importers (14 links).
// Income per Good: a passive rate (the department's `goods.rate`, at least the 2/h trickle, at
// most the Good's passive cap, x Imperial Roads) that flows on and off screen and offline under
// the offline cap, plus an active bonus while the exporter is on screen, read from the
// department's own event counter (`goods.count`: Batches, kills, confiscations ...) and held to
// the Good's active rate by a small token bucket. Imports: 2 lines per department x Node 1 (max 3
// levels, 40 x 2.5^L Goods), each level +1.5% local income (Goods group, capped at +18%) plus a
// small mechanic implemented by the importing department.
import type { DeptEcon } from './dept';
import { offlineCapSeconds } from './economy';
import { ROADS_ID, THRONE_UPGRADES } from './meta';
import { caravanLevel } from './perks';
import { DEPT_ORDER, type DeptId, type DeptSave, type GoodId, type SaveRoot } from './types';

export type { GoodId } from './types';
export const GOOD_ORDER: GoodId[] = ['potions', 'ingots', 'bones', 'contraband', 'souls', 'essence', 'captives'];

export interface GoodDef {
  id: GoodId;
  name: string;
  /** Font icon token, e.g. '{potion}'. */
  icon: string;
  color: string;
  exporter: DeptId;
  importers: [DeptId, DeptId];
  /** Reference active and passive rates, Goods per hour (00 §4 table). The passive rate caps the
   * department's passive formula; active - passive caps the on-screen bonus. */
  activePerH: number;
  passivePerH: number;
}

export const GOODS: Record<GoodId, GoodDef> = {
  potions: { id: 'potions', name: 'Potions', icon: '{potion}', color: '#7ad85a', exporter: 'cauldron', importers: ['mines', 'styx'], activePerH: 15, passivePerH: 4 },
  ingots: { id: 'ingots', name: 'Ingots', icon: '{ingot}', color: '#d8b070', exporter: 'mines', importers: ['dungeon', 'spire'], activePerH: 20, passivePerH: 6 },
  bones: { id: 'bones', name: 'Bones', icon: '{bone}', color: '#e8e0c8', exporter: 'dungeon', importers: ['mines', 'bridge'], activePerH: 20, passivePerH: 6 },
  contraband: { id: 'contraband', name: 'Contraband', icon: '{crate}', color: '#c08850', exporter: 'bridge', importers: ['cauldron', 'styx'], activePerH: 12, passivePerH: 3 },
  souls: { id: 'souls', name: 'Souls', icon: '{soul}', color: '#8ad0e8', exporter: 'styx', importers: ['spire', 'pit'], activePerH: 15, passivePerH: 4 },
  essence: { id: 'essence', name: 'Essence', icon: '{essence}', color: '#c070e0', exporter: 'spire', importers: ['cauldron', 'pit'], activePerH: 10, passivePerH: 3 },
  captives: { id: 'captives', name: 'Captives', icon: '{captive}', color: '#e07050', exporter: 'pit', importers: ['dungeon', 'bridge'], activePerH: 15, passivePerH: 4 },
};

export const EXPORT_OF: Record<DeptId, GoodId> = {
  cauldron: 'potions',
  mines: 'ingots',
  dungeon: 'bones',
  bridge: 'contraband',
  styx: 'souls',
  spire: 'essence',
  pit: 'captives',
};

/** Guaranteed base trickle per unlocked exporter (00 §4, fixes M6). */
export const TRICKLE_PER_H = 2;
/** Imperial Roads: +10% Goods trickle per level (00 §5.2). */
export const ROADS_STEP = 0.1;
export const ROADS = THRONE_UPGRADES.find((u) => u.id === ROADS_ID)!;
/** Each import level: +1.5% local income; the Goods group is capped at +18% (00 §3.1). */
export const IMPORT_STEP = 0.015;
export const IMPORT_CAP = 0.18;
export const NODE_MAX = 3;
/** Node level L+1 costs NODE_BASE x 2.5^L Goods. A line whose Good predates its importer (the
 * War Pit's Souls and Essence lines) costs x1.5 (W-19 lever).
 * SIM-TUNED: 40 -> 80. 00 §4 prices each of a line's two nodes at 40 x 2.5^L (390 a node, 780 a
 * line) and holds a Good's two lines to ~12 days. Node 1 ships alone (00 §4's fallback: lines max
 * at +4.5%), so at 40 a line cost 390 and both lines of a Good maxed 4-6 days after the exporter
 * unlocked (sim/README.md "Pass 4"). 80 puts the line's 780 Goods into its one node. When Node 2s
 * ship, price each node at 40 again. */
export const NODE_BASE = 80;
export const NODE_GROWTH = 2.5;
export const LATE_LINE_MULT = 1.5;
export function importNodeCost(level: number, late = false): number {
  return Math.ceil(NODE_BASE * NODE_GROWTH ** level * (late ? LATE_LINE_MULT : 1));
}

/**
 * Black Market (00 §5.2): any Good for Tribute, +2% per purchase that (local) day.
 * SIM-TUNED: 40 -> 400 Tribute. Tribute runs ~10x the 00 §6 arc (sim/README.md "Still open"; the
 * Seals were scaled 6-8x for the same reason), so at 40 the Black Market priced a maxed import
 * line at ~2-3% of a week-2 day's Tribute and the Goods economy vanished (sim/README.md "Pass 4").
 */
export const MARKET_BASE = 400;
export const MARKET_STEP = 0.02;
export const MARKET_BUNDLE = 10;

// ---------- import nodes ----------

export interface ImportNode {
  /** Key in DeptSave.imports. Node 1 uses the Good's id (the War Pit already reads imports.souls). */
  key: string;
  dept: DeptId;
  good: GoodId;
  node: 1 | 2;
  name: string;
  max: number;
  late: boolean;
  /** Effect text, current level -> next. */
  desc(l: number): string;
}

const stew = (l: number) => (l > 0 ? 35 - 5 * l : 0);
export const stewEvery = stew;

export const IMPORT_NODES: ImportNode[] = [
  { key: 'contraband', dept: 'cauldron', good: 'contraband', node: 1, name: 'Smuggled Spice', max: NODE_MAX, late: false, desc: (l) => `Fewer newts: weight ${50 - 4 * l} > ${50 - 4 * (l + 1)}` },
  { key: 'essence', dept: 'cauldron', good: 'essence', node: 1, name: 'Ladle Sigils', max: NODE_MAX, late: false, desc: (l) => `Ladle charges +${l} > +${l + 1}` },
  { key: 'bones', dept: 'mines', good: 'bones', node: 1, name: 'Bone Miners', max: NODE_MAX, late: false, desc: (l) => `Free grunts ${l} > ${l + 1}` },
  { key: 'potions', dept: 'mines', good: 'potions', node: 1, name: 'Stamina Stew', max: NODE_MAX, late: false, desc: (l) => (l === 0 ? 'Every 30th tap crits' : `Crit every ${stew(l)} > ${stew(l + 1)} taps`) },
  { key: 'ingots', dept: 'dungeon', good: 'ingots', node: 1, name: 'Iron-shod Towers', max: NODE_MAX, late: false, desc: (l) => `Armor pierce +${l} > +${l + 1}` },
  { key: 'captives', dept: 'dungeon', good: 'captives', node: 1, name: 'Caged Bait', max: NODE_MAX, late: false, desc: (l) => (l === 0 ? 'Rogues stop 1s at bait' : `Looting party purse +${10 * (l - 1)}% > +${10 * l}%`) },
  { key: 'bones', dept: 'bridge', good: 'bones', node: 1, name: 'Skulls on Posts', max: NODE_MAX, late: false, desc: (l) => `Fares +${5 * l}% > +${5 * (l + 1)}%` },
  { key: 'captives', dept: 'bridge', good: 'captives', node: 1, name: 'Pillory', max: NODE_MAX, late: false, desc: (l) => (l === 0 ? 'Unmasked pay a 1x fare fine' : `Unmask bounty +${5 * (l - 1)}% > +${5 * l}%`) },
  { key: 'potions', dept: 'styx', good: 'potions', node: 1, name: 'Bait Brews', max: NODE_MAX, late: false, desc: (l) => `Bait effects +${10 * l}% > +${10 * (l + 1)}%` },
  { key: 'contraband', dept: 'styx', good: 'contraband', node: 1, name: 'Debt Collectors', max: NODE_MAX, late: false, desc: (l) => `Debt bait -${15 * l}% > -${15 * (l + 1)}%` },
  { key: 'ingots', dept: 'spire', good: 'ingots', node: 1, name: 'Tempered Glass', max: NODE_MAX, late: false, desc: (l) => `Flask +${2 * l}px > +${2 * (l + 1)}px` },
  { key: 'souls', dept: 'spire', good: 'souls', node: 1, name: 'Spark Fuel', max: NODE_MAX, late: false, desc: (l) => `Apprentice drops +${5 * l}% > +${5 * (l + 1)}%` },
  { key: 'souls', dept: 'pit', good: 'souls', node: 1, name: 'Restless Spirits', max: NODE_MAX, late: true, desc: (l) => (l === 0 ? 'First fainted: 1/1 Shade' : `Shade ${l}/${l} > ${l + 1}/${l + 1}`) },
  { key: 'essence', dept: 'pit', good: 'essence', node: 1, name: 'Warding Sigils', max: NODE_MAX, late: true, desc: (l) => `Armor 1 on front ${l} > ${l + 1}` },
];

export const importsOf = (dept: DeptId): ImportNode[] => IMPORT_NODES.filter((n) => n.dept === dept);

/** Import level of `key` in this department (0 when locked or missing). */
export const importLv = (d: DeptSave | undefined, key: string): number => Math.max(0, Math.min(NODE_MAX, d?.imports?.[key] ?? 0));

/** importAdd_d: +1.5% local income per import level, capped at +18% (Goods group, 00 §3.1). */
export function importAdd(d: DeptSave | undefined): number {
  if (!d?.imports) return 0;
  // DeptSave.imports holds only import-node levels, so the sum is department-agnostic.
  let n = 0;
  for (const v of Object.values(d.imports)) n += Math.max(0, Math.min(NODE_MAX, Number(v) || 0));
  return Math.min(IMPORT_CAP, IMPORT_STEP * n);
}

/** A line is open when both its exporter and its importer are unlocked (00 §4: a partner that
 * isn't unlocked yet hides that line). */
export const lineOpen = (s: SaveRoot, node: ImportNode): boolean => !!s.depts[GOODS[node.good].exporter] && !!s.depts[node.dept];

export function nodeCost(s: SaveRoot, node: ImportNode): number {
  return importNodeCost(importLv(s.depts[node.dept], node.key), node.late);
}

export function canBuyImport(s: SaveRoot, node: ImportNode): boolean {
  const d = s.depts[node.dept];
  if (!d || !lineOpen(s, node) || importLv(d, node.key) >= node.max) return false;
  return goodsStock(s, node.good) + 1e-9 >= nodeCost(s, node);
}

/** Buys the next level of an import node with Goods. Returns true on success. */
export function buyImport(s: SaveRoot, node: ImportNode): boolean {
  if (!canBuyImport(s, node)) return false;
  const d = s.depts[node.dept]!;
  s.meta.goods[node.good] = goodsStock(s, node.good) - nodeCost(s, node);
  d.imports[node.key] = importLv(d, node.key) + 1;
  return true;
}

// ---------- stock and income ----------

export const goodsStock = (s: SaveRoot, g: GoodId): number => s.meta.goods?.[g] ?? 0;

export function addGoods(s: SaveRoot, g: GoodId, amount: number): void {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  s.meta.goods[g] = goodsStock(s, g) + amount;
}

/** Goods trickle group: Imperial Roads (Throne) + Goods Caravan (Dread perk), +10% per level each. */
export const roadsMult = (s: SaveRoot): number => 1 + ROADS_STEP * ((s.meta.throne[ROADS.id] ?? 0) + caravanLevel(s));

/** Passive Goods per hour from one unlocked exporter: its formula, at least the 2/h trickle and
 * at most the Good's passive rate, x Imperial Roads. 0 when locked or the department has no Good. */
export function passivePerH(s: SaveRoot, id: DeptId, defs: Record<string, DeptEcon>): number {
  const d = s.depts[id];
  const def = defs[id];
  if (!d || !def) return 0;
  const g = GOODS[EXPORT_OF[id]];
  let r = 0;
  try {
    r = def.goods ? def.goods.rate(d) : 0;
  } catch {
    r = 0;
  }
  if (!Number.isFinite(r)) r = 0;
  return Math.max(TRICKLE_PER_H, Math.min(g.passivePerH, r)) * roadsMult(s);
}

/** Goods credited for `seconds` of offline time (00 §7: passive rates under the offline cap). */
export function offlineGoods(s: SaveRoot, defs: Record<string, DeptEcon>, elapsed: number): Partial<Record<GoodId, number>> {
  const t = Math.min(elapsed, offlineCapSeconds(s));
  const out: Partial<Record<GoodId, number>> = {};
  for (const id of DEPT_ORDER) {
    if (!s.depts[id] || !defs[id]) continue;
    const amt = (passivePerH(s, id, defs) / 3600) * t;
    if (amt > 0) out[EXPORT_OF[id]] = (out[EXPORT_OF[id]] ?? 0) + amt;
  }
  return out;
}

/** The on-screen active bonus: the department's export counter, held to (active - passive) per
 * hour by a token bucket (10 minutes deep). In memory only, like the game's frame state. */
export interface ActiveGoodsTrack {
  last: number | null;
  bucket: number;
}
export const newActiveTrack = (): ActiveGoodsTrack => ({ last: null, bucket: 0 });

/** Reads the counter, refills the bucket for dt seconds and returns the Goods to credit. */
export function activeGoodsStep(def: DeptEcon, d: DeptSave, tr: ActiveGoodsTrack, dt: number): number {
  if (!def.goods?.count) return 0;
  let c = 0;
  try {
    c = def.goods.count(d);
  } catch {
    return 0;
  }
  if (!Number.isFinite(c)) return 0;
  const g = GOODS[def.goods.id];
  const perS = Math.max(0, g.activePerH - g.passivePerH) / 3600;
  const depth = Math.max(2, perS * 600);
  tr.bucket = Math.min(depth, tr.bucket + perS * dt);
  if (tr.last === null || c < tr.last) {
    // First read, or the counter reset (a Fall replaced the run).
    tr.last = c;
    return 0;
  }
  const delta = c - tr.last;
  tr.last = c;
  const got = Math.min(delta, tr.bucket);
  tr.bucket -= got;
  return got;
}

/** Income per Good per hour right now (passive; the Armory and the report show it). */
export function goodsIncomePerH(s: SaveRoot, defs: Record<string, DeptEcon>): Record<GoodId, number> {
  const out = Object.fromEntries(GOOD_ORDER.map((g) => [g, 0])) as Record<GoodId, number>;
  for (const id of DEPT_ORDER) if (s.depts[id] && defs[id]) out[EXPORT_OF[id]] += passivePerH(s, id, defs);
  return out;
}

// ---------- Black Market ----------

/** Local day index for the Black Market's daily price climb. */
export const marketDay = (nowMs: number, tzOffsetMin = 0): number => Math.floor((nowMs - tzOffsetMin * 60_000) / 86_400_000);

function boughtToday(s: SaveRoot, day: number): number {
  const m = s.meta.market;
  return m && m.day === day ? m.n : 0;
}

/** Tribute for the next `qty` Goods today (each purchase +2%). */
export function marketCost(s: SaveRoot, day: number, qty = MARKET_BUNDLE): number {
  const n0 = boughtToday(s, day);
  let c = 0;
  for (let k = 0; k < qty; k++) c += MARKET_BASE * (1 + MARKET_STEP) ** (n0 + k);
  return Math.ceil(c);
}

export function buyMarket(s: SaveRoot, g: GoodId, day: number, qty = MARKET_BUNDLE): boolean {
  const cost = marketCost(s, day, qty);
  if (s.meta.tribute + 1e-9 < cost) return false;
  s.meta.tribute -= cost;
  addGoods(s, g, qty);
  s.meta.market = { day, n: boughtToday(s, day) + qty };
  return true;
}
