// Sorcerer's Spire adapter: drives the game's own headless core (src/depts/spire/logic.ts, the
// same SpireCore the scene runs, on the Pixi-free circle physics in physics.ts) with a reference
// bot, and credits the apprentices' idleRateOf on screen exactly like the scene.
//
// Two layers (00 §8.1), as in the Cauldron adapter: the live flask runs for the first SAMPLE_S
// seconds the bot spends in each coarse flask state (upgrades that change geometry, spawns or
// the cascade, plus the Volatility setting); after that the measured merge income for that state,
// normalized by Potent Mana x arcanaMult(V), plus its Feat tier and Distill Ceiling, are reused
// (a lazily filled activeRate table). Table seconds advance the drop counters and the Feat's
// 60-drop Volatility log at the bot's cadence. The flask itself stays frozen in table mode,
// as it is whenever the player isn't looking. `liveOnly` runs every second live.
//
// Bot (00 §8.1 "Spire" row: greedy merge-adjacency aim at 30 drops/min): for the orb in hand it
// scores ~24 aim positions across the flask by dropping a straight line onto the pile (first
// circle contact), rewarding an immediate same-tier contact, a same-tier neighbour at the resting
// spot and a low landing, and punishing landings near the Brim Line and burying a smaller orb.
// The expert also looks one merge ahead (the merged orb's neighbours). Skill sets the cadence
// (22 / 30 / 34 drops/min), the aim noise and how often the bot settles for a worse spot.
// Wave 1 (genre research R2/R5/R6/R9): the flask is 112x160 with ~x1.3 radii, Wider Flask and
// Taller Neck are gone, chains pay x1/x2/x4/x6..., idle copies the bot's best flask score (the
// core's studyMult, so the bot's own play sets its idle), Catalysts are earned by x4 chains and the
// first brim warning of a flask hands over a Quicksilver bead (dropped like any special).
// Special orbs and tools (04 §3, §5, §6 B; all in the shared SpireCore): Catalysts and Volatility's
// Hex Stones come out of the real core. The reference and expert bots aim a Catalyst at the biggest
// orb it can reach (the expert prefers one whose upgrade touches a twin) and herd Hex Stones onto
// other Hex Stones; the novice drops them like any orb. With `tremor`, the bot buys the Tremor and
// jolts the flask when two same-tier orbs sit a hair apart, and the expert also buys the Settle
// Charm and uses Vent Now when the brim is about to overflow.
// The greedy buyer ranks Alchemy / Apparatus / Apprentices and Volatility by
// Δ(idleRate + ACTIVE_W x expected active Arcana/s)/cost, the expectation the 04 §4 formula
// (cadence x EV_drop at the Distill Ceiling x ~0.7 realization x Resonance); Tomes are bought
// with Grimoire Pages, Mirror first.
import { longMult } from '../../src/core/longnode';
import type { DeptSave } from '../../src/core/types';
import {
  arcanaMult,
  CATALYST,
  CATALYST_MAX_FROM,
  cooldown,
  HEX,
  isSpecial,
  orbR,
  evDropTable,
  heldVol,
  idleRateOf,
  lvOf,
  MAX_TIER,
  normalize,
  potentMult,
  spawnTable,
  spireEcon,
  TIERS,
  tomeOf,
  upCost,
  upLocked,
  UPGRADES,
  VOL_MAX,
  volCost,
  type SpirePersistent,
  type SpireRun,
} from '../../src/depts/spire/def';
import { SpireCore } from '../../src/depts/spire/logic';
import type { Orb } from '../../src/depts/spire/physics';
import { childSeed, makeRng, type Rng } from '../rng';
import type { ActiveSession, AdapterFactory, BotGoals, SessionEnv } from '../types';

export type Skill = 'novice' | 'reference' | 'expert';

/** dpm: drops per minute; noise: aim noise (px, normal); sloppy: chance of taking the 2nd/3rd
 * best spot; look: one-merge lookahead; settle: seconds a cascade must be quiet (and the pile
 * still) before the next drop. The novice drops on the beat, which clogs the flask (~2x the vents). */
const SKILL: Record<Skill, { dpm: number; noise: number; sloppy: number; look: boolean; settle: number; specials: boolean; tremor: boolean; ventNow: boolean }> = {
  novice: { dpm: 22, noise: 5, sloppy: 0.35, look: false, settle: 0, specials: false, tremor: false, ventNow: false },
  reference: { dpm: 30, noise: 1.5, sloppy: 0.1, look: false, settle: 1.2, specials: true, tremor: true, ventNow: true },
  expert: { dpm: 34, noise: 0.5, sloppy: 0.02, look: true, settle: 1.2, specials: true, tremor: true, ventNow: true },
};

export interface SpireOpts {
  skill?: Skill;
  /** No drops: the apprentices alone (idleRate calibration; trivially 1.0, the scene credits idleRateOf). */
  passive?: boolean;
  sampleS?: number;
  liveOnly?: boolean;
}

const ACTIVE_W = 0.25;
/** 04 §4: share of the formula's EV a live flask realizes, for the buyer's estimate. */
const REALIZE = 0.7;
const AIMS = 24;

const run = (s: DeptSave) => s.run as SpireRun;
const per = (s: DeptSave) => s.persistent as SpirePersistent;

function gauss(rnd: Rng): number {
  const u = Math.max(1e-9, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

// ---------- the bot's expectation (buyer) ----------

function activeEst(r: SpireRun, p: SpirePersistent, dpm: number, sk?: { tremor: boolean; ventNow: boolean }): number {
  const ceil = Math.max(7, Math.min(MAX_TIER, r.ceiling || 7));
  const ev = evDropTable(spawnTable(r), ceil) * potentMult(r) * arcanaMult(r.vol);
  // Geometry and cascade nodes: proxies for fewer vents and longer chains.
  const proxy =
    (1 + 0.02 * lvOf(r, 'echo')) *
    (1 + 0.02 * lvOf(r, 'glass')) *
    (1 + 0.01 * lvOf(r, 'coil')) *
    (sk?.tremor ? 1 + 0.03 * lvOf(r, 'tremor') : 1) *
    (sk?.ventNow ? 1 + 0.02 * lvOf(r, 'settle') : 1);
  return (Math.min(dpm, 60 / cooldown(r)) / 60) * ev * REALIZE * 1.6 * proxy + idleRateOf(r, p);
}

function coarseKey(r: SpireRun): string {
  return [lvOf(r, 'richer'), lvOf(r, 'seed'), lvOf(r, 'valve'), Math.floor(lvOf(r, 'echo') / 3), Math.floor(lvOf(r, 'glass') / 4), Math.floor(lvOf(r, 'coil') / 3), lvOf(r, 'tremor'), lvOf(r, 'settle'), r.vol].join('|');
}

interface TableRow {
  liveS: number;
  /** Merge + vent income over the live samples, divided by potentMult x arcanaMult(vol). */
  norm: number;
  drops: number;
  maxTier: number;
  ceiling: number;
}

export const createSpire = (opts: SpireOpts = {}): AdapterFactory => (seed) => {
  const sk = SKILL[opts.skill ?? 'reference'];
  const sampleS = opts.sampleS ?? 900;
  const table = new Map<string, TableRow>();
  let sessions = 0;
  const counters = { liveS: 0, tableS: 0, vents: 0 };

  function startSession(save: DeptSave, env: SessionEnv): ActiveSession {
    const r = run(save);
    const p = per(save);
    normalize(r, p);
    const rnd = makeRng(childSeed(seed, `spire.bot.${sessions}`));
    let merged = 0; // merge + vent base income (live)
    const core = new SpireCore(
      r,
      p,
      {
        earn: (b) => {
          merged += b;
          return env.earn(b);
        },
        raiseSkill: (l) => env.raiseSkill(l),
        vent: () => void counters.vents++,
        imports: save.imports,
      },
      childSeed(seed, `spire.core.${sessions++}`),
    );
    let dropT = 60 / sk.dpm;
    let idleT = 0;
    let idleAcc = 0;
    let dropAcc = 0;

    /** Where would an orb of radius rr dropped at x first touch the pile? */
    function landing(x: number, rr: number): { y: number; hit: Orb | null } {
      const f = core.flask;
      let y = f.h - rr;
      let hit: Orb | null = null;
      for (const o of f.orbs) {
        const dx = Math.abs(o.x - x);
        const rs = o.r + rr;
        if (dx >= rs) continue;
        const yc = o.y - Math.sqrt(rs * rs - dx * dx);
        if (yc < y) {
          y = yc;
          hit = o;
        }
      }
      return { y, hit };
    }

    function score(x: number, tier: number): number {
      const rr = orbR(tier);
      const { y, hit } = landing(x, rr);
      const f = core.flask;
      let s = (y / f.h) * 30; // lower is better
      const top = y - rr;
      const brim = core.brimY;
      if (top < brim + 12) s -= 200;
      else if (top < brim + 40) s -= 40;
      if (isSpecial(tier)) {
        if (!sk.specials) return s;
        if (tier === CATALYST && hit && !isSpecial(hit.tier) && hit.tier <= CATALYST_MAX_FROM) {
          s += 20 + 8 * hit.tier;
          if (sk.look) {
            for (const o of f.orbs) {
              if (o === hit || o.tier !== hit.tier + 1) continue;
              if (Math.hypot(o.x - hit.x, o.y - hit.y) < o.r + orbR(hit.tier + 1) + 3) {
                s += 60 + 6 * hit.tier;
                break;
              }
            }
          }
        } else if (tier === HEX) {
          for (const o of f.orbs) {
            if (o.tier === HEX && Math.hypot(o.x - x, o.y - y) < o.r + rr + 3) s += 50;
          }
        }
        return s;
      }
      if (hit) {
        if (hit.tier === tier) {
          s += 100 + 8 * tier;
          if (sk.look) {
            // One merge ahead: does the merged orb touch another of tier+1?
            for (const o of f.orbs) {
              if (o === hit || o.tier !== tier + 1) continue;
              if (Math.hypot(o.x - hit.x, o.y - hit.y) < o.r + TIERS[tier + 1].r + 3) {
                s += 60 + 6 * tier;
                break;
              }
            }
          }
        } else if (hit.tier < tier) s -= 10 * (tier - hit.tier);
        else s -= 2 * Math.min(4, hit.tier - tier);
      }
      // Same-tier neighbour at the resting spot (it rolls into it).
      for (const o of f.orbs) {
        if (o === hit || o.tier !== tier) continue;
        if (Math.hypot(o.x - x, o.y - y) < o.r + rr + 4) {
          s += 45 + 4 * tier;
          break;
        }
      }
      return s;
    }

    function aim(): number {
      const tier = core.current;
      const rr = orbR(tier);
      const half = core.flask.w / 2;
      const cands: { x: number; s: number }[] = [];
      for (let i = 0; i < AIMS; i++) {
        const x = -half + rr + ((half - rr) * 2 * i) / (AIMS - 1);
        cands.push({ x, s: score(x, tier) });
      }
      cands.sort((a, b) => b.s - a.s);
      let k = 0;
      if (rnd() < sk.sloppy) k = 1 + Math.floor(rnd() * 2);
      return core.clampAim(cands[Math.min(k, cands.length - 1)].x + gauss(rnd) * sk.noise);
    }

    /** Two same-tier orbs a hair apart: a Tremor may knock them together. */
    function nearMiss(): boolean {
      const orbs = core.flask.orbs;
      for (let i = 0; i < orbs.length; i++) {
        const a = orbs[i];
        if (isSpecial(a.tier) || a.tier >= MAX_TIER) continue;
        for (let j = i + 1; j < orbs.length; j++) {
          const b = orbs[j];
          if (b.tier !== a.tier) continue;
          const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
          if (gap > 0.6 && gap < 4) return true;
        }
      }
      return false;
    }

    let toolT = 0;
    function useTools(h: number): void {
      toolT -= h;
      if (toolT > 0) return;
      toolT = 0.5;
      if (sk.ventNow && core.hasVentNow && core.brimT > 2.4) core.ventNow();
      if (sk.tremor && core.hasTremor && core.tremorCool <= 0 && core.sinceMerge > 1.5 && core.sinceDrop > 1 && nearMiss()) core.tremor();
    }

    function liveStep(dt: number): void {
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(0.1, left);
        if (!opts.passive) {
          useTools(h);
          dropT -= h;
          // A patient player lets a cascade play out and the pile settle before the next drop.
          const busy = sk.settle > 0 && (core.sinceMerge < sk.settle || core.flask.orbs.some((o) => o.vy > 40));
          if (dropT <= 0 && core.canDrop() && !busy) {
            core.drop(aim());
            dropT = (60 / sk.dpm) * (0.8 + 0.4 * rnd());
          }
        }
        core.update(h, env.now());
        left -= h;
      }
    }

    function creditIdle(dt: number): void {
      // The scene credits the apprentices once a second while you watch.
      idleT += dt;
      if (idleT >= 1) {
        idleAcc += idleRateOf(r, p, save.imports?.souls ?? 0) * idleT;
        idleT = 0;
        if (idleAcc > 0) env.earn(idleAcc);
        idleAcc = 0;
      }
    }

    return {
      step(dt) {
        creditIdle(dt);
        if (opts.passive) {
          core.update(dt, env.now());
          return;
        }
        const key = coarseKey(r);
        let row = table.get(key);
        if (!row) table.set(key, (row = { liveS: 0, norm: 0, drops: 0, maxTier: 0, ceiling: 0 }));
        const mult = potentMult(r) * arcanaMult(r.vol);
        if (opts.liveOnly || row.liveS < sampleS) {
          const m0 = merged;
          const d0 = r.stats.drops;
          liveStep(dt);
          row.liveS += dt;
          row.norm += (merged - m0) / mult;
          row.drops += r.stats.drops - d0;
          row.maxTier = Math.max(row.maxTier, r.stats.maxTier);
          row.ceiling = Math.max(row.ceiling, r.ceiling);
          counters.liveS += dt;
          return;
        }
        // Table mode.
        counters.tableS += dt;
        const amount = (row.norm / row.liveS) * mult * dt;
        if (amount > 0) {
          merged += amount;
          env.earn(amount);
        }
        dropAcc += (row.drops / row.liveS) * dt;
        core.creditHold(dt); // the bot is playing: active time at the dial (D-spire-01)
        while (dropAcc >= 1) {
          dropAcc -= 1;
          r.stats.drops++;
          r.stats.dropsSinceVent++;
          r.volLog.push(r.vol);
          if (r.volLog.length > 60) r.volLog.splice(0, r.volLog.length - 60);
        }
        if (row.ceiling > r.ceiling) r.ceiling = row.ceiling;
        if (row.maxTier > r.stats.maxTier) r.stats.maxTier = row.maxTier;
        // Tiers this flask state reached live (at this Volatility) plus the Volatility held now.
        const score = row.maxTier + heldVol(r);
        if (score > r.featBest) r.featBest = score;
        env.raiseSkill(score);
        core.update(0, env.now()); // vIdle bookkeeping
      },

      buy(goals: BotGoals) {
        const bought: string[] = [];
        const value = () => (opts.passive ? idleRateOf(r, p) : idleRateOf(r, p) + ACTIVE_W * activeEst(r, p, sk.dpm, sk));
        for (let guard = 0; guard < 200; guard++) {
          // The Feat needs tier + held Volatility >= goal; the bot reaches ~T9-T10 by itself.
          const reach = Math.max(7, Math.min(10, r.stats.maxTier));
          const needV = Math.min(VOL_MAX, Math.max(0, goals.dialGoal - reach));
          const dialNeeded = !opts.passive && r.featBest < goals.dialGoal && r.volBought < needV;
          const vCost = volCost(r.volBought);
          if (dialNeeded && r.bank >= vCost) {
            r.bank -= vCost;
            r.volBought++;
            core.setVol(r.volBought, env.now());
            bought.push('volatility');
            continue;
          }
          const v0 = value();
          let best: { id: string; cost: number; ratio: number; gain: number } | null = null;
          for (const u of UPGRADES) {
            if (u.pages || upLocked(u, save.cycle.n)) continue;
            if (opts.passive && u.branch !== 'apprentices') continue;
            const l = lvOf(r, u.id);
            if (l >= u.max) continue;
            const cost = upCost(u, l);
            r.lv[u.id] = l + 1;
            const gain = value() - v0;
            r.lv[u.id] = l;
            if (!(gain > 0)) continue;
            if (!best || gain / cost > best.ratio) best = { id: u.id, cost, ratio: gain / cost, gain };
          }
          if (!dialNeeded && !opts.passive && r.volBought < VOL_MAX) {
            const v = r.vol;
            r.vol = r.volBought + 1;
            const vi = r.vIdle;
            const gain = value() - v0;
            r.vol = v;
            r.vIdle = vi;
            if (gain > 0 && (!best || gain / vCost > best.ratio)) best = { id: 'volatility', cost: vCost, ratio: gain / vCost, gain };
          }
          if (!best || r.bank < best.cost) break;
          if (dialNeeded && best.cost / best.gain > Math.max(60, (vCost - r.bank) / Math.max(1e-9, v0))) break;
          r.bank -= best.cost;
          if (best.id === 'volatility') {
            r.volBought++;
            core.setVol(r.volBought, env.now());
          } else r.lv[best.id] = lvOf(r, best.id) + 1;
          bought.push(best.id);
        }
        // Tomes with Grimoire Pages: Mirror (the preview), Twinning, Hunger, then Patience.
        for (const id of ['mirror', 'twinning', 'hunger', 'patience']) {
          const u = UPGRADES.find((x) => x.id === id)!;
          if (tomeOf(p, id) < u.max && p.pages >= upCost(u, 0)) {
            p.pages -= upCost(u, 0);
            p.tomes[id] = 1;
            bought.push(id);
          }
        }
        if (bought.length) core.refresh();
        return bought;
      },

      end() {
        core.persist();
      },
      stats: () => ({ ...counters, tableStates: table.size }),
    };
  }

  return {
    id: 'spire',
    def: spireEcon,
    // The Feat is scored in tier + held Volatility (a Singularity counts as 12, V up to 10), so the
    // shipped range for the reachability check is 12 + VOL_MAX = 22, not the knob's 10.
    dialMax: 12 + VOL_MAX,
    dialId: 'volatility',
    dialCost: (k) => volCost(k),
    startSession,
    anyAffordable(save) {
      const r = run(save);
      const p = per(save);
      if (r.volBought < VOL_MAX && r.bank >= volCost(r.volBought)) return true;
      return UPGRADES.some((u) => {
        const l = u.pages ? tomeOf(p, u.id) : lvOf(r, u.id);
        return l < u.max && !upLocked(u, save.cycle.n) && (u.pages ? p.pages : r.bank) >= upCost(u, l);
      });
    },
    dialLevel: (save) => run(save).volBought ?? 0,
    ratioScale: (save) => longMult(lvOf(run(save), 'amp')),
    // 04 §4: active ~2.8x on-screen idle at the apprentice cap (~4.0x offline at the Spire's factor).
    localRatioBands: { all: [2.4, 3.2] },
    describe(save) {
      const r = run(save);
      return `vol ${r.volBought} ceil T${r.ceiling} feat ${r.featBest} appr ${lvOf(r, 'hire')} potent ${lvOf(r, 'potent')} amp ${lvOf(r, 'amp')} orbs ${r.flask.length / 3}`;
    },
  };
};
