// The Goblin Mines' pure economy definition (no Pixi): the shared core and the headless
// balance simulation (sim/) read this; index.ts spreads it into the full DeptDef.
import type { DeptEcon, StewardCandidate } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { longLocked } from '../../core/longnode';
import * as M from './model';

const run = (s: DeptSave) => s.run as M.MinesRun;
const per = (s: DeptSave) => s.persistent as M.MinesPersistent;
const ensure = (s: DeptSave) => {
  if (!M.isNormal(s.run, s.persistent)) M.normalize(s.run, s.persistent);
};
const bonesOf = (s: DeptSave) => s.imports?.bones ?? 0;

/** Deepest depth ever opened (lifetime; kept through Falls for the Express Lift). */
const everOf = (s: DeptSave) => Math.max(s.lifetime.best.maxDepth ?? 1, run(s).maxDepth ?? 1);

/** One purchasable level as pure save data (for the Steward and the Ready list). */
interface Buy {
  id: string;
  label: string;
  cost: number;
  apply(r: M.MinesRun): void;
  /** Counts toward idleRate (Steward candidate). */
  idle: boolean;
}

/** The next level of every Nugget node that can be bought now, except Dig Deeper (the dial). */
function buys(s: DeptSave): Buy[] {
  const r = run(s);
  const p = per(s);
  const out: Buy[] = [];
  const add = (id: string, label: string, ok: boolean, cost: number, apply: (r: M.MinesRun) => void, idle = false) => {
    if (ok && Number.isFinite(cost)) out.push({ id, label, cost, apply, idle });
  };
  const crewRoom = M.crewSize(r, bonesOf(s)) < M.MAX_GOBLINS;
  const hire = M.hireCost(r);
  add('hire', 'Grunt', crewRoom, hire, (x) => x.grunts++, true);
  add('sapper', 'Sapper', crewRoom && r.maxDepth >= M.SAPPER_DEPTH, 2 * hire, (x) => x.sappers++, true);
  add('shocker', 'Shocker', crewRoom && r.maxDepth >= M.SHOCKER_DEPTH, 3 * hire, (x) => x.shockers++, true);
  add('prospector', 'Prospector', crewRoom && r.maxDepth >= M.PROSPECTOR_DEPTH, 3 * hire, (x) => x.prospectors++, true);
  add('picks', 'Sharper Picks', r.picks < M.PICKS_MAX, M.picksCost(r.picks), (x) => x.picks++, true);
  add('tier', 'Pick Tier', r.tier < M.TIER_MAX, M.tierCost(r.tier), (x) => x.tier++, true);
  add('regrow', 'Rock Regrowth', r.regrow < M.REGROW_MAX, M.regrowCost(r.regrow), (x) => x.regrow++, true);
  add('lanterns', 'Lanterns', r.lanterns < M.LANTERNS_MAX && everOf(s) >= M.GAS_DEPTH - 5, M.lanternsCost(r.lanterns), (x) => x.lanterns++, true);
  add('drummers', 'Drummer', p.drum && r.drummers < M.DRUMMERS_MAX, M.drummerCost(r.drummers), (x) => x.drummers++, true);
  add('seams', 'Richer Seams', !longLocked(s.cycle.n), M.seamsCost(r.seams ?? 0), (x) => (x.seams = (x.seams ?? 0) + 1), true);
  add('tap', 'Tap Damage', true, M.tapCost(r.tap), (x) => x.tap++);
  add('critC', 'Crit Chance', r.critC < M.CRIT_C_MAX, M.critCost(r.critC), (x) => x.critC++);
  add('critP', 'Crit Power', r.critP < M.CRIT_P_MAX, M.critPowerCost(r.critP), (x) => x.critP++);
  add('keen', 'Keen Eye', r.keen < M.KEEN_MAX, M.keenCost(r.keen), (x) => x.keen++);
  add('knuckles', 'Heavy Knuckles', r.knuckles < M.KNUCKLES_MAX, M.knucklesCost(r.knuckles), (x) => x.knuckles++);
  add('supports', 'Timber Supports', r.supports < M.SUPPORTS_MAX && everOf(s) >= 12, M.supportsCost(r.supports), (x) => x.supports++);
  if (p.drum) {
    add('drumhead', 'Drumhead', r.drumhead < M.DRUMHEAD_MAX, M.drumheadCost(r.drumhead), (x) => x.drumhead++);
    add('wide', 'Wide Swing', r.wide < M.WIDE_MAX, M.wideCost(r.wide), (x) => x.wide++);
    add('frenzy', 'Goblin Frenzy', r.frenzy < M.FRENZY_MAX, M.frenzyCost(r.frenzy), (x) => x.frenzy++);
  }
  return out;
}

export const minesEcon: DeptEcon = {
  id: 'mines',
  version: 1,
  defaultRun: () => M.defaultRun(),
  defaultPersistent: () => M.defaultPersistent(),

  idleRate(save) {
    ensure(save);
    return M.idleNuggets(run(save), per(save), bonesOf(save));
  },

  // Ingots (00 §4, 02 §16): 2% of Ore Veins, plus 5 per Motherlode on the live wall.
  goods: {
    id: 'ingots',
    rate: (save) => {
      const r = run(save);
      const p = per(save);
      if (!r || !p) return 0;
      ensure(save);
      return M.crewIngotsPerH(r, p, bonesOf(save));
    },
    count: (save) => (run(save).stats?.veins ?? 0) * M.INGOT_PER_VEIN + (run(save).stats?.mothers ?? 0) * M.MOTHER_INGOTS,
  },

  // Infamy skill gate (00 §2.2, 02 §7): break 50 rocks at depth 30 + 5N, on screen.
  // SIM-TUNED: capped at the dial's max depth. Uncapped, Fall #7 asked for depth 65 on a 60-deep
  // shaft and the Mines stalled at 92% Infamy for good; capped, overflow comes from the economy
  // gate alone, as 00 §2.2 specifies for a capped dial.
  skillTarget: (n) => Math.min(30 + 5 * n, M.MAX_DEPTH),
  skillLabel: (t) => `BREAK ${M.GATE_ROCKS} ROCKS AT DEPTH ${t}`,

  // SIM-TUNED (sim/README.md "Tuning log"), drum-on reference bot:
  //  - econBase: the economy gate fills on the evening of day 2 (00 §6 wants day 3), with cycles
  //    of ~2 days after it. That is ~9 h active-equivalent, above the 3-4 h +- 1 h the 00 §8
  //    milestone states for the first (Cauldron) Fall: the night and day gaps add ~4 h AE a day at
  //    the Mines' ~4x active:offline ratio, so the arc day and the AE band can't both hold. Higher
  //    values reach day 3 but bring the later-cycle plateau stall (README tuning log) a Fall sooner.
  //    SIM-TUNED 2.5e10 -> 3.2e10 (finishing pass): Motherlodes (+14% reward per rock), Shockers
  //    and the later nodes shortened the week-1 cycles to ~1.3-1.5 days (band 1.5-3); at 3.2e10
  //    they read ~1.75 days and the first Fall stays on day 3 08:00. (4e10 also held the Mines
  //    bands but moved the first Fall to 12:30, which shifted the Cauldron's baseline minutes
  //    out of its on-screen band in the shared reference week.)
  //  - rankRef: on-screen idle about 10 min into the crew build (~20/s).
  //  - rankTarget: idleRate at the first 100% Infamy (~2e5/s, near the maxed crew).
  econBase: 3.2e10,
  rankRef: 20,
  rankTarget: 2e5,

  commendations: [
    { id: 'firstRock', label: 'FIRST ROCK SMASHED', test: (s) => (run(s).stats?.rocks ?? 0) >= 1 },
    { id: 'hired', label: 'HIRED HELP', test: (s) => M.goblins(run(s)) >= 1 },
    { id: 'crunch', label: 'CRUNCH! 25 CRITS', test: (s) => (run(s).stats?.crits ?? 0) >= 25 },
    { id: 'geode', label: 'FIRST GEODE', test: (s) => (per(s).gemsEver ?? 0) >= 1 },
    { id: 'kaboom', label: 'KABOOM: 10 KEGS', test: (s) => (run(s).stats?.kegs ?? 0) >= 10 },
    { id: 'shiny', label: 'SHINY HUNTER: 50 VEINS', test: (s) => (run(s).stats?.veins ?? 0) >= 50 },
    { id: 'drum', label: 'FIRST DOOM DRUM BOOM', test: (s) => !!per(s).drum },
    { id: 'iron', label: 'INTO THE IRON: DEPTH 21', test: (s) => (s.lifetime.best.maxDepth ?? 1) >= 21 },
  ],

  // ----- advancement hooks (00 §2.5, §5.2) -----

  /** Gobbo's Satchel Ready list: the cheapest next levels (the core keeps the affordable ones). */
  readyBuys(save) {
    ensure(save);
    const list = buys(save).sort((a, b) => a.cost - b.cost);
    // Dig Deeper is a sensible buy too (the dial), just never the Steward's.
    const r = run(save);
    if (r.maxDepth < M.MAX_DEPTH) list.push({ id: 'dig', label: `Dig to D${r.maxDepth + 1}`, cost: M.digCost(r.maxDepth), apply: () => {}, idle: false });
    return list
      .filter((b) => b.cost <= r.bank + 1e-9)
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 5)
      .map((b) => ({ label: b.label, cost: b.cost }));
  },

  /** The Steward's list: idle-raising levels only (no Dig Deeper, no consumables). buy() only
   * raises the level; the core has already taken the price. */
  stewardCandidates(save) {
    ensure(save);
    const base = M.idleNuggets(run(save), per(save), bonesOf(save));
    const out: StewardCandidate[] = [];
    for (const b of buys(save)) {
      if (!b.idle) continue;
      const r2 = { ...run(save), stats: run(save).stats, gate: run(save).gate };
      b.apply(r2);
      const delta = M.idleNuggets(r2, per(save), bonesOf(save)) - base;
      out.push({ id: b.id, label: b.label, cost: b.cost, deltaIdle: delta, buy: () => b.apply(run(save)) });
    }
    return out;
  },

  /** Head Start (00 §2.5): the first 2L dial levels (depths 2..1+2L) and 1 + L free Grunts.
   * Idempotent (max, not +=); touches only the fresh run. */
  applyHeadStart(save, level) {
    ensure(save);
    const r = run(save);
    const L = Math.max(0, Math.floor(level));
    if (L <= 0) return;
    r.maxDepth = Math.min(M.MAX_DEPTH, Math.max(r.maxDepth, 1 + 2 * L));
    const want = Math.min(M.MAX_GOBLINS, 1 + L);
    if (M.goblins(r) < want) r.grunts += want - M.goblins(r);
  },

  /** Signature: Express Lift (00 §2.5). Every cycle the shaft is already dug to maxDepthEver - 15
   * (Dig cost paid up to there); the lever can pick any of it. Idempotent. */
  signature: {
    name: 'Express Lift',
    desc: 'SHAFT STARTS DUG TO MAX DEPTH EVER -15',
    apply(save) {
      ensure(save);
      const r = run(save);
      const to = Math.max(1, Math.min(M.MAX_DEPTH, everOf(save) - 15));
      r.maxDepth = Math.max(r.maxDepth, to);
    },
  },
};
