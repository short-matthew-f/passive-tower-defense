// The local playtest log (fun plan, Wave 0): a tiny, private, exportable record of how the game is
// actually played, plus a once-a-day "how fun was today?" 1-10 rating. Nothing leaves the device:
// it lives in the save (`meta.playtest`) and is exported by hand from Settings.
//
// What it keeps (capped, so the save stays small):
//  - sessions: start, end, visible seconds, installed (standalone) flag, launch source (?src=),
//    seconds and visits per department, Falls, purchases, Shifts, notification opens;
//  - ratings: one per local day (score 1-10), and which days the prompt was shown / dismissed.
// A "session" ends when the app is hidden for SESSION_GAP_MS or more; a shorter hide continues it.
//
// Pure: state in, state out, the clock injected. The Game calls the hooks (core/game.ts).
import type { DeptId, SaveRoot } from './types';

export const SESSION_GAP_MS = 5 * 60_000;
export const MAX_SESSIONS = 300;
export const MAX_RATINGS = 120;
/** The rating prompt: shown on the first session that starts at or after this local hour, or on
 * the day's second session, once per local day at most. */
export const RATING_HOUR = 18;
/** Minimum seconds into a session before the prompt may show (never on the first frame). */
export const RATING_MIN_SESSION_S = 20;

export type Counter = 'falls' | 'buys' | 'shifts' | 'notif';

export interface PtSession {
  /** Start / last activity (ms epoch). */
  s: number;
  e: number;
  /** Visible seconds. */
  dur: number;
  /** Installed to the Home Screen (navigator.standalone / display-mode standalone). */
  sa: boolean;
  /** Launch source: 'direct', or the ?src= value (e.g. 'push'). */
  src: string;
  /** Seconds and visits per department ('throne' included). */
  sec: Record<string, number>;
  vis: Record<string, number>;
  falls: number;
  buys: number;
  shifts: number;
  notif: number;
}

export interface PtRating {
  day: string;
  score: number;
  at: number;
}

export interface PlaytestState {
  v: 1;
  sessions: PtSession[];
  ratings: PtRating[];
  /** Local day keys on which the prompt was shown / dismissed (the last few only). */
  prompted: string[];
  dismissed: string[];
  /** Live bookkeeping (not exported as data): where the player is and since when. */
  where: string | null;
  whereAt: number;
  /** Visible since (ms), or 0 while hidden. */
  visAt: number;
  hiddenAt: number;
}

export function newPlaytest(): PlaytestState {
  return { v: 1, sessions: [], ratings: [], prompted: [], dismissed: [], where: null, whereAt: 0, visAt: 0, hiddenAt: 0 };
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The save's playtest state, default-filled (old saves have none; odd data is repaired). */
export function playtestOf(save: SaveRoot): PlaytestState {
  const m = save.meta as SaveRoot['meta'] & { playtest?: PlaytestState };
  const p = m.playtest as Partial<PlaytestState> | undefined;
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    m.playtest = newPlaytest();
    return m.playtest;
  }
  if (!Array.isArray(p.sessions)) p.sessions = [];
  p.sessions = p.sessions.filter((x) => x && typeof x === 'object' && Number.isFinite(x.s));
  for (const x of p.sessions) {
    x.e = num(x.e, x.s);
    x.dur = num(x.dur);
    x.sa = !!x.sa;
    x.src = typeof x.src === 'string' ? x.src : 'direct';
    if (!x.sec || typeof x.sec !== 'object') x.sec = {};
    if (!x.vis || typeof x.vis !== 'object') x.vis = {};
    x.falls = num(x.falls);
    x.buys = num(x.buys);
    x.shifts = num(x.shifts);
    x.notif = num(x.notif);
  }
  if (!Array.isArray(p.ratings)) p.ratings = [];
  p.ratings = p.ratings.filter((r) => r && typeof r.day === 'string' && Number.isFinite(r.score));
  if (!Array.isArray(p.prompted)) p.prompted = [];
  if (!Array.isArray(p.dismissed)) p.dismissed = [];
  p.v = 1;
  p.where = typeof p.where === 'string' ? p.where : null;
  p.whereAt = num(p.whereAt);
  p.visAt = num(p.visAt);
  p.hiddenAt = num(p.hiddenAt);
  return p as PlaytestState;
}

/** Local calendar day "YYYY-MM-DD". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function current(st: PlaytestState): PtSession | null {
  return st.sessions[st.sessions.length - 1] ?? null;
}

/** Drops the oldest sessions / ratings / day flags past their caps. */
export function rollover(st: PlaytestState): void {
  if (st.sessions.length > MAX_SESSIONS) st.sessions.splice(0, st.sessions.length - MAX_SESSIONS);
  if (st.ratings.length > MAX_RATINGS) st.ratings.splice(0, st.ratings.length - MAX_RATINGS);
  if (st.prompted.length > 14) st.prompted.splice(0, st.prompted.length - 14);
  if (st.dismissed.length > 14) st.dismissed.splice(0, st.dismissed.length - 14);
}

/** Books the time since the last mark to the current place and the open session. */
function settle(st: PlaytestState, now: number): void {
  const s = current(st);
  if (!s) return;
  if (st.visAt > 0 && now > st.visAt) {
    s.dur += Math.min(6 * 3600, (now - st.visAt) / 1000);
    st.visAt = now;
  }
  if (st.where && st.whereAt > 0 && now > st.whereAt) {
    s.sec[st.where] = Math.round(((s.sec[st.where] ?? 0) + Math.min(6 * 3600, (now - st.whereAt) / 1000)) * 10) / 10;
    st.whereAt = now;
  }
  s.dur = Math.round(s.dur * 10) / 10;
  if (now > s.e) s.e = now;
}

function open(st: PlaytestState, now: number, info: { standalone: boolean; src: string }): PtSession {
  const s: PtSession = { s: now, e: now, dur: 0, sa: info.standalone, src: info.src || 'direct', sec: {}, vis: {}, falls: 0, buys: 0, shifts: 0, notif: info.src === 'push' ? 1 : 0 };
  st.sessions.push(s);
  rollover(st);
  st.visAt = now;
  st.hiddenAt = 0;
  if (st.where) {
    st.whereAt = now;
    s.vis[st.where] = 1;
  }
  return s;
}

/** App launch (boot). Always a new session. */
export function ptBoot(st: PlaytestState, now: number, info: { standalone: boolean; src: string }): void {
  // A session left open by a killed page ends at its last mark.
  st.visAt = 0;
  st.where = null;
  open(st, now, info);
}

export function ptHide(st: PlaytestState, now: number): void {
  if (st.hiddenAt > 0) return;
  settle(st, now);
  st.visAt = 0;
  st.hiddenAt = now;
}

/** Back from hidden: continues the session after a short hide, else starts a new one. Returns
 * true when a new session started. */
export function ptShow(st: PlaytestState, now: number, info: { standalone: boolean; src: string }): boolean {
  const s = current(st);
  const away = st.hiddenAt > 0 ? now - st.hiddenAt : Infinity;
  if (s && away < SESSION_GAP_MS) {
    st.visAt = now;
    st.hiddenAt = 0;
    if (st.where) st.whereAt = now;
    return false;
  }
  open(st, now, info);
  return true;
}

/** The player moved to a department (or 'throne'). */
export function ptWhere(st: PlaytestState, where: DeptId | 'throne', now: number): void {
  settle(st, now);
  if (st.where === where) return;
  st.where = where;
  st.whereAt = now;
  const s = current(st);
  if (s) s.vis[where] = (s.vis[where] ?? 0) + 1;
}

export function ptCount(st: PlaytestState, what: Counter, n = 1): void {
  const s = current(st);
  if (s && Number.isFinite(n)) s[what] += n;
}

/** Sessions that started on the local day of `now`. */
export function sessionsToday(st: PlaytestState, now: number): number {
  const k = dayKey(now);
  let n = 0;
  for (const s of st.sessions) if (dayKey(s.s) === k) n++;
  return n;
}

/**
 * Whether to show the daily rating prompt now: at most once per local day (shown counts, a
 * dismissal counts, a rating counts), only after RATING_MIN_SESSION_S of the session, and only
 * when this session started at or after RATING_HOUR or is the day's second (or later) session.
 */
export function shouldPromptRating(st: PlaytestState, now: number): boolean {
  const k = dayKey(now);
  if (st.ratings.some((r) => r.day === k) || st.prompted.includes(k) || st.dismissed.includes(k)) return false;
  const s = current(st);
  if (!s || dayKey(s.s) !== k) return false;
  if (s.dur + (st.visAt > 0 ? Math.max(0, (now - st.visAt) / 1000) : 0) < RATING_MIN_SESSION_S) return false;
  const late = new Date(s.s).getHours() >= RATING_HOUR;
  return late || sessionsToday(st, now) >= 2;
}

export function ptPrompted(st: PlaytestState, now: number): void {
  const k = dayKey(now);
  if (!st.prompted.includes(k)) st.prompted.push(k);
  rollover(st);
}

export function ptRate(st: PlaytestState, now: number, score: number): void {
  const k = dayKey(now);
  const v = Math.max(1, Math.min(10, Math.round(score)));
  const old = st.ratings.find((r) => r.day === k);
  if (old) {
    old.score = v;
    old.at = now;
  } else st.ratings.push({ day: k, score: v, at: now });
  rollover(st);
}

export function ptDismiss(st: PlaytestState, now: number): void {
  const k = dayKey(now);
  if (!st.dismissed.includes(k)) st.dismissed.push(k);
  rollover(st);
}

export interface DaySummary {
  day: string;
  sessions: number;
  minutes: number;
  /** Sessions that entered at least one department (vs. collect and leave). */
  played: number;
  falls: number;
  buys: number;
  rating: number | null;
}

/** Per-day rollup of the kept sessions (oldest first). */
export function summarize(st: PlaytestState): DaySummary[] {
  const by = new Map<string, DaySummary>();
  for (const s of st.sessions) {
    const k = dayKey(s.s);
    let d = by.get(k);
    if (!d) by.set(k, (d = { day: k, sessions: 0, minutes: 0, played: 0, falls: 0, buys: 0, rating: null }));
    d.sessions++;
    d.minutes = Math.round((d.minutes + s.dur / 60) * 10) / 10;
    if (Object.keys(s.vis).some((w) => w !== 'throne')) d.played++;
    d.falls += s.falls;
    d.buys += s.buys;
  }
  for (const r of st.ratings) {
    const d = by.get(r.day) ?? { day: r.day, sessions: 0, minutes: 0, played: 0, falls: 0, buys: 0, rating: null };
    d.rating = r.score;
    by.set(r.day, d);
  }
  return [...by.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** The export object (Settings -> Export playtest log). Settles the open session first. */
export function exportPlaytest(st: PlaytestState, now: number): { days: DaySummary[]; sessions: PtSession[]; ratings: PtRating[] } {
  if (st.hiddenAt === 0) settle(st, now);
  return { days: summarize(st), sessions: st.sessions.map((s) => ({ ...s, sec: { ...s.sec }, vis: { ...s.vis } })), ratings: st.ratings.map((r) => ({ ...r })) };
}

// ---------- environment probes (DOM, guarded) ----------

/** Installed to the Home Screen (iOS navigator.standalone, or display-mode: standalone). */
export function isStandalone(): boolean {
  try {
    return !!(navigator as any).standalone || !!window.matchMedia?.('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/** The launch source from ?src= (push opens use ?src=push); 'direct' otherwise. */
export function launchSource(): string {
  try {
    const v = new URLSearchParams(location.search).get('src');
    return v && /^[a-z0-9_-]{1,16}$/i.test(v) ? v.toLowerCase() : 'direct';
  } catch {
    return 'direct';
  }
}
