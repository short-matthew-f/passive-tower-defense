// Shared-core polish: native bulk buying in the upgrade sheet, per-department settings and their
// migration from older saves, and default-filled suite settings.
import { describe, expect, it } from 'vitest';
import type { UpgradeEntry } from '../src/core/dept';
import { migrate } from '../src/core/save';
import { deptSetting, migrateDeptSettings } from '../src/core/settings';
import { newSave } from '../src/core/types';
import { buyLevels, bulkable, planBuy } from '../src/ui/sheet';
import { mines } from '../src/depts/mines';

function node(bank: { v: number }, base = 10, growth = 2, max = Infinity) {
  let lvl = 0;
  const price = (k: number) => base * growth ** (lvl + k);
  const e: UpgradeEntry = {
    id: 'n',
    name: 'Node',
    max,
    desc: () => '',
    level: () => lvl,
    cost: () => price(0),
    canAfford: () => lvl < max && bank.v >= price(0),
    buy: () => {
      if (bank.v < price(0)) return;
      bank.v -= price(0);
      lvl++;
    },
  };
  return { e, priced: { ...e, costFor: (n: number) => Array.from({ length: n }, (_, i) => price(i)).reduce((a, b) => a + b, 0) } as UpgradeEntry };
}

describe('upgrade sheet bulk buying', () => {
  it('x1 is the plain next price', () => {
    const { priced } = node({ v: 1000 });
    expect(planBuy(priced, 0, 1000)).toMatchObject({ n: 1, cost: 10, afford: true });
  });

  it('x10 prices ten levels exactly and needs the whole sum', () => {
    const { priced } = node({ v: 100 });
    const p = planBuy(priced, 1, 100);
    expect(p.n).toBe(10);
    expect(p.cost).toBe(10 * (2 ** 10 - 1));
    expect(p.afford).toBe(false);
  });

  it('MAX finds the most levels the wallet covers', () => {
    const { priced } = node({ v: 155 });
    // 10 + 20 + 40 + 80 = 150 <= 155 < 310
    expect(planBuy(priced, 2, 155)).toMatchObject({ n: 4, cost: 150, afford: true });
    expect(planBuy(priced, 2, 5)).toMatchObject({ n: 1, afford: false });
  });

  it('caps at max - level', () => {
    const { priced } = node({ v: 0 }, 1, 1, 3);
    expect(planBuy(priced, 1, 1e9).n).toBe(3);
    expect(planBuy(priced, 2, 1e9).n).toBe(3);
  });

  it('falls back to repeated buy() without costFor', () => {
    const bank = { v: 70 };
    const { e } = node(bank);
    const p = planBuy(e, 1, null);
    expect(p).toMatchObject({ n: 10, cost: 10, exact: false, afford: true });
    expect(buyLevels(e, p.n)).toBe(3); // 10 + 20 + 40
    expect(bank.v).toBe(0);
  });

  it('toggles, headers and one-off rows never bulk', () => {
    const { e } = node({ v: 0 });
    expect(bulkable(e)).toBe(true);
    expect(bulkable({ ...e, max: 1 })).toBe(false);
    expect(bulkable({ ...e, costText: () => 'ON' })).toBe(false);
    expect(bulkable({ ...e, bulk: false })).toBe(false);
    expect(bulkable({ ...e, header: true })).toBe(false);
  });
});

describe('suite settings', () => {
  it('old saves default-fill leftHanded, buyMode and depts', () => {
    const s = newSave(0) as any;
    delete s.meta.settings.leftHanded;
    delete s.meta.settings.buyMode;
    delete s.meta.settings.depts;
    const m = migrate(JSON.parse(JSON.stringify(s)))!;
    expect(m.meta.settings.leftHanded).toBe(false);
    expect(m.meta.settings.buyMode).toBe(0);
    expect(m.meta.settings.depts).toEqual({});
  });

  it('Mines options move from persistent into settings once (values kept)', () => {
    const s = newSave(0);
    s.depts.mines = { persistent: { holdAuto: false, steady: true, latency: 0.12, calibrated: true, gems: 3 } } as any;
    expect(migrateDeptSettings(s, { mines })).toBe(4);
    expect(deptSetting(s, mines, 'holdAuto')).toBe(false);
    expect(deptSetting(s, mines, 'steady')).toBe(true);
    expect(deptSetting(s, mines, 'latency')).toBe(0.12);
    const per = s.depts.mines!.persistent as any;
    expect(per.holdAuto).toBeUndefined();
    expect(per.gems).toBe(3);
    // A second load moves nothing and keeps the settings.
    per.latency = 0.05;
    expect(migrateDeptSettings(s, { mines })).toBe(0);
    expect(deptSetting(s, mines, 'latency')).toBe(0.12);
  });

  it('unset settings read as their defaults', () => {
    const s = newSave(0);
    expect(deptSetting(s, mines, 'holdAuto')).toBe(true);
    expect(deptSetting(s, mines, 'steady')).toBe(false);
  });
});
