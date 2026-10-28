// War Pit engine contract (specs/07 §14.2) and economy sanity.
import { describe, expect, it } from 'vitest';
import { battle, battleSeed, type Fighter } from '../src/depts/pit/engine';
import { buy, fight, newRun, prepareLine, rival, sell, type RunOpts } from '../src/depts/pit/run';
import { botRun } from '../src/depts/pit/bot';
import { mulberry32 } from '../src/depts/pit/engine';
import { BASE_POOL } from '../src/depts/pit/units';
import { defaultPersistent, defaultRun, gauntletReport, heldCrownLevel, PIT_CROWNS, pitEcon } from '../src/depts/pit/def';
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

  it('Pit Crowns: PIT_CROWNS Triumphs at Stakes >= S hold level S', () => {
    // PIT_CROWNS is 1 (07 OQ 8's fallback, sim/README.md "Pass 5"): the best Crown holds its level.
    expect(PIT_CROWNS).toBe(1);
    expect(heldCrownLevel({})).toBe(-1);
    expect(heldCrownLevel({ 4: 1 })).toBe(4);
    expect(heldCrownLevel({ 4: 1, 6: 1 })).toBe(6);
    expect(heldCrownLevel({ 6: 2, 2: 5 })).toBe(6);
    expect(heldCrownLevel({ 4: 0 })).toBe(-1);
    expect(pitEcon.skillTarget(0)).toBe(4);
    expect(pitEcon.skillTarget(3)).toBe(8); // +1.5 per Fall, rounded down (sim-tuned, pass 6)
    expect(pitEcon.skillTarget(5)).toBe(11); // cap 20 with the cards 12/15/18 (07 §7)
    expect(pitEcon.skillTarget(12)).toBe(20);
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

// ---------- revision: tactics cards 12/15/18, scars, advancement hooks ----------
import { huntmaster, newPet, stakesStat, tacticsFor, PARAMS_VERSION, scarMult } from '../src/depts/pit/run';
import { applyHeadStart, buySkin, oldGuard, readyBuys, skinOf, stewardCandidates, TACTICS, normalize } from '../src/depts/pit/def';

const mkSave = (run = defaultRun(), per = defaultPersistent(), n = 0) => ({ cycle: { n }, imports: {}, run, persistent: per, seen: {} }) as unknown as DeptSave;

describe('war pit later cards and params pinning', () => {
  it('ships six tactics cards and pins old paused Runs to their rules', () => {
    expect(TACTICS.map((t) => t.at)).toEqual([3, 6, 9, 12, 15, 18]);
    expect(PARAMS_VERSION).toBeGreaterThanOrEqual(3);
    // A version-2 Run keeps x1.1 per level and never sees cards above 11.
    expect(stakesStat(14, 2)).toBeCloseTo(1.1 ** 14, 9);
    expect(stakesStat(14)).toBeLessThan(1.1 ** 14);
    expect(stakesStat(8)).toBeCloseTo(1.1 ** 8, 9);
    expect(tacticsFor(18, 2)).toBe(11);
    expect(tacticsFor(18)).toBe(18);
    expect(JSON.stringify(rival(6, 14, 7, 2).line)).not.toBe(JSON.stringify(rival(6, 14, 7).line));
  });

  it('War Drums, Marked Prey and the Oath change battles at their levels', () => {
    const riv = rival(6, 0, 3).line;
    const seed = 5;
    const drums = battle(teamA, riv, { seed, tactics: 12, log: true });
    const start = drums.frames.find((f) => f.e === 'start')!;
    const base = battle(teamA, riv, { seed, tactics: 11, log: true }).frames.find((f) => f.e === 'start')!;
    expect(start.lines[1].reduce((a, u) => a + u.a, 0)).toBe(base.lines[1].reduce((a, u) => a + u.a, 0) + riv.length);
    // Marked Prey: the marked (first-bought) unit takes 3 before anything else.
    const marked = teamA.map((f, i) => ({ ...f, marked: i === 2 }));
    const mp = battle(marked, riv, { seed, tactics: 15, log: true });
    const trig = mp.frames.find((f) => f.e === 'trig')!;
    expect(trig.lines[0][2].h).toBe(teamA[2].hp - 3);
    // Huntmaster's Oath: he gets up once.
    const hm = huntmaster(8, 18, 11);
    const weak: Fighter[] = [{ kind: 'gargoyle', lvl: 3, atk: 60, hp: 400 }];
    const a = battle(weak, hm.line, { seed: 1, tactics: 18 });
    const b = battle(weak, hm.line, { seed: 1, tactics: 17 });
    expect(a.exchanges).toBeGreaterThan(b.exchanges);
  });

  it('scars weaken the Huntmaster party, capped', () => {
    const a = huntmaster(8, 10, 4, PARAMS_VERSION, 0).line;
    const b = huntmaster(8, 10, 4, PARAMS_VERSION, 3).line;
    const sum = (l: Fighter[]) => l.reduce((x, f) => x + f.atk + f.hp, 0);
    expect(sum(b)).toBeLessThan(sum(a));
    expect(scarMult(9)).toBe(scarMult(3));
    // Version 2 ignores scars.
    expect(JSON.stringify(huntmaster(8, 10, 4, 2, 3).line)).toBe(JSON.stringify(huntmaster(8, 10, 4, 2, 0).line));
  });
});

describe('war pit advancement hooks', () => {
  it('Head Start is idempotent and only touches the run', () => {
    const save = mkSave();
    applyHeadStart(save, 2);
    const once = JSON.stringify(save);
    applyHeadStart(save, 2);
    expect(JSON.stringify(save)).toBe(once);
    const r = save.run as ReturnType<typeof defaultRun>;
    expect(r.stakesBought).toBe(4);
    expect(r.lv.drill).toBe(3);
    expect(r.stakes).toBe(0);
    expect(JSON.stringify(save.persistent)).toBe(JSON.stringify(defaultPersistent()));
  });

  it('Old Guard brings the last stationed warband back after a Fall, once per cycle start', () => {
    const per = defaultPersistent();
    per.guard = prepareStrong();
    const save = mkSave(defaultRun(), per);
    oldGuard.apply(save);
    const r = save.run as ReturnType<typeof defaultRun>;
    expect(r.garrison.map((p) => p.k)).toEqual(prepareStrong().map((p) => p.k));
    oldGuard.apply(save);
    expect(r.garrison.length).toBe(5);
    // Mid-cycle (already stationed): no change.
    r.stats.stations = 1;
    r.garrison = [newPet('rat')];
    oldGuard.apply(save);
    expect(r.garrison.length).toBe(1);
  });

  it('Steward candidates exclude the dial and buy() only raises a level', () => {
    const run = defaultRun();
    run.bank = 1e9;
    const save = mkSave(run);
    const cands = stewardCandidates(save);
    expect(cands.some((c) => c.id === 'stakes' || c.id === 'showman' || c.id === 'grit')).toBe(false);
    const pace = cands.find((c) => c.id === 'pace')!;
    expect(pace.deltaIdle).toBeGreaterThan(0);
    pace.buy();
    expect(run.lv.pace).toBe(1);
    expect(run.bank).toBe(1e9);
    expect(readyBuys(save).length).toBeGreaterThan(0);
    expect(readyBuys(save).some((b) => b.label.startsWith('Stakes'))).toBe(true);
  });

  it('skins cost Crests and old saves normalize', () => {
    const per = defaultPersistent();
    const run = defaultRun();
    delete (per as Partial<typeof per>).skins;
    delete (per as Partial<typeof per>).log;
    normalize(run, per);
    per.crests = 4;
    expect(buySkin(per, 'wolf', 2)).toBe(true);
    expect(skinOf(per, 'wolf')).toBe(2);
    expect(buySkin(per, 'wolf', 3)).toBe(false); // 1 Crest left
    expect(per.crests).toBe(1);
  });
});

// ---------- wave 1: record-scaled rivals, hunts, banked Chow, the Encore, recap tallies ----------
import { BANK_MAX, ENCORE_MAX, GAUNTLET_PV, encoreCashOut, encoreFight, encoreOpen, huntOf, nextRival, rivalAhead, toughRound } from '../src/depts/pit/run';
import { hashStr } from '../src/depts/pit/engine';
import { HUNT_LIST, comboWith } from '../src/depts/pit/units';

describe('war pit wave 1', () => {
  it('rivals follow the record (version 4) and a paused version-3 Run keeps round-scaled rivals', () => {
    expect(PARAMS_VERSION).toBe(4);
    expect(GAUNTLET_PV).toBe(3);
    expect(rivalAhead({ wins: 0, losses: 0, pv: 4 })).toBe(0);
    expect(rivalAhead({ wins: 6, losses: 0, pv: 4 })).toBeGreaterThan(0);
    expect(rivalAhead({ wins: 6, losses: 0, pv: 3 })).toBe(0);
    const rs = newRun(77, 2, OPTS);
    rs.round = 6;
    rs.wins = 5;
    const strong = nextRival(rs);
    const old = { ...rs, pv: 3 };
    expect(JSON.stringify(nextRival(old).line)).toBe(JSON.stringify(rival(6, 2, hashStr('run', 77), 3).line));
    rs.wins = 0;
    rs.losses = 5;
    const weak = nextRival(rs);
    const sum = (l: Fighter[]) => l.reduce((x, f) => x + f.atk + f.hp, 0);
    expect(sum(strong.line)).toBeGreaterThanOrEqual(sum(weak.line));
    const t = toughRound(rs);
    expect(t).toBeGreaterThanOrEqual(3);
    expect(t).toBeLessThanOrEqual(6);
  });

  it('the Huntmaster rotates hunts and re-rolls on retry; version 3 keeps the classic net', () => {
    const hunts = new Set<string>();
    for (let tries = 0; tries < 12; tries++) hunts.add(huntOf(5, tries));
    expect(hunts.size).toBeGreaterThan(2);
    expect(huntOf(5, 3, 3)).toBe('net');
    const a = huntmaster(8, 4, 9, 4, 0, 0);
    const b = huntmaster(8, 4, 9, 4, 0, 1);
    expect(JSON.stringify(a.line)).not.toBe(JSON.stringify(b.line));
    expect(a.line[a.line.length - 1].hunt).toBe(huntOf(9, 0));
    expect(huntmaster(8, 4, 9, 3).line.some((f) => f.hunt)).toBe(false);
    expect(HUNT_LIST.length).toBeGreaterThanOrEqual(4);
  });

  it('hunts do what they say', () => {
    const boss = (hunt: (typeof HUNT_LIST)[number]): Fighter[] => [{ kind: 'hunt', lvl: 1, atk: 10, hp: 50, armor: 2, hunt }];
    const mine: Fighter[] = [{ kind: 'gargoyle', lvl: 1, atk: 1, hp: 20 }, { kind: 'rat', lvl: 1, atk: 1, hp: 5 }, { kind: 'stirge', lvl: 1, atk: 1, hp: 5 }];
    const startFrame = (h: (typeof HUNT_LIST)[number]) => {
      const r = battle(mine, boss(h), { seed: 3, log: true });
      return r.frames.filter((f) => f.e === 'trig')[0].lines[0];
    };
    expect(startFrame('trap')[0].h).toBe(20 - 3); // 4 minus the Gargoyle's hide
    const v = startFrame('volley');
    expect([v[1].h, v[2].h]).toEqual([3, 3]);
    // Muzzler: the Stirge's Start never fires (no damage on the Huntmaster before the strikes).
    const m = battle(mine, boss('muzzle'), { seed: 3, log: true });
    const firstHit = m.frames.findIndex((f) => f.e === 'hit');
    expect(m.frames.slice(0, firstHit).every((f) => f.lines[1][0].h === 50)).toBe(true);
  });

  it('recap tallies only with a log, and never change the outcome', () => {
    const riv = rival(7, 3, 12345).line;
    const seed = battleSeed(teamA, riv, 7, 4);
    const a = battle(teamA, riv, { seed, tactics: 3, log: true });
    const b = battle(teamA, riv, { seed, tactics: 3 });
    expect(b.stats).toBeUndefined();
    expect(a.outcome).toBe(b.outcome);
    expect(a.exchanges).toBe(b.exchanges);
    expect(a.stats!.some((t) => t.side === 0 && t.dmg > 0)).toBe(true);
  });

  it('unspent Chow is banked into the next round (version 4)', () => {
    const rs = newRun(11, 0, OPTS);
    rs.line[0] = newPet('gargoyle');
    rs.line[0]!.a = 30;
    rs.line[0]!.h = 60;
    rs.chow = 7;
    fight(rs, false);
    expect(rs.bankC).toBe(BANK_MAX);
    expect(rs.chow).toBe(10 + BANK_MAX);
  });

  it('the Encore opens after a Triumph, grows a pot and loses it on a loss', () => {
    const rs = newRun(13, 0, OPTS);
    rs.ended = 'triumph';
    rs.line[0] = { k: 'gargoyle', a: 400, h: 900, xp: 5, it: null };
    expect(encoreOpen(rs)).toBe(true);
    const w = encoreFight(rs, false)!;
    expect(w.won).toBe(true);
    expect(rs.encore!.pot).toBeGreaterThan(0);
    rs.line[0] = { k: 'rat', a: 1, h: 1, xp: 0, it: null };
    const l = encoreFight(rs, false)!;
    expect(l.won).toBe(false);
    expect(rs.encore!.pot).toBe(0);
    expect(encoreOpen(rs)).toBe(false);
    expect(encoreCashOut(rs)).toBe(0);
    expect(ENCORE_MAX).toBeGreaterThan(1);
  });

  it('shop combos read the line', () => {
    expect(comboWith('crow', ['rat'])).toMatch(/RAT/);
    expect(comboWith('crow', ['boar'])).toBeNull();
    expect(comboWith('wolf', ['boar'])).toMatch(/BOAR/);
  });
});

describe('war pit wave 1 hooks', () => {
  it('nextGoal and Night Orders', () => {
    const run = defaultRun();
    const save = mkSave(run);
    const g = pitEcon.nextGoal!(save)!;
    expect(g.label).toMatch(/STAKES 1/);
    expect(g.progress).toBeGreaterThanOrEqual(0);
    expect(g.progress).toBeLessThanOrEqual(1);
    run.cur = newRun(1, 0, OPTS);
    run.cur.wins = 3;
    expect(pitEcon.nextGoal!(save)!.label).toBe('BEAT THE HUNTMASTER');
    const orders = pitEcon.nightOrders!(save);
    expect(orders.length).toBe(2);
    for (const o of orders) {
      expect(o.label.length).toBeLessThanOrEqual(15);
      expect(o.desc.length).toBeLessThanOrEqual(34);
    }
    expect(pitEcon.applyNightOrder!(save, 'scout', 3600, 0.75)).toMatch(/SCOUTED/);
    expect((save.run as ReturnType<typeof defaultRun>).scouted).toBe(true);
    expect(pitEcon.applyNightOrder!(save, 'skirmish', 3600, 0.75)).toMatch(/GAUNTLETS/);
  });
});
