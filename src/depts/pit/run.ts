// The War Pit Run: shop, roll, freeze, buy, sell, merge, food, the Royal Brand, rival ghost
// drafting, the Huntmaster and round resolution (specs/07 §2, §5). Pure TS, no Pixi. The scene
// calls these on the saved RunState; the draft bots (scripts/pit-bot.ts, tests) call the same.
//
// Three named RNG streams (07 §14.2): shop(runSeed, round, roll), shopTrigger(runSeed, round,
// actionIndex) and the battle stream (engine.ts). Rivals are drawn from the run seed and round.
import { battle, battleSeed, hashStr, mulberry32, type BattleResult, type Fighter } from './engine';
import {
  ARCHES,
  ARCH_LIST,
  FOODS,
  FOOD_LIST,
  HELD_POOL,
  ROSTER,
  UNITS,
  maxTier,
  shopFoods,
  shopUnits,
  type ArchId,
  type FoodId,
  type ItemId,
  type UnitId,
} from './units';

/** Bumped when battle or shop rules change; a paused Run keeps the version it started with. */
export const PARAMS_VERSION = 3; // 2: the Huntmaster 8/14 -> 14/30, gentler Stakes growth (sim pass 5);
// 3: tactics cards 12/15/18, rival stats grow x1.04 per level above Stakes 10, Huntmaster scars.

export const UNIT_COST = 3;
export const ROLL_COST = 1;
export const CHOW_PER_ROUND = 10;
export const WINS_TO_TRIUMPH = 8;
export const BASE_GRIT = 4;
export const SHOP_MAX = 6;

// ---------- state ----------

/** A beast in your line. Stats include merges and permanent food; xp = copies merged in. */
export interface Pet {
  k: UnitId;
  a: number;
  h: number;
  xp: number;
  it: ItemId | null;
  br?: 1; // Royal Brand
  fb?: 1; // the Run's first-bought unit (Marked Prey, tactics card 15)
}

export interface ShopUnit {
  k: UnitId;
  a: number;
  h: number;
  fz?: 1;
  bonus?: 1; // level-up bonus unit
}

export interface ShopFood {
  f: FoodId;
  fz?: 1;
}

export interface RivalInfo {
  arch: ArchId | 'hunt';
  line: Fighter[];
}

export interface RunState {
  pv: number;
  seed: number;
  stakes: number;
  round: number;
  wins: number;
  losses: number;
  grit: number;
  gritMax: number;
  chow: number;
  rolls: number; // rolls this round (shop stream index)
  act: number; // shop actions this round (shopTrigger stream index)
  line: (Pet | null)[];
  shop: (ShopUnit | null)[];
  food: (ShopFood | null)[];
  brandUsed: boolean;
  lossRun: number; // consecutive losses (bonus Chow next round, max +2)
  huntB: number; // Huntmaster budget, fixed at the first attempt (0 = not yet)
  teeth: number; // Teeth earned this Run (battles), for the summary
  freeRollUsed: boolean;
  ended: '' | 'triumph' | 'retreat';
  /** Persistent buys (Pedigree / Bestiary) snapshotted at Run start. */
  opts: RunOpts;
  /** Counters for commendations and the playtest summary. */
  buys: number;
  merges: number;
  maxLvl: number;
  startedAt: number;
  playMs: number;
  /** Scene bookkeeping (saved so a closed app never loses pay): battle Teeth not yet credited. */
  pend?: number;
  /** Teeth credited this Run (after multipliers), the run-end bonus, Crests and Crown won. */
  earned?: number;
  paid?: boolean;
  bonus?: number;
  crestsWon?: number;
  crown?: boolean;
  /** This Run left the Huntmaster a scar (summary line). */
  scarred?: boolean;
}

/** Everything the Run needs from upgrades and persistent buys (snapshotted at Run start). */
export interface RunOpts {
  pool: UnitId[];
  larder: number; // +Chow per round
  deepLarder: number; // Pedigree: +Chow per round
  penSpace: number;
  freeRoll: boolean;
  gritMax: number;
  hardy: number; // Hardy Stock level
  ratStart: boolean; // Pedigree: start with a Gutter Rat
  chowR1: boolean; // Pedigree: +2 Chow in round 1
  sigils: number;
  shade: number;
  carry?: ShopUnit | null; // Pedigree: a frozen unit carried over
  /** Huntmaster scars this cycle (each one -SCAR_STEP to his whole party), snapshotted at Run start. */
  scars?: number;
}

export function lvlOf(xp: number): number {
  return xp >= 5 ? 3 : xp >= 2 ? 2 : 1;
}

/** Copies needed for the next level, and copies in this level (for the XP pips). */
export function xpPips(xp: number): { have: number; need: number } {
  if (xp >= 5) return { have: 3, need: 3 };
  if (xp >= 2) return { have: xp - 2, need: 3 };
  return { have: xp, need: 2 };
}

export function newPet(k: UnitId): Pet {
  const d = UNITS[k];
  return { k, a: d.atk, h: d.hp, xp: 0, it: null };
}

// ---------- RNG streams ----------

const shopRng = (rs: RunState) => mulberry32(hashStr('shop', rs.seed, rs.round, rs.rolls));
const trigRng = (rs: RunState) => mulberry32(hashStr('trig', rs.seed, rs.round, rs.act));

// ---------- Run lifecycle ----------

export function newRun(seed: number, stakes: number, opts: RunOpts, now = 0): RunState {
  const rs: RunState = {
    pv: PARAMS_VERSION,
    seed: seed >>> 0,
    stakes,
    round: 1,
    wins: 0,
    losses: 0,
    grit: opts.gritMax,
    gritMax: opts.gritMax,
    chow: 0,
    rolls: 0,
    act: 0,
    line: [null, null, null, null, null],
    shop: [],
    food: [],
    brandUsed: false,
    lossRun: 0,
    huntB: 0,
    teeth: 0,
    freeRollUsed: false,
    ended: '',
    opts,
    buys: 0,
    merges: 0,
    maxLvl: 1,
    startedAt: now,
    playMs: 0,
  };
  if (opts.ratStart) rs.line[0] = newPet('rat');
  if (opts.carry) rs.shop.push({ ...opts.carry, fz: 1 });
  startRound(rs);
  return rs;
}

export function chowForRound(rs: RunState): number {
  const o = rs.opts;
  return CHOW_PER_ROUND + o.larder + o.deepLarder + Math.min(2, rs.lossRun) + (rs.round === 1 && o.chowR1 ? 2 : 0);
}

export function startRound(rs: RunState): void {
  rs.chow = chowForRound(rs);
  rs.rolls = 0;
  rs.act = 0;
  rs.freeRollUsed = false;
  fillShop(rs);
}

/** Refill every unfrozen shop slot from the shop stream. */
function fillShop(rs: RunState): void {
  const rng = shopRng(rs);
  const tier = maxTier(rs.round);
  const pool = rs.opts.pool.filter((k) => UNITS[k].tier <= tier);
  const keep = rs.shop.filter((s): s is ShopUnit => !!s && !!s.fz);
  const n = Math.max(shopUnits(rs.round, rs.opts.penSpace), keep.length);
  const units: (ShopUnit | null)[] = keep;
  while (units.length < n) {
    const k = pool[Math.floor(rng() * pool.length)];
    units.push({ k, a: UNITS[k].atk, h: UNITS[k].hp });
  }
  rs.shop = units;
  const foods = FOOD_LIST.filter((f) => FOODS[f].tier <= tier);
  const nf = shopFoods(rs.round);
  const fkeep: (ShopFood | null)[] = [];
  for (let i = 0; i < nf; i++) {
    const old = rs.food[i];
    if (old && old.fz) fkeep.push(old);
    else fkeep.push({ f: foods[Math.floor(rng() * foods.length)] });
  }
  rs.food = fkeep;
}

export function rollCost(rs: RunState): number {
  return rs.opts.freeRoll && !rs.freeRollUsed ? 0 : ROLL_COST;
}

export function roll(rs: RunState): boolean {
  const c = rollCost(rs);
  if (rs.chow < c) return false;
  rs.chow -= c;
  if (c === 0) rs.freeRollUsed = true;
  rs.rolls++;
  fillShop(rs);
  return true;
}

export function toggleFreeze(rs: RunState, kind: 'unit' | 'food', i: number): void {
  const s = kind === 'unit' ? rs.shop[i] : rs.food[i];
  if (!s) return;
  if (s.fz) delete s.fz;
  else s.fz = 1;
}

export function lineCount(rs: RunState): number {
  return rs.line.filter(Boolean).length;
}

export interface BuyResult {
  ok: boolean;
  merged?: boolean;
  levelUp?: number; // new level
  slot?: number;
  buffed?: number[]; // slots buffed by a Buy trigger
}

/** Merge `copies` copies (+1/+1 each, 1 XP each) onto a line pet. Returns the new level if it rose. */
function addCopies(rs: RunState, p: Pet, copies: number, a = 0, h = 0): number | undefined {
  const before = lvlOf(p.xp);
  const room = 5 - p.xp;
  const n = Math.min(copies, Math.max(0, room));
  p.xp += n;
  p.a = Math.max(p.a, a) + n;
  p.h = Math.max(p.h, h) + n;
  const after = lvlOf(p.xp);
  rs.merges++;
  if (after > before) {
    rs.maxLvl = Math.max(rs.maxLvl, after);
    levelUpBonus(rs);
    return after;
  }
  return undefined;
}

/** A level-up adds a bonus unit of the next tier (up to T5) to the shop (07 §2). */
function levelUpBonus(rs: RunState): void {
  if (rs.shop.length >= SHOP_MAX) return;
  const tier = Math.min(5, maxTier(rs.round) + 1);
  const pool = rs.opts.pool.filter((k) => UNITS[k].tier === tier);
  if (!pool.length) return;
  const rng = trigRng(rs);
  rng();
  const k = pool[Math.floor(rng() * pool.length)];
  rs.shop.push({ k, a: UNITS[k].atk, h: UNITS[k].hp, bonus: 1 });
}

/** Buy shop unit i onto line slot `slot` (empty -> place, same kind -> merge). */
export function buy(rs: RunState, i: number, slot: number): BuyResult {
  const s = rs.shop[i];
  if (!s || rs.chow < UNIT_COST || slot < 0 || slot >= 5) return { ok: false };
  const target = rs.line[slot];
  if (target && target.k !== s.k) return { ok: false };
  if (target && target.xp >= 5) return { ok: false };
  rs.chow -= UNIT_COST;
  rs.shop.splice(i, 1);
  rs.buys++;
  rs.act++;
  let res: BuyResult;
  if (target) {
    const lv = addCopies(rs, target, 1, s.a, s.h);
    res = { ok: true, merged: true, levelUp: lv, slot };
  } else {
    rs.line[slot] = { k: s.k, a: s.a, h: s.h, xp: 0, it: null };
    if (!rs.line.some((q, j) => q && j !== slot && q.fb) && rs.buys === 1) rs.line[slot]!.fb = 1;
    res = { ok: true, slot };
  }
  // Buy trigger: Dung Beetle, 2 random friends +L attack.
  const p = rs.line[slot]!;
  if (p.k === 'dung') {
    const rng = trigRng(rs);
    const others = rs.line.map((x, j) => (x && j !== slot ? j : -1)).filter((j) => j >= 0);
    const buffed: number[] = [];
    for (let n = 0; n < 2 && others.length; n++) {
      const j = others.splice(Math.floor(rng() * others.length), 1)[0];
      rs.line[j]!.a += lvlOf(p.xp);
      buffed.push(j);
    }
    res.buffed = buffed;
  }
  return res;
}

/** First empty slot, or a slot holding the same kind (merge), or -1. */
export function autoSlot(rs: RunState, k: UnitId): number {
  const same = rs.line.findIndex((p) => p && p.k === k && p.xp < 5);
  if (same >= 0) return same;
  return rs.line.findIndex((p) => !p);
}

export function foodCost(f: FoodId): number {
  return FOODS[f].cost;
}

/** Buy food i and feed it to slot (ignored for Hero's Lunchbox, which feeds everyone). */
export function buyFood(rs: RunState, i: number, slot: number): boolean {
  const s = rs.food[i];
  if (!s) return false;
  const def = FOODS[s.f];
  if (rs.chow < def.cost) return false;
  const p = rs.line[slot];
  if (!def.all && !p) return false;
  if (def.all && !lineCount(rs)) return false;
  rs.chow -= def.cost;
  rs.food[i] = null;
  rs.act++;
  if (def.all) {
    for (const q of rs.line) if (q) (q.a++, q.h++);
  } else if (p) {
    if (s.f === 'haunch') (p.a++, p.h++);
    else if (s.f === 'pudding') p.h += 3;
    else p.it = s.f as ItemId;
  }
  return true;
}

export function sellValue(p: Pet): number {
  return lvlOf(p.xp);
}

/** Sell the pet at slot: refunds 1 Chow per level and fires its Sell trigger. */
export function sell(rs: RunState, slot: number): number {
  const p = rs.line[slot];
  if (!p) return 0;
  let gain = sellValue(p);
  if (p.k === 'piglet') gain += lvlOf(p.xp);
  rs.chow += gain;
  rs.line[slot] = null;
  rs.act++;
  return gain;
}

/** Move or swap two line slots. */
export function move(rs: RunState, from: number, to: number): void {
  if (from === to) return;
  const a = rs.line[from];
  rs.line[from] = rs.line[to];
  rs.line[to] = a;
}

/** Merge line unit `from` onto line unit `to` (same kind). Returns the new level if it rose, -1 on failure. */
export function mergeLine(rs: RunState, from: number, to: number): number {
  const a = rs.line[from];
  const b = rs.line[to];
  if (!a || !b || from === to || a.k !== b.k || b.xp >= 5) return -1;
  rs.line[from] = null;
  if (a.it && !b.it) b.it = a.it;
  if (a.br) b.br = 1;
  return addCopies(rs, b, a.xp + 1, a.a, a.h) ?? 0;
}

export function brand(rs: RunState, slot: number): boolean {
  const p = rs.line[slot];
  if (!p || rs.brandUsed) return false;
  p.br = 1;
  rs.brandUsed = true;
  return true;
}

/** End of shop triggers (Owlbear). Returns slots buffed. */
export function endShop(rs: RunState): number[] {
  const out: number[] = [];
  rs.line.forEach((p, i) => {
    if (!p || p.k !== 'owlbear') return;
    for (let j = i - 1; j >= 0; j--) {
      const f = rs.line[j];
      if (f) {
        const L = lvlOf(p.xp);
        f.a += L;
        f.h += L;
        out.push(j);
        break;
      }
    }
  });
  return out;
}

/** Compact the line forward (the line slides to the front before a battle). */
export function compact(rs: RunState): void {
  const ps = rs.line.filter(Boolean);
  rs.line = [0, 1, 2, 3, 4].map((i) => ps[i] ?? null);
}

// ---------- stats at battle start (07 §14.2 order) ----------

export const r5 = (x: number) => Math.floor(x + 0.5);

/** Pets -> Fighters: base (with merges, food) -> Hardy Stock -> Brand; drill adds +1/+1 per level first. */
export function prepareLine(line: (Pet | null)[], hardy: number, drill = 0): Fighter[] {
  const out: Fighter[] = [];
  line.forEach((p, i) => {
    if (!p) return;
    const hm = 1 + 0.04 * hardy;
    const bm = p.br ? 1.5 : 1;
    out.push({
      kind: p.k,
      lvl: lvlOf(p.xp),
      atk: r5(r5((p.a + drill) * hm) * bm),
      hp: r5(r5((p.h + drill) * hm) * bm),
      item: p.it,
      brand: !!p.br,
      marked: !!p.fb,
      ref: i,
    });
  });
  return out;
}

// ---------- rivals: the ghost drafter (novice bot, 07 §5.2, §14.1) ----------

/** Rough value of a beast for the greedy bots (tier, stats, archetype bias). */
export function unitValue(k: UnitId, a: number, h: number, lvl: number, arch?: ArchId): number {
  const d = UNITS[k];
  let v = d.tier * 2.2 + (a + h) * 0.6 + (lvl - 1) * 3;
  if (arch && ARCHES[arch].bias.includes(k)) v += 3;
  if (d.shopOnly) v -= 1.5;
  return v;
}

/** Line order heuristic: tanks and faint-summoners front, snipers back. */
export function orderLine<T extends { k?: UnitId; kind?: UnitId; a?: number; h?: number; atk?: number; hp?: number }>(units: T[]): T[] {
  const key = (u: T) => {
    const k = (u.k ?? u.kind)!;
    const hp = u.h ?? u.hp ?? 0;
    return UNITS[k].front * 3 + hp * 0.5;
  };
  return [...units].sort((x, y) => key(y) - key(x));
}

interface Draft {
  k: UnitId;
  a: number;
  h: number;
  xp: number;
  it: ItemId | null;
}

/**
 * The novice ghost drafter: plays rounds 1..r of the real shop rules (10 Chow, rolls, merges,
 * tiers by round) with a greedy value-per-Chow pick, an archetype bias and 20% random buys.
 */
export function ghostDraft(arch: ArchId, r: number, seed: number, pool: UnitId[] = ROSTER): Draft[] {
  const rng = mulberry32(hashStr('ghost', seed, r));
  const team: Draft[] = [];
  const A = ARCHES[arch];
  for (let rd = 1; rd <= r; rd++) {
    let chow = CHOW_PER_ROUND;
    const tier = maxTier(rd);
    const avail = pool.filter((k) => UNITS[k].tier <= tier);
    // Bias: archetype units appear twice as often in the ghost's eyes.
    const biased = avail.concat(avail.filter((k) => A.bias.includes(k)));
    const rollShop = () => {
      const n = shopUnits(rd);
      const s: UnitId[] = [];
      for (let i = 0; i < n; i++) s.push(biased[Math.floor(rng() * biased.length)]);
      return s;
    };
    let shop = rollShop();
    let rolls = 0;
    for (let guard = 0; guard < 10 && chow >= 1; guard++) {
      if (chow >= UNIT_COST && shop.length) {
        let best = -1;
        let bestV = -1e9;
        if (rng() < 0.2) best = Math.floor(rng() * shop.length);
        else
          shop.forEach((k, i) => {
            const dup = team.find((t) => t.k === k && t.xp < 5);
            const v = unitValue(k, UNITS[k].atk, UNITS[k].hp, 1, arch) + (dup ? 4 : 0);
            if (v > bestV) {
              bestV = v;
              best = i;
            }
          });
        const k = shop[best];
        const dup = team.find((t) => t.k === k && t.xp < 5);
        const weakest = team.reduce<Draft | null>((w, t) => (!w || unitValue(t.k, t.a, t.h, lvlOf(t.xp)) < unitValue(w.k, w.a, w.h, lvlOf(w.xp)) ? t : w), null);
        if (dup) {
          dup.xp++;
          dup.a++;
          dup.h++;
        } else if (team.length < 5) {
          team.push({ k, a: UNITS[k].atk, h: UNITS[k].hp, xp: 0, it: null });
        } else if (weakest && unitValue(k, UNITS[k].atk, UNITS[k].hp, 1, arch) > unitValue(weakest.k, weakest.a, weakest.h, lvlOf(weakest.xp), arch) + 1) {
          team.splice(team.indexOf(weakest), 1, { k, a: UNITS[k].atk, h: UNITS[k].hp, xp: 0, it: null });
          chow += lvlOf(weakest.xp);
        } else {
          shop.splice(best, 1);
          continue;
        }
        chow -= UNIT_COST;
        shop.splice(best, 1);
        continue;
      }
      // Leftover Chow: Hexers feed, everyone else rolls once or twice, then stops.
      if (A.foods && chow >= 3 && team.length) {
        const t = team[Math.floor(rng() * team.length)];
        const f = rng();
        if (f < 0.4) (t.a++, t.h++);
        else if (f < 0.6) t.h += 3;
        else t.it = HELD_POOL[Math.floor(rng() * HELD_POOL.length)];
        chow -= 3;
        continue;
      }
      if (rolls < 2 && chow >= UNIT_COST + 1) {
        chow -= 1;
        rolls++;
        shop = rollShop();
        continue;
      }
      break;
    }
  }
  return team;
}

export const rivalSize = (r: number) => Math.min(5, 1 + Math.ceil(r / 2));

/** Rival stats multiplier from Stakes (07 §7 seed 1.12). TUNED to 1.10 with scripts/pit-bot.ts: at 1.12 the
 * greedy bot fell to ~5% Triumphs at Stakes 10 even with Hardy Stock maxed, so the MVP cap (10) was
 * out of reach for anyone but experts. */
export const STAKES_STAT = 1.1;
/** Above Stakes 10 rivals grow gently (x STAKES_STAT_HI per level) and the tactics cards 12/15/18
 * carry the difficulty instead (07 §7: "Like Menace, Stakes adds rules"). SIM-TUNED: at the full
 * x1.1 the reference bot with Hardy Stock maxed won ~4% of Runs at Stakes 14 and none at 18, so
 * the Infamy target could not follow the cards past 10 (W-21). Params version 3; a paused Run of
 * an older version keeps x1.1 throughout. */
export const STAKES_STAT_HI = 1.02;
export function stakesStat(S: number, pv = PARAMS_VERSION): number {
  if (pv < 3 || S <= 10) return STAKES_STAT ** S;
  return STAKES_STAT ** 10 * STAKES_STAT_HI ** (S - 10);
}
/** The tactics level a Run of params version pv plays at (cards 12+ arrived in version 3). */
export const tacticsFor = (S: number, pv = PARAMS_VERSION) => (pv < 3 ? Math.min(S, 11) : S);

/** Archetype for round r of a seeded series. */
export function pickArch(r: number, seed: number): ArchId {
  const ok = ARCH_LIST.filter((a) => ARCHES[a].from <= r);
  const rng = mulberry32(hashStr('arch', seed, r));
  return ok[Math.floor(rng() * ok.length)];
}

/** The base (Stakes 0) rival line for round r: drafted, cut to size, grown, ordered. Cached. */
const rivalCache = new Map<string, { arch: ArchId; line: Draft[] }>();
export function rivalBase(r: number, seed: number): { arch: ArchId; line: Draft[] } {
  const key = `${seed}:${r}`;
  const hit = rivalCache.get(key);
  if (hit) return hit;
  const arch = pickArch(r, seed);
  let team = ghostDraft(arch, r, hashStr('rival', seed, r));
  team = [...team].sort((x, y) => unitValue(y.k, y.a, y.h, lvlOf(y.xp), arch) - unitValue(x.k, x.a, x.h, lvlOf(x.xp), arch)).slice(0, rivalSize(r));
  const rng = mulberry32(hashStr('growth', seed, r));
  const grow = Math.floor((r - 1) / 2);
  for (let i = 0; i < grow && team.length; i++) {
    const t = team[Math.floor(rng() * team.length)];
    t.a++;
    t.h++;
  }
  const out = { arch, line: orderLine(team) };
  if (rivalCache.size > 4000) rivalCache.clear();
  rivalCache.set(key, out);
  return out;
}

function toFighters(line: Draft[], S: number, pv = PARAMS_VERSION, scale = 1): Fighter[] {
  const m = stakesStat(S, pv) * scale;
  return line.map((t) => ({ kind: t.k, lvl: lvlOf(t.xp), atk: r5(t.a * m), hp: r5(t.h * m), item: t.it }));
}

export function rival(r: number, S: number, seed: number, pv = PARAMS_VERSION): RivalInfo {
  const b = rivalBase(r, seed);
  return { arch: b.arch, line: toFighters(b.line, S, pv) };
}

/** The Huntmaster's own stats at Stakes 0 (07 §5.2 seed 8/14, Armor 2).
 * SIM-TUNED 8/14 -> 14/30 (sim/README.md "Pass 5"): the reference draft bot, which judges up to 8
 * line orders per shop against what the scout shows, beat an 8/14 Huntmaster ~85% of the time it
 * reached him and Triumphed in ~85% of Runs at the Infamy target (07 §14.1 bands: 50-70% and
 * 35-50%). At 12/26 (x1.1^S like his beasts): ~60% and ~50%; rounds 1-5 still ~90% (band
 * >= 75%), Runs ~6.5 min. See HUNT_STAKES_EXP for the 14/30 base. */
export const HUNT_ATK = 14;
export const HUNT_HP = 30;
/** The Huntmaster's own stats grow as stakesStat(S)^HUNT_STAKES_EXP (his beasts take the full
 * stakesStat). SIM-TUNED 1 -> 0.5 with the base 12/26 -> 14/30 (same bout at Stakes 4, the first
 * target): at the full x1.1^S the reference bot beat him in ~1 of 3 Runs at Stakes 10, the MVP's
 * last target, and the Pit's late cycles stalled past 5 days on the skill gate (sim/README.md
 * "Pass 5"). */
export const HUNT_STAKES_EXP = 0.5;

/**
 * Huntmaster scars (sim pass 6, the late-cycle stall): every Run at Stakes >= the Infamy target
 * that reaches the Huntmaster and still Retreats leaves him a scar for the rest of the cycle, each
 * one -SCAR_STEP to his whole party's attack and HP (max SCAR_MAX). A Crown at the target or a
 * Fall clears them. One Triumph at the target holds the skill gate, so a run of bad luck at the
 * last targets now bends instead of stalling a cycle for a week ("He's limping, Chief").
 */
export const SCAR_STEP = 0.05;
export const SCAR_MAX = 3;
export const scarMult = (scars = 0) => 1 - SCAR_STEP * Math.max(0, Math.min(SCAR_MAX, scars | 0));

/** The Huntmaster bout: 4 beasts drafted at budget rB plus the Huntmaster (HUNT_ATK/HUNT_HP, Armor 2) at the back. */
export function huntmaster(rB: number, S: number, seed: number, pv = PARAMS_VERSION, scars = 0): RivalInfo {
  const arch = pickArch(rB, hashStr('hunt', seed));
  let team = ghostDraft(arch, rB, hashStr('huntdraft', seed, rB));
  team = [...team].sort((x, y) => unitValue(y.k, y.a, y.h, lvlOf(y.xp)) - unitValue(x.k, x.a, x.h, lvlOf(x.xp))).slice(0, 4);
  const rng = mulberry32(hashStr('huntgrow', seed, rB));
  for (let i = 0; i < Math.floor((rB - 1) / 2) && team.length; i++) {
    const t = team[Math.floor(rng() * team.length)];
    t.a++;
    t.h++;
  }
  const m = stakesStat(S, pv);
  const sm = pv < 3 ? 1 : scarMult(scars);
  const line = toFighters(orderLine(team), S, pv, sm);
  const mh = m ** HUNT_STAKES_EXP * sm;
  line.push({ kind: 'hunt', lvl: 1, atk: r5(HUNT_ATK * mh), hp: r5(HUNT_HP * mh), armor: 2 });
  return { arch: 'hunt', line };
}

/** The rival you face next in this Run (the scout shows it). */
export function nextRival(rs: RunState): RivalInfo {
  if (rs.wins >= WINS_TO_TRIUMPH - 1) return huntmaster(rs.huntB || Math.max(rs.round, 8), rs.stakes, rs.seed, rs.pv, rs.opts.scars ?? 0);
  return rival(rs.round, rs.stakes, hashStr('run', rs.seed), rs.pv);
}

// ---------- Teeth (07 §8) ----------

export const payout = (S: number) => 1.22 ** S;

/** Base battle Teeth before Tooth Pliers and the core multiplier. */
export function battleTeeth(r: number, S: number): number {
  return 8 * 1.12 ** (r - 1) * payout(S);
}

/** Showman: run-end bonus per level (07 §6 seed +10%).
 * SIM-TUNED +10% -> +5% (sim/README.md "Pass 5"): Showman is a Run-only multiplier on ~55% of a
 * Run's pay, and Skirmish pay tops out once the Standing Warband clears all 12 Gauntlet rounds, so
 * at +10% x 20 levels a late-cycle reference player read ~6x active : on-screen idle (07 §3 band
 * 2.6-3.8x). */
export const SHOWMAN_STEP = 0.05;

export function runEndBonus(rs: RunState, showman: number): number {
  return 0.5 * rs.wins * battleTeeth(Math.max(1, rs.round), rs.stakes) * (rs.ended === 'triumph' ? 2 : 1) * (1 + SHOWMAN_STEP * showman);
}

// ---------- round resolution ----------

export interface FightOutcome {
  result: BattleResult;
  rival: RivalInfo;
  team: Fighter[];
  outcome: 1 | 0 | -1;
  teeth: number; // base Teeth for this battle (before Pliers / core mult)
  gritLost: boolean;
  hunt: boolean;
  ended: '' | 'triumph' | 'retreat';
  round: number;
}

/**
 * Press FIGHT: end-of-shop triggers, compact the line, battle the scouted rival, apply the result
 * (wins, Grit, Knockout gains) and open the next round's shop unless the Run ended.
 */
export function fight(rs: RunState, log = true): FightOutcome {
  endShop(rs);
  compact(rs);
  const hunt = rs.wins >= WINS_TO_TRIUMPH - 1;
  if (hunt && !rs.huntB) rs.huntB = Math.max(rs.round, 8);
  const riv = nextRival(rs);
  const team = prepareLine(rs.line, rs.opts.hardy);
  const seed = battleSeed(team, riv.line, rs.round, rs.pv);
  const result = battle(team, riv.line, { seed, tactics: tacticsFor(rs.stakes, rs.pv), sigils: rs.opts.sigils, shade: rs.opts.shade, log });
  for (const g of result.koGains) {
    const p = rs.line[g.ref];
    if (p) {
      p.a += g.atk;
      p.h += g.hp;
    }
  }
  const round = rs.round;
  const bt = battleTeeth(round, rs.stakes);
  let teeth = 0;
  let gritLost = false;
  if (result.outcome === 1) {
    rs.wins++;
    teeth = bt;
    rs.lossRun = 0;
  } else if (result.outcome === 0) {
    teeth = 0.7 * bt;
  } else {
    teeth = 0.4 * bt;
    rs.losses++;
    rs.lossRun++;
    // Losses in rounds 1-2 cost no Grit (07 §4); the Huntmaster costs 1 like any loss.
    if (round > 2 || hunt) {
      rs.grit--;
      gritLost = true;
    }
  }
  rs.teeth += teeth;
  if (hunt && result.outcome === 1) rs.ended = 'triumph';
  else if (rs.grit <= 0) rs.ended = 'retreat';
  if (!rs.ended) {
    rs.round++;
    startRound(rs);
  }
  return { result, rival: riv, team, outcome: result.outcome, teeth, gritLost, hunt, ended: rs.ended, round };
}

/** Forfeit: ends the Run as a Retreat with full payout (07 §4). */
export function forfeit(rs: RunState): void {
  if (!rs.ended) rs.ended = 'retreat';
}
