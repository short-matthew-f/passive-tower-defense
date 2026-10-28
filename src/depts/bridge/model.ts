// The Troll Bridge: pure numbers, traveler generation and haggle rules (specs/06). No Pixi
// imports, so a node script or the balance sim can load this file on its own.
//
// Deviations from the spec seeds (marked TUNED / MVP below):
//  - payout_mult uses the spec's documented fallback 1.2^M (06 §7 audit, README decision 39),
//    so every Menace step pays x1.2 as the suite's dial rule requires.
//  - No crop strip: travelers are drawn large enough that every tell is a visible part (task
//    brief, D-26). Uncertainty comes from concealed tells (a liar may hide some of them),
//    allowed alternates (red herrings), the daily Poster and the Menace rule cards. Hero Nose
//    raises the chance a concealed tell shows. Squint (2 levels) keeps its price and role as the
//    "look closer" node: tapping the traveler makes Grumm point at up to L odd parts (red
//    herrings and today's fake tell included, so it shows where to look, not the verdict).
//  - Toll Booth has 2 levels: the Noble, then the Bard (06 §5 "later"). The Tax Collector is left
//    out: a traveler that takes from the bank breaks the 06 §4 rule that nothing drains it.
//  - Hire Goon caps at 3: goon_efficiency is already 1 at 3 goons (06 §3), so levels 4-6 would buy
//    nothing.
//  - Rule cards 3/6/9/15/18 are in; 12 (Travelling Pairs) needs a two-traveler gate and is not.
//
// Wave 1 (genre-research README "Troll Bridge" #1-#5, deduction.md R1-R4, R9):
//  - The Daily Decree replaces the printed answer key. Each day shows 2 hero tells and 2 smuggler
//    tells (pictures, no labels) out of a 7 + 5 part pool; every day exactly one tell expires and
//    one is added. Off-Decree pool parts turn up on ~30% of travelers as harmless fashion (red
//    herrings), yesterday's expired tell most often, so memorising never works. Smugglers can hide
//    their first tell too (no more "always shows").
//  - The Codex (persistent) records which parts you have caught liars wearing: the breadcrumbs
//    that make an unlabeled Decree learnable.
//  - Haggle by mood: 4 price tiers (FAIR, STEEP, GOUGE, ROB), Moonlighter's 4 faces, 3 Patience
//    pips that over-asks spend, counters at wallet x U(0.8, 1.0) (never the wallet itself),
//    wallets that drift per Claim each day, and a per-day ledger of the best price per Claim.
//  - Glower (Shop Titans energy): GOUGE and ROB spend a charge from a per-session budget.
//  - Both mistakes cost: a false accusation, or letting a liar through when a tell was showing.
//    Two are free per session, then each takes an escalating fine from this session's takings
//    (never from what was banked before you arrived).

import { LONG_GROWTH, LONG_MAX, longMult } from '../../core/longnode';

export type Who = 'peasant' | 'pilgrim' | 'merchant' | 'adventurer' | 'noble' | 'bard';
export type Kind = Who | 'smuggler' | 'hero';
export type Where = 'farm' | 'shrine' | 'market' | 'fort' | 'castle';
export type Slot = 'hat' | 'body' | 'feet' | 'hand' | 'belt' | 'pack' | 'aura';
export const SLOTS: Slot[] = ['hat', 'body', 'feet', 'hand', 'belt', 'pack', 'aura'];

export interface Look {
  hat: string;
  body: string;
  feet: string;
  hand: string;
  belt: string;
  pack: string;
  aura: string;
  cloak: number; // index into CLOAKS
  hair: number; // index into HAIRS
  skin: number;
  mark: number; // 0 none, 1 eyepatch, 2 moustache, 3 scar
}

export interface Traveler {
  id: number;
  kind: Kind;
  who: Who; // claimed
  where: Where; // claimed
  look: Look;
  /** Claimed fare (what the toll is priced against) and the traveler's real fare (bounties). */
  claimFare: number;
  kindFare: number;
  /** In multiples of the claimed fare. */
  wallet: number;
  slack: number;
  brawn: number;
  bonkRoll: number;
  smuggler: boolean;
  hero: boolean;
  /** Visible contradictions (slot names, 'where', 'writ' or 'shift'). */
  tells: string[];
  concealed: number;
  writ: 0 | 1 | 2; // none, genuine, forged
  posterMatch: boolean;
  sniff: boolean;
  showdown: boolean;
  scripted: string;
  /** Bribes rule card (Menace 15): a smuggler's offer in x claimed fare (0 = none). */
  bribe: number;
  /** Shapeshifters rule card (Menace 18): the Claim flickers to the true one on a second look. */
  shift: boolean;
  /** Wave 1: Patience pips at the start of the haggle. */
  pips: number;
}

// ---------- palettes (shared with art.ts) ----------

export const CLOAKS = [0x3a6ea8, 0xa83a3a, 0x3a8a4a, 0x8a5aa8, 0xd8a83a, 0x6a6a72];
export const CLOAK_NAMES = ['BLUE', 'RED', 'GREEN', 'PURPLE', 'YELLOW', 'GREY'];
export const HAIRS = [0x2a1a14, 0x7a4a24, 0xe8c860, 0xd0582a];
export const HAIR_NAMES = ['BLACK HAIR', 'BROWN HAIR', 'BLOND HAIR', 'RED HAIR'];
export const SKINS = [0xf0c8a0, 0xc89068, 0x8a5a3a];
export const MARK_NAMES = ['', 'EYEPATCH', 'MOUSTACHE', 'SCAR'];
export const SEALS = [0xd03030, 0x3060d0, 0x30a040, 0xe0b020];
export const SEAL_NAMES = ['RED', 'BLUE', 'GREEN', 'GOLD'];

// ---------- traveler table (06 §5) ----------

interface KindStats {
  weight: number;
  fare: number;
  wallet: [number, number];
  patience: number;
  brawn: number;
  /** Patience pips (wave 1 mood haggle): over-asks spend them; at 0 the traveler walks. */
  pips: number;
}

export const KINDS: Record<Kind, KindStats> = {
  peasant: { weight: 30, fare: 4, wallet: [1.0, 1.3], patience: 0.3, brawn: 0.05, pips: 3 },
  pilgrim: { weight: 15, fare: 6, wallet: [1.1, 1.5], patience: 0.5, brawn: 0, pips: 3 },
  merchant: { weight: 20, fare: 12, wallet: [1.5, 2.5], patience: 0.4, brawn: 0.1, pips: 3 },
  adventurer: { weight: 10, fare: 10, wallet: [1.2, 1.8], patience: 0.3, brawn: 0.6, pips: 2 },
  smuggler: { weight: 12, fare: 8, wallet: [1.0, 1.6], patience: 0.6, brawn: 0.2, pips: 4 },
  hero: { weight: 7, fare: 10, wallet: [1.0, 1.0], patience: 0.1, brawn: 0.8, pips: 2 },
  noble: { weight: 5, fare: 30, wallet: [2.0, 3.5], patience: 0.2, brawn: 0, pips: 2 },
  // Toll Booth 2 (06 §5 "later"): a cheap purse but endless patience; pays in song too.
  bard: { weight: 4, fare: 5, wallet: [0.7, 0.9], patience: 1.0, brawn: 0, pips: 5 },
};

export const WHO_LIST: Who[] = ['peasant', 'pilgrim', 'merchant', 'adventurer', 'noble', 'bard'];

/** What each Claim normally looks like. The first option is the usual one; the others are
 *  allowed alternates (the red herrings: odd-looking, but they fit the Claim). */
export const NORMAL: Record<Who, Record<Slot, string[]> & { where: Where[] }> = {
  peasant: { hat: ['straw', 'none'], body: ['patched'], feet: ['bare', 'worn'], hand: ['hoe', 'none'], belt: ['rope'], pack: ['none', 'sack'], aura: ['none', 'flies'], where: ['farm', 'market'] },
  pilgrim: { hat: ['hood', 'none'], body: ['robe'], feet: ['bare'], hand: ['staff'], belt: ['rope'], pack: ['none', 'sack'], aura: ['none'], where: ['shrine'] },
  merchant: { hat: ['cap', 'none'], body: ['coat', 'patched'], feet: ['fancy', 'worn'], hand: ['scales', 'none'], belt: ['purse'], pack: ['satchel', 'none'], aura: ['none'], where: ['market', 'castle', 'fort'] },
  adventurer: { hat: ['helm', 'none'], body: ['armor'], feet: ['boots'], hand: ['sword'], belt: ['none', 'purse'], pack: ['bedroll', 'none'], aura: ['none'], where: ['fort', 'shrine'] },
  noble: { hat: ['feather'], body: ['coat'], feet: ['fancy'], hand: ['fan'], belt: ['purse'], pack: ['none'], aura: ['perfume', 'none'], where: ['castle', 'market'] },
  bard: { hat: ['cap', 'none'], body: ['coat', 'patched'], feet: ['worn', 'fancy'], hand: ['lute'], belt: ['rope', 'purse'], pack: ['none', 'satchel'], aura: ['notes', 'none'], where: ['castle', 'market'] },
};

/** Liar tell pools (slot -> part), in Decree rotation order. Heroes carry steel and holiness;
 * smugglers carry goods. Neighbours never share a slot, so a Decree window never asks one liar to
 * wear two parts in the same slot. Only today's Decree window marks a liar; the rest of the pool
 * is harmless fashion today. */
export const HERO_POOL: [Slot, string][] = [
  ['feet', 'steel'],
  ['aura', 'glow'],
  ['belt', 'hilt'],
  ['pack', 'shield'],
  ['hat', 'helm'],
  ['hand', 'sword'],
  ['body', 'armor'],
];
export const SMUG_POOL: [Slot, string][] = [
  ['pack', 'barrel'],
  ['feet', 'newboots'],
  ['pack', 'bulge'],
  ['hand', 'scales'],
  ['hat', 'feather'],
];
/** Rule card 6 (Hat Smuggling): a standing smuggler tell on top of the Decree. */
export const HAT_SMUGGLE: [Slot, string] = ['hat', 'tall'];
/** Back-compat names (the sim and older code read these): the full pools. */
export const HERO_TELLS = HERO_POOL;
export const SMUGGLE_TELLS = SMUG_POOL;
export const PART_NAMES: Record<string, string> = {
  steel: 'STEEL BOOTS',
  glow: 'HOLY GLOW',
  hilt: 'HIDDEN HILT',
  shield: 'SHIELD',
  helm: 'HELM',
  sword: 'SWORD',
  armor: 'ARMOR',
  barrel: 'BARREL',
  newboots: 'NEW BOOTS',
  bulge: 'BIG SACK',
  scales: 'SCALES',
  feather: 'PLUMED HAT',
  tall: 'TALL HAT',
};
export const HERO_TELL_NAMES = PART_NAMES;
/** Tells per day on the Decree (deduction.md R1: 3-4 of ~12 parts). */
export const DECREE_HERO = 2;
export const DECREE_SMUG = 2;
/** Share of travelers wearing one off-Decree pool part (P11: ~30% red herrings), and how often
 * that part is yesterday's expired tell. */
export const HERRING_P = 0.3;
export const HERRING_EXPIRED = 0.4;

export const RULE_CARDS: { m: number; id: string; name: string; desc: string }[] = [
  { m: 3, id: 'writ', name: 'WRITS', desc: 'SOME CARRY A WRIT. ITS SEAL MUST MATCH THE POSTER. HEROES FORGE THEM.' },
  { m: 6, id: 'hats', name: 'HAT SMUGGLING', desc: 'A TALL LUMPY HAT HIDES GOODS. SEARCH IT.' },
  { m: 9, id: 'kits', name: 'DISGUISE KITS', desc: "ONE DECREE TELL IS A FAKE TODAY (SEE THE BOARD): ANYONE WEARS IT. IGNORE IT." },
  { m: 15, id: 'bribe', name: 'BRIBES', desc: 'SMUGGLERS MAY OFFER A BRIBE. TAKE IT AND THEY PASS, OR SEARCH FOR THE GOODS.' },
  { m: 18, id: 'shift', name: 'SHAPESHIFTERS', desc: "TAP A TRAVELER TWICE: A SHIFTER'S CLAIM FLICKERS TO THE TRUTH." },
];

/** The rule card that opens at Menace m (or undefined). */
export const cardAt = (m: number) => RULE_CARDS.find((c) => c.m === m);

// ---------- rng ----------

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];

// ---------- the daily Wanted Poster (06 §2) ----------

export interface Poster {
  day: string;
  name: string;
  cloak: number;
  hair: number;
  mark: number;
  shows: ('cloak' | 'hair' | 'mark')[];
  seal: number;
  fake: string; // hero tell that is "fake" today (Menace 9 rule card)
  /** Today's Decree (wave 1): the tells that mark a liar today. */
  decree: Decree;
}

export interface Decree {
  /** Day number (days since 1970 for a calendar day). */
  day: number;
  hero: [Slot, string][];
  smug: [Slot, string][];
  /** The part added today and the one that expired (yesterday's, harmless today). */
  added: string;
  expired: string;
  /** Wallet drift per Claim today (Moonlighter demand): x0.85-1.15. */
  drift: Record<Who, number>;
}

/** Day number of a day key: 'Y-M-D' -> days since 1970 (local calendar date); otherwise the key's
 * trailing number (the sim's 'sim-N'), else a hash. */
export function dayIndex(day: string): number {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(day);
  if (m) return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
  const n = /(\d+)$/.exec(day);
  if (n) return Number(n[1]);
  let h = 7;
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619) >>> 0;
  return h % 100000;
}

const windowOf = <T>(pool: T[], k: number, n: number): T[] => Array.from({ length: n }, (_, i) => pool[(((k + i) % pool.length) + pool.length) % pool.length]);

/** The Decree for day d. Hero and smuggler windows take turns to slide one step, so each day
 * exactly one tell expires and one is added (Papers, Please rules come and go). */
export function decreeFor(d: number): Decree {
  const kh = Math.floor((d + 1) / 2);
  const ks = Math.floor(d / 2);
  const hero = windowOf(HERO_POOL, kh, DECREE_HERO);
  const smug = windowOf(SMUG_POOL, ks, DECREE_SMUG);
  const heroMoved = kh !== Math.floor(d / 2);
  const added = heroMoved ? hero[DECREE_HERO - 1][1] : smug[DECREE_SMUG - 1][1];
  const expired = heroMoved ? windowOf(HERO_POOL, kh - 1, 1)[0][1] : windowOf(SMUG_POOL, ks - 1, 1)[0][1];
  const r = rng((d * 2654435761) >>> 0);
  const drift = {} as Record<Who, number>;
  for (const w of WHO_LIST) drift[w] = Math.round((0.85 + 0.3 * r()) * 100) / 100;
  return { day: d, hero, smug, added, expired, drift };
}

/** Whether a part marks a liar today (Decree, plus the Hat Smuggling card). */
export function decreeKind(dec: Decree, part: string, menace: number): 'hero' | 'smug' | null {
  if (dec.hero.some(([, p]) => p === part)) return 'hero';
  if (dec.smug.some(([, p]) => p === part)) return 'smug';
  if (menace >= 6 && part === HAT_SMUGGLE[1]) return 'smug';
  return null;
}

/** Which pool a part belongs to (what kind of liar wears it on a day it is on the Decree). */
export function poolKind(part: string): 'hero' | 'smug' | null {
  if (HERO_POOL.some(([, p]) => p === part)) return 'hero';
  if (SMUG_POOL.some(([, p]) => p === part) || part === HAT_SMUGGLE[1]) return 'smug';
  return null;
}

const NAMES = ['SIR PELLAM', 'DAME OSRIC', 'SIR BEDWIN', 'LADY MAEVE', 'SIR TOMAS', 'DAME HILDE', 'SIR GAWEN', 'LADY ISOLT', 'SIR ROLF', 'DAME BRYN'];

export function dayKey(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function posterFor(day: string): Poster {
  let h = 7;
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619) >>> 0;
  const r = rng(h);
  const decree = decreeFor(dayIndex(day));
  const all: ('cloak' | 'hair' | 'mark')[] = ['cloak', 'hair', 'mark'];
  const n = r() < 0.5 ? 2 : 3;
  const shows = n === 3 ? all : all.filter((x) => x !== pick(r, all));
  return {
    day,
    name: pick(r, NAMES),
    cloak: Math.floor(r() * CLOAKS.length),
    hair: Math.floor(r() * HAIRS.length),
    mark: 1 + Math.floor(r() * 3),
    shows,
    seal: Math.floor(r() * SEALS.length),
    fake: pick(r, decree.hero)[1],
    decree,
  };
}

export function posterMatches(p: Poster, l: Look): number {
  let n = 0;
  if (p.shows.includes('cloak') && l.cloak === p.cloak) n++;
  if (p.shows.includes('hair') && l.hair === p.hair) n++;
  if (p.shows.includes('mark') && l.mark === p.mark) n++;
  return n;
}

// ---------- run state ----------

export interface BridgeStats {
  travelers: number;
  tolls: number;
  unmasks: number;
  evUnmasks: number;
  bounty10: number;
  falseAcc: number;
  confisc: number;
  bonks: number;
  bestStreak: number;
  posterOpens: number;
  slipped: number;
  /** Looks at a traveler (taps on the sprite; the onboarding's first beat). */
  looks: number;
  bribes: number;
  /** Wave 1: mistakes (false accusations + liars let through while a tell showed) and fines. */
  mistakes: number;
  fines: number;
  /** Liars that passed with a tell showing (the second kind of mistake). */
  missed: number;
}

export interface Levels {
  glare: number;
  tongue: number;
  skull: number;
  fists: number;
  sense: number;
  nose: number;
  sniffer: number;
  signage: number;
  bench: number;
  booth: number;
  goons: number;
  pricing: number;
  /** Squint (06 §6 B): Grumm points at up to L odd parts when you look at a traveler. */
  squint: number;
  /** Royal Toll Charter, the long node (core/longnode.ts): every fare x1.15 per level. */
  charter: number;
}

export interface BridgeRun {
  bank: number;
  seed: number;
  idx: number;
  menace: number; // set (free, <= menaceMax)
  menaceMax: number; // bought this cycle
  lv: Levels;
  streak: number;
  whisper: number;
  /** Evidence-backed Unmasks per Menace level this cycle (Infamy skill gate). */
  ev: Record<string, number>;
  stats: BridgeStats;
  /** D-bridge-01: a Showdown earned by 5 Whisper pips, waiting for its traveler. */
  showdown?: boolean;
  /** D-bridge-02: the travelers on the bench, and the one at the gate with its haggle so far. */
  bench?: Traveler[];
  gate?: { t: Traveler; h: Haggle; searched: boolean; looks: number } | null;
  /** Wave 1: this session's Glower budget, mistakes and takings (the fine base). */
  sess?: Session;
  /** Wave 1: today's haggle ledger per Claim (best price paid, lowest over-ask). */
  ledger?: Ledger;
}

export interface Session {
  /** Glower charges left (GOUGE / ROB spend one). */
  glower: number;
  /** Mistakes so far this session (the first FREE_MISTAKES are free). */
  mistakes: number;
  /** Tollpence earned by hand this session: fines come out of this, never the older bank. */
  purse: number;
  /** Hand earnings this session (tolls, bounties, seizures): the purse / paid = an average toll. */
  paid: number;
  /** Last activity (ms epoch): a gap over SESSION_GAP_S starts a new session. */
  at: number;
}

export interface Ledger {
  day: number;
  best: Partial<Record<Who, number>>;
  over: Partial<Record<Who, number>>;
}

export interface CodexEntry {
  /** Times seen on a caught hero / smuggler. */
  h: number;
  s: number;
}

export interface BridgePersistent {
  bountiesLife: number;
  /** Wave 1 Codex breadcrumbs: part (or 'where' / 'writ') -> catches. Survives Falls. */
  codex?: Record<string, CodexEntry>;
}

export function defaultStats(): BridgeStats {
  return { travelers: 0, tolls: 0, unmasks: 0, evUnmasks: 0, bounty10: 0, falseAcc: 0, confisc: 0, bonks: 0, bestStreak: 0, posterOpens: 0, slipped: 0, looks: 0, bribes: 0, mistakes: 0, fines: 0, missed: 0 };
}

export function defaultLevels(): Levels {
  return { glare: 0, tongue: 0, skull: 0, fists: 0, sense: 0, nose: 0, sniffer: 0, signage: 0, bench: 0, booth: 0, goons: 0, pricing: 0, squint: 0, charter: 0 };
}

/** Grumm's float at unlock and after each Fall. SIM-TUNED 0 -> 100 (sim/README.md "Pass 5"): with
 * an empty bank and no goons the Bridge earns nothing until the player plays it, so a Fall at the
 * very end of a session left nothing affordable on the next returns (00 §8 hard band). 100 covers
 * the first goon (75), like the Dungeon's 100 Plunder and the Pit's 120-Teeth purse. */
export const OPENING_FLOAT = 100;

export function defaultRun(): BridgeRun {
  return {
    bank: OPENING_FLOAT,
    seed: Math.floor(Math.random() * 1e9),
    idx: 0,
    menace: 0,
    menaceMax: 0,
    lv: defaultLevels(),
    streak: 0,
    whisper: 0,
    ev: {},
    stats: defaultStats(),
  };
}

export function defaultPersistent(): BridgePersistent {
  return { bountiesLife: 0, codex: {} };
}

/** Fills fields missing from older saves (cheap; safe to call often). */
export function normalize(run: any, per: any): void {
  if (run) {
    if (!run.lv || !run.stats || run.ev === undefined) Object.assign(run, { ...defaultRun(), ...run });
    run.lv = { ...defaultLevels(), ...run.lv };
    run.stats = { ...defaultStats(), ...run.stats };
  }
  if (per && per.bountiesLife === undefined) per.bountiesLife = 0;
  if (per && !per.codex) per.codex = {};
}

// ---------- wave 1: sessions, Glower, mistakes, ledger, Codex ----------

/** A gap this long (s) since the last activity starts a new session (Glower refills, the free
 * mistakes come back, the purse empties). */
export const SESSION_GAP_S = 600;
/** Glower budget per session (Shop Titans energy). SIM-TUNED 6 (deduction.md R4's "say, 6"). */
export const GLOWER_MAX = 6;
/** One Glower charge comes back every this many seconds, and half a charge per FAIR toll. */
export const GLOWER_REGEN_S = 60;
export const GLOWER_FAIR_REFUND = 0.5;
/** Papers, Please citations: 2 free mistakes per session, then each costs 1, 2, 3, then 4 average
 * tolls of this session (purse / paid), and never more than the session purse. SIM-TUNED: a share
 * of the whole session purse (5-25%) read as ruinous on long sessions (an hour's reference play
 * lost ~80% of its takings); counted in tolls it costs the reference bot ~5-10%. */
export const FREE_MISTAKES = 2;
export const FINE_MAX_TOLLS = 4;
export const fineTolls = (n: number) => (n <= FREE_MISTAKES ? 0 : Math.min(FINE_MAX_TOLLS, n - FREE_MISTAKES));

export function newSession(now: number): Session {
  return { glower: GLOWER_MAX, mistakes: 0, purse: 0, paid: 0, at: now };
}

/** The run's session, renewed after a long gap (pure apart from writing r.sess). */
export function session(r: BridgeRun, now: number): Session {
  if (!r.sess || !(now - r.sess.at <= SESSION_GAP_S * 1000) || now < r.sess.at - 60000) r.sess = newSession(now);
  r.sess.paid ??= 0;
  return r.sess;
}

/** Records a mistake; returns the fine (Tollpence, <= the session purse and the bank). */
export function mistakeFine(s: Session, bank: number): number {
  s.mistakes++;
  const fine = Math.max(0, Math.min(bank, s.purse, (s.purse / Math.max(1, s.paid)) * fineTolls(s.mistakes)));
  s.purse = Math.max(0, s.purse - fine);
  return fine;
}

export function ledgerFor(r: BridgeRun, day: number): Ledger {
  if (!r.ledger || r.ledger.day !== day) r.ledger = { day, best: {}, over: {} };
  return r.ledger;
}

/** Codex breadcrumb: a caught liar's visible tells are written down. */
export function codexNote(per: BridgePersistent, t: Traveler): string[] {
  const book = (per.codex ??= {});
  const fresh: string[] = [];
  for (const tag of t.tells) {
    const key = tag === 'where' || tag === 'writ' || tag === 'shift' ? tag : t.look[tag as Slot];
    if (!key) continue;
    const e = (book[key] ??= { h: 0, s: 0 });
    if (e.h + e.s === 0) fresh.push(key);
    if (t.hero) e.h++;
    else e.s++;
  }
  return fresh;
}

/** What the Codex says a part means: 'hero', 'smug' or null (never caught). */
export function codexKind(per: BridgePersistent, key: string): 'hero' | 'smug' | null {
  const e = per.codex?.[key];
  if (!e || e.h + e.s === 0) return null;
  return e.h >= e.s ? 'hero' : 'smug';
}

// ---------- upgrade numbers (06 §6) ----------

export interface NodeDef {
  id: keyof Levels;
  base: number;
  growth: number;
  max: number;
}

export const NODES: Record<keyof Levels, NodeDef> = {
  glare: { id: 'glare', base: 50, growth: 1.15, max: 50 },
  tongue: { id: 'tongue', base: 80, growth: 1.18, max: 30 },
  skull: { id: 'skull', base: 120, growth: 1.25, max: 14 },
  fists: { id: 'fists', base: 200, growth: 1.3, max: 10 },
  sense: { id: 'sense', base: 100, growth: 1.2, max: 25 },
  nose: { id: 'nose', base: 300, growth: 1.35, max: 10 },
  sniffer: { id: 'sniffer', base: 250, growth: 1.3, max: 10 },
  signage: { id: 'signage', base: 200, growth: 1.22, max: 40 },
  bench: { id: 'bench', base: 500, growth: 2.5, max: 2 },
  booth: { id: 'booth', base: 1000, growth: 3, max: 2 }, // the Noble, then the Bard
  goons: { id: 'goons', base: 75, growth: 1.6, max: 3 }, // MVP: 3 goons cover base traffic (06 §3)
  pricing: { id: 'pricing', base: 150, growth: 1.2, max: 20 },
  squint: { id: 'squint', base: 150, growth: 2.5, max: 2 },
  // The long node (sim/README.md "Pass 5"): opens after the 2nd Fall. SIM-TUNED base: ~2 h of a
  // later cycle's plateau idle (~65/s).
  charter: { id: 'charter', base: 8e4, growth: LONG_GROWTH, max: LONG_MAX },
};
/** Royal Toll Charter milestone titles (one per 10 levels). */
export const CHARTERS = ['WRIT', 'LICENSE', 'CHARTER', 'MONOPOLY', 'TOLLROAD', 'KINGSWAY', 'EMPIRE'];
export const charterMult = (L: number) => longMult(L ?? 0);

export const nodeCost = (id: keyof Levels, L: number) => NODES[id].base * NODES[id].growth ** L;

export const MENACE_MAX = 20;
export const menaceCost = (m: number) => 400 * 2.5 ** m; // TUNED from 500 x 3^M (see TUNING) // price of level m (bought once per cycle)
export const payoutMult = (m: number) => 1.2 ** m; // TUNED: spec fallback (06 §7 audit)
export const heroShare = (m: number) => Math.min(0.17, 0.07 + 0.005 * m);
export const patienceMult = (m: number) => 1 - 0.02 * m;
export const glareMult = (L: number) => 1 + 0.04 * L;
export const tongueFrac = (L: number) => Math.min(0.6, 0.02 * L);
export const napSeconds = (skull: number) => Math.max(6, 20 - skull);
export const brawnMult = (fists: number) => Math.max(0, 1 - 0.05 * fists);
export const senseBand = (L: number) => Math.max(0.05, 0.3 - 0.01 * L);
export const signageMult = (L: number) => 1 + 0.05 * L;
export const benchCap = (L: number) => 3 + L;
export const goonFlat = (pricing: number) => 1 + 0.02 * pricing;
export const TRAFFIC = 1 / 7;
export const ARRIVE_S = 7;
export const GOON_RATE = 0.05;
export const goonEff = (goons: number) => Math.min(1, (goons * GOON_RATE) / TRAFFIC);
export const streakMult = (s: number) => 1 + 0.05 * Math.min(10, s);
/** A toll at or above this multiple extends the Streak. Wave 1: 1.3 -> 1.0, so the one-tap FAIR
 * on a poor Claim keeps the Streak (the price tiers have no 1.3). */
export const STREAK_MIN = 1.0;
export const NOTCH_MIN = 5; // 0.5x
export const NOTCH_MAX = 40; // 4.0x

/** Wave 1 price tiers (fun-review P13), x claimed fare. GOUGE and ROB spend a Glower charge.
 * SIM-TUNED from P13's 1.0 / 1.5 / 2.2 / 3.0: STEEP 1.4 and GOUGE 2.0 sit on the pilgrim and
 * merchant wallets, so the coarse tiers keep the reference bot's active:idle near the old 2.7x. */
export interface PriceTier {
  id: 'fair' | 'steep' | 'gouge' | 'rob';
  name: string;
  mult: number;
  glower: number;
}
export const PRICE_TIERS: PriceTier[] = [
  { id: 'fair', name: 'FAIR', mult: 1.0, glower: 0 },
  { id: 'steep', name: 'STEEP', mult: 1.4, glower: 0 },
  { id: 'gouge', name: 'GOUGE', mult: 2.0, glower: 1 },
  { id: 'rob', name: 'ROB', mult: 3.0, glower: 1 },
];
export const nap = napSeconds;
export const visibleChance = (nose: number) => Math.min(0.95, 0.6 + 0.04 * nose);
export const sniffChance = (sniffer: number) => Math.min(1, 0.1 * sniffer);
export const GATE_UNMASKS = 5;
/** "Word gets around" (06 §4): 3 false accusations within 60 s cut traffic 20% for 30 s. */
export const WORD_FALSE = 3;
export const WORD_WINDOW_S = 60;
export const WORD_S = 30;
export const WORD_TRAFFIC = 0.8;
/** The Bard pays in song (06 §5): tolls +10% for 30 s. */
export const SONG_S = 30;
export const SONG_MULT = 1.1;
/** Squint (06 §6 B): odd parts Grumm points at, per level. */
export const squintHints = (L: number) => Math.max(0, Math.min(2, L));

/** Pushes a false accusation at time `now` (s) and reports whether word now gets around. Pure on
 * the passed array (old stamps fall out of the window). */
export function falseAccusation(stamps: number[], now: number): boolean {
  stamps.push(now);
  while (stamps.length && now - stamps[0] > WORD_WINDOW_S) stamps.shift();
  if (stamps.length >= WORD_FALSE) {
    stamps.length = 0;
    return true;
  }
  return false;
}

/** Spawn weights per kind at this Menace and Toll Booth level. */
export function weights(m: number, booth: number): [Kind, number][] {
  const base: [Kind, number][] = [
    ['peasant', KINDS.peasant.weight],
    ['pilgrim', KINDS.pilgrim.weight],
    ['merchant', KINDS.merchant.weight * (1 + 0.1 * booth)],
    ['adventurer', KINDS.adventurer.weight],
    ['smuggler', KINDS.smuggler.weight],
  ];
  if (booth > 0) base.push(['noble', KINDS.noble.weight * (1 + 0.1 * booth)]);
  if (booth > 1) base.push(['bard', KINDS.bard.weight]);
  const others = base.reduce((a, [, w]) => a + w, 0);
  const share = heroShare(m);
  base.push(['hero', (others * share) / (1 - share)]);
  return base;
}

/** Average real fare of the traffic mix (goons charge every traveler their flat base fare). */
export function avgFare(m: number, booth: number): number {
  const w = weights(m, booth);
  let tw = 0;
  let tf = 0;
  for (const [k, x] of w) {
    tw += x;
    tf += x * KINDS[k].fare;
  }
  return tf / tw;
}

/** Skulls on Posts (Bones import, 00 §4): +5% fare per level. */
export const skullsMult = (skulls: number) => 1 + 0.05 * Math.max(0, Math.min(3, skulls));

/** Tollpence multiplier on every fare, bounty and confiscation. `skulls` = Bones import level. */
export const fareMult = (r: BridgeRun, skulls = 0) => signageMult(r.lv.signage) * payoutMult(r.menace) * skullsMult(skulls) * charterMult(r.lv.charter);

/** Pillory (Captives import, 00 §4, W-15): an unmasked hero pays a 1x fare fine (L1) and the
 * Unmask bounty rises 5% per further level. Returns the fare multiple an Unmask pays. */
export function unmaskPay(bounty: number, pillory: number): number {
  const L = Math.max(0, Math.min(3, pillory));
  return bounty * (1 + 0.05 * Math.max(0, L - 1)) + (L >= 1 ? 1 : 0);
}

/** On-screen idle rate (Tollpence/s before core multipliers), 06 §3 closed form. Pure, cheap. */
export function idleTollpence(r: BridgeRun, skulls = 0): number {
  const eff = goonEff(r.lv.goons);
  if (eff <= 0) return 0;
  return TRAFFIC * avgFare(r.menace, r.lv.booth) * goonFlat(r.lv.pricing) * eff * fareMult(r, skulls);
}

/** Tollpence the goons collect from one traveler (bench overflow, naps, idle gate). */
export function goonToll(r: BridgeRun, t: Traveler, skulls = 0): number {
  return t.kindFare * goonFlat(r.lv.pricing) * goonEff(r.lv.goons) * fareMult(r, skulls);
}

// ---------- advancement hooks (00 §2.5, §5.2) ----------

/** Head Start (00 §2.5): the first 2L Menace levels and 1 + L free goons. Idempotent (max()). */
export function applyHeadStart(r: BridgeRun, L: number): void {
  if (!(L > 0)) return;
  const m = Math.min(MENACE_MAX, 2 * Math.floor(L));
  r.menaceMax = Math.max(r.menaceMax ?? 0, m);
  r.menace = Math.max(r.menace ?? 0, m);
  r.lv.goons = Math.max(r.lv.goons ?? 0, Math.min(NODES.goons.max, 1 + Math.floor(L)));
}

/** Familiar Faces (00 §2.5 Signature): Squint and the first 5 Wallet Sense levels are kept. */
export const FAMILIAR_SENSE = 5;
export function applyFamiliarFaces(r: BridgeRun): void {
  r.lv.squint = Math.max(r.lv.squint ?? 0, NODES.squint.max);
  r.lv.sense = Math.max(r.lv.sense ?? 0, FAMILIAR_SENSE);
}

export const NODE_NAMES: Record<keyof Levels, string> = {
  glare: 'Glare',
  tongue: "Haggler's Tongue",
  skull: 'Thick Skull',
  fists: 'Big Fists',
  sense: 'Wallet Sense',
  nose: 'Hero Nose',
  sniffer: 'Sniffer Dog',
  signage: 'Signage',
  bench: 'Bench',
  booth: 'Toll Booth',
  goons: 'Goon',
  pricing: 'Goon Pricing',
  squint: 'Squint',
  charter: 'Toll Charter',
};

/** Levels the Steward may raise: the ones that move idleRate (no dial levels, 00 §5.2 m5). */
export const STEWARD_NODES: (keyof Levels)[] = ['goons', 'pricing', 'signage', 'booth', 'charter'];

/** Steward list for a run: cost and idle gain of each next level that raises idle. `open(id)`
 * filters locked nodes (the charter before the 2nd Fall). */
export function stewardList(r: BridgeRun, skulls: number, open: (id: keyof Levels) => boolean): { id: keyof Levels; cost: number; deltaIdle: number }[] {
  const base = idleTollpence(r, skulls);
  const out: { id: keyof Levels; cost: number; deltaIdle: number }[] = [];
  for (const id of STEWARD_NODES) {
    const L = r.lv[id] ?? 0;
    if (L >= NODES[id].max || !open(id)) continue;
    const q: BridgeRun = { ...r, lv: { ...r.lv, [id]: L + 1 } };
    const d = idleTollpence(q, skulls) - base;
    if (d > 0) out.push({ id, cost: nodeCost(id, L), deltaIdle: d });
  }
  return out;
}

/** Contraband (00 §4, 06 §16): goon crates, each goon seizes max(1, Sniffer) per 5 h. */
export function crateContrabandPerH(r: BridgeRun): number {
  return (r.lv.goons * Math.max(1, r.lv.sniffer)) / 5;
}

/** Highest Menace M with >= 5 evidence-backed Unmasks at Menace >= M this cycle. */
export function heldMenace(ev: Record<string, number>): number {
  let sum = 0;
  for (let m = MENACE_MAX; m >= 0; m--) {
    sum += ev[String(m)] ?? 0;
    if (sum >= GATE_UNMASKS) return m;
  }
  return -1;
}

/** Evidence-backed Unmasks counted toward a target Menace (for the HUD hint). */
export function evAtLeast(ev: Record<string, number>, m: number): number {
  let sum = 0;
  for (const [k, v] of Object.entries(ev)) if (Number(k) >= m) sum += v;
  return sum;
}

// ---------- generation ----------

export interface GenOpts {
  menace: number;
  booth: number;
  nose: number;
  sniffer: number;
  poster: Poster;
  force?: Force;
}

/** Scripted travelers: the onboarding's (merchant, hero, smuggler), the Showdown, and one per rule
 * card micro-lesson (06 §18). */
export type Force = 'merchant' | 'heroLesson' | 'smugglerLesson' | 'showdown' | 'writLesson' | 'hatLesson' | 'kitLesson' | 'bribeLesson' | 'shiftLesson';
/** The rule-card lesson traveler for each card id. */
export const CARD_FORCE: Record<string, Force> = { writ: 'writLesson', hats: 'hatLesson', kits: 'kitLesson', bribe: 'bribeLesson', shift: 'shiftLesson' };

function baseLook(r: () => number, who: Who, alt: number): Look {
  const n = NORMAL[who];
  const choose = (opts: string[]) => (opts.length > 1 && r() < alt ? opts[1 + Math.floor(r() * (opts.length - 1))] : opts[0]);
  return {
    hat: choose(n.hat),
    body: choose(n.body),
    feet: choose(n.feet),
    hand: choose(n.hand),
    belt: choose(n.belt),
    pack: choose(n.pack),
    aura: choose(n.aura),
    cloak: Math.floor(r() * CLOAKS.length),
    hair: Math.floor(r() * HAIRS.length),
    skin: Math.floor(r() * SKINS.length),
    mark: r() < 0.35 ? 1 + Math.floor(r() * 3) : 0,
  };
}

/** Creates traveler #id deterministically from the run seed. */
export function generate(seed: number, id: number, o: GenOpts): Traveler {
  const r = rng((seed ^ Math.imul(id + 1, 2654435761)) >>> 0);
  let kind: Kind;
  const f = o.force;
  if (f === 'merchant') kind = 'merchant';
  else if (f === 'heroLesson' || f === 'showdown' || f === 'writLesson' || f === 'shiftLesson') kind = 'hero';
  else if (f === 'smugglerLesson' || f === 'hatLesson' || f === 'bribeLesson') kind = 'smuggler';
  else if (f === 'kitLesson') kind = 'pilgrim';
  else {
    const w = weights(o.menace, o.booth);
    let x = r() * w.reduce((a, [, v]) => a + v, 0);
    kind = w[w.length - 1][0];
    for (const [k, v] of w) {
      x -= v;
      if (x <= 0) {
        kind = k;
        break;
      }
    }
  }
  const smuggler = kind === 'smuggler';
  const hero = kind === 'hero';
  let who: Who;
  if (smuggler) who = o.force ? 'peasant' : pick(r, ['peasant', 'pilgrim', 'peasant'] as Who[]);
  else if (hero) who = f === 'heroLesson' || f === 'shiftLesson' ? 'pilgrim' : f === 'writLesson' ? 'merchant' : pick(r, ['pilgrim', 'peasant', 'merchant'] as Who[]);
  else who = kind as Who;

  const look = baseLook(r, who, o.force ? 0 : 0.25);
  let where: Where = r() < 0.8 || o.force ? NORMAL[who].where[0] : pick(r, NORMAL[who].where);
  const tells: string[] = [];
  let concealed = 0;
  const vis = visibleChance(o.nose);
  const dec = o.poster.decree;
  const fake = o.menace >= 9 || f === 'kitLesson' ? o.poster.fake : '';
  const lesson = !!f && f !== 'merchant' && f !== 'showdown';
  const used = new Set<Slot>();

  if (smuggler) {
    const pool = dec.smug.slice();
    if (o.menace >= 6) pool.push(HAT_SMUGGLE);
    // One load from today's Decree (a scripted lesson prefers a bulky pack), maybe one more.
    const load = o.force ? (dec.smug.find(([s]) => s === 'pack') ?? dec.smug[0]) : pick(r, dec.smug);
    const extra = pool.filter(([s, p]) => p !== load[1] && s !== load[0]).filter(() => r() < 0.45);
    const chosen = f === 'hatLesson' ? [HAT_SMUGGLE] : f ? [load] : [load, ...extra].filter(([s], i, a) => a.findIndex(([t]) => t === s) === i);
    for (const [slot, part] of chosen) {
      // Wave 1: smugglers can hide their first tell too (P11), with the heroes' odds.
      used.add(slot);
      if (o.force || r() < vis) {
        look[slot] = part;
        tells.push(slot);
      } else concealed++;
    }
  } else if (hero) {
    const pool = dec.hero.slice().sort(() => r() - 0.5);
    // One or both of today's hero tells (2 of 2 at 60%).
    const n = o.force === 'heroLesson' ? DECREE_HERO : 1 + (r() < 0.6 ? 1 : 0);
    const chosen =
      f === 'heroLesson' ? dec.hero.slice() : f === 'writLesson' ? [dec.hero[0]] : f === 'shiftLesson' ? [dec.hero[DECREE_HERO - 1]] : pool.slice(0, n);
    for (const [slot, part] of chosen) {
      used.add(slot);
      const show = lesson || (o.force === 'showdown' ? tells.length === 0 : r() < vis);
      if (show) {
        look[slot] = part;
        if (part !== fake) tells.push(slot);
      } else concealed++;
    }
    // Infiltrators sometimes head somewhere their Claim never goes.
    if (!o.force && r() < 0.3) {
      const odd = (['fort', 'castle', 'market', 'shrine', 'farm'] as Where[]).filter((w) => !NORMAL[who].where.includes(w));
      where = pick(r, odd);
      tells.push('where');
    }
  } else if (fake && (f === 'kitLesson' || r() < 0.2)) {
    // Disguise kits are in fashion: honest folk wear today's fake tell too.
    const t = HERO_POOL.find(([, p]) => p === fake)!;
    look[t[0]] = t[1];
    used.add(t[0]);
  }

  // Red herrings (wave 1): an off-Decree pool part, yesterday's expired tell most often. Liars wear
  // them too, so an odd part only means something when it is on today's Decree.
  if (!o.force && r() < HERRING_P) {
    const off = [...HERO_POOL, ...SMUG_POOL, ...(o.menace >= 6 ? [] : [HAT_SMUGGLE])].filter(([s, p]) => !decreeKind(dec, p, o.menace) && !used.has(s));
    const exp = off.find(([, p]) => p === dec.expired);
    const hz = exp && r() < HERRING_EXPIRED ? exp : off.length ? pick(r, off) : null;
    if (hz && !NORMAL[who][hz[0]].includes(hz[1])) look[hz[0]] = hz[1];
  }

  // Poster: 30% of heroes are today's Wanted hero; nobody else matches 2+ shown features.
  let posterMatch = false;
  if (hero && (o.force === 'showdown' || (!o.force && r() < 0.3))) {
    look.cloak = o.poster.cloak;
    look.hair = o.poster.hair;
    look.mark = o.poster.mark;
    posterMatch = true;
  } else {
    let guard = 0;
    while (posterMatches(o.poster, look) >= 2 && guard++ < 20) look.cloak = (look.cloak + 1 + Math.floor(r() * 5)) % CLOAKS.length;
  }

  // Writs (Menace 3): heroes forge them with the wrong seal.
  let writ: 0 | 1 | 2 = 0;
  if (o.menace >= 3 && !o.force && r() < 0.35) {
    writ = hero && r() < 0.6 ? 2 : 1;
    if (writ === 2) tells.push('writ');
  }
  if (f === 'writLesson') {
    writ = 2;
    tells.push('writ');
  }

  const ks = KINDS[kind];
  const claimFare = KINDS[who].fare;
  // Wallets drift per Claim each day (Moonlighter demand), so the ledger never fully solves it.
  const walletCoins = ks.fare * (ks.wallet[0] + r() * (ks.wallet[1] - ks.wallet[0])) * (dec.drift[who] ?? 1);
  const slackCoins = ks.fare * ks.patience;
  const t: Traveler = {
    id,
    kind,
    who,
    where,
    look,
    claimFare,
    kindFare: ks.fare,
    wallet: walletCoins / claimFare,
    slack: slackCoins / claimFare,
    brawn: ks.brawn,
    bonkRoll: r(),
    smuggler,
    hero,
    tells,
    concealed,
    writ,
    posterMatch,
    sniff: smuggler && r() < sniffChance(o.sniffer),
    showdown: o.force === 'showdown',
    scripted: o.force ?? '',
    bribe: 0,
    shift: false,
    pips: ks.pips,
  };
  // Later rule cards draw after everything else, so lower Menace levels keep their streams.
  if (smuggler && (f === 'bribeLesson' || (!f && o.menace >= 15 && r() < BRIBE_SHARE))) {
    t.bribe = f ? 2 : Math.round((BRIBE_MIN + r() * 0.5) * 10) / 10;
  }
  if (hero && (f === 'shiftLesson' || (!f && o.menace >= 18 && r() < SHIFT_SHARE))) {
    t.shift = true;
    t.tells.push('shift');
  }
  return t;
}

/** Bribes card: share of smugglers that offer one, and its size (x claimed fare). */
export const BRIBE_SHARE = 0.4;
export const BRIBE_MIN = 2.0;
/** Shapeshifters card: share of heroes that shift. */
export const SHIFT_SHARE = 0.5;

/** Parts that aren't the Claim's usual look (red herrings and today's fake tell included), in slot
 * order: what Squint points at. */
export function oddParts(t: Traveler): Slot[] {
  const n = NORMAL[t.who];
  return SLOTS.filter((s) => t.look[s] !== n[s][0]);
}

/** Evidence tier for an Unmask: visible contradictions, with a Poster match counting as 2+. */
export function evidence(t: Traveler): number {
  return t.posterMatch ? Math.max(2, t.tells.length) : t.tells.length;
}

/** A seizure pays the goods plus a fine, in multiples of the smuggler's real fare. SIM-TUNED
 * 4 -> 5: smugglers can now hide every tell, so fewer are caught (~75% of liars, reference bot). */
export const SEIZE_MULT = 5;

/** SIM-TUNED (wave 1): a one-tell unmask 5x -> 6x. Heroes wear 1-2 of today's 2 Decree tells, so
 * a single showing tell is the common honest read, not a lucky hunch. */
export function bountyMult(ev: number): number {
  return ev >= 2 ? 10 : ev === 1 ? 6 : 2;
}

// ---------- haggling (06 §2 step 4; wave 1 mood haggle) ----------

export interface Haggle {
  round: number; // asks so far
  counter: number; // standing counter-offer (x claimed fare), 0 if none
  offended: boolean;
  /** Patience pips left (undefined = not started: the traveler's full pips). */
  pips?: number;
}

/** Moonlighter's four faces: DELIGHTED (paid, and you undercharged), CONTENT (paid), GRUDGING
 * (too much: counters, 1 pip), FURIOUS (far too much: no counter, 2 pips). */
export type Mood = 'delighted' | 'content' | 'grudging' | 'furious';

export type Reply =
  | { kind: 'pay'; mult: number; mood: 'delighted' | 'content' }
  | { kind: 'counter'; mult: number; pips: number }
  | { kind: 'refuse'; pips: number }
  | { kind: 'leave' }
  | { kind: 'bonk' };

/** Paying at or under this share of the wallet reads as DELIGHTED (you left coin on the table). */
export const DELIGHT_FRAC = 0.8;

export function effWallet(t: Traveler, h: Haggle): number {
  return t.wallet * (h.offended ? 0.8 : 1);
}

export function effSlack(t: Traveler, h: Haggle, r: BridgeRun): number {
  return t.slack * glareMult(r.lv.glare) * patienceMult(r.menace) * (h.offended ? 0.5 : 1);
}

/** Patience pips left (an offended traveler starts one short). */
export function pipsLeft(t: Traveler, h: Haggle): number {
  return h.pips ?? Math.max(1, (t.pips ?? 3) - (h.offended ? 1 : 0));
}

/** Where a counter lands inside the wallet: U(0.8, 1.0), pre-rolled per traveler and ask, so the
 * counter never names the wallet (P12). */
export function counterFrac(t: Traveler, round: number): number {
  return 0.8 + 0.2 * rng((Math.imul(t.id + 1, 9973) + round * 7919 + 17) >>> 0)();
}

/** The traveler's answer to a demand of `mult` x claimed fare. Pure (rolls are pre-rolled). */
export function reply(t: Traveler, h: Haggle, r: BridgeRun, mult: number): Reply {
  const w = effWallet(t, h);
  const s = effSlack(t, h, r);
  const eps = 1e-6;
  const pips = pipsLeft(t, h);
  const walkOrBonk = (): Reply => (t.bonkRoll < t.brawn * brawnMult(r.lv.fists) ? { kind: 'bonk' } : { kind: 'leave' });
  if ((h.counter > 0 && mult <= h.counter + eps) || mult <= w + eps) return { kind: 'pay', mult, mood: mult <= w * DELIGHT_FRAC + eps ? 'delighted' : 'content' };
  if (mult <= w + s + eps) {
    if (pips - 1 <= 0) return walkOrBonk();
    const c0 = w * counterFrac(t, h.round);
    const c = c0 + Math.max(0, mult - c0) * tongueFrac(r.lv.tongue);
    return { kind: 'counter', mult: Math.max(h.counter, Math.max(0.1, Math.floor(c * 10 + eps) / 10)), pips: pips - 1 };
  }
  if (pips - 2 <= 0) return walkOrBonk();
  return { kind: 'refuse', pips: pips - 2 };
}

/** The face a price would likely get, read from the Wallet Sense band (a hint, not the wallet). */
export function previewMood(b: [number, number], mult: number): Mood {
  return mult < b[0] ? 'delighted' : mult <= b[1] ? 'content' : mult <= b[1] * 1.25 ? 'grudging' : 'furious';
}

/** The Wallet Sense band (x claimed fare). Deterministic per traveler; always contains the wallet. */
export function band(t: Traveler, senseLv: number, offended: boolean): [number, number] {
  const u = senseBand(senseLv);
  const r = rng(t.id * 7919 + 13);
  const w = t.wallet * (offended ? 0.8 : 1);
  const off = (r() - 0.5) * u; // the true wallet sits somewhere inside
  return [Math.max(0.1, w * (1 - u + off)), w * (1 + u + off)];
}

/*
 * TUNING (seed reasoning; scratch greedy-bot script, not shipped):
 *  - First traveler is a scripted Merchant (~25 Tollpence); Hire Goon (75) lands at ~30-45 s.
 *  - Active play: ~1.6-2.2x fare per traveler from haggling inside the band, +streak, plus
 *    5-10x bounties on ~7-10% heroes and 4x on confiscated smugglers: ~2.5-3.2x fare per traveler.
 *    Goons charge 1.0-1.4x at full coverage, so active ~2.5-3.5x on-screen idle, ~4-5x offline.
 *  - Menace 4 (the first Infamy target, 40.5K for the level; 60K total) lands ~2 h active.
 *    See econBase in def.ts.
 */
