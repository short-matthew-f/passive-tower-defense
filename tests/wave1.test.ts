// Waves 0-1 core: the playtest log (sessions, rollover, export), the daily rating schedule, Legend
// rosters (progression, labels, portraits) and the Dawn Ambush appointment rules.
import { describe, expect, it } from 'vitest';
import {
  MAX_SESSIONS,
  SESSION_GAP_MS,
  dayKey,
  exportPlaytest,
  newPlaytest,
  playtestOf,
  ptBoot,
  ptCount,
  ptDismiss,
  ptHide,
  ptPrompted,
  ptRate,
  ptShow,
  ptWhere,
  rollover,
  shouldPromptRating,
  summarize,
} from '../src/core/playtest';
import {
  ROSTERS,
  dawnMult,
  dawnPhase,
  isNight,
  legendFor,
  legendLabel,
  legendMini,
  legendPortrait,
  nextDawn,
  onLegendReady,
  rosterFor,
  spansNight,
} from '../src/core/legends';
import { DEPT_ORDER, newSave, type DeptId } from '../src/core/types';
import { migrate } from '../src/core/save';
import { popTier } from '../src/ui/juice';

const at = (h: number, m = 0, day = 28) => new Date(2026, 9, day, h, m, 0, 0).getTime();
const info = { standalone: false, src: 'direct' };

describe('playtest log', () => {
  it('default-fills old saves and repairs odd data', () => {
    const s = newSave(at(9));
    expect((s.meta as any).playtest).toBeUndefined();
    const st = playtestOf(s);
    expect(st.sessions).toEqual([]);
    (s.meta as any).playtest = { sessions: [{ s: 5 }, null, 'x'], ratings: 'no' };
    const st2 = playtestOf(s);
    expect(st2.sessions.length).toBe(1);
    expect(st2.sessions[0].sec).toEqual({});
    expect(st2.ratings).toEqual([]);
  });

  it('old saves (no playtest, no legendDawn) still migrate', () => {
    const raw = JSON.parse(JSON.stringify(newSave(at(9))));
    const m = migrate(raw);
    expect(m).not.toBeNull();
    expect(playtestOf(m!).sessions.length).toBe(0);
  });

  it('a short hide continues the session; a long one starts a new session', () => {
    const st = newPlaytest();
    ptBoot(st, at(9), info);
    ptWhere(st, 'throne', at(9));
    ptWhere(st, 'cauldron', at(9, 1));
    ptHide(st, at(9, 4));
    expect(st.sessions[0].sec.throne).toBe(60);
    expect(st.sessions[0].sec.cauldron).toBe(180);
    expect(ptShow(st, at(9, 6), info)).toBe(false); // 2 min < gap
    ptHide(st, at(9, 10));
    expect(st.sessions.length).toBe(1);
    expect(st.sessions[0].dur).toBe(8 * 60);
    expect(ptShow(st, at(9, 10) + SESSION_GAP_MS + 1, info)).toBe(true);
    expect(st.sessions.length).toBe(2);
    // The new session keeps counting the place the player is in.
    expect(st.sessions[1].vis.cauldron).toBe(1);
  });

  it('counts Falls, buys, Shifts and push opens on the open session', () => {
    const st = newPlaytest();
    ptBoot(st, at(9), { standalone: true, src: 'push' });
    ptCount(st, 'falls');
    ptCount(st, 'buys', 3);
    ptCount(st, 'shifts');
    const s = st.sessions[0];
    expect([s.falls, s.buys, s.shifts, s.notif, s.sa, s.src]).toEqual([1, 3, 1, 1, true, 'push']);
  });

  it('rolls over past the caps', () => {
    const st = newPlaytest();
    for (let i = 0; i < MAX_SESSIONS + 25; i++) ptBoot(st, at(0) + i * 3600_000, info);
    rollover(st);
    expect(st.sessions.length).toBe(MAX_SESSIONS);
    expect(st.sessions[0].s).toBe(at(0) + 25 * 3600_000);
    for (let i = 0; i < 20; i++) ptDismiss(st, at(9, 0, 1) + i * 86400_000);
    expect(st.dismissed.length).toBeLessThanOrEqual(14);
  });

  it('summarizes per day and exports', () => {
    const st = newPlaytest();
    ptBoot(st, at(9), info);
    ptWhere(st, 'mines', at(9));
    ptHide(st, at(9, 5));
    ptShow(st, at(13), info);
    ptRate(st, at(13, 1), 7);
    ptRate(st, at(13, 2), 11); // re-rating the same day replaces it, clamped
    const days = summarize(st);
    expect(days.length).toBe(1);
    expect(days[0]).toMatchObject({ day: dayKey(at(9)), sessions: 2, played: 2, rating: 10 });
    const ex = exportPlaytest(st, at(13, 3));
    expect(ex.sessions.length).toBe(2);
    expect(ex.ratings).toEqual([{ day: dayKey(at(9)), score: 10, at: at(13, 2) }]);
  });
});

describe('daily rating schedule', () => {
  it('not on the first morning session; yes on the second session of the day', () => {
    const st = newPlaytest();
    ptBoot(st, at(9), info);
    expect(shouldPromptRating(st, at(9, 5))).toBe(false);
    ptHide(st, at(9, 6));
    ptShow(st, at(12), info);
    expect(shouldPromptRating(st, at(12) + 5_000)).toBe(false); // too early in the session
    expect(shouldPromptRating(st, at(12, 1))).toBe(true);
  });

  it('yes on the first session after 18:00', () => {
    const st = newPlaytest();
    ptBoot(st, at(18, 30), info);
    expect(shouldPromptRating(st, at(18, 31))).toBe(true);
  });

  it('at most once a day: shown, dismissed or rated each end it', () => {
    for (const end of ['shown', 'dismissed', 'rated'] as const) {
      const st = newPlaytest();
      ptBoot(st, at(19), info);
      if (end === 'shown') ptPrompted(st, at(19, 1));
      if (end === 'dismissed') ptDismiss(st, at(19, 1));
      if (end === 'rated') ptRate(st, at(19, 1), 6);
      expect(shouldPromptRating(st, at(20))).toBe(false);
      // The next evening it may ask again.
      ptBoot(st, at(19, 0, 29), info);
      expect(shouldPromptRating(st, at(19, 1, 29))).toBe(true);
    }
  });
});

describe('Legend rosters', () => {
  const src = (id: DeptId) => ({ id, legend: { name: 'X', line: 'Y' } });

  it('every department has 5-7 escalating Legends; the first is the original Legend', () => {
    const originals: Record<DeptId, string> = {
      cauldron: 'Dame Brightjaw the Unreasonably Tall',
      mines: 'Sir Augustin Drillwright',
      dungeon: 'Sir Aldous Goldmantle',
      bridge: 'Sir Strollsworth the Unbothered',
      styx: 'Dame Brinella the Drainer',
      spire: 'Brother Quell the Unflinching',
      pit: 'Brakka Bare-Knuckle',
    };
    for (const id of DEPT_ORDER) {
      expect(ROSTERS[id].length).toBeGreaterThanOrEqual(5);
      expect(ROSTERS[id].length).toBeLessThanOrEqual(7);
      expect(legendFor(src(id), 0).full).toBe(originals[id]);
      for (const l of ROSTERS[id]) expect(l.taunt.length).toBeGreaterThan(0);
    }
  });

  it('advances one Legend per Fall, then wraps with numerals', () => {
    const r = ROSTERS.cauldron;
    const names = r.map((_, i) => legendFor(src('cauldron'), i).name);
    expect(names).toEqual(r.map((l) => l.name));
    expect(new Set(names).size).toBe(r.length);
    const again = legendFor(src('cauldron'), r.length);
    expect(again.index).toBe(0);
    expect(again.full.endsWith(' II')).toBe(true);
    expect(legendFor(src('cauldron'), -3).index).toBe(0);
    expect(legendFor(src('cauldron'), NaN).index).toBe(0);
  });

  it('departments can override the roster', () => {
    const custom = { id: 'mines' as DeptId, legends: [{ name: 'Sir A', title: 'the One', taunt: 'HI' }, { name: 'Sir B', title: 'the Two', taunt: 'HO' }] };
    expect(rosterFor(custom).length).toBe(2);
    expect(legendFor(custom, 1).full).toBe('Sir B the Two');
  });

  it('labels: a silhouette shows only the title', () => {
    const l = legendFor(src('cauldron'), 1);
    expect(legendLabel(l, false)).toBe('??? THE TALLER SISTER');
    expect(legendLabel(l, true)).toBe('DAME LOFTWYN THE TALLER SISTER');
  });

  it('portraits are deterministic 24x24 grids with a palette for every key', () => {
    for (const id of DEPT_ORDER) {
      for (let n = 0; n < ROSTERS[id].length; n++) {
        const l = legendFor(src(id), n);
        const p = legendPortrait(l);
        expect(p.rows.length).toBe(24);
        for (const row of p.rows) {
          expect(row.length).toBe(24);
          for (const ch of row) if (ch !== '.') expect(p.palette[ch]).toBeDefined();
        }
        expect(legendPortrait(l)).toEqual(p);
        expect(legendMini(l, 0).length).toBe(13);
      }
    }
  });
});

describe('Dawn Ambush', () => {
  const save = () => {
    const s = newSave(at(9));
    s.depts.cauldron = {
      v: 1,
      unlockedAt: 0,
      cycle: { n: 0, startedAt: 0, earnings: 0, heldLevel: 0, legendWaiting: true },
      lifetime: { peakRank: 0, falls: 0, best: {} },
      imports: {},
      persistent: {},
      run: { bank: 0 },
      seen: {},
    };
    return s;
  };

  it('night and dawn helpers', () => {
    expect(isNight(at(23))).toBe(true);
    expect(isNight(at(3))).toBe(true);
    expect(isNight(at(8))).toBe(false);
    expect(nextDawn(at(23))).toBe(at(7, 0, 29));
    expect(nextDawn(at(3))).toBe(at(7));
    expect(spansNight(at(22, 0, 27), at(8))).toBe(true);
    expect(spansNight(at(12), at(15))).toBe(false);
  });

  it('a Legend ready at night camps until 7:00, then pays +50% until 10:00, then expires', () => {
    const s = save();
    expect(onLegendReady(s, 'cauldron', at(23, 30, 27))).toBe(at(7));
    expect(dawnPhase(s, 'cauldron', at(2)).phase).toBe('camping');
    expect(dawnMult(s, 'cauldron', at(2))).toBe(1);
    expect(dawnPhase(s, 'cauldron', at(7, 30)).phase).toBe('ambush');
    expect(dawnMult(s, 'cauldron', at(9, 59))).toBe(1.5);
    expect(dawnPhase(s, 'cauldron', at(10, 1)).phase).toBe('none');
    // Expired: removed, no penalty, the Legend still waits.
    expect((s.meta as any).legendDawn.at.cauldron).toBeUndefined();
    expect(s.depts.cauldron!.cycle.legendWaiting).toBe(true);
  });

  it('back inside the dawn window after a night away: the ambush is on now', () => {
    const s = save();
    expect(onLegendReady(s, 'cauldron', at(7, 40), at(22, 0, 27))).toBe(at(7, 40));
    expect(dawnPhase(s, 'cauldron', at(8)).phase).toBe('ambush');
  });

  it('a daytime Legend has no appointment (arrives as before)', () => {
    const s = save();
    expect(onLegendReady(s, 'cauldron', at(14))).toBeNull();
    expect(onLegendReady(s, 'cauldron', at(8))).toBeNull(); // in the window, but not after a night away
    expect(dawnPhase(s, 'cauldron', at(14)).phase).toBe('none');
  });

  it('an appointment ends with the Legend (Fall)', () => {
    const s = save();
    onLegendReady(s, 'cauldron', at(23, 0, 27));
    s.depts.cauldron!.cycle.legendWaiting = false;
    expect(dawnPhase(s, 'cauldron', at(8)).phase).toBe('none');
  });
});

describe('juice tiers', () => {
  it('pops size by magnitude relative to the reference', () => {
    expect(popTier(0.5, 1)).toBe(0);
    expect(popTier(2, 1)).toBe(1);
    expect(popTier(20, 1)).toBe(2);
    expect(popTier(500, 1)).toBe(3);
    expect(popTier(NaN, 1)).toBe(0);
    expect(popTier(10, 0)).toBe(0);
  });
});
