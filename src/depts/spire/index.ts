// The Sorcerer's Spire (Department of Arcane Production), specs/04. Drag to aim, drop mana orbs
// into the flask, merge them up to a Void Star and a Singularity; homunculus apprentices distill
// in their own little flask for idle income. Manager: the Head Sorcerer.
import type { DeptDef } from '../../core/dept';
import { spireEcon } from './def';
import { onboarding, sorcerer } from './sorcerer';
import { SpireScene } from './scene';

export const spire: DeptDef = {
  ...spireEcon,
  name: "Sorcerer's Spire",
  currency: 'Arcana',
  currencyColor: '#c070ff',
  doorColor: 0x4a2a7a,
  manager: sorcerer,
  onboarding,
  legend: {
    name: 'Brother Quell the Unflinching',
    line: "Your flask is full of doom, lich. I'm going in.",
  },
  createScene: (ctx) => new SpireScene(ctx),
};
