// The War Pit (Department of Blood Sport), specs/07. Draft a warband from the Overlord's
// menagerie, line it up and watch it maul rival warlords' beasts; Snarl's kennel gnolls run
// Skirmish Gauntlets with the Standing Warband while you're away. Manager: Snarl (07 §18).
import type { DeptDef } from '../../core/dept';
import { pitEcon } from './def';
import { lessons, onboarding, snarl } from './snarl';
import { pitLastStand } from './laststand';
import { PitScene } from './scene';
import { sfx } from './sfx';
import type { PitRun } from './def';

export const pit: DeptDef = {
  ...pitEcon,
  name: 'War Pit',
  currency: 'Teeth',
  currencyColor: '#f4ecd8',
  doorColor: 0x6a2a1a,
  // The scene blips its own say() calls; Snarl voices the core's lines (intro, Legend, beats ...).
  manager: { ...snarl, voice: (_line, i) => i.source !== 'dept' && sfx.snarl(i.vol, 2 + Math.floor(Math.random() * 2)) },
  // Head Start grants Stakes levels without the first purchase that runs the lesson.
  dialLessons: { stakes: (s) => (s.run as PitRun)?.stakesBought ?? 0 },
  onboarding,
  lessons,
  lastStand: pitLastStand,
  legend: {
    name: 'Brakka Bare-Knuckle',
    line: 'BEASTS? I BRUSH MY TEETH WITH BEASTS. OPEN THE CAGES, DOGGY.',
  },
  createScene: (ctx) => new PitScene(ctx),
};
