// Tiny WebAudio blips for the Bridge: Grumm's gibberish rumble, coin clinks, poof and bonk.
// One shared AudioContext, created on the first sound (after a user gesture). Every node is
// short-lived and disconnected by the browser once it stops, so nothing accumulates.
import { getAudioContext } from '../../core/audio';

/** The suite's one shared AudioContext (perf P-06: core/audio.ts). */
function ctx(): AudioContext | null {
  return getAudioContext();
}

function tone(freq: number, dur: number, vol: number, type: OscillatorType, delay = 0, slide = 0): void {
  const a = ctx();
  if (!a || vol <= 0) return;
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
  /** Grumm's voice: 2-4 deep rumbles with a chewing pop between "words". */
  grumm(vol: number, words = 3): void {
    for (let i = 0; i < words; i++) {
      const f = 70 + Math.random() * 40;
      tone(f, 0.14, 0.25 * vol, 'sawtooth', i * 0.17, -20);
      tone(900, 0.02, 0.08 * vol, 'square', i * 0.17 + 0.15);
    }
  },
  clink(vol: number, step = 0): void {
    const f = 1200 * 2 ** (Math.min(10, step) / 12);
    tone(f, 0.08, 0.12 * vol, 'triangle');
    tone(f * 1.5, 0.06, 0.06 * vol, 'triangle', 0.05);
  },
  poof(vol: number): void {
    tone(500, 0.18, 0.15 * vol, 'square', 0, -400);
    tone(1500, 0.1, 0.08 * vol, 'sawtooth', 0.05, 800);
  },
  bonk(vol: number): void {
    tone(220, 0.12, 0.3 * vol, 'square', 0, -150);
    tone(880, 0.25, 0.1 * vol, 'sine', 0.1, 400);
  },
  tick(vol: number): void {
    tone(2000, 0.015, 0.05 * vol, 'square');
  },
  sad(vol: number): void {
    tone(300, 0.2, 0.12 * vol, 'triangle', 0, -120);
  },
};
