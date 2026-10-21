// Goblin Mines adapter. The live wall is the game's own headless Wall (src/depts/mines/wall.ts),
// the same class scene.ts renders: the 5x5 wall, rock kinds and regrowth, goblins hopping between
// rocks, kegs, cave-ins, gas and bedrock, Chain Lightning, Magma Pick, Echo Strike, Heavy
// Knuckles, Gems, Motherlodes, the Doom Drum's judged beat, Frenzy and Encore, and the 50-rock
// skill gate. Every number comes from the real pure module (src/depts/mines/model.ts), and the
// shop is the real upgrade list (src/depts/mines/upgrades.ts buildGroups) driven through a
// minimal headless DeptCtx, so costs, caps and locks match the game.
//
// Reference bot (02 §13, 00 §8.1): 6 taps/s; lights kegs next to >= 3 rocks, breaks Veins and
// Geodes first, then finishes the most-cracked rock; with the drum, one judged tap per beat lands
// in the window 85% of the time (follow-ups are normal taps), and Frenzy fires whenever earned.
import type { DeptCtx, UpgradeEntry } from '../../src/core/dept';
import type { DeptSave } from '../../src/core/types';
import { minesEcon } from '../../src/depts/mines/def';
import * as M from '../../src/depts/mines/model';
import { anyAffordable, buildGroups } from '../../src/depts/mines/upgrades';
import { Wall, type BeatJudge, type Tile } from '../../src/depts/mines/wall';
import { childSeed, makeRng, type Rng } from '../rng';
import type { ActiveSession, AdapterFactory, BotGoals, SessionEnv } from '../types';

export type Skill = 'novice' | 'reference' | 'expert';
/** 02 §13: reference 6 taps/s and 85% on-beat; novice 50%, expert 95%. */
const SKILL: Record<Skill, { taps: number; acc: number }> = {
  novice: { taps: 4, acc: 0.5 },
  reference: { taps: 6, acc: 0.85 },
  expert: { taps: 7.5, acc: 0.95 },
};

export interface MinesOpts {
  skill?: Skill;
  tapsPerSec?: number;
  beatAccuracy?: number;
  /** No taps once a goblin is hired: the crew alone (calibrates idleRate against the live wall). */
  passive?: boolean;
  /** Keep the Doom Drum switched off (the 02 §3 drum-off band). */
  drumOff?: boolean;
}

const H_STEP = 1 / 24;
/** Offline Gems (02 §3 gemRate): the game credits them on entry with the suite offline factor and
 * cap; the sim mirrors that with the base values. */
const OFFLINE_F = 0.6;
const OFFLINE_CAP_S = 8 * 3600;

const run = (s: DeptSave) => s.run as M.MinesRun;
const per = (s: DeptSave) => s.persistent as M.MinesPersistent;

/** A headless DeptCtx with just the money paths buildGroups() uses. */
function headlessCtx(save: DeptSave): DeptCtx {
  const ctx = {
    save,
    spend(amount: number) {
      if (save.run.bank + 1e-9 < amount) return false;
      save.run.bank -= amount;
      return true;
    },
    seen: (k: string) => !!save.seen[k],
    markSeen: (k: string) => void (save.seen[k] = 1),
    say: () => {},
    lesson: () => false,
    saveSoon: () => {},
  };
  return ctx as unknown as DeptCtx;
}

function shop(save: DeptSave): UpgradeEntry[] {
  const hooks = {
    onDig: () => {
      const b = save.lifetime.best;
      b.maxDepth = Math.max(b.maxDepth ?? 1, run(save).maxDepth);
    },
    onDrum: () => {},
  };
  return buildGroups(headlessCtx(save), hooks, { single: true }).flatMap((g) => g.entries);
}

function cloneSave(save: DeptSave): DeptSave {
  return {
    ...save,
    run: { ...run(save), gate: { ...run(save).gate }, stats: { ...run(save).stats } },
    persistent: { ...per(save) },
    lifetime: { ...save.lifetime, best: { ...save.lifetime.best } },
    seen: { ...save.seen },
  } as DeptSave;
}

// ---------- the bot's closed-form income estimate (for ranking buys and picking a depth) ----------

/** Expected tap damage multiplier from the active-only nodes the closed form can see. */
function tapExtras(r: M.MinesRun, p: M.MinesPersistent): number {
  let m = 1;
  // Heavy Knuckles splash, shared by the neighbours (mostly overkill-free chip damage).
  m += M.knucklesSplash(r.knuckles) * 0.8;
  // Magma Pick: 20%/s of the tap for its duration (most of it lands before the rock breaks).
  m += M.MAGMA_DPS * M.magmaDur(p.magma) * 0.4;
  m *= 1 + M.echoChance(p.echo);
  return m;
}

function estimateAt(r: M.MinesRun, p: M.MinesPersistent, depth: number, taps: number, drum: boolean): number {
  const rr = { ...r, depth };
  const f = M.avgFactors(depth, r.prospectors);
  const hp = M.H(depth) * f.hp;
  let tap = taps * M.tapExpected(rr) * tapExtras(r, p);
  if (drum) {
    const beats = 1 / M.beatPeriod(depth);
    tap *= 1 + ((0.85 * beats) / taps) * (M.beatMult(rr.drumhead) * 1.2 - 1);
  }
  // The crew as the game's idleRate counts it, plus taps (at most one rock per tap), under the
  // regrowth ceiling.
  const crew = M.crewRocksPerSec(rr, p);
  const tapRocks = Math.min(taps, (tap * 0.95) / hp);
  const rocks = Math.min(crew + tapRocks, M.TILES / M.regrowTime(rr.regrow));
  return rocks * M.R(depth) * f.reward * M.oreMult(r);
}

function bestDepth(r: M.MinesRun, p: M.MinesPersistent, taps: number, drum: boolean): number {
  let best = 1;
  let bv = -1;
  for (let d = Math.max(1, r.maxDepth - 12); d <= r.maxDepth; d++) {
    const v = estimateAt(r, p, d, taps, drum);
    if (v > bv * 1.0001) {
      bv = v;
      best = d;
    }
  }
  return best;
}

/** Gem nodes the bot buys, cheapest first (the Tempo Lever only unlocks a choice). */
const GEM_BUYS = new Set(['chain', 'powder', 'lucky', 'magma', 'echo', 'thunder']);

export const createMines = (opts: MinesOpts = {}): AdapterFactory => (seed) => {
  const sk = SKILL[opts.skill ?? 'reference'];
  const taps = opts.tapsPerSec ?? sk.taps;
  const acc = opts.beatAccuracy ?? sk.acc;
  let sessions = 0;
  const counters = { liveS: 0 };

  const drumActive = (p: M.MinesPersistent) => p.drum && p.drumOn && !opts.drumOff;
  const value = (s: DeptSave) => {
    const r = run(s);
    const p = per(s);
    const tp = opts.passive ? 0 : taps;
    return estimateAt(r, p, bestDepth(r, p, tp, drumActive(p)), tp, drumActive(p));
  };

  function startSession(save: DeptSave, env: SessionEnv): ActiveSession {
    const r = run(save);
    const p = per(save);
    M.normalize(r, p);
    if (opts.drumOff) p.drumOn = false;
    const rnd: Rng = makeRng(childSeed(seed, `mines.${sessions++}`));
    // Offline Gems since the last visit (the game does this on entry, scene.ts creditOfflineGems).
    if (p.gemAt > 0) {
      const away = Math.min(OFFLINE_CAP_S, Math.max(0, (env.now() - p.gemAt) / 1000));
      const g = p.gemFrac + M.offlineGems(r, p, save.imports?.bones ?? 0, OFFLINE_F, away);
      const whole = Math.floor(g);
      p.gems += whole;
      p.gemsEver += whole;
      p.gemFrac = g - whole;
    }
    const wall = new Wall(save, { earn: (b) => env.earn(b), raiseSkill: (l) => env.raiseSkill(l), rnd });
    let tapAcc = 0;
    let gateMode = false;
    const tiles = wall.tiles;

    function neighbours(t: Tile): number {
      let n = 0;
      for (const o of wall.around(t, false)) if (wall.mineable(o)) n++;
      return n;
    }
    function pickTap(): Tile | null {
      let keg: Tile | null = null;
      let shiny: Tile | null = null;
      let low: Tile | null = null;
      for (const t of tiles) {
        if (t.kind === 'keg') {
          if (t.fuse < 0 && neighbours(t) >= 3) keg = t;
        } else if (t.kind === 'vein' || t.kind === 'geode' || t.kind === 'mother') {
          if (!shiny || t.hp < shiny.hp) shiny = t;
        } else if (t.kind !== null && t.kind !== 'bedrock') {
          if (!low || t.hp / t.maxHp < low.hp / low.maxHp) low = t;
        }
      }
      return keg ?? shiny ?? low;
    }
    function tap(): void {
      const t = pickTap();
      let beat: BeatJudge | null = null;
      if (drumActive(p)) {
        const k = Math.round((wall.clock - p.latency) / wall.period);
        // The bot aims its first tap of each beat at the boom and lands it acc of the time.
        beat = { k, inWindow: k !== wall.lastJudged && rnd() < acc };
      }
      if (!t) {
        r.stats.taps++;
        return;
      }
      wall.tap(t.i, beat);
    }

    function stepH(h: number): void {
      wall.step(h);
      // Passive probe: tap only until the first goblin is hired, then leave the crew alone.
      tapAcc += opts.passive && M.goblins(r) > 0 ? 0 : taps * h;
      while (tapAcc >= 1) {
        tapAcc -= 1;
        tap();
      }
    }

    function chooseDepth(goals: BotGoals): void {
      // Skill gate: once the dial reaches the goal, mine 50 rocks there (on screen), then go
      // back to the most profitable depth.
      const goal = Math.min(goals.dialGoal, r.maxDepth);
      gateMode = goal >= goals.dialGoal && save.cycle.heldLevel < goals.dialGoal && (r.gate[String(goal)] ?? 0) < M.GATE_ROCKS;
      r.depth = gateMode ? goal : bestDepth(r, p, opts.passive ? 0 : taps, drumActive(p));
    }

    return {
      step(dt) {
        counters.liveS += dt;
        let left = dt;
        while (left > 1e-9) {
          const h = Math.min(H_STEP, left);
          stepH(h);
          left -= h;
        }
        p.gemAt = env.now();
      },
      buy(goals) {
        const bought: string[] = [];
        // Gems first (persistent): the drum, then the cheapest engineering node.
        for (let guard = 0; guard < 40; guard++) {
          const gemNodes = shop(save).filter((e) => e.currency === 'Gems' && e.level() < e.max && !e.locked?.() && (!e.visible || e.visible()));
          const drum = gemNodes.find((e) => e.id === 'drum');
          const pick = drum ?? gemNodes.filter((e) => GEM_BUYS.has(e.id)).sort((a, b) => a.cost() - b.cost())[0];
          if (!pick || !pick.canAfford()) break;
          pick.buy();
          bought.push(pick.id);
          if (opts.drumOff) p.drumOn = false;
        }
        for (let guard = 0; guard < 300; guard++) {
          const entries = shop(save).filter(
            (e) => !e.header && e.currency !== 'Gems' && e.level() < e.max && !e.locked?.() && (!e.visible || e.visible()),
          );
          const dig = entries.find((e) => e.id === 'dig');
          const dialNeeded = r.maxDepth < goals.dialGoal;
          if (dialNeeded && dig && dig.canAfford()) {
            dig.buy();
            bought.push('dig');
            continue;
          }
          const v0 = value(save);
          let best: { e: UpgradeEntry; cost: number; ratio: number; gain: number } | null = null;
          for (const e of entries) {
            const cost = e.cost();
            const c = cloneSave(save);
            const ce = shop(c).find((x) => x.id === e.id);
            if (!ce) continue;
            c.run.bank = cost + 1;
            ce.buy();
            const gain = value(c) - v0;
            if (!(gain > 0)) continue;
            const ratio = gain / cost;
            if (!best || ratio > best.ratio) best = { e, cost, ratio, gain };
          }
          if (!best || !best.e.canAfford()) break;
          // Saving for the dial: only buy what pays for itself before the dial is affordable anyway.
          if (dialNeeded && dig && best.cost / best.gain > Math.max(60, (dig.cost() - r.bank) / v0)) break;
          best.e.buy();
          bought.push(best.e.id);
        }
        chooseDepth(goals);
        return bought;
      },
      end() {
        p.gemAt = env.now();
      },
      stats: () => ({ ...counters }),
    };
  }

  return {
    id: 'mines',
    def: minesEcon,
    dialMax: M.MAX_DEPTH,
    dialId: 'dig',
    // Dial level k = max depth k; opening depth k+1 costs digCost(k).
    dialCost: (k) => M.digCost(k),
    startSession,
    anyAffordable(save) {
      M.normalize(run(save), per(save));
      return anyAffordable(buildGroups(headlessCtx(save), { onDig() {}, onDrum() {} }, { single: true }));
    },
    dialLevel: (save) => run(save).maxDepth ?? 1,
    ratioState: (save) => (drumActive(per(save)) ? 'drum' : 'no-drum'),
    // 02 §3: before the drum 1.8-2.5x on-screen idle; with the drum (85% on-beat) 2.4-3.0x.
    localRatioBands: { 'no-drum': [1.8, 2.5], drum: [2.4, 3.0] },
    ratioScale: (save) => M.oreMult(run(save)),
    describe(save) {
      const r = run(save);
      return `depth ${r.depth}/${r.maxDepth} gob ${M.goblins(r)} tier ${r.tier} picks ${r.picks} seams ${r.seams ?? 0} tap ${r.tap} kn ${r.knuckles} drum ${per(save).drum ? 'Y' : 'n'} gems ${Math.floor(per(save).gems)} ch ${per(save).chain} pw ${per(save).powder} mg ${per(save).magma} ec ${per(save).echo} th ${per(save).thunder} lk ${per(save).lucky}`;
    },
  };
};
