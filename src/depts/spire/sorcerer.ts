// The Head Sorcerer, the Spire's manager (04 §18): a nervous, permanently singed lich who stammers,
// cites "the literature" and calls the Overlord "M-my lord". Lines stay short with a stammer or a
// parenthetical. Onboarding is learned by doing (5 steps).
import type { ManagerDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { SORC_PAL, SORC_PORTRAIT } from './art';
import { defaultStats, lvOf, type SpireRun } from './def';

const run = (s: DeptSave) => s.run as SpireRun;
const st = (s: DeptSave) => run(s).stats ?? defaultStats();

export const sorcerer: ManagerDef = {
  name: 'Head Sorcerer',
  title: 'Head Sorcerer',
  portrait: SORC_PORTRAIT,
  palette: SORC_PAL,
  lines: {
    // Core triggers.
    intro: ['M-my lord! The Spire. Mind the flask. (It bites.)'],
    firstUpgrade: ['A purchase! The literature approves. Mostly.'],
    goodsLink: ['%good%! For r-research. See GOODS.', 'Imports! The literature approves. GOODS tab.'],
    infamy50: ["We're c-cited in hero journals. Footnote 4."],
    legend: ['A hero. In MY flask. Oh no. Tap LEGEND...'],
    fall: ['The glass! The g-glass!'],
    returnFall: ['Glass swept. Tomes intact. Phew.'],
    returnLong: ['The homunculi d-distilled all night, my lord.'],
    // Milestones (fired by the scene).
    firstWider: ['More room. More... b-breathing.'],
    firstHelper: ["An apprentice! Don't touch it. (It bites too.)"],
    apprLesson: ['Their own flask. M-much safer. Right gutter.'],
    tierNew: ['A %name%! For the journal!', 'A %name%! I m-must take notes!'],
    voidStar: ['A V-VOID STAR. I need to sit.'],
    singularity: ['It ate everything. Marvelous. (Poof!)'],
    page: ['A Grimoire Page! Tomes, my lord. (Last tab.)'],
    dialRaised: ['Higher? The literature says no.', 'V-volatile! Thrilling. Terrifying.'],
    volLesson: ['Hold it. Feats need patience. (Since a vent, or 60 drops.)'],
    hazardFirst: ['Vented. My eyebrows. Again.'],
    struggle: ['P-perhaps... lower the Volatility?'],
    brim: ['The line! The l-line!', 'Merge something! Anything!'],
    bigChain: ['A c-cascade! Write that down!', 'Chain reaction! (Delightful.)'],
    farewell: ['The lab is yours, m-my lord. Careful.'],
    // Flavor (rate-limited by the core).
    ambient: [
      'Big orbs sink. Small ones... float. Footnote 2.',
      'Same colors touch, they j-join. Mostly.',
      'Plan two orbs ahead. The preview, top left.',
      'One drop, many merges. Pays b-better.',
      "I was singed once. Or twice. It's a theme.",
      'Volatility pays more. Burns more. Hm.',
    ],
  },
};

export const onboarding: OnboardingStep[] = [
  { id: 'aim', line: 'G-gently. Drag in the flask... then let go.', done: (s) => st(s).drops >= 1 },
  { id: 'merge', line: 'Two alike... they j-join! Drop on the twin.', done: (s) => st(s).merges >= 1 },
  { id: 'upgrade', line: 'Stronger mana. UPGRADES, Potent Mana. (See footnote.)', done: (s) => lvOf(run(s), 'potent') >= 1 },
  { id: 'chains', line: 'One drop, many merges. Resonance pays!', done: (s) => st(s).bestChain >= 2 || st(s).drops >= 12 },
  { id: 'line', line: "D-don't cross the dashed line. Please.", done: (s) => st(s).dropsSinceVent >= 5 && st(s).drops >= 14 },
];

// Commendations live in def.ts (pure, shared with the balance sim).
export { commendations } from './def';
