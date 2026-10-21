// The Dungeon (specs/01): the flagship tower defense. Line the walls with towers, stock the
// chambers with minions, carve runes, bait parties down your side loops, and Glare at whoever
// gets clever. Manager: Ledger-Bones, the skeleton clerk (§18).
import type { DeptDef } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { BONES_IDLE, BONES_PALETTE, BONES_TALK } from './art';
import * as M from './model';
import { DungeonScene } from './scene';
import { idleRateOf } from './sim';

const run = (s: DeptSave) => s.run as M.DungeonRun;
const st = (s: DeptSave) => run(s).stats ?? M.defaultStats();

export const dungeon: DeptDef = {
  id: 'dungeon',
  name: 'The Dungeon',
  currency: 'Plunder',
  currencyColor: '#e8c04a',
  doorColor: 0x3a2c5a,
  version: 1,
  defaultRun: () => M.defaultRun(),
  defaultPersistent: () => M.defaultPersistent(),

  // On-screen idle rate: a headless 20 Hz sim of the layout (Cautious Mode), memoized by a
  // layout/upgrade/Lure hash, so the per-frame HUD call is a lookup (sim.ts).
  idleRate(save) {
    const r = run(save);
    if (!r || !r.pieces || !r.ws || !r.stats) {
      if (!r) return 0;
      M.normalize(r, save.persistent);
    }
    return idleRateOf(r);
  },

  // Infamy skill gate (00 §2.2, 01 §7): slay 2 Champions at Lure >= min(15 + 4N, 40) while leaks
  // stay under 20% over the last 20 parties.
  skillTarget: (n) => Math.min(15 + 4 * n, 40),
  skillLabel: (t) => `SLAY 2 CHAMPIONS AT LURE ${t}, LEAKS UNDER 20%`,

  // Seeds from a greedy-builder bot on the headless sim (active play at 2x the sim rate, ~25 min of
  // Dungeon attention a day, 40 min of on-screen-elsewhere at 1x, offline nights at 0.6x):
  //  - Lure 5 (Knights) ~12 min, Lure 8 at 30 min, Lure 13 at end of day 1, Lure 16 held on day 2.
  //    A real player is slower than the greedy bot, so the Lure 15 skill gate lands ~day 2-3.
  //  - Cycle earnings: ~2e5 by end of day 1, ~1.4e6 day 2, roughly doubling daily after that, so
  //    E0 = 6e6 puts the first Dungeon Fall on ~day 4 (after the Cauldron, day 2, and the Mines,
  //    day 3, per 00 §6).
  //  - rankRef: on-screen idle ~10 min in (12 pieces, Lure 3) is ~2/s.
  //  - rankTarget: idle at the first 100% Infamy (Lure ~16, ~50 pieces around L7) is ~60-100/s.
  econBase: 6e6,
  rankRef: 2,
  rankTarget: 100,

  commendations: [
    { id: 'firstBlood', label: 'FIRST CUSTOMER SERVED', test: (s) => st(s).kills >= 1 },
    { id: 'builder', label: 'ARCHITECT: 12 PIECES AT ONCE', test: (s) => st(s).bestPieces >= 12 },
    { id: 'baited', label: 'BAITED: A PARTY DETOURED', test: (s) => st(s).detours >= 1 },
    { id: 'glare', label: 'THE LOOK: 10 GLARE KILLS', test: (s) => st(s).glareKills >= 10 },
    { id: 'gong', label: 'PERFECT GONG: +50% STACK', test: (s) => st(s).bestGong >= 5 },
    { id: 'champ', label: 'CHAMPION SLAIN', test: (s) => st(s).champs >= 1 },
    { id: 'recover', label: 'RECOVERED 5 GOLD SACKS', test: (s) => st(s).recovered >= 5 },
    { id: 'lure10', label: 'RUMOR HAS IT: LURE 10', test: (s) => (run(s).lureMax ?? 0) >= 10 },
  ],

  manager: {
    name: 'Ledger-Bones',
    title: 'Clerk',
    portrait: [BONES_IDLE, BONES_TALK],
    palette: BONES_PALETTE,
    lines: {
      intro: ['My Liege. Customers inbound. I keep the books. You keep them dying.'],
      firstUpgrade: ['First expense logged. Sound investment.', 'Capital deployed, My Liege.'],
      firstBallista: ['Ballista. Depreciates nicely.'],
      firstBranch: ['A specialist. Sound investment.'],
      knights: ['Knights. Armored. Budget for it. Flame ignores plate.'],
      rogues: ['Rogues. They ignore chests. Noted.'],
      lureFirst: ['Lure 1. Richer customers inbound. Champions, every tenth party.'],
      dialRaised: ['Lure %n%. Richer customers inbound.', 'Lure %n%. Bounties up. So is the risk.'],
      chestLesson: ['Chests. Visitors love chests. Tap CHEST, then a loop end.'],
      chestPlaced: ['Chest placed. Watch them detour past your towers.'],
      detour: ['Re-routed. +40% exposure.'],
      thief: ['Unbudgeted withdrawal! Kill him before the door!'],
      recovered: ['Sack recovered, plus 25%. Interest, My Liege.'],
      champion: ['A Champion. Glare him. Bring a Ballista.'],
      champSlain: ['Champion slain. Two at the target Lure means Infamy.'],
      perfect: ['Perfect waves. Profit +50%. Keep ringing.'],
      struggle: ['Losses at %n%. Lower Lure? The dial is top left.'],
      infamy50: ['Body count: up 50%, My Liege.'],
      legend: ['A Legend. Not in the budget. Tap LEGEND.', 'A Legend at the entry. Jaw. Dropped.'],
      returnFall: ['Blueprints saved. Tap a ghost to rebuild.'],
      fall: ['Sacked. The ledger survives. It always does.'],
      returnLong: ['While you were away: profit. Itemized.'],
      flavor: [
        'Rounding error detected. Mine.',
        'Squires: 3 coin each. Cheap but plentiful.',
        'Ring the Gong when the door is clear.',
        'Flame ignores armor. Arrows do not.',
        'Moving a piece costs 3 seconds. Not coin.',
        'I have audited the Hoard. Twice. Today.',
        'Tap coins early. Greedy grab, +10%.',
        'A leak takes 2% at most. Still rude.',
      ],
    },
  },

  onboarding: [
    { id: 'coin', line: 'Collect promptly. Tap a coin. +10%.', done: (s) => st(s).grabs >= 1 },
    { id: 'place', line: 'One more slit, My Liege. Tap ARROW, then the glowing wall.', done: (s) => st(s).placed >= 1 },
    { id: 'glare', line: 'Your Gaze. Tap near a visitor.', done: (s) => st(s).glares >= 1 },
    { id: 'upgrade', line: 'Tap a slit. Upgrade it. Compound interest.', done: (s) => st(s).upgrades >= 1 },
    { id: 'trap', line: 'Trapdoor. Tap TRAP, then the path under a visitor.', done: (s) => st(s).traps >= 1 },
    { id: 'gong', line: 'Ring the Gong for the next customer. No leaks keeps it climbing.', done: (s) => st(s).gongs >= 1 },
  ],

  legend: {
    name: 'Sir Aldous Goldmantle',
    line: 'I HAVE READ YOUR LEDGER, SKELETON. I AM HERE FOR THE BALANCE.',
  },

  createScene: (ctx) => new DungeonScene(ctx),
};
