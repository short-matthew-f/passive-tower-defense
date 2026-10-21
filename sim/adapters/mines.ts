// Goblin Mines adapter. The Mines' live wall loop lives in scene.ts (tangled with Pixi), so this
// file ports that loop headless: the 5x5 wall, rock kinds and regrowth, goblins hopping between
// rocks, kegs (tap-lit and auto), cave-in rubble, Chain Lightning, Gems, the Doom Drum's judged
// beat and Frenzy, and the 50-rocks skill gate. Every number comes from the real pure module
// (src/depts/mines/model.ts), and the shop is the real upgrade list (src/depts/mines/upgrades.ts
// buildGroups) driven through a minimal headless DeptCtx, so costs, caps and locks match the game.
//
// Reference bot (02 §13, 00 §8.1): 6 taps/s; lights kegs next to >= 3 rocks, breaks Veins and
// Geodes first, then finishes the most-cracked rock; with the drum, one judged tap per beat lands
// in the window 85% of the time (follow-ups are normal taps), and Frenzy fires whenever earned.
import type { DeptCtx, UpgradeEntry } from '../../src/core/dept';
import type { DeptSave } from '../../src/core/types';
import { minesEcon } from '../../src/depts/mines/def';
import * as M from '../../src/depts/mines/model';
import { anyAffordable, buildGroups } from '../../src/depts/mines/upgrades';
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

// Scene constants (src/depts/mines/scene.ts).
const KEG_FUSE = 1.2;
const KEG_AUTO = 8;
const SAPPER_PLANT = 20;
const BEAT_LATENCY = 0.04;
const T = 32; // tile size in px, for goblin hop distances
const H_STEP = 1 / 24;

type Kind = M.RockKind | null;
interface Tile {
  i: number;
  col: number;
  row: number;
  kind: Kind;
  hp: number;
  maxHp: number;
  regrow: number;
  fuse: number;
  kegAge: number;
}
interface Gob {
  sapper: boolean;
  tile: number;
  x: number;
  y: number;
  hop: number; // seconds left in a hop
  plant: number;
}

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
  return buildGroups(headlessCtx(save), hooks).flatMap((g) => g.entries);
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

function estimateAt(r: M.MinesRun, p: M.MinesPersistent, depth: number, taps: number, drum: boolean): number {
  const rr = { ...r, depth };
  const hp = M.H(depth) * M.AVG_HP_F;
  let tap = taps * M.tapExpected(rr);
  if (drum) {
    const beats = 1 / M.beatPeriod(depth);
    tap *= 1 + ((0.85 * beats) / taps) * (M.beatMult(rr.drumhead) * 1.2 - 1);
  }
  // The crew as the game's idleRate counts it, plus taps (at most one rock per tap), under the
  // regrowth ceiling.
  const crew = M.crewRocksPerSec(rr, p);
  const tapRocks = Math.min(taps, (tap * 0.95) / hp);
  const rocks = Math.min(crew + tapRocks, M.TILES / M.regrowTime(rr.regrow));
  return rocks * M.R(depth) * M.AVG_REWARD_F;
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
    const tiles: Tile[] = [];
    for (let i = 0; i < M.TILES; i++)
      tiles.push({ i, col: i % M.GRID, row: Math.floor(i / M.GRID), kind: null, hp: 0, maxHp: 0, regrow: 0, fuse: -1, kegAge: 0 });
    const gobs: Gob[] = [];
    let wallDepth = r.depth;
    let tapAcc = 0;
    let clock = 0; // beat clock
    let lastJudged = -1;
    let streak = 0;
    let pips = 0;
    let pipDecay = 0;
    let frenzyT = 0;
    let gateMode = false;

    const mineable = (t: Tile) => t.kind !== null && t.kind !== 'keg';

    function spawnRock(t: Tile, initial = false): void {
      const x = rnd();
      const kp = initial ? 0 : M.kegP(p.powder);
      let kind: M.RockKind = 'common';
      if (x < kp) kind = 'keg';
      else if (x < kp + M.GEODE_P) kind = 'geode';
      else if (x < kp + M.GEODE_P + M.VEIN_P) kind = 'vein';
      t.kind = kind;
      t.maxHp = kind === 'keg' ? 1 : M.H(r.depth) * M.KIND_HP[kind];
      t.hp = t.maxHp;
      t.fuse = -1;
      t.kegAge = 0;
    }
    function rebuildWall(first: boolean): void {
      for (const t of tiles) {
        if (first) spawnRock(t, true);
        else {
          t.kind = null;
          t.regrow = 0.05 + rnd() * 0.35;
        }
      }
      for (const g of gobs) g.tile = -1;
      wallDepth = r.depth;
    }
    function syncGoblins(): void {
      const want = M.goblins(r);
      while (gobs.length < want) {
        const sapper = gobs.length >= r.grunts;
        gobs.push({ sapper, tile: -1, x: rnd() * M.GRID * T, y: M.GRID * T, hop: 0, plant: SAPPER_PLANT * rnd() });
      }
      gobs.length = want;
      gobs.forEach((g, i) => (g.sapper = i >= r.grunts));
    }
    rebuildWall(true);
    syncGoblins();

    function breakRock(t: Tile, by: 'tap' | 'gob' | 'blast' | 'zap'): void {
      const kind = t.kind;
      if (kind === null) return;
      t.kind = null;
      t.regrow = M.regrowTime(r.regrow);
      for (const g of gobs) if (g.tile === t.i) g.tile = -1;
      if (kind === 'rubble') return;
      let reward = M.R(r.depth) * M.KIND_REWARD[kind];
      if (by === 'tap' && (kind === 'vein' || kind === 'geode')) reward *= 1 + 0.1 * r.keen;
      env.earn(reward);
      r.stats.rocks++;
      if (kind === 'vein') r.stats.veins++;
      let gems = 0;
      if (kind === 'geode') {
        gems++;
        r.stats.geodes++;
      }
      if (p.lucky > 0 && rnd() < 0.001 * p.lucky) gems++;
      p.gems += gems;
      p.gemsEver += gems;
      const key = String(r.depth);
      const n = (r.gate[key] = (r.gate[key] ?? 0) + 1);
      if (n >= M.GATE_ROCKS) env.raiseSkill(r.depth);
      if (rnd() < M.caveInChance(r)) {
        const cands = tiles.filter((o) => o.kind !== 'keg');
        const k = 3 + Math.floor(rnd() * 3);
        for (let j = 0; j < k && cands.length; j++) {
          const o = cands.splice(Math.floor(rnd() * cands.length), 1)[0];
          o.kind = 'rubble';
          o.maxHp = 1;
          o.hp = 1;
          for (const g of gobs) if (g.tile === o.i) g.tile = -1;
        }
      }
    }
    function damage(t: Tile, amount: number, by: 'tap' | 'gob' | 'blast' | 'zap'): void {
      if (!mineable(t) || amount <= 0) return;
      t.hp -= amount;
      if (t.hp <= 0) breakRock(t, by);
    }
    function explode(t: Tile, auto: boolean): void {
      t.kind = null;
      t.regrow = M.regrowTime(r.regrow);
      t.fuse = -1;
      r.stats.kegs++;
      const dmg = M.fistDamage(r) * M.blastMult(p.powder) * (auto ? 0.5 : 1);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const c = t.col + dx;
          const w = t.row + dy;
          if (c < 0 || w < 0 || c >= M.GRID || w >= M.GRID) continue;
          const o = tiles[w * M.GRID + c];
          if (o === t) continue;
          if (o.kind === 'keg') {
            if (o.fuse < 0 || o.fuse > 0.15) o.fuse = 0.15;
          } else if (o.kind === 'rubble') breakRock(o, 'blast');
          else damage(o, dmg, 'blast');
        }
    }
    function chain(from: Tile, dmg: number): void {
      const hit = new Set([from.i]);
      let cur = from;
      for (let j = 0; j < M.chainJumps(p.chain); j++) {
        let best: Tile | null = null;
        let bd = Infinity;
        for (const t of tiles) {
          if (hit.has(t.i) || !mineable(t)) continue;
          const d = Math.abs(t.col - cur.col) + Math.abs(t.row - cur.row) + rnd() * 0.5;
          if (d < bd) {
            bd = d;
            best = t;
          }
        }
        if (!best) break;
        hit.add(best.i);
        damage(best, dmg, 'zap');
        cur = best;
      }
      if (hit.size > 1) r.stats.lightning++;
    }
    function neighbours(t: Tile): number {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const c = t.col + dx;
          const w = t.row + dy;
          if ((dx || dy) && c >= 0 && w >= 0 && c < M.GRID && w < M.GRID && mineable(tiles[w * M.GRID + c])) n++;
        }
      return n;
    }
    function pickTap(): Tile | null {
      let keg: Tile | null = null;
      let shiny: Tile | null = null;
      let low: Tile | null = null;
      for (const t of tiles) {
        if (t.kind === 'keg') {
          if (t.fuse < 0 && neighbours(t) >= 3) keg = t;
        } else if (t.kind === 'vein' || t.kind === 'geode') {
          if (!shiny || t.hp < shiny.hp) shiny = t;
        } else if (t.kind !== null) {
          if (!low || t.hp / t.maxHp < low.hp / low.maxHp) low = t;
        }
      }
      return keg ?? shiny ?? low;
    }
    function tap(): void {
      r.stats.taps++;
      let beatHit = false;
      if (drumActive(p)) {
        const per_ = M.beatPeriod(r.depth);
        const tb = clock - BEAT_LATENCY;
        const k = Math.round(tb / per_);
        if (k !== lastJudged) {
          lastJudged = k;
          // The bot aims its first tap of each beat at the boom and lands it acc of the time.
          if (rnd() < acc) beatHit = true;
          else streak = 0;
        }
      }
      const t = pickTap();
      if (!t) return;
      if (t.kind === 'keg') {
        if (t.fuse < 0) t.fuse = KEG_FUSE;
        return;
      }
      if (t.kind === 'rubble') {
        breakRock(t, 'tap');
        return;
      }
      let dmg = M.fistDamage(r);
      if (rnd() < M.critChance(r.critC)) {
        dmg *= M.critMult(r.critP);
        r.stats.crits++;
      }
      if (beatHit) {
        streak++;
        r.stats.beatHits++;
        r.stats.bestStreak = Math.max(r.stats.bestStreak, streak);
        dmg *= M.beatMult(r.drumhead) * M.streakBonus(streak);
        pipDecay = 0;
        if (r.frenzy > 0) {
          if (frenzyT > 0) frenzyT = Math.min(M.frenzyCap(r.fuse), frenzyT + 0.25);
          else if (++pips >= M.frenzyPips(r.frenzy)) {
            pips = 0;
            frenzyT = M.frenzyBase(r.fuse);
            r.stats.frenzies++;
          }
        }
      }
      if (frenzyT > 0) dmg *= M.frenzyTapMult(r.frenzy);
      const chance = M.chainChance(p.chain) * (beatHit ? 2 : 1);
      if (chance > 0 && rnd() < chance) chain(t, dmg * 0.5);
      damage(t, dmg, 'tap');
    }
    function pickTarget(g: Gob): number {
      let best = -1;
      let bs = Infinity;
      for (const t of tiles) {
        if (!mineable(t)) continue;
        let crowd = 0;
        for (const o of gobs) if (o !== g && o.tile === t.i) crowd++;
        const s = Math.hypot(t.col * T + T / 2 - g.x, t.row * T + T - g.y) + crowd * 60;
        if (s < bs) {
          bs = s;
          best = t.i;
        }
      }
      return best;
    }

    function stepH(h: number): void {
      clock += h;
      if (r.depth !== wallDepth) rebuildWall(false);
      syncGoblins();
      // Frenzy timer and pip decay.
      if (frenzyT > 0) frenzyT = Math.max(0, frenzyT - h);
      else if (pips > 0 && (pipDecay += h) >= 3) {
        pipDecay = 0;
        pips--;
      }
      for (const t of tiles) {
        if (t.kind === null) {
          t.regrow -= h;
          if (t.regrow <= 0) spawnRock(t);
        } else if (t.kind === 'keg') {
          if (t.fuse >= 0) {
            t.fuse -= h;
            if (t.fuse <= 0) explode(t, false);
          } else if ((t.kegAge += h) >= KEG_AUTO) explode(t, true);
        }
      }
      const fm = frenzyT > 0 ? M.FRENZY_GOBLIN_MULT : 1;
      for (const g of gobs) {
        if (g.hop > 0) {
          g.hop -= h;
          continue;
        }
        const t = g.tile >= 0 ? tiles[g.tile] : null;
        if (!t || !mineable(t)) {
          g.tile = pickTarget(g);
          if (g.tile >= 0) {
            const nt = tiles[g.tile];
            const tx = nt.col * T + T / 2;
            const ty = nt.row * T + T;
            g.hop = Math.min(0.5, 0.18 + Math.hypot(tx - g.x, ty - g.y) / 400);
            g.x = tx;
            g.y = ty;
          }
          continue;
        }
        damage(t, M.goblinDps(g.sapper ? M.SAPPER_DPS : M.GRUNT_DPS, r, p) * fm * h, 'gob');
        if (g.sapper) {
          g.plant -= h;
          if (g.plant <= 0) {
            g.plant = SAPPER_PLANT;
            const commons = tiles.filter((o) => o.kind === 'common');
            const o = commons[Math.floor(rnd() * commons.length)];
            if (o) {
              o.kind = 'keg';
              o.maxHp = 1;
              o.hp = 1;
              o.fuse = -1;
              o.kegAge = 0;
            }
          }
        }
      }
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
      },
      buy(goals) {
        const bought: string[] = [];
        // Gems first (persistent): the drum, then the cheapest engineering node.
        for (let guard = 0; guard < 40; guard++) {
          const gemNodes = shop(save).filter((e) => e.currency === 'Gems' && e.level() < e.max && !e.locked?.());
          const drum = gemNodes.find((e) => e.id === 'drum');
          const pick = drum ?? gemNodes.sort((a, b) => a.cost() - b.cost())[0];
          if (!pick || !pick.canAfford()) break;
          pick.buy();
          bought.push(pick.id);
          if (opts.drumOff) p.drumOn = false;
        }
        for (let guard = 0; guard < 300; guard++) {
          const entries = shop(save).filter(
            (e) => e.currency !== 'Gems' && e.level() < e.max && !e.locked?.() && (!e.visible || e.visible()),
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
      end() {},
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
      return anyAffordable(buildGroups(headlessCtx(save), { onDig() {}, onDrum() {} }));
    },
    dialLevel: (save) => run(save).maxDepth ?? 1,
    ratioState: (save) => (drumActive(per(save)) ? 'drum' : 'no-drum'),
    // 02 §3: before the drum 1.8-2.5x on-screen idle; with the drum (85% on-beat) 2.4-3.0x.
    localRatioBands: { 'no-drum': [1.8, 2.5], drum: [2.4, 3.0] },
    describe(save) {
      const r = run(save);
      return `depth ${r.depth}/${r.maxDepth} gob ${M.goblins(r)} tier ${r.tier} picks ${r.picks} tap ${r.tap} drum ${per(save).drum ? 'Y' : 'n'}`;
    },
  };
};
