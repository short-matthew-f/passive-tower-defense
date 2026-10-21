// The Mines' upgrade tree (02 §6) as shared-sheet groups: Fist, Crew, Shaft, Drum, Gems.
import type { DeptCtx, UpgradeEntry, UpgradeGroup } from '../../core/dept';
import { formatNum } from '../../core/format';
import { LONG_MAX, longDesc, longLocked } from '../../core/longnode';
import * as M from './model';

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const f = (x: number) => formatNum(x);

export function maxDepthEver(ctx: DeptCtx): number {
  return Math.max(ctx.save.lifetime.best.maxDepth ?? 1, (ctx.save.run as M.MinesRun).maxDepth);
}

/** A Nugget-priced node. */
function nug(ctx: DeptCtx, e: Omit<UpgradeEntry, 'canAfford' | 'buy'> & { apply(): void }): UpgradeEntry {
  return {
    ...e,
    canAfford: () => ctx.save.run.bank >= e.cost() && e.level() < e.max,
    buy: () => {
      if (e.level() >= e.max || e.locked?.()) return;
      if (ctx.spend(e.cost())) e.apply();
    },
  };
}

/** A Gem-priced node (persistent). */
function gem(ctx: DeptCtx, e: Omit<UpgradeEntry, 'canAfford' | 'buy' | 'currency'> & { apply(): void }): UpgradeEntry {
  const p = () => ctx.save.persistent as M.MinesPersistent;
  return {
    ...e,
    currency: 'Gems',
    canAfford: () => p().gems >= e.cost() && e.level() < e.max,
    buy: () => {
      if (e.level() >= e.max || e.locked?.()) return;
      const c = e.cost();
      if (p().gems + 1e-9 < c) return;
      p().gems -= c;
      e.apply();
      ctx.saveSoon();
    },
  };
}

export function buildGroups(ctx: DeptCtx, hooks: { onDig(): void; onDrum(): void }): UpgradeGroup[] {
  const r = () => ctx.save.run as M.MinesRun;
  const p = () => ctx.save.persistent as M.MinesPersistent;
  const drumOwned = () => p().drum;

  const fist: UpgradeEntry[] = [
    nug(ctx, {
      id: 'tap',
      name: 'Tap Damage',
      max: Infinity,
      level: () => r().tap,
      cost: () => M.tapCost(r().tap),
      desc: () => {
        const L = r().tap;
        const next = (L + 1) % 25 === 0 ? ' X2!' : '';
        const t = M.fistTierMult(r().tier);
        return `${f(M.tapDamage(L) * t)} -> ${f(M.tapDamage(L + 1) * t)} DMG/TAP${next}`;
      },
      apply: () => r().tap++,
    }),
    nug(ctx, {
      id: 'critC',
      name: 'Crit Chance',
      max: M.CRIT_C_MAX,
      level: () => r().critC,
      cost: () => M.critCost(r().critC),
      desc: () => `CRIT ${pct(M.critChance(r().critC))} -> ${pct(M.critChance(r().critC + 1))}`,
      apply: () => {
        r().critC++;
        if (!ctx.seen('m.critBuy')) {
          ctx.markSeen('m.critBuy');
          ctx.say('critBuy', { milestone: true });
        }
      },
    }),
    nug(ctx, {
      id: 'critP',
      name: 'Crit Power',
      max: M.CRIT_P_MAX,
      level: () => r().critP,
      cost: () => M.critPowerCost(r().critP),
      desc: () => `CRITS X${M.critMult(r().critP)} -> X${M.critMult(r().critP + 1)}`,
      apply: () => r().critP++,
    }),
    nug(ctx, {
      id: 'keen',
      name: 'Keen Eye',
      max: M.KEEN_MAX,
      level: () => r().keen,
      cost: () => M.keenCost(r().keen),
      desc: () => `YOUR VEIN/GEODE BREAKS +${(r().keen + 1) * 10}%`,
      apply: () => r().keen++,
    }),
  ];

  const crew: UpgradeEntry[] = [
    nug(ctx, {
      id: 'hire',
      name: 'Hire Grunt',
      max: M.MAX_GOBLINS,
      // Bone Miners (Bones import) take crew slots.
      level: () => M.crewSize(r(), ctx.save.imports?.bones ?? 0),
      cost: () => M.hireCost(r()),
      desc: () => `+1 GOBLIN, ${f(M.goblinDps(M.GRUNT_DPS, r(), p()))} DPS`,
      apply: () => r().grunts++,
    }),
    nug(ctx, {
      id: 'sapper',
      name: 'Hire Sapper',
      max: M.MAX_GOBLINS,
      level: () => M.crewSize(r(), ctx.save.imports?.bones ?? 0),
      cost: () => M.sapperCost(r()),
      desc: () => 'HALF DPS, PLANTS A KEG / 20S',
      locked: () => (r().maxDepth < M.SAPPER_DEPTH ? `DEPTH ${M.SAPPER_DEPTH}` : null),
      apply: () => r().sappers++,
    }),
    nug(ctx, {
      id: 'picks',
      name: 'Sharper Picks',
      max: M.PICKS_MAX,
      level: () => r().picks,
      cost: () => M.picksCost(r().picks),
      desc: () => `CREW DPS X1.18 (NOW X${f(M.picksMult(r().picks))})`,
      apply: () => r().picks++,
    }),
    nug(ctx, {
      id: 'tier',
      name: 'Pick Tier',
      max: M.TIER_MAX,
      level: () => r().tier,
      cost: () => M.tierCost(r().tier),
      desc: () => `CREW X2.5 FIST X${M.FIST_TIER}, TO D${M.tierDepth(r().tier + 1)}`,
      apply: () => r().tier++,
    }),
  ];

  const shaft: UpgradeEntry[] = [
    nug(ctx, {
      id: 'dig',
      name: 'Dig Deeper',
      max: M.MAX_DEPTH - 1,
      level: () => r().maxDepth - 1,
      cost: () => M.digCost(r().maxDepth),
      desc: () => `OPEN DEPTH ${r().maxDepth + 1}: RICHER, HARDER`,
      apply: () => {
        r().maxDepth++;
        r().depth = r().maxDepth;
        hooks.onDig();
      },
    }),
    nug(ctx, {
      id: 'seams',
      name: 'Richer Seams',
      max: LONG_MAX,
      level: () => r().seams ?? 0,
      cost: () => M.seamsCost(r().seams ?? 0),
      desc: () => longDesc(M.SEAMS, r().seams ?? 0),
      locked: () => longLocked(ctx.save.cycle.n),
      apply: () => (r().seams = (r().seams ?? 0) + 1),
    }),
    nug(ctx, {
      id: 'supports',
      name: 'Timber Supports',
      max: M.SUPPORTS_MAX,
      level: () => r().supports,
      cost: () => M.supportsCost(r().supports),
      desc: () => `CAVE-INS -${(r().supports + 1) * 15}% (FROM D15)`,
      apply: () => r().supports++,
    }),
    nug(ctx, {
      id: 'regrow',
      name: 'Rock Regrowth',
      max: M.REGROW_MAX,
      level: () => r().regrow,
      cost: () => M.regrowCost(r().regrow),
      desc: () => `REGROW ${M.regrowTime(r().regrow).toFixed(1)}S -> ${M.regrowTime(r().regrow + 1).toFixed(1)}S`,
      apply: () => r().regrow++,
    }),
  ];

  const drum: UpgradeEntry[] = [
    gem(ctx, {
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
    nug(ctx, {
      id: 'drumhead',
      name: 'Drumhead',
      max: M.DRUMHEAD_MAX,
      level: () => r().drumhead,
      cost: () => M.drumheadCost(r().drumhead),
      desc: () => `BEAT HIT X${M.beatMult(r().drumhead).toFixed(1)} -> X${M.beatMult(r().drumhead + 1).toFixed(1)}`,
      visible: drumOwned,
      apply: () => r().drumhead++,
    }),
    nug(ctx, {
      id: 'wide',
      name: 'Wide Swing',
      max: M.WIDE_MAX,
      level: () => r().wide,
      cost: () => M.wideCost(r().wide),
      desc: () => `BEAT WINDOW ${Math.round(M.beatWindow(r().wide) * 1000)} -> ${Math.round(M.beatWindow(r().wide + 1) * 1000)}MS`,
      visible: drumOwned,
      apply: () => r().wide++,
    }),
    nug(ctx, {
      id: 'frenzy',
      name: 'Goblin Frenzy',
      max: M.FRENZY_MAX,
      level: () => r().frenzy,
      cost: () => M.frenzyCost(r().frenzy),
      desc: () => {
        const L = r().frenzy;
        if (L === 0) return `${M.frenzyPips(1)} BEAT HITS: FRENZY! TAPS X2`;
        if (L < 4) return `FRENZY PIPS ${M.frenzyPips(L)} -> ${M.frenzyPips(L + 1)}`;
        return `FRENZY TAPS X${M.frenzyTapMult(L)} -> X${M.frenzyTapMult(L + 1)}`;
      },
      visible: drumOwned,
      apply: () => r().frenzy++,
    }),
    nug(ctx, {
      id: 'fuse',
      name: 'Frenzy Fuse',
      max: M.FUSE_MAX,
      level: () => r().fuse,
      cost: () => M.fuseCost(r().fuse),
      desc: () => `FRENZY ${M.frenzyBase(r().fuse)}S -> ${M.frenzyBase(r().fuse + 1)}S`,
      visible: drumOwned,
      locked: () => (r().frenzy < 1 ? 'FRENZY 1' : null),
      apply: () => r().fuse++,
    }),
    nug(ctx, {
      id: 'drummers',
      name: 'Drummer Goblins',
      max: M.DRUMMERS_MAX,
      level: () => r().drummers,
      cost: () => M.drummerCost(r().drummers),
      desc: () => `+8% CREW DPS, IDLE TOO (+${r().drummers * 8}%)`,
      visible: drumOwned,
      apply: () => r().drummers++,
    }),
  ];

  const gems: UpgradeEntry[] = [
    gem(ctx, {
      id: 'chain',
      name: 'Chain Lightning',
      max: M.CHAIN_MAX,
      level: () => p().chain,
      cost: () => M.chainCost(p().chain),
      desc: () => `ZAP ${pct(M.chainChance(p().chain))} -> ${pct(M.chainChance(p().chain + 1))} OF TAPS`,
      apply: () => p().chain++,
    }),
    gem(ctx, {
      id: 'powder',
      name: 'Blasting Powder',
      max: M.POWDER_MAX,
      level: () => p().powder,
      cost: () => M.powderCost(p().powder),
      desc: () => `KEGS ${pct(M.kegP(p().powder))}, BLAST X${M.blastMult(p().powder)} -> X${M.blastMult(p().powder + 1)}`,
      apply: () => p().powder++,
    }),
    gem(ctx, {
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
    { name: 'Drum', entries: drum },
    { name: 'Gems', entries: gems },
  ];
}

/** True if any visible, unlocked Nugget or Gem node is affordable (for the "!" on the button). */
export function anyAffordable(groups: UpgradeGroup[]): boolean {
  for (const g of groups)
    for (const e of g.entries) {
      if (e.visible && !e.visible()) continue;
      if (e.locked?.()) continue;
      if (e.level() < e.max && e.canAfford()) return true;
    }
  return false;
}
