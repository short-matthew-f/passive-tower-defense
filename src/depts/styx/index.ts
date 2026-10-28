// The River Styx (Department of Soul Acquisition), specs/03. Cast into the black river, read the
// nibble, set the hook on the plunge and reel souls in against the tension of the line.
// Manager: Pilk, the imp ferryman (03 §18): lazy, sly, full of tall tales, "Your Dreadness".
// Readable lines are <= 32 characters (00 §5.4.5).
import type { DeptDef, ManagerDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { PILK_IDLE, PILK_PAL, PILK_TALK } from './art';
import { styxEcon } from './def';
import { styxLastStand } from './laststand';
import * as M from './model';
import { StyxScene } from './scene';
import { sfx } from './sfx';

const run = (s: DeptSave) => s.run as M.StyxRun;
const per = (s: DeptSave) => s.persistent as M.StyxPersistent;
const st = (s: DeptSave) => run(s).stats ?? M.defaultStats();
const noStock = (s: DeptSave) => M.PAID_BAITS.every((b) => !((per(s)?.baits?.[b] ?? 0) > 0));

const pilk: ManagerDef = {
  name: 'Pilk',
  title: 'Ferryman',
  portrait: [PILK_IDLE, PILK_TALK],
  palette: PILK_PAL,
  // Styx fires its own first-purchase lines (firstLine, chum), so the core's generic one is off.
  coreSkip: ['firstUpgrade'],
  // The scene chirps for its own typed lines; Pilk voices the core's (intro, Legend, beats ...).
  voice: (_line, i) => {
    if (i.source !== 'dept') sfx.pilk(i.vol, 3);
  },
  lines: {
    // ----- core-fired -----
    intro: ['EVENING, YOUR DREADNESS...', 'FISHING TONIGHT, DREADNESS?'],
    firstUpgrade: ['MONEY WELL SPENT. MOSTLY...', 'A BARGAIN, YOUR DREADNESS.'],
    goodsLink: ['%good%! BAIT GETS SPICY...', 'A DELIVERY. SOULS GO MAD...'],
    infamy50: ['FERRYMEN TALK ABOUT YOU NOW...', 'THE OTHER FERRYMEN ARE JEALOUS.'],
    infamy100: ['THE RIVER KNOWS YOUR NAME NOW.', 'LEGEND-WORTHY, YOUR DREADNESS.'],
    legend: ['SHE WANTS TO DRAIN MY RIVER.', 'A WOMAN WITH A BUCKET. TROUBLE.'],
    fall: ['DRY AS A BONE. FOR NOW...', "MY POOR RIVER. IT'LL COME BACK."],
    returnFall: ["RIVER'S BACK. ALWAYS COMES BACK.", "WET AGAIN. LET'S FISH..."],
    returnLong: ["OH! THOUGHT YOU'D DROWNED...", 'BACK? THE SOULS MISSED YOU.'],
    returnLong3d: ['THREE DAYS! I NAPPED. TWICE.', "OH! THOUGHT YOU'D DROWNED..."],
    report: [
      'NETTED A FEW. NAPPED A LOT.',
      'THE LADS DID GOOD. MOSTLY.',
      'A QUIET NIGHT ON THE RIVER...',
      'FULL NETS, YOUR DREADNESS.',
      'ONE GOT AWAY. A BIG ONE. HONEST',
      'SOULS IN THE JAR. COINS IN MINE.',
    ],
    ambient: [
      'NEVER WHISTLE AT A WAILER...',
      'THAT CLERK? CALL HIM GERALD.',
      'CAUGHT A KNIGHT ONCE. KEPT HAT.',
      'MY NETTERS? NAPPING. PROBABLY.',
      '*YAWN* ...STILL HERE? GOOD.',
      "RIVER'S CALM. TOO CALM...",
    ],
    // ----- department milestones (03 §18) -----
    firstLine: ['STRONGER LINE. FEWER STORIES...', "NEW REEL? SHE'LL SING NOW..."],
    firstHelper: ['FIVE LADS. I CAN NAP NOW.', "FIVE IMPS. THE RIVER'S OURS..."],
    rare: ["A RARE! HAVEN'T SEEN ONE IN AGES", 'OHO! THAT ONE GLOWED. LOVELY...'],
    legendary: ["THAT'S A STORY FOR THE PUB!", "A HERO'S ECHO! I'LL DINE OUT..."],
    trophy: ['ON THE WALL IT GOES. HANDSOME.', 'A TROPHY! MIND THE DUSTING...'],
    deeper: ['DEEPER STILL. MIND YOUR TOES...', 'NEVER BEEN THIS DEEP. HONEST.'],
    dialRaised: ["RIVER'S ANGRY. GOOD FISHING...", "MORE WRATH? YOU'RE A MADMAN..."],
    hazardFirst: ["SNAPPED. LAD'S SPLICING IT.", 'LINE GONE. HEROES PULL HARD...'],
    ripperCut: ['A RIPPER! SLACK LINE NEXT TIME.', 'CUT CLEAN. RIPPERS DO THAT...'],
    chum: ['CHUM BARREL. THE LADS GAG...', 'STINKS. THE SOULS LOVE IT.'],
    clean: ['NOT A RED HAIR ON IT. CLEAN!', 'CLEAN REEL! PAYS EXTRA, THAT.'],
    ritual: ["NET'S FULL! SORT 'EM, QUICK...", 'GLOWY ONES ARE KEEPERS...'],
    // mechanic_unlocked keys (each runs its micro-lesson; these lines are the fallback)
    murk: ["MURK'S OPEN. BRING A LANTERN.", 'DEEPER SOULS. MEANER TOO.'],
    halls: ['THE DROWNED HALLS. MIND KINGS.', 'COLUMNS DOWN THERE. AND KINGS.'],
    choir: ['HEAR THAT SINGING? DEEPER...', 'THE CHOIR. THEY THRASH IN TIME.'],
    lethe: ['THE LETHE. MIND YOUR NAME...', 'THE BOTTOM. NOBODY REMEMBERS.'],
    wrath: ['TWITCHIER FISH. RICHER CATCH...', "RIVER'S RILED. PAYS BETTER..."],
    bait: ['BAIT ON THE HOOK. TAP BAIT.', 'NICE BAIT. TAP BAIT TO SWAP.'],
    lock: ["A HERO'S LOCK. HEROES BITE...", 'SMELLS OF GLORY. AND SOCKS.'],
    twin: ['TWO HOOKS. LAND ONE, FISH ON.', 'TWIN HOOKS! GREEDY. I LIKE IT.'],
    eel: ['GREY GLOW LIES. GOLD ONE BITES.', 'MEET SPARKY. HE READS BITES.'],
    // ----- flavour (Full chattiness only) -----
    codex: ['IN THE BOOK: %name%', 'NEW PAGE: %name%'],
    // Wave 1 reveal: records and Pilk's quips on a landed soul (research R3, ~1 in 4 catches).
    record: ['A RECORD! I SAW IT. MOSTLY.', 'BIGGEST YET! WRITE IT DOWN.', "THAT'S A WALL-SIZED ONE..."],
    gold: ['IN THE GOLD, THEY COME QUIET.', 'GOLD BAND MOVES. FOLLOW IT.'],
    'quip.clerk': ['A CLERK! FILING A COMPLAINT.', 'GERALD AGAIN? HI, GERALD.', 'STILL STAMPING. EVEN NOW.'],
    'quip.tourist': ['LOST? YOU ARE NOW, MATE.', 'HE WANTS A REFUND. NO.', 'NICE HAT. SHAME ABOUT DEATH.'],
    'quip.poet': ['HE RHYMED "MURK" WITH "MURK".', 'A POET. NOBODY ASKED.', 'SONNET NUMBER NINE HUNDRED...'],
    'quip.wraiths': ['TWO FOR ONE. BARGAIN.', 'THEY FINISH EACH OTHER... OOH.'],
    'quip.bishop': ['A BISHOP. MIND THE BLESSING.', 'HE SANK. HOLILY.', 'AMEN TO THAT CATCH.'],
    'quip.choir': ['SINGS FLAT, DEAD OR NOT.', 'A CHOIRBOY. EARMUFFS, LADS.'],
    'quip.chorister': ['AMEN! AMEN! ...ENOUGH, AMEN.', 'HE KEEPS HARMONISING. STOP.'],
    'quip.siren': ['DON\'T LISTEN. HUM SOMETHING.', 'HER SONG LIES. SO DO I.'],
    'quip.forgotten': ['WHO? ...WHO WAS THAT?', 'NOPE. FORGOT HIM ALREADY.'],
    'quip.wanderer': ['BLANK STARE. LIKE MY LADS.', 'SLIPPERY. LIKE MY TAXES.'],
    escape: ['THE ONE THAT GOT AWAY...', 'IT STUCK ITS TONGUE OUT. RUDE.', "IT'LL BE BACK. THEY ALWAYS ARE."],
    flavor: [
      'TWITCH IT. SOULS LOVE A WIGGLE.',
      'RED LINE MEANS LET GO. MOSTLY.',
      'GLOWY ONES BITE IF YOU AIM CLOSE',
      'WISPS ARE FREE MONEY. LAZY MONEY',
      'CLEAN REELS PAY EXTRA. NO RED.',
      'ESCAPED RARES LEAVE A GLOW...',
    ],
  },
};
const netterCost = (s: DeptSave) => M.nodeCost('netter', run(s).lv?.netter ?? 0);

// Onboarding (03 §18, 00 §5.4.2): one mechanic per beat, the first purchase at beat 3. The
// scene's own status line coaches the hook and the reel inside beat 2 ("NOW! TAP!", "RED!").
const onboarding: OnboardingStep[] = [
  { id: 'cast', line: 'DROP IT IN, YOUR DREADNESS...', target: 'cast', gesture: 'drag', dragTo: 'cast.end', done: (s) => st(s).casts >= 1 },
  { id: 'catch', line: 'PLUNGE? TAP! THEN HOLD TO REEL.', target: 'reel', gesture: 'tap', done: (s) => st(s).lands >= 1 },
  {
    id: 'hire',
    line: 'HIRE A LAD. WORKS FOR NOTHING.',
    target: 'upgrades',
    gesture: 'tap',
    waitFor: (s) => run(s).bank >= netterCost(s),
    done: (s) => (run(s).lv?.netter ?? 0) >= 1,
  },
  { id: 'wisp', line: 'FLICK THE LITTLE ONES...', target: 'wisp', gesture: 'drag', dragTo: 'wisp.up', done: (s) => st(s).wisps >= 1 || !!s.seen['styx.wispPass'] },
  { id: 'twitch', line: 'NUDGE UP WHILE YOU WAIT...', target: 'reel', gesture: 'drag', dragTo: 'reel.up', done: (s) => st(s).twitches >= 1 },
];

// Micro-lessons (03 §18): Murk, Wrath and baits per spec, plus the v1.1 mechanics.
const bandLesson = (id: string, line: string, band: number): OnboardingStep[] => [
  { id, line, target: 'cast', gesture: 'drag', dragTo: `band.${band}`, done: (s) => !!s.seen[`styx.cast.${band}`] },
];
const lessons: Record<string, OnboardingStep[]> = {
  murk: bandLesson('cast', 'DEEPER SOULS. MEANER TOO.', 1),
  halls: bandLesson('cast', 'THE HALLS. MIND THE KINGS...', 2),
  choir: bandLesson('cast', 'HEAR THE SINGING? CAST DEEP.', 3),
  lethe: bandLesson('cast', 'THE LETHE. DEEPEST OF ALL...', 4),
  wrath: [
    { id: 'set', line: 'THE WRATH DIAL. SET IT HERE.', target: 'wrath', gesture: 'tap', done: (s) => (run(s).wrath ?? 0) >= 1 },
    { id: 'land', line: 'TWITCHIER FISH. RICHER CATCH...', target: 'reel', done: (s) => (run(s).gate?.w ?? 0) >= 1 && (run(s).gate?.lands ?? 0) >= 1 },
  ],
  bait: [{ id: 'equip', line: 'TAP BAIT TO PUT IT ON...', target: 'bait', gesture: 'tap', done: (s) => run(s).bait !== 'worm' || noStock(s) }],
  lock: [{ id: 'equip', line: "HERO'S LOCK. HEROES BITE...", target: 'bait', gesture: 'tap', done: (s) => run(s).bait === 'lock' || !((per(s)?.baits?.lock ?? 0) > 0) }],
  fog: [{ id: 'land', line: 'FOG! WATCH THE BOBBER RING...', target: 'bobber', done: (s) => !!s.seen['styx.fogLand'] || st(s).fogs >= 2 }],
  twin: [{ id: 'land', line: 'TWO HOOKS. LAND ONE, FISH ON.', target: 'reel', done: (s) => st(s).twinLands >= 1 }],
  eel: [{ id: 'hook', line: 'GREY GLOW LIES. GOLD ONE BITES.', target: 'bobber', done: (s) => !!s.seen['styx.eelHook'] }],
  // Wave 1: the moving gold band on the REEL ring (fires on the first reel after the tutorial).
  gold: [{ id: 'land', line: 'KEEP THE TENSION IN THE GOLD.', target: 'reel', gesture: 'hold', done: (s) => !!s.seen['styx.gold'] || st(s).lands >= 4 }],
  ripper: [{ id: 'pass', line: 'RIPPER! LET GO TILL IT PASSES.', target: 'reel', done: (s) => st(s).rippers >= 1 || st(s).cuts >= 1 }],
  wall: [{ id: 'keep', line: 'KEEP IT FOR THE WALL? TAP KEEP.', target: 'keep', gesture: 'tap', done: (s) => (per(s)?.wall?.length ?? 0) >= 1 || !!s.seen['styx.sold'] }],
};

export const styx: DeptDef = {
  ...styxEcon,
  name: 'River Styx',
  currency: 'Obols',
  currencyColor: '#a8d0e0',
  doorColor: 0x2a4a6a,
  manager: pilk,
  // Head Start grants Wrath levels without the first purchase that runs the lesson.
  dialLessons: { wrath: (s) => run(s)?.wrathMax ?? 0 },
  onboarding,
  lessons,
  legend: {
    name: 'Dame Brinella the Drainer',
    line: 'I BROUGHT A VERY LARGE BUCKET. YOUR RIVER IS NOW A PUDDLE, FERRYMAN.',
  },
  createScene: (ctx) => new StyxScene(ctx),
  lastStand: (ctx) => styxLastStand(ctx),
};
