// The Head Sorcerer, the Spire's manager (04 §18): a nervous, permanently singed lich who stammers,
// cites "the literature" and calls the Overlord "M-my lord". Readable lines stay <= 32 characters
// with a stammer or a parenthetical. Onboarding is learned by doing (5 beats, first purchase on
// beat 3); later mechanics get 1-2 beat micro-lessons (00 §5.4.2).
import type { ManagerDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { SORC_IDLE_FRAME, SORC_PAL, SORC_PORTRAIT, type SorcMood } from './art';
import { sfx } from './sfx';
import { defaultStats, lvOf, UP, upCost, type SpireRun } from './def';

const run = (s: DeptSave) => s.run as SpireRun;
const st = (s: DeptSave) => run(s).stats ?? defaultStats();

/** True once `n` drops have happened since this check first ran for `key` (a watch-beat that still
 * waits for the player to act). The start mark lives in DeptSave.seen. */
function dropsSince(s: DeptSave, key: string, n: number): boolean {
  const k = `sp.${key}`;
  const d = st(s).drops;
  if (s.seen[k] === undefined) s.seen[k] = d;
  return d - s.seen[k] >= n;
}

/** Drops since this beat began without a vent in between. */
function cleanDropsSince(s: DeptSave, key: string, n: number): boolean {
  return dropsSince(s, key, n) && st(s).dropsSinceVent >= n;
}

const anyBought = (s: DeptSave) => Object.values(run(s).lv ?? {}).some((l) => l > 0);

/** An expression's idle frame plus a talking frame (the mood's eyes, the talking mouth). */
function expr(mood: SorcMood): string[][] {
  const idle = SORC_IDLE_FRAME(mood);
  const talk = SORC_PORTRAIT[1];
  return [idle, idle.map((row, y) => (y >= 7 && y <= 9 ? talk[y] : row))];
}

export const sorcerer: ManagerDef = {
  name: 'Head Sorcerer',
  title: 'Head Sorcerer',
  portrait: SORC_PORTRAIT,
  palette: SORC_PAL,
  // 04 §18 expressions on the strip portrait too (the scene passes its mood with each line).
  expressions: {
    scared: expr('scared'),
    singed: expr('singed'),
    lecture: [SORC_IDLE_FRAME('lecture')],
    relieved: expr('relieved'),
    happy: [SORC_PORTRAIT[1], SORC_PORTRAIT[0]],
  },
  moods: { legend: 'scared', infamy100: 'scared', fall: 'singed', returnFall: 'relieved', firstUpgrade: 'lecture' },
  voice: (line, i) => sfx.mutter(i.vol, Math.min(4, 2 + Math.floor(line.length / 12))),
  lines: {
    // ----- core-fired -----
    intro: ['M-my lord! The Spire. It bites.', 'Welcome. Mind the g-glass.'],
    firstUpgrade: ['Bought! (The literature nods.)', 'Bought! Footnote: well spent.'],
    goodsLink: ['%good%! For r-research. (GOODS)', 'Imports! Fewer shards. (GOODS)'],
    infamy50: ["We're cited in hero journals.", 'Heroes read about us. (Gulp.)'],
    infamy100: ['A hero is c-coming. I know it.', 'Infamy full. The flask trembles.'],
    legend: ['A hero. In MY flask. Oh no.', 'He wants to j-jump in. Why?!'],
    fall: ['The glass! The g-glass!', 'My notes! My beautiful notes!'],
    returnFall: ['Glass swept. Tomes intact. Phew.', 'New flask. Same Tomes. (Relief.)'],
    returnLong: ['The homunculi d-distilled. Look!', 'They kept brewing. M-mostly.'],
    returnLong3d: ['M-my lord! Days! So much dust!', 'You were gone. I wrote a thesis.'],
    // ----- milestones (typed, 04 §18 table) -----
    firstWider: ['More room. More... b-breathing.', 'Wider glass! (Footnote: whew.)'],
    firstHelper: ["An apprentice! Don't touch it.", 'A homunculus! It b-bites. Hm.'],
    tierNew: ['%name%! For the journal!', '%name%! M-must take notes!'],
    voidStar: ['A V-VOID STAR. I need to sit.', 'A Void Star! (Faints politely.)'],
    singularity: ['It ate everything. Marvelous.', 'Singularity! My eyebrows. Gone.'],
    dialRaised: ['Higher? The literature says no.', 'V-volatile! Thrilling. Awful.'],
    hazardFirst: ['Vented. My eyebrows. Again.', 'Puff! (Cough.) Salvaged fumes.'],
    struggle: ['Perhaps... lower Volatility?', 'S-so many vents. Turn it down?'],
    hexShatter: ['Three hexes, gone! Tidy.', 'Hex triple! (Cursed, but paid.)'],
    bigChain: ['That cascade! Noted. Twice.', 'What a chain! (Delightful.)'],
    farewell: ['The lab is yours, m-my lord.', 'Carry on. I shall... hide.'],
    // ----- Gobbo's report (00 §5.4.7) -----
    report: [
      'The flask behaved. Mostly.',
      'Apprentices brewed. (No fires.)',
      'Arcana distilled. Glass intact.',
      'One small explosion. Ignore it.',
      'Notes taken. Orbs merged. Yes.',
      'The homunculi want a raise.',
    ],
    // ----- ambient (Full only, the director paces it) -----
    ambient: [
      'Big orbs sink. Small ones float.',
      'Same colours touch... they join.',
      'Plan ahead. See the preview?',
      'One drop, many merges. Pays.',
      "I was singed once. It's a theme.",
      'Volatility pays. And burns. Hm.',
    ],
  },
};

export const onboarding: OnboardingStep[] = [
  {
    id: 'aim',
    line: 'G-gently. Drag... then let go.',
    target: 'aim',
    gesture: 'drag',
    dragTo: 'aim.right',
    done: (s) => st(s).drops >= 1,
  },
  {
    id: 'merge',
    line: 'Two alike... they j-join!',
    target: 'aim',
    gesture: 'drag',
    dragTo: 'aim.left',
    done: (s) => st(s).merges >= 1,
  },
  {
    // The first purchase (beat 3; 00 §8 first upgrade < 60 s). Waits, strip hidden, until affordable.
    id: 'upgrade',
    line: 'Stronger mana. (See footnote.)',
    target: 'btn.upgrades',
    gesture: 'tap',
    waitFor: (s) => run(s).bank >= upCost(UP.potent, 0) || anyBought(s),
    done: (s) => lvOf(run(s), 'potent') >= 1 || anyBought(s),
  },
  {
    // A watch-beat: a 2-merge cascade, or 8 more drops.
    id: 'chains',
    line: 'One drop, many merges. Pays!',
    target: 'res',
    done: (s) => st(s).bestChain >= 2 || dropsSince(s, 'ob.chains', 8),
  },
  {
    id: 'line',
    line: "D-don't cross the line. Please.",
    target: 'brimZone',
    done: (s) => cleanDropsSince(s, 'ob.line', 5),
  },
];

/** Micro-lessons (00 §5.4.2), fired on `mechanic_unlocked` or by ctx.lesson(id). */
export const lessons: Record<string, OnboardingStep[]> = {
  apprentices: [{ id: 'flask', line: 'Their own flask. M-much safer.', target: 'appr', done: (s) => dropsSince(s, 'ls.appr', 2) }],
  volatility: [
    { id: 'turn', line: 'Turn it up. Tap + on the dial.', target: 'vol.up', gesture: 'tap', done: (s) => run(s).vol >= 1 },
    { id: 'hold', line: 'Hold it. Feats need patience.', target: 'feat', done: (s) => dropsSince(s, 'ls.vol', 6) },
  ],
  vents: [{ id: 'below', line: 'Keep orbs under the dashes!', target: 'brimZone', done: (s) => cleanDropsSince(s, 'ls.vents', 3) }],
  singularity: [{ id: 'page', line: 'A Grimoire Page! (For Tomes.)', target: 'pages', done: (s) => dropsSince(s, 'ls.sing', 2) }],
  tomes: [{ id: 'shelf', line: 'Tomes: UPGRADES, last tab.', target: 'btn.upgrades', gesture: 'tap', done: (s) => !!s.seen['sp.sheetPages'] }],
  catalyst: [
    {
      id: 'drop',
      line: 'Catalyst! Drop it on a big one.',
      target: 'aim',
      gesture: 'drag',
      dragTo: 'aim.right',
      done: (s) => st(s).catalysts >= 1 || dropsSince(s, 'ls.cat', 3),
    },
  ],
  hex: [{ id: 'herd', line: 'Hex Stones: three touch... pop.', target: 'aim', done: (s) => st(s).hexShatters >= 1 || dropsSince(s, 'ls.hex', 4) }],
  tremor: [
    {
      id: 'shake',
      line: 'Flick up, or tap SHAKE. Gently.',
      target: 'btn.tremor',
      gesture: 'tap',
      done: (s) => st(s).tremors >= 1,
    },
  ],
  quick: [{ id: 'bead', line: 'Quicksilver shoves. Then melts.', target: 'btn.quick', gesture: 'tap', done: (s) => st(s).quicks >= 1 }],
  settle: [{ id: 'vent', line: 'Vent Now: half back. Tidy!', target: 'btn.vent', done: (s) => st(s).ventNows >= 1 || dropsSince(s, 'ls.settle', 10) }],
};

// Commendations live in def.ts (pure, shared with the balance sim).
export { commendations } from './def';
