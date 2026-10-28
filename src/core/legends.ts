// Legend rosters (fun plan A7): each department faces 5-7 escalating named Legends instead of one
// who repeats forever, each with a title, a taunt and a procedural 24x24 pixel portrait. The next
// Legend is shown as a silhouette ("??? THE TALLER SISTER") that walks closer as Infamy rises, and
// a Legend who gets ready at night camps outside until a predictable dawn window ("Dawn Ambush"):
// meeting them then pays +50% Dread, missing it costs nothing.
//
// Pure: no Pixi, no DOM. State lives in `save.meta.legendDawn` (default-filled on read, so old
// saves load untouched). Departments may override their roster with DeptDef.legends.
import type { DeptEcon } from './dept';
import { effectOf, standingOrder } from './orders';
import { coreMult, econFloor, infamy, offlineCapSeconds, offlineFactor, safeIdleRate } from './economy';
import { econGateMult } from './perks';
import type { DeptId, DeptSave, SaveRoot } from './types';

export type LegendHat = 'helm' | 'plume' | 'crown' | 'horns' | 'mitre' | 'hood' | 'tall';
export type LegendWeapon = 'sword' | 'mace' | 'axe' | 'staff' | 'ladle' | 'spear' | 'drill';

/** How a Legend looks; every field is optional (filled from a seed of the name). */
export interface LegendLook {
  hat?: LegendHat;
  weapon?: LegendWeapon;
  shield?: boolean;
  cape?: boolean;
  /** Gold pauldrons (late, grander Legends). */
  pauldrons?: boolean;
  /** Palette overrides (hex): armor, cape, plume, emblem, skin. */
  armor?: string;
  capeColor?: string;
  plume?: string;
  emblem?: string;
  skin?: string;
}

/** One roster entry. `name` + `title` read as one ("DAME BRIGHTJAW THE UNREASONABLY TALL"). */
export interface LegendSpec {
  name: string;
  title: string;
  taunt: string;
  look?: LegendLook;
}

/** A roster entry resolved for a cycle (with the round numeral once the roster wraps). */
export interface LegendInfo extends LegendSpec {
  /** Position in the roster (0-based) and the roster's length. */
  index: number;
  total: number;
  /** How many times the roster has wrapped (0 on the first pass). */
  round: number;
  /** "Dame Brightjaw the Unreasonably Tall" (+ " II" on the second pass). */
  full: string;
  look: Required<Omit<LegendLook, 'armor' | 'capeColor' | 'plume' | 'emblem' | 'skin'>> & LegendLook;
  seed: number;
}

const L = (name: string, title: string, taunt: string, look?: LegendLook): LegendSpec => ({ name, title, taunt, look });

/** Default rosters. The first entry of each is the department's original Legend (same full name,
 * so existing trophies keep matching). Later entries escalate: capes, gold, crowns. */
export const ROSTERS: Record<DeptId, LegendSpec[]> = {
  cauldron: [
    L('Dame Brightjaw', 'the Unreasonably Tall', "I've come to scrub your pot, hag. With a sword.", { hat: 'tall', weapon: 'sword', shield: true }),
    L('Dame Loftwyn', 'the Taller Sister', 'MY SISTER SAID YOUR SOUP WAS COLD. I BROUGHT A LADLE.', { hat: 'tall', weapon: 'ladle', cape: true }),
    L('Sir Ladle and Sir Spoon', 'the Paladin Twins', 'TWO KNIGHTS. ONE POT. NO SURVIVORS.', { hat: 'plume', weapon: 'mace', shield: true }),
    L('Archbishop Brine', 'the Holy Salter', 'I SHALL SALT YOUR CAULDRON UNTIL IT REPENTS.', { hat: 'mitre', weapon: 'staff', cape: true }),
    L('Queen Gristle', 'the Health Inspector', 'I HAVE A CLIPBOARD. AND AN ARMY.', { hat: 'crown', weapon: 'spear', cape: true, pauldrons: true }),
    L('Saint Scaldwyn', 'the Unboilable', 'YOUR BREW CANNOT HARM ME. I HAVE BATHED IN WORSE.', { hat: 'crown', weapon: 'sword', shield: true, cape: true, pauldrons: true }),
  ],
  mines: [
    L('Sir Augustin', 'Drillwright', 'I HAVE BROUGHT A STEAM DRILL. YOUR GOBLINS BROUGHT PICKS. ADORABLE.', { hat: 'helm', weapon: 'drill' }),
    L('Lady Pickering', 'the Canary Knight', 'MY BIRD SAYS YOUR TUNNELS ARE A DEATHTRAP. FOR YOU.', { hat: 'plume', weapon: 'axe', plume: '#e8d040' }),
    L('Baron Bedrock', 'the Unquarried', 'I AM FORTY PERCENT GRANITE. HIT ME.', { hat: 'horns', weapon: 'mace', shield: true }),
    L('Sir Gleam', 'of the Lamplighters', 'WE BRING LIGHT. GOBLINS HATE LIGHT.', { hat: 'helm', weapon: 'staff', cape: true }),
    L('Duchess Ore', 'the Claim Jumper', "I'VE FILED A DEED ON YOUR WHOLE MOUNTAIN.", { hat: 'crown', weapon: 'drill', cape: true, pauldrons: true }),
    L('Mountainheart', 'the Living Golem', '...GRIND.', { hat: 'tall', weapon: 'mace', shield: true, pauldrons: true, armor: '#8a8478' }),
  ],
  dungeon: [
    L('Sir Aldous', 'Goldmantle', 'I HAVE READ YOUR LEDGER, SKELETON. I AM HERE FOR THE BALANCE.', { hat: 'helm', weapon: 'sword', cape: true, capeColor: '#d8b040' }),
    L('Dame Tally', 'the Auditor', 'I COUNTED YOUR TRAPS. YOU ARE THREE SHORT.', { hat: 'hood', weapon: 'staff' }),
    L('Brother Lockpick', 'the Unopened', 'NO DOOR HAS EVER HELD ME. NOT EVEN MY OWN.', { hat: 'hood', weapon: 'spear' }),
    L('Sir Gauntlet', 'the Tenth Party', 'NINE PARTIES DIED. I LEARNED FROM ALL OF THEM.', { hat: 'plume', weapon: 'sword', shield: true }),
    L('Lady Lantern', 'the Delver', 'I HAVE MAPPED EVERY ROOM. EVEN THE SECRET ONE.', { hat: 'helm', weapon: 'axe', cape: true, pauldrons: true }),
    L('The Grand Paladin', 'Hoardbreaker', 'YOUR GOLD WILL BE RETURNED TO THE PEOPLE. MOSTLY ME.', { hat: 'crown', weapon: 'mace', shield: true, cape: true, pauldrons: true }),
  ],
  bridge: [
    L('Sir Strollsworth', 'the Unbothered', 'TOLL? I HAVE NO COIN. I HAVE A VERY LARGE SWORD. GOOD DAY, TROLL.', { hat: 'plume', weapon: 'sword' }),
    L('Dame Fenwick', 'the Toll Dodger', 'I PAID LAST TIME. IN EXACT CHANGE. SPITEFULLY.', { hat: 'hood', weapon: 'spear' }),
    L('Sir Waddle', 'the Wide', 'I SIMPLY WILL NOT FIT UNDER YOUR BRIDGE, TROLL.', { hat: 'helm', weapon: 'mace', shield: true }),
    L('Lord Barrowmere', 'the Smuggler King', 'EVERY CRATE YOU MISSED WAS MINE.', { hat: 'crown', weapon: 'sword', cape: true }),
    L('Captain Rivet', 'the Bridgebreaker', "I DON'T CROSS BRIDGES. I REMOVE THEM.", { hat: 'horns', weapon: 'axe', pauldrons: true, cape: true }),
    L('Saint Ferrin', 'the Toll-Free', 'BY ROYAL DECREE, ALL BRIDGES ARE NOW FREE.', { hat: 'mitre', weapon: 'staff', shield: true, cape: true, pauldrons: true }),
  ],
  styx: [
    L('Dame Brinella', 'the Drainer', 'I BROUGHT A VERY LARGE BUCKET. YOUR RIVER IS NOW A PUDDLE, FERRYMAN.', { hat: 'helm', weapon: 'ladle' }),
    L('Sir Gill', 'the Drowned Knight', "I WALKED THE RIVERBED TO GET HERE. DON'T ASK.", { hat: 'helm', weapon: 'spear', armor: '#6a9a9a' }),
    L('Captain Oarsome', 'the Rival Ferry', 'HALF YOUR FARE. TWICE THE SPEED.', { hat: 'plume', weapon: 'axe', cape: true }),
    L('Lady Lure', 'the Soul Angler', 'I CATCH SOULS TOO. BUT I LET THEM GO.', { hat: 'hood', weapon: 'staff', cape: true }),
    L('Father Tide', 'the Ebb', 'WHAT FLOWS DOWN MUST FLOW BACK.', { hat: 'mitre', weapon: 'staff', cape: true, pauldrons: true }),
    L('Saint Dredge', 'the Bottomless', 'I HAVE COME FOR THE RIVER ITSELF.', { hat: 'crown', weapon: 'spear', shield: true, cape: true, pauldrons: true }),
  ],
  spire: [
    L('Brother Quell', 'the Unflinching', "Your flask is full of doom, lich. I'm going in.", { hat: 'hood', weapon: 'mace' }),
    L('Sister Vex', 'the Antidote', 'EVERY POTION HAS A CURE. I AM IT.', { hat: 'hood', weapon: 'staff', cape: true }),
    L('Magister Null', 'the Dispeller', 'ABRACADABRA. NOW YOUR SPIRE IS A SHED.', { hat: 'mitre', weapon: 'staff' }),
    L('Sir Corkwell', 'the Stopper', 'I PLUGGED A VOLCANO ONCE. YOUR FLASK IS NOTHING.', { hat: 'tall', weapon: 'mace', shield: true }),
    L('Archmage Brillow', 'the Insufferable', 'I READ YOUR SPELLBOOK. I GRADED IT. C MINUS.', { hat: 'crown', weapon: 'staff', cape: true, pauldrons: true }),
    L('Saint Prism', 'the Unrefracted', 'ALL YOUR COLORS ARE MINE NOW.', { hat: 'crown', weapon: 'sword', shield: true, cape: true, pauldrons: true, armor: '#e8e4f0' }),
  ],
  pit: [
    L('Brakka', 'Bare-Knuckle', 'BEASTS? I BRUSH MY TEETH WITH BEASTS. OPEN THE CAGES, DOGGY.', { hat: 'horns', weapon: 'axe' }),
    L('Sir Muzzle', 'the Beast Tamer', 'SIT. STAY. SURRENDER.', { hat: 'helm', weapon: 'spear', shield: true }),
    L('Orla', 'Twin-Axe', 'TWO AXES, BECAUSE ONE GOT LONELY.', { hat: 'horns', weapon: 'axe', cape: true }),
    L('Grand Champion Vell', 'of the Arena', 'I HAVE WON EVERY FIGHT. EVEN THE ONES I LOST.', { hat: 'plume', weapon: 'sword', shield: true, pauldrons: true }),
    L('Lord Gorehelm', 'the Unbeaten', "BRING YOUR BIGGEST BEAST. I'LL WAIT.", { hat: 'tall', weapon: 'mace', cape: true, pauldrons: true }),
    L('Saint Brawl', 'the Last Bout', 'ONE MORE ROUND, OVERLORD. JUST YOU AND ME.', { hat: 'crown', weapon: 'sword', shield: true, cape: true, pauldrons: true }),
  ],
};

/** FNV-1a string hash (stable seed per Legend). */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A small deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

/** What a department provides to pick its roster (DeptDef satisfies it). */
export interface RosterSource {
  id: DeptId;
  legend?: { name: string; line: string };
  legends?: LegendSpec[];
}

/** The department's roster: its own override, else the default, else its single legacy Legend. */
export function rosterFor(src: RosterSource): LegendSpec[] {
  if (src.legends && src.legends.length) return src.legends;
  const r = ROSTERS[src.id];
  if (r && r.length) return r;
  return [{ name: src.legend?.name ?? 'A Hero', title: '', taunt: src.legend?.line ?? '' }];
}

/** The Legend of cycle `n` (the roster in order, then again with numerals: "... II"). */
export function legendFor(src: RosterSource, n: number): LegendInfo {
  const roster = rosterFor(src);
  const k = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  const index = k % roster.length;
  const round = Math.floor(k / roster.length);
  const spec = roster[index];
  const full = `${spec.name}${spec.title ? ` ${spec.title}` : ''}${ROMAN[Math.min(round, ROMAN.length - 1)] || (round >= ROMAN.length ? ` ${round + 1}` : '')}`;
  const seed = hashStr(`${src.id}:${spec.name}:${round}`);
  const r = rng(seed);
  const hats: LegendHat[] = ['helm', 'plume', 'crown', 'horns', 'mitre', 'hood', 'tall'];
  const weapons: LegendWeapon[] = ['sword', 'mace', 'axe', 'staff', 'spear'];
  const lk = spec.look ?? {};
  const late = index >= Math.ceil(roster.length / 2);
  const look = {
    ...lk,
    hat: lk.hat ?? hats[Math.floor(r() * hats.length)],
    weapon: lk.weapon ?? weapons[Math.floor(r() * weapons.length)],
    shield: lk.shield ?? r() < 0.5,
    cape: lk.cape ?? (late || r() < 0.3),
    pauldrons: lk.pauldrons ?? (late && r() < 0.6),
  };
  return { ...spec, index, total: roster.length, round, full, look, seed };
}

/** Upper-case label for a Legend: the full name, or "??? <TITLE>" while still a silhouette. */
export function legendLabel(info: LegendInfo, known: boolean): string {
  if (known) return info.full.toUpperCase();
  return `??? ${(info.title || 'THE UNKNOWN').toUpperCase()}${ROMAN[Math.min(info.round, ROMAN.length - 1)] ?? ''}`;
}

// ---------- the portrait ----------

const ARMORS = ['#b8c0cc', '#d8b860', '#b87a48', '#e8e4dc', '#7a90b8', '#5a5a6e', '#c88aa0', '#7aa86a', '#a0a8b8'];
const CAPES = ['#c03a3a', '#3a5ac0', '#7a3ac0', '#2a8a5a', '#c07a2a', '#e8c04a', '#8a2a4a'];
const PLUMES = ['#e05050', '#f4e8c1', '#4ab0e0', '#e8c04a', '#a050e0', '#50d080'];
const EMBLEMS = ['#c03a3a', '#3a5ac0', '#e8c04a', '#f4e8c1', '#2a8a5a', '#7a3ac0'];
const SKINS = ['#f0c8a0', '#d8a070', '#a86a40', '#7a4a2a', '#f4d8c0'];

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export interface Portrait {
  rows: string[];
  palette: Record<string, string>;
}

/** Palette for a silhouette (unknown Legend): a dark shape with a lighter rim. */
export const SILHOUETTE_PAL = { fill: '#120a1a', rim: '#4a3060' };

class Grid {
  cells: string[][];
  constructor(
    public w: number,
    public h: number,
  ) {
    this.cells = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
  }
  rect(x: number, y: number, w: number, h: number, ch: string): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.cells[j][i] = ch;
  }
  px(x: number, y: number, ch: string): void {
    this.rect(x, y, 1, 1, ch);
  }
  /** Every empty cell 4-adjacent to a filled one becomes the outline 'o'. */
  outline(): void {
    const filled = (i: number, j: number) => i >= 0 && j >= 0 && i < this.w && j < this.h && this.cells[j][i] !== '.' && this.cells[j][i] !== 'o';
    const marks: [number, number][] = [];
    for (let j = 0; j < this.h; j++)
      for (let i = 0; i < this.w; i++) if (this.cells[j][i] === '.' && (filled(i - 1, j) || filled(i + 1, j) || filled(i, j - 1) || filled(i, j + 1))) marks.push([i, j]);
    for (const [i, j] of marks) this.cells[j][i] = 'o';
  }
  rows(): string[] {
    return this.cells.map((r) => r.join(''));
  }
}

/** The Legend's 24x24 portrait (a front-facing hero; hat, weapon, shield, cape, pauldrons and
 * palette from the look and seed). Deterministic. Keys: o outline, a/b/h armor, v visor,
 * s skin, c cape, p plume, e emblem, g gold, w steel, k dark, d shield. */
export function legendPortrait(info: LegendInfo): Portrait {
  const r = rng(info.seed ^ 0x9e3779b9);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const lk = info.look;
  const armor = lk.armor ?? pick(ARMORS);
  const palette: Record<string, string> = {
    o: '#0a0410',
    a: armor,
    b: shade(armor, 0.68),
    h: shade(armor, 1.3),
    v: '#1a0a20',
    s: lk.skin ?? pick(SKINS),
    c: lk.capeColor ?? pick(CAPES),
    p: lk.plume ?? pick(PLUMES),
    e: lk.emblem ?? pick(EMBLEMS),
    g: '#e8c04a',
    w: '#dcdce8',
    k: '#4a3428',
    d: shade(lk.emblem ?? pick(EMBLEMS), 0.75),
  };
  const g = new Grid(24, 24);
  // Cape behind everything.
  if (lk.cape) {
    g.rect(7, 9, 10, 10, 'c');
    g.rect(6, 15, 12, 6, 'c');
  }
  // Legs and boots.
  g.rect(9, 18, 2, 4, 'b');
  g.rect(13, 18, 2, 4, 'b');
  g.rect(8, 21, 3, 1, 'k');
  g.rect(13, 21, 3, 1, 'k');
  // Torso with a tabard emblem and a belt.
  g.rect(8, 10, 8, 8, 'a');
  g.rect(14, 10, 2, 8, 'b');
  g.rect(10, 11, 4, 4, 'e');
  g.px(11, 12, 'g');
  g.px(12, 12, 'g');
  g.rect(8, 16, 8, 1, 'k');
  g.px(11, 16, 'g');
  // Arms and hands.
  g.rect(6, 10, 2, 6, 'a');
  g.rect(16, 10, 2, 5, 'b');
  g.rect(6, 16, 2, 1, 's');
  g.rect(17, 14, 2, 2, 's');
  if (lk.pauldrons) {
    g.rect(5, 9, 4, 2, 'g');
    g.rect(15, 9, 4, 2, 'g');
  }
  // Head.
  const hat = lk.hat;
  if (hat === 'hood') {
    g.rect(7, 2, 10, 8, 'c');
    g.rect(9, 5, 6, 4, 's');
    g.px(10, 6, 'v');
    g.px(13, 6, 'v');
    g.rect(10, 8, 4, 1, 'S');
  } else {
    const top = hat === 'tall' ? 0 : 3;
    g.rect(8, top, 8, 10 - top, 'a');
    g.rect(14, top, 2, 10 - top, 'b');
    g.rect(9, top + 1, 1, 2, 'h');
    g.rect(9, 6, 6, 1, 'v');
    g.px(11, 7, 'v');
    g.px(12, 7, 'v');
    if (hat === 'helm') g.rect(11, 1, 2, 2, 'g');
    if (hat === 'tall') g.rect(11, 0, 2, 1, 'g');
    if (hat === 'plume') {
      g.rect(11, 0, 2, 3, 'p');
      g.px(13, 0, 'p');
      g.px(14, 1, 'p');
    }
    if (hat === 'crown') {
      g.rect(8, 1, 8, 2, 'g');
      g.px(8, 0, 'g');
      g.px(11, 0, 'g');
      g.px(12, 0, 'g');
      g.px(15, 0, 'g');
      g.px(10, 2, 'e');
      g.px(13, 2, 'e');
    }
    if (hat === 'horns') {
      g.rect(6, 2, 2, 2, 'w');
      g.px(5, 1, 'w');
      g.rect(16, 2, 2, 2, 'w');
      g.px(18, 1, 'w');
    }
    if (hat === 'mitre') {
      g.rect(10, 0, 4, 3, 'p');
      g.rect(9, 2, 6, 1, 'g');
      g.px(11, 1, 'g');
      g.px(12, 1, 'g');
    }
  }
  // Weapon in the right hand (screen right).
  switch (lk.weapon) {
    case 'sword':
      g.rect(19, 2, 1, 12, 'w');
      g.px(19, 1, 'w');
      g.rect(18, 13, 3, 1, 'g');
      g.rect(19, 14, 1, 3, 'k');
      g.px(19, 17, 'g');
      break;
    case 'mace':
      g.rect(19, 5, 1, 12, 'k');
      g.rect(18, 2, 3, 3, 'w');
      g.px(19, 1, 'w');
      g.px(17, 3, 'w');
      g.px(21, 3, 'w');
      break;
    case 'axe':
      g.rect(19, 2, 1, 15, 'k');
      g.rect(20, 2, 2, 5, 'w');
      g.px(22, 3, 'w');
      g.px(22, 4, 'w');
      g.px(22, 5, 'w');
      break;
    case 'staff':
      g.rect(19, 2, 1, 17, 'k');
      g.rect(18, 0, 3, 2, 'e');
      g.px(19, 0, 'h');
      break;
    case 'ladle':
      g.rect(19, 4, 1, 13, 'k');
      g.rect(18, 1, 3, 3, 'w');
      g.px(19, 2, 'v');
      break;
    case 'spear':
      g.rect(19, 2, 1, 17, 'k');
      g.rect(19, 0, 1, 2, 'w');
      g.px(18, 1, 'w');
      g.px(20, 1, 'w');
      g.px(18, 4, 'p');
      break;
    case 'drill':
      g.rect(18, 8, 4, 3, 'k');
      g.rect(18, 4, 3, 4, 'w');
      g.rect(19, 2, 1, 2, 'w');
      g.px(19, 5, 'b');
      g.px(19, 7, 'b');
      break;
  }
  // Shield on the left arm.
  if (lk.shield) {
    g.rect(2, 10, 5, 6, 'd');
    g.rect(3, 16, 3, 1, 'd');
    g.px(4, 17, 'd');
    g.rect(4, 11, 1, 5, 'g');
    g.rect(3, 12, 3, 1, 'g');
  }
  g.outline();
  palette.S = shade(palette.s, 0.8);
  return { rows: g.rows(), palette };
}

/** The tiny walking figure (9x12, two frames) used on the Legend road: hat and weapon only, so
 * it reads as that Legend's silhouette. */
export function legendMini(info: LegendInfo, frame: number): string[] {
  const g = new Grid(10, 13);
  const lk = info.look;
  g.rect(3, 3, 4, 4, 'x'); // head
  g.rect(2, 7, 6, 3, 'x'); // body
  if (lk.cape) g.rect(2, 7, 6, 4, 'x');
  if (frame % 2) {
    g.rect(2, 10, 2, 2, 'x');
    g.rect(6, 10, 2, 2, 'x');
  } else {
    g.rect(3, 10, 2, 2, 'x');
    g.rect(5, 10, 2, 2, 'x');
  }
  switch (lk.hat) {
    case 'plume':
      g.rect(5, 0, 1, 3, 'x');
      g.px(6, 0, 'x');
      break;
    case 'crown':
      g.rect(3, 2, 4, 1, 'x');
      g.px(3, 1, 'x');
      g.px(6, 1, 'x');
      break;
    case 'horns':
      g.px(2, 2, 'x');
      g.px(1, 1, 'x');
      g.px(7, 2, 'x');
      g.px(8, 1, 'x');
      break;
    case 'mitre':
      g.rect(4, 1, 2, 2, 'x');
      g.px(4, 0, 'x');
      break;
    case 'tall':
      g.rect(3, 1, 4, 2, 'x');
      break;
    case 'hood':
      g.rect(2, 3, 6, 4, 'x');
      g.px(4, 2, 'x');
      break;
    default:
      g.px(4, 2, 'x');
      g.px(5, 2, 'x');
  }
  // Weapon at the side.
  if (lk.weapon === 'staff' || lk.weapon === 'spear') g.rect(8, 1, 1, 10, 'x');
  else g.rect(8, 3, 1, 6, 'x');
  if (lk.weapon === 'mace' || lk.weapon === 'axe') g.rect(8, 2, 1, 2, 'x');
  if (lk.shield) g.rect(1, 7, 2, 3, 'x');
  g.outline();
  return g.rows();
}

// ---------- Dawn Ambush ----------

/** Local-time dawn window: a camped Legend storms in at DAWN_START_H and the +50% lasts until
 * DAWN_END_H. Night (when a ready Legend camps instead of arriving) runs NIGHT_START_H-DAWN_START_H. */
export const DAWN_START_H = 7;
export const DAWN_END_H = 10;
export const NIGHT_START_H = 21;
export const DAWN_BONUS = 0.5;

interface DawnState {
  /** Per department: the appointment's start (ms epoch, local DAWN_START_H, or the arrival time
   * when the Legend arrived inside the window). */
  at: Partial<Record<DeptId, number>>;
}

function dawnState(save: SaveRoot): DawnState {
  const m = save.meta as SaveRoot['meta'] & { legendDawn?: DawnState };
  const v = m.legendDawn;
  if (!v || typeof v !== 'object' || typeof v.at !== 'object' || !v.at || Array.isArray(v.at)) m.legendDawn = { at: {} };
  for (const k of Object.keys(m.legendDawn!.at)) {
    const t = (m.legendDawn!.at as Record<string, unknown>)[k];
    if (typeof t !== 'number' || !Number.isFinite(t)) delete (m.legendDawn!.at as Record<string, unknown>)[k];
  }
  return m.legendDawn!;
}

export function isNight(ms: number): boolean {
  const h = new Date(ms).getHours();
  return h >= NIGHT_START_H || h < DAWN_START_H;
}

export function inDawnWindow(ms: number): boolean {
  const h = new Date(ms).getHours();
  return h >= DAWN_START_H && h < DAWN_END_H;
}

/** The next local DAWN_START_H:00 at or after `ms`. */
export function nextDawn(ms: number): number {
  const d = new Date(ms);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAWN_START_H, 0, 0, 0);
  if (t.getTime() < ms) t.setDate(t.getDate() + 1);
  return t.getTime();
}

/** End of the bonus window that starts at `at` (DAWN_END_H:00 that local day). */
export function dawnEnd(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAWN_END_H, 0, 0, 0).getTime();
}

/** Whether the span [from, to] covers any night hour (local). */
export function spansNight(from: number, to: number): boolean {
  if (!(to > from)) return isNight(to);
  if (isNight(from) || isNight(to)) return true;
  // Neither end is at night: a night lies between them if they are on different days, or the
  // span is long enough to wrap one.
  if (to - from >= 24 * 3600_000) return true;
  return new Date(from).getDate() !== new Date(to).getDate();
}

/**
 * A Legend just became ready (legendWaiting turned true) at `now`. `awayFrom` is the start of the
 * absence being credited, if this happened during offline accounting. Night -> they camp until
 * the next dawn; inside the dawn window after an absence that covered the night -> the ambush is
 * on right now; otherwise no appointment (they simply wait, as before). Returns the appointment.
 */
export function onLegendReady(save: SaveRoot, id: DeptId, now: number, awayFrom?: number | null): number | null {
  const st = dawnState(save);
  let at: number | null = null;
  if (isNight(now)) at = nextDawn(now);
  else if (inDawnWindow(now) && awayFrom != null && spansNight(awayFrom, now)) at = now;
  if (at === null) delete st.at[id];
  else st.at[id] = at;
  return at;
}

export type DawnPhase = 'none' | 'camping' | 'ambush';

/** The appointment's phase at `now`; an expired appointment is removed (missing it costs nothing). */
export function dawnPhase(save: SaveRoot, id: DeptId, now: number): { phase: DawnPhase; at: number | null } {
  const st = dawnState(save);
  const at = st.at[id];
  if (at === undefined) return { phase: 'none', at: null };
  const d = save.depts[id];
  if (!d || !d.cycle.legendWaiting) {
    delete st.at[id];
    return { phase: 'none', at: null };
  }
  if (now < at) {
    // A clock pushed far back must not leave a camp for days.
    if (at - now > 36 * 3600_000) {
      delete st.at[id];
      return { phase: 'none', at: null };
    }
    return { phase: 'camping', at };
  }
  if (now < dawnEnd(at)) return { phase: 'ambush', at };
  delete st.at[id];
  return { phase: 'none', at: null };
}

/** Dread multiplier for a Fall now: 1 + DAWN_BONUS during the ambush, else 1. */
export function dawnMult(save: SaveRoot, id: DeptId, now: number): number {
  return dawnPhase(save, id, now).phase === 'ambush' ? 1 + DAWN_BONUS : 1;
}

export function clearDawn(save: SaveRoot, id: DeptId): void {
  delete dawnState(save).at[id];
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** One report / card line for an appointment, or null. Upper-case, short. */
export function dawnLine(info: LegendInfo, phase: DawnPhase, at: number | null): string | null {
  const who = info.name.toUpperCase();
  if (phase === 'camping' && at !== null) return `${who} CAMPS OUTSIDE. ARRIVES AT DAWN (${hhmm(at)}): MEET THEM FOR +50% DREAD.`;
  if (phase === 'ambush') return `DAWN AMBUSH! ${who} STORMS THE GATE. +50% DREAD UNTIL ${DAWN_END_H}:00.`;
  return null;
}

// ---------- preview ----------

export interface LegendPreview {
  dept: DeptId;
  legend: LegendInfo;
  /** Shown by name (already met in an earlier cycle, or ready now) or as a silhouette. */
  known: boolean;
  /** "??? THE TALLER SISTER" or the full name, upper-case. */
  label: string;
  /** 0..1: how far down the road (Infamy / 100). 1 = at the door. */
  approach: number;
  waiting: boolean;
  /** Legends of this department on the Trophy wall. */
  caught: number;
  dawn: { phase: DawnPhase; at: number | null };
  /** If the player left now: seconds until the Legend is ready on offline income alone (null =
   * not reachable inside the offline cap, or the skill gate is not met yet). */
  etaS: number | null;
  /** The forecast arrival lands at night: "ARRIVES AT DAWN". */
  dawnForecast: boolean;
}

/** Seconds until the economy gate fills on offline income (skill gate must already be met), or
 * null. A rough forecast for the road label, not a promise. */
export function legendEtaSeconds(save: SaveRoot, id: DeptId, def: DeptEcon, defs: Record<string, DeptEcon>, now: number): number | null {
  const d = save.depts[id];
  if (!d) return null;
  if (d.cycle.legendWaiting) return 0;
  if (d.cycle.heldLevel < def.skillTarget(d.cycle.n)) return null;
  const left = econFloor(def, d.cycle.n) - d.cycle.earnings;
  if (!(left > 0)) return 0;
  // Night Orders (core/orders.ts): offline credit fills the gate past 90% only under a "gate"
  // order, which also counts it x1.5 (and an income order's bank bonus counts too).
  const eff = effectOf(standingOrder(save, id, def));
  if (Number.isFinite(eff.gateCap) && d.cycle.earnings + left > eff.gateCap * econFloor(def, d.cycle.n) + 1e-9) return null;
  const rate = safeIdleRate(def, d) * coreMult(save, id, defs, now) * offlineFactor(save, id) * econGateMult(save, id) * eff.bank * eff.gate;
  if (!(rate > 0)) return null;
  const t = left / rate;
  return t <= offlineCapSeconds(save) ? t : null;
}

/** The next Legend of a department for HUD / Trophy wall / Fall card display; null if locked. */
export function legendPreview(
  save: SaveRoot,
  id: DeptId,
  def: (DeptEcon & RosterSource) | undefined,
  defs: Record<string, DeptEcon>,
  now = Date.now(),
): LegendPreview | null {
  const d: DeptSave | undefined = save.depts[id];
  if (!d || !def) return null;
  const legend = legendFor(def, d.cycle.n);
  const caught = save.meta.trophies.filter((t) => t.dept === id).length;
  const met = save.meta.trophies.some((t) => t.dept === id && t.name === legend.full);
  const waiting = !!d.cycle.legendWaiting;
  let value = 0;
  try {
    value = infamy(def, d).value;
  } catch {
    value = 0;
  }
  const approach = waiting ? 1 : Math.max(0, Math.min(1, value / 100));
  let etaS: number | null = null;
  try {
    etaS = legendEtaSeconds(save, id, def, defs, now);
  } catch {
    etaS = null;
  }
  const dawnForecast = !waiting && etaS !== null && etaS > 0 && isNight(now + etaS * 1000);
  const known = met || waiting;
  return { dept: id, legend, known, label: legendLabel(legend, known), approach, waiting, caught, dawn: dawnPhase(save, id, now), etaS, dawnForecast };
}
