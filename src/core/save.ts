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
  s.meta.goods = { ...base.meta.goods, ...(s.meta.goods ?? {}) };
  for (const k of Object.keys(s.meta.goods)) if (!Number.isFinite(s.meta.goods[k])) s.meta.goods[k] = 0;
  if (!s.meta.market || typeof s.meta.market.day !== 'number') s.meta.market = { ...base.meta.market };
  s.depts ??= {};
  for (const d of Object.values(s.depts) as any[]) {
    if (!d) continue;
    if (typeof d.imports !== 'object' || !d.imports) d.imports = {};
    if (typeof d.seen !== 'object' || !d.seen) d.seen = {};
    if (!Array.isArray(d.pendingTips)) d.pendingTips = [];
  }
  if (typeof s.meta.steward !== 'object' || !s.meta.steward) s.meta.steward = {};
  s.meta.managerClock = { ...base.meta.managerClock, ...(s.meta.managerClock ?? {}) };
  if (s.meta.edict && (typeof s.meta.edict.id !== 'string' || typeof s.meta.edict.since !== 'number')) delete s.meta.edict;
  return s as SaveRoot;
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

export async function loadSave(): Promise<SaveRoot | null> {
  const candidates: SaveRoot[] = [];
  for (const key of IDB_KEYS) {
    try {
      const s = unwrap(await get(key));
      if (s) candidates.push(s);
    } catch {
      /* IndexedDB unavailable (private mode); fall through to the mirror. */
    }
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
  save.savedAt = now;
  const env = wrapSave(save);
  slot = (slot + 1) % IDB_KEYS.length;
  try {
    await set(IDB_KEYS[slot], env);
  } catch {
    writeMirror(save, now);
  }
}

/** Synchronous mirror, used on pagehide where async writes may not finish. */
export function writeMirror(save: SaveRoot, now: number): void {
  save.savedAt = now;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(wrapSave(save)));
  } catch {
    /* quota or disabled storage */
  }
}

export async function wipeSave(): Promise<void> {
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
 * Resolves true if this tab holds the lock.
 */
export function acquireWriterLock(): Promise<boolean> {
  const locks = (navigator as any).locks;
  if (!locks?.request) return Promise.resolve(true);
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

export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}
