// The Cauldron's pure economy definition (no Pixi): the shared core and the headless balance
// simulation (sim/) read this; index.ts spreads it into the full DeptDef.
import type { Commendation, DeptEcon, DeptGoal, NightOrderDef, StewardCandidate } from '../../core/dept';
import { ORDER_EFFECTS } from '../../core/orders';
import type { DeptSave } from '../../core/types';
import {
  goldCount,
  heldMalice,
  JACKPOT,
  defaultPersistent,
  defaultRun,
  dropsPerSec,
  fillRun,
  idleRateOf,
  lvOf,
  MALICE_MAX,
  maliceCost,
  upCost,
  UPGRADES,
  upLocked,
  type CPersistent,
  type CRun,
} from './econ';
import { INGREDIENTS, SPECIALS } from './sim';

const run = (s: DeptSave) => s.run as CRun;
const stats = (s: DeptSave) => run(s).stats ?? ({} as CRun['stats']);
const lv = (s: DeptSave, id: string) => run(s).lv?.[id] ?? 0;

export const commendations: Commendation[] = [
  { id: 'batch1', label: 'FIRST BATCH', test: (s) => (stats(s).batches ?? 0) >= 1 },
  { id: 'toads4', label: 'FOUR WARTY HANDS', test: (s) => lv(s, 'hire') >= 3 },
  { id: 'jackpot', label: 'SWEET MIDDLE', test: (s) => lv(s, 'jackpot') >= 1 },
  { id: 'drops1k', label: '1,000 DROPS', test: (s) => (stats(s).drops ?? 0) >= 1000 },
  { id: 'goldTriple', label: 'GOLDEN TRIPLE', test: (s) => (stats(s).goldTriples ?? 0) >= 1 },
  { id: 'malice1', label: 'A NASTIER BOARD', test: (s) => (run(s).maliceBought ?? 0) >= 1 },
  { id: 'batch10', label: 'TEN BATCHES', test: (s) => (stats(s).batches ?? 0) >= 10 },
  { id: 'million', label: 'A MILLION BILE', test: (s) => s.cycle.earnings >= 1e6 },
];

/** Bile-priced run nodes that raise idleRate (the Steward's list and the Ready list). */
function idleNodes(s: DeptSave) {
  const r = run(s);
  if (!r?.lv) return [];
  return UPGRADES.filter((u) => !u.tokens && !u.activeOnly && !upLocked(u, s.cycle.n) && lvOf(r, u.id) < u.max);
}

const exotic = (s: DeptSave) => s.imports?.contraband ?? 0;

const ORD = ['1ST', '2ND', '3RD'];
const ordinal = (n: number) => ORD[n - 1] ?? `${n}TH`;

/** Next-goal candidates: buys that change what you see or do (not the +% rows). */
function visibleGoals(s: DeptSave): { label: string; cost: number }[] {
  const r = run(s);
  const out: { label: string; cost: number }[] = [];
  const add = (id: string, label: string) => {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u || upLocked(u, s.cycle.n) || lvOf(r, id) >= u.max) return;
    out.push({ label, cost: upCost(u, lvOf(r, id)) });
  };
  add('hire', `HIRE ${ordinal(lvOf(r, 'hire') + 2)} TOADLING`);
  // Specials unlock one at a time (the next one appears once the one before is owned).
  const nextSpecial = SPECIALS.find((id) => lvOf(r, id) <= 0);
  if (nextSpecial) add(nextSpecial, `UNLOCK ${INGREDIENTS[nextSpecial].name.toUpperCase()}`);
  add('jackpot', `JACKPOT X${JACKPOT[Math.min(JACKPOT.length - 1, lvOf(r, 'jackpot') + 1)]}`);
  add('gold', `GOLD PEG ${goldCount(r) + 1}`);
  add('row', 'EXTRA PEG ROW');
  if (lvOf(r, 'bone') === 0) add('bone', 'BONE PEGS');
  if (lvOf(r, 'rune') === 0) add('rune', 'RUNE PEGS');
  if (lvOf(r, 'thorn') === 0) add('thorn', 'THORN PEGS');
  if ((r.maliceBought ?? 0) < MALICE_MAX) out.push({ label: `MALICE ${(r.maliceBought ?? 0) + 1}`, cost: maliceCost(r.maliceBought ?? 0) });
  return out;
}

/** The Cauldron's Night Orders (core/orders.ts): Granny simmers a Fever, or stinks up the realm. */
function cauldronOrders(): NightOrderDef[] {
  const inc = Math.round((ORDER_EFFECTS.income.bank - 1) * 100);
  const gate = ORDER_EFFECTS.gate.gate;
  return [
    { id: 'simmer', label: 'SIMMER A FEVER', desc: inc > 0 ? `+${inc}% Bile, a Fever on return` : 'Brew Bile, a Fever on return', kind: 'income' },
    { id: 'stink', label: 'STINK THE REALM', desc: `Legend gate x${gate}, order prepped`, kind: 'gate' },
  ];
}
/** Absences shorter than this leave the order's own effect out (the core part still applies). */
const ORDER_MIN_S = 600;

export const cauldronEcon: DeptEcon = {
  id: 'cauldron',
  version: 1,
  defaultRun,
  defaultPersistent,
  idleRate(save) {
    const r = save.run as CRun;
    if (!r || !r.lv) return 0;
    // Partial / odd saves: read the dial clamped to what was bought (no write to the save).
    const m = Math.max(0, Math.min(MALICE_MAX, r.maliceBought ?? 0, Number.isFinite(r.malice) ? r.malice : 0));
    return idleRateOf(m === r.malice ? r : { ...r, malice: m }, exotic(save));
  },
  // Potions (00 §4, 05 §16): 1 per Batch (active) and 1 per 3,000 toadling drops (passive).
  goods: {
    id: 'potions',
    rate: (save) => {
      const r = save.run as CRun;
      return r?.lv ? (dropsPerSec(r) * 3600) / 3000 : 0;
    },
    count: (save) => (stats(save).batches ?? 0) + (stats(save).drops ?? 0) / 3000,
  },
  // Infamy skill gate (05 §7, 00 §2.2): 5 Batches at Malice >= min(4 + N, 10).
  // SIM-TUNED (sim/README.md "Pass 6"): min(5 + N, 10) from the second cycle on (the first stays
  // Malice 4). The starter Fell 6 times in week 1 (cycle 1 lasted ~13 h, overnight) and took ~45%
  // of the day-7 Dread (cap 35% at 7 departments); weeks 2-4 hit the Malice 10 cap either way.
  skillTarget: (n) => (n === 0 ? 4 : Math.min(5 + n, 10)),
  skillLabel: (t) => `5 BATCHES AT MALICE ${t}`,
  // SIM-TUNED (sim/README.md "Tuning log"). Idle rate runs ~1.5/s at start, ~8K/s after 10 min on
  // screen and ~3.5e5/s at the first 100% Infamy (gold pegs now counted, econ.ts expectedMult).
  //  - econBase 6e9 -> 2.4e9 (second pass, with 4 departments): the reference player fills the
  //    economy gate during the day-1 evening session at ~3.1-3.3 h active-equivalent (00 §8 hard
  //    band 3-4 h +- 1 h). With the Dungeon and the Bridge open on day 1 the Cauldron gets fewer
  //    of the 90 minutes, and 6e9 slipped the Fall to day 2 08:00 at ~5.7 h AE (the night adds
  //    ~2 h AE of offline income at the ~4x active:offline ratio), outside the hard band.
  //  - rankRef: idleRate after ~10 min on screen; rankTarget: idleRate at the first 100% Infamy.
  //  - econBase 2.4e9 -> 3.6e9 (with econ.ts MALICE_LATE 2 -> 2.5): idleRate now counts the
  //    toadling rain's specials (D-cauldron-03, ~+5-8% late), which ran the mid-game cycles faster
  //    and put the day-7 Dread share over 35%. The first Fall still lands in the day-1 evening
  //    session (~3.5-3.8 h AE); 5e9+ slips it to day 2 08:00 (~6 h AE, out of the hard band).
  econBase: 3.6e9,
  rankRef: 8000,
  rankTarget: 350_000,
  commendations,

  // ---------- Wave 1: Next Goal ribbon and Night Orders ----------

  /** The Legend's skill gate when it is the blocker, else the cheapest visible buy (ready or not). */
  nextGoal(save): DeptGoal | null {
    const r = run(save);
    if (!r?.lv) return null;
    const target = cauldronEcon.skillTarget(save.cycle?.n ?? 0);
    if ((r.maliceBought ?? 0) >= target && heldMalice(r) < target) {
      let n = 0;
      for (let m = target; m <= MALICE_MAX; m++) n += r.batchByMal?.[m] ?? 0;
      return { label: `5 BATCHES AT MALICE ${target}`.slice(0, 24), progress: Math.min(1, n / 5), detail: `${Math.min(5, n)}/5` };
    }
    const bank = r.bank ?? 0;
    const list = visibleGoals(save).sort((a, b) => a.cost - b.cost);
    // A visible buy you can afford now first (READY), else the cheapest one you're saving for.
    const next = list.find((g) => g.cost <= bank) ?? list[0];
    if (!next) return null;
    return { label: next.label.slice(0, 24), progress: next.cost > 0 ? Math.min(1, bank / next.cost) : 1 };
  },

  nightOrders: () => cauldronOrders(),

  applyNightOrder(save, orderId, elapsedSeconds) {
    try {
      const r = run(save);
      if (!r?.lv || !(elapsedSeconds >= ORDER_MIN_S)) return;
      if (orderId === 'simmer') {
        // The first decent landing on return spins a sure Bubble Fever (logic.ts).
        r.feverPrimed = true;
        return 'A FEVER IS BUBBLING!';
      }
      if (orderId === 'stink') {
        // Granny preps the order: every line but the last item filled, so one shot finishes it.
        let prepped = false;
        for (const t of [r.ticket, r.ticket2]) {
          if (!t?.items?.length) continue;
          t.items.forEach((it, i) => {
            const want = i === t.items.length - 1 ? Math.max(0, it.n - 1) : it.n;
            if (it.got < want) {
              it.got = want;
              prepped = true;
            }
          });
        }
        return prepped ? 'ORDER READY: ONE MORE SHOT' : undefined;
      }
    } catch {
      /* never throws */
    }
  },

  // ---------- advancement hooks (00 §2.5, §5.2) ----------

  /** Gobbo's Ready list: the next Malice level and the idle nodes, cheapest first. */
  readyBuys(save) {
    const r = run(save);
    if (!r?.lv) return [];
    const out = idleNodes(save).map((u) => ({ label: u.name, cost: upCost(u, lvOf(r, u.id)) }));
    if ((r.maliceBought ?? 0) < MALICE_MAX) out.push({ label: `Malice ${r.maliceBought + 1}`, cost: maliceCost(r.maliceBought) });
    return out.sort((a, b) => a.cost - b.cost).slice(0, 6);
  },

  /** The Steward: idle nodes only (no Malice levels, no active-only nodes, no Batch Tokens). */
  stewardCandidates(save) {
    const r = run(save);
    if (!r?.lv) return [];
    fillRun(r);
    const base = idleRateOf(r, exotic(save));
    return idleNodes(save).map((u): StewardCandidate => {
      const l = lvOf(r, u.id);
      const next = { ...r, lv: { ...r.lv, [u.id]: l + 1 } };
      return {
        id: u.id,
        label: u.name,
        cost: upCost(u, l),
        deltaIdle: idleRateOf(next, exotic(save)) - base,
        buy: () => {
          // The core already took the cost: only raise the level (never past max).
          if (lvOf(r, u.id) === l && l < u.max) r.lv[u.id] = l + 1;
        },
      };
    });
  },

  /** Head Start (00 §2.5): own the first 2L Malice levels and 1 + L free toadlings. Idempotent. */
  applyHeadStart(save, level) {
    const r = run(save);
    if (!r || level < 1) return;
    fillRun(r);
    r.maliceBought = Math.max(r.maliceBought, Math.min(MALICE_MAX, 2 * level));
    r.lv.hire = Math.max(lvOf(r, 'hire'), Math.min(7, 1 + level));
  },

  /** Granny's Book (00 §2.5): Mandrake and Splitroot are pre-unlocked. */
  signature: {
    name: "Granny's Book",
    desc: 'Mandrake & Splitroot unlocked',
    apply(save) {
      const r = run(save);
      if (!r) return;
      fillRun(r);
      r.lv.mandrake = Math.max(lvOf(r, 'mandrake'), 1);
      r.lv.splitroot = Math.max(lvOf(r, 'splitroot'), 1);
    },
  },
};

/** Persistent save helper for the scene (tokens, recipes, layouts). */
export const persistentOf = (s: DeptSave) => s.persistent as CPersistent;
