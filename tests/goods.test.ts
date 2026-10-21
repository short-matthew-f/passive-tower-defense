import { describe, expect, it } from 'vitest';
import type { DeptEcon } from '../src/core/dept';
import { coreMult } from '../src/core/economy';
import {
  activeGoodsStep,
  buyImport,
  buyMarket,
  importAdd,
  IMPORT_NODES,
  importNodeCost,
  importsOf,
  marketCost,
  newActiveTrack,
  offlineGoods,
  passivePerH,
} from '../src/core/goods';
import { migrate } from '../src/core/save';
import { newSave, type DeptSave } from '../src/core/types';
import { goodsGraphProblems } from '../sim/metrics';

const dept = (imports: Record<string, number> = {}, run: any = { bank: 0 }): DeptSave =>
  ({ v: 1, unlockedAt: 0, cycle: { n: 0, startedAt: 0, earnings: 0, heldLevel: 0, legendWaiting: false }, lifetime: { peakRank: 0, falls: 0, best: {} }, imports, persistent: {}, run, seen: {} }) as DeptSave;

const econ = (id: any, good: any, rate: number, count?: (s: DeptSave) => number): DeptEcon =>
  ({ id, idleRate: () => 1, rankRef: 1, rankTarget: 10, goods: { id: good, rate: () => rate, count } }) as unknown as DeptEcon;

describe('Goods', () => {
  it('graph: 7 exporters, 14 links, 2 importers per Good, 2 imports per department', () => {
    expect(goodsGraphProblems()).toEqual([]);
    expect(IMPORT_NODES.length).toBe(14);
    expect(importsOf('pit').map((n) => n.key).sort()).toEqual(['essence', 'souls']); // the War Pit reads these keys
  });

  it('importAdd is +1.5% per level, capped at +18%, and feeds coreMult', () => {
    expect(importAdd(dept({ bones: 2, potions: 1 }))).toBeCloseTo(0.045);
    expect(importAdd(dept({ a: 3, b: 3, c: 3, d: 3, e: 3 }))).toBeCloseTo(0.18);
    const s = newSave(0);
    s.depts.mines = dept({ bones: 3, potions: 3 });
    expect(coreMult(s, 'mines', {}, 0)).toBeCloseTo(1.09);
  });

  it('passive rate: at least the 2/h trickle, at most the passive cap, x Roads', () => {
    const s = newSave(0);
    s.depts.cauldron = dept();
    expect(passivePerH(s, 'cauldron', { cauldron: econ('cauldron', 'potions', 0) })).toBe(2);
    expect(passivePerH(s, 'cauldron', { cauldron: econ('cauldron', 'potions', 99) })).toBe(4);
    s.meta.throne.imperialRoads = 5;
    expect(passivePerH(s, 'cauldron', { cauldron: econ('cauldron', 'potions', 99) })).toBeCloseTo(6);
    // Offline: under the 8 h cap.
    const got = offlineGoods(s, { cauldron: econ('cauldron', 'potions', 99) }, 20 * 3600);
    expect(got.potions).toBeCloseTo(6 * 8);
  });

  it('active bonus: counter increases, held by the token bucket, reset-safe', () => {
    let c = 0;
    const def = econ('bridge', 'contraband', 0, () => c);
    const d = dept();
    const tr = newActiveTrack();
    expect(activeGoodsStep(def, d, tr, 1)).toBe(0); // first read
    c = 1;
    // Bucket refills (12 - 3)/h; after 1 s it holds 0.0025 Goods.
    expect(activeGoodsStep(def, d, tr, 1)).toBeCloseTo(0.005, 3);
    for (let i = 0; i < 1200; i++) activeGoodsStep(def, d, tr, 1);
    c = 100;
    expect(activeGoodsStep(def, d, tr, 1)).toBe(2); // capped at the bucket depth (10 min, at least 2)
    c = 0; // a Fall reset the counter
    expect(activeGoodsStep(def, d, tr, 1)).toBe(0);
  });

  it('import nodes cost Goods and persist in DeptSave.imports', () => {
    const s = newSave(0);
    s.depts.mines = dept();
    s.depts.dungeon = dept();
    const node = IMPORT_NODES.find((n) => n.dept === 'mines' && n.good === 'bones')!;
    expect(buyImport(s, node)).toBe(false);
    s.meta.goods.bones = importNodeCost(0);
    expect(buyImport(s, node)).toBe(true);
    expect(s.depts.mines.imports.bones).toBe(1);
    expect(s.meta.goods.bones).toBe(0);
    // A line whose exporter is sealed is hidden and can't be bought.
    const potions = IMPORT_NODES.find((n) => n.dept === 'styx' && n.good === 'potions')!;
    s.meta.goods.potions = 1e6;
    expect(buyImport(s, potions)).toBe(false);
  });

  it('Black Market: +2% per purchase that day, resets the next day', () => {
    const s = newSave(0);
    s.meta.tribute = 1e9;
    const first = marketCost(s, 10, 10);
    expect(buyMarket(s, 'souls', 10, 10)).toBe(true);
    expect(s.meta.goods.souls).toBe(10);
    expect(marketCost(s, 10, 10)).toBeGreaterThan(first * 1.2);
    expect(marketCost(s, 11, 10)).toBe(first);
  });

  it('old saves load: goods, market and imports default', () => {
    const old: any = newSave(0);
    delete old.meta.goods;
    delete old.meta.market;
    old.depts.cauldron = dept();
    delete old.depts.cauldron.imports;
    const s = migrate(JSON.parse(JSON.stringify(old)))!;
    expect(s.meta.goods.captives).toBe(0);
    expect(s.meta.market.n).toBe(0);
    expect(s.depts.cauldron!.imports).toEqual({});
  });
});
