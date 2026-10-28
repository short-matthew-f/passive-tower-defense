// Tiny WebAudio sounds for the Mines: the tock of a tap (pitch by rock), the crit crunch, breaks,
// keg blasts, lightning, gems, Fury, the Gold Goblin and the Doom Drum's boom (the metronome, scheduled ahead on the
// audio clock so it lands on the beat). One shared AudioContext, created on the first sound
// (after a user gesture). Every node is short-lived and stops itself, so nothing accumulates.
import { getAudioContext } from '../../core/audio';
import type { RockKind } from './model';
let noiseBuf: AudioBuffer | null = null;

/** The suite's one shared AudioContext (perf P-06: core/audio.ts). */
let started = false;
export function audio(): AudioContext | null {
  started = true;
  return getAudioContext();
}

/** The audio clock if a context is running, else null (no sound yet: no user gesture). */
export function audioNow(): number | null {
  const a = started ? getAudioContext() : null;
  return a && a.state === 'running' ? a.currentTime : null;
}

function tone(freq: number, dur: number, vol: number, type: OscillatorType, at = 0, slide = 0): void {
  if (vol <= 0) return;
  const a = audio();
  if (!a) return;
  try {
    const t0 = Math.max(a.currentTime, at || a.currentTime);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch {
    /* audio is optional */
  }
}

function noise(dur: number, vol: number, at = 0, freq = 800, type: BiquadFilterType = 'highpass'): void {
  if (vol <= 0) return;
  const a = audio();
  if (!a) return;
  try {
    const t0 = Math.max(a.currentTime, at || a.currentTime);
    if (!noiseBuf) {
      const len = Math.floor(a.sampleRate * 0.5);
      noiseBuf = a.createBuffer(1, len, a.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t0, Math.random() * 0.3);
    src.stop(t0 + dur + 0.02);
  } catch {
    /* audio is optional */
  }
}

const vary = () => 1 + (Math.random() - 0.5) * 0.16; // +-8% pitch (02 §12)

export const sfx = {
  /** Gritch's voice: quick squeaky goblin chatter, 2-4 rising yips. */
  gritch(v: number, words = 3): void {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    for (let i = 0; i < words; i++) tone(420 * vary() + i * 30, 0.06, 0.09 * v, 'square', t + i * 0.1, 160);
  },
  /** A tap, voiced by what it hits (Wave 1, SteamWorld Dig: the payout must not sound like the
   * work). Dirt thuds, crumbly rock crunches gravel, ore "chings", crystal tinks, iron clangs,
   * hot rock sizzles, hollow rock knocks. */
  tock(v: number, kind: RockKind | null = 'common'): void {
    switch (kind) {
      case 'soft':
        noise(0.05, 0.08 * v, 0, 1400, 'lowpass');
        tone(240 * vary(), 0.03, 0.06 * v, 'triangle');
        return;
      case 'vein':
      case 'mother':
        tone(190 * vary(), 0.04, 0.09 * v, 'triangle');
        tone(1760 * vary(), 0.12, 0.05 * v, 'sine');
        tone(2640 * vary(), 0.08, 0.03 * v, 'sine');
        return;
      case 'geode':
      case 'mirror':
        tone(2350 * vary(), 0.07, 0.05 * v, 'sine');
        tone(3520 * vary(), 0.05, 0.03 * v, 'sine');
        noise(0.02, 0.03 * v, 0, 5000);
        return;
      case 'magnet':
        tone(330 * vary(), 0.05, 0.06 * v, 'square');
        tone(990 * vary(), 0.09, 0.04 * v, 'sine');
        return;
      case 'hot':
        noise(0.09, 0.05 * v, 0, 3500);
        tone(150 * vary(), 0.05, 0.08 * v, 'triangle');
        return;
      case 'hollow':
        tone(420 * vary(), 0.06, 0.1 * v, 'sine', 0, -160);
        return;
      case 'gas':
        noise(0.06, 0.06 * v, 0, 900, 'bandpass');
        tone(170 * vary(), 0.04, 0.07 * v, 'triangle');
        return;
      default:
        // Dirt and stone: a dull, low thud.
        tone(150 * vary(), 0.05, 0.12 * v, 'triangle', 0, -30);
        noise(0.03, 0.05 * v, 0, 700, 'lowpass');
    }
  },
  crunch(v: number): void {
    tone(90, 0.12, 0.18 * v, 'square', 0, -40);
    noise(0.1, 0.12 * v, 0, 400, 'lowpass');
  },
  /** A Beat Hit; a Perfect one adds a bright click on top. */
  beatHit(v: number, streak: number, perfect = true): void {
    tone(220 * 2 ** (Math.min(12, streak) / 12), 0.07, 0.08 * v, 'square');
    if (perfect) tone(1320 * 2 ** (Math.min(12, streak) / 12), 0.05, 0.04 * v, 'sine');
  },
  /** A rock you broke, by kind; the Break Chain raises the pitch a semitone per step. */
  break(v: number, kind: RockKind = 'common', chain = 0): void {
    const k = 2 ** (Math.min(12, chain) / 12);
    switch (kind) {
      case 'vein':
      case 'mother': {
        // The ore "ching": a little bell arpeggio over the crunch.
        const t = audioNow() ?? 0;
        noise(0.08, 0.06 * v, 0, 700, 'lowpass');
        tone(1568 * k, 0.16, 0.06 * v, 'sine', t);
        tone(2093 * k, 0.18, 0.05 * v, 'sine', t + 0.05);
        if (kind === 'mother') tone(2637 * k, 0.3, 0.06 * v, 'sine', t + 0.1);
        return;
      }
      case 'soft':
        noise(0.16, 0.08 * v, 0, 1100 * k, 'lowpass');
        tone(200 * k * vary(), 0.05, 0.04 * v, 'triangle', 0, -60);
        return;
      case 'geode':
      case 'mirror':
        noise(0.12, 0.06 * v, 0, 4000);
        tone(2794 * k, 0.12, 0.04 * v, 'sine');
        return;
      case 'hollow':
        tone(300 * k, 0.12, 0.09 * v, 'sine', 0, -120);
        noise(0.06, 0.05 * v, 0, 500, 'lowpass');
        return;
      default:
        noise(0.12, 0.09 * v, 0, 600, 'lowpass');
        tone(120 * k * vary(), 0.08, 0.06 * v, 'triangle', 0, -50);
    }
  },
  /** The crew's breaks: a quiet "tik", so an idle wall is never silent (audit X3). */
  tik(v: number, shiny = false): void {
    tone((shiny ? 1500 : 600) * vary(), 0.025, (shiny ? 0.025 : 0.02) * v, 'triangle');
  },
  /** Fury unleashed: a rising goblin war-shriek. */
  fury(v: number): void {
    tone(260, 0.32, 0.06 * v, 'sawtooth', 0, 700);
    tone(390, 0.28, 0.04 * v, 'square', 0, 900);
    noise(0.2, 0.06 * v, 0, 1500, 'bandpass');
  },
  /** The Gold Goblin pops in: a sparkly three-note jingle. */
  goldIn(v: number): void {
    const t = audioNow() ?? 0;
    [2093, 2637, 3136].forEach((f, i) => tone(f, 0.08, 0.04 * v, 'sine', t + i * 0.06));
  },
  /** Caught him: a rising fanfare, bigger for the rarer sacks. */
  goldCatch(v: number, big: boolean): void {
    const t = audioNow() ?? 0;
    const notes = big ? [523, 659, 784, 1047, 1319] : [659, 784, 1047];
    notes.forEach((f, i) => tone(f, 0.12, 0.07 * v, 'square', t + i * 0.07));
    tone(notes[notes.length - 1] * 2, 0.3, 0.04 * v, 'sine', t + notes.length * 0.07);
  },
  /** He got away: a falling "nyah-nyah". */
  goldEscape(v: number): void {
    const t = audioNow() ?? 0;
    [880, 740, 880, 620].forEach((f, i) => tone(f, 0.07, 0.04 * v, 'square', t + i * 0.09));
  },
  blast(v: number): void {
    noise(0.35, 0.22 * v, 0, 300, 'lowpass');
    tone(70, 0.3, 0.2 * v, 'sine', 0, -40);
  },
  zap(v: number): void {
    tone(1400, 0.08, 0.04 * v, 'sawtooth', 0, -900);
  },
  gem(v: number): void {
    tone(1320, 0.07, 0.06 * v, 'sine');
    tone(1980, 0.1, 0.05 * v, 'sine', (audioNow() ?? 0) + 0.06);
  },
  clink(v: number): void {
    tone(2400, 0.04, 0.05 * v, 'square');
  },
  /** The drum's boom at audio time `at` (0 = now). Thunder Beats boom bigger. */
  boom(v: number, at = 0, big = false): void {
    tone(big ? 55 : 65, big ? 0.35 : 0.22, (big ? 0.32 : 0.24) * v, 'sine', at, -25);
    noise(0.05, 0.06 * v, at, 200, 'lowpass');
  },
  /** The off-beat "ta" between booms (a quiet tick). */
  ta(v: number, at = 0): void {
    noise(0.025, 0.03 * v, at, 3000);
  },
};
