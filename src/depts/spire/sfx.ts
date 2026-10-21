// Tiny WebAudio blips for the Spire: merge bloops that climb a semitone per tier and per cascade
// step, the vent's cough, the Singularity's chord and a soft drop tick. One shared AudioContext,
// created on the first sound (after a user gesture); every node is short-lived.
let ac: AudioContext | null = null;
let failed = false;

function ctx(): AudioContext | null {
  if (failed) return null;
  try {
    if (!ac) {
      const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) {
        failed = true;
        return null;
      }
      ac = new AC() as AudioContext;
    }
    if (ac.state === 'suspended') void ac.resume();
    return ac;
  } catch {
    failed = true;
    return null;
  }
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
  /** The Head Sorcerer's voice: a nervous, stammering hum (2-4 wavering syllables). */
  mutter(vol: number, words = 3): void {
    for (let i = 0; i < words; i++) {
      const f = 300 + Math.random() * 90;
      tone(f, 0.07, 0.07 * vol, 'triangle', i * 0.12, i % 2 ? -40 : 40);
      if (i === 0) tone(f, 0.04, 0.05 * vol, 'triangle', 0.05);
    }
  },
  /** Merge "bloop": one semitone up per tier and per cascade step (04 §13). */
  bloop(vol: number, tier: number, step: number): void {
    const f = 220 * 2 ** ((tier + Math.min(12, step)) / 12);
    tone(f, 0.12, 0.16 * vol, 'sine', 0, f * 0.6);
    tone(f * 2, 0.06, 0.05 * vol, 'triangle', 0.02);
  },
  drop(vol: number): void {
    tone(900, 0.03, 0.04 * vol, 'triangle', 0, -300);
  },
  /** The sorcerer's cough and the vent's hiss. */
  vent(vol: number): void {
    tone(160, 0.12, 0.18 * vol, 'sawtooth', 0, -60);
    tone(140, 0.1, 0.14 * vol, 'sawtooth', 0.16, -50);
    tone(3000, 0.35, 0.04 * vol, 'square', 0.02, -2200);
  },
  heartbeat(vol: number): void {
    tone(70, 0.08, 0.2 * vol, 'sine');
    tone(60, 0.08, 0.15 * vol, 'sine', 0.14);
  },
  /** Singularity: a chord sting. */
  chord(vol: number): void {
    for (const [f, d] of [[262, 0], [330, 0.03], [392, 0.06], [523, 0.09]] as const) tone(f, 0.7, 0.09 * vol, 'triangle', d);
    tone(60, 0.5, 0.2 * vol, 'sine', 0, -20);
  },
  page(vol: number): void {
    tone(1320, 0.1, 0.08 * vol, 'triangle');
    tone(1760, 0.14, 0.07 * vol, 'triangle', 0.08);
  },
  deny(vol: number): void {
    tone(200, 0.08, 0.08 * vol, 'square', 0, -60);
  },
};
