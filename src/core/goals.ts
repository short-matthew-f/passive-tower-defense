// The Next Goal ribbon (fun plan A3) and progressive disclosure of sealed doors (research R5).
// Pure: picks the single most enticing goal for the Throne Room or one department by a fixed
// priority rule, from the save and the department definitions. UI lives in ui/ribbon.ts.
import type { DeptEcon, DeptGoal } from './dept';
import { infamy } from './economy';
import { legendPreview } from './legends';
import { SEAL_COST, SEAL_DREAD } from './meta';
import { DEPT_ORDER, type DeptId, type SaveRoot } from './types';

export const DEPT_NAMES: Record<DeptId, string> = {
  cauldron: 'CAULDRON',
  mines: 'MINES',
  dungeon: 'DUNGEON',
  bridge: 'BRIDGE',
  styx: 'STYX',
  spire: 'SPIRE',
  pit: 'WAR PIT',
};

/** Where tapping the ribbon (or the report's GO) takes the player. */
export type GoalGo = { kind: 'enter'; id: DeptId } | { kind: 'seal'; id: DeptId } | { kind: 'throne' } | { kind: 'none' };

export interface Goal {
  /** Stable identity of the goal (a change can play a small reveal). */
  key: string;
  /** Upper case, without the progress: 'UNSEAL THE STYX'. */
  text: string;
  /** 0-1, or null for no bar. */
  progress: number | null;
  /** Progress text: '72%', '230/400', 'READY'. */
  detail: string;
  go: GoalGo;
  /** Urgent (a Legend waits, a Seal is affordable): the ribbon pulses. */
  hot?: boolean;
}

/** A sealed door shows its price once the player holds this share of it (and its Dread gate). */
export const REVEAL_FRAC = 0.5;

/** Defs the goal rules need: the pure economy plus the display names it may use. */
export type GoalDef = DeptEcon & { legend?: { name: string }; currency?: string; readyBuys?: DeptEcon['readyBuys'] };

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const pct = (x: number) => `${Math.floor(clamp01(x) * 100)}%`;

/** "Dame Brightjaw the Unreasonably Tall" -> "DAME BRIGHTJAW" (up to the first "the", <= 2 words). */
export function shortLegend(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    if (/^the$/i.test(w) || out.length >= 2) break;
    out.push(w);
  }
  return (out.length ? out : words.slice(0, 1)).join(' ').toUpperCase();
}

/** Whether a sealed, built department is within reach (its rumour turns into a price). Once
 * revealed (meta.seen['reveal.<id>']) it stays revealed. */
export function sealRevealed(s: SaveRoot, id: DeptId): boolean {
  if (s.depts[id]) return true;
  if (s.meta.seen?.[`reveal.${id}`]) return true;
  return sealInReach(s, id);
}

/** The live reach test (no latch): Dread gate met and >= REVEAL_FRAC of the Tribute price held. */
export function sealInReach(s: SaveRoot, id: DeptId): boolean {
  if (s.meta.dreadLifetime < (SEAL_DREAD[id] ?? 0)) return false;
  return s.meta.tribute + 1e-9 >= REVEAL_FRAC * SEAL_COST[id];
}

/** Sealed built departments that just came within reach and haven't had their reveal moment;
 * marks them seen (the caller plays the moment). */
export function takeReveals(s: SaveRoot, built: DeptId[]): DeptId[] {
  const out: DeptId[] = [];
  for (const id of built) {
    if (s.depts[id] || s.meta.seen?.[`reveal.${id}`]) continue;
    if (!sealInReach(s, id)) continue;
    (s.meta.seen ??= {})[`reveal.${id}`] = 1;
    out.push(id);
  }
  return out;
}

/** The next sealed built department in unlock order (null when all are open). */
export function nextSealed(s: SaveRoot, built: DeptId[]): DeptId | null {
  for (const id of DEPT_ORDER) if (built.includes(id) && !s.depts[id]) return id;
  return null;
}

function legendGoal(s: SaveRoot, id: DeptId, def: GoalDef, defs: Record<string, GoalDef>): Goal | null {
  const d = s.depts[id];
  if (!d) return null;
  let v = 0;
  try {
    v = infamy(def, d).value;
  } catch {
    return null;
  }
  // The roster's next Legend (core/legends.ts: silhouetted "???" until met), else the def's name.
  let who = def.legend?.name ? shortLegend(def.legend.name) : `THE ${DEPT_NAMES[id]} LEGEND`;
  try {
    const p = legendPreview(s, id, def as Parameters<typeof legendPreview>[2], defs, Date.now());
    if (p?.label) who = p.label.toUpperCase();
  } catch {
    /* keep the fallback */
  }
  return { key: `legend.${id}.${d.cycle.n}`, text: `NEXT LEGEND: ${who}`, progress: clamp01(v / 100), detail: pct(v / 100), go: { kind: 'enter', id } };
}

function deptGoal(s: SaveRoot, id: DeptId, def: GoalDef): Goal | null {
  const d = s.depts[id];
  if (!d) return null;
  // The department's own hook first.
  if (def.nextGoal) {
    try {
      const g: DeptGoal | null = def.nextGoal(d);
      if (g && typeof g.label === 'string' && g.label) {
        const p = clamp01(g.progress);
        return { key: `dept.${id}.${g.label}`, text: g.label.toUpperCase(), progress: p, detail: g.detail ?? (p >= 1 ? 'READY' : pct(p)), go: { kind: 'enter', id }, hot: p >= 1 };
      }
    } catch {
      /* fall back */
    }
  }
  // Core fallback: the cheapest Ready buy not yet affordable.
  const list = (() => {
    try {
      return def.readyBuys ? def.readyBuys(d) : (def.stewardCandidates?.(d) ?? []).map((c) => ({ label: c.label ?? c.id, cost: c.cost }));
    } catch {
      return [];
    }
  })();
  const bank = d.run.bank;
  const next = list
    .filter((b) => b && Number.isFinite(b.cost) && b.cost > bank + 1e-9 && b.cost < bank * 50 + 1e3)
    .sort((a, b) => a.cost - b.cost)[0];
  if (next) {
    const label = String(next.label).toUpperCase().slice(0, 18);
    return { key: `buy.${id}.${label}`, text: `BUY ${label}`, progress: clamp01(bank / next.cost), detail: pct(bank / next.cost), go: { kind: 'enter', id } };
  }
  return null;
}

function sealGoals(s: SaveRoot, defs: Record<string, GoalDef>): { ready: Goal | null; reach: Goal | null; rumour: Goal | null } {
  const built = DEPT_ORDER.filter((id) => defs[id]);
  const id = nextSealed(s, built);
  if (!id) return { ready: null, reach: null, rumour: null };
  const cost = SEAL_COST[id];
  const dreadOk = s.meta.dreadLifetime >= (SEAL_DREAD[id] ?? 0);
  const name = DEPT_NAMES[id];
  if (dreadOk && s.meta.tribute + 1e-9 >= cost)
    return { ready: { key: `seal.${id}`, text: `UNSEAL THE ${name}`, progress: 1, detail: 'READY', go: { kind: 'seal', id }, hot: true }, reach: null, rumour: null };
  if (dreadOk && sealRevealed(s, id))
    return { ready: null, reach: { key: `seal.${id}`, text: `UNSEAL THE ${name}`, progress: clamp01(s.meta.tribute / cost), detail: pct(s.meta.tribute / cost), go: { kind: 'seal', id } }, rumour: null };
  // Not in reach: a rumour, its progress toward the reveal (Tribute), or the Dread it waits for.
  if (!dreadOk) {
    const need = SEAL_DREAD[id] ?? 0;
    return { ready: null, reach: null, rumour: { key: `rumour.${id}`, text: 'A SEALED DOOR WANTS DREAD', progress: clamp01(s.meta.dreadLifetime / need), detail: `${Math.floor(s.meta.dreadLifetime)}/${need}`, go: { kind: 'none' } } };
  }
  const p = s.meta.tribute / (REVEAL_FRAC * cost);
  return { ready: null, reach: null, rumour: { key: `rumour.${id}`, text: 'SOMETHING STIRS BEHIND A DOOR', progress: clamp01(p), detail: pct(p), go: { kind: 'none' } } };
}

/**
 * The single next goal. Priority, Throne Room: a waiting Legend > an affordable Seal > the nearest
 * of (a Legend at >= 80% Infamy, a revealed Seal) by progress > the revealed Seal > the best
 * Legend > a rumour about the next sealed door. Department: its waiting
 * Legend > an affordable Seal > its own nextGoal (or the cheapest Ready buy not yet affordable) >
 * its Legend.
 */
export function pickGoal(s: SaveRoot, defs: Record<string, GoalDef>, where: DeptId | 'throne'): Goal | null {
  const open = DEPT_ORDER.filter((id) => defs[id] && s.depts[id]);
  const seals = sealGoals(s, defs);
  if (where !== 'throne') {
    const def = defs[where];
    const d = s.depts[where];
    if (!def || !d) return null;
    if (d.cycle.legendWaiting)
      return { key: `wait.${where}.${d.cycle.n}`, text: `LEGEND AT THE DOOR! TAP {skull}`, progress: 1, detail: 'NOW', go: { kind: 'none' }, hot: true };
    if (seals.ready) return { ...seals.ready, go: { kind: 'throne' } };
    return deptGoal(s, where, def) ?? legendGoal(s, where, def, defs);
  }
  const waiting = open.find((id) => s.depts[id]!.cycle.legendWaiting);
  if (waiting) {
    const def = defs[waiting];
    const who = def.legend?.name ? shortLegend(def.legend.name) : 'A LEGEND';
    return { key: `wait.${waiting}.${s.depts[waiting]!.cycle.n}`, text: `${who} AT THE ${DEPT_NAMES[waiting]}!`, progress: 1, detail: 'GO', go: { kind: 'enter', id: waiting }, hot: true };
  }
  if (seals.ready) return seals.ready;
  const legends = open.map((id) => legendGoal(s, id, defs[id], defs)).filter((g): g is Goal => !!g);
  legends.sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0));
  const near = [legends[0], seals.reach].filter((g): g is Goal => !!g && (g === seals.reach || (g.progress ?? 0) >= 0.8));
  near.sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0));
  if (near[0]) return near[0];
  if (seals.reach) return seals.reach;
  return legends[0] ?? seals.rumour;
}

/** The goal a department would show, for a Throne door or the report (exported for tests). */
export const deptGoalFor = (s: SaveRoot, defs: Record<string, GoalDef>, id: DeptId): Goal | null => (defs[id] && s.depts[id] ? deptGoal(s, id, defs[id]) : null);
