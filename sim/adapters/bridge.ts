// Troll Bridge adapter. The Bridge's rules are pure (src/depts/bridge/model.ts: traveler
// generation, tells, the Poster, haggle replies, the Wallet Sense band, bounties, goon tolls);
// its gate loop lives in scene.ts (tangled with Pixi), so this file ports that loop headless:
// a fresh bench on entry, one arrival every ARRIVE_S (bench overflow goes to the goons), walk-in /
// decide / walk-out timing, Search (1.1 s) and Unmask reveals (1.3 s), counters, bonks and
// naps (goons take the gate, taps on Grumm shorten the nap), the streak, the Hero Whisper and its
// showdown, the onboarding's scripted travelers, the evidence-gated Infamy skill gate, "word gets
// around" (3 false accusations in 60 s slow arrivals 20% for 30 s), the Bard's song (+10% tolls for
// 30 s), the Bribes card (a bribe the bot takes unless it reads smuggling) and the Shapeshifters
// card (the bot looks twice and notices the flicker like any other tell). Squint only points at
// parts in the scene, so it has no rule to mirror.
// The shop is the real upgrade list (src/depts/bridge/upgrades.ts buildGroups) on a headless
// DeptCtx, so costs, caps and the Menace dial match the game.
//
// Bot (00 §8.1 "Bridge" row; wave 1 rules): it reads the traveler the way a player does. It
// compares each visible part and the destination with what the Claim normally looks like
// (model.ts NORMAL); an odd part counts only if it is on today's Decree (the bot knows what each
// Decree part means, as a player's Codex does after a few catches). Each real tell is noticed with a
// skill-dependent chance; a skill-dependent share of travelers is read without checking the
// Decree, so off-Decree fashion (red herrings, yesterday's tell) reads as a tell. It checks a
// Writ's seal and the Wanted poster, and ignores today's fake tell once the Menace 9 card is out.
// It Unmasks at >= 2 hero clues (the expert at 1) and Searches on smuggling clues or a sniff.
// Otherwise it haggles with the price tiers: the highest tier under its aim inside the Wallet
// Sense band (lower for brawny Claims and suspects), GOUGE / ROB only while Glower lasts, taking
// a counter and stepping down a tier after a FURIOUS refusal. Mistakes (false accusations, liars
// let through while a tell showed) are fined after two free ones per session, as in the scene.
// No information leaks to the bot that the player can't see. The greedy buyer ranks
// nodes by Δ(value)/cost, value = idleRate + a share of the bot's expected active income per
// traveler (a Monte Carlo over the real generator and reply rules, common random numbers).
import type { DeptCtx, UpgradeEntry } from '../../src/core/dept';
import type { DeptSave } from '../../src/core/types';
import { bridgeEcon } from '../../src/depts/bridge/def';
import * as M from '../../src/depts/bridge/model';
import { buildGroups } from '../../src/depts/bridge/upgrades';
import { childSeed, makeRng, type Rng } from '../rng';
import type { ActiveSession, AdapterFactory, BotGoals, SessionEnv } from '../types';

export type Skill = 'novice' | 'reference' | 'expert';

/** notice: chance each real contradiction is spotted; misread: chance per traveler of a
 * spurious hero clue; poster: chance the Poster/Writ are checked; rule: remembers the fake-tell
 * card; think: seconds to size up a traveler and drag the stack; aim: where in the Wallet band
 * the demand lands (0 = low edge), with noise; unmaskAt: hero clues needed; push: pushes a
 * counter by 0.1; taps: taps/s on a napping Grumm. */
// decree: chance a traveler is read against today's Decree (else every pool part reads as a tell).
const SKILL: Record<Skill, { notice: number; misread: number; poster: number; rule: number; decree: number; think: number; aim: number; noise: number; unmaskAt: number; push: boolean; taps: number }> = {
  novice: { notice: 0.7, misread: 0.04, poster: 0.5, rule: 0.6, decree: 0.7, think: 2.6, aim: 0.35, noise: 0.15, unmaskAt: 2, push: false, taps: 1 },
  // SIM-TUNED (wave 1): reference unmaskAt 2 -> 1 (one Decree tell is real evidence now that
  // off-Decree parts are fashion; at 2 it let most heroes through and paid the fines), aim 0.5 -> 0.6.
  reference: { notice: 0.9, misread: 0.01, poster: 0.9, rule: 0.95, decree: 0.95, think: 1.8, aim: 0.65, noise: 0.08, unmaskAt: 1, push: false, taps: 2 },
  expert: { notice: 0.98, misread: 0.003, poster: 1, rule: 1, decree: 0.99, think: 1.2, aim: 0.7, noise: 0.04, unmaskAt: 1, push: true, taps: 4 },
};

export interface BridgeOpts {
  skill?: Skill;
  /** No orders: the goons work the gate (calibrates idleRate against the live loop). */
  passive?: boolean;
}

// Scene constants (src/depts/bridge/scene.ts).
const WALK_S = 0.9;
const HOLD_S = 0.3;
const SEARCH_S = 1.1;
const REVEAL_S = 1.3;
const GOON_GATE_S = 1.4;
const H_STEP = 0.1;
/** Share of the bot's expected active income counted in the buyer's value (the reference player
 * spends ~10-20 min a day per department on screen and the rest offline on idleRate). */
const ACTIVE_W = 0.25;

const run = (s: DeptSave) => s.run as M.BridgeRun;
const per = (s: DeptSave) => s.persistent as M.BridgePersistent;

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
  return buildGroups(headlessCtx(save), { onGoon() {}, onMenaceBought() {} }).flatMap((g) => g.entries);
}

// ---------- the bot's reading of a traveler ----------

interface Read {
  hero: number; // hero clues (a Poster match counts as 2)
  smuggle: boolean;
}

function readTraveler(t: M.Traveler, menace: number, poster: M.Poster, sk: (typeof SKILL)[Skill], rnd: Rng): Read {
  const normal = M.NORMAL[t.who];
  const ignoreFake = menace >= 9 && rnd() < sk.rule;
  const decreeCheck = rnd() < sk.decree;
  let hero = 0;
  let smuggle = false;
  for (const slot of M.SLOTS) {
    const part = t.look[slot];
    if (normal[slot].includes(part)) continue;
    if (ignoreFake && part === poster.fake) continue;
    // On the Decree it marks a liar; off it, fashion, unless the bot forgot to check the Decree.
    const k = M.decreeKind(poster.decree, part, menace) ?? (decreeCheck ? null : M.poolKind(part));
    if (!k || rnd() >= sk.notice) continue;
    if (k === 'smug') smuggle = true;
    else hero++;
  }
  if (!normal.where.includes(t.where) && rnd() < sk.notice) hero++;
  if (t.shift && rnd() < sk.notice) hero++;
  const checks = rnd() < sk.poster;
  if (checks && t.writ === 2) hero++;
  if (checks && M.posterMatches(poster, t.look) >= 2) hero = Math.max(2, hero);
  if (rnd() < sk.misread) hero++;
  return { hero, smuggle: smuggle || t.sniff };
}

/** The price tier (index into M.PRICE_TIERS) the bot asks: the highest under its aim inside the
 * Wallet Sense band, GOUGE / ROB only with Glower left, and below `cap` (a tier just refused). */
function tierFor(t: M.Traveler, r: M.BridgeRun, offended: boolean, wary: boolean, sk: (typeof SKILL)[Skill], rnd: Rng, glower: number, cap = 99): number {
  const [lo, hi] = M.band(t, r.lv.sense, offended);
  let f = sk.aim + (rnd() * 2 - 1) * sk.noise - (wary ? 0.25 : 0);
  f = Math.max(0, Math.min(1, f));
  const aim = lo + f * (hi - lo);
  let k = 0;
  M.PRICE_TIERS.forEach((tier, i) => {
    if (i < cap && tier.mult <= aim + 1e-6 && glower + 1e-6 >= tier.glower) k = i;
  });
  return k;
}

// ---------- the buyer's expected active income per traveler (Monte Carlo, common random numbers) ----------

const MC_N = 160;
const mcCache = new Map<string, number>();
const POSTER_MC = M.posterFor('sim-mc');
/** Expected Tollpence per traveler at fareMult 1 (the bot's policy, real generator and replies). */
function expectedPerTraveler(r: M.BridgeRun, sk: (typeof SKILL)[Skill]): number {
  const L = r.lv;
  const key = `${r.menace}|${L.glare},${L.tongue},${L.fists},${L.sense},${L.nose},${L.sniffer},${L.booth},${L.skull},${L.goons},${L.pricing}|${sk.notice}`;
  let v = mcCache.get(key);
  if (v !== undefined) return v;
  const rnd = makeRng(0x5eed);
  const fm = { ...r, lv: { ...L, signage: 0, charter: 0 }, menace: r.menace };
  let total = 0;
  let streak = 0;
  for (let i = 0; i < MC_N; i++) {
    const t = M.generate(0xb41d, i, { menace: r.menace, booth: L.booth, nose: L.nose, sniffer: L.sniffer, poster: POSTER_MC });
    const read = readTraveler(t, r.menace, POSTER_MC, sk, rnd);
    const pm = M.payoutMult(r.menace);
    if (read.hero >= sk.unmaskAt) {
      if (t.hero) total += t.kindFare * M.bountyMult(M.evidence(t)) * pm;
      else streak = 0;
      continue;
    }
    const h: M.Haggle = { round: 0, counter: 0, offended: false };
    if (t.bribe > 0 && !read.smuggle) {
      streak = Math.min(10, streak + 1);
      total += t.claimFare * t.bribe * pm * M.streakMult(streak);
      continue;
    }
    if (read.smuggle) {
      if (t.smuggler) {
        total += t.kindFare * M.SEIZE_MULT * pm;
        continue;
      }
      h.offended = true;
      streak = 0;
    }
    const wary = read.hero > 0 || t.who === 'adventurer';
    // The tier haggle: take a counter, step down a tier after a refusal (Glower assumed on hand).
    let k = tierFor(t, fm, h.offended, wary, sk, rnd, M.GLOWER_MAX);
    let mult = M.PRICE_TIERS[k].mult;
    let rep = M.reply(t, h, fm, mult);
    for (let guard = 0; guard < 4 && (rep.kind === 'counter' || rep.kind === 'refuse'); guard++) {
      h.round++;
      if (rep.kind === 'counter') {
        h.counter = rep.mult;
        h.pips = rep.pips;
        mult = rep.mult;
      } else {
        h.pips = rep.pips;
        k = tierFor(t, fm, h.offended, wary, sk, rnd, M.GLOWER_MAX, k);
        mult = M.PRICE_TIERS[k].mult;
      }
      rep = M.reply(t, h, fm, mult);
    }
    if (rep.kind === 'pay') {
      if (mult >= M.STREAK_MIN - 1e-6) streak = Math.min(10, streak + 1);
      total += t.claimFare * mult * pm * M.streakMult(streak);
    } else {
      streak = 0;
      // A bonk costs the nap: the goons work the gate meanwhile.
      if (rep.kind === 'bonk') total -= (M.napSeconds(L.skull) / M.ARRIVE_S) * t.claimFare * pm * (1.5 - M.goonFlat(L.pricing) * M.goonEff(L.goons));
    }
  }
  v = total / MC_N;
  if (mcCache.size > 5000) mcCache.clear();
  mcCache.set(key, v);
  return v;
}

function value(r: M.BridgeRun, sk: (typeof SKILL)[Skill]): number {
  const active = M.TRAFFIC * expectedPerTraveler(r, sk) * M.signageMult(r.lv.signage) * M.charterMult(r.lv.charter);
  return M.idleTollpence(r) + ACTIVE_W * active;
}

// ---------- the adapter ----------

interface Gate {
  t: M.Traveler;
  phase: 'walkIn' | 'wait' | 'counter' | 'hold' | 'search' | 'reveal' | 'leave';
  timer: number;
  think: number;
  h: M.Haggle;
  searched: boolean;
  goonT: number;
  next: 'unmask' | 'search' | null;
  lastTier: number;
}

export const createBridge = (opts: BridgeOpts = {}): AdapterFactory => (seed) => {
  const sk = SKILL[opts.skill ?? 'reference'];
  let sessions = 0;
  const seeded = new WeakSet<object>();
  // Verdict accuracy (wave 1 target ~75-85% for a skilled reader): liars caught + honest tolled
  // over all travelers the bot decided on; mistakes and fines as charged by the scene's rules.
  const counters = { liveS: 0, liars: 0, caught: 0, decided: 0, correct: 0, falseAcc: 0, missed: 0, unread: 0, fines: 0, finesTp: 0, earnedTp: 0, tollTp: 0, bountyTp: 0, seizeTp: 0 };

  function startSession(save: DeptSave, env: SessionEnv): ActiveSession {
    const skulls = () => save.imports?.bones ?? 0;
    const r = run(save);
    const p = per(save);
    M.normalize(r, p);
    // defaultRun() seeds travelers from Math.random(); reseed so runs are deterministic.
    if (!seeded.has(r)) {
      seeded.add(r);
      r.seed = childSeed(seed, `bridge.run.${sessions}`);
    }
    const rnd = makeRng(childSeed(seed, `bridge.bot.${sessions++}`));
    const poster = M.posterFor(`sim-${Math.floor(env.now() / 86400000)}`);
    r.menace = Math.min(r.menace, r.menaceMax);
    const bench: M.Traveler[] = [];
    let cur: Gate | null = null;
    let arriveT = 0;
    let napT = 0;
    let clock = 0;
    let wordT = 0;
    let songT = 0;
    const falseStamps: number[] = [];
    const ses = M.session(r, env.now());
    const earnActive = (base: number, src: 'tollTp' | 'bountyTp' | 'seizeTp' = 'tollTp') => {
      const before = r.bank;
      env.earn(base);
      const got = Math.max(0, r.bank - before);
      counters[src] += got;
      ses.purse += got;
      ses.paid++;
      counters.earnedTp += got;
    };
    function mistake(): void {
      const fine = M.mistakeFine(ses, r.bank);
      r.stats.mistakes = (r.stats.mistakes ?? 0) + 1;
      r.streak = 0;
      if (fine > 0) {
        r.bank -= fine;
        r.stats.fines = (r.stats.fines ?? 0) + fine;
        counters.fines++;
        counters.finesTp += fine;
      }
    }
    /** A traveler passed on a toll, a wave or a bribe: a liar with a tell showing is a mistake. */
    function liarPassed(bribed: boolean): void {
      const t = cur!.t;
      if (t.hero) heroSlipped();
      if ((!t.hero && !t.smuggler) || (t.smuggler && bribed)) return;
      counters.liars++;
      if (t.tells.length > 0 || t.posterMatch) {
        counters.missed++;
        r.stats.missed = (r.stats.missed ?? 0) + 1;
        mistake();
      } else counters.unread++;
    }
    // Passive (calibration): play normally until the first goon is hired, then give no orders.
    const passive = () => !!opts.passive && r.lv.goons > 0;
    if (!opts.passive) r.stats.posterOpens++;
    env.raiseSkill(Math.max(0, M.heldMenace(r.ev)));

    const gen = (force?: M.GenOpts['force']) =>
      M.generate(r.seed, r.idx++, { menace: r.menace, booth: r.lv.booth, nose: r.lv.nose, sniffer: r.lv.sniffer, poster, force });

    function pendingStep(): string | null {
      const s = r.stats;
      if (s.tolls < 1) return 'toll';
      if (r.lv.goons < 1) return 'hire';
      if (s.unmasks < 1) return 'unmask';
      if (s.confisc < 1) return 'search';
      return null;
    }
    function pullNext(): void {
      if (cur) return;
      const step = passive() ? null : pendingStep();
      let t: M.Traveler | undefined;
      if (step === 'toll' && r.stats.travelers === 0) t = gen('merchant');
      else if (step === 'unmask') t = gen('heroLesson');
      else if (step === 'search') t = gen('smugglerLesson');
      else if (r.showdown && rnd() < 0.4) {
        r.showdown = false; // saved in the run (D-bridge-01), as the scene does
        t = gen('showdown');
      } else t = bench.shift();
      if (!t) return;
      r.stats.travelers++;
      cur = { t, phase: 'walkIn', timer: 0, think: sk.think * (0.6 + 0.8 * rnd()), h: { round: 0, counter: 0, offended: false }, searched: false, goonT: 0, next: null, lastTier: 99 };
    }
    function leave(): void {
      if (!cur) return;
      cur.phase = 'leave';
      cur.timer = 0;
    }
    function heroSlipped(): void {
      if (!cur?.t.hero) return;
      r.stats.slipped++;
      if (cur.t.showdown) {
        r.whisper = 3;
        return;
      }
      r.whisper = Math.min(5, r.whisper + 1);
      if (r.whisper >= 5 && !r.showdown) {
        r.showdown = true;
        r.whisper = 0;
      }
    }
    function collect(mult: number, bribed = false): void {
      const c = cur!;
      if (!bribed) {
        if (mult >= M.STREAK_MIN - 1e-6) r.streak = Math.min(10, r.streak + 1);
        r.stats.bestStreak = Math.max(r.stats.bestStreak, r.streak);
        if (mult <= 1 + 1e-6) ses.glower = Math.min(M.GLOWER_MAX, ses.glower + M.GLOWER_FAIR_REFUND);
      }
      earnActive(c.t.claimFare * mult * M.fareMult(r, skulls()) * (bribed ? 1 : M.streakMult(r.streak) * (songT > 0 ? M.SONG_MULT : 1)));
      r.stats.tolls++;
      if (c.t.kind === 'bard') songT = M.SONG_S;
      counters.decided++;
      if (!c.t.hero && !c.t.smuggler) counters.correct++;
      liarPassed(bribed);
      leave();
    }
    /** Asks price tier k (Glower spent up front, as in the scene). */
    function demand(k: number): void {
      const c = cur!;
      const tier = M.PRICE_TIERS[k];
      ses.glower = Math.max(0, ses.glower - tier.glower);
      const rep = M.reply(c.t, c.h, r, tier.mult);
      c.h.round++;
      c.lastTier = k;
      if (rep.kind === 'pay') collect(tier.mult);
      else if (rep.kind === 'counter') {
        c.h.counter = rep.mult;
        c.h.pips = rep.pips;
        c.phase = 'counter';
        c.timer = 0;
        c.think = 0.4 + 0.4 * rnd();
      } else if (rep.kind === 'refuse') {
        c.h.pips = rep.pips;
        c.timer = 0;
        c.think = 0.5 + 0.5 * rnd();
      } else if (rep.kind === 'leave') {
        r.streak = 0;
        leave();
      } else {
        r.streak = 0;
        r.stats.bonks++;
        napT = M.napSeconds(r.lv.skull);
        leave();
      }
    }
    function unmask(): void {
      const c = cur!;
      if (c.t.hero) {
        const ev = M.evidence(c.t);
        const mult = c.t.showdown ? 10 : M.bountyMult(ev);
        earnActive(c.t.kindFare * M.unmaskPay(mult, save.imports?.captives ?? 0) * M.fareMult(r, skulls()), 'bountyTp');
        counters.decided++;
        counters.correct++;
        counters.liars++;
        counters.caught++;
        M.codexNote(p, c.t);
        r.stats.unmasks++;
        p.bountiesLife++;
        if (ev >= 2) {
          r.stats.evUnmasks++;
          const k = String(r.menace);
          r.ev[k] = (r.ev[k] ?? 0) + 1;
          const held = M.heldMenace(r.ev);
          if (held >= 0) env.raiseSkill(held);
        }
        if (mult >= 10) r.stats.bounty10++;
        r.whisper = Math.max(0, r.whisper - 1);
        c.phase = 'reveal';
        c.timer = 0;
      } else {
        counters.decided++;
        falseAcc();
        leave();
      }
    }
    function falseAcc(): void {
      r.streak = 0;
      r.stats.falseAcc++;
      counters.falseAcc++;
      mistake();
      if (M.falseAccusation(falseStamps, clock)) wordT = M.WORD_S;
    }
    function finishSearch(): void {
      const c = cur!;
      if (c.t.smuggler) {
        earnActive(c.t.kindFare * M.SEIZE_MULT * M.fareMult(r, skulls()), 'seizeTp');
        counters.decided++;
        counters.correct++;
        counters.liars++;
        counters.caught++;
        M.codexNote(p, c.t);
        r.stats.confisc++;
        c.phase = 'reveal';
        c.timer = 0.3;
      } else {
        c.h.offended = true;
        c.h.pips = Math.max(1, M.pipsLeft(c.t, { ...c.h, offended: false }) - 1);
        falseAcc();
        c.phase = 'wait';
        c.timer = 0;
        c.think = 0.5 + 0.5 * rnd();
      }
    }
    function goonPass(t: M.Traveler, atGate: boolean): void {
      const amount = M.goonToll(r, t, skulls());
      if (amount > 0) env.earn(amount);
      if (atGate) {
        if (t.hero) r.stats.slipped++;
        leave();
      }
    }
    /** The bot's order once it has sized the traveler up. */
    function decide(): void {
      const c = cur!;
      if (c.phase === 'counter') {
        collect(c.h.counter);
        return;
      }
      const read = readTraveler(c.t, r.menace, poster, sk, rnd);
      if (c.h.round === 0 && !c.h.offended && read.hero >= sk.unmaskAt) {
        c.next = 'unmask';
        c.phase = 'hold';
        c.timer = 0;
        return;
      }
      if (!c.searched && read.smuggle && read.hero === 0) {
        c.next = 'search';
        c.phase = 'hold';
        c.timer = 0;
        return;
      }
      if (c.t.bribe > 0 && !c.searched && c.h.round === 0) {
        r.stats.bribes = (r.stats.bribes ?? 0) + 1;
        collect(c.t.bribe, true);
        return;
      }
      // After a FURIOUS refusal, step down below the refused tier.
      const cap = c.h.round > 0 ? c.lastTier : 99;
      demand(tierFor(c.t, r, c.h.offended, read.hero > 0 || c.t.who === 'adventurer', sk, rnd, ses.glower, cap));
    }

    function stepH(h: number): void {
      ses.at = env.now();
      if (ses.glower < M.GLOWER_MAX) ses.glower = Math.min(M.GLOWER_MAX, ses.glower + h / M.GLOWER_REGEN_S);
      if (napT > 0) napT = Math.max(0, napT - h * (1 + (passive() ? 0 : sk.taps)));
      clock += h;
      if (wordT > 0) wordT = Math.max(0, wordT - h);
      if (songT > 0) songT = Math.max(0, songT - h);
      arriveT += h;
      const every = M.ARRIVE_S / (wordT > 0 ? M.WORD_TRAFFIC : 1);
      if (arriveT >= every) {
        arriveT -= every;
        const t = gen();
        if (bench.length < M.benchCap(r.lv.bench)) bench.push(t);
        else goonPass(t, false);
      }
      if (!cur) {
        pullNext();
        return;
      }
      const c = cur;
      c.timer += h;
      switch (c.phase) {
        case 'walkIn':
          if (c.timer >= WALK_S) {
            c.phase = 'wait';
            c.timer = 0;
          }
          break;
        case 'leave':
          if (c.timer >= WALK_S) cur = null;
          break;
        case 'search':
          if (c.timer >= SEARCH_S) finishSearch();
          break;
        case 'reveal':
          if (c.timer >= REVEAL_S) leave();
          break;
        case 'hold':
          if (c.timer >= HOLD_S) {
            if (c.next === 'unmask') unmask();
            else {
              c.searched = true;
              c.phase = 'search';
              c.timer = 0;
            }
          }
          break;
        case 'wait':
        case 'counter':
          // Goons take the gate while Grumm naps (or always, with no orders: passive).
          if (napT > 0 || passive()) {
            c.goonT += h;
            if (c.goonT > GOON_GATE_S) goonPass(c.t, true);
          } else {
            c.goonT = 0;
            if (c.timer >= c.think) decide();
          }
          break;
      }
    }

    for (let i = 0; i < M.benchCap(r.lv.bench); i++) bench.push(gen());
    pullNext();

    return {
      step(dt) {
        counters.liveS += dt;
        let left = dt;
        while (left > 1e-9) {
          const h = Math.min(H_STEP, left);
          stepH(h);
          left -= h;
        }
      },
      buy(goals: BotGoals) {
        const bought: string[] = [];
        for (let guard = 0; guard < 200; guard++) {
          const entries = shop(save).filter((e) => e.level() < e.max && !e.locked?.());
          const menace = entries.find((e) => e.id === 'menace');
          const dialNeeded = !!menace && r.menaceMax < Math.min(goals.dialGoal, M.MENACE_MAX);
          const v0 = value(r, sk);
          let best: { e: UpgradeEntry; cost: number; ratio: number; gain: number } | null = null;
          for (const e of entries) {
            if (dialNeeded && e.id === 'menace') continue;
            const cost = e.cost();
            const q: M.BridgeRun = { ...r, lv: { ...r.lv } };
            if (e.id === 'menace') {
              q.menaceMax++;
              q.menace = q.menaceMax;
            } else q.lv[e.id as keyof M.Levels]++;
            const gain = value(q, sk) - v0;
            if (!(gain > 0)) continue;
            const ratio = gain / cost;
            if (!best || ratio > best.ratio) best = { e, cost, ratio, gain };
          }
          // Working toward the skill gate's Menace: buy what pays for itself before the next
          // level would be affordable anyway, else the Menace level, else save.
          const quick = best && best.e.canAfford() && (!dialNeeded || best.cost / best.gain <= Math.max(60, (menace!.cost() - r.bank) / Math.max(1e-9, v0)));
          if (quick) {
            best!.e.buy();
            bought.push(best!.e.id);
            continue;
          }
          if (dialNeeded && menace!.canAfford()) {
            menace!.buy();
            bought.push('menace');
            continue;
          }
          break;
        }
        return bought;
      },
      end() {},
      stats: () => ({ ...counters }),
    };
  }

  return {
    id: 'bridge',
    def: bridgeEcon,
    dialMax: M.MENACE_MAX,
    dialId: 'menace',
    dialCost: (k) => M.menaceCost(k + 1),
    startSession,
    anyAffordable(save) {
      M.normalize(run(save), per(save));
      return shop(save).some((e) => e.level() < e.max && !e.locked?.() && e.canAfford());
    },
    dialLevel: (save) => run(save).menaceMax ?? 0,
    // 06 §3: active ≈ 2.3-3.2x on-screen idle.
    localRatioBands: { all: [2.3, 3.2] },
    ratioScale: (save) => M.charterMult(run(save).lv?.charter ?? 0),
    describe(save) {
      const r = run(save);
      const L = r.lv;
      return `menace ${r.menace}/${r.menaceMax} goons ${L.goons} sign ${L.signage} charter ${L.charter ?? 0} price ${L.pricing} sense ${L.sense} held ${M.heldMenace(r.ev)}`;
    },
  };
};
