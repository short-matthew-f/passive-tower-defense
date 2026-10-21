// Regression tests for the core QA fixes (C-01, C-02, C-06, C-07, C-08, C-09, C-10, C-05, C-13).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory idb-keyval; `hang` makes every get() never settle (the WebKit first-open bug).
const idb = vi.hoisted(() => ({ store: new Map<string, unknown>(), sets: 0, hang: false }));
vi.mock('idb-keyval', () => ({
  get: (k: string) => (idb.hang ? new Promise(() => {}) : Promise.resolve(idb.store.get(k))),
  set: (k: string, v: unknown) => {
    idb.sets++;
    idb.store.set(k, v);
    return Promise.resolve();
  },
}));

import {
  channelLock,
  loadSave,
  migrate,
  repairClock,
  resetSaveGate,
  setWriter,
  wipeSave,
  writeMirror,
  writeSave,
  writesAllowed,
} from '../src/core/save';
import { coreMult, idleEarnAllowed, offlineSecondsFor, rank, rankEff, tempMult, tributeRate, updateLateRecruit } from '../src/core/economy';
import { newSave, type DeptId, type DeptSave, type SaveRoot } from '../src/core/types';
import type { DeptEcon } from '../src/core/dept';
import { clip, rowRepeats, twoLines } from '../src/ui/sheet';

const ls = new Map<string, string>();
beforeEach(() => {
  idb.store.clear();
  idb.sets = 0;
  idb.hang = false;
  ls.clear();
  (globalThis as any).localStorage = {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, v),
    removeItem: (k: string) => void ls.delete(k),
  };
  resetSaveGate();
});
afterEach(() => {
  delete (globalThis as any).localStorage;
});

describe('save write gate (C-01, C-02)', () => {
  it('a writer page writes both stores', async () => {
    const s = newSave(1000);
    await writeSave(s, 2000);
    writeMirror(s, 2001);
    expect(idb.sets).toBe(1);
    expect(ls.size).toBe(1);
  });

  it('a non-writer (read-only) page never writes and never restamps savedAt', async () => {
    setWriter(false);
    const s = newSave(1000);
    await writeSave(s, 5000);
    writeMirror(s, 5000);
    expect(writesAllowed()).toBe(false);
    expect(idb.sets).toBe(0);
    expect(ls.size).toBe(0);
    expect(s.savedAt).toBe(1000);
  });

  it('after a wipe nothing in this page writes again, so the reload finds nothing', async () => {
    const s = newSave(1000);
    await writeSave(s, 2000);
    writeMirror(s, 2000);
    await wipeSave();
    const sets = idb.sets;
    await writeSave(s, 9000); // the unload-time visibilitychange write
    writeMirror(s, 9000); // pagehide
    expect(idb.sets).toBe(sets);
    expect(ls.size).toBe(0);
    expect(await loadSave()).toBeNull();
  });
});

describe('IndexedDB load timeout (C-08)', () => {
  it('falls back to the mirror and keeps async writes on the mirror while IndexedDB hangs', async () => {
    const s = newSave(1000);
    s.meta.tribute = 42;
    writeMirror(s, 1500);
    idb.hang = true;
    const loaded = await loadSave(20);
    expect(loaded?.meta.tribute).toBe(42);
    const t0 = idb.sets;
    await writeSave(loaded!, 3000);
    expect(idb.sets).toBe(t0); // not into a store that never answered
    expect(JSON.parse(JSON.parse(ls.get('overlord-save-mirror')!).json).savedAt).toBe(3000);
  });
});

describe('BroadcastChannel writer fallback (C-07)', () => {
  it('the first tab writes, a second tab goes read-only', async () => {
    expect(typeof (globalThis as any).BroadcastChannel).toBe('function');
    const first = await channelLock(30);
    const second = await channelLock(30);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('without BroadcastChannel it does not block', async () => {
    const BC = (globalThis as any).BroadcastChannel;
    (globalThis as any).BroadcastChannel = undefined;
    try {
      expect(await channelLock(10)).toBe(true);
    } finally {
      (globalThis as any).BroadcastChannel = BC;
    }
  });
});

function dept(over: Partial<DeptSave> = {}, rate = 0): DeptSave {
  return {
    v: 1,
    unlockedAt: 0,
    cycle: { n: 0, startedAt: 0, earnings: 0, heldLevel: 0, legendWaiting: false },
    lifetime: { peakRank: 0, falls: 0, best: {} },
    imports: {},
    persistent: {},
    run: { bank: 0, rate },
    seen: {},
    pendingTips: [],
    ...over,
  } as DeptSave;
}

const econ = (idleRate: (d: DeptSave) => number): DeptEcon =>
  ({ idleRate, rankRef: 1, rankTarget: 1e4, skillTarget: () => 5, econBase: 1e6, commendations: [] }) as unknown as DeptEcon;
const byRate = econ((d) => (d.run as any).rate);

describe('clock repair (C-06)', () => {
  const now = 10 * 86_400_000;
  const today = 10;
  it('clamps future-dated epochs to now and keeps the market climb', () => {
    const s = newSave(0);
    const future = now + 3 * 86_400_000;
    s.lastSeen = future;
    s.meta.edict = { id: 'darkTithe', since: future } as any;
    s.meta.managerClock = { lastLineAt: future, lastAmbientAt: future, lastThroneCameoDay: '' };
    s.meta.market = { day: today + 3, n: 30 };
    s.meta.seen.exportNagAt = future;
    s.meta.seen.flag = 1;
    s.depts.cauldron = dept({ cycle: { n: 1, startedAt: future, earnings: 0, heldLevel: 0, legendWaiting: false } as any, seen: { 'mgr.last': future, intro: 1 } });
    expect(repairClock(s, now, today)).toBeGreaterThan(0);
    expect(s.lastSeen).toBe(now);
    expect(s.meta.edict!.since).toBe(now);
    expect(s.meta.managerClock.lastLineAt).toBe(now);
    expect(s.meta.managerClock.lastAmbientAt).toBe(now);
    expect(s.meta.market).toEqual({ day: today, n: 30 });
    expect(s.meta.seen.exportNagAt).toBe(now);
    expect(s.meta.seen.flag).toBe(1);
    expect(s.depts.cauldron!.cycle.startedAt).toBe(now);
    expect(s.depts.cauldron!.seen['mgr.last']).toBe(now);
    expect(s.depts.cauldron!.seen.intro).toBe(1);
    expect(repairClock(s, now, today)).toBe(0); // idempotent
  });

  it('a future cycle start never stretches Rebuild Rush', () => {
    const s = newSave(0);
    s.depts.cauldron = dept({ cycle: { n: 1, startedAt: now + 86_400_000, earnings: 0, heldLevel: 0, legendWaiting: false } as any });
    expect(tempMult(s, 'cauldron', { cauldron: byRate }, now)).toBe(1);
  });
});

describe('NaN / Infinity guards (C-09)', () => {
  it('a NaN or throwing idleRate ranks 0 and never poisons Tribute', () => {
    const s = newSave(0);
    s.depts.cauldron = dept({}, 100);
    s.depts.mines = dept({ unlockedAt: 1 }, 100);
    const defs: Record<string, DeptEcon> = {
      cauldron: econ(() => NaN),
      mines: econ(() => {
        throw new Error('boom');
      }),
    };
    expect(rank(s, 'cauldron', defs)).toBe(0);
    expect(rank(s, 'mines', defs)).toBe(0);
    expect(Number.isFinite(tributeRate(s, 'cauldron', defs, false))).toBe(true);
    defs.cauldron = econ(() => Infinity);
    expect(rank(s, 'cauldron', defs)).toBe(0);
    expect(Number.isFinite(coreMult(s, 'mines', defs, 0))).toBe(true);
  });

  it('a NaN peak rank is ignored, and migrate repairs it', () => {
    const s = newSave(0);
    s.depts.cauldron = dept({ lifetime: { peakRank: NaN, falls: 0, best: {} } }, 100);
    expect(rankEff(s, 'cauldron', { cauldron: byRate })).toBe(rank(s, 'cauldron', { cauldron: byRate }));
    const m = migrate(JSON.parse(JSON.stringify({ ...s, depts: { cauldron: { ...s.depts.cauldron, lifetime: { peakRank: null, falls: 0, best: {} } } } })));
    expect(m!.depts.cauldron!.lifetime.peakRank).toBe(0);
  });
});

describe('Late Recruit (C-10)', () => {
  const defs = { cauldron: byRate, mines: byRate, dungeon: byRate };
  function suite(): SaveRoot {
    const s = newSave(0);
    s.depts.cauldron = dept({ unlockedAt: 0 }, 1e3);
    s.depts.mines = dept({ unlockedAt: 1000 }, 1);
    return s;
  }
  const tm = (s: SaveRoot, id: DeptId) => tempMult(s, id, defs, 1e12);

  it('applies to a newly unlocked department until it reaches 60% of the average, then latches', () => {
    const s = suite();
    expect(tm(s, 'mines')).toBe(2);
    updateLateRecruit(s, 'mines', defs);
    expect(s.depts.mines!.lateRecruitDone).toBeFalsy();
    (s.depts.mines!.run as any).rate = 1e3; // caught up
    updateLateRecruit(s, 'mines', defs);
    expect(s.depts.mines!.lateRecruitDone).toBe(true);
    (s.depts.mines!.run as any).rate = 1; // falls behind again: no second x2
    expect(tm(s, 'mines')).toBe(1);
  });

  it('never applies to the first department, nor after a Fall', () => {
    const s = suite();
    (s.depts.cauldron!.run as any).rate = 1;
    (s.depts.mines!.run as any).rate = 1e4;
    expect(tm(s, 'cauldron')).toBe(1);
    const t = suite();
    t.depts.mines!.cycle.n = 1;
    t.depts.mines!.cycle.startedAt = 0; // Rebuild Rush long over
    expect(tm(t, 'mines')).toBe(1);
    updateLateRecruit(t, 'mines', defs);
    expect(t.depts.mines!.lateRecruitDone).toBe(true);
  });
});

describe('present-but-idle accounting (C-05)', () => {
  it('idle time on screen and offline time share one cap', () => {
    // 2 h idle on screen already paid live; then 10 h hidden: the department gets the rest of the 8 h cap.
    expect(offlineSecondsFor(12 * 3600, 8 * 3600, 2 * 3600)).toBe(6 * 3600);
    // Settled by the next tap: everything was paid live.
    expect(offlineSecondsFor(3600, 8 * 3600, 3600)).toBe(0);
    // Live time past the cap never goes negative.
    expect(offlineSecondsFor(9 * 3600, 8 * 3600, 9 * 3600)).toBe(0);
    expect(offlineSecondsFor(3600, 8 * 3600)).toBe(3600);
  });

  it('the on-screen department earns only inside the cap', () => {
    const since = 1_000_000;
    expect(idleEarnAllowed(since, since + 7.9 * 3600_000, 8 * 3600)).toBe(true);
    expect(idleEarnAllowed(since, since + 8 * 3600_000, 8 * 3600)).toBe(false);
  });
});

describe('sheet hold-to-repeat (C-13)', () => {
  const base = { id: 'x', name: 'X', desc: () => '', level: () => 0, cost: () => 1, canAfford: () => true, buy: () => {} };
  it('repeats levelled rows only', () => {
    expect(rowRepeats({ ...base, max: 10 })).toBe(true);
    expect(rowRepeats({ ...base, max: 1, buyLabel: 'TURN ON', costText: () => '' })).toBe(false);
    expect(rowRepeats({ ...base, max: 1, buyLabel: 'KEEP', costText: () => '25%' })).toBe(false);
    expect(rowRepeats({ ...base, max: 1 })).toBe(false);
    expect(rowRepeats({ ...base, max: Infinity, buyLabel: '+10', repeat: true })).toBe(true);
    expect(rowRepeats({ ...base, max: 10, header: true })).toBe(false);
  });
});

describe('sheet text never cut mid-word silently (U-08)', () => {
  it('wraps to two lines and marks a cut', () => {
    expect(twoLines('GREEN FLAMES', 20)).toBe('GREEN FLAMES');
    expect(twoLines('GREEN FLAMES, TWO MORE BRAZIERS BY THE THRONE', 20)).toBe('GREEN FLAMES, TWO\nMORE BRAZIERS BY..');
    expect(twoLines('AAAA BBBB CCCC DDDD EEEE FFFF GGGG', 9).split('\n')[1].endsWith('..')).toBe(true);
    expect(clip('+5 {coin}X2 BOUNTY', 6)).toBe('+5..');
  });
});
