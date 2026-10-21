// Snarl, the War Pit's manager (07 §18): a scarred gnoll pitmaster, gruff coach and bookie.
// Terse betting slang, calls the Overlord "Chief", whistles instead of praising. Lines <= 32 chars.
// Onboarding is learned by doing (5 steps); stationing, the Brand and Stakes are micro-lessons.
import type { ManagerDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { SNARL_IDLE, SNARL_PAL, SNARL_TALK } from './art';
import type { PitRun } from './def';

const run = (s: DeptSave) => s.run as PitRun;

export const snarl: ManagerDef = {
  name: 'Snarl',
  title: 'Pitmaster',
  portrait: [SNARL_IDLE, SNARL_TALK],
  palette: SNARL_PAL,
  lines: {
    // Core triggers.
    intro: ["Chief. Welcome to the Pit. *tweet*"],
    firstUpgrade: ['Money down. Good bet.', 'Pliers. Every tooth counts.'],
    goodsLink: ['%good%! Good stuff, Chief. GOODS tab.', 'Ghost dogs! Fainted come back! GOODS.'],
    infamy50: ['A Crown. Rivals are talking.'],
    legend: ['Barehanded type. Hide the pups. Tap LEGEND.'],
    fall: ['Cages open. Pups loose. Ugh.'],
    returnFall: ['Cages fixed. New purse. Go.'],
    returnLong: ['Gnolls ran the Pit. Count teeth.'],
    // Milestones (fired by the scene).
    firstHelper: ["Garrison's drilling. Good."],
    merge: ['Two of a kind. Stack em.', 'Stacked. *tweet*'],
    tierL3: ['Level three! Now we\'re betting.'],
    triumph: ['Huntmaster down. Not bad, Chief.', 'Crowd loves you. Again.'],
    crown: ['A Crown! Odds just shifted.'],
    station: ["Station 'em. Let 'em earn."],
    stationLesson: ['Your Run, their day job. STATION?'],
    dialRaised: ['Higher stakes. Nastier tricks.', 'Big bets. Big teeth.'],
    stakesLesson: ['Set Stakes here. Card at 3.'],
    brandLesson: ['Brand your best. One per Run.'],
    hazardFirst: ['Retreat. Teeth banked. Again.'],
    struggle: ['Odds are bad. Drop Stakes?'],
    hunt: ['Huntmaster. Nets and tricks.', 'The big one. Steady, Chief.'],
    win: ['Clean.', 'Paid out.', 'Rookie numbers. For them.'],
    loss: ['Shake it off.', 'Bad spread. Next.'],
    goods: ['Ghost dogs! Fainted come back!'],
    // Flavor (rate-limited by the core).
    flavor: [
      'Front takes the hits. Always.',
      'Read the scout. Counter it.',
      'Freeze the good ones. *tweet*',
      'Three of a kind? Level two.',
      'Snipers in back. Tanks up front.',
      'Rats are cheap. Rats multiply.',
      'Sell a piglet, buy a pudding.',
      'Gnolls bet on you. Mostly.',
    ],
  },
};

export const onboarding: OnboardingStep[] = [
  { id: 'purse', line: 'Purse is yours, Chief. Spend. UPGRADES, Kennels, Skirmish Pace.', done: (s) => Object.values(run(s)?.lv ?? {}).some((l) => l > 0) },
  { id: 'buy', line: 'START RUN. Then tap a beast in the shop, then a slot. Pick one.', done: (s) => !!s.seen['pit.buy'] },
  { id: 'line', line: 'Front is left. Front takes the hits. Tap a beast, then a slot.', done: (s) => !!s.seen['pit.move'] },
  { id: 'fight', line: 'Scout up top. Hit FIGHT. Hands off. Watch em work.', done: (s) => !!s.seen['pit.fight'] },
  { id: 'merge', line: 'Two of a kind? Tap the shop twin, then your beast. Stack em.', done: (s) => !!s.seen['pit.merge'] },
];
