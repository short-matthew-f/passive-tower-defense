// Tiny WebAudio blips for the Styx: plop, thunk, reel clicks, splash, fanfare, plip, chimes and
// Pilk's buzzy sing-song chirps. One shared AudioContext, created on the first sound (after a user
// gesture). Every node is short-lived and stops itself, so nothing accumulates.
import { getAudioContext } from '../../core/audio';

/** The suite's one shared AudioContext (perf P-06: core/audio.ts). */
function ctx(): AudioContext | null {
  return getAudioContext();
}

function tone(freq: number, dur: number, vol: number, type: OscillatorType, delay = 0, slide = 0): void {
  if (vol <= 0) return;
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
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch {
    /* audio is optional */
  }
}

export const sfx = {
  plop(v: number): void {
    tone(700, 0.12, 0.18 * v, 'sine', 0, -450);
  },
  thunk(v: number): void {
    tone(110, 0.16, 0.35 * v, 'square', 0, -50);
    tone(60, 0.2, 0.25 * v, 'sine');
  },
  dip(v: number): void {
    tone(420, 0.05, 0.06 * v, 'sine', 0, -120);
  },
  click(v: number): void {
    tone(1800, 0.012, 0.04 * v, 'square');
  },
  creak(v: number): void {
    tone(160, 0.12, 0.08 * v, 'sawtooth', 0, 60);
  },
  splash(v: number): void {
    tone(900, 0.14, 0.1 * v, 'triangle', 0, -600);
    tone(300, 0.1, 0.08 * v, 'square', 0.03, -150);
  },
  land(v: number, combo: number): void {
    const k = 2 ** (Math.min(12, combo) / 12);
    tone(523 * k, 0.09, 0.14 * v, 'triangle');
    tone(659 * k, 0.09, 0.14 * v, 'triangle', 0.08);
    tone(784 * k, 0.16, 0.14 * v, 'triangle', 0.16);
  },
  fanfare(v: number): void {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.14, 0.16 * v, 'square', i * 0.1));
  },
  coin(v: number, i: number): void {
    tone(1400 + i * 90, 0.05, 0.05 * v, 'triangle', i * 0.04);
  },
  plip(v: number): void {
    tone(500, 0.08, 0.12 * v, 'sine', 0, 500);
    tone(300, 0.25, 0.1 * v, 'triangle', 0.1, -150);
  },
  snap(v: number): void {
    tone(2400, 0.05, 0.12 * v, 'square', 0, -2000);
    tone(200, 0.2, 0.1 * v, 'sawtooth', 0.04, -100);
  },
  chime(v: number): void {
    tone(1568, 0.1, 0.08 * v, 'sine');
    tone(2093, 0.14, 0.06 * v, 'sine', 0.05);
  },
  warn(v: number): void {
    tone(240, 0.08, 0.08 * v, 'square', 0, 40);
  },
  /** Legendary reel: a low two-beat heart. */
  heartbeat(v: number): void {
    tone(55, 0.12, 0.3 * v, 'sine', 0, -10);
    tone(50, 0.14, 0.22 * v, 'sine', 0.18, -10);
  },
  /** A Ripper streaking past the line. */
  whoosh(v: number): void {
    tone(900, 0.25, 0.06 * v, 'sawtooth', 0, -700);
  },
  /** A trophy mounted on the Wall. */
  mount(v: number): void {
    [784, 988, 1175].forEach((f, i) => tone(f, 0.12, 0.1 * v, 'triangle', i * 0.07));
  },
  /** CLEAN reel. */
  clean(v: number): void {
    tone(1319, 0.08, 0.08 * v, 'sine');
    tone(1760, 0.12, 0.08 * v, 'sine', 0.06);
  },
  /** Pilk: lilting buzzy chirps with a sing-song rise and a lazy droop at the end. */
  pilk(v: number, words = 3): void {
    for (let i = 0; i < words; i++) {
      const f = 380 + Math.random() * 120 + i * 40;
      tone(f, 0.09, 0.07 * v, 'sawtooth', i * 0.12, 160);
    }
    tone(300, 0.22, 0.05 * v, 'sawtooth', words * 0.12, -120);
  },
};
