// The River Styx (Department of Soul Acquisition), specs/03. Cast into the black river, read the
// nibble, set the hook on the plunge and reel souls in against the tension of the line.
// Manager: Pilk, the imp ferryman (03 §18): lazy, sly, full of tall tales, "Your Dreadness".
import type { DeptDef, ManagerDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { PILK_IDLE, PILK_PAL, PILK_TALK } from './art';
import { styxEcon } from './def';
import * as M from './model';
import { StyxScene } from './scene';

const run = (s: DeptSave) => s.run as M.StyxRun;
const st = (s: DeptSave) => run(s).stats ?? M.defaultStats();

const pilk: ManagerDef = {
  name: 'Pilk',
  title: 'Ferryman',
  portrait: [PILK_IDLE, PILK_TALK],
  palette: PILK_PAL,
  lines: {
    intro: ['EVENING, YOUR DREADNESS... FISHING FOR SOULS TONIGHT?'],
    firstUpgrade: ['MONEY WELL SPENT. MOSTLY...', 'STRONGER LINE. FEWER STORIES...'],
    firstHelper: ['FIVE LADS. I CAN NAP NOW.'],
    rareBite: ['OHO! THAT ONE GLOWS. EASY NOW...'],
    rare: ["A RARE! HAVEN'T SEEN ONE IN AGES"],
    legendary: ["THAT'S A STORY FOR THE PUB!"],
    codex: ['NEW ONE FOR THE BOOK: %name%', 'NEVER SEEN A %name% UP CLOSE...'],
    escape: ['THE ONE THAT GOT AWAY...', 'IT STUCK ITS TONGUE OUT. RUDE.', 'IT WILL BE BACK. THEY ALWAYS ARE.'],
    missHint: ['WAIT FOR THE BIG PLUNGE, THEN TAP.'],
    hazardFirst: ["SNAPPED. LAD'S SPLICING IT."],
    murk: ["MURK'S OPEN. BRING A LANTERN.", 'DEEPER SOULS. MEANER TOO.'],
    halls: ['THE DROWNED HALLS... MIND THE KINGS.'],
    wrathLesson: ['TWITCHIER FISH. RICHER CATCH...'],
    dialRaised: ["RIVER'S ANGRY. GOOD FISHING..."],
    baitLesson: ['BAIT ON THE HOOK. TAP BAIT TO SWAP.'],
    goodsLink: ['%good% FOR THE BAIT... SEE GOODS.', 'A DELIVERY. SOULS GO MAD... GOODS TAB.'],
    infamy50: ['FERRYMEN TALK ABOUT YOU NOW...'],
    legend: ['SHE WANTS TO DRAIN MY RIVER. TAP LEGEND.'],
    fall: ['DRY AS A BONE. FOR NOW...'],
    returnFall: ["RIVER'S BACK. ALWAYS COMES BACK."],
    returnLong: ["OH! THOUGHT YOU'D DROWNED..."],
    flavor: [
      'NEVER WHISTLE AT A WAILER...',
      'THAT CLERK? CALL HIM GERALD.',
      'CAUGHT A KNIGHT ONCE. KEPT THE HAT.',
      'TWITCH IT. SOULS LOVE A WIGGLE.',
      'RED LINE MEANS LET GO. MOSTLY.',
      'GLOWY ONES BITE IF YOU AIM CLOSE.',
      'WISPS ARE FREE MONEY. LAZY MONEY.',
      'MY NETTERS? NAPPING. PROBABLY.',
    ],
  },
};

const onboarding: OnboardingStep[] = [
  { id: 'cast', line: 'DROP IT IN, YOUR DREADNESS... DRAG DOWN IN THE RIVER, LET GO.', done: (s) => st(s).casts >= 1 },
  { id: 'hook', line: 'WAIT... WAIT... WHEN THE BOBBER PLUNGES, TAP THE BAR BELOW!', done: (s) => st(s).hooks >= 1 },
  { id: 'reel', line: 'HOLD THE BAR TO REEL. EASE OFF WHEN THE LINE GOES RED.', done: (s) => st(s).lands >= 1 },
  { id: 'hire', line: 'HIRE A LAD. WORKS FOR NOTHING. UPGRADES, IMPS TAB.', done: (s) => (run(s).lv?.netter ?? 0) >= 1 },
  { id: 'wisp', line: 'FLICK THE LITTLE ONES... TAP A WISP ON THE SURFACE.', done: (s) => st(s).wisps >= 1 || !!s.seen['styx.wispPass'] },
];

export const styx: DeptDef = {
  ...styxEcon,
  name: 'River Styx',
  currency: 'Obols',
  currencyColor: '#a8d0e0',
  doorColor: 0x2a4a6a,
  manager: pilk,
  onboarding,
  legend: {
    name: 'Dame Brinella the Drainer',
    line: 'I BROUGHT A VERY LARGE BUCKET. YOUR RIVER IS NOW A PUDDLE, FERRYMAN.',
  },
  createScene: (ctx) => new StyxScene(ctx),
};
