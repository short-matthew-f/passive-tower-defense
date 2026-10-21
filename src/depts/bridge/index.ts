// The Troll Bridge (Department of Border Control), specs/06. Size up each traveler, catch the
// lie between their Claim and their look, squeeze them for a toll, unmask disguised heroes.
// Manager: Grumm, who speaks in icons and grunts (06 §18, README OQ 27).
import type { Commendation, DeptDef, ManagerDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { GRUMM_IDLE, GRUMM_PAL, GRUMM_TALK } from './art';
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

const commendations: Commendation[] = [
  { id: 'toll1', label: 'FIRST TOLL', test: (s) => st(s).tolls >= 1 },
  { id: 'goon', label: 'HIRED MUSCLE', test: (s) => lv(s).goons >= 1 },
  { id: 'unmask1', label: 'A HERO UNMASKED', test: (s) => st(s).unmasks >= 1 },
  { id: 'eels', label: 'PICKLED EELS SEIZED', test: (s) => st(s).confisc >= 1 },
  { id: 'big', label: 'BOUNTY X10', test: (s) => st(s).bounty10 >= 1 },
  { id: 'streak', label: 'STREAK OF 10', test: (s) => st(s).bestStreak >= 10 },
  { id: 'writs', label: 'WRITS PLEASE (MENACE 3)', test: (s) => (run(s).menaceMax ?? 0) >= 3 },
  { id: 'hundred', label: '100 TRAVELERS', test: (s) => st(s).travelers >= 100 },
];

export const bridge: DeptDef = {
  id: 'bridge',
  name: 'Troll Bridge',
  currency: 'Tollpence',
  currencyColor: '#e8c04a',
  doorColor: 0x5a6a3a,
  version: 1,
  defaultRun: () => M.defaultRun(),
  defaultPersistent: () => M.defaultPersistent(),

  idleRate(save) {
    const r = run(save);
    if (!r || !r.lv) return 0;
    return M.idleTollpence(r);
  },

  // Infamy skill gate (00 §2.2, 06 §7): 5 evidence-backed Unmasks at Menace >= min(4 + 2N, 20).
  skillTarget: (n) => Math.min(4 + 2 * n, 20),
  skillLabel: (t) => `5 PROVEN UNMASKS AT MENACE ${t}`,

  // Seeds from a greedy bot on model.ts (scratch script; active play ~2.5-3x idle, Menace bought
  // as soon as affordable after 10 min):
  //  - cycle earnings ~55K at 2 h, ~80K at 2.5 h, ~107K at 3 h. 00 §2.2 wants E0 about 2.5 h
  //    active-equivalent into the first cycle, so E0 = 8e4 (x3 per Fall).
  //  - Menace 4 (the first skill target) is bought at ~2 h; 5 proven Unmasks there take ~10-20
  //    min of play (heroes are ~9% of traffic, about half show 2+ clues).
  //  - rankRef: on-screen idle ~10 min in (3 goons, little signage) is ~1.2/s.
  //  - rankTarget: idle at the first 100% Infamy (Menace 4, signage ~12, pricing ~13) is ~6/s.
  econBase: 8e4,
  rankRef: 1,
  rankTarget: 6,

  commendations,
  manager: grumm,
  onboarding,
  legend: {
    name: 'Sir Strollsworth the Unbothered',
    line: 'TOLL? I HAVE NO COIN. I HAVE A VERY LARGE SWORD. GOOD DAY, TROLL.',
  },
  createScene: (ctx) => new BridgeScene(ctx),
};
