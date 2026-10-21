// The Styx upgrade tree (03 §6) as shared-sheet groups: Line & Reel, Lures, Imp Crew, Bait.
// Wrath lives on the dock (in-scene dial), not here.
import type { DeptCtx, UpgradeEntry, UpgradeGroup } from '../../core/dept';
import { longDesc, longLocked } from '../../core/longnode';
import * as M from './model';

export interface Hooks {
  onBuy(id: string): void;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function buildGroups(ctx: DeptCtx, hooks: Hooks): UpgradeGroup[] {
  const r = () => ctx.save.run as M.StyxRun;
  const p = () => ctx.save.persistent as M.StyxPersistent;
  const node = (id: M.NodeId, name: string, desc: (l: number) => string, locked?: () => string | null): UpgradeEntry => ({
    id,
    name,
    desc: () => desc(r().lv[id] ?? 0),
    max: M.NODES[id].max,
    locked,
    level: () => r().lv[id] ?? 0,
    cost: () => M.nodeCost(id, r().lv[id] ?? 0),
    canAfford: () => (r().lv[id] ?? 0) < M.NODES[id].max && r().bank >= M.nodeCost(id, r().lv[id] ?? 0),
    buy: () => {
      const L = r().lv[id] ?? 0;
      if (L >= M.NODES[id].max || locked?.()) return;
      if (ctx.spend(M.nodeCost(id, L))) {
        r().lv[id] = L + 1;
        hooks.onBuy(id);
      }
    },
  });

  const line: UpgradeEntry[] = [
    node('reel', 'Reel Speed', (l) => `REEL ${M.reelSpeed(l).toFixed(1)} -> ${M.reelSpeed(l + 1).toFixed(1)} PX/S`),
    node('line', 'Braided Sinew Line', (l) => `TENSION CAP ${pct(M.lineCap(l))} -> ${pct(M.lineCap(l + 1))}`),
    node('steady', 'Steady Hand', (l) => `EASE-OFF DRAIN ${Math.round(M.drainRate(l))} -> ${Math.round(M.drainRate(l + 1))}%/S`),
    node('strike', 'Quick Strike', (l) => `HOOK WINDOW ${600 + 40 * l} -> ${640 + 40 * l} MS`),
    node('barb', 'Barbed Hook', (l) => `SLIP BECOMES LAND ${pct(M.barbChance(l))} -> ${pct(M.barbChance(l + 1))}`),
  ];

  const deeper: UpgradeEntry = {
    id: 'deeper',
    name: 'Deeper Cast',
    max: M.MAX_BANDS - 1,
    level: () => r().bands - 1,
    cost: () => M.BANDS[Math.min(M.MAX_BANDS - 1, r().bands)].cost,
    desc: () => (r().bands < M.MAX_BANDS ? `OPENS THE ${M.BANDS[r().bands].name} (X${M.BANDS[r().bands].mult} SOULS)` : 'EVERY DEPTH IS OPEN'),
    canAfford: () => r().bands < M.MAX_BANDS && r().bank >= M.BANDS[r().bands].cost,
    buy: () => {
      if (r().bands >= M.MAX_BANDS) return;
      if (ctx.spend(M.BANDS[r().bands].cost)) {
        r().bands++;
        hooks.onBuy('deeper');
      }
    },
  };
  const lures: UpgradeEntry[] = [
    deeper,
    node('lantern', 'Lantern Glow', (l) => `BITE WAIT ${M.biteWait(l).toFixed(1)} -> ${M.biteWait(l + 1).toFixed(1)}S`),
    node('scent', 'Soul Scent', (l) => `RARE BITES X${M.scentMult(l).toFixed(2)} -> X${M.scentMult(l + 1).toFixed(2)}`),
    node('wispnet', 'Wisp Net', (l) => `WISPS X${M.wispMult(l).toFixed(1)} -> X${M.wispMult(l + 1).toFixed(1)}, MORE OFTEN`),
    node('twin', 'Twin Hooks', (l) => `HOOKS PER CAST ${M.hooksPerCast(l)} -> ${M.hooksPerCast(l + 1)}. LAND TO KEEP FISHING`, () => (r().bands < 2 ? 'MURK FIRST' : null)),
    node('eel', 'Lantern Eel', () => 'SHOWS FAKE DIPS (GREY) AND REAL BITES (GOLD)', () => (r().bands < 3 ? 'DROWNED HALLS FIRST' : null)),
    node('legend', "Ferryman's Legend", (l) => longDesc(M.LEGENDS, l), () => longLocked(ctx.save.cycle.n)),
  ];

  const crew: UpgradeEntry[] = [
    node('netter', 'Hire Imp Netter', (l) => `NETTERS ${l} -> ${l + 1} (1 SOUL / 30S EACH)`),
    node('nets', 'Bigger Nets', (l) => `NET RATE X${M.netMult(l).toFixed(1)} -> X${M.netMult(l + 1).toFixed(1)}`),
    node('poles', 'Longer Poles', (l) => `NET DEPTH ${pct(M.poleFrac(l))} -> ${pct(M.poleFrac(l + 1))} OF RIVER`),
    node('chum', 'Chum Barrel', (l) => `NETTERS USE YOUR BAIT ${pct(M.chumEff(l))} -> ${pct(M.chumEff(l + 1))}`),
  ];

  // Debt Collectors (Contraband import) discounts Unpaid Debt. Prices follow the deepest open band
  // and stock is capped (D-styx-02).
  const baitCost = (id: M.BaitId) => M.baitCost(id, ctx.save.imports?.contraband ?? 0, r().bands);
  const full = (id: M.BaitId) => (p().baits[id] ?? 0) + M.BAITS[id].pack > M.BAIT_CAP[id];
  const bait = (id: M.BaitId): UpgradeEntry => ({
    id: `bait.${id}`,
    name: `${M.BAITS[id].name} x${M.BAITS[id].pack}`,
    max: M.BAIT_CAP[id],
    level: () => p().baits[id] ?? 0,
    cost: () => baitCost(id),
    desc: () => M.BAITS[id].desc,
    canAfford: () => !full(id) && r().bank >= baitCost(id),
    locked: () => (id === 'debt' && r().bands < 2 ? 'MURK FIRST' : full(id) ? 'STOCK FULL' : null),
    buy: () => {
      if ((id === 'debt' && r().bands < 2) || full(id)) return;
      if (ctx.spend(baitCost(id))) {
        p().baits[id] = Math.min(M.BAIT_CAP[id], (p().baits[id] ?? 0) + M.BAITS[id].pack);
        r().stats.baitsCrafted++;
        hooks.onBuy(`bait.${id}`);
      }
    },
  });

  return [
    { name: 'Line', entries: line },
    { name: 'Lures', entries: lures },
    { name: 'Imps', entries: crew },
    { name: 'Bait', entries: M.PAID_BAITS.map(bait) },
  ];
}

export function anyAffordable(groups: UpgradeGroup[]): boolean {
  // Baits are consumables: they don't light the "something to buy" badge.
  return groups.some((g) => g.name !== 'Bait' && g.entries.some((e) => e.level() < e.max && !e.locked?.() && e.canAfford()));
}
