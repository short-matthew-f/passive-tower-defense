// The Mines' upgrade tree (02 §6) as shared-sheet groups: Fist, Crew, Shaft, Drum, Gems.
// Nugget nodes honour the Buy x1 / x10 / MAX mode (02 §15); a mode row tops every tab. The Drum
// and Fist tabs also carry the player's options (drum on/off, tempo, Steady Drum, latency
// calibration, hold-to-auto-hit), since the shared Settings screen has no department slot.
import type { DeptCtx, UpgradeEntry, UpgradeGroup } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { formatNum } from '../../core/format';
import { LONG_MAX, longDesc, longLocked } from '../../core/longnode';
import * as M from './model';

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const f = (x: number) => formatNum(x);

export function maxDepthEverOf(save: DeptSave): number {
  return Math.max(save.lifetime.best.maxDepth ?? 1, (save.run as M.MinesRun).maxDepth ?? 1);
}
export const maxDepthEver = (ctx: DeptCtx) => maxDepthEverOf(ctx.save);

/** A Nugget node's definition: `next(k)` is the price of the k-th purchase from now (k = 0: the
 * next level); `apply()` raises the level by one; `desc(n)` describes buying n levels. */
export interface NugNode {
  id: string;
  name: string;
  max: number;
  level(): number;
  next(k: number): number;
  desc(n: number): string;
  apply(): void;
  locked?(): string | null;
  visible?(): boolean;
  /** Ignores the buy mode (one purchase at a time). */
  single?: boolean;
}

export const BUY_MODES = ['X1', 'X10', 'MAX'];

export interface BuildOpts {
  /** Always buy one level (the balance sim and the Steward). */
  single?: boolean;
}

export interface Hooks {
  onDig(): void;
  onDrum(): void;
  onCalibrate?(): void;
  onBuy?(id: string): void;
}

export function buildGroups(ctx: DeptCtx, hooks: Hooks, opts: BuildOpts = {}): UpgradeGroup[] {
  const r = () => ctx.save.run as M.MinesRun;
  const p = () => ctx.save.persistent as M.MinesPersistent;
  const drumOwned = () => !!p().drum;
  const bones = () => ctx.save.imports?.bones ?? 0;
  M.normalize(ctx.save.run, ctx.save.persistent);

  /** How many levels a buy takes under the current mode, and their total price. */
  const plan = (n: NugNode): { n: number; cost: number } => {
    const left = n.max - n.level();
    if (left <= 0) return { n: 0, cost: n.next(0) };
    const mode = opts.single || n.single ? 0 : p().buyMode;
    if (mode === 0) return { n: 1, cost: n.next(0) };
    if (mode === 1) {
      const k = Math.min(10, left);
      let c = 0;
      for (let i = 0; i < k; i++) c += n.next(i);
      return { n: k, cost: c };
    }
    // MAX: as many as the bank covers (at least one, to show the next price).
    const bank = r().bank;
    let c = n.next(0);
    let k = 1;
    while (k < left && k < 1000) {
      const nc = c + n.next(k);
      if (nc > bank + 1e-9) break;
      c = nc;
      k++;
    }
    return { n: k, cost: c };
  };

  const nug = (n: NugNode): UpgradeEntry => ({
    id: n.id,
    name: n.name,
    max: n.max,
    level: n.level,
    visible: n.visible,
    locked: n.locked,
    cost: () => plan(n).cost,
    desc: () => n.desc(Math.max(1, plan(n).n)),
    canAfford: () => n.level() < n.max && !n.locked?.() && ctx.save.run.bank + 1e-9 >= plan(n).cost,
    buy: () => {
      if (n.level() >= n.max || n.locked?.()) return;
      const { n: k, cost } = plan(n);
      if (ctx.save.run.bank + 1e-9 < cost) return;
      for (let i = 0; i < k && n.level() < n.max; i++) {
        if (!ctx.spend(n.next(0))) break;
        n.apply();
      }
      hooks.onBuy?.(n.id);
    },
  });
  // The label getter must re-read the mode each frame: wrap it in a property.
  const live = (e: UpgradeEntry, n: NugNode): UpgradeEntry => {
    Object.defineProperty(e, 'buyLabel', {
      get: () => (opts.single || n.single || p().buyMode === 0 ? undefined : `+${Math.max(1, plan(n).n)}`),
      enumerable: true,
    });
    return e;
  };
  const N = (n: NugNode) => live(nug(n), n);

  /** A Gem-priced node (persistent; always one level). */
  const gem = (e: { id: string; name: string; max: number; level(): number; cost(): number; desc(): string; apply(): void; locked?(): string | null; visible?(): boolean }): UpgradeEntry => ({
    ...e,
    currency: 'Gems',
    canAfford: () => p().gems + 1e-9 >= e.cost() && e.level() < e.max && !e.locked?.(),
    buy: () => {
      if (e.level() >= e.max || e.locked?.()) return;
      const c = e.cost();
      if (p().gems + 1e-9 < c) return;
      p().gems -= c;
      e.apply();
      hooks.onBuy?.(e.id);
      ctx.saveSoon();
    },
  });

  /** An option row: the button shows its state and tapping changes it. */
  const option = (id: string, name: string, desc: () => string, state: () => string, change: () => void, visible?: () => boolean): UpgradeEntry => ({
    id,
    name,
    max: 1,
    level: () => 0,
    levelText: () => '',
    desc,
    cost: () => 0,
    costText: state,
    buyLabel: 'SET',
    canAfford: () => true,
    buy: () => {
      change();
      ctx.saveSoon();
    },
    visible,
  });

  const header = (id: string, name: string, visible?: () => boolean): UpgradeEntry => ({
    id,
    name,
    header: true,
    max: 0,
    level: () => 0,
    desc: () => '',
    cost: () => 0,
    canAfford: () => false,
    buy: () => {},
    visible,
  });

  const modeRow = (tab: string): UpgradeEntry =>
    option(
      `buymode.${tab}`,
      'Buy amount',
      () => 'CYCLE X1 / X10 / MAX',
      () => BUY_MODES[p().buyMode] ?? 'X1',
      () => (p().buyMode = (p().buyMode + 1) % BUY_MODES.length),
      () => !opts.single,
    );

  const fist: UpgradeEntry[] = [
    modeRow('fist'),
    N({
      id: 'tap',
      name: 'Tap Damage',
      max: Infinity,
      level: () => r().tap,
      next: (k) => M.tapCost(r().tap + k),
      desc: (n) => {
        const L = r().tap;
        const t = M.fistTierMult(r().tier);
        const x2 = Math.floor((L + n) / 25) > Math.floor(L / 25) ? ' X2!' : '';
        return `${f(M.tapDamage(L) * t)} -> ${f(M.tapDamage(L + n) * t)} DMG/TAP${x2}`;
      },
      apply: () => r().tap++,
    }),
    N({
      id: 'critC',
      name: 'Crit Chance',
      max: M.CRIT_C_MAX,
      level: () => r().critC,
      next: (k) => M.critCost(r().critC + k),
      desc: (n) => `CRIT ${pct(M.critChance(r().critC))} -> ${pct(M.critChance(r().critC + n))}`,
      apply: () => r().critC++,
    }),
    N({
      id: 'critP',
      name: 'Crit Power',
      max: M.CRIT_P_MAX,
      level: () => r().critP,
      next: (k) => M.critPowerCost(r().critP + k),
      desc: (n) => `CRITS X${M.critMult(r().critP)} -> X${M.critMult(r().critP + n)}`,
      apply: () => r().critP++,
    }),
    N({
      id: 'keen',
      name: 'Keen Eye',
      max: M.KEEN_MAX,
      level: () => r().keen,
      next: (k) => M.keenCost(r().keen + k),
      desc: (n) => `SHINIES GLINT; YOURS +${(r().keen + n) * 10}%`,
      apply: () => r().keen++,
    }),
    N({
      id: 'knuckles',
      name: 'Heavy Knuckles',
      max: M.KNUCKLES_MAX,
      level: () => r().knuckles,
      next: (k) => M.knucklesCost(r().knuckles + k),
      desc: (n) => `SPLASH ${pct(M.knucklesSplash(r().knuckles))} -> ${pct(M.knucklesSplash(r().knuckles + n))} SHARED`,
      apply: () => r().knuckles++,
    }),
    header('opt.fist', 'Options', () => !opts.single),
    option(
      'holdAuto',
      'Hold to auto-hit',
      () => 'HOLD A ROCK: 4 HITS/S',
      () => (p().holdAuto ? 'ON' : 'OFF'),
      () => (p().holdAuto = !p().holdAuto),
      () => !opts.single,
    ),
  ];

  const hireNode = (id: string, name: string, kind: 'grunts' | 'sappers' | 'shockers' | 'prospectors', mult: number, depth: number, what: string): UpgradeEntry =>
    N({
      id,
      name,
      max: M.MAX_GOBLINS,
      // Bone Miners (Bones import) take crew slots.
      level: () => M.crewSize(r(), bones()),
      next: (k) => mult * 25 * 1.6 ** (M.goblins(r()) + k),
      desc: (n) => (n > 1 ? `+${n} GOBLINS. ${what}` : what),
      locked: () => (depth > 1 && r().maxDepth < depth ? `DEPTH ${depth}` : null),
      apply: () => (r()[kind] = (r()[kind] ?? 0) + 1),
    });

  const crew: UpgradeEntry[] = [
    modeRow('crew'),
    N({
      id: 'hire',
      name: 'Hire Grunt',
      max: M.MAX_GOBLINS,
      level: () => M.crewSize(r(), bones()),
      next: (k) => 25 * 1.6 ** (M.goblins(r()) + k),
      desc: (n) => `+${n} GOBLIN${n > 1 ? 'S' : ''}, ${f(M.goblinDps(M.GRUNT_DPS, r(), p()))} DPS EACH`,
      apply: () => r().grunts++,
    }),
    hireNode('sapper', 'Hire Sapper', 'sappers', 2, M.SAPPER_DEPTH, 'HALF DPS, PLANTS A KEG / 20S'),
    hireNode('shocker', 'Hire Shocker', 'shockers', 3, M.SHOCKER_DEPTH, 'ZAPS 4 ROCKS EVERY 6S'),
    hireNode('prospector', 'Hire Prospector', 'prospectors', 3, M.PROSPECTOR_DEPTH, '+2% ORE VEINS EACH (MAX +10%)'),
    N({
      id: 'picks',
      name: 'Sharper Picks',
      max: M.PICKS_MAX,
      level: () => r().picks,
      next: (k) => M.picksCost(r().picks + k),
      desc: (n) => `CREW DPS X${f(M.picksMult(r().picks))} -> X${f(M.picksMult(r().picks + n))}`,
      apply: () => r().picks++,
    }),
    N({
      id: 'tier',
      name: 'Pick Tier',
      max: M.TIER_MAX,
      level: () => r().tier,
      next: (k) => M.tierCost(r().tier + k),
      desc: (n) => `CREW X2.5 FIST X${M.FIST_TIER}, TO D${M.tierDepth(r().tier + n)}`,
      apply: () => r().tier++,
    }),
  ];

  const shaft: UpgradeEntry[] = [
    modeRow('shaft'),
    N({
      id: 'dig',
      name: 'Dig Deeper',
      max: M.MAX_DEPTH - 1,
      level: () => r().maxDepth - 1,
      next: (k) => M.digCost(r().maxDepth + k),
      desc: (n) => `OPEN DEPTH ${r().maxDepth + n}: RICHER, HARDER`,
      apply: () => {
        r().maxDepth++;
        r().depth = r().maxDepth;
        hooks.onDig();
      },
    }),
    N({
      id: 'seams',
      name: 'Richer Seams',
      max: LONG_MAX,
      level: () => r().seams ?? 0,
      next: (k) => M.seamsCost((r().seams ?? 0) + k),
      desc: () => longDesc(M.SEAMS, r().seams ?? 0),
      locked: () => longLocked(ctx.save.cycle.n),
      apply: () => (r().seams = (r().seams ?? 0) + 1),
    }),
    N({
      id: 'supports',
      name: 'Timber Supports',
      max: M.SUPPORTS_MAX,
      level: () => r().supports,
      next: (k) => M.supportsCost(r().supports + k),
      desc: (n) => `CAVE-INS -${(r().supports + n) * 15}% (FROM D15)`,
      apply: () => r().supports++,
    }),
    N({
      id: 'regrow',
      name: 'Rock Regrowth',
      max: M.REGROW_MAX,
      level: () => r().regrow,
      next: (k) => M.regrowCost(r().regrow + k),
      desc: (n) => `REGROW ${M.regrowTime(r().regrow).toFixed(1)}S -> ${M.regrowTime(r().regrow + n).toFixed(1)}S`,
      apply: () => r().regrow++,
    }),
    N({
      id: 'lanterns',
      name: 'Lanterns',
      max: M.LANTERNS_MAX,
      level: () => r().lanterns,
      next: (k) => M.lanternsCost(r().lanterns + k),
      desc: (n) => `GAS ${M.gasDuration(r().lanterns)}S -> ${M.gasDuration(r().lanterns + n)}S (FROM D${M.GAS_DEPTH})`,
      locked: () => (maxDepthEverOf(ctx.save) < M.GAS_DEPTH - 5 ? `DEPTH ${M.GAS_DEPTH - 5}` : null),
      apply: () => r().lanterns++,
    }),
  ];

  const tempoName = () => M.TEMPO[M.tempoOf(p())].name;
  const drum: UpgradeEntry[] = [
    gem({
      id: 'drum',
      name: 'Doom Drum',
      max: 1,
      level: () => (p().drum ? 1 : 0),
      cost: () => M.DRUM_GEMS,
      desc: () => (p().drum ? 'BOOM. KEPT THROUGH FALLS' : 'TAP ON THE BEAT: X2 DAMAGE'),
      locked: () => (maxDepthEver(ctx) < M.DRUM_DEPTH ? `DEPTH ${M.DRUM_DEPTH}` : null),
      apply: () => {
        p().drum = true;
        p().drumOn = true;
        hooks.onDrum();
      },
    }),
    option(
      'drumOn',
      'Drum',
      () => 'OFF: NO RINGS, NOTHING LOST',
      () => (p().drumOn ? 'ON' : 'OFF'),
      () => (p().drumOn = !p().drumOn),
      () => drumOwned() && !opts.single,
    ),
    { ...modeRow('drum'), visible: () => drumOwned() && !opts.single },
    N({
      id: 'drumhead',
      name: 'Drumhead',
      max: M.DRUMHEAD_MAX,
      level: () => r().drumhead,
      next: (k) => M.drumheadCost(r().drumhead + k),
      desc: (n) => `BEAT HIT X${M.beatMult(r().drumhead).toFixed(1)} -> X${M.beatMult(r().drumhead + n).toFixed(1)}`,
      visible: drumOwned,
      apply: () => r().drumhead++,
    }),
    N({
      id: 'wide',
      name: 'Wide Swing',
      max: M.WIDE_MAX,
      level: () => r().wide,
      next: (k) => M.wideCost(r().wide + k),
      desc: (n) => `BEAT WINDOW ${Math.round(M.beatWindow(r().wide) * 1000)} -> ${Math.round(M.beatWindow(r().wide + n) * 1000)}MS`,
      visible: drumOwned,
      apply: () => r().wide++,
    }),
    N({
      id: 'frenzy',
      name: 'Goblin Frenzy',
      max: M.FRENZY_MAX,
      level: () => r().frenzy,
      next: (k) => M.frenzyCost(r().frenzy + k),
      desc: (n) => {
        const L = r().frenzy;
        if (L === 0) return `${M.frenzyPips(1)} BEAT HITS: FRENZY! TAPS X2`;
        if (L + n <= 4) return `FRENZY PIPS ${M.frenzyPips(L)} -> ${M.frenzyPips(L + n)}`;
        return `FRENZY TAPS X${M.frenzyTapMult(L)} -> X${M.frenzyTapMult(Math.min(M.FRENZY_MAX, L + n))}`;
      },
      visible: drumOwned,
      apply: () => r().frenzy++,
    }),
    N({
      id: 'fuse',
      name: 'Frenzy Fuse',
      max: M.FUSE_MAX,
      level: () => r().fuse,
      next: (k) => M.fuseCost(r().fuse + k),
      desc: (n) => `FRENZY ${M.frenzyBase(r().fuse)}S -> ${M.frenzyBase(r().fuse + n)}S`,
      visible: drumOwned,
      locked: () => (r().frenzy < 1 ? 'FRENZY 1' : null),
      apply: () => r().fuse++,
    }),
    N({
      id: 'whip',
      name: "Gritch's Whip",
      max: M.WHIP_MAX,
      level: () => r().whip,
      next: (k) => M.whipCost(r().whip + k),
      desc: (n) => `FRENZY CREW +${r().whip * 10}% -> +${(r().whip + n) * 10}%`,
      visible: drumOwned,
      locked: () => (r().frenzy < 1 ? 'FRENZY 1' : null),
      apply: () => r().whip++,
    }),
    N({
      id: 'drummers',
      name: 'Drummer Goblins',
      max: M.DRUMMERS_MAX,
      level: () => r().drummers,
      next: (k) => M.drummerCost(r().drummers + k),
      desc: (n) => `CREW +${r().drummers * 8}% -> +${(r().drummers + n) * 8}%, IDLE TOO`,
      visible: drumOwned,
      apply: () => r().drummers++,
    }),
    N({
      id: 'steadyH',
      name: 'Steady Hands',
      max: M.STEADY_MAX,
      level: () => r().steadyH,
      next: (k) => M.steadyCost(r().steadyH + k),
      desc: (n) => `FORGIVE ${r().steadyH + n} MISS/STREAK, PIPS ${M.pipDecayS(r().steadyH + n)}S`,
      visible: drumOwned,
      apply: () => r().steadyH++,
    }),
    N({
      id: 'encore',
      name: 'Encore',
      max: M.ENCORE_MAX,
      level: () => r().encore,
      next: (k) => M.encoreCost(r().encore + k),
      desc: (n) => `AFTER FRENZY: CREW X1.25 FOR ${M.encoreDur(r().encore + n)}S`,
      visible: () => drumOwned() && r().frenzy > 0 && r().drummers > 0,
      apply: () => r().encore++,
    }),
    gem({
      id: 'thunder',
      name: 'Thunder Beat',
      max: M.THUNDER_MAX,
      level: () => p().thunder,
      cost: () => M.thunderCost(p().thunder),
      desc: () => `EVERY 16TH BEAT ZAPS, +${p().thunder + 1} JUMP${p().thunder ? 'S' : ''}`,
      visible: drumOwned,
      apply: () => p().thunder++,
    }),
    gem({
      id: 'tempoL',
      name: 'Tempo Lever',
      max: M.TEMPO_MAX,
      level: () => p().tempoL,
      cost: () => M.tempoCost(p().tempoL),
      desc: () => (p().tempoL === 0 ? 'UNLOCK STOMP: SLOW, WIDE' : 'UNLOCK CHARGE: FAST, HARD'),
      visible: drumOwned,
      apply: () => p().tempoL++,
    }),
    header('opt.drum', 'Drum options', () => drumOwned() && !opts.single),
    option(
      'tempo',
      'Tempo',
      () => {
        const t = M.TEMPO[M.tempoOf(p())];
        return t.mult === 0 ? 'STRATUM TEMPO' : `BEAT X${(1 / t.period).toFixed(2)} SPEED, ${t.mult > 0 ? '+' : ''}${t.mult} MULT`;
      },
      tempoName,
      () => {
        const opts2 = M.TEMPO_ORDER.slice(0, p().tempoL + 1);
        const i = opts2.indexOf(M.tempoOf(p()));
        p().tempo = opts2[(i + 1) % opts2.length];
      },
      () => drumOwned() && p().tempoL > 0 && !opts.single,
    ),
    option(
      'steady',
      'Steady Drum',
      () => 'WINDOW X2, EDGE PULSE',
      () => (p().steady ? 'ON' : 'OFF'),
      () => (p().steady = !p().steady),
      () => drumOwned() && !opts.single,
    ),
    option(
      'calibrate',
      'Calibrate',
      () => `TAP WITH THE BOOM X8 (${Math.round(p().latency * 1000)}MS)`,
      () => 'START',
      () => hooks.onCalibrate?.(),
      () => drumOwned() && !opts.single,
    ),
  ];

  const gems: UpgradeEntry[] = [
    gem({
      id: 'chain',
      name: 'Chain Lightning',
      max: M.CHAIN_MAX,
      level: () => p().chain,
      cost: () => M.chainCost(p().chain),
      desc: () => `ZAP ${pct(M.chainChance(p().chain))} -> ${pct(M.chainChance(p().chain + 1))} OF TAPS`,
      apply: () => p().chain++,
    }),
    gem({
      id: 'powder',
      name: 'Blasting Powder',
      max: M.POWDER_MAX,
      level: () => p().powder,
      cost: () => M.powderCost(p().powder),
      desc: () => `KEGS ${pct(M.kegP(p().powder))}, BLAST X${M.blastMult(p().powder)} -> X${M.blastMult(p().powder + 1)}`,
      apply: () => p().powder++,
    }),
    gem({
      id: 'magma',
      name: 'Magma Pick',
      max: M.MAGMA_MAX,
      level: () => p().magma,
      cost: () => M.magmaCost(p().magma),
      desc: () => `TAPS BURN 20%/S FOR ${M.magmaDur(p().magma + 1)}S`,
      apply: () => p().magma++,
    }),
    gem({
      id: 'echo',
      name: 'Echo Strike',
      max: M.ECHO_MAX,
      level: () => p().echo,
      cost: () => M.echoCost(p().echo),
      desc: () => `TAPS REPEAT ${pct(M.echoChance(p().echo))} -> ${pct(M.echoChance(p().echo + 1))}`,
      apply: () => p().echo++,
    }),
    gem({
      id: 'lucky',
      name: 'Lucky Rocks',
      max: M.LUCKY_MAX,
      level: () => p().lucky,
      cost: () => M.luckyCost(p().lucky),
      desc: () => `GEM CHANCE ${pct(M.gemChance(p().lucky))} -> ${pct(M.gemChance(p().lucky + 1))}`,
      apply: () => p().lucky++,
    }),
  ];

  return [
    { name: 'Fist', entries: fist },
    { name: 'Crew', entries: crew },
    { name: 'Shaft', entries: shaft },
    { name: 'Drum', entries: drum, bank: () => ({ text: `${f(ctx.save.run.bank)} NUGGETS  ${f(p().gems)} GEMS`, color: '#e8c04a' }) },
    { name: 'Gems', entries: gems, bank: () => ({ text: `${f(p().gems)} GEMS`, color: '#d090ff' }) },
  ];
}

/** True if any visible, unlocked Nugget or Gem node is affordable (for the "!" on the button). */
export function anyAffordable(groups: UpgradeGroup[]): boolean {
  for (const g of groups)
    for (const e of g.entries) {
      if (e.header || e.costText) continue; // section labels and option rows
      if (e.visible && !e.visible()) continue;
      if (e.locked?.()) continue;
      if (e.level() < e.max && e.canAfford()) return true;
    }
  return false;
}
