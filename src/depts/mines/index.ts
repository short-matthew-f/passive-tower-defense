// The Goblin Mines (Department of Extraction), specs/02. Smash the rock wall, hire a goblin
// crew, dig deeper, and later haul in the Doom Drum. Manager: Gritch.
import type { DeptDef } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { GRITCH_IDLE, GRITCH_PALETTE, GRITCH_TALK } from './art';
import { minesEcon } from './def';
import * as M from './model';
import { MinesScene } from './scene';

const run = (s: DeptSave) => s.run as M.MinesRun;

export const mines: DeptDef = {
  ...minesEcon,
  name: 'Goblin Mines',
  currency: 'Nuggets',
  currencyColor: '#e8b04a',
  doorColor: 0x7a5230,

  manager: {
    name: 'Gritch',
    title: 'Foreman',
    portrait: [GRITCH_IDLE, GRITCH_TALK],
    palette: GRITCH_PALETTE,
    lines: {
      intro: ['BOSS! YOU CAME DOWN! THE CREW IS... THRILLED. SMASH ROCKS, GET {coin}!'],
      firstUpgrade: ['BIGGER FIST! OOOH. THE ROCKS ARE SCARED NOW, BOSS!', 'SHINY UPGRADE! DO AGAIN!'],
      critBuy: ['CRUNCH! DO AGAIN, BOSS!', 'MORE CRUNCH! GOOD CRUNCH!'],
      firstGoblin: ['THAT IS SNIK. HE WORKS FOR SHINIES. MOSTLY.', 'NEW GRUNT! HE BITES. ROCKS, MOSTLY.'],
      fourGoblins: ['FULL LEDGE, BOSS! ...ALMOST.', 'FOUR GOBLINS! A CREW! A MOB!'],
      stratum: ['%name%! SHINIER! HARDER!', '%name% LAYER, BOSS! SMELLS RICH!'],
      dialRaised: ['DEEPER! SMELLS LIKE GEMS.', 'DOWN WE GO! WATCH YOUR HEAD!'],
      kegLesson: ['KEG! TAP IT. THEN DUCK!', 'RED BARREL! TAP IT NEAR BIG ROCKS. THEN DUCK.'],
      kegAuto: ['IT WENT BOOM BY ITSELF. NEXT ONE, YOU LIGHT IT!'],
      caveIn: ['CAVE-IN! RUBBLE! SWIPE TO RAKE IT!'],
      drumReady: ['BOSS. THE DRUM. BUY THE DRUM. {gem}', 'GEMS ENOUGH FOR THE DOOM DRUM! UPGRADES, DRUM TAB!'],
      drumBought: ['BOOM BOOM BOOM! TAP WHEN THE RING CLOSES!'],
      drumLesson: ['FOUR ON THE BOOM! MISS? STILL A HIT! MORE DRUM = MORE BOOM.'],
      firstFrenzy: ['THAT FRENZY! DO AGAIN, BOSS!'],
      vein: ['SHINY!', 'GOLD! MINE! I MEAN YOURS!', 'VEIN! VEIN!'],
      gem: ['GEM! GEM! {gem}', 'PRETTY ROCK! {gem}'],
      infamy50: ['HEROES ARE TALKING ABOUT US, BOSS.'],
      legend: ['BIG HERO. BIG DRILL. UH OH.', 'A HERO AT THE SHAFT! TAP LEGEND, BOSS!'],
      returnFall: ['SHAFT IS GONE. GEMS ARE SAFE! DIG AGAIN, BOSS!'],
      fall: ['WE DIG AGAIN. WE ALWAYS DIG AGAIN.'],
      returnLong: ['CREW DUG ALL NIGHT, BOSS! {coin}'],
      flavor: [
        'SNIK SAYS HE FOUND A ROCK. IT WAS A ROCK.',
        'NO BREAKS! BREAKS ARE FOR ROCKS!',
        'CHECK THE GLINTY ONES FIRST, BOSS.',
        'DEEPER ROCKS PAY MORE. JUST SAYING.',
        'I TAUGHT THEM PICKS. THEY TAUGHT ME BITING.',
        'KEGS NEAR BIG ROCKS = BIG FUN.',
      ],
      flavorDrum: ['BOOM-TA-TA! BOOM-TA-TA!', 'HIT THE BOOM, THEN TAP ALL YOU WANT!'],
    },
  },

  onboarding: [
    { id: 'smash', line: 'BOSS! SMASH A ROCK! TAP IT! TAP TAP TAP!', done: (s) => (run(s).stats?.rocks ?? 0) >= 1 },
    { id: 'tap', line: 'BIGGER FIST! OPEN UPGRADES, BUY TAP DAMAGE!', done: (s) => run(s).tap >= 1 },
    { id: 'hire', line: 'HIRE A GOBLIN! HE WORKS FOR SHINIES.', done: (s) => M.goblins(run(s)) >= 1 },
    { id: 'vein', line: 'SHINY! SMASH THE GOLDY ROCK FIRST! 5X {coin}!', done: (s) => (run(s).stats?.veins ?? 0) >= 1 },
    { id: 'dig', line: 'DEEPER = SHINIER! SAVE UP, THEN TAP DIG!', done: (s) => run(s).maxDepth >= 2 },
  ],

  legend: {
    name: 'Sir Augustin Drillwright',
    line: 'I HAVE BROUGHT A STEAM DRILL. YOUR GOBLINS BROUGHT PICKS. ADORABLE.',
  },

  createScene: (ctx) => new MinesScene(ctx),
};
