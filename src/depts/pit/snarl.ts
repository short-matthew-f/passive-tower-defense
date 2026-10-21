// Snarl, the War Pit's manager (07 §18): a scarred gnoll pitmaster, gruff coach and bookie.
// Terse betting slang, calls the Overlord "Chief", whistles instead of praising. Every readable
// line is <= 32 characters (00 §5.4.6 lint). Onboarding is learned by doing (6 beats, the first
// purchase in beat 1); the Brand, stationing, Stakes, the tactics cards, freezing and Huntmaster
// scars are micro-lessons (00 §5.4.2).
import type { ManagerDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { SNARL_IDLE, SNARL_PAL, SNARL_TALK } from './art';
import type { PitRun } from './def';

const run = (s: DeptSave) => s.run as PitRun;
const cur = (s: DeptSave) => run(s)?.cur ?? null;
const open = (s: DeptSave) => !!cur(s) && !cur(s)!.ended;
const seen = (s: DeptSave, k: string) => !!s.seen?.[k];

export const snarl: ManagerDef = {
  name: 'Snarl',
  title: 'Pitmaster',
  portrait: [SNARL_IDLE, SNARL_TALK],
  palette: SNARL_PAL,
  lines: {
    // Core-fired triggers.
    intro: ['Chief. Welcome to the Pit.', 'Fresh meat? No. You. Welcome.'],
    firstUpgrade: ['Money down. Good bet.', 'First bet placed. *tweet*'],
    goodsLink: ['%good%! Good stuff, Chief.', 'Ghost dogs! Fainted come back!'],
    infamy50: ['A Crown. Rivals are talking.', 'Odds on you now, Chief.'],
    infamy100: ['Whole realm bets on you now.', 'Top of the board, Chief.'],
    legend: ['Barehanded type. Hide the pups.', 'Big one at the gate. Ugh.'],
    fall: ['Cages open. Pups loose. Ugh.', 'He beat em all. Barehanded.'],
    returnFall: ['Cages fixed. New purse. Go.', 'New season. Same Snarl. Go.'],
    returnLong: ['Gnolls ran the Pit. Count teeth.', 'Back? Gauntlets kept going.'],
    returnLong3d: ['Days gone! Pups ate the books.', 'Thought you quit, Chief.'],
    report: [
      'Gauntlets paid. Jar is fuller.',
      'Pups won some. Lost some. Paid.',
      'Rivals keep coming. Good.',
      'Crowd wants a Run, Chief.',
      'Teeth counted. Twice.',
      'Kennel boys fed. Mostly.',
    ],
    ambient: [
      'Read the scout. Counter it.',
      'Freeze the good ones.',
      'Snipers back. Tanks up front.',
      'Rats are cheap. Rats multiply.',
      'Sell a piglet, buy a pudding.',
      'Gnolls bet on you. Mostly.',
    ],
    // Milestones (fired by the scene, typed).
    firstPliers: ['Pliers. Every tooth counts.', 'More teeth per mouth. Good.'],
    firstHelper: ["Garrison's drilling. Good.", 'Drill yard open. Hup hup.'],
    tierL3: ["Level three! Now we're betting.", 'A level three! *tweet*'],
    triumph: ['Huntmaster down. Not bad, Chief.', 'Net torn! Crowd loves it.'],
    crown: ['A Crown! Odds just shifted.', 'Crowned at the target. *tweet*'],
    dialRaised: ['Higher stakes. Nastier tricks.', 'Big bets. Big teeth.'],
    stakesMax: ['New high bet. Rivals sharpen.', 'Never bet this high. Go.'],
    hazardFirst: ['Retreat. Teeth banked. Again.', 'Lost? Paid anyway. Again.'],
    struggle: ['Odds are bad. Drop Stakes?', 'Bad streak. Drop 2 Stakes?'],
    scar: ["He's limping, Chief. Again.", 'Huntmaster scarred. Push.'],
    // Flavour (untyped, Full only and rate-limited by the director).
    merge: ['Two of a kind. Stack em.', 'Stacked. *tweet*'],
    hunt: ['Huntmaster next. Nets, tricks.', 'The big one. Steady, Chief.'],
    win: ['Clean.', 'Paid out.', 'Rookie numbers. For them.'],
    loss: ['Shake it off.', 'Bad spread. Next.'],
    flavor: [
      'Front takes the hits. Always.',
      'Three of a kind? Level two.',
      'Hold a beast to read it.',
      'Drag beasts. Or tap-tap.',
    ],
    // Micro-lesson lines live in the beats below.
  },
};

/** The intro (07 §18): ~90 s, Snarl's 120-Teeth purse and the starter garrison. */
export const onboarding: OnboardingStep[] = [
  { id: 'purse', line: 'Purse is yours, Chief. Spend.', target: 'upgrades', sheetTarget: 'hardy', gesture: 'tap', done: (s) => Object.values(run(s)?.lv ?? {}).some((l) => l > 0) || (run(s)?.stakesBought ?? 0) > 0 },
  { id: 'start', line: 'Start a Run. Draft beasts.', target: 'start', gesture: 'tap', done: (s) => !!cur(s) || seen(s, 'pit.buy') },
  { id: 'buy', line: 'Pick a beast. Tap, then a slot.', target: 'shop.0', gesture: 'tap', waitFor: open, done: (s) => seen(s, 'pit.buy') },
  { id: 'line', line: 'Front is left. Takes the hits.', target: 'line.last', gesture: 'drag', dragTo: 'line.0', waitFor: (s) => open(s) && (cur(s)!.line.filter(Boolean).length ?? 0) > 0, done: (s) => seen(s, 'pit.move') || seen(s, 'pit.fight') },
  { id: 'fight', line: "Hands off. Watch 'em work.", target: 'fight', gesture: 'tap', waitFor: (s) => open(s) && cur(s)!.line.some(Boolean), done: (s) => seen(s, 'pit.fight') },
  { id: 'merge', line: "Two of a kind? Stack 'em.", target: 'shop.twin', gesture: 'drag', dragTo: 'line.twin', waitFor: (s) => open(s) && hasTwin(s), done: (s) => seen(s, 'pit.merge') },
];

function hasTwin(s: DeptSave): boolean {
  const rs = cur(s);
  if (!rs) return false;
  return rs.shop.some((u) => u && rs.line.some((p) => p && p.k === u.k && p.xp < 5));
}

/** Micro-lessons (mechanic_unlocked, 07 §18), replayable from Settings -> Managers. */
export const lessons: Record<string, OnboardingStep[]> = {
  brand: [{ id: 'brand', line: 'Brand your best. One per Run.', target: 'line.best', gesture: 'tap', waitFor: open, done: (s) => seen(s, 'pit.branded') || !open(s) || !!cur(s)?.brandUsed }],
  station: [
    { id: 'compare', line: 'Old Teeth/min vs new. Read.', target: 'summary.rate', gesture: 'tap', waitFor: (s) => !!cur(s)?.ended, done: (s) => seen(s, 'pit.cmp') || !cur(s)?.ended },
    { id: 'confirm', line: 'Your Run, their day job.', target: 'station', gesture: 'tap', waitFor: (s) => !!cur(s)?.ended, done: (s) => (run(s)?.stats?.stations ?? 0) > 0 || !cur(s)?.ended },
  ],
  stakes: [
    { id: 'set', line: 'Set Stakes here. Down is free.', target: 'stakes', gesture: 'tap', waitFor: (s) => !open(s) && !cur(s)?.ended, done: (s) => seen(s, 'pit.stakesSet') || (run(s)?.stakesBought ?? 0) >= 3 },
    { id: 'card', line: 'At 3: rival tricks. Read em.', target: 'tactics', gesture: 'tap', waitFor: (s) => !open(s) && !cur(s)?.ended, done: (s) => seen(s, 'pit.tactics') || (run(s)?.stakesBought ?? 0) >= 3 },
  ],
  cards: [{ id: 'card', line: 'New rival trick. Tap to read.', target: 'tactics', gesture: 'tap', waitFor: (s) => !open(s) && !cur(s)?.ended, done: (s) => seen(s, 'pit.tactics2') }],
  freeze: [{ id: 'freeze', line: 'Freeze it. Keeps through rolls.', target: 'freeze.0', gesture: 'tap', waitFor: open, done: (s) => seen(s, 'pit.frozen') || !open(s) }],
  scars: [{ id: 'scar', line: "Scarred. He's weaker now.", target: 'rival', gesture: 'tap', waitFor: open, done: (s) => seen(s, 'pit.scout') || !open(s) }],
  skins: [{ id: 'skin', line: 'Crests buy coats. Tap twice.', target: 'line.0', gesture: 'tap', waitFor: (s) => !open(s) && !cur(s)?.ended, done: (s) => seen(s, 'pit.skins') }],
};
