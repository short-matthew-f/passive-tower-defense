// The single save module (specs/00 §9). No department touches storage directly.
import { get, set } from 'idb-keyval';
import { newSave, SCHEMA, type SaveRoot } from './types';

const IDB_KEYS = ['overlord-save-a', 'overlord-save-b'];
const LS_KEY = 'overlord-save-mirror';

/** Migrations: migrations[n] upgrades a schema-n save to n+1. */
const migrations: Record<number, (s: any) => any> = {};

export function migrate(raw: any): SaveRoot | null {
  if (!raw || typeof raw !== 'object' || typeof raw.schema !== 'number') return null;
  let s = raw;
  while (s.schema < SCHEMA) {
    const step = migrations[s.schema];
    if (!step) return null;
    s = step(s);
  }
  // Fill fields added without a schema bump.
  const base = newSave(s.savedAt ?? Date.now());
  s.meta = { ...base.meta, ...s.meta, settings: { ...base.meta.settings, ...(s.meta?.settings ?? {}) } };
  const st = s.meta.settings;
  st.leftHanded = st.leftHanded === true;
  if (st.buyMode !== 0 && st.buyMode !== 1 && st.buyMode !== 2) st.buyMode = 0;
  if (typeof st.depts !== 'object' || !st.depts || Array.isArray(st.depts)) st.depts = {};
  s.meta.goods = { ...base.meta.goods, ...(s.meta.goods ?? {}) };
  for (const k of Object.keys(s.meta.goods)) if (!Number.isFinite(s.meta.goods[k])) s.meta.goods[k] = 0;
  if (!s.meta.market || typeof s.meta.market.day !== 'number') s.meta.market = { ...base.meta.market };
  s.depts ??= {};
  for (const d of Object.values(s.depts) as any[]) {
    if (!d) continue;
    if (typeof d.imports !== 'object' || !d.imports) d.imports = {};
    if (typeof d.seen !== 'object' || !d.seen) d.seen = {};
    if (!Array.isArray(d.pendingTips)) d.pendingTips = [];
    if (d.lifetime && !Number.isFinite(d.lifetime.peakRank)) d.lifetime.peakRank = 0;
  }
  if (typeof s.meta.steward !== 'object' || !s.meta.steward) s.meta.steward = {};
  s.meta.managerClock = { ...base.meta.managerClock, ...(s.meta.managerClock ?? {}) };
  if (typeof s.meta.orders !== 'object' || !s.meta.orders || Array.isArray(s.meta.orders)) s.meta.orders = {};
  for (const k of Object.keys(s.meta.orders)) if (typeof s.meta.orders[k] !== 'string') delete s.meta.orders[k];
  if (s.meta.lastAway && !(Number.isFinite(s.meta.lastAway.seconds) && Number.isFinite(s.meta.lastAway.cap) && s.meta.lastAway.cap > 0)) delete s.meta.lastAway;
  if (s.meta.edict && (typeof s.meta.edict.id !== 'string' || typeof s.meta.edict.since !== 'number')) delete s.meta.edict;
  return s as SaveRoot;
}

/**
 * Clock repair (00 §7): after a device boots with its clock ahead and is corrected later, stored
 * epochs sit in the future and would stretch Rebuild Rush, lock the Edict Board and mute manager
 * lines for the length of the skew. Clamps every core-owned epoch to `now` (and the Black Market's
 * day to `today`, keeping today's climb). Returns how many values it changed. Pure.
 */
export function repairClock(s: SaveRoot, now: number, today: number): number {
  let n = 0;
  const fix = (v: unknown): number | null => (typeof v === 'number' && v > now ? (n++, now) : null);
  const seenFix = (seen: Record<string, number> | undefined) => {
    if (!seen) return;
    for (const k of Object.keys(seen)) {
      const v = fix(seen[k]);
      if (v !== null) seen[k] = v;
    }
  };
  let v: number | null;
  if ((v = fix(s.lastSeen)) !== null) s.lastSeen = v;
  if ((v = fix(s.savedAt)) !== null) s.savedAt = v;
  const m = s.meta;
  if (m.edict && (v = fix(m.edict.since)) !== null) m.edict.since = v;
  if (m.managerClock) {
    if ((v = fix(m.managerClock.lastLineAt)) !== null) m.managerClock.lastLineAt = v;
    if ((v = fix(m.managerClock.lastAmbientAt)) !== null) m.managerClock.lastAmbientAt = v;
  }
  if (m.market && m.market.day > today) {
    m.market = { day: today, n: m.market.n };
    n++;
  }
  for (const t of m.trophies ?? []) if ((v = fix(t.at)) !== null) t.at = v;
  seenFix(m.seen);
  for (const d of Object.values(s.depts)) {
    if (!d) continue;
    if ((v = fix(d.cycle?.startedAt)) !== null) d.cycle.startedAt = v;
    if ((v = fix(d.unlockedAt)) !== null) d.unlockedAt = v;
    seenFix(d.seen);
  }
  return n;
}

function checksum(json: string): number {
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Envelope {
  sum: number;
  json: string;
}

function wrapSave(save: SaveRoot): Envelope {
  const json = JSON.stringify(save);
  return { sum: checksum(json), json };
}

function unwrap(env: unknown): SaveRoot | null {
  try {
    if (!env || typeof env !== 'object') return null;
    const e = env as Envelope;
    if (typeof e.json !== 'string' || checksum(e.json) !== e.sum) return null;
    return migrate(JSON.parse(e.json));
  } catch {
    return null;
  }
}

let slot = 0;

// ---------- the write gate (single writer, wipe) ----------

/** False in a tab that does not hold the writer lock (another tab owns the save). */
let writerOk = true;
/** Set by wipeSave: nothing may be written again in this page (the reload must find it empty). */
let wiped = false;
/** IndexedDB did not answer at boot: async writes go to the localStorage mirror until it does. */
let idbStalled = false;

/** Whether this page may write the save at all (writer lock held, no wipe). */
export function writesAllowed(): boolean {
  return writerOk && !wiped;
}

/** Called with the writer-lock result; a non-writer page never writes (00 §9 "Single writer"). */
export function setWriter(ok: boolean): void {
  writerOk = ok;
}

/** Test hook: back to a fresh page. */
export function resetSaveGate(): void {
  writerOk = true;
  wiped = false;
  idbStalled = false;
}

export const IDB_TIMEOUT_MS = 1500;
const TIMEOUT = Symbol('timeout');

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(TIMEOUT), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Loads the newest valid copy. Each IndexedDB read is raced against a timeout (a WebKit bug can
 * leave the first open after an update hanging forever); on a timeout the mirror decides and async
 * writes go to the mirror until IndexedDB answers. */
export async function loadSave(timeoutMs = IDB_TIMEOUT_MS): Promise<SaveRoot | null> {
  const candidates: SaveRoot[] = [];
  const late: Promise<unknown>[] = [];
  for (const key of IDB_KEYS) {
    try {
      const p = get(key);
      const v = await withTimeout(p, timeoutMs);
      if (v === TIMEOUT) {
        late.push(p.catch(() => undefined));
        continue;
      }
      const s = unwrap(v);
      if (s) candidates.push(s);
    } catch {
      /* IndexedDB unavailable (private mode); fall through to the mirror. */
    }
  }
  if (late.length) {
    idbStalled = true;
    void Promise.all(late).then(() => {
      idbStalled = false;
    });
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = unwrap(JSON.parse(raw));
      if (s) candidates.push(s);
    }
  } catch {
    /* ignore */
  }
  candidates.sort((a, b) => b.savedAt - a.savedAt);
  return candidates[0] ?? null;
}

/** Async write to the rotating IndexedDB slots. */
export async function writeSave(save: SaveRoot, now: number): Promise<void> {
  if (!writesAllowed()) return;
  if (idbStalled) {
    writeMirror(save, now);
    return;
  }
  save.savedAt = now;
  const env = wrapSave(save);
  slot = (slot + 1) % IDB_KEYS.length;
  try {
    // Re-check after the (async) serialisation point: a wipe may have started meanwhile.
    if (!writesAllowed()) return;
    await set(IDB_KEYS[slot], env);
  } catch {
    writeMirror(save, now);
  }
}

/** Synchronous mirror, used on pagehide where async writes may not finish. */
export function writeMirror(save: SaveRoot, now: number): void {
  if (!writesAllowed()) return;
  save.savedAt = now;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(wrapSave(save)));
  } catch {
    /* quota or disabled storage */
  }
}

export async function wipeSave(): Promise<void> {
  // First: no later write in this page (autosave, hide, pagehide, unload) may bring it back.
  wiped = true;
  for (const key of IDB_KEYS) {
    try {
      await set(key, null);
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

/** Export as a base64 string (manual backup). */
export function exportSave(save: SaveRoot): string {
  const env = wrapSave(save);
  return btoa(unescape(encodeURIComponent(JSON.stringify(env))));
}

export function importSave(text: string): SaveRoot | null {
  try {
    return unwrap(JSON.parse(decodeURIComponent(escape(atob(text.trim())))));
  } catch {
    return null;
  }
}

/**
 * Single-writer lock so two tabs never double-credit offline time.
 * Resolves true if this tab holds the lock; the result also sets the write gate.
 * Without Web Locks (iOS Safari < 15.4) a BroadcastChannel handshake decides (00 §9).
 */
export async function acquireWriterLock(): Promise<boolean> {
  const ok = await lockOnce();
  setWriter(ok);
  return ok;
}

function lockOnce(): Promise<boolean> {
  const locks = (globalThis.navigator as any)?.locks;
  if (!locks?.request) return channelLock();
  return new Promise((resolve) => {
    locks
      .request('overlord-save', { ifAvailable: true }, (lock: unknown) => {
        if (!lock) {
          resolve(false);
          return;
        }
        resolve(true);
        // Hold the lock for the lifetime of the page.
        return new Promise(() => {});
      })
      .catch(() => resolve(true));
  });
}

export const CHANNEL_WAIT_MS = 300;

/**
 * BroadcastChannel fallback: say hello and wait; a tab that already writes answers "taken". Two
 * tabs starting together hear each other's hello and the lower id wins. Resolves true when no
 * BroadcastChannel exists (nothing better to do).
 */
export function channelLock(wait = CHANNEL_WAIT_MS): Promise<boolean> {
  const BC = (globalThis as any).BroadcastChannel;
  if (typeof BC !== 'function') return Promise.resolve(true);
  let ch: BroadcastChannel;
  try {
    ch = new BC('overlord-save');
  } catch {
    return Promise.resolve(true);
  }
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let state: 'pending' | 'writer' | 'lost' = 'pending';
  return new Promise((resolve) => {
    ch.onmessage = (e: MessageEvent) => {
      const m = e.data as { t?: string; id?: string } | null;
      if (!m || m.id === id) return;
      if (m.t === 'hello') {
        if (state === 'writer') ch.postMessage({ t: 'taken', id });
        else if (state === 'pending' && typeof m.id === 'string' && m.id < id) state = 'lost';
      } else if (m.t === 'taken' && state === 'pending') {
        state = 'lost';
      }
    };
    ch.postMessage({ t: 'hello', id });
    setTimeout(() => {
      if (state === 'pending') {
        state = 'writer'; // keep the channel open for the page's lifetime to answer later tabs
        resolve(true);
      } else {
        ch.close();
        resolve(false);
      }
    }, wait);
  });
}

export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}
