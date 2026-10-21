// The Dungeon (specs/01): the flagship tower defense. Line the walls with towers, stock the
// chambers with minions, carve runes, bait parties down your side loops, and Glare at whoever
// gets clever. Manager: Ledger-Bones, the skeleton clerk (§18).
import type { DeptDef } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { BONES_IDLE, BONES_PALETTE, BONES_TALK } from './art';
import { dungeonEcon } from './def';
import * as M from './model';
import { DungeonScene } from './scene';

const st = (s: DeptSave) => (s.run as M.DungeonRun).stats ?? M.defaultStats();

export const dungeon: DeptDef = {
  ...dungeonEcon,
  name: 'The Dungeon',
  currency: 'Plunder',
  currencyColor: '#e8c04a',
  doorColor: 0x3a2c5a,

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
      perfect: ['Perfect waves. Profit +40%. Keep ringing.'],
      struggle: ['Losses at %n%. Lower Lure? The dial is top left.'],
      goodsLink: ['%good% arrived. Itemizing. See GOODS.', 'Imports logged, My Liege. GOODS tab.'],
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
