// The Bridge's upgrade tree (06 §6) as shared-sheet groups: Grumm, Eye, Bridge, Goons, Menace.
import type { DeptCtx, UpgradeEntry, UpgradeGroup } from '../../core/dept';
import { longDesc, longLocked } from '../../core/longnode';
import * as M from './model';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface Hooks {
  onGoon(): void;
  onMenaceBought(m: number): void;
}

export function buildGroups(ctx: DeptCtx, hooks: Hooks): UpgradeGroup[] {
  const r = () => ctx.save.run as M.BridgeRun;
  const node = (id: keyof M.Levels, name: string, desc: () => string, after?: () => void, locked?: () => string | null): UpgradeEntry => ({
    id,
    name,
    desc,
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
        after?.();
      }
    },
  });

  const grumm = [
    node('glare', 'Intimidating Glare', () => `PATIENCE X${M.glareMult(r().lv.glare).toFixed(2)} -> X${M.glareMult(r().lv.glare + 1).toFixed(2)}`),
    node('tongue', "Haggler's Tongue", () => `COUNTER ${pct(M.tongueFrac(r().lv.tongue))} -> ${pct(M.tongueFrac(r().lv.tongue + 1))} TOWARD ASK`),
    node('skull', 'Thick Skull', () => `NAP ${M.napSeconds(r().lv.skull)}S -> ${M.napSeconds(r().lv.skull + 1)}S`),
    node('fists', 'Big Fists', () => `BONK CHANCE X${M.brawnMult(r().lv.fists).toFixed(2)} -> X${M.brawnMult(r().lv.fists + 1).toFixed(2)}`),
  ];
  const eye = [
    node('sense', 'Wallet Sense', () => `PURSE BAND +-${pct(M.senseBand(r().lv.sense))} -> +-${pct(M.senseBand(r().lv.sense + 1))}`, () => {
      if (!ctx.seen('b.sense')) {
        ctx.markSeen('b.sense');
        ctx.say('senseUp', { milestone: true });
      }
    }),
    node('nose', 'Hero Nose', () => `TELLS SHOW ${pct(M.visibleChance(r().lv.nose))} -> ${pct(M.visibleChance(r().lv.nose + 1))}`),
    node('sniffer', 'Sniffer Dog', () => `SNIFFS SMUGGLERS ${pct(M.sniffChance(r().lv.sniffer))} -> ${pct(M.sniffChance(r().lv.sniffer + 1))}`),
  ];
  const bridge = [
    node('signage', 'Fancy Signage', () => `ALL FARES X${M.signageMult(r().lv.signage).toFixed(2)} -> X${M.signageMult(r().lv.signage + 1).toFixed(2)}`),
    node('bench', 'Waiting Bench', () => `BENCH ${M.benchCap(r().lv.bench)} -> ${M.benchCap(r().lv.bench + 1)} TRAVELERS`),
    node('booth', 'Toll Booth', () => (r().lv.booth ? 'NOBLES VISIT (FARE 30)' : 'UNLOCKS NOBLES: FARE 30')),
    node('charter', 'Royal Toll Charter', () => longDesc(M.CHARTERS, r().lv.charter ?? 0), undefined, () => longLocked(ctx.save.cycle.n)),
  ];
  const goons = [
    node('goons', 'Hire Goon', () => `GOONS ${r().lv.goons}->${r().lv.goons + 1}, GATE ${pct(M.goonEff(r().lv.goons))}->${pct(M.goonEff(r().lv.goons + 1))}`, () => hooks.onGoon()),
    node('pricing', 'Goon Pricing', () => `GOON TOLL X${M.goonFlat(r().lv.pricing).toFixed(2)} -> X${M.goonFlat(r().lv.pricing + 1).toFixed(2)}`),
  ];
  const menace: UpgradeEntry = {
    id: 'menace',
    name: 'Scarier Sign (Menace)',
    max: M.MENACE_MAX,
    level: () => r().menaceMax,
    cost: () => M.menaceCost(r().menaceMax + 1),
    desc: () => {
      const m = r().menaceMax + 1;
      const card = M.RULE_CARDS.find((c) => c.m === m);
      return `PAY X${M.payoutMult(m).toFixed(2)}${card ? ` +RULE: ${card.name}` : ', SLYER HEROES'}`;
    },
    canAfford: () => r().menaceMax < M.MENACE_MAX && r().bank >= M.menaceCost(r().menaceMax + 1),
    buy: () => {
      const run = r();
      if (run.menaceMax >= M.MENACE_MAX) return;
      if (ctx.spend(M.menaceCost(run.menaceMax + 1))) {
        run.menaceMax++;
        run.menace = run.menaceMax;
        hooks.onMenaceBought(run.menaceMax);
      }
    },
  };
  return [
    { name: 'Grumm', entries: grumm },
    { name: 'Eye', entries: eye },
    { name: 'Bridge', entries: bridge },
    { name: 'Goons', entries: goons },
    { name: 'Menace', entries: [menace] },
  ];
}

export function anyAffordable(groups: UpgradeGroup[]): boolean {
  for (const g of groups)
    for (const e of g.entries) {
      if (e.visible && !e.visible()) continue;
      if (e.locked?.()) continue;
      if (e.level() < e.max && e.canAfford()) return true;
    }
  return false;
}
