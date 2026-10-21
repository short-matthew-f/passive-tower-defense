// War Pit engine contract (specs/07 §14.2) and economy sanity.
import { describe, expect, it } from 'vitest';
import { battle, battleSeed, type Fighter } from '../src/depts/pit/engine';
import { buy, fight, newRun, prepareLine, rival, sell, type RunOpts } from '../src/depts/pit/run';
import { botRun } from '../src/depts/pit/bot';
import { mulberry32 } from '../src/depts/pit/engine';
import { BASE_POOL } from '../src/depts/pit/units';
import { defaultPersistent, defaultRun, gauntletReport, heldCrownLevel, pitEcon } from '../src/depts/pit/def';
import type { DeptSave } from '../src/core/types';

const OPTS: RunOpts = { pool: BASE_POOL, larder: 0, deepLarder: 0, penSpace: 0, freeRoll: false, gritMax: 4, hardy: 0, ratStart: false, chowR1: false, sigils: 0, shade: 0 };

const teamA: Fighter[] = [
  { kind: 'boar', lvl: 2, atk: 6, hp: 7 },
  { kind: 'rat', lvl: 1, atk: 2, hp: 1 },
  { kind: 'wolf', lvl: 1, atk: 3, hp: 3, item: 'collar' },
  { kind: 'stirge', lvl: 1, atk: 1, hp: 2 },
  { kind: 'manticore', lvl: 1, atk: 5, hp: 4, brand: true },
];

describe('war pit engine', () => {
  it('is deterministic: same seed and warbands give the same result and log', () => {
    const riv = rival(7, 3, 12345).line;
    const seed = battleSeed(teamA, riv, 7, 1);
    const a = battle(teamA, riv, { seed, tactics: 3, log: true });
    const b = battle(teamA.map((f) => ({ ...f })), riv.map((f) => ({ ...f })), { seed, tactics: 3, log: true });
    expect(a.outcome).toBe(b.outcome);
    expect(a.exchanges).toBe(b.exchanges);
    expect(JSON.stringify(a.frames)).toBe(JSON.stringify(b.frames));
    // Logging never changes the outcome.
    const c = battle(teamA, riv, { seed, tactics: 3 });
    expect(c.outcome).toBe(a.outcome);
    expect(c.exchanges).toBe(a.exchanges);
  });

  it('rivals are reproducible from their seed', () => {
    expect(JSON.stringify(rival(5, 2, 99))).toBe(JSON.stringify(rival(5, 2, 99)));
  });

  it('always ends (Sudden Death) and a mirror of tanks is a draw', () => {
    const wall: Fighter[] = [{ kind: 'gargoyle', lvl: 3, atk: 1, hp: 60 }];
    const r = battle(wall, wall.map((f) => ({ ...f })), { seed: 1 });
    expect(r.exchanges).toBeLessThan(200);
    expect(r.outcome).toBe(0);
  });

  it('a whole seeded Run replays identically', () => {
    const play = () => {
      const rs = newRun(42, 0, OPTS);
      const rep = botRun(rs, mulberry32(7));
      return JSON.stringify([rep.wins, rep.rounds, rep.ended, rep.teeth, rep.line]);
    };
    expect(play()).toBe(play());
  });

  it('battles are fast (well under 1 ms each)', () => {
    const riv = rival(10, 0, 5).line;
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) battle(teamA, riv, { seed: i });
    expect((performance.now() - t0) / 500).toBeLessThan(1);
  });
});

describe('war pit shop and economy', () => {
  it('buying a duplicate merges (+1/+1, XP) and selling refunds Chow', () => {
    const rs = newRun(3, 0, OPTS);
    rs.shop = [{ k: 'rat', a: 2, h: 1 }, { k: 'rat', a: 2, h: 1 }, { k: 'crow', a: 1, h: 3 }];
    expect(buy(rs, 0, 0).ok).toBe(true);
    const r = buy(rs, 0, 0);
    expect(r.merged).toBe(true);
    expect(rs.line[0]).toMatchObject({ k: 'rat', a: 3, h: 2, xp: 1 });
    expect(rs.chow).toBe(4);
    expect(sell(rs, 0)).toBe(1);
    expect(rs.chow).toBe(5);
  });

  it('round 1-2 losses cost no Grit', () => {
    const rs = newRun(9, 0, OPTS);
    const out = fight(rs, false); // empty line -> loss
    expect(out.outcome).toBe(-1);
    expect(rs.grit).toBe(4);
  });

  it('Pit Crowns: 2 Triumphs at Stakes >= S hold level S', () => {
    expect(heldCrownLevel({})).toBe(-1);
    expect(heldCrownLevel({ 4: 1 })).toBe(-1);
    expect(heldCrownLevel({ 4: 1, 6: 1 })).toBe(4);
    expect(heldCrownLevel({ 6: 2, 2: 5 })).toBe(6);
    expect(pitEcon.skillTarget(0)).toBe(4);
    expect(pitEcon.skillTarget(5)).toBe(10);
  });

  it('idleRate is positive for the starter garrison, memoized, and grows with a stronger warband', () => {
    const save = { cycle: { n: 0 }, imports: {}, run: defaultRun(), persistent: defaultPersistent() } as unknown as DeptSave;
    const base = pitEcon.idleRate(save);
    expect(base).toBeGreaterThan(0);
    expect(gauntletReport(save)).toBe(gauntletReport(save));
    const strong = { ...save, run: { ...defaultRun(), garrison: prepareStrong() } } as unknown as DeptSave;
    expect(pitEcon.idleRate(strong)).toBeGreaterThan(base);
  });
});

function prepareStrong() {
  return [
    { k: 'boar' as const, a: 8, h: 8, xp: 2, it: null },
    { k: 'spider' as const, a: 4, h: 4, xp: 2, it: null },
    { k: 'wolf' as const, a: 5, h: 5, xp: 2, it: null },
    { k: 'manticore' as const, a: 6, h: 5, xp: 1, it: null },
    { k: 'stirge' as const, a: 3, h: 4, xp: 2, it: null },
  ];
}
void prepareLine;
