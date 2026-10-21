// The Dungeon's global research (01 §6B Workshop) and the Rumor Mill (Lure tiers, §7) as
// shared-sheet groups. Per-piece levels live in the scene's tray panel instead.
import type { DeptCtx, UpgradeEntry, UpgradeGroup } from '../../core/dept';
import { formatNum } from '../../core/format';
import { longDesc, longLocked } from '../../core/longnode';
import { FLOORS } from './map';
import * as M from './model';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface UpgradeHooks {
  changed(): void; // layout-affecting change (rebuild the sim, bump rev)
  lureBought(): void;
  /** Travel to floor f (bought or owned). */
  floor?(f: number): void;
}

export function buildGroups(ctx: DeptCtx, hooks: UpgradeHooks): UpgradeGroup[] {
  const r = () => ctx.save.run as M.DungeonRun;

  const ws = (k: keyof M.Workshop, desc: (n: number) => string, locked?: () => string | null): UpgradeEntry => ({
    id: k,
    name: M.WS[k].name,
    max: M.WS[k].max,
    level: () => r().ws[k] ?? 0,
    cost: () => M.wsCost(k, r().ws[k] ?? 0),
    desc: () => desc(r().ws[k] ?? 0),
    locked,
    canAfford: () => r().bank >= M.wsCost(k, r().ws[k] ?? 0) && (r().ws[k] ?? 0) < M.WS[k].max,
    buy: () => {
      const n = r().ws[k] ?? 0;
      if (n >= M.WS[k].max || locked?.()) return;
      if (!ctx.spend(M.wsCost(k, n))) return;
      r().ws[k] = n + 1;
      hooks.changed();
    },
  });

  const workshop: UpgradeEntry[] = [
    ws('whet', (n) => `TOWER DMG +${pct(0.05 * n)} -> +${pct(0.05 * (n + 1))}`),
    ws('necro', (n) => `MINION HP/DMG +${pct(0.08 * n)} -> +${pct(0.08 * (n + 1))}`),
    ws('insc', (n) => `RUNE POWER +${pct(0.06 * n)} -> +${pct(0.06 * (n + 1))}`),
    ws('ledger', (n) => `PLUNDER +${pct(0.04 * n)} -> +${pct(0.04 * (n + 1))}`),
    ws('gaze', (n) => `GLARE +${pct(0.2 * (n + 1))} DMG, ${M.glareCooldown({ ...r().ws, gaze: n + 1 })}S COOLDOWN`),
    ws('slots', (n) => `RUNE SLOTS ${3 + n} -> ${4 + n}`),
    ws('greed', (n) => longDesc(M.GREED, n), () => longLocked(ctx.save.cycle.n)),
  ];

  const lure: UpgradeEntry = {
    id: 'lure',
    name: 'Spread Rumors',
    max: M.MAX_LURE,
    level: () => r().lureMax,
    cost: () => M.lureCost(r().lureMax + 1),
    desc: () => {
      const T = r().lureMax + 1;
      const nh = M.NEW_HERO_AT[T];
      const unlock = nh ? ` ${M.HEROES[nh].name.toUpperCase()}S!` : T === M.CHAMP_LURE ? ' CHAMPIONS!' : '';
      return `LURE ${T}: HP X${formatNum(M.hpScale(T))} {coin}X${formatNum(M.bountyScale(T))}${unlock}`;
    },
    canAfford: () => r().lureMax < M.MAX_LURE && r().bank >= M.lureCost(r().lureMax + 1),
    buy: () => {
      if (r().lureMax >= M.MAX_LURE) return;
      if (!ctx.spend(M.lureCost(r().lureMax + 1))) return;
      r().lureMax++;
      r().lure = r().lureMax;
      hooks.lureBought();
    },
  };

  // Floors (01 §6D): bought once, kept across Falls; one active at a time, each with its own layout.
  const per = () => ctx.save.persistent as M.DungeonPersistent;
  const floors: UpgradeEntry[] = FLOORS.map((f, i) => {
    const owned = () => (per().floors ?? 1) > i;
    return {
      id: `floor${i}`,
      name: f.name,
      max: 1,
      maxLabel: 'HERE',
      level: () => (r().floor === i ? 1 : 0),
      levelText: () => (r().floor === i ? 'ACTIVE' : owned() ? 'OPEN' : ''),
      cost: () => (owned() ? 0 : f.cost),
      costText: () => (owned() ? 'FREE' : formatNum(f.cost)),
      get buyLabel() {
        return owned() ? 'GO' : 'BUY';
      },
      desc: () => (i === 0 ? 'THE FIRST FLOOR. 2 LOOPS' : `{coin}X${f.bounty} BOUNTY, LONGER PATH${i === 2 ? ', WATER' : ', 3 LOOPS'}`),
      locked: () => (!owned() && (per().floors ?? 1) < i ? `${FLOORS[i - 1].short} FIRST` : null),
      canAfford: () => owned() || r().bank >= f.cost,
      buy: () => {
        if (r().floor === i) return;
        if (!owned()) {
          if ((per().floors ?? 1) !== i || !ctx.spend(f.cost)) return;
          per().floors = i + 1;
        }
        hooks.floor?.(i);
      },
    } as UpgradeEntry;
  });

  return [
    { name: 'Workshop', entries: workshop },
    { name: 'Rumor Mill', entries: [lure] },
    { name: 'Floors', entries: floors },
  ];
}

export function anyAffordable(groups: UpgradeGroup[]): boolean {
  return groups.some((g) => g.entries.some((e) => (e.visible?.() ?? true) && !e.locked?.() && e.canAfford()));
}
