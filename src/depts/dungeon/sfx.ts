// The Dungeon's WebAudio blips (Wave 1: the Dungeon was mute). The Gong's bell, a kill tick that
// climbs a pitch ladder through a party, the loot jingle, a leak's sour note, Glare's
// zap, the Trapdoor's thud and the receipt's stamp (coins, purchases and the Champion fanfare use
// the shared kit in core/audio.ts). Every node is short-lived on the suite's one shared
// AudioContext; kill ticks are rate-limited so a big party melting in the Brazier stays a ripple.
import { getAudioContext } from '../../core/audio';

function tone(freq: number, dur: number, vol: number, type: OscillatorType, delay = 0, slide = 0): void {
  const a = getAudioContext();
  if (!a || vol <= 0) return;
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

let lastTick = 0;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Pentatonic steps (semitones) for the kill ladder. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export const sfx = {
  /** The Gong: a bronze bell. An earlier call (f near 1) rings brighter and longer. */
  gong(vol: number, f: number): void {
    const base = 150 + 70 * f;
    tone(base, 1.1 + 0.6 * f, 0.22 * vol, 'sine');
    tone(base * 2.76, 0.6, 0.07 * vol, 'sine');
    tone(base * 5.4, 0.25, 0.04 * vol, 'triangle');
    tone(60, 0.12, 0.18 * vol, 'square', 0, -20);
  },
  /** One kill; `step` is the kill's place in its party (the pitch climbs). */
  kill(vol: number, step: number, big = false): void {
    const t = now();
    if (t - lastTick < 55 && !big) return;
    lastTick = t;
    const f = 520 * 2 ** (PENTA[Math.min(PENTA.length - 1, step)] / 12);
    tone(f, 0.07, 0.07 * vol, 'square');
    if (big) {
      tone(f / 2, 0.4, 0.16 * vol, 'sawtooth', 0, -60);
      tone(f * 1.5, 0.3, 0.08 * vol, 'triangle', 0.08);
    }
  },
  /** A hero grabbed a chest purse. */
  loot(vol: number): void {
    tone(1320, 0.05, 0.06 * vol, 'triangle');
    tone(1760, 0.07, 0.06 * vol, 'triangle', 0.05);
  },
  leak(vol: number): void {
    tone(330, 0.22, 0.12 * vol, 'triangle', 0, -140);
    tone(247, 0.3, 0.08 * vol, 'triangle', 0.12, -90);
  },
  /** A sack recovered from a thief. */
  recover(vol: number): void {
    tone(880, 0.08, 0.09 * vol, 'triangle');
    tone(1320, 0.12, 0.09 * vol, 'triangle', 0.07);
  },
  glare(vol: number): void {
    tone(1200, 0.16, 0.08 * vol, 'sawtooth', 0, -900);
    tone(300, 0.12, 0.08 * vol, 'square', 0.02, -150);
  },
  trap(vol: number): void {
    tone(110, 0.16, 0.2 * vol, 'square', 0, -60);
    tone(70, 0.22, 0.12 * vol, 'sine', 0.05, -30);
  },
  /** Ledger-Bones stamps a receipt: a dry tick, or a bright chord on a perfect party. */
  stamp(vol: number, perfect: boolean, streak = 0): void {
    tone(180, 0.05, 0.1 * vol, 'square');
    if (perfect) {
      const up = 2 ** (Math.min(7, streak) / 12);
      tone(660 * up, 0.12, 0.06 * vol, 'triangle', 0.05);
      tone(990 * up, 0.16, 0.05 * vol, 'triangle', 0.1);
    }
  },
  champion(vol: number): void {
    tone(196, 0.35, 0.12 * vol, 'sawtooth');
    tone(262, 0.45, 0.1 * vol, 'sawtooth', 0.3);
  },
};
