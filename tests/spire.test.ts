// Spire pure economy (specs/04): the corrected EV example, idleRate shape and the Feat rule.
import { describe, expect, it } from 'vitest';
import * as D from '../src/depts/spire/def';
import { SpireCore } from '../src/depts/spire/logic';

describe('spire economy', () => {
  it('matches the spec EV_drop worked example (ceiling T7, base table: ~97.2)', () => {
    expect(D.evDropTable(D.spawnTableL(0, 0), 7)).toBeCloseTo(97.2, 0);
  });

  it('idleRate is zero without apprentices and capped at 12 drops/min', () => {
    const run = D.defaultRun();
    const per = D.defaultPersistent();
    run.ceiling = 7;
    expect(D.idleRateOf(run, per)).toBe(0);
    run.lv.hire = 4;
    run.lv.diligence = 25;
    expect(D.apprenticeDropsPerMin(run)).toBe(12);
    expect(D.idleRateOf(run, per)).toBeGreaterThan(0);
  });

  it('Feat: Volatility raised just before a merge does not count', () => {
    const run = D.defaultRun();
    run.volBought = 5;
    run.vol = 5; // raised, but never held since a vent or for 60 drops
    run.minSinceVent = 0;
    expect(D.heldVol(run)).toBe(0);
    run.volLog = new Array(60).fill(5);
    expect(D.heldVol(run)).toBe(5);
  });

  it('two same-tier orbs merge and pay', () => {
    let paid = 0;
    const core = new SpireCore(D.defaultRun(), D.defaultPersistent(), { earn: (b) => (paid += b), raiseSkill: () => {} }, 7);
    core.flask.add(3, -6, 200);
    core.flask.add(3, 6, 200);
    for (let i = 0; i < 60; i++) core.update(1 / 60);
    expect(core.flask.count).toBe(1);
    expect(core.flask.orbs[0].tier).toBe(4);
    expect(paid).toBeCloseTo(36);
  });
});

// ---------- finishing pass: special orbs, tools, the delayed knob, manager hooks ----------

import { spire } from '../src/depts/spire';
import type { DeptSave } from '../src/core/types';

function mkSave(): DeptSave {
  return {
    v: 1,
    unlockedAt: 0,
    cycle: { n: 0, startedAt: 0, earnings: 0, heldLevel: 0, legendWaiting: false },
    lifetime: { peakRank: 0, falls: 0, best: {} },
    imports: {},
    persistent: D.defaultPersistent(),
    run: D.defaultRun(),
    seen: {},
    pendingTips: [],
  } as unknown as DeptSave;
}

const core = (run = D.defaultRun(), per = D.defaultPersistent()) => {
  const paid = { v: 0 };
  const c = new SpireCore(run, per, { earn: (b) => (paid.v += b), raiseSkill: () => {} }, 3);
  return { c, paid };
};
const settle = (c: SpireCore, s: number) => {
  for (let i = 0; i < s * 60; i++) c.update(1 / 60, 1e12 + i * 16);
};

describe('spire special orbs and tools', () => {
  it('a Catalyst upgrades the orb it touches by one tier and pays that merge', () => {
    const { c, paid } = core();
    c.flask.add(5, 0, 200);
    c.flask.add(D.CATALYST, 0, 180);
    settle(c, 1);
    expect(c.flask.count).toBe(1);
    expect(c.flask.orbs[0].tier).toBe(6);
    expect(paid.v).toBeCloseTo(330);
    expect(c.run.stats.catalysts).toBe(1);
  });

  it('the bag deals a Catalyst every 60 drops (Catalyst Coil: -6 each)', () => {
    expect(D.catalystEveryL(0)).toBe(60);
    expect(D.catalystEveryL(7)).toBe(18);
    const { c } = core();
    let seen = 0;
    for (let i = 0; i < 130; i++) {
      if (c.current === D.CATALYST) seen++;
      c.flask.clear();
      c.cool = 0;
      c.drop(0);
    }
    expect(seen).toBe(2);
  });

  it('three touching Hex Stones shatter for 3 x the top tier value / 10', () => {
    const run = D.defaultRun();
    run.ceiling = 7;
    const { c, paid } = core(run);
    c.flask.add(D.HEX, -12, 210);
    c.flask.add(D.HEX, 0, 210);
    c.flask.add(D.HEX, 12, 210);
    settle(c, 1);
    expect(c.flask.count).toBe(0);
    expect(paid.v).toBeCloseTo(300); // 3 stones x 1000 / 10 (T7 is under the T8 cap)
    expect(c.run.stats.hexShatters).toBe(1);
  });

  it('Hex Stones only come with Volatility', () => {
    const run = D.defaultRun();
    const { c } = core(run);
    const draw = () => {
      let hex = 0;
      for (let i = 0; i < 300; i++) {
        c.flask.clear();
        c.cool = 0;
        if (c.current === D.HEX) hex++;
        c.drop(0);
      }
      return hex;
    };
    expect(draw()).toBe(0);
    run.volBought = 10;
    run.vol = 10;
    expect(draw()).toBeGreaterThan(30);
  });

  it('Quicksilver merges with nothing and melts after 20 s', () => {
    const { c } = core();
    c.flask.add(D.QUICK, 0, 200);
    c.flask.add(D.QUICK, 0, 190);
    settle(c, 5);
    expect(c.flask.count).toBe(2);
    settle(c, 16);
    expect(c.flask.count).toBe(0);
  });

  it('Tremor, Quicksilver and Vent Now need their nodes and respect cooldowns', () => {
    const run = D.defaultRun();
    const { c, paid } = core(run);
    c.flask.add(3, 0, 200);
    expect(c.tremor()).toBe(false);
    run.lv.tremor = 1;
    expect(c.tremor()).toBe(true);
    expect(c.tremor()).toBe(false);
    run.lv.quick = 1;
    expect(c.quick()).toBe(true);
    expect(c.current).toBe(D.QUICK);
    run.lv.settle = 1;
    settle(c, 2);
    expect(c.ventNow()).toBe(false); // nothing above the Vent Line
    c.flask.add(4, 30, 5);
    const vents = run.stats.vents;
    expect(c.ventNow()).toBe(true);
    expect(paid.v).toBeGreaterThanOrEqual(18 - 1e-9); // 50% of 36
    expect(run.stats.vents).toBe(vents); // a manual vent keeps the Feat's hold window
    expect(run.stats.ventNows).toBe(1);
  });

  it('lowering Volatility waits for the next vent or 30 s; raising is instant', () => {
    const run = D.defaultRun();
    run.volBought = 5;
    const { c } = core(run);
    c.setVol(5, 0);
    expect(run.vol).toBe(5);
    c.setVol(2, 1000);
    expect(run.vol).toBe(5);
    expect(c.volTarget).toBe(2);
    c.update(1 / 60, 20_000);
    expect(run.vol).toBe(5);
    c.update(1 / 60, 31_500);
    expect(run.vol).toBe(2);
    c.setVol(1, 40_000);
    c.vent();
    expect(run.vol).toBe(1);
    c.setVol(0, 50_000);
    c.setVol(3, 50_001); // raising cancels the pending lower
    expect(run.vol).toBe(3);
    expect(run.volPending).toBe(-1);
  });

  it('old saves load: missing fields fill in and the saved flask (with specials) restores', () => {
    const run = D.defaultRun() as any;
    delete run.catT;
    delete run.volPending;
    delete run.volPendAt;
    delete run.stats.catalysts;
    run.flask = [3, 0, 200, D.HEX, 10, 200, D.CATALYST, -10, 200, 99, 0, 100];
    const { c } = core(run);
    expect(run.catT).toBe(0);
    expect(run.volPending).toBe(-1);
    expect(run.stats.catalysts).toBe(0);
    expect(c.flask.orbs.map((o) => o.tier)).toEqual([3, D.HEX, D.CATALYST, 11]);
  });
});

describe('spire advancement hooks', () => {
  it('Steward candidates: idle nodes only; buy() only raises the level', () => {
    const s = mkSave();
    const r = s.run as D.SpireRun;
    r.ceiling = 7;
    r.lv.hire = 1;
    const list = spire.stewardCandidates!(s);
    const ids = list.map((x) => x.id);
    expect(ids).toContain('diligence');
    for (const bad of ['volatility', 'tremor', 'quick', 'settle', 'mirror', 'hunger', 'wider', 'valve']) expect(ids).not.toContain(bad);
    for (const x of list) expect(x.deltaIdle).toBeGreaterThan(0);
    const bank = r.bank;
    list.find((x) => x.id === 'diligence')!.buy();
    expect(r.lv.diligence).toBe(1);
    expect(r.bank).toBe(bank);
  });

  it('Ready buys: Arcana nodes and the next Volatility level, cheapest first, no Tomes', () => {
    const s = mkSave();
    const list = spire.readyBuys!(s);
    expect(list.length).toBeGreaterThan(5);
    expect(list.some((x) => x.label.startsWith('Volatility'))).toBe(true);
    expect(list.some((x) => x.label.includes('Tome'))).toBe(false);
    for (let i = 1; i < list.length; i++) expect(list[i].cost).toBeGreaterThanOrEqual(list[i - 1].cost);
  });

  it('Head Start and the Seeded Flask signature are idempotent', () => {
    const s = mkSave();
    const r = s.run as D.SpireRun;
    spire.applyHeadStart!(s, 2);
    spire.applyHeadStart!(s, 2);
    expect(r.volBought).toBe(4);
    expect(r.lv.hire).toBe(3);
    spire.applyHeadStart!(s, 5);
    expect(r.volBought).toBe(10);
    expect(r.lv.hire).toBe(4);
    spire.signature!.apply(s);
    spire.signature!.apply(s);
    expect(r.lv.wider).toBe(1);
    expect(r.lv.coil).toBe(2);
    r.lv.coil = 5;
    spire.signature!.apply(s);
    expect(r.lv.coil).toBe(5);
    expect(s.persistent).toEqual(D.defaultPersistent());
  });

  it('manager lines stay <= 32 characters, and each 04 §18 trigger has 2+ variants', () => {
    const longest = Math.max(...D.TIERS.map((t) => t.name.length));
    const lines = spire.manager.lines;
    for (const [key, list] of Object.entries(lines)) {
      for (const l of list) {
        const text = l.replace(/%name%/g, 'X'.repeat(longest)).replace(/%good%/g, 'ESSENCE');
        expect(text.length, `${key}: ${text}`).toBeLessThanOrEqual(32);
      }
    }
    for (const k of ['firstWider', 'firstHelper', 'tierNew', 'voidStar', 'singularity', 'dialRaised', 'hazardFirst', 'struggle', 'infamy50', 'legend', 'returnFall', 'goodsLink', 'report', 'ambient']) {
      expect(lines[k]?.length ?? 0, k).toBeGreaterThanOrEqual(2);
    }
    const beats = [...spire.onboarding, ...Object.values(spire.lessons ?? {}).flat()];
    for (const b of beats) expect(b.line.length, b.line).toBeLessThanOrEqual(32);
    // First purchase by beat 3 (00 §5.4.2).
    expect(spire.onboarding.findIndex((b) => b.id === 'upgrade')).toBeLessThanOrEqual(2);
  });
});
