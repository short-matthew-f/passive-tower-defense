// The Troll Bridge (Department of Border Control), specs/06. Size up each traveler, catch the
// lie between their Claim and their look, squeeze them for a toll, unmask disguised heroes.
// Manager: Grumm, who speaks in icons and grunts (06 §18, README OQ 27).
import type { DeptDef, ManagerDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { GRUMM_IDLE, GRUMM_PAL, GRUMM_TALK } from './art';
import { bridgeEcon } from './def';
import * as M from './model';
import { bridgeLastStand } from './laststand';
import { BridgeScene } from './scene';
import { sfx } from './sfx';

const run = (s: DeptSave) => s.run as M.BridgeRun;
const st = (s: DeptSave) => run(s).stats ?? M.defaultStats();
const lv = (s: DeptSave) => run(s).lv ?? M.defaultLevels();

// Grumm is the suite's icon-only manager (06 §18, OQ 27): in the scene he talks in icon bubbles
// that rise from his sprite (scene.ts grummSay). The shared strip still needs a readable line, so
// these are 1-5 word troll-speak (<= 32 characters) with icons; Gobbo's report lines translate.
const grumm: ManagerDef = {
  name: 'Grumm',
  title: 'Bridge Troll',
  portrait: [GRUMM_IDLE, GRUMM_TALK],
  palette: GRUMM_PAL,
  // Grumm rumbles for every strip line he shows (his in-scene icon bubbles have their own).
  voice: (line, i) => sfx.grumm(i.vol, Math.min(4, 2 + Math.floor(line.length / 14))),
  lines: {
    intro: ['HRRM! GRUMM BRIDGE. YOU BOSS.'],
    firstUpgrade: ['OOH! SHINY! GRUMM LIKE. {coin}', 'NEW THING! GRUMM PROUD.'],
    senseUp: ['GRUMM SEE PURSES! GREEN = PURSE', 'PURSE BAND! GRUMM SMELL {coin}.'],
    firstHelper: ['GOON GOON GOON! GRUMM GANG!', 'THREE GOONS. GATE NEVER SLEEP.'],
    tier10x: ['BIG HERO. BIG COINS! {coin}{coin}', 'X10! GRUMM THUMP CHEST!'],
    card_writ: ['NEW RULE: WRITS. GRUMM WATCH.', 'SEALS! CHECK POSTER. HRRM.'],
    card_hats: ['NEW RULE: TALL HATS. SEARCH!', 'HATS HIDE EELS. GRUMM KNOW.'],
    card_kits: ['NEW RULE: FAKE TELL. IGNORE!', 'POSTER SAY FAKE. NO FOOL GRUMM.'],
    card_bribe: ['NEW RULE: BRIBES. {coin} OR EELS?', 'SMUGGLER OFFER {coin}. HMMM.'],
    card_shift: ['NEW RULE: SHIFTERS. LOOK TWICE!', 'CLAIM WIGGLE? HERO! HRRM.'],
    dialRaised: ['SCARY SIGN. MORE {coin}! {up}', 'GRRR! SIGN SCARY. HEROES SNEAKY.'],
    hazardFirst: ['BONK. OW. TAP GRUMM. WAKE!', 'GRUMM BONKED. NAP. ZZZ.'],
    word: ['WORD GET AROUND. FEWER COME.', 'TOO MANY WRONG. FOLK SCARED.'],
    struggle: ['GRUMM WRONG. SAD. LOOK POSTER?', 'OOPS. POSTER HELP? {check}'],
    showdown: ['LETTER! BIG HERO COMING!', 'HERO MAD. COMES BACK. WATCH!'],
    bard: ['BARD SING! COINS SING TOO!', 'LA LA LA. {coin}{coin}. NICE.'],
    goodsLink: ['%good%! GRUMM LIKE!', 'PRESENT? %good%! {up}'],
    infamy50: ['BOSS FAMOUS. GRUMM PROUD. {up}', 'HALF FAMOUS! GRUMM THUMP!'],
    infamy100: ['BOSS VERY FAMOUS! {skull}{skull}', 'ALL KNOW BOSS. GRUMM PROUD!'],
    legend: ['BIG ONE COMING. HE... WALK OVER.', 'UH OH. BIG HERO. NO TOLL.'],
    fall: ['BRIDGE BROKE. GRUMM FIX.', 'HE WALK OVER! GRUMM BLUSH.'],
    returnFall: ['BRIDGE FIXED. GRUMM READY!', 'NEW PLANKS! BIGGER! MEANER!'],
    returnLong: ['GOONS WORKED. GRUMM SLEPT.{coin}', 'GRUMM NAP. GOONS COUNT {coin}.'],
    returnLong3d: ['BOSS GONE LONG! GOONS RICH!', 'BOSS BACK! GRUMM MISS BOSS.'],
    ambient: [
      'GRUMM POLISH RAIL. SHINY.',
      'PILGRIM NO BOOTS. BARE FEET!',
      'GLOW = HERO. HERO = {coin}{coin}.',
      'BIG SACK ON PEASANT? SEARCH!',
      'ONE, TWO, MANY COINS. GOOD.',
      'MERCHANT FAT PURSE. ASK MORE.',
      'BRUTES BONK. NO PUSH BRUTES.',
      'GRUMM BRIDGE BEST BRIDGE.',
    ],
    // Gobbo's report (00 §5.4.7): his translation of Grumm.
    report: [
      'GRUMM SAYS: MANY COINS. PROUD.',
      'GRUMM SAYS: GOONS GOOD. GATE OK.',
      'GRUMM SAYS: SHOWED ME A COIN.',
      'GRUMM SAYS: POLISHED THE RAIL.',
      'GRUMM SAYS: EELS SEIZED. YUM.',
      'GRUMM SAYS: HEROES SNEAKY. HRRM.',
    ],
  },
};

const seen = (s: DeptSave, k: string) => !!s.seen?.[k];

// Onboarding (06 §18): 6 beats, one mechanic each; first purchase at beat 3. Lines <= 32 chars.
const onboarding: OnboardingStep[] = [
  { id: 'look', line: 'LOOK! TAP THE TRAVELER.', target: 'traveler', gesture: 'tap', done: (s) => st(s).looks >= 1 || st(s).tolls >= 1 },
  { id: 'toll', line: 'DRAG COINS UP. LET GO! {coin}{uarr}', target: 'stackGrab', gesture: 'drag', dragTo: 'stackBand', done: (s) => st(s).tolls >= 1 },
  {
    id: 'hire',
    line: 'GOON! UPGRADES: HIRE GOON {coin}',
    target: 'upgrades',
    gesture: 'tap',
    waitFor: (s) => run(s).bank >= M.nodeCost('goons', 0),
    done: (s) => lv(s).goons >= 1,
  },
  { id: 'unmask', line: 'PILGRIM BOOTS? GLOW? HOLD UNMASK', target: 'unmask', gesture: 'hold', waitFor: (s) => seen(s, 'b.obr.unmask'), done: (s) => st(s).unmasks >= 1 },
  { id: 'search', line: 'BIG BARREL? HOLD SEARCH!', target: 'search', gesture: 'hold', waitFor: (s) => seen(s, 'b.obr.search'), done: (s) => st(s).confisc >= 1 },
  { id: 'poster', line: 'TAP WANTED POSTER. WHO IS WHO!', target: 'poster', gesture: 'tap', done: (s) => st(s).posterOpens >= 1 },
];

// Rule-card micro-lessons (06 §18): (1) the card on the Poster board, (2) a scripted traveler who
// shows the new tell; done on a verdict or once that traveler has gone. Keys match the
// mechanic_unlocked say() keys, so the director runs them instead of a line.
const board = (card: string, line: string): OnboardingStep => ({ id: 'board', line, target: 'poster', gesture: 'tap', done: (s) => seen(s, `b.board.${card}`) });
const verdict = (card: string, line: string, target: string, gesture: 'tap' | 'hold' | 'drag'): OnboardingStep => ({
  id: 'verdict',
  line,
  target,
  gesture,
  dragTo: gesture === 'drag' ? 'stackBand' : undefined,
  waitFor: (s) => seen(s, `b.lsr.${card}`),
  done: (s) => seen(s, `b.lsv.${card}`),
});
const lessons: Record<string, OnboardingStep[]> = {
  card_writ: [board('writ', 'NEW RULE! TAP POSTER: WRITS'), verdict('writ', 'SEAL NOT POSTER? HOLD UNMASK!', 'unmask', 'hold')],
  card_hats: [board('hats', 'NEW RULE! TAP POSTER: HATS'), verdict('hats', 'TALL LUMPY HAT? HOLD SEARCH!', 'search', 'hold')],
  card_kits: [board('kits', 'NEW RULE! TAP POSTER: FAKE TELL'), verdict('kits', 'FAKE TELL = NOTHING. ASK TOLL!', 'stackGrab', 'drag')],
  card_bribe: [board('bribe', 'NEW RULE! TAP POSTER: BRIBES'), verdict('bribe', 'BRIBE! TAP TAKE, OR SEARCH!', 'resp', 'tap')],
  card_shift: [board('shift', 'NEW RULE! TAP POSTER: SHIFTERS'), verdict('shift', 'TAP TRAVELER TWICE. SEE CLAIM!', 'traveler', 'tap')],
};

export const bridge: DeptDef = {
  ...bridgeEcon,
  name: 'Troll Bridge',
  currency: 'Tollpence',
  currencyColor: '#e8c04a',
  doorColor: 0x5a6a3a,
  manager: grumm,
  onboarding,
  lessons,
  legend: {
    name: 'Sir Strollsworth the Unbothered',
    line: 'TOLL? I HAVE NO COIN. I HAVE A VERY LARGE SWORD. GOOD DAY, TROLL.',
  },
  createScene: (ctx) => new BridgeScene(ctx),
  lastStand: (ctx) => bridgeLastStand(ctx),
};
