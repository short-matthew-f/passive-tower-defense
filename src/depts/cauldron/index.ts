// The Cauldron (specs/05): idle plinko. Toadlings pour a constant rain of foul ingredients;
// the Overlord steers it by cursing pegs into Ladles and Tossing Granny's spoon down a chute.
import type { DeptDef } from '../../core/dept';
import { cauldronEcon } from './def';
import { granny, lessons, onboarding } from './granny';
import { cauldronLastStand } from './laststand';
import { CauldronScene } from './scene';
import { sfx } from './sfx';
import type { CRun } from './econ';

export const cauldron: DeptDef = {
  ...cauldronEcon,
  name: 'The Cauldron',
  currency: 'Bile',
  currencyColor: '#9ad43a',
  doorColor: 0x4a7a22,
  // Granny cackles for the core's lines (intro, Legend, returns, beats); her own stay quiet.
  manager: { ...granny, voice: (_line, i) => i.source !== 'dept' && i.source !== 'beat' && sfx.cackle(i.vol) },
  // Head Start grants Malice levels without the first purchase that runs the lesson.
  dialLessons: { malice: (s) => (s.run as CRun)?.maliceBought ?? 0 },
  onboarding,
  lessons,
  legend: {
    name: 'Dame Brightjaw the Unreasonably Tall',
    line: "I've come to scrub your pot, hag. With a sword.",
  },
  createScene: (ctx) => new CauldronScene(ctx),
  lastStand: (ctx) => cauldronLastStand(ctx),
};
