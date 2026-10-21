// Granny Gristle, the Cauldron's manager (05 §18): portrait, lines, onboarding and micro-lessons.
// Beats are <= 32 characters with a target and a gesture (00 §5.4.2); the scene resolves the
// TargetIds in `targetRect` ('peg', 'upgrades', 'chute5', 'ticket', 'gold', 'board', 'malice',
// 'ladles', 'buckets', 'spoon').
import type { ManagerDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { GRANNY_PAL, GRANNY_PORTRAIT } from './art';
import { lvOf, UP, upCost, type CPersistent, type CRun } from './econ';

const run = (s: DeptSave) => s.run as CRun;
const per = (s: DeptSave) => s.persistent as CPersistent;
const stats = (s: DeptSave) => run(s).stats ?? ({} as CRun['stats']);
const seen = (s: DeptSave, k: string) => !!s.seen?.[k];

export const granny: ManagerDef = {
  name: 'Granny Gristle',
  title: 'Head Cook',
  portrait: GRANNY_PORTRAIT,
  palette: GRANNY_PAL,
  lines: {
    // Core-fired triggers (>= 2 variants each, 00 §5.4.6 lint).
    intro: ['Welcome to my kitchen, dearie.', 'Mind the toadlings. Stew!'],
    firstUpgrade: ['Ooh, a spender! Slurp.', 'The pot likes you already.'],
    goodsLink: ['%good%! Ooh, naughty.', 'Smuggled spice! Ooh, naughty.'],
    infamy50: ['Folk smell my stew for miles.', 'Half the land has tummy ache.'],
    infamy100: ['The whole realm is retching!', "They'll send a hero. Lovely."],
    legend: ['A hero at MY door? Wipe feet.', "Someone tall's knocking, dearie."],
    fall: ['My pot! My lovely pot!', 'She kicked my cauldron over!'],
    returnFall: ['New pot. Same old Granny.', 'Rebuilt and bubbling, dearie.', 'Hero tasted awful, by the way.'],
    returnLong: ['Kept the pot warm for you.', 'Toadlings missed you, dearie.'],
    returnLong3d: ['Days! I knitted three scarves.', 'Thought you ran off, dearie.'],
    report: [
      'Pot bubbled all night, dearie.',
      'Toadlings tipped and tipped.',
      'Plenty of Bile. Smells lovely.',
      'Hopper is full to the brim!',
      'One toadling fell in. Crunchy.',
      'Brewed a fine plague for you.',
    ],
    ambient: [
      'A pinch of newt, dash of spite.',
      'Ladle the busy rows, dearie.',
      'Toadlings never sleep. Checked.',
      "Knitting a scarf. It wriggles.",
      'Gold pegs make the stew shiny.',
      'Low rows steer best, dearie.',
    ],
    // Milestones (typed, fired by the scene; 05 §18 table).
    jackpot1: ["Middle's sweeter now. Mmm.", 'A richer middle. Slurp.'],
    fourToads: ['Four warts! A proper kitchen.', 'Four toadlings! Busy kitchen.'],
    firstBatch: ["That's a PLAGUE, dearie!", 'First batch! Bottle it!'],
    minesSeal: ['Goblins next door want you.', 'Mines are for sale, dearie.'],
    mandrake: ['Mandrake! Mind the screaming.', 'Ooh, it screams. Lovely.'],
    splitroot: ['Splitroot! One goes in three.', 'It splits! Like my knees.'],
    boomshroom: ['Boomshroom! Stand back, dear.', 'Mind your eyebrows, dearie.'],
    leadheart: ['Lead Heart. Drops like guilt.', 'Heavy, that one. Aim it.'],
    wisp: ['Wisp Salt finds the middle.', 'Salt that knows its way.'],
    sock: ["A HERO'S SOCK! Pfoo! Lovely.", 'Smells of hero. Batch x2!'],
    malice5: ['Nastier board. Lovely.', 'Malice five! Wicked, dearie.'],
    malice10: ['Malice ten! Even I gag.', 'Nastiest pot in the land!'],
    slop: ["Slop's still supper, dearie.", 'Into the pail. Waste not!'],
    // Flavour (Full only, rate-limited by the director).
    bigWin: ['Right in the jackpot! Cackle!', 'Plop! Right in the middle.'],
    goldTriple: ['Three gold clinks! Show-off.', 'Golden triple, dearie!'],
    batch: ['Another batch for you!', 'Bottle it, toadlings!', 'Smells like victory. And feet.'],
    hopper: ['Tip the hopper, dearie!', 'Backlog! Tip it in!'],
  },
};

const hireCost = () => upCost(UP.hire, 0);

export const onboarding: OnboardingStep[] = [
  {
    id: 'curse',
    line: 'Tap a nail, dearie. Curse it!',
    target: 'peg',
    gesture: 'tap',
    // U-07: the first curse completes it (a ladled drop landing in the middle was luck-bound).
    done: (s) => (stats(s).curses ?? 0) >= 1 || (stats(s).ladledLands ?? 0) >= 1,
  },
  {
    id: 'upgrade',
    line: 'Another pair of warty hands.',
    target: 'upgrades',
    gesture: 'tap',
    // Waits (strip hidden) until Hire Toadling is affordable, then points at UPGRADES (00 §5.4.2).
    waitFor: (s) => lvOf(run(s), 'hire') > 0 || (run(s).bank ?? 0) >= hireCost(),
    done: (s) => lvOf(run(s), 'hire') > 0,
  },
  { id: 'toss', line: 'Straight down the middle!', target: 'chute5', gesture: 'tap', done: (s) => (stats(s).tossLands ?? 0) >= 1 },
  { id: 'ticket', line: "Granny's order. Fill it.", target: 'ticket', done: (s) => (stats(s).ticks ?? 0) >= 1 },
  { id: 'gold', line: 'Clip the shiny one. x1.5!', target: 'gold', done: (s) => (stats(s).goldHits ?? 0) >= 1 },
  { id: 'farewell', line: "Kitchen's yours. Stir often!", target: 'hud.home', done: (s) => seen(s, 'cl.bye') },
];

/** Micro-lessons for mechanics that unlock later (00 §5.4.2; replayable from Settings). */
export const lessons: Record<string, OnboardingStep[]> = {
  malice: [
    { id: 'thin', line: 'Fewer safe paths. Richer pot.', target: 'board', gesture: 'tap', done: (s) => seen(s, 'cl.malCurse') },
    { id: 'steer', line: 'Steer harder, dearie.', target: 'board', done: (s) => (stats(s).ladledMal ?? 0) >= 3 },
  ],
  tokens: [
    {
      id: 'spend',
      line: 'Tokens buy recipes. Kitchen!',
      target: 'upgrades',
      gesture: 'tap',
      waitFor: (s) => (per(s).tokens ?? 0) >= upCost(UP.bigger, 0),
      done: (s) => Object.values(per(s).rlv ?? {}).some((v) => v > 0),
    },
  ],
  sigils: [{ id: 'more', line: 'More ladles! Curse a row.', target: 'ladles', done: (s) => seen(s, 'cl.sigilCurse') }],
  scry: [{ id: 'hold', line: 'Hold a chute. See the odds.', target: 'chute5', gesture: 'hold', done: (s) => seen(s, 'cl.scried') }],
  shift: [{ id: 'swap', line: 'Hold a bucket. Then swap it.', target: 'buckets', gesture: 'hold', done: (s) => seen(s, 'cl.shifted') }],
  double: [{ id: 'both', line: 'Two orders! Fill both, dear.', target: 'ticket', done: (s) => seen(s, 'cl.t2tick') }],
  layouts: [{ id: 'pick', line: 'New rack! Pick it in POT.', target: 'upgrades', gesture: 'tap', done: (s) => seen(s, 'cl.layoutPicked') }],
  swap: [{ id: 'flick', line: 'Tap the spoon to swap.', target: 'spoon', gesture: 'tap', done: (s) => seen(s, 'cl.swapped') }],
};

// Commendations live in def.ts (pure, shared with the balance sim).
export { commendations } from './def';
