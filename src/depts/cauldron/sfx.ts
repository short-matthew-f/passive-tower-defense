// Tiny WebAudio blips for the Cauldron (05 §13): the music-box rain and your ingredient's pitch
// ladder (Wave 1), Bubble Reach / Fever stings, the gold ding,
// bucket plops, Granny's cackle, the Batch eruption, curse zaps and spills. One shared
// AudioContext, created on the first sound (after a user gesture). Every node is short-lived and
// stopped, so nothing accumulates. The scene rate-limits the busy ones.
import { getAudioContext } from '../../core/audio';

/** The suite's one shared AudioContext (perf P-06: core/audio.ts). */
function ctx(): AudioContext | null {
  return getAudioContext();
}

function tone(freq: number, dur: number, vol: number, type: OscillatorType, delay = 0, slide = 0): void {
  if (vol <= 0.001) return;
  const a = ctx();
  if (!a) return;
  try {
    const t0 = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch {
    /* audio is optional */
  }
}

/** C-major pentatonic (genre-research plinko #1, the music-box rain): any notes sound fine
 * together, so a busy board plays a generative melody instead of noise. */
const PENTA = [0, 2, 4, 7, 9];
export function pentaHz(i: number): number {
  const k = Math.max(0, Math.floor(i));
  return 261.63 * 2 ** ((12 * Math.floor(k / 5) + PENTA[k % 5]) / 12);
}

/** A music-box pluck: a quick sine with a soft octave shimmer. */
function pluck(freq: number, dur: number, vol: number, bright: boolean, delay = 0): void {
  tone(freq, dur, vol, bright ? 'triangle' : 'sine', delay);
  tone(freq * 2, dur * 0.6, vol * (bright ? 0.45 : 0.25), 'sine', delay);
}

export const sfx = {
  /** Toadling rain: one soft music-box note, pitch by peg row (`idx` on the pentatonic ladder). */
  rain(vol: number, idx: number, bright = false): void {
    pluck(pentaHz(idx), bright ? 0.16 : 0.12, (bright ? 0.04 : 0.022) * vol, bright);
  },
  /** Your own ingredient: brighter, louder, one pentatonic step higher per peg (Peggle's ladder). */
  ladder(vol: number, step: number): void {
    const f = pentaHz(7 + Math.min(12, step));
    pluck(f, 0.14, 0.06 * vol, true);
  },
  /** Bucket chime by tier (0 Dregs .. 4 Jackpot); `player` rings a fifth on top. */
  chime(vol: number, tier: number, player: boolean): void {
    const i = 3 + tier * 2;
    pluck(pentaHz(i), 0.22, (player ? 0.06 : 0.02) * vol, player);
    if (player) pluck(pentaHz(i + 3), 0.26, 0.04 * vol, true, 0.06);
  },
  /** A bubble stops on its symbol. */
  bubble(vol: number, n: number): void {
    tone(pentaHz(8 + n * 2), 0.06, 0.06 * vol, 'square');
    tone(pentaHz(13 + n * 2), 0.05, 0.03 * vol, 'sine', 0.03);
  },
  /** Bubbles rolling: a tiny tick. */
  roll(vol: number): void {
    tone(1900 + Math.random() * 400, 0.015, 0.025 * vol, 'square');
  },
  /** REACH: the pot rumbles and a tone climbs. */
  reach(vol: number): void {
    tone(70, 0.9, 0.12 * vol, 'sawtooth', 0, 40);
    tone(330, 1.1, 0.05 * vol, 'triangle', 0.1, 500);
  },
  /** Two alike, the third missed: a sad slide. */
  miss(vol: number): void {
    tone(440, 0.35, 0.06 * vol, 'triangle', 0, -220);
  },
  /** Bubble Fever: Granny's Hymn, a fast pentatonic run over a bass thump. */
  fever(vol: number): void {
    tone(98, 0.5, 0.14 * vol, 'sine', 0, 60);
    for (let i = 0; i < 10; i++) pluck(pentaHz(5 + i), 0.16, 0.06 * vol, true, i * 0.05);
    [10, 12, 15].forEach((n) => pluck(pentaHz(n), 0.5, 0.05 * vol, true, 0.55));
  },
  feverEnd(vol: number): void {
    [12, 10, 7].forEach((n, i) => pluck(pentaHz(n), 0.18, 0.045 * vol, false, i * 0.09));
  },
  /** Fever Cam drumroll. */
  drumroll(vol: number): void {
    for (let i = 0; i < 6; i++) tone(140 + i * 6, 0.05, 0.08 * vol * (0.6 + i * 0.08), 'square', i * 0.05, -60);
  },

  ding(vol: number): void {
    tone(1800, 0.12, 0.08 * vol, 'sine');
    tone(2700, 0.1, 0.05 * vol, 'sine', 0.04);
  },
  /** Bucket plop; `tier` 0..4 (Dregs .. Jackpot). */
  plop(vol: number, tier: number): void {
    tone(180 + tier * 60, 0.09, 0.07 * vol, 'sine', 0, 160);
  },
  curse(vol: number): void {
    tone(600, 0.12, 0.08 * vol, 'square', 0, 500);
    tone(1500, 0.05, 0.04 * vol, 'triangle', 0.08);
  },
  toss(vol: number): void {
    tone(900, 0.08, 0.06 * vol, 'triangle', 0, -500);
  },
  tick(vol: number): void {
    tone(1600, 0.05, 0.07 * vol, 'square');
    tone(2400, 0.06, 0.05 * vol, 'square', 0.05);
  },
  cackle(vol: number): void {
    for (let i = 0; i < 4; i++) tone(520 - i * 30 + (i % 2) * 120, 0.07, 0.07 * vol, 'sawtooth', i * 0.08, 60);
  },
  batch(vol: number): void {
    [392, 523, 659, 784].forEach((f, i) => tone(f, 0.14, 0.08 * vol, 'square', i * 0.07));
    tone(120, 0.4, 0.1 * vol, 'sine', 0, 200);
  },
  spill(vol: number): void {
    tone(260, 0.16, 0.08 * vol, 'sawtooth', 0, -180);
  },
  boom(vol: number): void {
    tone(90, 0.3, 0.16 * vol, 'sawtooth', 0, -50);
    tone(1200, 0.08, 0.05 * vol, 'square', 0.02, -900);
  },
  split(vol: number): void {
    tone(700, 0.05, 0.05 * vol, 'square', 0, 400);
  },
  rune(vol: number): void {
    tone(500, 0.18, 0.06 * vol, 'sine', 0, 900);
  },
  bonk(vol: number): void {
    tone(220, 0.12, 0.14 * vol, 'square', 0, -150);
    tone(880, 0.2, 0.06 * vol, 'sine', 0.08, 400);
  },
  nope(vol: number): void {
    tone(200, 0.08, 0.05 * vol, 'square');
  },
};
