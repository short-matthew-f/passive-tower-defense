// Tiny WebAudio blips for the Cauldron (05 §13): peg tinks that climb in pitch, the gold ding,
// bucket plops, Granny's cackle, the Batch eruption, curse zaps and spills. One shared
// AudioContext, created on the first sound (after a user gesture). Every node is short-lived and
// stopped, so nothing accumulates. The scene rate-limits the busy ones.
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

export const sfx = {
  /** Peg tink; `step` = consecutive hits on the same drop (pitch rises). */
  tink(vol: number, step: number): void {
    tone(1400 * 2 ** (Math.min(12, step) / 12), 0.04, 0.05 * vol, 'triangle');
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
