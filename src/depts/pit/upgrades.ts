// The War Pit upgrade tree (07 §6) as shared-sheet groups: Pens, Spoils, Kennels (Teeth) and the
// Bestiary (Crests, persistent: the 6 ★ beasts and the Pedigrees). Stakes live on the home panel.
import type { DeptCtx, UpgradeEntry, UpgradeGroup } from '../../core/dept';
import { PEDIGREES, SKINS, UPGRADES, lvOf, skinsOwned, upCost, upLocked, type PitPersistent, type PitRun, type UpDef } from './def';
import { BESTIARY, UNITS } from './units';

export interface Hooks {
  onBuy(id: string): void;
}

export function buildGroups(ctx: DeptCtx, hooks: Hooks): UpgradeGroup[] {
  const r = () => ctx.save.run as PitRun;
  const p = () => ctx.save.persistent as PitPersistent;
  const node = (u: UpDef): UpgradeEntry => ({
    id: u.id,
    name: u.name,
    desc: () => u.desc(lvOf(r(), u.id)),
    max: u.max,
    level: () => lvOf(r(), u.id),
    cost: () => upCost(u, lvOf(r(), u.id)),
    locked: () => upLocked(u, ctx.save.cycle.n),
    canAfford: () => lvOf(r(), u.id) < u.max && r().bank >= upCost(u, lvOf(r(), u.id)),
    buy: () => {
      const l = lvOf(r(), u.id);
      if (l >= u.max || upLocked(u, ctx.save.cycle.n)) return;
      if (ctx.spend(upCost(u, l))) {
        r().lv[u.id] = l + 1;
        hooks.onBuy(u.id);
      }
    },
  });
  const branch = (b: UpDef['branch']) => UPGRADES.filter((u) => u.branch === b).map(node);

  const crest = (id: string, name: string, cost: () => number, max: number, level: () => number, desc: () => string, apply: () => void): UpgradeEntry => ({
    id,
    name,
    desc,
    max,
    level,
    cost,
    currency: 'Crests',
    canAfford: () => level() < max && p().crests >= cost(),
    buy: () => {
      if (level() >= max || p().crests < cost()) return;
      p().crests -= cost();
      apply();
      hooks.onBuy(id);
    },
  });

  const beasts = BESTIARY.map((k) =>
    crest(
      `beast.${k}`,
      `${UNITS[k].name} T${UNITS[k].tier}`,
      () => UNITS[k].crests!,
      1,
      () => (p().beasts.includes(k) ? 1 : 0),
      () => UNITS[k].text(1),
      () => p().beasts.push(k),
    ),
  );
  const peds = PEDIGREES.map((pd) =>
    crest(
      `ped.${pd.id}`,
      pd.name,
      () => pd.cost,
      pd.max,
      () => p().ped[pd.id] ?? 0,
      () => pd.text,
      () => (p().ped[pd.id] = (p().ped[pd.id] ?? 0) + 1),
    ),
  );

  const header = (id: string, name: string): UpgradeEntry => ({ id, name, header: true, desc: () => '', level: () => 0, max: 1, cost: () => 0, canAfford: () => false, buy: () => {} });
  // Beast coats (07 §6D repeatable sink): bought per beast from the Standing Warband (tap a beast
  // twice at home); this row only counts them.
  const coats: UpgradeEntry = {
    id: 'crests.coats',
    name: 'Beast Coats',
    desc: () => 'Tap a Standing beast twice to dress it',
    level: () => skinsOwned(p()),
    levelText: () => `${skinsOwned(p())} owned`,
    max: Infinity,
    cost: () => 3,
    currency: 'Crests',
    costText: () => '3 EACH',
    buyLabel: 'HOME',
    canAfford: () => false,
    buy: () => {},
  };
  void SKINS;
  return [
    { name: 'Pens', entries: branch('pens') },
    { name: 'Spoils', entries: branch('spoils') },
    { name: 'Kennels', entries: branch('kennels') },
    { name: 'Crests', entries: [header('crests.beasts', 'BESTIARY'), ...beasts, header('crests.peds', 'PEDIGREES'), ...peds, coats] },
  ];
}

export function anyAffordable(groups: UpgradeGroup[]): boolean {
  return groups.some((g) => g.entries.some((e) => e.level() < e.max && !e.locked?.() && e.canAfford()));
}
