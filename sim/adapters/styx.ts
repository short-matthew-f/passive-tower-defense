// River Styx adapter. The Styx's numbers and rules are pure (src/depts/styx/model.ts: species,
// rarity weights, band EVs, hook window, tension rise/drain, reel speed, Wrath, the gate rule,
// idleObols); its catch loop lives in scene.ts (tangled with Pixi), so this file ports that loop
// headless, rule for rule, at the scene's 30 Hz logic rate:
//   cast -> sink (40 px/s) -> wait (exponential bite wait, x1.25 while twitching) -> a biter seeks
//   the hook (the circling Bog Poet orbits 1.6 s first) -> nibble with fake-out dips (Wrath
//   fakeChance, Choirboy +1) -> plunge with the hook window -> reel (hold raises tension at
//   REEL_RISE / lineCap, releasing drains at drainRate, telegraphed thrashes at the scene's
//   progress points, slip after 0.4 s at >= 100%, drift loose after 2.5 s at 0%, heavy / sinker /
//   teleport / twin behaviours) -> land (combo, Wrath, Gilded Obol, Codex first-catch bonus, bait
//   use, the Wrath skill-gate tally) -> recast. Also: surface wisps, the scripted tutorial catch
//   (no fakes, 1.1 s window), line snaps on a legendary (5 s re-rig) and the netters' idle
//   income, which the scene credits on screen too. The shop is the real upgrade list
//   (src/depts/styx/upgrades.ts buildGroups) on a headless DeptCtx; Wrath is bought the way the
//   dock's buy button does it.
//
// Bot (00 §8.1 "Styx" row): casts to the band with the best expected Obols per second, twitches
// while waiting, taps a fake-out dip by mistake with a small chance, sets the hook with a
// reaction-time distribution (normal, mean/sd by skill; a fog surge adds 60 ms), and reels by
// holding until the line nears its hold threshold, releasing on a thrash telegraph after its
// reaction time (an attention lapse adds 0.35 s), and resuming after the thrash. It flicks wisps
// that cross during the sink and wait. Baits: Unpaid Debt while the gate still needs a rare,
// otherwise Gilded Obol once a catch is worth well over its price. The greedy buyer ranks the
// real upgrade list by Δ(idleObols + ACTIVE_W x the bot's expected active Obols/s)/cost, the
// expectation an analytic model of the same loop (the bot's knowledge, not the income source).
import type { DeptCtx, UpgradeEntry } from '../../src/core/dept';
import type { DeptSave } from '../../src/core/types';
import { styxEcon } from '../../src/depts/styx/def';
import * as M from '../../src/depts/styx/model';
import { buildGroups } from '../../src/depts/styx/upgrades';
import { childSeed, makeRng, type Rng } from '../rng';
import type { ActiveSession, AdapterFactory, BotGoals, SessionEnv } from '../types';

export type Skill = 'novice' | 'reference' | 'expert';

/** rt / rtSd: hook-set reaction (s, normal); fakeTap: chance per fake-out dip of tapping it;
 * lapse: chance per thrash telegraph of an attention lapse (+0.35 s); hold: tension % at which
 * the bot eases off; think: seconds between landing/escape and the recast; wisp: chance of
 * flicking a wisp that crosses while the hook sinks or waits; twitch: share of waits twitched. */
const SKILL: Record<Skill, { rt: number; rtSd: number; fakeTap: number; lapse: number; hold: number; think: number; wisp: number; twitch: number; aimSd: number }> = {
  novice: { rt: 0.4, rtSd: 0.12, fakeTap: 0.12, lapse: 0.15, hold: 64, think: 1.4, wisp: 0.35, twitch: 0.4, aimSd: 12 },
  reference: { rt: 0.29, rtSd: 0.07, fakeTap: 0.04, lapse: 0.06, hold: 72, think: 0.7, wisp: 0.7, twitch: 0.9, aimSd: 5 },
  expert: { rt: 0.22, rtSd: 0.04, fakeTap: 0.01, lapse: 0.02, hold: 77, think: 0.35, wisp: 0.9, twitch: 1, aimSd: 2 },
};

export interface StyxOpts {
  skill?: Skill;
  /** No fishing: the netters alone (idleRate calibration; trivially 1.0, the scene credits idleObols). */
  passive?: boolean;
}

// Scene constants (src/depts/styx/scene.ts).
const DT = 1 / 30;
const RED = 80;
const START_TENSION = 25;
const FLY_S = 0.55;
const RERIG_S = 5;
const MAX_WISPS = 3;
const WISP_CROSS_S = 6.5; // ~130 px of river at 16-24 px/s
const FOG_S = 20;
/** Share of the bot's expected active income counted in the buyer's value (see bridge.ts). */
const ACTIVE_W = 0.25;

const run = (s: DeptSave) => s.run as M.StyxRun;
const per = (s: DeptSave) => s.persistent as M.StyxPersistent;

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
function shop(save: DeptSave): UpgradeEntry[] {
  return buildGroups(headlessCtx(save), { onBuy() {} }).flatMap((g) => g.entries);
}

function gauss(rnd: Rng): number {
  const u = Math.max(1e-9, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}
/** Standard normal CDF (Abramowitz-Stegun). */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// ---------- the bot's analytic expectation (buyer + band choice) ----------

interface Est {
  rate: number; // Obols/s from catches + wisps
  band: number;
}

function estimate(r: M.StyxRun, sk: (typeof SKILL)[Skill], bait: M.BaitId = r.bait): Est {
  const w = r.wrath;
  const win = M.hookWindowMs(r.lv.strike, w) / 1000;
  const pHook = phi((win - sk.rt) / sk.rtSd) * (1 - sk.fakeTap * M.fakeChance(w) * 1.2);
  let best = { rate: 0, band: 0 };
  for (let b = 0; b < r.bands; b++) {
    const depth = b * M.BAND_PX + 30;
    const wt = M.rarityWeights(bait, b, r.lv.scent, w);
    const ev = M.bandEV(b, wt);
    const tWait = M.biteWait(r.lv.lantern) / (1 + 0.25 * sk.twitch) + 1.2 + 0.7 + M.fakeChance(w) * 0.9;
    const cap = M.lineCap(r.lv.line);
    const duty = M.drainRate(r.lv.steady) / (M.drainRate(r.lv.steady) + M.REEL_RISE / cap);
    const thr = 2 + M.wrathThrashes(w);
    const tReel = (depth + 24) / (M.reelSpeed(r.lv.reel) * duty) + thr * 1.1;
    // Escape chance per thrash: a lapse that holds into a hard pull.
    const pull = (50 / 30) * M.wrathPull(w);
    const qThr = Math.min(0.6, sk.lapse * Math.min(1, (pull * 0.55) / cap));
    const pLand = 1 - (1 - (1 - qThr) ** thr) * (1 - M.barbChance(r.lv.barb));
    const tCycle = depth / M.SINK_PX_S + tWait + pHook * tReel + FLY_S + sk.think;
    const streak = Math.min(20, (pHook * pLand) / Math.max(0.05, 1 - pLand));
    const val = ev * M.comboMult(streak * 0.8) * M.wrathActive(w) * M.legendMult(r) * (bait === 'gilded' ? 2 : 1);
    const rate = (pHook * pLand * val) / tCycle;
    if (rate > best.rate) best = { rate, band: b };
  }
  const wisp = (sk.wisp / M.wispEvery(r.lv.wispnet)) * (M.COMMON_BASE[r.bands - 1] / 5) * M.wispMult(r.lv.wispnet) * M.wrathActive(w) * M.legendMult(r);
  return { rate: best.rate + wisp, band: best.band };
}

// ---------- the adapter ----------

export const createStyx = (opts: StyxOpts = {}): AdapterFactory => (seed) => {
  const sk = SKILL[opts.skill ?? 'reference'];
  let sessions = 0;
  const counters = { casts: 0, lands: 0, escapes: 0, misses: 0, spooks: 0, slips: 0 };

  function startSession(save: DeptSave, env: SessionEnv): ActiveSession {
    const r = run(save);
    const p = per(save);
    M.normalize(r, p);
    const rnd = makeRng(childSeed(seed, `styx.bot.${sessions++}`));

    type Phase = 'idle' | 'sink' | 'wait' | 'seek' | 'nibble' | 'reel' | 'land' | 'rerig';
    let phase: Phase = 'idle';
    let phaseT = sk.think; // countdown for the current phase
    let depth = 0;
    let band = 0;
    let biteT = 0;
    // nibble
    let sp: M.Species = M.SPECIES_BY_ID.clerk;
    let fakes = 0;
    let nibStep: 'nib' | 'dip' | 'plunge' = 'nib';
    let twin = 0;
    let rtLeft = 0; // reaction countdown on the plunge (Infinity = will miss)
    // reel
    let dist0 = 0;
    let dist = 0;
    let tension = 0;
    let over = 0;
    let zero = 0;
    let thrIdx = 0;
    let thrN = 0;
    let tele = 0;
    let thr = 0;
    let teleported = false;
    let holding = false;
    let releaseIn = -1; // bot release scheduled after a telegraph
    let resumeIn = -1;
    let decideT = 0;
    let landValue = 0;
    let landFirst = false;
    // wisps and fog
    let wispT = M.wispEvery(r.lv.wispnet) * (0.7 + 0.6 * rnd());
    const wisps: number[] = []; // remaining crossing time
    let fogT = 0;
    let fogCd = 70 + 60 * rnd();
    let idleAcc = 0;

    const W = () => r.wrath;
    let goalW = M.WRATH_MAX;
    const tutorial = () => r.stats.lands === 0;

    function chooseBait(): void {
      const wantRare = r.wrath >= 1 && r.gate.rare === 0 && r.bands >= 2;
      const has = (b: M.BaitId) => (p.baits[b] ?? 0) > 0;
      if (wantRare && has('debt')) r.bait = 'debt';
      else if (has('gilded')) r.bait = 'gilded';
      else if (has('promise')) r.bait = 'promise';
      else r.bait = 'worm';
    }

    function cast(): void {
      chooseBait();
      // Work the skill gate at its target Wrath (easier fish); otherwise fish at the top level.
      r.wrath = save.cycle.heldLevel < goalW && r.wrathMax >= goalW ? goalW : r.wrathMax;
      band = Math.min(r.bands - 1, estimate(r, sk).band);
      const target = band * M.BAND_PX + 30 + gauss(rnd) * sk.aimSd;
      depth = Math.max(4, Math.min(r.bands * M.BAND_PX - 4, target));
      band = Math.max(0, Math.min(r.bands - 1, Math.floor(depth / M.BAND_PX)));
      r.stats.casts++;
      counters.casts++;
      phase = 'sink';
      phaseT = depth / M.SINK_PX_S;
    }

    function sampleBite(): number {
      if (tutorial()) return 1.2;
      return Math.max(0.6, -Math.log(1 - rnd() * 0.95) * M.biteWait(r.lv.lantern));
    }

    function chooseBiter(): void {
      const rar: M.Rarity = tutorial() ? 'common' : M.rollRarity(M.rarityWeights(r.bait, band, r.lv.scent, W(), save.imports?.potions ?? 0), rnd());
      sp = M.speciesFor(band, rar);
      const d = 20 + 30 * rnd();
      phase = 'seek';
      phaseT = d / Math.max(28, sp.speed * 2) + (sp.behavior === 'circle' ? 1.6 : 0);
    }

    function beginNibble(): void {
      fakes = 0;
      if (!tutorial()) {
        const pf = M.fakeChance(W());
        while (fakes < 2 && rnd() < pf) fakes++;
        if (sp.behavior === 'singer') fakes++;
      }
      nibStep = 'nib';
      phaseT = 0.5 + rnd() * 0.4;
      twin = sp.behavior === 'twin' ? 1 : 0;
      phase = 'nibble';
    }

    function hookWindow(): number {
      const ms = M.hookWindowMs(r.lv.strike, W());
      return (tutorial() ? Math.max(ms, 1100) : ms) / 1000;
    }

    function reaction(): number {
      return Math.max(0.12, sk.rt + gauss(rnd) * sk.rtSd + (fogT > 0 ? 0.06 : 0));
    }

    function spook(): void {
      counters.spooks++;
      phase = 'wait';
      biteT = sampleBite();
    }

    function updateNibble(dt: number): void {
      if (nibStep === 'plunge') {
        rtLeft -= dt;
        if (rtLeft <= 0) {
          // The tap lands inside the window.
          if (twin > 0) {
            twin--;
            nibStep = 'nib';
            phaseT = 0.35;
            fakes = 0;
            return;
          }
          startReel();
          return;
        }
      }
      phaseT -= dt;
      if (phaseT > 0) return;
      if (nibStep === 'nib') {
        if (fakes > 0) {
          fakes--;
          nibStep = 'dip';
          phaseT = 0.22;
          if (rnd() < sk.fakeTap) spook();
        } else {
          nibStep = 'plunge';
          phaseT = hookWindow();
          rtLeft = reaction();
        }
      } else if (nibStep === 'dip') {
        nibStep = 'nib';
        phaseT = 0.4 + rnd() * 0.5;
      } else {
        // Missed the window.
        if (tutorial()) {
          nibStep = 'nib';
          phaseT = 0.9;
          return;
        }
        counters.misses++;
        spook();
      }
    }

    function startReel(): void {
      phase = 'reel';
      r.stats.hooks++;
      dist0 = depth + 24;
      dist = dist0;
      thrN = tutorial() ? 1 : sp.thrashes + M.wrathThrashes(W());
      tension = START_TENSION;
      over = 0;
      zero = 0;
      thrIdx = 0;
      tele = 0;
      thr = 0;
      teleported = false;
      holding = true;
      releaseIn = -1;
      resumeIn = -1;
      decideT = 0;
    }

    function thrashDur(): number {
      return sp.behavior === 'king' ? 1.3 : sp.behavior === 'heavy' ? 1.1 : sp.behavior === 'echo' ? 1.0 : 0.75;
    }

    function botReel(dt: number): void {
      // Thrash telegraph: release after the reaction time.
      if (releaseIn >= 0) {
        releaseIn -= dt;
        if (releaseIn <= 0) {
          releaseIn = -1;
          holding = false;
        }
      }
      if (resumeIn >= 0) {
        resumeIn -= dt;
        if (resumeIn <= 0) resumeIn = -1;
        return;
      }
      decideT -= dt;
      if (decideT > 0 || releaseIn >= 0 || tele > 0 || thr > 0) return;
      decideT = 0.1;
      if (holding && tension >= sk.hold) holding = false;
      else if (!holding && tension <= sk.hold - 28) holding = true;
      // Never let it drift loose.
      if (!holding && tension < 5) holding = true;
    }

    function updateReel(dt: number): void {
      if (tele > 0) {
        tele -= dt;
        if (tele <= 0) thr = thrashDur();
      } else if (thr > 0) {
        thr -= dt;
        if (thr <= 0) {
          // Thrash over: the bot resumes after a short look.
          resumeIn = 0.5 * reaction();
          holding = tension < sk.hold - 10;
        }
      }
      botReel(dt);
      const thrashing = thr > 0;
      const pullK = tutorial() ? 0.5 : (sp.pull / 30) * M.wrathPull(W());
      const cap = M.lineCap(r.lv.line);
      if (holding) {
        const rise = M.REEL_RISE + (thrashing ? 2 * M.REEL_RISE * pullK : 0);
        tension += (rise / cap) * dt;
        if (tension < RED) {
          const slow = sp.behavior === 'heavy' && thrashing ? 0.6 : 1;
          dist -= M.reelSpeed(r.lv.reel) * slow * dt;
        }
      } else {
        tension -= M.drainRate(r.lv.steady) * (thrashing ? 0.5 : 1) * dt;
        if (sp.behavior === 'sinker' || thrashing) dist = Math.min(dist0, dist + (thrashing ? 4 : 6) * dt);
      }
      tension = Math.max(0, Math.min(110, tension));
      over = tension >= 100 ? over + dt : 0;
      zero = tension <= 0.01 ? zero + dt : 0;
      const prog = 1 - dist / dist0;
      if (thrIdx < thrN && tele <= 0 && thr <= 0 && prog >= (thrIdx + 1) / (thrN + 1)) {
        thrIdx++;
        tele = tutorial() ? 0.7 : 0.3;
        // The bot sees the red glow and eases off after its reaction time.
        if (holding) releaseIn = reaction() + (rnd() < sk.lapse ? 0.35 : 0);
      }
      if (sp.behavior === 'teleport' && !teleported && prog >= 0.5) {
        teleported = true;
        dist = Math.min(dist0, dist + 0.3 * dist0);
      }
      if (over >= 0.4) {
        slip(thrashing);
        return;
      }
      if (zero > 2.5) {
        escape();
        return;
      }
      if (dist <= 0) land();
    }

    function slip(thrashing: boolean): void {
      if (rnd() < M.barbChance(r.lv.barb)) {
        land();
        return;
      }
      counters.slips++;
      if (sp.rarity === 'legendary' && thrashing) {
        r.stats.snaps++;
        escape();
        phase = 'rerig';
        phaseT = RERIG_S;
        return;
      }
      escape();
    }

    function escape(): void {
      phase = 'idle';
      phaseT = sk.think;
      r.combo = 0;
      r.stats.escapes++;
      counters.escapes++;
      if (W() >= 1) {
        if (r.gate.w !== W()) r.gate = { w: W(), lands: 0, esc: 0, rare: 0 };
        r.gate.esc++;
      }
    }

    function land(): void {
      const value = M.soulBase(sp, band) * M.comboMult(r.combo) * M.wrathActive(W()) * M.legendMult(r) * (r.bait === 'gilded' ? M.gildedMult(save.imports?.potions ?? 0) : 1);
      landFirst = !(p.codex[sp.id] > 0);
      landValue = value;
      r.combo++;
      r.stats.lands++;
      counters.lands++;
      r.stats.bestCombo = Math.max(r.stats.bestCombo, r.combo);
      p.codex[sp.id] = (p.codex[sp.id] ?? 0) + 1;
      if (r.bait !== 'worm') {
        p.baits[r.bait] = Math.max(0, (p.baits[r.bait] ?? 0) - 1);
        if (p.baits[r.bait] <= 0) r.bait = 'worm';
      }
      if (M.RARE_PLUS(sp.rarity)) r.stats.rares++;
      if (sp.rarity === 'legendary') r.stats.legendaries++;
      if (W() >= 1) {
        if (r.gate.w !== W()) r.gate = { w: W(), lands: 0, esc: 0, rare: 0 };
        r.gate.lands++;
        if (M.RARE_PLUS(sp.rarity)) r.gate.rare++;
        const g = r.gate;
        if (g.lands >= M.GATE_LANDS && g.rare >= 1 && g.esc / (g.lands + g.esc) <= 0.3) {
          env.raiseSkill(W());
          r.gate = { w: W(), lands: 0, esc: 0, rare: 0 };
        }
      }
      phase = 'land';
      phaseT = FLY_S;
    }

    function finishFly(): void {
      env.earn(landValue);
      if (landFirst) env.earn(10 * M.soulBase(sp, band));
      phase = 'idle';
      phaseT = sk.think;
    }

    function updateWisps(dt: number): void {
      wispT -= dt;
      if (wispT <= 0 && wisps.length < MAX_WISPS) {
        wispT = M.wispEvery(r.lv.wispnet) * (0.7 + rnd() * 0.6);
        wisps.push(WISP_CROSS_S);
        // The bot flicks it if its thumb is free (hook sinking or waiting).
        if ((phase === 'sink' || phase === 'wait' || phase === 'seek' || phase === 'idle') && rnd() < sk.wisp) {
          wisps.pop();
          r.stats.wisps++;
          env.earn((M.COMMON_BASE[r.bands - 1] / 5) * M.wispMult(r.lv.wispnet) * M.wrathActive(W()) * M.legendMult(r));
        }
      }
      for (let i = wisps.length - 1; i >= 0; i--) {
        wisps[i] -= dt;
        if (wisps[i] <= 0) wisps.splice(i, 1);
      }
    }

    function updateFog(dt: number): void {
      if (W() < 5) {
        fogT = 0;
        return;
      }
      if (fogT > 0) fogT -= dt;
      else {
        fogCd -= dt;
        if (fogCd <= 0) {
          fogCd = 70 + rnd() * 60;
          fogT = FOG_S;
        }
      }
    }

    function tick(dt: number): void {
      // Netters (the scene credits idleObols on screen, once a second).
      idleAcc += M.idleObols(r) * dt;
      if (idleAcc > 0 && (idleAcc >= 1 || dt >= 1)) {
        env.earn(idleAcc);
        idleAcc = 0;
      }
      if (opts.passive) return;
      updateWisps(dt);
      updateFog(dt);
      switch (phase) {
        case 'idle':
          phaseT -= dt;
          if (phaseT <= 0) cast();
          break;
        case 'sink':
          phaseT -= dt;
          if (phaseT <= 0) {
            phase = 'wait';
            biteT = sampleBite();
          }
          break;
        case 'wait': {
          const twitching = !tutorial() && rnd() < sk.twitch ? 1.25 : 1;
          biteT -= dt * twitching;
          if (biteT <= 0) chooseBiter();
          break;
        }
        case 'seek':
          phaseT -= dt;
          if (phaseT <= 0) beginNibble();
          break;
        case 'nibble':
          updateNibble(dt);
          break;
        case 'reel':
          updateReel(dt);
          break;
        case 'land':
          phaseT -= dt;
          if (phaseT <= 0) finishFly();
          break;
        case 'rerig':
          phaseT -= dt;
          if (phaseT <= 0) {
            phase = 'idle';
            phaseT = sk.think;
          }
          break;
      }
    }

    // ---------- the buyer ----------

    const value = () => M.idleObols(r) + ACTIVE_W * estimate(r, sk, 'worm').rate;

    function buyWrath(): boolean {
      if (r.bands < 2 || r.wrathMax >= M.WRATH_MAX) return false;
      const cost = M.wrathCost(r.wrathMax + 1);
      if (r.bank + 1e-9 < cost) return false;
      r.bank -= cost;
      r.wrathMax++;
      r.wrath = r.wrathMax;
      return true;
    }

    return {
      step(dt) {
        let left = dt;
        while (left > 1e-9) {
          const h = Math.min(DT, left);
          tick(h);
          left -= h;
        }
      },

      buy(goals: BotGoals) {
        const bought: string[] = [];
        goalW = Math.min(goals.dialGoal, M.WRATH_MAX);
        for (let guard = 0; guard < 200; guard++) {
          const goal = goalW;
          const dialNeeded = r.bands >= 2 && r.wrathMax < goal;
          const wCost = M.wrathCost(r.wrathMax + 1);
          if (dialNeeded && !opts.passive && r.bank >= wCost) {
            buyWrath();
            bought.push('wrath');
            continue;
          }
          const v0 = value();
          let best: { e: UpgradeEntry | null; cost: number; ratio: number; gain: number } | null = null;
          for (const e of shop(save)) {
            if (e.id.startsWith('bait.')) continue;
            if (e.level() >= e.max || e.locked?.()) continue;
            if (opts.passive && !['netter', 'nets', 'poles', 'deeper'].includes(e.id)) continue;
            const cost = e.cost();
            // Δvalue: try the level on the run and undo. A node whose next level changes nothing
            // (Longer Poles still inside the Shallows) is judged on up to 3 levels at once.
            let gain = 0;
            let ratio = 0;
            if (e.id === 'deeper') {
              r.bands++;
              gain = value() - v0;
              r.bands--;
              ratio = gain / cost;
            } else {
              const id = e.id as M.NodeId;
              const l0 = r.lv[id];
              let sum = 0;
              for (let k = 1; k <= 3 && l0 + k <= M.NODES[id].max; k++) {
                sum += M.nodeCost(id, l0 + k - 1);
                r.lv[id] = l0 + k;
                const g = value() - v0;
                if (g > 0) {
                  gain = g;
                  ratio = g / sum;
                  break;
                }
              }
              r.lv[id] = l0;
            }
            if (!(gain > 0)) continue;
            if (!best || ratio > best.ratio) best = { e, cost, ratio, gain };
          }
          // Wrath above the gate's need: valued like any node (active x1.12, idle x1.10 per level),
          // but not while the gate is being worked (changing Wrath restarts the 20-soul tally).
          const working = save.cycle.heldLevel < goal;
          if (!dialNeeded && !working && !opts.passive && r.bands >= 2 && r.wrathMax < M.WRATH_MAX) {
            r.wrathMax++;
            r.wrath = r.wrathMax;
            const gain = value() - v0;
            r.wrathMax--;
            r.wrath = r.wrathMax;
            if (gain > 0 && (!best || gain / wCost > best.ratio)) best = { e: null, cost: wCost, ratio: gain / wCost, gain };
          }
          if (!best || r.bank < best.cost) break;
          // Saving for the dial: only buy what pays for itself before the dial is affordable anyway.
          // Deeper Cast is exempt: it opens content (and Wrath needs the Murk).
          if (dialNeeded && best.e?.id !== 'deeper' && best.cost / best.gain > Math.max(300, (wCost - r.bank) / Math.max(1e-9, v0))) break;
          if (best.e) {
            best.e.buy();
            bought.push(best.e.id);
          } else if (buyWrath()) bought.push('wrath');
        }
        // Baits (persistent stock): Unpaid Debt for the gate's rare, Gilded Obol once a catch is
        // worth well over its 200-Obol share.
        if (!opts.passive) {
          const catchVal = M.bandEV(r.bands - 1) * M.wrathActive(r.wrath) * M.legendMult(r);
          const entries = shop(save);
          const buyBait = (id: M.BaitId) => {
            const e = entries.find((x) => x.id === `bait.${id}`)!;
            if (!e.locked?.() && e.canAfford() && r.bank > 20 * e.cost()) {
              e.buy();
              bought.push(e.id);
            }
          };
          if (r.wrathMax >= 1 && (p.baits.debt ?? 0) < 5) buyBait('debt');
          if (catchVal > 600 && (p.baits.gilded ?? 0) < 5) buyBait('gilded');
        }
        return bought;
      },

      end() {
        if (idleAcc > 0) env.earn(idleAcc);
        idleAcc = 0;
      },
      stats: () => ({ ...counters, est: Math.round(estimate(r, sk).rate * 10) / 10 }),
    };
  }

  return {
    id: 'styx',
    def: styxEcon,
    dialMax: M.WRATH_MAX,
    dialId: 'wrath',
    dialCost: (k) => M.wrathCost(k + 1),
    startSession,
    anyAffordable(save) {
      const r = run(save);
      if (r.bands >= 2 && r.wrathMax < M.WRATH_MAX && r.bank >= M.wrathCost(r.wrathMax + 1)) return true;
      // The scene's badge: upgrades, baits excluded (upgrades.ts anyAffordable).
      return shop(save).some((e) => !e.id.startsWith('bait.') && e.level() < e.max && !e.locked?.() && e.canAfford());
    },
    dialLevel: (save) => run(save).wrathMax ?? 0,
    // 03 §3: active ~2.8x on-screen idle (~4.3x offline at the Styx's unlock factor).
    localRatioBands: { all: [2.4, 3.2] },
    ratioScale: (save) => M.legendMult(run(save)),
    describe(save) {
      const r = run(save);
      return `wrath ${r.wrathMax} bands ${r.bands} legend ${r.lv.legend ?? 0} netters ${r.lv.netter} nets ${r.lv.nets} reel ${r.lv.reel}`;
    },
  };
};
