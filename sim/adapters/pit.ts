// War Pit adapter. Everything the Pit pays comes from its pure modules: Runs are played on the
// real shop and battle rules (src/depts/pit/run.ts, engine.ts) by the greedy draft bot
// (src/depts/pit/bot.ts), and Skirmishes pay the real memoized Gauntlet idleRate (def.ts), exactly
// as the scene does: only while no Run is on screen (07 §3, OQ 31). The scene's thin layer around
// a Run is ported rule for rule: battle Teeth x Tooth Pliers credited at each result card, the
// run-end bonus, Crests, Pit Crowns (the skill gate), Captives (the Goods export counter), the
// last-3 warband history and stationing, and the scripted round-2 duplicate of the first Run.
// The shop is the real upgrade list (src/depts/pit/upgrades.ts buildGroups) on a headless DeptCtx;
// Stakes are bought the way the home panel's button does it.
//
// Bots (07 §14.1):
//  - novice: bot.ts's greedy value-per-Chow shop plus 20% random buys, no battle look-ahead;
//    shop time x1.5.
//  - reference: the greedy shop, then up to 8 candidate line orders, each judged by one battle
//    against the scouted rival on a seed of its own (the bot's guess of the fight, not the real
//    dice).
//  - expert: 64 candidate orders, three guessed battles each, reading the rival as if it owned one
//    more Scouting level.
// Time model: shop 8 s + 3 s per action (novice x1.5); battles at 1x for rounds 1-3, then 2x,
// plus the 1.5 s result card; 6 s on the Run summary and 3 s at home before the next Run.
// Stakes: the bot plays at the highest level bought (Snarl's "Drop Stakes by 2?" after 3 Retreats
// under 3 wins, back up one after 2 Triumphs), and at the Infamy target while it still needs Crowns.
import type { DeptCtx, UpgradeEntry } from '../../src/core/dept';
import type { DeptSave } from '../../src/core/types';
import { battle, hashStr } from '../../src/depts/pit/engine';
import { battleSeconds, botShop } from '../../src/depts/pit/bot';
import {
  crownsAtOrAbove,
  PIT_CROWNS,
  gauntletReport,
  heldCrownLevel,
  idleRateWith,
  lvOf,
  normalize,
  pitEcon,
  runOpts,
  stakesCost,
  STAKES_MAX,
  pliersMult,
  renownMult,
  teethMult,
  type PitPersistent,
  type PitRun,
} from '../../src/depts/pit/def';
import {
  autoSlot,
  buy,
  fight,
  lvlOf,
  newRun,
  nextRival,
  prepareLine,
  runEndBonus,
  SCAR_MAX,
  SHOWMAN_STEP,
  UNIT_COST,
  type Pet,
  type RunState,
} from '../../src/depts/pit/run';
import { anyAffordable as anyAffordableGroups, buildGroups } from '../../src/depts/pit/upgrades';
import { UNITS } from '../../src/depts/pit/units';
import { childSeed, makeRng, type Rng } from '../rng';
import type { ActiveSession, AdapterFactory, BotGoals, SessionEnv } from '../types';

export type Skill = 'novice' | 'reference' | 'expert';

/** cands: candidate line orders per shop; seeds: guessed battles per candidate; random: chance of a
 * random buy per shop; shopX: shop-time multiplier (07 §14.1 time model); read: Scouting levels the
 * bot reads without owning them (an expert knows how rivals grow). */
const SKILL: Record<Skill, { cands: number; seeds: number; random: number; shopX: number; read: number }> = {
  novice: { cands: 0, seeds: 0, random: 0.2, shopX: 1.5, read: 0 },
  reference: { cands: 8, seeds: 1, random: 0, shopX: 1, read: 0 },
  expert: { cands: 64, seeds: 3, random: 0, shopX: 1, read: 1 },
};

export interface PitOpts {
  skill?: Skill;
  /** No Runs: Skirmishes only (the idle-only calibration; trivially 1.0, the scene credits idleRate). */
  passive?: boolean;
}

const SUMMARY_S = 6;
const HOME_S = 3;
/** Share of the bot's expected active income counted in the buyer's value (see bridge.ts). */
const ACTIVE_W = 0.25;

const runOf = (s: DeptSave) => s.run as PitRun;
const perOf = (s: DeptSave) => s.persistent as PitPersistent;

function headlessCtx(save: DeptSave): DeptCtx {
  return {
    save,
    spend(amount: number) {
      if (save.run.bank + 1e-9 < amount) return false;
      save.run.bank -= amount;
      return true;
    },
    seen: (k: string) => !!save.seen[k],
    markSeen: (k: string) => void (save.seen[k] = 1),
    say: () => {},
    saveSoon: () => {},
    game: { toast: () => {} },
  } as unknown as DeptCtx;
}
const groupsOf = (save: DeptSave) => buildGroups(headlessCtx(save), { onBuy() {} });
const shopOf = (save: DeptSave): UpgradeEntry[] => groupsOf(save).flatMap((g) => g.entries);

/** All permutations of [0..n-1] (n <= 5), heuristic order first. */
function perms(n: number): number[][] {
  const out: number[][] = [];
  const rec = (pre: number[], rest: number[]) => {
    if (!rest.length) out.push(pre);
    else rest.forEach((x, i) => rec([...pre, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  rec([], [...Array(n).keys()]);
  return out;
}
const PERMS = [0, 1, 2, 3, 4, 5].map(perms);

/**
 * The bot's estimate of its active base Teeth/s at Stakes S (before Pliers / Arena Renown and the
 * core multiplier): ~0.93/s at Stakes 0, x1.2 per level (scripts/pit-bot.ts, reference time model),
 * nudged by the Run-only nodes. Only the buyer reads it; Runs pay what the real rules pay.
 */
function activeEst(r: PitRun, S = r.stakes): number {
  const L = (id: string) => lvOf(r, id);
  const bonus = 1 + 0.5 * SHOWMAN_STEP * L('showman');
  const nodes = (1 + 0.02 * L('hardy')) * (1 + 0.06 * L('larder')) * (1 + 0.03 * L('pen')) * (1 + 0.03 * L('freeroll')) * (1 + 0.05 * L('grit')) * (1 + 0.01 * L('scout'));
  return 0.93 * 1.2 ** S * bonus * nodes * pliersMult(L('pliers')) * renownMult(L('renown'));
}

export const createPit = (opts: PitOpts = {}): AdapterFactory => (seed) => {
  const sk = SKILL[opts.skill ?? 'reference'];
  const rnd: Rng = makeRng(childSeed(seed, 'pit'));
  const counters: Record<string, number> = { runs: 0, triumphs: 0, goalRuns: 0, goalTriumphs: 0, goalHuntRuns: 0, r15: 0, r15Won: 0, battles: 0, runSecs: 0, stations: 0, candBattles: 0 };

  // Phase state persists across sessions (a Run can be paused anywhere); reset when the run object
  // changes (a Fall replaces save.run).
  let runRef: PitRun | null = null;
  let phase: 'home' | 'shop' | 'battle' | 'summary' = 'home';
  let wait = HOME_S;
  let pend = 0; // battle Teeth (base) not yet credited
  let drop = 0; // Stakes below the highest bought the bot plays at (it steps down after bad Runs)

  function startSession(save: DeptSave, env: SessionEnv): ActiveSession {
    const r = runOf(save);
    const p = perOf(save);
    normalize(r, p);
    if (runRef !== r) {
      runRef = r;
      phase = r.cur ? 'shop' : 'home';
      wait = r.cur ? 0 : HOME_S;
      pend = 0;
      drop = 0;
    }
    if (phase === 'battle' || phase === 'summary') {
      // Reopened mid-playback: the scene resumes at the shop (or home) with pay already banked.
      phase = r.cur && !r.cur.ended ? 'shop' : 'home';
      wait = 0;
    }
    let goalS = 0;
    let idleAcc = 0;
    let idleT = 0;
    const tmult = () => teethMult(r);

    function playStakes(): number {
      const top = r.stakesBought;
      // Still chasing Crowns at the target: play there once it's bought.
      if (top >= goalS && crownsAtOrAbove(r.crowns, goalS) < PIT_CROWNS) return Math.max(goalS, top - drop);
      return Math.max(0, top - drop);
    }

    function creditBattle(): void {
      if (pend > 0) earnRun(pend * tmult());
      pend = 0;
    }

    /** One shop phase with the bot; returns the seconds it takes. */
    function shopPhase(rs: RunState): number {
      // Scripted onboarding: round 2 of the first Run shows a twin of a line unit (scene prepRound).
      if (rs.round === 2 && !save.seen['pit.dupe']) {
        save.seen['pit.dupe'] = 1;
        const pet = rs.line.find((x) => x && x.xp < 5);
        if (pet && rs.shop.length) rs.shop[0] = { k: pet.k, a: UNITS[pet.k].atk, h: UNITS[pet.k].hp };
      }
      let acts = 0;
      if (sk.random > 0 && rnd() < sk.random && rs.chow >= UNIT_COST && rs.shop.length) {
        const i = Math.floor(rnd() * rs.shop.length);
        const s = rs.shop[i];
        const slot = s ? autoSlot(rs, s.k) : -1;
        if (slot >= 0 && buy(rs, i, slot).ok) acts++;
      }
      acts += botShop(rs, rnd);
      if (sk.cands > 0) acts += chooseOrder(rs);
      if (rs.maxLvl >= 3 && !save.seen['pit.l3run']) {
        save.seen['pit.l3run'] = 1;
        p.life.l3++;
      }
      return (8 + 3 * acts) * sk.shopX;
    }

    /** Reference / expert: judge up to N line orders by guessed battles against the scouted rival. */
    function chooseOrder(rs: RunState): number {
      const pets = rs.line.filter((x): x is Pet => !!x);
      if (pets.length < 2) return 0;
      // What the scout shows (07 §2, §6): the tamer's beasts always; their stats with Scouting L1,
      // levels and items with L2. Unseen stats are guessed as the shop's base stats.
      const scout = lvOf(r, 'scout') + sk.read;
      const riv = nextRival(rs).line.map((f) => ({
        ...f,
        atk: scout >= 1 ? f.atk : UNITS[f.kind].atk,
        hp: scout >= 1 ? f.hp : UNITS[f.kind].hp,
        lvl: scout >= 2 ? f.lvl : 1,
        item: scout >= 2 ? f.item : null,
      }));
      const all = PERMS[pets.length];
      const cands = [all[0]];
      const pool = all.slice(1);
      while (cands.length < sk.cands && pool.length) cands.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      let best = cands[0];
      let bestV = -Infinity;
      for (const c of cands) {
        const team = prepareLine(c.map((i) => pets[i]), rs.opts.hardy);
        let v = 0;
        for (let k = 0; k < sk.seeds; k++) {
          const res = battle(team, riv, { seed: hashStr('guess', rs.seed, rs.round, k, cands.indexOf(c)), tactics: rs.stakes, sigils: rs.opts.sigils, shade: rs.opts.shade });
          v += res.outcome === 1 ? 1 : res.outcome === 0 ? 0.5 : 0;
          counters.candBattles++;
        }
        if (v > bestV + 1e-9) {
          bestV = v;
          best = c;
        }
      }
      if (best === cands[0]) return 0;
      rs.line = [0, 1, 2, 3, 4].map((i) => (i < best.length ? pets[best[i]] : null));
      return 1; // one drag
    }

    /** Run end (scene finalizeRun): bonus, Crowns, Crests, Captives, history; then station. */
    function finalize(rs: RunState): void {
      if (rs.paid) return;
      rs.paid = true;
      creditBattle();
      earnRun(runEndBonus(rs, lvOf(r, 'showman')) * tmult());
      r.stats.runs++;
      r.stats.bestWins = Math.max(r.stats.bestWins, rs.wins);
      r.stats.captives = (r.stats.captives ?? 0) + (rs.ended === 'triumph' ? 3 : rs.wins >= 6 ? 1 : 0);
      const target = pitEcon.skillTarget(save.cycle.n);
      let crests = 0;
      counters.runs++;
      if (rs.stakes === target) counters.goalRuns++;
      const sk = `S${rs.stakes}`;
      counters[`runs${sk}`] = (counters[`runs${sk}`] ?? 0) + 1;
      if (rs.huntB > 0) counters[`hunt${sk}`] = (counters[`hunt${sk}`] ?? 0) + 1;
      if (rs.ended === 'triumph') counters[`tri${sk}`] = (counters[`tri${sk}`] ?? 0) + 1;
      if (rs.stakes === target && (rs.huntB > 0)) counters.goalHuntRuns++;
      if (rs.ended === 'triumph') {
        counters.triumphs++;
        if (rs.stakes === target) counters.goalTriumphs++;
        r.stats.triumphs++;
        r.stats.lowRetreats = 0;
        p.life.triumphs++;
        p.life.crownsEver++;
        p.life.bestStakesCrown = Math.max(p.life.bestStakesCrown, rs.stakes);
        r.crowns[rs.stakes] = (r.crowns[rs.stakes] ?? 0) + 1;
        const held = heldCrownLevel(r.crowns);
        if (held >= 0) env.raiseSkill(held);
        if (rs.stakes >= target - 2) crests = 2;
        if (rs.stakes >= target) r.scars = 0;
        // Buying a Stakes level sets the dial to it (scene buyStakes); a Triumph steps back up.
        drop = Math.max(0, drop - 1);
      } else {
        r.stats.retreats++;
        r.stats.lowRetreats = rs.wins < 3 ? r.stats.lowRetreats + 1 : 0;
        if (rs.wins >= 6 && rs.stakes >= 3) crests = 1;
        // Huntmaster scars (scene finalizeRun): a lost bout at the target scars him for the cycle.
        if (rs.stakes >= target && rs.huntB > 0) r.scars = Math.min(SCAR_MAX, (r.scars ?? 0) + 1);
        // A Retreat steps one down (Snarl's "Drop Stakes by 2?" after three bad Runs is the same
        // idea; a player adjusts sooner).
        drop = Math.min(r.stakesBought, drop + 1);
      }
      p.crests += crests;
      p.crestsEver += crests;
      const band = rs.line.filter((x): x is Pet => !!x).map((x) => ({ ...x }));
      if (band.length) {
        r.history.unshift(band);
        r.history.length = Math.min(3, r.history.length);
      }
      // Station the best of the last 3 warbands when it beats the Standing Warband (Snarl's preview).
      const now = pitEcon.idleRate(save);
      let pick: Pet[] | null = null;
      let pickV = now * 1.001;
      for (const h of r.history) {
        const v = idleRateWith(save, h);
        if (v > pickV) {
          pickV = v;
          pick = h;
        }
      }
      if (pick) {
        r.garrison = pick.map((x) => ({ ...x }));
        // scene.ts station(): Old Guard (Signature) keeps the last stationed warband.
        (save.persistent as { guard?: unknown }).guard = pick.map((x) => ({ ...x }));
        r.stats.stations++;
        counters.stations++;
      }
      r.cur = null;
    }

    function startRun(): void {
      r.stakes = Math.min(r.stakesBought, playStakes());
      const o = runOpts(save);
      const runSeed = Math.floor(rnd() * 0x7fffffff) >>> 0;
      r.cur = newRun(runSeed, r.stakes, o, env.now());
      r.cur.earned = 0;
    }

    const drillBucket = () => { const L = lvOf(r, 'drill'); return L < 3 ? '0-2' : L < 6 ? '3-5' : L < 10 ? '6-9' : '10+'; };
    /** Run pay, split by whether the Standing Warband is still the starter garrison (stats only). */
    function earnRun(x: number): void {
      const k = r.stats.stations > 0 ? 'Stationed' : 'Starter';
      counters[`run${k}`] = (counters[`run${k}`] ?? 0) + x;
      const d = `runDrill${drillBucket()}`;
      counters[d] = (counters[d] ?? 0) + x;
      env.earn(x);
    }
    function tick(dt: number): void {
      if (phase !== 'home' || opts.passive) {
        const k = r.stats.stations > 0 ? 'Stationed' : 'Starter';
        counters[`idle${k}`] = (counters[`idle${k}`] ?? 0) + pitEcon.idleRate(save) * dt;
        const d = `idleDrill${drillBucket()}`;
        counters[d] = (counters[d] ?? 0) + pitEcon.idleRate(save) * dt;
      }
      if (opts.passive) phase = 'home';
      if (phase === 'home') {
        // Skirmishes pay only while no Run is on screen (the scene credits once a second).
        idleAcc += pitEcon.idleRate(save) * dt;
        idleT += dt;
        if (idleT >= 1) {
          idleT = 0;
          if (idleAcc > 0) env.earn(idleAcc);
          idleAcc = 0;
        }
        if (opts.passive) return;
        wait -= dt;
        if (wait <= 0) {
          if (!r.cur) startRun();
          phase = 'shop';
          wait = 0;
        }
        return;
      }
      wait -= dt;
      if (wait > 0) return;
      const rs = r.cur;
      if (!rs) {
        phase = 'home';
        wait = HOME_S;
        return;
      }
      if (phase === 'shop') {
        const shopS = shopPhase(rs);
        counters.runSecs += shopS;
        wait += shopS;
        // FIGHT: resolved now, paid at the result card (after playback).
        const out = fight(rs, true);
        counters.battles++;
        pend += out.teeth;
        if (out.round <= 5) {
          counters.r15++;
          if (out.outcome === 1) counters.r15Won++;
        }
        if (out.outcome === 1) {
          p.life.battlesWon++;
          r.stats.battlesWon++;
        }
        const secs = battleSeconds(out.result.frames) / (out.round <= 3 ? 1 : 2) + 1.5;
        rs.playMs += secs * 1000;
        counters.runSecs += secs;
        wait += secs;
        phase = 'battle';
        return;
      }
      if (phase === 'battle') {
        creditBattle();
        if (rs.ended) {
          finalize(rs);
          phase = 'summary';
          wait += SUMMARY_S;
        } else phase = 'shop';
        return;
      }
      // summary -> home
      phase = 'home';
      wait += HOME_S;
    }

    // ---------- the buyer ----------

    /** Idle Teeth/s if the run had these levels / Stakes (exact Gauntlet, memoized). */
    function idleWith(mut: (q: PitRun) => void): number {
      const q: PitRun = { ...r, lv: { ...r.lv } };
      mut(q);
      return pitEcon.idleRate({ ...save, run: q } as DeptSave);
    }
    const value = (idle: number, act: number) => idle + ACTIVE_W * act;

    function buyStakes(): boolean {
      const b = r.stakesBought;
      if (b >= STAKES_MAX || r.bank + 1e-9 < stakesCost(b)) return false;
      r.bank -= stakesCost(b);
      r.stakesBought = b + 1;
      if (!r.cur) r.stakes = Math.min(r.stakesBought, playStakes());
      return true;
    }

    return {
      step(dt) {
        let left = dt;
        while (left > 1e-9) {
          const h = Math.min(0.5, left);
          tick(h);
          left -= h;
        }
      },

      buy(goals: BotGoals) {
        goalS = Math.min(goals.dialGoal, STAKES_MAX);
        const bought: string[] = [];
        // Crests (persistent): the Pedigrees and Bestiary beasts, cheapest first.
        for (let guard = 0; guard < 12; guard++) {
          const c = shopOf(save).filter((e) => e.currency === 'Crests' && e.id !== 'ped.carry' && e.level() < e.max && e.canAfford()).sort((a, b) => a.cost() - b.cost())[0];
          if (!c) break;
          c.buy();
          bought.push(c.id);
        }
        // Mid-battle the bot is watching, not shopping; it shops in the Run's shop phase or at home.
        if (phase === 'battle' || phase === 'summary') return bought;
        const idle0 = pitEcon.idleRate(save);
        for (let guard = 0; guard < 40; guard++) {
          const dialNeeded = r.stakesBought < goalS;
          const sCost = r.stakesBought < STAKES_MAX ? stakesCost(r.stakesBought) : Infinity;
          if (dialNeeded && !opts.passive && r.bank >= sCost) {
            buyStakes();
            bought.push('stakes');
            continue;
          }
          const i0 = pitEcon.idleRate(save);
          const a0 = opts.passive ? 0 : activeEst(r);
          const v0 = value(i0, a0);
          let best: { e: UpgradeEntry | null; cost: number; ratio: number; gain: number } | null = null;
          for (const e of shopOf(save)) {
            if (e.currency || e.locked?.()) continue;
            if (e.level() >= e.max || e.locked?.()) continue;
            const cost = e.cost();
            const id = e.id;
            const L = e.level();
            const touchesIdle = ['hardy', 'pliers', 'renown', 'pace', 'drill'].includes(id);
            if (opts.passive && !touchesIdle) continue;
            // Hardy Stock and Drill Yard make every warband stronger; a player buys them for the
            // Runs even when a reseeded Gauntlet happens to read a hair lower (07 §3 item 4: the
            // Gauntlet is only monotone on average, its battle seeds hash the stats).
            const i1raw = touchesIdle ? idleWith((q) => (q.lv[id] = L + 1)) : i0;
            const i1 = id === 'hardy' || id === 'drill' ? Math.max(i0, i1raw) : i1raw;
            const q = { ...r, lv: { ...r.lv, [id]: L + 1 } };
            const a1 = opts.passive ? 0 : activeEst(q);
            const gain = value(i1, a1) - v0;
            if (!(gain > 0)) continue;
            const ratio = gain / cost;
            if (!best || ratio > best.ratio) best = { e, cost, ratio, gain };
          }
          // Stakes above the target: active x1.2, idle exact (Cautious Stakes picks the best of S..S-4).
          if (!dialNeeded && !opts.passive && r.stakesBought < STAKES_MAX) {
            const i1 = idleWith((q) => (q.stakes = q.stakesBought + 1));
            // Only once the bot has won a Crown at the top of what it owns (it raises the dial it plays at).
            const gain = drop === 0 && crownsAtOrAbove(r.crowns, r.stakesBought) > 0 ? value(i1, activeEst(r, r.stakesBought + 1)) - value(i0, activeEst(r, r.stakesBought)) : 0;
            if (gain > 0 && (!best || gain / sCost > best.ratio)) best = { e: null, cost: sCost, ratio: gain / sCost, gain };
          }
          if (!best || r.bank < best.cost) break;
          // Saving for the dial once it's within ~10 min of income: only small buys, or ones that
          // pay for themselves before the dial is affordable anyway.
          const toDial = (sCost - r.bank) / Math.max(1e-9, v0);
          if (dialNeeded && toDial < 600 && best.cost > 0.15 * sCost && best.cost / best.gain > Math.max(300, toDial)) break;
          if (best.e) {
            best.e.buy();
            bought.push(best.e.id);
          } else if (buyStakes()) bought.push('stakes');
        }
        void idle0;
        return bought;
      },

      end() {
        if (idleAcc > 0) env.earn(idleAcc);
        idleAcc = 0;
        // Leaving mid-playback banks the battle (scene destroy), and a finished Run is finalized.
        creditBattle();
        if (r.cur && r.cur.ended) {
          finalize(r.cur);
          phase = 'home';
          wait = HOME_S;
        }
      },
      stats: () => ({
        ...counters,
        triumphRate: counters.runs ? Math.round((1000 * counters.triumphs) / counters.runs) / 10 : 0,
        r15WinRate: counters.r15 ? Math.round((1000 * counters.r15Won) / counters.r15) / 10 : 0,
        goalHuntWin: counters.goalHuntRuns ? Math.round((1000 * counters.goalTriumphs) / counters.goalHuntRuns) / 10 : 0,
        goalTriumphRate: counters.goalRuns ? Math.round((1000 * counters.goalTriumphs) / counters.goalRuns) / 10 : 0,
        runMin: counters.runs ? Math.round((counters.runSecs / counters.runs / 60) * 10) / 10 : 0,
      }),
    };
  }

  return {
    id: 'pit',
    def: pitEcon,
    dialMax: STAKES_MAX,
    dialId: 'stakes',
    dialCost: (k) => stakesCost(k),
    startSession,
    anyAffordable(save) {
      const r = runOf(save);
      normalize(r, perOf(save));
      if (r.stakesBought < STAKES_MAX && r.bank >= stakesCost(r.stakesBought)) return true;
      return anyAffordableGroups(groupsOf(save).filter((g) => g.name !== 'Crests'));
    },
    dialLevel: (save) => runOf(save).stakesBought ?? 0,
    ratioScale: (save) => renownMult(lvOf(runOf(save), 'renown')),
    // 07 §3 (W-11): active >= 2.6x on-screen idle, centred at 3.2x (3.5-4.3x offline at ~0.75).
    localRatioBands: { all: [2.6, 3.8] },
    describe(save) {
      const r = runOf(save);
      const g = (r.garrison ?? []).map((x) => `${x.k}${lvlOf(x.xp)}`).join(',');
      const rep = gauntletReport(save);
      return `gauntlet ${rep.meanRounds.toFixed(1)}r@S${rep.stakes} set ${r.stakes} show ${lvOf(r, 'showman')} lard ${lvOf(r, 'larder')} grit ${lvOf(r, 'grit')} imp ${save.imports?.souls ?? 0}/${save.imports?.essence ?? 0} stakes ${r.stakesBought} crowns ${JSON.stringify(r.crowns)} runs ${r.stats?.runs ?? 0} tri ${r.stats?.triumphs ?? 0} pliers ${lvOf(r, 'pliers')} renown ${lvOf(r, 'renown')} hardy ${lvOf(r, 'hardy')} drill ${lvOf(r, 'drill')} pace ${lvOf(r, 'pace')} [${g}]`;
    },
  };
};

