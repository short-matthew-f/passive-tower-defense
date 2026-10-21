// Regression tests for the department gameplay QA findings (D-*) and the department side of the
// perf findings (P-03 / P-04): each pins the rule the fix put in place.
import { describe, expect, it } from 'vitest';
import * as SM from '../src/depts/styx/model';
import { styxEcon } from '../src/depts/styx/def';
import * as SD from '../src/depts/spire/def';
import { SpireCore } from '../src/depts/spire/logic';
import * as CE from '../src/depts/cauldron/econ';
import { minesEcon } from '../src/depts/mines/def';
import * as MM from '../src/depts/mines/model';
import { LONG_MAX } from '../src/core/longnode';
import * as DM from '../src/depts/dungeon/model';
import { idleOf, pumpIdle, setIdleAsync } from '../src/depts/dungeon/sim';

const save = (run: any, persistent: any = {}, n = 3) => ({ run, persistent, imports: {}, cycle: { n }, seen: {}, lifetime: { peakRank: 0, falls: n, best: {} } }) as any;

describe('River Styx bait (D-styx-01, D-styx-02)', () => {
  const deepRun = () => {
    const r: any = SM.defaultRun();
    Object.assign(r, { bands: 5, wrath: 10, wrathMax: 10 });
    Object.assign(r.lv, { netter: 20, nets: 40, poles: 4, chum: 3 });
    return r;
  };

  it('a single bait no longer gives the netters a lasting boost', () => {
    const r = deepRun();
    const p: any = SM.defaultPersistent();
    const worm = SM.idleObols(r, p);
    p.baits.gilded = 1;
    r.bait = 'gilded';
    expect(SM.idleObols(r, p) / worm).toBeLessThan(1.01);
    p.baits.gilded = SM.BAIT_CAP.gilded;
    expect(SM.idleObols(r, p) / worm).toBeGreaterThan(1.7);
  });

  it('the Chum Barrel uses its bait up, and falls back to the worm when it is gone', () => {
    const r = deepRun();
    const p: any = SM.defaultPersistent();
    p.baits.gilded = SM.BAIT_CAP.gilded;
    r.bait = 'gilded';
    SM.settleChum(r, p, 600);
    expect(p.baits.gilded).toBeLessThan(SM.BAIT_CAP.gilded);
    SM.settleChum(r, p, 48 * 3600);
    expect(p.baits.gilded).toBe(0);
    expect(r.bait).toBe('worm');
  });

  it('settles an absence (and the time off screen before it) through onOffline', () => {
    const r = deepRun();
    const p: any = SM.defaultPersistent();
    p.baits.gilded = 200;
    r.bait = 'gilded';
    r.chumAt = 1_000_000;
    styxEcon.onOffline!(save(r, p), 3600, 0.5, { now: 1_000_000 + 4_200_000, capSeconds: 8 * 3600 });
    expect(p.baits.gilded).toBeLessThan(200);
    expect(r.chumAt).toBe(1_000_000 + 4_200_000);
  });

  it('bait prices follow the deepest band and stock is capped (old saves clamped)', () => {
    expect(SM.baitCost('gilded', 0, 5)).toBeGreaterThan(30 * SM.baitCost('gilded', 0, 1));
    const p: any = { baits: { gilded: 1e7 } };
    SM.normalize(SM.defaultRun(), p);
    expect(p.baits.gilded).toBe(SM.BAIT_CAP.gilded);
  });
});

describe('Spire idle Volatility (D-spire-01)', () => {
  const mk = () => {
    const r: any = SD.defaultRun();
    r.lv = { hire: 3 };
    r.ceiling = 7;
    r.volBought = 10;
    const core = new SpireCore(r, SD.defaultPersistent() as any, { earn: (b) => b, raiseSkill() {} }, 1);
    return { r, core };
  };

  it('wall-clock time away does not raise vIdle', () => {
    const { r, core } = mk();
    core.setVol(10, 0);
    core.update(1 / 60, 10 * 60_000 + 1);
    expect(r.vIdle).toBe(0);
  });

  it('ten minutes of active play at the setting do', () => {
    const { r, core } = mk();
    core.setVol(6, 0);
    let t = 0;
    for (let i = 0; i < 60 * 60 * 9; i++) {
      core.noteInput();
      core.update(1 / 60, (t += 16));
    }
    expect(r.vIdle).toBe(0);
    for (let i = 0; i < 60 * 70; i++) {
      core.noteInput();
      core.update(1 / 60, (t += 16));
    }
    expect(r.vIdle).toBe(6);
  });
});

describe('Cauldron layouts (D-cauldron-01)', () => {
  const mk = (layout?: any, tiers?: number[], malice = 0) => {
    const r: any = CE.defaultRun();
    r.lv = { fresh: 20, pot: 20, jackpot: 4, gold: 2, hire: 5, bribes: 10 };
    r.maliceBought = 10;
    r.malice = malice;
    if (layout) r.layout = layout;
    if (tiers) r.tiers = tiers;
    return r;
  };

  it('every layout idles within 10% of Classic at Malice 0 / 5 / 10, and shifts never beat it', () => {
    for (const m of [0, 5, 10]) {
      const classic = CE.idleRateOf(mk(undefined, undefined, m));
      for (const l of ['funnel', 'hex', 'spiral']) expect(Math.abs(CE.idleRateOf(mk(l, undefined, m)) / classic - 1)).toBeLessThan(0.1);
      expect(CE.idleRateOf(mk('spiral', [2, 3, 3, 2, 4, 1, 0, 1, 2], m)) / classic).toBeLessThan(1.01);
    }
  });
});

describe('EV caches off the critical path (D-cauldron-02, D-dungeon-02, P-03, P-04)', () => {
  it('a cold Cauldron board answers at once and lands through the pump', () => {
    CE.setEvAsync(true);
    try {
      const r: any = CE.defaultRun();
      r.lv = { fresh: 20, taught: 3, gold: 3, row: 1, thorn: 2, splitroot: 1 };
      r.maliceBought = 10;
      r.malice = 9;
      r.layout = 'hex';
      const t = performance.now();
      const v = CE.idleRateOf(r);
      expect(performance.now() - t).toBeLessThan(150);
      expect(v).toBeGreaterThan(0);
      for (let i = 0; i < 2000 && !CE.pumpEv(50); i++);
      expect(CE.evPending()).toBe(0);
      expect(CE.idleRateOf(r)).toBeGreaterThan(0);
    } finally {
      CE.setEvAsync(false);
    }
  });

  it('a Dungeon memo miss answers with the last known result and lands through the pump', () => {
    setIdleAsync(true);
    try {
      const r: any = DM.defaultRun();
      const v0 = idleOf(r); // first ever call: computed at once
      r.lure = 3;
      r.lureMax = 3;
      r.rev++;
      const t = performance.now();
      expect(idleOf(r)).toEqual(v0);
      expect(performance.now() - t).toBeLessThan(10);
      for (let i = 0; i < 2000 && !pumpIdle(50); i++);
      expect(idleOf(r).tier).toBeGreaterThanOrEqual(0);
      expect(r.idleMemo?.key).toContain('|3');
    } finally {
      setIdleAsync(false);
    }
  });
});

describe('Mines Richer Seams cap (D-mines-01)', () => {
  it('drops out of the Steward and Ready lists at LONG_MAX', () => {
    const r: any = MM.defaultRun();
    r.seams = LONG_MAX;
    r.bank = 1e300;
    const s = save(r, MM.defaultPersistent(), 5);
    expect(minesEcon.stewardCandidates!(s).some((c) => c.id === 'seams')).toBe(false);
    r.seams = LONG_MAX - 1;
    const c = minesEcon.stewardCandidates!(s).find((x) => x.id === 'seams');
    expect(c).toBeTruthy();
    c!.buy();
    c!.buy();
    expect(r.seams).toBe(LONG_MAX);
  });
});
