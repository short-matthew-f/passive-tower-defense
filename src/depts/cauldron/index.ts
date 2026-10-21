// The Cauldron (specs/05): idle plinko. Toadlings pour a constant rain of foul ingredients;
// the Overlord steers it by cursing pegs into Ladles and Tossing Granny's spoon down a chute.
import type { DeptDef } from '../../core/dept';
import { cauldronEcon } from './def';
import { granny, lessons, onboarding } from './granny';
import { cauldronLastStand } from './laststand';
import { CauldronScene } from './scene';

export const cauldron: DeptDef = {
  ...cauldronEcon,
  name: 'The Cauldron',
  currency: 'Bile',
  currencyColor: '#9ad43a',
  doorColor: 0x4a7a22,
  manager: granny,
  onboarding,
  lessons,
  legend: {
    name: 'Dame Brightjaw the Unreasonably Tall',
    line: "I've come to scrub your pot, hag. With a sword.",
  },
  createScene: (ctx) => new CauldronScene(ctx),
  lastStand: (ctx) => cauldronLastStand(ctx),
};
