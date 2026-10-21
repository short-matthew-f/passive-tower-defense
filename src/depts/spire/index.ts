// The Sorcerer's Spire (Department of Arcane Production), specs/04. Drag to aim, drop mana orbs
// into the flask, merge them up to a Void Star and a Singularity; homunculus apprentices distill
// in their own little flask for idle income. Manager: the Head Sorcerer.
import type { DeptDef } from '../../core/dept';
import { spireEcon } from './def';
import { lessons, onboarding, sorcerer } from './sorcerer';
import { spireLastStand } from './laststand';
import { SpireScene } from './scene';
import type { SpireRun } from './def';

export const spire: DeptDef = {
  ...spireEcon,
  name: "Sorcerer's Spire",
  currency: 'Arcana',
  currencyColor: '#c070ff',
  doorColor: 0x4a2a7a,
  manager: sorcerer,
  // Head Start grants Volatility levels without the first purchase that runs the lesson.
  dialLessons: { volatility: (s) => (s.run as SpireRun)?.volBought ?? 0 },
  onboarding,
  lessons,
  lastStand: spireLastStand,
  legend: {
    name: 'Brother Quell the Unflinching',
    line: "Your flask is full of doom, lich. I'm going in.",
  },
  createScene: (ctx) => new SpireScene(ctx),
};
