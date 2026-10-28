// Wave 1 core: Next Goal selection, Night Orders, the Pass 7 pacing reset and A5 (pure parts).
import { describe, expect, it } from 'vitest';
import type { DeptEcon } from '../src/core/dept';
import {
  ACTIVE_GATE_MULT,
  econFloor,
  infamy,
  OFFLINE_GATE_CAP,
  offlineCapSeconds,
  offlineGateRoom,
  tributeCapSeconds,
} from '../src/core/economy';
import { pickGoal, REVEAL_FRAC, sealRevealed, shortLegend, takeReveals, type GoalDef } from '../src/core/goals';
import { SEAL_COST, SEAL_DREAD } from '../src/core/meta';
import { botOrder, CORE_ORDERS, creditOffline, ORDER_EFFECTS, ordersFor, outcomeText, setOrder, standingOrder } from '../src/core/orders';
import { migrate } from '../src/core/save';
import { DEPT_ORDER, newSave, type DeptId, type DeptSave, type SaveRoot } from '../src/core/types';

function econ(id: DeptId, extra: Partial<GoalDef> = {}): GoalDef {
  return {
    id,
    version: 1,
    defaultRun: () => ({ bank: 0 }),
    defaultPersistent: () => ({}),
    idleRate: () => 1,
    skillTarget: (n: number) => 5 + n,
    skillLabel: (t: number) => `LEVEL ${t}`,
    econBase: 1e6,
    rankRef: 1,
    rankTarget: 100,
    commendations: [],
    legend: { name: 'Dame Brightjaw the Unreasonably Tall' },
    currency: 'Bile',
    ...extra,
  } as GoalDef;
}

function dept(over: Partial<DeptSave['cycle']> = {}, bank = 0): DeptSave {
  return {
    v: 1,
    unlockedAt: 0,
    cycle: { n: 0, startedAt: 0, earnings: 0, heldLevel: 0, legendWaiting: false, ...over },
    lifetime: { peakRank: 0, falls: 0, best: {} },
    imports: {},
    persistent: {},
    run: { bank },
    seen: {},
  };
}

function world(ids: DeptId[]): { s: SaveRoot; defs: Record<string, GoalDef> } {
  const s = newSave(0);
  const defs: Record<string, GoalDef> = {};
  for (const id of DEPT_ORDER) defs[id] = econ(id);
  for (const id of ids) s.depts[id] = dept();
  return { s, defs };
}

describe('Next Goal ribbon (A3)', () => {
  it('a waiting Legend beats everything, then an affordable Seal', () => {
    const { s, defs } = world(['cauldron', 'mines']);
    s.meta.tribute = SEAL_COST.dungeon;
    expect(pickGoal(s, defs, 'throne')?.go).toEqual({ kind: 'seal', id: 'dungeon' });
    expect(pickGoal(s, defs, 'throne')?.text).toBe('UNSEAL THE DUNGEON');
    s.depts.mines!.cycle.legendWaiting = true;
    const g = pickGoal(s, defs, 'throne')!;
    expect(g.go).toEqual({ kind: 'enter', id: 'mines' });
    expect(g.hot).toBe(true);
    expect(g.text).toContain('DAME BRIGHTJAW');
  });

  it('picks the nearer of a near Legend and a revealed Seal, else the best Legend', () => {
    const { s, defs } = world(['cauldron', 'mines']);
    // Mines at 90% Infamy (both gates), the Dungeon Seal 60% paid.
    const d = s.depts.mines!;
    d.cycle.heldLevel = 5;
    d.cycle.earnings = econFloor(defs.mines, 0) ** 0.9;
    s.meta.tribute = 0.6 * SEAL_COST.dungeon;
    expect(Math.round(infamy(defs.mines, d).value)).toBe(90);
    expect(pickGoal(s, defs, 'throne')?.go).toEqual({ kind: 'enter', id: 'mines' });
    s.meta.tribute = 0.95 * SEAL_COST.dungeon;
    expect(pickGoal(s, defs, 'throne')?.go).toEqual({ kind: 'seal', id: 'dungeon' });
    // Seal not yet revealed and no Legend near: the best Legend.
    s.meta.tribute = 0;
    d.cycle.earnings = econFloor(defs.mines, 0) ** 0.3;
    const g = pickGoal(s, defs, 'throne')!;
    expect(g.text.startsWith('NEXT LEGEND')).toBe(true);
  });

  it("a department's own nextGoal wins on its HUD, with a fallback when it throws", () => {
    const { s, defs } = world(['cauldron']);
    defs.cauldron = econ('cauldron', { nextGoal: (d) => ({ label: 'hire 4th toadling', progress: d.run.bank / 400, detail: `${d.run.bank}/400` }) });
    s.depts.cauldron!.run.bank = 230;
    const g = pickGoal(s, defs, 'cauldron')!;
    expect(g.text).toBe('HIRE 4TH TOADLING');
    expect(g.detail).toBe('230/400');
    expect(g.progress).toBeCloseTo(0.575);
    defs.cauldron = econ('cauldron', {
      nextGoal: () => {
        throw new Error('boom');
      },
      readyBuys: () => [
        { label: 'Big Spoon', cost: 100 },
        { label: 'Ladle', cost: 500 },
      ],
    });
    // Bank 230: the cheapest not-yet-affordable Ready buy.
    expect(pickGoal(s, defs, 'cauldron')?.text).toBe('BUY LADLE');
    s.depts.cauldron!.cycle.legendWaiting = true;
    expect(pickGoal(s, defs, 'cauldron')?.hot).toBe(true);
  });

  it('shortens Legend names', () => {
    expect(shortLegend('Dame Brightjaw the Unreasonably Tall')).toBe('DAME BRIGHTJAW');
    expect(shortLegend('Brakka Bare-Knuckle')).toBe('BRAKKA BARE-KNUCKLE');
    expect(shortLegend('Sir Augustin Drillwright')).toBe('SIR AUGUSTIN');
  });
});

describe('progressive disclosure (R5)', () => {
  it('a sealed door shows its price at 50% of it (and its Dread gate), then stays revealed', () => {
    const { s } = world(['cauldron', 'mines', 'dungeon', 'bridge']);
    expect(sealRevealed(s, 'styx')).toBe(false);
    s.meta.tribute = REVEAL_FRAC * SEAL_COST.styx;
    expect(sealRevealed(s, 'styx')).toBe(false); // no Dread yet
    s.meta.dreadLifetime = SEAL_DREAD.styx!;
    expect(sealRevealed(s, 'styx')).toBe(true);
    expect(takeReveals(s, DEPT_ORDER)).toEqual(['styx']);
    expect(takeReveals(s, DEPT_ORDER)).toEqual([]); // once
    s.meta.tribute = 0;
    expect(sealRevealed(s, 'styx')).toBe(true); // latched
    expect(sealRevealed(s, 'spire')).toBe(false);
  });
});

describe('Night Orders (R1)', () => {
  it('every department has a core pair: income now vs bait the Legend', () => {
    for (const id of DEPT_ORDER) {
      const list = CORE_ORDERS[id];
      expect(list).toHaveLength(2);
      expect(list.map((o) => o.kind)).toEqual(['income', 'gate']);
      for (const o of list) {
        expect(o.label.length).toBeLessThanOrEqual(15);
        expect(o.desc.length).toBeLessThanOrEqual(34);
      }
    }
  });

  it('the standing order defaults to the first and remembers a choice', () => {
    const { s, defs } = world(['mines']);
    expect(standingOrder(s, 'mines', defs.mines)?.id).toBe('haul');
    expect(setOrder(s, 'mines', defs.mines, 'deep')).toBe(true);
    expect(standingOrder(s, 'mines', defs.mines)?.id).toBe('deep');
    expect(setOrder(s, 'mines', defs.mines, 'nope')).toBe(false);
    // A department's own orders replace the core pair; a stale saved id falls back to the first.
    defs.mines = econ('mines', { nightOrders: () => [{ id: 'gems', label: 'MINE GEMS', desc: 'Gems while away' }] });
    expect(ordersFor('mines', defs.mines, s.depts.mines).map((o) => o.id)).toEqual(['gems']);
    expect(standingOrder(s, 'mines', defs.mines)?.id).toBe('gems');
    // A throwing hook falls back to the core pair.
    defs.mines = econ('mines', {
      nightOrders: () => {
        throw new Error('x');
      },
    });
    expect(ordersFor('mines', defs.mines, s.depts.mines)).toBe(CORE_ORDERS.mines);
  });

  it('income: +25% to the bank; any offline credit stops the gate at 90% of the floor', () => {
    const def = econ('cauldron');
    const d = dept();
    const floor = econFloor(def, 0);
    const r = creditOffline('cauldron', def, d, CORE_ORDERS.cauldron[0], floor * 2, 1);
    expect(d.run.bank).toBeCloseTo(floor * 2 * ORDER_EFFECTS.income.bank);
    expect(r.bonus).toBeCloseTo(floor * 0.5);
    expect(d.cycle.earnings).toBeCloseTo(OFFLINE_GATE_CAP * floor);
    expect(r.gateHeld).toBe(true);
    expect(r.gateAfter).toBeCloseTo(0.9);
    expect(offlineGateRoom(def, d)).toBe(0);
    expect(outcomeText(r, 'Bile', (n) => n.toFixed(0))).toBe(`+${(floor * 0.5).toFixed(0)} EXTRA BILE`);
  });

  it('bait the Legend: the gate counts x1.5 and may fill to 100% offline', () => {
    const def = econ('cauldron');
    const d = dept();
    const floor = econFloor(def, 0);
    const r = creditOffline('cauldron', def, d, CORE_ORDERS.cauldron[1], floor, 1);
    expect(d.run.bank).toBeCloseTo(floor);
    expect(d.cycle.earnings).toBeCloseTo(1.5 * floor);
    expect(r.gateAfter).toBeGreaterThanOrEqual(1);
    expect(outcomeText(r, 'Bile', String)).toBe('THE LEGEND TOOK THE BAIT!');
  });

  it('no order (a short gap) keeps the plain rules; the bot baits once the skill gate is met', () => {
    const def = econ('cauldron');
    const d = dept();
    creditOffline('cauldron', def, d, null, 100, 1);
    expect(d.run.bank).toBe(100);
    expect(d.cycle.earnings).toBe(100);
    expect(botOrder(CORE_ORDERS.bridge, false)).toBe('tolls');
    expect(botOrder(CORE_ORDERS.bridge, true)).toBe('hunt');
  });
});

describe('pacing reset (A4) and your hands move the meter (A5)', () => {
  it('base offline caps are 24 h', () => {
    const s = newSave(0);
    expect(offlineCapSeconds(s)).toBe(24 * 3600);
    expect(tributeCapSeconds(s)).toBe(24 * 3600);
    s.meta.throne.curfewBells = 2;
    expect(offlineCapSeconds(s)).toBe(26 * 3600);
  });

  it('Seals climb in unlock order and the later Dread gates are lower than Pass 6', () => {
    const costs = DEPT_ORDER.map((id) => SEAL_COST[id]);
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeGreaterThan(costs[i - 1]);
    expect(SEAL_COST.bridge).toBeLessThan(60000);
    expect(SEAL_DREAD.spire!).toBeLessThan(60);
    expect(SEAL_DREAD.pit!).toBeLessThan(150);
  });

  it('active earnings count x2 on the economy gate', () => {
    expect(ACTIVE_GATE_MULT).toBe(2);
  });
});

describe('old saves', () => {
  it('default-fill Night Orders and drop junk', () => {
    const old = JSON.parse(JSON.stringify(newSave(0)));
    delete old.meta.orders;
    old.meta.lastAway = { seconds: 'x' };
    const s = migrate(old)!;
    expect(s.meta.orders).toEqual({});
    expect(s.meta.lastAway).toBeUndefined();
    const bad = JSON.parse(JSON.stringify(newSave(0)));
    bad.meta.orders = { mines: 'deep', cauldron: 7 };
    expect(migrate(bad)!.meta.orders).toEqual({ mines: 'deep' });
  });

  it('a save without meta.orders still yields a standing order', () => {
    const { s, defs } = world(['styx']);
    delete (s.meta as Partial<SaveRoot['meta']>).orders;
    expect(standingOrder(s, 'styx', defs.styx as DeptEcon)?.id).toBe('obols');
    expect(setOrder(s, 'styx', defs.styx, 'souls')).toBe(true);
    expect(s.meta.orders.styx).toBe('souls');
  });
});
