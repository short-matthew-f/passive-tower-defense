// Tiny WebAudio sounds for the Mines: the tock of a tap (pitch by rock), the crit crunch, breaks,
// keg blasts, lightning, gems and the Doom Drum's boom (the metronome, scheduled ahead on the
// audio clock so it lands on the beat). One shared AudioContext, created on the first sound
// (after a user gesture). Every node is short-lived and stops itself, so nothing accumulates.
let ac: AudioContext | null = null;
let failed = false;
let noiseBuf: AudioBuffer | null = null;

export function audio(): AudioContext | null {
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

/** The audio clock if a context is running, else null (no sound yet: no user gesture). */
export function audioNow(): number | null {
  return ac && ac.state === 'running' ? ac.currentTime : null;
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
  /** A tap: layered "tock"; veins ring glassy. */
  tock(v: number, shiny = false): void {
    tone(180 * vary(), 0.05, 0.12 * v, 'triangle');
    noise(0.03, 0.05 * v, 0, 2000);
    if (shiny) tone(1800 * vary(), 0.08, 0.04 * v, 'sine');
  },
  crunch(v: number): void {
    tone(90, 0.12, 0.18 * v, 'square', 0, -40);
    noise(0.1, 0.12 * v, 0, 400, 'lowpass');
  },
  beatHit(v: number, streak: number): void {
    tone(220 * 2 ** (Math.min(12, streak) / 12), 0.07, 0.08 * v, 'square');
  },
  break(v: number): void {
    noise(0.12, 0.09 * v, 0, 600, 'lowpass');
    tone(120 * vary(), 0.08, 0.06 * v, 'triangle', 0, -50);
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
