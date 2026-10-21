import { describe, expect, it } from 'vitest';
import { dreadPayout, offlineFactor, tempMult, tributeRate } from '../src/core/economy';
import { roadsMult } from '../src/core/goods';
import {
  activeEdict,
  CARAVAN_ID,
  econGateMult,
  EDICT_SWITCH_MS,
  edictCooldown,
  legendsBaneId,
  rankStewardCandidates,
  ritualBonus,
  rushSeconds,
  setEdict,
  stewardShare,
  stewardSpend,
  SWIFT_REBUILD_ID,
  trophyAdd,
  type StewardCandidate,
} from '../src/core/perks';
import {
  ambientDue,
  bubbleSeconds,
  chattinessAllows,
  classify,
  enqueue,
  expireQueue,
  maySpeak,
  recordRepeat,
  repeatAllows,
  TRIGGER_RULES,
  type QueuedLine,
  type SpeakClock,
} from '../src/core/director';
import { migrate } from '../src/core/save';
import { newSave, type DeptSave } from '../src/core/types';
import type { DeptEcon } from '../src/core/dept';

function dept(n = 0, falls = 0): DeptSave {
  return {
    v: 1,
    unlockedAt: 0,
    cycle: { n, startedAt: 0, earnings: 0, heldLevel: 0, legendWaiting: false },
    lifetime: { peakRank: 0, falls, best: {} },
    imports: {},
    persistent: {},
    run: { bank: 0 },
    seen: {},
    pendingTips: [],
  };
}

const econ = { idleRate: () => 0, rankRef: 1, rankTarget: 100 } as unknown as DeptEcon;
const defs = { cauldron: econ } as Record<string, DeptEcon>;

describe("Legend's Bane", () => {
  it('adds +10% Dread per level', () => {
    expect(dreadPayout(dept(), 100, 0, 0)).toBe(20);
    expect(dreadPayout(dept(), 100, 0, 5)).toBe(30);
    expect(dreadPayout(dept(), 200, 0.25, 2)).toBe(Math.floor(10 * 2 ** 1.5 * 2 * 1.2 * 1.25));
  });
});

describe('Trophy Hall', () => {
  it('needs the Hall, then +1% per Legend capped at +25%', () => {
    const s = newSave(0);
    for (let i = 0; i < 10; i++) s.meta.trophies.push({ dept: 'cauldron', name: 'x', at: 0 });
    expect(trophyAdd(s)).toBe(0);
    s.meta.throne.trophyHall = 1;
    expect(trophyAdd(s)).toBeCloseTo(0.1);
    for (let i = 0; i < 40; i++) s.meta.trophies.push({ dept: 'mines', name: 'y', at: 0 });
    expect(trophyAdd(s)).toBe(0.25);
  });
  it('feeds the Tribute group', () => {
    const s = newSave(0);
    s.depts.cauldron = dept();
    const base = tributeRate(s, 'cauldron', defs, false);
    s.meta.throne.trophyHall = 1;
    for (let i = 0; i < 30; i++) s.meta.trophies.push({ dept: 'cauldron', name: 'x', at: 0 });
    expect(tributeRate(s, 'cauldron', defs, false)).toBeCloseTo(base * 1.25);
  });
});

describe('Edicts', () => {
  it('need the board, switch hourly, and apply their effects', () => {
    const s = newSave(0);
    s.depts.cauldron = dept();
    expect(setEdict(s, 'darkTithe', undefined, 0)).toBe(false);
    s.meta.throne.edictBoard = 1;
    const base = tributeRate(s, 'cauldron', defs, false);
    expect(setEdict(s, 'darkTithe', undefined, 1000)).toBe(true);
    expect(tributeRate(s, 'cauldron', defs, false)).toBeCloseTo(base * 1.25);
    // Locked for an hour.
    expect(edictCooldown(s, 1000 + 60_000)).toBeGreaterThan(0);
    expect(setEdict(s, 'ironDiscipline', 'cauldron', 1000 + 60_000)).toBe(false);
    const later = 1000 + EDICT_SWITCH_MS;
    expect(setEdict(s, 'ironDiscipline', undefined, later)).toBe(false); // needs a target
    expect(setEdict(s, 'ironDiscipline', 'cauldron', later)).toBe(true);
    expect(tributeRate(s, 'cauldron', defs, false)).toBeCloseTo(base);
    expect(offlineFactor(s, 'cauldron')).toBeCloseTo(0.7);
    expect(offlineFactor(s, 'mines')).toBeCloseTo(0.6);
    expect(offlineFactor(s)).toBeCloseTo(0.6);
    // Still under the 0.9 cap.
    s.meta.dreadPerks['empire.idleHands'] = 6;
    expect(offlineFactor(s, 'cauldron')).toBe(0.9);
    expect(setEdict(s, 'fearItself', 'mines', later + EDICT_SWITCH_MS)).toBe(true);
    expect(econGateMult(s, 'mines')).toBe(1.25);
    expect(econGateMult(s, 'cauldron')).toBe(1);
    // Losing the board (old save edits) turns the Edict off.
    s.meta.throne.edictBoard = 0;
    expect(activeEdict(s)).toBeNull();
    expect(econGateMult(s, 'mines')).toBe(1);
  });
});

describe('Swift Rebuild and Goods Caravan', () => {
  it('extend Rebuild Rush by 15 min a level', () => {
    const s = newSave(0);
    const d = dept(1, 1);
    d.cycle.startedAt = 0;
    s.depts.cauldron = d;
    expect(rushSeconds(s)).toBe(1800);
    expect(tempMult(s, 'cauldron', defs, 40 * 60_000)).toBe(1);
    s.meta.dreadPerks[SWIFT_REBUILD_ID] = 1;
    expect(rushSeconds(s)).toBe(2700);
    expect(tempMult(s, 'cauldron', defs, 40 * 60_000)).toBe(3);
  });
  it('Caravan adds into the Roads group', () => {
    const s = newSave(0);
    s.meta.throne.imperialRoads = 2;
    s.meta.dreadPerks[CARAVAN_ID] = 3;
    expect(roadsMult(s)).toBeCloseTo(1.5);
  });
});

describe('Steward', () => {
  const cand = (id: string, cost: number, deltaIdle: number, log: string[]): StewardCandidate => ({ id, cost, deltaIdle, buy: () => log.push(id) });
  it('ranks by deltaIdle / cost and drops junk', () => {
    const r = rankStewardCandidates([cand('a', 100, 1, []), cand('b', 10, 1, []), cand('c', 0, 5, []), cand('d', 10, -1, [])]);
    expect(r.map((c) => c.id)).toEqual(['b', 'a']);
  });
  it('honours the allowance and the reserve floor', () => {
    const d = dept();
    d.run.bank = 1000;
    const log: string[] = [];
    let lv = 0;
    const list = () => [cand('cheap', 100 * 2 ** lv, 1, log), cand('dear', 900, 3, log)].map((c) => ({ ...c, buy: () => (c.id === 'cheap' ? lv++ : 0, log.push(c.id)) }));
    const r = stewardSpend(d, list, 350, 500);
    // 100 then 200 fit the 350 allowance; 400 does not.
    expect(log).toEqual(['cheap', 'cheap']);
    expect(r.spent).toBe(300);
    expect(d.run.bank).toBe(700);
    const r2 = stewardSpend(d, list, 10_000, 500);
    // 400 would leave 300 < the 500 floor.
    expect(r2.spent).toBe(0);
  });
  it('share is 0 / 25% / 50% by Satchel level', () => {
    const s = newSave(0);
    expect(stewardShare(s)).toBe(0);
    s.meta.throne.satchel = 1;
    expect(stewardShare(s)).toBe(0);
    s.meta.throne.satchel = 2;
    expect(stewardShare(s)).toBe(0.25);
    s.meta.throne.satchel = 3;
    expect(stewardShare(s)).toBe(0.5);
  });
});

describe('return rituals', () => {
  it('pay up to 5% of the haul', () => {
    expect(ritualBonus(1000, 1)).toBe(50);
    expect(ritualBonus(1000, 0.5)).toBe(25);
    expect(ritualBonus(1000, 7)).toBe(50);
    expect(ritualBonus(1000, NaN)).toBe(0);
    expect(ritualBonus(0, 1)).toBe(0);
  });
});

describe('ManagerDirector rules', () => {
  const clock = (over: Partial<SpeakClock> = {}): SpeakClock => ({
    now: 1_000_000,
    deptLast: 0,
    suiteLast: 0,
    ambientLast: 0,
    enteredAt: 0,
    intenseAt: -Infinity,
    ...over,
  });
  it('classifies typed, aliased and legacy calls', () => {
    expect(classify('x', { type: 'tier_reached' }).rule.priority).toBe('medium');
    expect(classify('legend').kind).toBe('legend_arrives');
    expect(classify('jackpot1', { milestone: true }).kind).toBe('legacy');
    expect(classify('batch').kind).toBe('flavor');
    // Aliases keep caller-side gating, except cooldown rules.
    expect(classify('dialRaised', { milestone: true }).enforceRepeat).toBe(false);
    expect(classify('struggle', { milestone: true }).enforceRepeat).toBe(true);
  });
  it('applies chattiness per the table', () => {
    expect(chattinessAllows(TRIGGER_RULES.ambient, 'full')).toBe(true);
    expect(chattinessAllows(TRIGGER_RULES.ambient, 'milestones')).toBe(false);
    expect(chattinessAllows(TRIGGER_RULES.tier_reached, 'milestones')).toBe(true);
    expect(chattinessAllows(TRIGGER_RULES.first_upgrade, 'milestones')).toBe(false);
    expect(chattinessAllows(TRIGGER_RULES.legend_arrives, 'off')).toBe(false);
    expect(chattinessAllows(TRIGGER_RULES.onboarding, 'off')).toBe(true);
  });
  it('enforces repeats: once per save, once per cycle, cooldowns', () => {
    const seen: Record<string, number> = {};
    const once = TRIGGER_RULES.hazard_first.repeat;
    expect(repeatAllows(once, 'hazard_first', 'vent', seen, 0, 0)).toBe(true);
    recordRepeat(once, 'hazard_first', 'vent', seen, 0, 0);
    expect(repeatAllows(once, 'hazard_first', 'vent', seen, 0, 0)).toBe(false);
    expect(repeatAllows(once, 'hazard_first', 'thief', seen, 0, 0)).toBe(true);
    const cyc = TRIGGER_RULES.infamy_50.repeat;
    recordRepeat(cyc, 'infamy_50', 'infamy50', seen, 0, 0);
    expect(repeatAllows(cyc, 'infamy_50', 'infamy50', seen, 0, 0)).toBe(false);
    expect(repeatAllows(cyc, 'infamy_50', 'infamy50', seen, 1, 0)).toBe(true);
    const cd = TRIGGER_RULES.struggle.repeat;
    recordRepeat(cd, 'struggle', 'struggle', seen, 0, 0);
    expect(repeatAllows(cd, 'struggle', 'struggle', seen, 0, 29 * 60_000)).toBe(false);
    expect(repeatAllows(cd, 'struggle', 'struggle', seen, 0, 30 * 60_000)).toBe(true);
  });
  it('rate-limits unprompted lines: 3 min per department, 90 s suite-wide', () => {
    const now = 1_000_000;
    expect(maySpeak('tier_reached', clock())).toBe(true);
    expect(maySpeak('tier_reached', clock({ deptLast: now - 60_000 }))).toBe(false);
    expect(maySpeak('tier_reached', clock({ deptLast: now - 181_000, suiteLast: now - 60_000 }))).toBe(false);
    expect(maySpeak('tier_reached', clock({ deptLast: now - 181_000, suiteLast: now - 91_000 }))).toBe(true);
    // Legacy milestones are not capped.
    expect(maySpeak('legacy', clock({ deptLast: now, suiteLast: now }))).toBe(true);
  });
  it('waits for calm (2 s after isIntense) and the 30 s settling-in grace', () => {
    const now = 1_000_000;
    expect(maySpeak('tier_reached', clock({ intenseAt: now - 1000 }))).toBe(false);
    expect(maySpeak('tier_reached', clock({ intenseAt: now - 2500 }))).toBe(true);
    expect(maySpeak('onboarding', clock({ intenseAt: now }))).toBe(true);
    expect(maySpeak('tier_reached', clock({ enteredAt: now - 10_000 }))).toBe(false);
    expect(maySpeak('return_after_fall', clock({ enteredAt: now - 10_000 }))).toBe(true);
    expect(maySpeak('legend_arrives', clock({ enteredAt: now - 10_000 }))).toBe(true);
  });
  it('queues by priority, max 3, and carries expired high lines', () => {
    const L = (key: string, priority: QueuedLine['priority'], at: number): QueuedLine => ({ key, kind: 'tier_reached', priority, text: key, at });
    let q: QueuedLine[] = [];
    q = enqueue(q, L('a', 'low', 1)).queue;
    q = enqueue(q, L('b', 'high', 2)).queue;
    q = enqueue(q, L('c', 'medium', 3)).queue;
    const r = enqueue(q, L('d', 'medium', 4));
    expect(r.queue.map((l) => l.key)).toEqual(['b', 'c', 'd']);
    expect(r.dropped.map((l) => l.key)).toEqual(['a']);
    const ex = expireQueue(r.queue, 11 * 60_000);
    expect(ex.queue).toEqual([]);
    expect(ex.carry.map((l) => l.key)).toEqual(['b']);
  });
  it('ambient: Full only, >= 60 s idle, <= 1 per 10 min', () => {
    const now = 1_000_000;
    const base = { ...clock(), lastInput: now - 61_000, busy: false, chattiness: 'full' as const };
    expect(ambientDue(base)).toBe(true);
    expect(ambientDue({ ...base, lastInput: now - 30_000 })).toBe(false);
    expect(ambientDue({ ...base, chattiness: 'milestones' })).toBe(false);
    expect(ambientDue({ ...base, ambientLast: now - 5 * 60_000 })).toBe(false);
    expect(ambientDue({ ...base, busy: true })).toBe(false);
  });
  it('bubble time is 2.5 s + 50 ms per character', () => {
    expect(bubbleSeconds('x'.repeat(30))).toBeCloseTo(4);
    expect(bubbleSeconds('')).toBe(3);
  });
});

describe('old saves', () => {
  it('default-fill the new fields', () => {
    const s: any = newSave(0);
    s.depts.cauldron = dept();
    delete s.depts.cauldron.pendingTips;
    delete s.meta.steward;
    delete s.meta.managerClock;
    s.meta.edict = { id: 42 };
    const m = migrate(JSON.parse(JSON.stringify(s)))!;
    expect(m.depts.cauldron!.pendingTips).toEqual([]);
    expect(m.meta.steward).toEqual({});
    expect(m.meta.managerClock.lastLineAt).toBe(0);
    expect(m.meta.edict).toBeUndefined();
  });
});

describe("Legend's Bane id", () => {
  it('is per department', () => {
    expect(legendsBaneId('mines')).toBe('mines.legendsBane');
  });
});
