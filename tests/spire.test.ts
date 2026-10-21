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
