// The Dungeon's global research (01 §6B Workshop) and the Rumor Mill (Lure tiers, §7) as
// shared-sheet groups. Per-piece levels live in the scene's tray panel instead.
import type { DeptCtx, UpgradeEntry, UpgradeGroup } from '../../core/dept';
import { formatNum } from '../../core/format';
import * as M from './model';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface UpgradeHooks {
  changed(): void; // layout-affecting change (rebuild the sim, bump rev)
  lureBought(): void;
}

export function buildGroups(ctx: DeptCtx, hooks: UpgradeHooks): UpgradeGroup[] {
  const r = () => ctx.save.run as M.DungeonRun;

  const ws = (k: keyof M.Workshop, desc: (n: number) => string): UpgradeEntry => ({
    id: k,
    name: M.WS[k].name,
    max: M.WS[k].max,
    level: () => r().ws[k],
    cost: () => M.wsCost(k, r().ws[k]),
    desc: () => desc(r().ws[k]),
    canAfford: () => r().bank >= M.wsCost(k, r().ws[k]) && r().ws[k] < M.WS[k].max,
    buy: () => {
      const n = r().ws[k];
      if (n >= M.WS[k].max) return;
      if (!ctx.spend(M.wsCost(k, n))) return;
      r().ws[k]++;
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
  ];

  const lure: UpgradeEntry = {
    id: 'lure',
    name: 'Spread Rumors',
    max: M.MAX_LURE,
    level: () => r().lureMax,
    cost: () => M.lureCost(r().lureMax + 1),
    desc: () => {
      const T = r().lureMax + 1;
      const unlock = T === M.ROGUE_LURE ? ' ROGUES!' : T === M.KNIGHT_LURE ? ' KNIGHTS!' : T === M.CHAMP_LURE ? ' CHAMPIONS!' : '';
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

  return [
    { name: 'Workshop', entries: workshop },
    { name: 'Rumor Mill', entries: [lure] },
  ];
}

export function anyAffordable(groups: UpgradeGroup[]): boolean {
  return groups.some((g) => g.entries.some((e) => (e.visible?.() ?? true) && !e.locked?.() && e.canAfford()));
}
