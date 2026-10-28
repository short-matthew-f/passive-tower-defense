// The River Styx's pure economy definition (no Pixi): the shared core and the headless balance
// simulation read this; index.ts spreads it into the full DeptDef.
import type { DeptEcon, DeptGoal, NightOrderDef, StewardCandidate } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { longLocked } from '../../core/longnode';
import * as M from './model';

const run = (s: DeptSave) => s.run as M.StyxRun;
const per = (s: DeptSave) => s.persistent as M.StyxPersistent;
const stats = (s: DeptSave) => run(s).stats ?? M.defaultStats();
/** A run with every field present (old or partial saves), without touching persistent data. */
function fullRun(s: DeptSave): M.StyxRun {
  const r = run(s);
  const dr = M.defaultRun();
  r.lv = { ...dr.lv, ...(r.lv ?? {}) };
  r.stats = { ...dr.stats, ...(r.stats ?? {}) };
  r.bands = Math.max(1, Math.min(M.MAX_BANDS, r.bands ?? 1));
  r.wrathMax = r.wrathMax ?? 0;
  r.wrath = Math.min(r.wrath ?? 0, r.wrathMax);
  return r;
}

/** Idle-raising run upgrades (the Steward's list): never baits (consumables) or Wrath (the dial). */
const IDLE_NODES: { id: M.NodeId; label: string }[] = [
  { id: 'netter', label: 'Imp Netter' },
  { id: 'nets', label: 'Bigger Nets' },
  { id: 'poles', label: 'Longer Poles' },
  { id: 'chum', label: 'Chum Barrel' },
  { id: 'legend', label: "Ferryman's Legend" },
];
const legendOpen = (s: DeptSave) => !longLocked(s.cycle?.n ?? 0);
const bandName = (b: number) => (b <= 1 ? `THE ${M.BANDS[b].name}` : M.BANDS[b].name);

/** Night Orders (Wave 1, core/orders.ts): Pilk's lads brew bait, or scout a rare for your return. */
const ORDERS: NightOrderDef[] = [
  { id: 'scout', label: 'SCOUT A RARE', desc: 'A rare soul waits for your hook' },
  { id: 'bait', label: 'BREW BAIT', desc: 'The lads brew bait from the haul' },
];
/** Bait brewed per hour away (BREW BAIT), and the most per absence. */
const BREW_PER_H = { promise: 3, debt: 1.5 };
const BREW_MAX = { promise: 12, debt: 6 };

/** The rare SCOUT A RARE finds: an uncaught rare in the open river first (deepest), else the
 * deepest band's rare. Pure (deterministic on the save). */
export function scoutPick(r: M.StyxRun, p: M.StyxPersistent): { id: string; band: number } {
  const bands = Math.max(1, Math.min(M.MAX_BANDS, r.bands ?? 1));
  for (let b = bands - 1; b >= 0; b--) {
    const sp = M.speciesFor(b, 'rare');
    if (!((p.codex?.[sp.id] ?? 0) > 0)) return { id: sp.id, band: b };
  }
  return { id: M.speciesFor(bands - 1, 'rare').id, band: bands - 1 };
}

export const styxEcon: DeptEcon = {
  id: 'styx',
  version: 1,
  defaultRun: () => M.defaultRun(),
  defaultPersistent: () => M.defaultPersistent(),

  idleRate(save) {
    const r = run(save);
    if (!r || !r.lv) return 0;
    // Partial / older saves: read missing levels as 0 without writing to the save.
    const full: M.StyxRun = { ...r, lv: { ...M.defaultLevels(), ...r.lv }, bands: Math.max(1, Math.min(M.MAX_BANDS, r.bands ?? 1)), wrath: r.wrath ?? 0 };
    return M.idleObols(full, per(save));
  },

  // Souls (00 §4, 03 §16): rare+ catch = 1, every 10th other catch = 1; netters on idle.
  goods: {
    id: 'souls',
    rate: (save) => (run(save)?.lv ? M.netSoulsPerH(run(save)) : 0),
    count: (save) => {
      const s = stats(save);
      return s.rares + Math.max(0, s.lands - s.rares) / 10;
    },
  },

  // Infamy skill gate (00 §2.2, 03 §7): land 20 souls at Wrath >= min(5 + 2N, 20) with <= 30%
  // escapes, including at least one rare or better, on screen.
  skillTarget: (n) => Math.min(5 + 2 * n, M.WRATH_MAX),
  skillLabel: (t) => `LAND ${M.GATE_LANDS} AT WRATH ${t}, 1 RARE`,

  // SIM-TUNED (sim/README.md "Pass 3"), against the balance sim's Styx adapter (sim/adapters/
  // styx.ts: the scene's catch loop ported headless, ~3.5 catches/min for the reference bot) in
  // the reference profile, where the Styx opens on day 2 and gets ~8 on-screen minutes a day
  // beside five other departments, so offline netters carry most of each cycle:
  //  - econBase 1e6 -> 1.2e8: at 1e6 the first Fall came 0.6-0.8 days after the unlock (day 3
  //    08:00, before the Mines); now it lands on day 5 (4.5-4.75 d), ~3 days after the unlock like
  //    the Dungeon and the Bridge. The skill gate (Wrath 5) fills on day 2-3; economy binds.
  //  - rankRef 6 -> 12: idle on the first visit (~14 netters, Bigger Nets ~10) is ~13/s.
  //  - rankTarget 60 -> 250: idle at the first 100% Infamy (20 netters, Bigger Nets 40, Longer
  //    Poles 4, Wrath 5-9) is ~250-280/s. At 6/60 the Styx sat at Rank 70-78 (28% of Tribute).
  // v1.1 (bands 4-5, Twin Hooks, the Chum Barrel, CLEAN reels): the plateau now comes after the
  // Lethe Bottom at ~x20 the income, so econBase 1.2e8 -> 2.5e9 (first Fall day 5 again, ~4.9-5.1 d) and
  // rankTarget 250 -> 4800 (idle at the first 100% Infamy). rankRef stays (early game unchanged).
  // D-styx-01/02 retune: econBase 2.5e9 -> 1.4e9. The reference profile's netters had been
  // fishing with a never-used-up Gilded Obol (the Chum Barrel bug), and its active catches with
  // flat-priced ones; with the barrel eating stock and band-priced bait the first Fall slipped to
  // day 6 21:00. 1.4e9 puts it back at day 5 18:00 (4.75 d).
  // SIM-TUNED (Wave 1): netters fetch only NET_UNKNOWN of the souls the Codex doesn't know, so
  // early idle dips until you have landed each species once; at 1.4e9 the first Fall slipped to
  // day 6 08:00. 1.15e9 puts it back near day 5 evening.
  econBase: 1.15e9,
  rankRef: 12,
  rankTarget: 4800,

  // Chum Barrel bait use (D-styx-01) for the absence just credited (at the offline factor) and
  // the in-session time off screen before it (known only when the absence was not capped).
  onOffline(save, elapsedSeconds, factor, info) {
    const r = run(save);
    const p = per(save);
    if (!r?.lv || !p?.baits) return;
    const t = Math.max(0, elapsedSeconds);
    const before = r.chumAt != null && t < info.capSeconds ? Math.max(0, Math.min(12 * 3600, (info.now - r.chumAt) / 1000 - t)) : 0;
    M.settleChum(r, p, before + t * Math.max(0, factor));
    r.chumAt = info.now;
  },

  // ----- Wave 1: Next Goal ribbon and Night Orders -----

  // The Codex as a goal list (research R4): the next uncaught soul in the open river, else the
  // next band. Opening a band wins once it is half paid for.
  nextGoal(save): DeptGoal | null {
    const r = run(save);
    const p = per(save);
    if (!r?.lv) return null;
    const bands = Math.max(1, Math.min(M.MAX_BANDS, r.bands ?? 1));
    const bank = Math.max(0, r.bank ?? 0);
    const next = bands < M.MAX_BANDS ? M.BANDS[bands] : null;
    const openGoal = next ? { label: `OPEN ${next.name}`.slice(0, 24), progress: Math.min(1, bank / next.cost) } : null;
    if (openGoal && openGoal.progress >= 0.5) return openGoal;
    const open = M.SPECIES.filter((sp) => sp.band >= 0 && sp.band < bands);
    const known = open.filter((sp) => (p?.codex?.[sp.id] ?? 0) > 0).length;
    const gap = open.find((sp) => !((p?.codex?.[sp.id] ?? 0) > 0));
    if (gap) return { label: `??? IN ${bandName(gap.band)}`.slice(0, 24), progress: known / open.length, detail: `CODEX ${known}/${open.length}` };
    if (openGoal) return openGoal;
    if (!((p?.codex?.echo ?? 0) > 0)) return { label: "??? A HERO'S GOLD", progress: 0, detail: 'ANY DEPTH' };
    return null;
  },

  nightOrders: () => ORDERS,

  applyNightOrder(save, orderId, elapsedSeconds) {
    const r = run(save);
    const p = per(save);
    if (!r?.lv || !p?.baits) return;
    const h = Math.max(0, elapsedSeconds) / 3600;
    if (orderId === 'scout') {
      if (h < 0.25) return;
      const pick = scoutPick(r, p);
      p.scout = pick;
      return `${M.SPECIES_BY_ID[pick.id].name.toUpperCase()} SPOTTED`.slice(0, 28);
    }
    if (orderId === 'bait') {
      const add = (id: 'promise' | 'debt') => {
        const n = Math.min(BREW_MAX[id], Math.floor(h * BREW_PER_H[id]), M.BAIT_CAP[id] - (p.baits[id] ?? 0));
        if (n > 0) p.baits[id] = (p.baits[id] ?? 0) + n;
        return Math.max(0, n);
      };
      const a = add('promise');
      const b = (r.bands ?? 1) >= 2 ? add('debt') : 0;
      if (a + b <= 0) return 'NO BAIT BREWED';
      return (b > 0 ? `+${a} PROMISES +${b} DEBTS` : `+${a} BROKEN PROMISES`).slice(0, 28);
    }
  },

  // ----- advancement hooks (00 §2.5, §5.2) -----

  readyBuys(save) {
    const r = fullRun(save);
    const out: { label: string; cost: number }[] = [];
    const node = (id: M.NodeId, label: string) => {
      if (r.lv[id] < M.NODES[id].max) out.push({ label, cost: M.nodeCost(id, r.lv[id]) });
    };
    node('netter', 'Imp Netter');
    node('nets', 'Bigger Nets');
    node('reel', 'Reel Speed');
    node('line', 'Braided Line');
    if (r.bands >= 2) node('poles', 'Longer Poles');
    if (r.bands < M.MAX_BANDS) out.push({ label: M.BANDS[r.bands].name, cost: M.BANDS[r.bands].cost });
    if (r.bands >= 2 && r.wrathMax < M.WRATH_MAX) out.push({ label: `Wrath ${r.wrathMax + 1}`, cost: M.wrathCost(r.wrathMax + 1) });
    if (r.bands >= 2) node('twin', 'Twin Hooks');
    node('chum', 'Chum Barrel');
    return out.sort((a, b) => a.cost - b.cost).slice(0, 6);
  },

  stewardCandidates(save) {
    const r = fullRun(save);
    const p = per(save);
    const out: StewardCandidate[] = [];
    for (const { id, label } of IDLE_NODES) {
      if (r.lv[id] >= M.NODES[id].max) continue;
      if (id === 'legend' && !legendOpen(save)) continue;
      out.push({
        id,
        label,
        cost: M.nodeCost(id, r.lv[id]),
        deltaIdle: M.idleDelta(r, p, id),
        buy: () => {
          if (r.lv[id] < M.NODES[id].max) r.lv[id]++;
        },
      });
    }
    if (r.bands < M.MAX_BANDS) {
      out.push({
        id: 'deeper',
        label: M.BANDS[r.bands].name,
        cost: M.BANDS[r.bands].cost,
        deltaIdle: M.idleDelta(r, p, 'deeper'),
        buy: () => {
          if (r.bands < M.MAX_BANDS) r.bands++;
          if (p) p.maxBand = Math.max(p.maxBand ?? 1, r.bands);
        },
      });
    }
    return out;
  },

  // Head Start (00 §2.5): the first 2L Wrath levels and 1 + L free Imp Netters. Idempotent.
  applyHeadStart(save, level) {
    const r = fullRun(save);
    const L = Math.max(0, Math.min(5, Math.floor(level)));
    if (L <= 0) return;
    const w = Math.min(M.WRATH_MAX, 2 * L);
    if (r.wrathMax < w) r.wrathMax = w;
    r.lv.netter = Math.max(r.lv.netter, Math.min(M.NODES.netter.max, 1 + L));
  },

  signature: {
    name: 'Old Charts',
    desc: 'Each cycle starts with the Murk open and 2 Imp Netters.',
    apply(save) {
      const r = fullRun(save);
      r.bands = Math.max(r.bands, 2);
      r.lv.netter = Math.max(r.lv.netter, 2);
      const p = per(save);
      if (p) p.maxBand = Math.max(p.maxBand ?? 1, r.bands);
    },
  },

  commendations: [
    { id: 'first', label: 'FIRST SOUL LANDED', test: (s) => stats(s).lands >= 1 },
    { id: 'imp', label: 'HIRED AN IMP', test: (s) => (run(s).lv?.netter ?? 0) >= 1 },
    { id: 'murk', label: 'INTO THE MURK', test: (s) => (run(s).bands ?? 1) >= 2 },
    { id: 'rare', label: 'A RARE CATCH', test: (s) => stats(s).rares >= 1 },
    { id: 'combo', label: 'TEN IN A ROW', test: (s) => stats(s).bestCombo >= 10 },
    { id: 'codex', label: 'CODEX: 6 SPECIES', test: (s) => M.codexCount(per(s) ?? M.defaultPersistent()) >= 6 },
    { id: 'wrath', label: 'RIVER WRATH 3', test: (s) => (run(s).wrathMax ?? 0) >= 3 },
    { id: 'hundred', label: '100 SOULS LANDED', test: (s) => stats(s).lands >= 100 },
    { id: 'clean', label: 'A CLEAN REEL', test: (s) => (stats(s).cleans ?? 0) >= 1 },
    { id: 'wall', label: 'FIRST TROPHY MOUNTED', test: (s) => (per(s)?.wall?.length ?? 0) >= 1 },
    { id: 'lethe', label: 'THE LETHE BOTTOM', test: (s) => (run(s).bands ?? 1) >= 5 },
  ],
};
