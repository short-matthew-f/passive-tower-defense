// The Troll Bridge (Department of Border Control), specs/06. Size up each traveler, catch the
// lie between their Claim and their look, squeeze them for a toll, unmask disguised heroes.
// Manager: Grumm, who speaks in icons and grunts (06 §18, README OQ 27).
import type { DeptDef, ManagerDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { GRUMM_IDLE, GRUMM_PAL, GRUMM_TALK } from './art';
import { bridgeEcon } from './def';
import * as M from './model';
import { BridgeScene } from './scene';

const run = (s: DeptSave) => s.run as M.BridgeRun;
const st = (s: DeptSave) => run(s).stats ?? M.defaultStats();
const lv = (s: DeptSave) => run(s).lv ?? M.defaultLevels();

// Grumm is the suite's icon-only manager: his lines are grunts, icons and 1-3 word troll-speak.
// Onboarding lines still say plainly what to do (task brief), in his voice.
const grumm: ManagerDef = {
  name: 'Grumm',
  title: 'Bridge Troll',
  portrait: [GRUMM_IDLE, GRUMM_TALK],
  palette: GRUMM_PAL,
  lines: {
    intro: ['HRRM! GRUMM BRIDGE. GRUMM PROUD. YOU BOSS. {coin}{coin}'],
    firstUpgrade: ['OOH! SHINY! GRUMM LIKE.'],
    senseUp: ['GRUMM SEE PURSES NOW. GREEN BAND = PURSE.'],
    firstHelper: ['GRUMM HAVE GANG! GOONS GOONS GOONS.'],
    tier10x: ['BIG HERO. BIG COINS! {coin}{coin}{coin}'],
    card_writ: ['NEW RULE: WRITS! SEAL MUST MATCH POSTER. GRUMM WATCH.'],
    card_hats: ['NEW RULE: TALL HAT = GOODS INSIDE. SEARCH!'],
    card_kits: ['NEW RULE: ONE FAKE TELL. POSTER SAY WHICH. IGNORE IT.'],
    dialRaised: ['SCARIER SIGN. MORE COINS. {up}{coin}', 'GRRR! SIGN SCARY NOW. HEROES SNEAKY.'],
    hazardFirst: ['BONK. OW. GRUMM NAP. TAP GRUMM TO WAKE.'],
    struggle: ['GRUMM WRONG. GRUMM SAD. LOOK AT POSTER?'],
    showdown: ['LETTER! BIG HERO COMING. GRUMM WATCH CLOSE.'],
    goodsLink: ['%good%! GRUMM LIKE. GOODS!', 'PRESENT FOR GRUMM? GOODS! {up}'],
    infamy50: ['BOSS FAMOUS. GRUMM PROUD. {up}'],
    legend: ['BIG ONE COMING. TAP LEGEND. HE... WALK OVER.'],
    fall: ['BRIDGE BROKE. GRUMM FIX.'],
    returnFall: ['BRIDGE FIXED. GRUMM READY. {coin}?'],
    returnLong: ['GOONS WORKED. GRUMM SLEPT. {coin}'],
    flavor: [
      'GRUMM POLISH RAIL. SHINY.',
      'PILGRIM NO HAVE BOOTS. BARE FEET!',
      'GLOW = HERO. HERO = {coin}{coin}.',
      'BIG SACK ON PEASANT? SEARCH!',
      'ONE, TWO, MANY COINS. GOOD.',
      'MERCHANT FAT PURSE. ASK MORE.',
      'BRUTES BONK. NO PUSH BRUTES.',
      'GRUMM BRIDGE BEST BRIDGE.',
    ],
  },
};

const onboarding: OnboardingStep[] = [
  { id: 'toll', line: 'TOLL! DRAG COINS UP ON THE RIGHT, LET GO. GREEN BAND = PURSE.', done: (s) => st(s).tolls >= 1 },
  { id: 'hire', line: 'GRUMM WANT GANG. TAP UPGRADES, GOONS: HIRE GOON.', done: (s) => lv(s).goons >= 1 },
  { id: 'unmask', line: 'PILGRIM WITH STEEL BOOTS + GLOW? LIAR! HOLD UNMASK.', done: (s) => st(s).unmasks >= 1 },
  { id: 'search', line: 'PEASANT WITH BIG BARREL? GOODS! HOLD SEARCH.', done: (s) => st(s).confisc >= 1 },
  { id: 'poster', line: 'TAP WANTED POSTER (LEFT). WHO LOOKS LIKE WHAT!', done: (s) => st(s).posterOpens >= 1 },
];

export const bridge: DeptDef = {
  ...bridgeEcon,
  name: 'Troll Bridge',
  currency: 'Tollpence',
  currencyColor: '#e8c04a',
  doorColor: 0x5a6a3a,
  manager: grumm,
  onboarding,
  legend: {
    name: 'Sir Strollsworth the Unbothered',
    line: 'TOLL? I HAVE NO COIN. I HAVE A VERY LARGE SWORD. GOOD DAY, TROLL.',
  },
  createScene: (ctx) => new BridgeScene(ctx),
};
