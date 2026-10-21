// The War Pit (Department of Blood Sport), specs/07. Draft a warband from the Overlord's
// menagerie, line it up and watch it maul rival warlords' beasts; Snarl's kennel gnolls run
// Skirmish Gauntlets with the Standing Warband while you're away. Manager: Snarl (07 §18).
import type { DeptDef } from '../../core/dept';
import { pitEcon } from './def';
import { onboarding, snarl } from './snarl';
import { PitScene } from './scene';

export const pit: DeptDef = {
  ...pitEcon,
  name: 'War Pit',
  currency: 'Teeth',
  currencyColor: '#f4ecd8',
  doorColor: 0x6a2a1a,
  manager: snarl,
  onboarding,
  legend: {
    name: 'Brakka Bare-Knuckle',
    line: 'BEASTS? I BRUSH MY TEETH WITH BEASTS. OPEN THE CAGES, DOGGY.',
  },
  createScene: (ctx) => new PitScene(ctx),
};
