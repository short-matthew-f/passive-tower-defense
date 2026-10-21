// The War Pit upgrade tree (07 §6) as shared-sheet groups: Pens, Spoils, Kennels (Teeth) and the
// Bestiary (Crests, persistent: the 6 ★ beasts and the Pedigrees). Stakes live on the home panel.
import type { DeptCtx, UpgradeEntry, UpgradeGroup } from '../../core/dept';
import { PEDIGREES, UPGRADES, lvOf, upCost, type PitPersistent, type PitRun, type UpDef } from './def';
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
    canAfford: () => lvOf(r(), u.id) < u.max && r().bank >= upCost(u, lvOf(r(), u.id)),
    buy: () => {
      const l = lvOf(r(), u.id);
      if (l >= u.max) return;
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

  return [
    { name: 'Pens', entries: branch('pens') },
    { name: 'Spoils', entries: branch('spoils') },
    { name: 'Kennels', entries: branch('kennels') },
    { name: 'Crests', entries: [...beasts, ...peds] },
  ];
}

export function anyAffordable(groups: UpgradeGroup[]): boolean {
  return groups.some((g) => g.entries.some((e) => e.level() < e.max && !e.locked?.() && e.canAfford()));
}
