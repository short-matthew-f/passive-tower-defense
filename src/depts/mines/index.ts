// The Goblin Mines (Department of Extraction), specs/02. Smash the rock wall, hire a goblin
// crew, dig deeper, and later haul in the Doom Drum. Manager: Gritch (02 §18).
import type { DeptDef, OnboardingStep } from '../../core/dept';
import type { DeptSave } from '../../core/types';
import { GRITCH_IDLE, GRITCH_PALETTE, GRITCH_TALK } from './art';
import { minesEcon } from './def';
import { minesLastStand } from './laststand';
import * as M from './model';
import { MinesScene } from './scene';
import { sfx } from './sfx';

const run = (s: DeptSave) => s.run as M.MinesRun;
const st = (s: DeptSave) => run(s).stats ?? M.defaultStats();

// Readable lines stay <= 32 characters (00 §5.4.6 lint), icons included.
const lessons: Record<string, OnboardingStep[]> = {
  // Doom Drum micro-lesson (02 §18): the mechanic_unlocked trigger on purchase.
  drum: [
    { id: 'ring', line: 'BOOM! Hit when it CLOSES!', target: 'rock.any', gesture: 'tap', done: (s) => st(s).beatHits >= 1 },
    { id: 'four', line: 'Four on the BOOM!', target: 'rock.any', gesture: 'tap', done: (s) => st(s).beatHits >= 4 },
    { id: 'free', line: 'Miss? Still a hit! BOOM-ta-ta!', target: 'rock.any', gesture: 'tap', done: (s) => !!s.seen['m.followup'] },
    { id: 'more', line: 'More drum = more BOOM. Shop!', target: 'btn.upgrades', gesture: 'tap', done: (s) => run(s).frenzy + run(s).drummers + run(s).drumhead > 0 || !!s.seen['m.sheet'] },
  ],
  // Keg micro-lesson (02 §18): the first natural Powder Keg.
  keg: [{ id: 'tap', line: 'KEG! Tap it. Then DUCK!', target: 'keg', gesture: 'tap', done: (s) => st(s).kegs >= 1 }],
  // First cave-in (hazard_first): the Rubble is still there when he speaks (R4-13).
  caveIn: [{ id: 'rake', line: 'Rubble! SWIPE to rake it!', target: 'rubble', gesture: 'drag', done: (s) => !!s.seen['m.raked'] }],
  // Chain Lightning, on its first level.
  chain: [{ id: 'zap', line: 'ZAP jumps! Tap the clusters!', target: 'wall', gesture: 'tap', done: (s) => st(s).lightning >= 1 }],
  // First gas pocket (d >= 25).
  gas: [{ id: 'waft', line: 'GAS! Tap the cloud away!', target: 'gas', gesture: 'tap', done: (s) => !!s.seen['m.wafted'] }],
};

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
    // The scene never blips its own lines, so Gritch voices every line he shows.
    voice: (line, i) => sfx.gritch(i.vol, Math.min(4, 2 + Math.floor(line.length / 12))),
    lines: {
      intro: ['BOSS! You came DOWN! {coin}', 'BOSS! Crew is... THRILLED!'],
      firstUpgrade: ['Bigger fist! Rocks are SCARED!', 'Shiny upgrade! Do again!'],
      // first_upgrade: first Crit Chance level
      critBuy: ['CRUNCH! Do again, BOSS!', 'More CRUNCH! Good crunch!', 'CRUNCH! The rocks cried!'],
      // first_helper: first and fourth goblin, the new goblin kinds
      firstGoblin: ['That is SNIK. Works for shinies', 'New grunt! He bites. Rocks.'],
      fourGoblins: ['Full ledge, BOSS! ...almost.', 'Four goblins! A CREW! A MOB!', 'Four! I am a REAL foreman!'],
      shocker: ['Shocker! Do NOT lick him.', 'ZAPPY goblin! Hair is up!'],
      prospector: ['Prospector! Sniffs gold!', 'He smells veins. And feet.'],
      drummer: ['Drummer! BOOM BOOM, BOSS!', 'He only knows one song. LOUD.'],
      // tier_reached: first entry into each stratum
      stratum: ['%name%! Shinier! Harder!', '%name% layer! Smells RICH!', 'Welcome to %name%, BOSS!'],
      // dial_raised: new max depth 5, 15, 25...
      dialRaised: ['Deeper! Smells like gems.', 'Down we go! Mind your head!', 'Deeper = SHINIER, BOSS!'],
      drumWink: ['Later, BOSS... a DRUM.', 'Psst. The drum. Later.'],
      kegAuto: ['It went BOOM alone. You light!', 'Next keg, YOU light it, BOSS!'],
      caveIn: ['Rubble! RAKE IT!', 'Cave-in! Swipe the rubble!'],
      gas: ['GAS! Tap it away! *cough*', 'Stinky rock! Waft it, BOSS!'],
      bedrock: ['Bedrock! Only BOOM breaks it.', 'Iron rock! Kegs or ZAP, BOSS!'],
      // mechanic_unlocked
      drumReady: ['BOSS. The DRUM. Buy drum. {gem}', 'Gems for the DOOM DRUM! {gem}'],
      firstFrenzy: ['That FRENZY! Do again, BOSS!', 'FRENZY! My ears! MORE!'],
      mother: ['MOTHERLODE! Ingots! {ingot}', 'THE BIG ONE! Mine! I mean yours'],
      vein: ['SHINY!', 'Gold! Mine! I mean YOURS!', 'VEIN! VEIN!'],
      gem: ['GEM! GEM! {gem}', 'Pretty rock! {gem}'],
      ritual: ['Kegs piled up! Light em, BOSS!', 'We saved kegs! TAP! {coin}'],
      goodsLink: ['%good%! For us? Goods tab!', 'Bone miners! They dont eat!'],
      infamy50: ['Heroes are TALKING about us.', 'Infamy! Even rocks fear us!'],
      infamy100: ['Ready to be FAMOUS, BOSS!', 'Everyone knows us! Uh oh.'],
      legend: ['Big hero. Big drill. Uh oh.', 'A hero at the shaft! LEGEND!'],
      returnFall: ["Shaft's gone. Gems are safe!", 'We dig again. ALWAYS dig!'],
      fall: ['We dig again. We ALWAYS dig.', 'He drilled it ALL. Rude.'],
      returnLong: ['Crew dug all night, BOSS! {coin}', 'We dug while you slept!'],
      returnLong3d: ['BOSS! Days! Crew is rich!', 'You came back! We dug MILES!'],
      report: ['Rocks smashed. Crew happy.', 'Snik found a gem. Ate it.', 'More shinies, BOSS! {coin}', 'Picks sharp. Crew sharper.', 'Dug deep. Want deeper.', 'No cave-ins! ...today.'],
      ambient: ['Snik found a rock. A ROCK.', 'No breaks! Breaks are rocks!', 'Glinty ones first, BOSS.', 'Deeper pays more. Just saying', 'Kegs by big rocks = FUN.', 'I taught them picks. Mostly.'],
      flavor: ['Snik found a rock. A ROCK.', 'No breaks! Breaks are rocks!', 'Glinty ones first, BOSS.', 'Kegs by big rocks = FUN.'],
      flavorDrum: ['BOOM-ta-ta! BOOM-ta-ta!', 'Hit the boom, then tap away!', 'Taps late? CALIBRATE, BOSS!'],
    },
  },

  // Onboarding (02 §18): 5 beats, one mechanic each; the first purchase at beat 2. Waiting beats
  // start once their buy is affordable (R4-06).
  onboarding: [
    { id: 'smash', line: 'BOSS! Smash it! {coin}', target: 'rock.cracked', gesture: 'tap', done: (s) => st(s).rocks >= 1 },
    {
      id: 'tap',
      line: 'Bigger fist! Buy TAP DAMAGE!',
      target: 'btn.upgrades',
      sheetTarget: 'tap',
      gesture: 'tap',
      waitFor: (s) => s.run.bank >= M.tapCost(0) || run(s).tap >= 1,
      done: (s) => run(s).tap >= 1,
    },
    {
      id: 'hire',
      line: 'Hire Snik! Works for shinies.',
      target: 'btn.hire',
      gesture: 'tap',
      waitFor: (s) => s.run.bank >= M.hireCost(run(s)) || M.goblins(run(s)) >= 1,
      done: (s) => M.goblins(run(s)) >= 1,
    },
    { id: 'vein', line: 'SHINY! That one! {coin}{coin}', target: 'rock.vein', gesture: 'tap', done: (s) => st(s).veins >= 1 },
    {
      id: 'dig',
      line: 'Deeper = shinier! DIG! {darr}',
      target: 'btn.dig',
      gesture: 'tap',
      waitFor: (s) => s.run.bank >= M.digCost(1) || run(s).maxDepth >= 2,
      done: (s) => run(s).maxDepth >= 2,
    },
  ],
  lessons,

  legend: {
    name: 'Sir Augustin Drillwright',
    line: 'I HAVE BROUGHT A STEAM DRILL. YOUR GOBLINS BROUGHT PICKS. ADORABLE.',
  },

  // Player options (02 §13): suite settings, moved here from `persistent` (legacy keys migrate).
  settings: [
    { key: 'holdAuto', label: 'Hold a rock to auto-hit', kind: 'toggle', default: true, legacy: 'holdAuto', hint: () => '4 hits a second, off-beat' },
    { key: 'steady', label: 'Steady Drum', kind: 'toggle', default: false, legacy: 'steady', hint: () => 'Beat window x2 and a screen-edge pulse', visible: (s) => !!(s.persistent as M.MinesPersistent).drum },
    {
      key: 'calibrate',
      label: 'Calibrate drum',
      kind: 'action',
      visible: (s) => !!(s.persistent as M.MinesPersistent).drum,
      hint: (v) => `Tap with the boom x8. Now ${Math.round(((v.latency as number) ?? M.BEAT_LATENCY) * 1000)} ms${v.calibrated ? '' : ' (default)'}`,
    },
    { key: 'latency', label: 'Drum latency', kind: 'value', default: M.BEAT_LATENCY, legacy: 'latency', visible: () => false },
    { key: 'calibrated', label: 'Calibrated', kind: 'value', default: false, legacy: 'calibrated', visible: () => false },
  ],

  // Offline Gems (02 §3) for an absence: from when the wall was last on screen, at the offline
  // factor and cap. The scene floats the haul (gemAway) and covers in-app time in other departments.
  onOffline(save, _elapsed, factor, info) {
    M.normalize(save.run, save.persistent);
    const p = save.persistent as M.MinesPersistent;
    if (p.gemAt > 0 && info.now > p.gemAt) {
      const away = Math.min(info.capSeconds, (info.now - p.gemAt) / 1000);
      const g = (p.gemFrac || 0) + M.offlineGems(run(save), p, save.imports?.bones ?? 0, factor, away);
      const whole = Math.floor(Math.max(0, g));
      p.gemFrac = Math.max(0, g - whole);
      if (whole > 0) {
        p.gems += whole;
        p.gemsEver += whole;
        p.gemAway = (p.gemAway || 0) + whole;
      }
    }
    p.gemAt = info.now;
  },

  createScene: (ctx) => new MinesScene(ctx),
  lastStand: (ctx) => minesLastStand(ctx),
};
