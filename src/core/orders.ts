// Night Orders (genre research R1, the plan's biggest gap): when the player leaves, each open
// department's manager holds one of two standing orders for the absence; Gobbo's report opens with
// how each order went. Pure data + rules, shared by the game (core/game.ts applyOffline) and the
// balance simulation (sim/meta.ts). A department may supply its own orders and effects
// (DeptEcon.nightOrders / applyNightOrder); the core's flavoured pair below needs no department code.
import type { DeptEcon, NightOrderDef, NightOrderKind } from './dept';
import { econFloor, OFFLINE_GATE_CAP, offlineGateRoom } from './economy';
import type { DeptId, DeptSave, SaveRoot } from './types';

/** Core effects of an order kind on one absence's offline credit. */
export interface OrderEffect {
  /** Multiplier on the local income credited to the bank. */
  bank: number;
  /** Multiplier on what the economy gate counts. */
  gate: number;
  /** Fraction of the economy floor offline credit may fill (Infinity = no limit). */
  gateCap: number;
  /** Multiplier on the department's own Goods export for the absence. */
  goods: number;
}

export const ORDER_EFFECTS: Record<NightOrderKind | 'none', OrderEffect> = {
  // Plain absence (a department order with no core kind): the normal rules.
  none: { bank: 1, gate: 1, gateCap: OFFLINE_GATE_CAP, goods: 1 },
  // "Income now": +25% local income while away; the gate stops at 90% as usual.
  income: { bank: 1.25, gate: 1, gateCap: OFFLINE_GATE_CAP, goods: 1 },
  // "Bait the Legend": no extra income, but the gate counts x1.5 and may fill to 100%+ offline,
  // so the Legend can be waiting on return (R10: the forgetful-but-planful player gets Falls).
  gate: { bank: 1, gate: 1.5, gateCap: Infinity, goods: 1 },
  // "Goods": the department's export runs at x2 for the absence.
  goods: { bank: 1, gate: 1, gateCap: OFFLINE_GATE_CAP, goods: 2 },
};

const o = (id: string, label: string, desc: string, kind: NightOrderKind): NightOrderDef => ({ id, label, desc, kind });

/** The core's flavoured pair per department (labels <= 15 characters, descriptions <= 34). Each
 * pair is "income now" vs "bait the Legend"; the Goods kind is there for departments' own orders. */
export const CORE_ORDERS: Record<DeptId, NightOrderDef[]> = {
  cauldron: [o('bile', 'BREW FOR BILE', '+25% Bile while away', 'income'), o('bait', 'BAIT THE LEGEND', 'Legend gate fills x1.5, to 100%', 'gate')],
  mines: [o('haul', 'HAUL NUGGETS', '+25% Nuggets while away', 'income'), o('deep', 'DIG DEEPER', 'Legend gate fills x1.5, to 100%', 'gate')],
  dungeon: [o('hold', 'HOLD', '+25% Plunder while away', 'income'), o('bait', 'BAIT GREEDILY', 'Legend gate fills x1.5, to 100%', 'gate')],
  bridge: [o('tolls', 'COLLECT TOLLS', '+25% Tollpence while away', 'income'), o('hunt', 'HUNT HEROES', 'Legend gate fills x1.5, to 100%', 'gate')],
  styx: [o('obols', 'NET FOR OBOLS', '+25% Obols while away', 'income'), o('souls', 'NET RARE SOULS', 'Rare souls lure her: gate x1.5', 'gate')],
  spire: [o('arcana', 'DISTILL ARCANA', '+25% Arcana while away', 'income'), o('pages', 'HUNT PAGES', 'Legend gate fills x1.5, to 100%', 'gate')],
  pit: [o('skirmish', 'SKIRMISH', '+25% Teeth while away', 'income'), o('scout', 'SCOUT RIVALS', 'Legend gate fills x1.5, to 100%', 'gate')],
};

/** The orders a department offers: its own (when it supplies 1+ valid ones) or the core pair. */
export function ordersFor(id: DeptId, def: DeptEcon | undefined, d: DeptSave | undefined): NightOrderDef[] {
  if (def?.nightOrders && d) {
    try {
      const list = def.nightOrders(d);
      if (Array.isArray(list)) {
        const ok = list.filter((x) => x && typeof x.id === 'string' && typeof x.label === 'string').slice(0, 3);
        if (ok.length) return ok;
      }
    } catch {
      /* fall back to the core pair */
    }
  }
  return CORE_ORDERS[id] ?? [];
}

/** The standing order: the remembered choice if it is still offered, else the first. */
export function standingOrder(s: SaveRoot, id: DeptId, def: DeptEcon | undefined): NightOrderDef | null {
  const list = ordersFor(id, def, s.depts[id]);
  if (!list.length) return null;
  const want = s.meta.orders?.[id];
  return list.find((x) => x.id === want) ?? list[0];
}

/** Remembers a choice (one tap in the picker). Returns false for an order not offered. */
export function setOrder(s: SaveRoot, id: DeptId, def: DeptEcon | undefined, orderId: string): boolean {
  if (!ordersFor(id, def, s.depts[id]).some((x) => x.id === orderId)) return false;
  (s.meta.orders ??= {})[id] = orderId;
  return true;
}

/** The core effect of an order (none for a department order without a kind). */
export const effectOf = (order: NightOrderDef | null): OrderEffect => ORDER_EFFECTS[order?.kind ?? 'none'] ?? ORDER_EFFECTS.none;

/** What one absence's order did in one department (the report's opening, the manager's line). */
export interface OrderOutcome {
  id: DeptId;
  orderId: string;
  label: string;
  kind: NightOrderKind | 'none';
  /** Local income credited to the bank (order included) and the part the order added. */
  amount: number;
  bonus: number;
  /** Economy-gate fill (0-1, linear in earnings / floor) before and after the absence. */
  gateBefore: number;
  gateAfter: number;
  /** True when the plain 90% offline limit held the gate back (a gate order would have gone on). */
  gateHeld: boolean;
  /** Extra Goods from a goods order (whole units shown). */
  goods: number;
  /** The department's own result text (applyNightOrder), if any. */
  deptText?: string;
}

/**
 * Credits one department's offline income under its standing order (the core part of
 * game.applyOffline, mirrored by the sim). `base` = idle rate x core mult x offline factor x
 * seconds; `gateMult` = the Edict's econGateMult. Returns the outcome (goods are added by the caller,
 * which owns the Goods totals). Pure apart from writing `d`.
 */
export function creditOffline(id: DeptId, def: DeptEcon, d: DeptSave, order: NightOrderDef | null, base: number, gateMult: number): OrderOutcome {
  const eff = effectOf(order);
  const floor = econFloor(def, d.cycle.n);
  const fill = () => (floor > 0 ? Math.max(0, d.cycle.earnings / floor) : 0);
  const gateBefore = fill();
  let amount = 0;
  let bonus = 0;
  let gateHeld = false;
  if (base > 0 && Number.isFinite(base)) {
    amount = base * eff.bank;
    bonus = amount - base;
    d.run.bank += amount;
    const want = amount * (Number.isFinite(gateMult) ? gateMult : 1) * eff.gate;
    const room = offlineGateRoom(def, d, eff.gateCap);
    const got = Math.min(want, room);
    if (got < want - 1e-9) gateHeld = true;
    if (got > 0) d.cycle.earnings += got;
  }
  return {
    id,
    orderId: order?.id ?? '',
    label: order?.label ?? '',
    kind: order?.kind ?? 'none',
    amount,
    bonus,
    gateBefore,
    gateAfter: fill(),
    gateHeld,
    goods: 0,
  };
}

/** One line for the report / manager: "+25% BILE (+1.2K)", "LEGEND GATE 40% -> 100%". */
export function outcomeText(r: OrderOutcome, currency: string, fmt: (n: number) => string): string {
  if (r.deptText) return r.deptText.toUpperCase();
  const pct = (x: number) => `${Math.floor(Math.min(1, x) * 100)}%`;
  switch (r.kind) {
    case 'income':
      return r.bonus > 0 ? `+${fmt(r.bonus)} EXTRA ${currency.toUpperCase()}` : 'QUIET NIGHT';
    case 'gate':
      return r.gateAfter >= 1 ? 'THE LEGEND TOOK THE BAIT!' : `LEGEND GATE ${pct(r.gateBefore)} > ${pct(r.gateAfter)}`;
    case 'goods':
      return r.goods >= 1 ? `+${fmt(Math.floor(r.goods))} EXTRA GOODS` : 'NO GOODS YET';
    default:
      return r.amount > 0 ? `+${fmt(r.amount)} ${currency.toUpperCase()}` : 'QUIET NIGHT';
  }
}

/**
 * Sim bot / sensible default policy: bait the Legend when the skill gate is already met (the Legend
 * could come while away), otherwise take the income (or the Goods order where there is no gate
 * order). Returns an order id from `list`.
 */
export function botOrder(list: NightOrderDef[], skillMet: boolean): string | null {
  if (!list.length) return null;
  const gate = list.find((x) => x.kind === 'gate');
  const income = list.find((x) => x.kind === 'income');
  if (skillMet && gate) return gate.id;
  return (income ?? list[0]).id;
}
