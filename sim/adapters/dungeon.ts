// Dungeon adapter. The Dungeon ships a deterministic 20 Hz path sim (src/depts/dungeon/sim.ts):
// the scene runs it live and idleRate runs it headless (Cautious Mode). This adapter runs that same
// Sim on screen and ports the scene's thin layer around it (scene.ts is tangled with Pixi): coins
// and the greedy grab (+10%), steals from the bank (2% cap) and recovered sacks (+25%), Glare,
// the Trapdoor, the Gong, Champion kills feeding the leak-gated skill gate, Lure management, the
// blueprint snapshot and the post-Fall starter kit (10% of last cycle's layout value).
// Placement, upgrade, branch and chest prices are model.ts's; the Workshop and the Rumor Mill go
// through the real upgrade list (src/depts/dungeon/upgrades.ts buildGroups) on a headless DeptCtx.
//
// Bot (00 §8.1 "Dungeon" row, adapted to the shipped MVP's fixed floor):
//  - Builder: greedy by Δ(defense)/cost over every placement (the best free tile per kind, by
//    path coverage on the current route), every piece upgrade and L5 branch, the Workshop, the
//    Bait Chests and Rune Slots. "Defense" is the expected damage a party member takes walking
//    the route (tower dps x seconds in range, minion holds, rune triggers), from model.ts's
//    numbers and map.ts's routes. Cheap enough to rank ~80 candidates per shop.
//  - Lure: bought when the real sim says the layout holds the next tier (< 20% leaks; a 1-seed,
//    8-party probe of the same Sim). While the next Lure holds, the bot saves for it and only buys
//    pieces under 15% of its price; while it doesn't, it builds defense.
//  - Verbs: Glare (thieves first, then Champions, then whoever is closest to the Hoard), Trapdoor
//    under a hero in the last quarter of the route, Gong when the door is clear and the last
//    party didn't leak, all after a reaction delay. Coins are grabbed with a skill-dependent
//    chance (the rest auto-collect at 1x).
//  - Shopping cadence: every few on-screen seconds (a TD player places in bursts), plus on entry.
import type { DeptCtx, UpgradeEntry } from '../../src/core/dept';
import { LONG_EFFECT } from '../../src/core/longnode';
import type { DeptSave } from '../../src/core/types';
import { dungeonEcon } from '../../src/depts/dungeon/def';
import { COLS, lairPost, isRuneTile, ROUTES, ROWS, STARTER_SLITS, tileKind } from '../../src/depts/dungeon/map';
import * as M from '../../src/depts/dungeon/model';
import { dungeonImports, idleRateOf, Sim, STEP, type SimHero } from '../../src/depts/dungeon/sim';
import { buildGroups } from '../../src/depts/dungeon/upgrades';
import { childSeed, makeRng } from '../rng';
import type { ActiveSession, AdapterFactory, BotGoals, SessionEnv } from '../types';

export type Skill = 'novice' | 'reference' | 'expert';

/** reaction: seconds before a verb fires once its condition holds (spec: 300 ms reference);
 * grab: share of coins tapped for +10%; gongClear: max forward heroes on the field to ring;
 * shopEvery: on-screen seconds between shopping passes. */
const SKILL: Record<Skill, { reaction: number; grab: number; gongClear: number; shopEvery: number; trap: boolean }> = {
  novice: { reaction: 1.0, grab: 0.3, gongClear: 0, shopEvery: 15, trap: false },
  reference: { reaction: 0.3, grab: 0.6, gongClear: 2, shopEvery: 6, trap: true },
  expert: { reaction: 0.15, grab: 0.85, gongClear: 3, shopEvery: 4, trap: true },
};

export interface DungeonOpts {
  skill?: Skill;
  /** No verbs, no coin grabs: the live floor with no input (calibrates idleRate). */
  passive?: boolean;
}

const run = (s: DeptSave) => s.run as M.DungeonRun;
const per = (s: DeptSave) => s.persistent as M.DungeonPersistent;

/** A headless DeptCtx with just the money paths buildGroups() uses. */
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
  } as unknown as DeptCtx;
}

// ---------- geometry: path coverage per tile (map.ts routes) ----------

const SAMPLE = 0.1;
const routePts: Float64Array[] = ROUTES.map((r) => {
  const n = Math.floor(r.len / SAMPLE);
  const out = new Float64Array(2 * n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = i * SAMPLE;
    while (s < r.n - 2 && r.cum[s + 1] < d) s++;
    const seg = r.cum[s + 1] - r.cum[s];
    const f = seg > 0 ? (d - r.cum[s]) / seg : 0;
    out[2 * i] = r.xs[s] + (r.xs[s + 1] - r.xs[s]) * f;
    out[2 * i + 1] = r.ys[s] + (r.ys[s + 1] - r.ys[s]) * f;
  }
  return out;
});
const covCache = new Map<number, number>();
/** Route length (tiles) within range R of point (px, py) on route `mask` (px, py on the half-tile grid). */
function coverage(px: number, py: number, R: number, mask: number): number {
  const key = ((Math.round(px * 2) * 64 + Math.round(py * 2)) * 4 + mask) * 4096 + Math.round(R * 100);
  let v = covCache.get(key);
  if (v !== undefined) return v;
  const pts = routePts[mask];
  let n = 0;
  const r2 = R * R;
  for (let i = 0; i < pts.length; i += 2) {
    const dx = pts[i] - px;
    const dy = pts[i + 1] - py;
    if (dx * dx + dy * dy <= r2) n++;
  }
  v = n * SAMPLE;
  covCache.set(key, v);
  return v;
}
const onRoute = (px: number, py: number, mask: number) => coverage(px, py, 0.3, mask) > 0;

const TILES: { x: number; y: number; kind: ReturnType<typeof tileKind> }[] = [];
for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) TILES.push({ x, y, kind: tileKind(x, y) });

function validTile(r: M.DungeonRun, k: M.PieceKind, x: number, y: number): boolean {
  if (r.pieces.some((p) => p.x === x && p.y === y)) return false;
  const slot = M.PIECES[k].slot;
  const kind = tileKind(x, y);
  if (slot === 'wall') return kind === 'wall';
  if (slot === 'chamber') return kind === 'chamber' && !!lairPost(x, y);
  return isRuneTile(x, y);
}

// ---------- the builder's defense estimate (expected damage per party member, model.ts numbers) ----------

interface Ctx {
  mask: number;
  T: number;
  armor: number;
  heroAtk: number;
  size: number;
}

function ctxOf(r: M.DungeonRun, T = r.lureMax): Ctx {
  const knights = T >= M.KNIGHT_LURE ? 0.2 : 0;
  return {
    mask: (r.chests[0] ? 1 : 0) | (r.chests[1] ? 2 : 0),
    T,
    armor: M.heroArmor('squire', T) + knights * M.HEROES.knight.armor,
    heroAtk: 3 * M.atkScale(T),
    size: M.partySize(T),
  };
}

interface TowerStat {
  x: number;
  y: number;
  range: number;
  dps: number; // vs the reference armor
}

function towerStat(p: M.PieceSave, ws: M.Workshop, c: Ctx): TowerStat | null {
  const lm = M.levelMult(p.l);
  const tm = M.towerMult(ws);
  const rb = M.rangeBonus(p.l);
  const x = p.x + 0.5;
  const y = p.y + 0.5;
  if (p.k === 'arrow') {
    const dmg = 4 * lm * tm * (p.b === 1 ? 2.2 : 1);
    const bleed = p.b === 2 ? 2 * lm * tm : 0;
    return { x, y, range: 3 + rb, dps: Math.max(1, dmg - c.armor) * 1.2 * (p.b === 1 ? 0.6 : 1) + bleed };
  }
  if (p.k === 'brazier') return { x, y, range: 1.5 + rb + (p.b === 1 ? 0.7 : 0), dps: 3 * lm * tm * (p.b === 2 ? 1.7 : 1) * 1.5 };
  if (p.k === 'ballista') {
    const dmg = 30 * lm * tm * (p.b === 1 ? 2 : 1);
    return { x, y, range: 5 + rb, dps: Math.max(1, dmg - c.armor) * 0.4 * (p.b === 2 ? 1.25 : 1) * (p.b === 2 ? 2.5 : 2) };
  }
  return null;
}

/** Expected damage dealt to one party member on its way to the Hoard. */
function defense(r: M.DungeonRun, c: Ctx, ws: M.Workshop = r.ws): number {
  const SPEED = 0.9;
  const towers: TowerStat[] = [];
  for (const p of r.pieces) {
    const t = towerStat(p, ws, c);
    if (t) towers.push(t);
  }
  const dpsAt = (x: number, y: number) => {
    let s = 0;
    for (const t of towers) if ((t.x - x) ** 2 + (t.y - y) ** 2 <= t.range * t.range) s += t.dps;
    return s;
  };
  let D = 0;
  for (const t of towers) D += (t.dps * coverage(t.x, t.y, t.range, c.mask)) / SPEED;
  const sm = M.summonMult(ws);
  const rm = M.runeMult(ws);
  for (const p of r.pieces) {
    const lm = M.levelMult(p.l);
    if (p.k === 'crypt' || p.k === 'ogre') {
      const post = lairPost(p.x, p.y);
      if (!post || !onRoute(post[0] + 0.5, post[1] + 0.5, c.mask)) continue;
      const ogre = p.k === 'ogre';
      const n = ogre ? 1 : 2 + (p.b === 1 ? 1 : 0);
      const hp = ogre ? 200 * lm * sm * (p.b === 2 ? 1.5 : 1) : 30 * lm * sm * (p.b === 2 ? 2.5 : 1);
      const dps = ogre ? 12 * lm * sm * (p.b === 1 ? 1.7 : 1) : 3 * lm * sm;
      const cap = ogre ? (p.b === 2 ? 3 : 2) : 1;
      const hold = Math.min(8, hp / (c.heroAtk * cap));
      // Held heroes take the minion's hits and stand in tower range; spread over the party.
      D += (n * cap * hold * (dps + dpsAt(post[0] + 0.5, post[1] + 0.5))) / Math.max(1, c.size / 2);
    } else if (p.k === 'mire') {
      if (!onRoute(p.x + 0.5, p.y + 0.5, c.mask)) continue;
      const slow = Math.min(0.7, (p.b === 1 ? 0.55 : 0.4) * (1 + 0.5 * (rm - 1)));
      const dur = 2 * (1 + 0.08 * (p.l - 1));
      D += slow * dur * dpsAt(p.x + 0.5, p.y + 0.5);
    } else if (p.k === 'spikes') {
      if (!onRoute(p.x + 0.5, p.y + 0.5, c.mask)) continue;
      const dmg = 8 * lm * rm * (p.b === 1 ? 1.8 : 1);
      const ch = p.b === 2 ? 5 : 3;
      const rech = p.b === 2 ? 2 : 4;
      D += Math.max(1, dmg - c.armor) * Math.min(1, (ch + M.PARTY_EVERY / rech) / c.size);
    }
  }
  return D;
}

// ---------- the real sim as the Lure oracle (1 seed, 8 parties incl. a Champion party) ----------

const probeCache = new Map<string, number>();
function leakAt(r: M.DungeonRun, T: number): number {
  const w = r.ws;
  const key = `${r.pieces.map((p) => `${p.k[0]}${p.k[1]}${p.x},${p.y},${p.l},${p.b}`).sort().join(';')}|${r.chests[0]}${r.chests[1]}|${w.whet},${w.necro},${w.insc}|${T}`;
  let v = probeCache.get(key);
  if (v !== undefined) return v;
  const start = 3; // parties 5..12 are measured; party 9 is the Champion party
  const sim = new Sim({ pieces: r.pieces, chests: r.chests, ws: r.ws, lure: T, party: start, seed: 0x9e3779b1, live: false });
  const first = start + 2;
  const last = first + 7;
  for (let i = 0; i < Math.round(160 / STEP); i++) {
    sim.step();
    if (sim.resolvedParties.has(last) && (i & 15) === 0) {
      let done = true;
      for (let n = first; n <= last && done; n++) if (!sim.resolvedParties.has(n)) done = false;
      if (done) break;
    }
  }
  let size = 0;
  let leaked = 0;
  for (let n = first; n <= last; n++) {
    const ps = sim.partyStats.get(n);
    if (ps) {
      size += ps.size;
      leaked += ps.leaked;
    } else {
      size += M.partySize(T);
      leaked += M.partySize(T);
    }
  }
  v = size ? leaked / size : 1;
  if (probeCache.size > 4000) probeCache.clear();
  probeCache.set(key, v);
  return v;
}

// ---------- candidates ----------

interface Cand {
  id: string;
  cost: number;
  apply(r: M.DungeonRun): void;
}

function bestTile(r: M.DungeonRun, k: M.PieceKind, c: Ctx): [number, number] | null {
  let best: [number, number] | null = null;
  let bs = -1;
  const range = k === 'arrow' ? 3 : k === 'brazier' ? 1.5 : k === 'ballista' ? 5 : 0;
  for (const t of TILES) {
    if (!validTile(r, k, t.x, t.y)) continue;
    let s: number;
    if (range > 0) s = coverage(t.x + 0.5, t.y + 0.5, range, c.mask);
    else if (M.PIECES[k].slot === 'chamber') {
      const post = lairPost(t.x, t.y)!;
      s = onRoute(post[0] + 0.5, post[1] + 0.5, c.mask) ? 10 + coverage(post[0] + 0.5, post[1] + 0.5, 3, c.mask) : -1;
    } else s = onRoute(t.x + 0.5, t.y + 0.5, c.mask) ? coverage(t.x + 0.5, t.y + 0.5, 3, c.mask) : -1;
    // Tie-break toward the Hoard end (later in the route), deterministic.
    s += (t.y * COLS + t.x) * 1e-6;
    if (s > bs) {
      bs = s;
      best = [t.x, t.y];
    }
  }
  return best && bs > 0 ? best : null;
}

function cloneRun(r: M.DungeonRun): M.DungeonRun {
  return { ...r, pieces: r.pieces.map((p) => ({ ...p })), chests: [r.chests[0], r.chests[1]], ws: { ...r.ws } };
}

function candidates(r: M.DungeonRun, c: Ctx): Cand[] {
  const out: Cand[] = [];
  for (const k of M.KIND_ORDER) {
    if (M.PIECES[k].slot === 'path' && M.runeCount(r) >= M.runeSlots(r)) continue;
    const tile = bestTile(r, k, c);
    if (!tile) continue;
    const cost = M.placeCost(r, k);
    out.push({
      id: `place.${k}`,
      cost,
      apply: (q) => {
        q.pieces.push({ id: q.nextId++, k, x: tile[0], y: tile[1], l: 1, b: 0, inv: cost });
        q.stats.placed++;
      },
    });
  }
  for (const p of r.pieces) {
    if (p.l >= M.MAX_LEVEL) continue;
    const cost = M.levelCost(p.k, p.l);
    const branches: (0 | 1 | 2)[] = p.l + 1 === M.BRANCH_LEVEL ? [1, 2] : [0];
    for (const b of branches)
      out.push({
        id: b ? `branch.${p.k}` : `up.${p.k}`,
        cost,
        apply: (q) => {
          const qp = q.pieces.find((x) => x.id === p.id)!;
          qp.l++;
          qp.inv += cost;
          q.stats.upgrades++;
          if (b) {
            qp.b = b;
            q.stats.branches++;
          }
        },
      });
  }
  for (let i = 0; i < 2; i++) {
    if (r.chests[i]) continue;
    out.push({ id: `chest.${i}`, cost: M.chestCost(r), apply: (q) => void (q.chests[i] = 1) });
  }
  return out;
}

function workshop(save: DeptSave): UpgradeEntry[] {
  return buildGroups(headlessCtx(save), { changed() {}, lureBought() {} }).flatMap((g) => g.entries);
}

// ---------- the adapter ----------

export const createDungeon = (opts: DungeonOpts = {}): AdapterFactory => (seed) => {
  const sk = SKILL[opts.skill ?? 'reference'];
  let sessions = 0;
  const counters = { liveS: 0, probes: 0 };
  /** Last Lure probe: +T = the layout held tier T, -T = it leaked at T. */
  let holdsT = 0;

  function updateBlueprint(save: DeptSave): void {
    const r = run(save);
    per(save).bp = { cycle: save.cycle.n, pieces: r.pieces.map((p) => ({ k: p.k, x: p.x, y: p.y })), value: M.layoutValue(r) };
  }

  /** scene.ts applyStarterKit: last cycle's layout becomes ghosts, the kit adds 10% of its value. */
  function applyStarterKit(save: DeptSave): void {
    const r = run(save);
    const p = per(save);
    const n = save.cycle.n;
    if (p.bp.cycle >= n) return;
    const starter = (g: M.Ghost) => STARTER_SLITS.some(([x, y]) => g.x === x && g.y === y && g.k === 'arrow');
    const fresh = p.bp.pieces.filter((g) => !starter(g));
    const keep = p.ghosts.filter((g) => !fresh.some((f) => f.x === g.x && f.y === g.y));
    p.ghosts = [...fresh, ...keep];
    if (p.bp.value > 0) r.bank += 0.1 * p.bp.value;
    p.bp = { cycle: n, pieces: [], value: 0 };
  }

  function startSession(save: DeptSave, env: SessionEnv): ActiveSession {
    const r = run(save);
    M.normalize(r, per(save));
    applyStarterKit(save);
    r.lure = Math.max(0, Math.min(r.lure, r.lureMax));
    const rnd = makeRng(childSeed(seed, `dungeon.bot.${sessions}`));
    const sim = new Sim({
      pieces: r.pieces,
      chests: r.chests,
      ws: r.ws,
      lure: r.lure,
      party: r.party,
      seed: childSeed(seed, `dungeon.sim.${sessions++}`),
      live: true,
      ...dungeonImports(save.imports),
    });
    sim.stealFn = (h) => {
      const amount = Math.max(0, Math.min(M.stealBase(h.type, h.bounty), 0.02 * r.bank));
      r.bank -= amount;
      return amount;
    };
    env.raiseSkill(M.heldLure(r));
    let acc = 0;
    let botT = 0;
    let shopT = 0;
    let glareCd = 0;
    let glareWait = -1;
    let trapWait = -1;
    let gongWait = -1;
    let lastPartyLeaked = false;

    function layoutChanged(): void {
      sim.setLayout(r.pieces, r.chests, r.ws);
      updateBlueprint(save);
      r.stats.bestPieces = Math.max(r.stats.bestPieces, r.pieces.length);
      r.rev++;
    }
    function setLure(T: number): void {
      if (T === r.lure) return;
      r.lure = T;
      sim.setLure(T);
      r.rev++;
    }
    function onLureBought(): void {
      sim.setLure(r.lure);
      r.rev++;
      if (r.lureMax > per(save).bestLure) per(save).bestLure = r.lureMax;
    }

    function events(): void {
      for (const e of sim.events) {
        const s = r.stats;
        switch (e.t) {
          case 'kill':
            s.kills++;
            if (e.amount > 0) {
              const grab = !opts.passive && rnd() < sk.grab;
              env.earn(e.amount * (grab ? 1 + M.GRAB_BONUS : 1));
              if (grab) s.grabs++;
            }
            if (e.sack > 0) {
              r.bank += e.sack;
              env.earn(e.sack * M.RECOVER_BONUS);
              s.recovered++;
            }
            if (e.hero === 'champ') {
              s.champs++;
              if (sim.leakFrac() < 0.2 && sim.lure >= M.CHAMP_LURE) {
                M.recordChamp(r, sim.lure);
                env.raiseSkill(M.heldLure(r));
              }
            }
            break;
          case 'leak':
            s.thieves++;
            lastPartyLeaked = true;
            break;
          case 'escape':
            s.escaped++;
            break;
          case 'trapped':
            s.traps++;
            break;
          case 'loot':
            s.detours++;
            break;
          case 'party':
            r.party = sim.partyN;
            break;
          case 'partyDone':
            if (e.leaked === 0) lastPartyLeaked = false;
            break;
        }
      }
      sim.events.length = 0;
    }

    function bot(h: number): void {
      if (opts.passive) return;
      glareCd = Math.max(0, glareCd - h);
      const heroes = sim.heroes.filter((x) => !x.dead && !x.gone);
      // Glare: thieves heading out, then Champions, then whoever is closest to the Hoard.
      if (glareCd <= 0 && heroes.length) {
        if (glareWait < 0) glareWait = sk.reaction;
        glareWait -= h;
        if (glareWait <= 0) {
          let target: SimHero | null = null;
          let ts = -1;
          for (const x of heroes) {
            const f = x.dist / x.route.len;
            const s = x.dir < 0 && x.sack > 0 ? 3 - f : x.type === 'champ' ? 1.5 + f : f;
            if (s > ts) {
              ts = s;
              target = x;
            }
          }
          if (target && ts > 0.35) {
            sim.smite(target, M.glareDamage(r.ws, sim.lure));
            glareCd = M.glareCooldown(r.ws);
            r.stats.glares++;
            if (target.dead) r.stats.glareKills++;
            glareWait = -1;
          }
        }
      } else glareWait = -1;
      // Trapdoor: under a forward hero in the last quarter of the route.
      if (sk.trap && sim.trapCharges > 0 && !sim.trap) {
        const late = heroes.find((x) => x.dir > 0 && x.type !== 'champ' && x.dist / x.route.len > 0.75 && x.hp > 0.3 * x.maxHp);
        if (late) {
          if (trapWait < 0) trapWait = sk.reaction;
          trapWait -= h;
          if (trapWait <= 0) {
            sim.openTrap(Math.floor(late.x), Math.floor(late.y));
            trapWait = -1;
          }
        } else trapWait = -1;
      }
      // Gong: the door is clear (at most gongClear forward heroes left) and the last party held.
      const forward = heroes.filter((x) => x.dir > 0).length;
      if (sim.gongReady && forward <= sk.gongClear && !lastPartyLeaked) {
        if (gongWait < 0) gongWait = sk.reaction;
        gongWait -= h;
        if (gongWait <= 0 && sim.gong()) {
          r.stats.gongs++;
          r.stats.bestGong = Math.max(r.stats.bestGong, sim.gongStack);
          gongWait = -1;
        }
      } else gongWait = -1;
      // Lure management: step down when the live floor leaks; the Champion gate needs < 20%.
      if (sim.history.length >= 10 && sim.leakFrac() > 0.25 && r.lure > 0) {
        setLure(r.lure - 1);
        sim.history.length = 0;
      }
    }

    function shopNow(goals: BotGoals): string[] {
      const bought: string[] = [];
      const ws = () => workshop(save);
      const idle0 = Math.max(1e-9, dungeonEcon.idleRate(save));
      // Whether the layout holds the next Lure: probed on the real sim once per pass, and only
      // when the Lure is affordable (otherwise the last answer for this tier stands).
      let probed = -1;
      for (let guard = 0; guard < 60; guard++) {
        const c = ctxOf(r);
        const nextT = r.lureMax + 1;
        const lureEntry = ws().find((e) => e.id === 'lure')!;
        const lureCost = r.lureMax < M.MAX_LURE ? M.lureCost(nextT) : Infinity;
        if (lureEntry.canAfford() && probed !== nextT) {
          probed = nextT;
          counters.probes++;
          holdsT = leakAt(r, nextT) < 0.2 ? nextT : -nextT;
        }
        const holds = holdsT === nextT;
        if (holds && lureEntry.canAfford()) {
          lureEntry.buy();
          onLureBought();
          bought.push('lure');
          continue;
        }
        // Rank every defense purchase by Δdefense / cost (at the next tier's heroes when saving).
        const cc = holds ? c : ctxOf(r, nextT);
        const d0 = defense(r, cc);
        let best: { id: string; cost: number; ratio: number; buy(): void } | null = null;
        for (const cand of candidates(r, cc)) {
          const q = cloneRun(r);
          cand.apply(q);
          const gain = defense(q, ctxOf(q, cc.T)) - d0;
          if (!(gain > 0)) continue;
          const ratio = gain / cand.cost;
          if (!best || ratio > best.ratio)
            best = {
              id: cand.id,
              cost: cand.cost,
              ratio,
              buy: () => {
                r.bank -= cand.cost;
                cand.apply(r);
                layoutChanged();
              },
            };
        }
        for (const e of ws()) {
          if (e.id === 'lure' || e.level() >= e.max || e.locked?.()) continue;
          const k = e.id as keyof M.Workshop;
          let gain = 0;
          if (k === 'whet' || k === 'necro' || k === 'insc') gain = defense(r, cc, { ...r.ws, [k]: r.ws[k] + 1 }) - d0;
          else if (k === 'ledger') gain = (d0 * 0.04) / (1 + 0.04 * r.ws.ledger);
          else if (k === 'greed') gain = d0 * (LONG_EFFECT - 1);
          else if (k === 'gaze') {
            // Active-only: extra Glare damage per party member, half weight.
            const g = (w: M.Workshop) => (M.glareDamage(w, cc.T) / M.glareCooldown(w)) * (M.PARTY_EVERY / cc.size);
            gain = 0.5 * (g({ ...r.ws, gaze: r.ws.gaze + 1 }) - g(r.ws));
          } else if (k === 'slots') {
            if (M.runeCount(r) < M.runeSlots(r)) continue;
            gain = d0 * 0.03;
          }
          if (!(gain > 0)) continue;
          const ratio = gain / e.cost();
          if (!best || ratio > best.ratio)
            best = {
              id: e.id,
              cost: e.cost(),
              ratio,
              buy: () => {
                e.buy();
                layoutChanged();
              },
            };
        }
        if (!best || r.bank < best.cost) break;
        // Saving for a Lure the layout already holds: only small buys.
        // Not yet probed for this tier: also save (small buys only), the probe runs once affordable.
        const saving = holdsT !== -nextT && (lureCost - r.bank) / idle0 < 1800;
        if (saving && best.cost > 0.15 * lureCost) break;
        best.buy();
        bought.push(best.id);
      }
      // Lure on screen: the top tier bought, unless the bot stepped down this session.
      if (bought.length) setLure(r.lureMax);
      void goals;
      return bought;
    }

    return {
      step(dt) {
        counters.liveS += dt;
        acc += dt;
        while (acc >= STEP - 1e-9) {
          acc -= STEP;
          sim.step(STEP);
          events();
          botT += STEP;
          if (botT >= 0.1) {
            bot(botT);
            botT = 0;
          }
        }
        shopT += dt;
      },
      buy(goals) {
        if (shopT < sk.shopEvery && shopT > 0) return [];
        shopT = 0;
        return shopNow(goals);
      },
      end() {},
      stats: () => ({ ...counters }),
    };
  }

  return {
    id: 'dungeon',
    def: dungeonEcon,
    dialMax: M.MAX_LURE,
    dialId: 'lure',
    // Dial level k = lureMax k; Lure k+1 costs lureCost(k+1).
    dialCost: (k) => M.lureCost(k + 1),
    startSession,
    anyAffordable(save) {
      const r = run(save);
      M.normalize(r, per(save));
      if (workshop(save).some((e) => e.level() < e.max && e.canAfford())) return true;
      for (const k of M.KIND_ORDER) {
        if (r.bank < M.placeCost(r, k)) continue;
        if (M.PIECES[k].slot === 'path' && M.runeCount(r) >= M.runeSlots(r)) continue;
        if (TILES.some((t) => validTile(r, k, t.x, t.y))) return true;
      }
      return r.pieces.some((p) => p.l < M.MAX_LEVEL && r.bank >= M.levelCost(p.k, p.l));
    },
    dialLevel: (save) => run(save).lureMax ?? 0,
    // 01 §3: active ≈ 1.8-2.2x R_sim.
    localRatioBands: { all: [1.8, 2.2] },
    ratioScale: (save) => M.greedMult((save.run as M.DungeonRun).ws),
    describe(save) {
      const r = run(save);
      const lv = r.pieces.length ? (r.pieces.reduce((a, p) => a + p.l, 0) / r.pieces.length).toFixed(1) : '0';
      return `lure ${r.lure}/${r.lureMax} pieces ${r.pieces.length} avgL ${lv} chests ${r.chests[0]}${r.chests[1]} greed ${r.ws.greed ?? 0} held ${M.heldLure(r)} idle ${idleRateOf(r).toFixed(1)}`;
    },
  };
};
