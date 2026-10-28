// The Dungeon (specs/01): the flagship tower defense. Line the walls with towers, stock the
// chambers with minions, carve runes, bait parties down your side loops, dig new halls, and Glare
// at whoever gets clever. Manager: Ledger-Bones, the skeleton clerk (§18).
import type { DeptDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { BONES_IDLE, BONES_PALETTE, BONES_TALK } from './art';
import { dungeonEcon } from './def';
import { dungeonLastStand } from './laststand';
import { FLOORS } from './map';
import * as M from './model';
import { DungeonScene, live } from './scene';

const run = (s: DeptSave) => s.run as M.DungeonRun;
const st = (s: DeptSave) => run(s).stats ?? M.defaultStats();

// Lines are <= 32 characters (00 §5.4.5). Ledger-Bones: deadpan, "My Liege", visitors/customers,
// leaks are "unbudgeted withdrawals", usually a number.
const LINES: Record<string, string[]> = {
  intro: ['My Liege. Customers inbound.', 'I keep the books. You, the dead.'],
  firstUpgrade: ['First expense logged.', 'Capital deployed, My Liege.'],
  firstBallista: ['Ballista. Depreciates nicely.', 'A Ballista. Pierces 3. Thrifty.'],
  firstBranch: ['A specialist. Sound investment.', 'Branch chosen. Filed in ink.'],
  'hero.rogue': ['Rogues. They ignore chests.', 'Rogues: 30% dodge. Get an Eye.'],
  'hero.knight': ['Knights. Armored. Budget for it.', 'Plate armor. Flame ignores it.'],
  'hero.cleric': ['Clerics. They heal. Glare first.', 'A healer. Focus fire, My Liege.'],
  'hero.wizard': ['Wizards. They dispel runes.', 'Wizards: space your runes out.'],
  floor1: ['The Ossuary! So much filing.', 'Floor 2. Bounties up 20%.'],
  floor2: ['Drowned Halls. Damp ledgers.', 'Floor 3. Rogues swim. Fast.'],
  dialRaised: ['Lure %n%. Richer customers.', 'Lure %n%. Bounties up. Risk too.'],
  chestPlaced: ['Chest set. Fatten, then feast.', 'Bait set. Looters pay +60%.'],
  gongTip: ['Ring early. Bigger bonus.', 'Early calls pay. If they hold.'],
  thief: ['Unbudgeted withdrawal! Chase!', 'A thief! Kill him by the door.'],
  recovered: ['Sack recovered. Plus 25%.', 'Interest collected, My Liege.'],
  champion: ['A Champion. Glare him.', 'Champion inbound. Ballistas.'],
  champSlain: ['Champion slain. Two for Infamy.', 'One Champion, fully audited.'],
  dispel: ['A Wizard voided a rune. Rude.', 'Rune dispelled. 6 seconds.'],
  perfect: ['Five clean calls. Stacked.', 'Full Gong stack. Exquisite.'],
  struggle: ['Losses at %n%. Lower Lure?', 'Leaks at %n%. Ease the Lure?'],
  goodsLink: ['%good% arrived. Itemizing.', 'Imports logged. GOODS tab.'],
  infamy50: ['Body count: up 50%, My Liege.', 'Infamy at 50%. Ledger glows.'],
  infamy100: ['Infamy 100%. A Legend stirs.', 'Full Infamy. Brace the Hoard.'],
  legend: ['A Legend. Not in the budget.', 'A Legend at the door. Jaw: off.'],
  returnFall: ['Blueprints saved. Rebuild?', 'We rebuild. Tap a ghost.'],
  fall: ['Sacked. The ledger survives.', 'Razed. I saved the receipts.'],
  returnLong: ['While you were away: profit.', 'Itemized absence, My Liege.'],
  returnLong3d: ['Three days. I counted each.', 'Welcome back. Interest accrued.'],
  report: ['Bodies up. Leaks down. Mostly.', 'The Hoard grew. I measured.', 'Customers served. Coins kept.', 'A fine quarter, My Liege.', 'Two thieves. One got far.', 'Rounding errors: mine.'],
  ambient: ['Rounding error detected. Mine.', 'Squires: 3 coin each. Cheap.', 'I audited the Hoard. Twice.', 'An early Gong pays. Mostly.', 'Moves cost 3 seconds. Not coin.', 'Looters steal more. Kill them.'],
  flavor: [
    'Rounding error detected. Mine.',
    'Squires: 3 coin each. Cheap.',
    'Ring early. Greed is a budget.',
    'Flame ignores armor. Arrows: no.',
    'Hold a piece to drag it.',
    'I audited the Hoard. Twice.',
    'Chest by a killbox: rich. Risky.',
    'An escaped looter: a write-off.',
    'Greed runes: +50% on kills near.',
    'Eyes of Gloom stop Rogue dodges.',
  ],
};

// Onboarding (01 §18): five beats, first purchase at beat 2, each a player action.
const onboarding: OnboardingStep[] = [
  { id: 'coin', line: 'Coins! Tap them in, My Liege.', target: 'coin', gesture: 'tap', done: (s) => st(s).grabs >= 1, waitFor: () => live.coins > 0 },
  { id: 'place', line: 'One more slit, My Liege.', target: 'slot.arrow', gesture: 'drag', dragTo: 'tile.suggested', done: (s) => st(s).placed >= 1 },
  { id: 'glare', line: 'Your Gaze. Near the visitor.', target: 'glare', gesture: 'tap', done: (s) => st(s).glares >= 1, waitFor: () => live.heroes > 0 && live.glareReady },
  { id: 'trap', line: 'Trapdoor. Directly beneath.', target: 'trap', gesture: 'tap', done: (s) => st(s).traps >= 1, waitFor: () => live.heroes > 0 && live.trapReady },
  { id: 'gong', line: 'Ring early. Sooner is richer.', target: 'btn.gong', gesture: 'tap', done: (s) => st(s).gongs >= 1, waitFor: () => live.gongReady },
];

const kinds = (s: DeptSave, k: M.PieceKind) => M.countKind(run(s), k);

// Micro-lessons (01 §18, 00 §5.4.2): 1-3 beats each, fired by the scene with ctx.lesson(id).
const lessons: Record<string, OnboardingStep[]> = {
  chests: [
    { id: 'place', line: 'Chests. Visitors love chests.', target: 'chest.flow', gesture: 'tap', done: (s) => run(s).bait.length >= 1 },
    { id: 'detour', line: 'Looters pay +60%. If caught.', target: 'chest.placed', done: (s) => st(s).detours >= 1 },
  ],
  lure: [
    { id: 'buy', line: 'Rumors bring richer visitors.', target: 'lure.up', gesture: 'tap', done: (s) => run(s).lureMax >= 1 },
    { id: 'preview', line: 'Bigger bounties. See NEXT.', target: 'preview', done: () => live.lureParty },
  ],
  levels: [{ id: 'up', line: 'Upgrade a slit. Compounding.', target: 'piece.upgrade', gesture: 'tap', done: (s) => st(s).upgrades >= 1 }],
  runes: [{ id: 'mire', line: 'Runes go on the path. Cheap.', target: 'slot.mire', gesture: 'drag', done: (s) => M.runeCount(run(s)) >= 1 }],
  branch: [{ id: 'pick', line: 'Level 5: pick a specialty.', target: 'piece.branch', gesture: 'tap', done: (s) => st(s).branches >= 1 }],
  rogues: [
    { id: 'see', line: 'This one ignores chests. Noted.', target: 'hero.rogue', done: () => live.on.rogue, waitFor: () => live.on.rogue },
    { id: 'eye', line: 'An Eye of Gloom stops dodges.', target: 'slot.eye', gesture: 'drag', done: (s) => kinds(s, 'eye') >= 1, waitFor: (s) => run(s).bank >= M.placeCost(run(s), 'eye') },
  ],
  knights: [{ id: 'see', line: 'Knights. Armored. Use flame.', target: 'hero.knight', done: (s) => kinds(s, 'brazier') >= 1 || st(s).kills >= 200, waitFor: () => live.on.knight }],
  clerics: [{ id: 'glare', line: 'Clerics heal. Glare them first.', target: 'hero.cleric', gesture: 'tap', done: (s) => st(s).glares >= 1 && !live.on.cleric, waitFor: () => live.on.cleric }],
  wizards: [{ id: 'see', line: 'Wizards dispel runes. Spread.', target: 'hero.wizard', done: (s) => st(s).dispels >= 1, waitFor: () => live.on.wizard }],
  dig: [{ id: 'carve', line: 'Carve a pocket. Bait it.', target: 'dig.flow', gesture: 'tap', done: (s) => st(s).dug >= 1 }],
  floors: [{ id: 'buy', line: `A second floor. ${FLOORS[1].cost / 1000}K. Floors tab.`, target: 'workshop', gesture: 'tap', done: (s) => ((s.persistent as M.DungeonPersistent).floors ?? 1) >= 2 }],
};

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
    lines: LINES,
  },

  onboarding,
  lessons,

  legend: {
    name: 'Sir Aldous Goldmantle',
    line: 'I HAVE READ YOUR LEDGER, SKELETON. I AM HERE FOR THE BALANCE.',
  },

  createScene: (ctx) => new DungeonScene(ctx),
  lastStand: (ctx) => dungeonLastStand(ctx),
};
