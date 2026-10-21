// Granny Gristle, the Cauldron's manager (05 §18): portrait, lines, onboarding and Commendations.
import type { ManagerDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { GRANNY_PAL, GRANNY_PORTRAIT } from './art';
import type { CRun } from './econ';

const run = (s: DeptSave) => s.run as CRun;
const stats = (s: DeptSave) => run(s).stats ?? ({} as CRun['stats']);

export const granny: ManagerDef = {
  name: 'Granny Gristle',
  title: 'Head Cook',
  portrait: GRANNY_PORTRAIT,
  palette: GRANNY_PAL,
  lines: {
    // Core triggers.
    intro: ["Welcome to my kitchen, dearie. Mind the toadlings, they're the stew."],
    firstUpgrade: ['Ooh, a spender! Slurp. The pot likes you already.'],
    goodsLink: ['%good% delivered! Ooh, naughty. See GOODS.', 'Smuggled treats for the pot! GOODS tab, dearie.'],
    infamy50: ['Folk smell my stew for miles, dearie.', 'Half the kingdom has a tummy ache. Lovely.'],
    legend: ['A hero at MY door? Wipe your feet, dearie.', "Someone tall is knocking. Let 'em in when you're ready."],
    fall: ['My pot! My lovely pot!'],
    returnFall: ['New pot. Same old Granny.', 'Rebuilt and bubbling. Hero tasted awful, by the way.'],
    returnLong: ['Kept the pot warm for you, dearie.'],
    // Milestones (fired by the scene).
    farewell: ["Kitchen's yours, dearie. Stir often!"],
    jackpot1: ["Middle's sweeter now. Mmm."],
    fourToads: ['Four warts! A proper kitchen.'],
    firstBatch: ["That's a PLAGUE, dearie! Ticket's done, here's your Bile."],
    mandrake: ['Mandrake! Mind the screaming.'],
    malice1: ['Fewer safe paths, richer pot. Steer harder, dearie.'],
    malice5: ['Nastier board. Lovely.'],
    malice10: ["Malice ten! Even I wouldn't eat that. Cackle!"],
    bigWin: ['Right in the jackpot! Cackle!'],
    goldTriple: ['Three gold clinks on one newt! Showing off, are we?'],
    tokens: ['Batch Tokens buy my recipes, dearie. UPGRADES, last tab.'],
    // Flavor (rate-limited by the core).
    batch: ['Another batch for the Overlord!', 'Bottle it, toadlings!', 'Smells like victory. And feet.'],
    jackpot: ['Plop! Right in the middle.', 'Now THAT is cooking.'],
    dregs: ["Dregs, dearie. Still supper.", 'Edge buckets pay a little. Granny wastes nothing.'],
    ambient: [
      'A pinch of newt, a dash of spite...',
      'Ladle the busy rows, dearie. Steer the rain.',
      'Toadlings never sleep. I checked. With a fork.',
      "Knitting a scarf. It's still wriggling.",
      'Gold pegs make the stew shiny.',
    ],
  },
};

export const onboarding: OnboardingStep[] = [
  { id: 'curse', line: 'Tap a nail on the board, dearie. Curse it into a Ladle!', done: (s) => (stats(s).ladledLands ?? 0) >= 1 },
  { id: 'upgrade', line: 'Another pair of warty hands! Tap UPGRADES, hire a toadling.', done: (s) => Object.values(run(s).lv ?? {}).some((v) => v > 0) },
  { id: 'toss', line: 'Tap chute 5 under the pot. Straight down the middle!', done: (s) => (stats(s).tossLands ?? 0) >= 1 },
  { id: 'ticket', line: "Granny's order, on the right. Toss or ladle those in!", done: (s) => (stats(s).ticks ?? 0) >= 1 },
  { id: 'gold', line: 'Clip the shiny gold peg, dearie. Extra Bile!', done: (s) => (stats(s).goldHits ?? 0) >= 1 },
];

// Commendations live in def.ts (pure, shared with the balance sim).
export { commendations } from './def';
