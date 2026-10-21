// Goods UI (specs/00 §4, §5): the GOODS group in each department's upgrade sheet and the Throne
// Room's Armory (stock and income, every import node, the Black Market, Imperial Roads).
import type { UpgradeEntry, UpgradeGroup } from '../core/dept';
import type { Game } from '../core/game';
import { formatNum } from '../core/format';
import {
  canBuyImport,
  GOOD_ORDER,
  GOODS,
  goodsIncomePerH,
  goodsStock,
  importAdd,
  importLv,
  importsOf,
  IMPORT_NODES,
  lineOpen,
  MARKET_BUNDLE,
  marketCost,
  nodeCost,
  ROADS,
  ROADS_STEP,
  type GoodId,
  type ImportNode,
} from '../core/goods';
import type { DeptId } from '../core/types';
import { C } from './widgets';

export const DEPT_SHORT: Record<DeptId, string> = {
  cauldron: 'CAULDRON',
  mines: 'MINES',
  dungeon: 'DUNGEON',
  bridge: 'BRIDGE',
  styx: 'STYX',
  spire: 'SPIRE',
  pit: 'WAR PIT',
};

const GOODS_COLOR = '#d8c8a0';

/** "{potion}57 {bone}12" for the given Goods (whole units). */
export function stockLine(game: Game, goods: GoodId[]): string {
  const n = game.save.meta.settings.notation;
  return goods.map((g) => `${GOODS[g].icon}${formatNum(Math.floor(goodsStock(game.save, g)), n)}`).join(' ');
}

function nodeEntry(game: Game, node: ImportNode, label: string): UpgradeEntry {
  const s = () => game.save;
  return {
    id: `import.${node.dept}.${node.key}`,
    name: label,
    desc: () => node.desc(importLv(s().depts[node.dept], node.key)),
    level: () => importLv(s().depts[node.dept], node.key),
    max: node.max,
    cost: () => nodeCost(s(), node),
    currency: GOODS[node.good].icon,
    canAfford: () => canBuyImport(s(), node),
    buy: () => {
      game.buyImportNode(node);
    },
    visible: () => lineOpen(s(), node),
  };
}

/** The department's two import lines, for its upgrade sheet (null while no line is open). */
export function goodsGroup(game: Game, id: DeptId): UpgradeGroup | null {
  const nodes = importsOf(id);
  if (!nodes.some((n) => lineOpen(game.save, n))) return null;
  const goods = [...new Set(nodes.map((n) => n.good))];
  return {
    name: 'Goods',
    entries: nodes.map((n) => nodeEntry(game, n, n.name)),
    bank: () => {
      const add = importAdd(game.save.depts[id]);
      return { text: `${stockLine(game, goods)}  INCOME +${(add * 100).toFixed(1)}%`, color: GOODS_COLOR };
    },
  };
}

/** The Armory tab of the Throne Room. */
export function openArmory(game: Game): void {
  const s = () => game.save;
  const n = () => s().meta.settings.notation;
  const tribute = () => ({ text: `{coin}${formatNum(s().meta.tribute, n())} TRIBUTE`, color: C.goldText });

  const market: UpgradeEntry[] = GOOD_ORDER.filter((g) => game.defs[GOODS[g].exporter]).map((g) => {
    const def = GOODS[g];
    return {
      id: `market.${g}`,
      name: `${def.icon}${def.name}`,
      levelText: () => formatNum(Math.floor(goodsStock(s(), g)), n()),
      desc: () => {
        const rate = goodsIncomePerH(s(), game.defs)[g];
        return s().depts[def.exporter] ? `+${rate.toFixed(1)}/H FROM ${DEPT_SHORT[def.exporter]}` : `${DEPT_SHORT[def.exporter]} SEALED`;
      },
      level: () => 0,
      max: Infinity,
      cost: () => marketCost(s(), game.marketDay(), MARKET_BUNDLE),
      currency: 'Tribute',
      buyLabel: `+${MARKET_BUNDLE}`,
      canAfford: () => s().meta.tribute + 1e-9 >= marketCost(s(), game.marketDay(), MARKET_BUNDLE),
      buy: () => {
        game.buyGoods(g, MARKET_BUNDLE);
      },
    };
  });

  const imports: UpgradeEntry[] = IMPORT_NODES.filter((nd) => game.defs[nd.dept]).map((nd) =>
    nodeEntry(game, nd, `${DEPT_SHORT[nd.dept]}: ${nd.name}`),
  );

  const roadsLv = () => s().meta.throne[ROADS.id] ?? 0;
  const roads: UpgradeEntry = {
    id: ROADS.id,
    name: ROADS.name,
    desc: () => `Goods trickle +${Math.round(ROADS_STEP * 100 * roadsLv())}% > +${Math.round(ROADS_STEP * 100 * (roadsLv() + 1))}%`,
    level: roadsLv,
    max: ROADS.max,
    cost: () => Math.ceil(ROADS.cost(roadsLv())),
    currency: 'Tribute',
    canAfford: () => s().meta.tribute >= Math.ceil(ROADS.cost(roadsLv())),
    buy: () => {
      const c = Math.ceil(ROADS.cost(roadsLv()));
      if (game.spendTribute(c)) s().meta.throne[ROADS.id] = roadsLv() + 1;
    },
  };

  const allStock = () => ({ text: stockLine(game, GOOD_ORDER.filter((g) => game.defs[GOODS[g].exporter])), color: GOODS_COLOR });
  game.openCustomSheet('ARMORY', tribute, [
    { name: 'Market', entries: market },
    { name: 'Imports', entries: imports, bank: allStock },
    { name: 'Roads', entries: [roads] },
  ]);
}
