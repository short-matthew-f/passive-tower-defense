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

  it('Catalysts are earned by x4 chains on a recharge, never dealt by the bag (R9)', () => {
    expect(D.catalystEveryL(0)).toBe(36);
    expect(D.catalystEveryL(7)).toBe(12);
    const { c } = core();
    let seen = 0;
    for (let i = 0; i < 130; i++) {
      if (c.current === D.CATALYST) seen++;
      c.flask.clear();
      c.cool = 0;
      c.drop(0);
    }
    expect(seen).toBe(0);
    // A three-step cascade (x4) once the recharge is full puts one next in line.
    c.run.catT = 40;
    c.flask.clear();
    c.depth = 2; // two merges into a cascade already
    c.sinceMerge = 0;
    c.flask.add(1, -5, 150);
    c.flask.add(1, 5, 150);
    settle(c, 0.5);
    expect(c.run.stats.bestChain).toBe(3);
    expect(c.run.queue[1]).toBe(D.CATALYST);
    expect(c.run.catT).toBe(0);
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
    expect(r.lv.richer).toBe(1);
    expect(r.lv.coil).toBe(2);
    r.lv.coil = 5;
    spire.signature!.apply(s);
    expect(r.lv.coil).toBe(5);
    expect(s.persistent).toEqual(D.defaultPersistent());
    expect(r.lv.wider).toBeUndefined();
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

// ---------- Wave 1: the geometry re-cut, chains, flask scores and the apprentices' study ----------

describe('spire wave 1', () => {
  it('the box is tight and late tiers really grow: a 1.3-1.8 area step all the way up', () => {
    expect(D.FLASK_H).toBe(160);
    for (let t = 2; t <= D.MAX_TIER; t++) {
      const ratio = (D.TIERS[t].r / D.TIERS[t - 1].r) ** 2;
      expect(ratio, `T${t}`).toBeGreaterThan(1.3);
      expect(ratio, `T${t}`).toBeLessThan(1.8);
    }
    // The biggest spawn (T4) is ~18% of the width; a Void Star is over half of it.
    expect((2 * D.TIERS[4].r) / D.BASE_FLASK_W).toBeGreaterThan(0.17);
    expect((2 * D.TIERS[D.MAX_TIER].r) / D.BASE_FLASK_W).toBeGreaterThan(0.6);
  });

  it('Wider Flask and Taller Neck are gone; an old save gets their Arcana back and keeps a repacked flask', () => {
    expect(D.UPGRADES.some((u) => u.id === 'wider' || u.id === 'neck')).toBe(false);
    const run = D.defaultRun() as any;
    delete run.geo;
    run.bank = 100;
    run.lv = { wider: 2, neck: 1, potent: 0 };
    // Twenty Soulfires stacked in the old 216 px flask: more than 40% of the new one.
    run.flask = [];
    for (let i = 0; i < 20; i++) run.flask.push(7, (i % 3) * 30 - 30, 200 - Math.floor(i / 3) * 30);
    const { c } = core(run);
    expect(run.lv.wider).toBeUndefined();
    expect(run.lv.neck).toBeUndefined();
    expect(run.geo).toBe(D.GEO_V);
    const kept = c.flask.count;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(20);
    // 1,000 + 3,000 (Wider 1-2) + 1,500 (Neck 1) + 1,000 per Soulfire paid out.
    expect(run.bank).toBe(100 + 1000 + 3000 + 1500 + 1000 * (20 - kept));
    // Idempotent: a second load changes nothing.
    D.normalize(run, D.defaultPersistent());
    expect(run.bank).toBe(100 + 5500 + 1000 * (20 - kept));
    for (const o of c.flask.orbs) expect(o.y).toBeLessThanOrEqual(D.FLASK_H);
  });

  it('chains pay geometrically: x1, x2, x4, x6 ... up to the Resonant Glass cap (R5)', () => {
    expect([1, 2, 3, 4, 5].map((d) => D.chainMultL(d, 99))).toEqual([1, 2, 4, 6, 8]);
    expect(D.chainMultL(9, D.resCapL(0))).toBe(D.resCapL(0));
    expect(D.resCapL(10)).toBeGreaterThan(D.resCapL(0));
  });

  it('a real overflow ends the flask: its score is studied and sets the BEST', () => {
    const run = D.defaultRun();
    let ended: [number, number] | null = null;
    const c = new SpireCore(run, D.defaultPersistent(), { earn: (b) => b, raiseSkill: () => {}, flaskEnd: (s, p) => (ended = [s, p]) }, 5);
    c.flask.add(3, -8, 150);
    c.flask.add(3, 8, 150);
    settle(c, 1);
    expect(run.flaskScore).toBe(36);
    c.vent();
    expect(ended).toEqual([36, 0]);
    expect(run.flaskBest).toBe(36);
    expect(run.recent).toEqual([36]);
    expect(run.flaskScore).toBe(0);
    // A Vent Now (manual) never ends the flask.
    run.lv.settle = 1;
    c.flask.add(4, 0, 5);
    run.flaskScore = 10;
    c.lock = 0;
    expect(c.ventNow()).toBe(true);
    expect(run.flaskScore).toBe(10);
    expect(run.recent).toEqual([36]);
  });

  it('the first brim warning of a flask hands over one free Quicksilver (R9)', () => {
    const run = D.defaultRun();
    const kinds: string[] = [];
    const c = new SpireCore(run, D.defaultPersistent(), { earn: (b) => b, raiseSkill: () => {}, rescue: (k) => kinds.push(k) }, 5);
    // A pile of unmergeable heavy bodies up past the Brim Line.
    for (let row = 0; row < 8; row++) for (let i = 0; i < 4; i++) c.flask.add(D.LEGEND_BODY, -39 + i * 26 + (row % 2) * 4, D.FLASK_H - 13 - row * 24);
    for (let i = 0; i < 90 && !kinds.length; i++) settle(c, 1 / 6);
    expect(kinds).toEqual(['quick']);
    expect(c.current).toBe(D.QUICK);
    expect(run.qsGiven).toBe(true);
  });

  it('idle copies your best flask: pure, bounded, and higher for a better flask (R6)', () => {
    const run = D.defaultRun();
    const per = D.defaultPersistent();
    run.ceiling = 9;
    run.lv.hire = 2;
    const at = (score: number) => {
      run.recent = [score];
      return D.idleRateOf(run, per);
    };
    const none = at(0);
    expect(D.studyMultOf(run, per)).toBe(D.STUDY_LO);
    const typical = at(D.STUDY_REF * D.TIERS[9].value);
    const great = at(4 * D.STUDY_REF * D.TIERS[9].value);
    expect(typical / none).toBeCloseTo(1 / D.STUDY_LO, 5);
    expect(great / typical).toBeCloseTo(2, 5);
    expect(at(1e15) / typical).toBeCloseTo(D.STUDY_HI, 5);
    // Pure: same save, same answer; only the last STUDY_FLASKS flasks count.
    expect(at(12345)).toBe(at(12345));
    run.recent = [1e9, 1, 1, 1].slice(-D.STUDY_FLASKS);
    expect(D.studyScore(run)).toBe(1);
  });

  it('under real play the flask fills and vents (a sloppy random dropper, no upgrades)', () => {
    const run = D.defaultRun();
    const c = new SpireCore(run, D.defaultPersistent(), { earn: (b) => b, raiseSkill: () => {} }, 11);
    let x = 0;
    for (let i = 0; i < 400 && run.stats.vents === 0; i++) {
      x = (x * 1103515245 + 12345) % 2147483648;
      c.drop(((x / 2147483648) * 2 - 1) * 56);
      settle(c, 1.3);
    }
    expect(run.stats.vents).toBeGreaterThan(0);
    expect(run.stats.drops).toBeLessThan(400);
  });

  it('Next Goal and the Night Orders (HUNT PAGES banks hours toward Pages)', () => {
    const s = mkSave();
    const r = s.run as D.SpireRun;
    const p = s.persistent as D.SpirePersistent;
    expect(spire.nextGoal!(s)!.label).toBe('HIRE AN APPRENTICE');
    r.lv.hire = 1;
    r.flaskBest = 1000;
    r.flaskScore = 250;
    const g = spire.nextGoal!(s)!;
    expect(g.label).toBe('BEAT YOUR BEST FLASK');
    expect(g.progress).toBeCloseTo(0.25);
    const orders = spire.nightOrders!(s);
    expect(orders.length).toBe(2);
    for (const o of orders) {
      expect(o.label.length).toBeLessThanOrEqual(15);
      expect(o.desc.length).toBeLessThanOrEqual(34);
    }
    expect(spire.applyNightOrder!(s, 'distill', 3600, 1)).toBeUndefined();
    expect(spire.applyNightOrder!(s, 'pages', 6 * 3600, 1)).toBe('PAGE HUNT 60%');
    expect(spire.applyNightOrder!(s, 'pages', 15 * 3600, 1)).toBe('2 GRIMOIRE PAGES FOUND');
    expect(p.pages).toBe(2);
    expect(p.pageHunt).toBeCloseTo(1);
  });
});
