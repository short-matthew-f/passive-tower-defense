// Tiny WebAudio blips for the War Pit: buys, merges, hits, poofs, the crowd and Snarl's whistle
// and gravel barks. One shared AudioContext, created on the first sound (after a user gesture).
// Every node is short-lived and stops itself, so nothing accumulates.
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


function noise(dur: number, vol: number, delay = 0, hp = 800): void {
  if (vol <= 0) return;
  const a = ctx();
  if (!a) return;
  try {
    const t0 = a.currentTime + delay;
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  } catch {
    /* audio is optional */
  }
}

export const sfx = {
  tap(v: number): void {
    tone(900, 0.03, 0.05 * v, 'square');
  },
  buy(v: number): void {
    tone(520, 0.06, 0.1 * v, 'square');
    tone(780, 0.08, 0.1 * v, 'square', 0.05);
  },
  merge(v: number): void {
    noise(0.12, 0.08 * v, 0, 1500);
    tone(440, 0.08, 0.12 * v, 'triangle', 0.02);
    tone(660, 0.1, 0.12 * v, 'triangle', 0.09);
  },
  levelUp(v: number): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, 0.12 * v, 'square', i * 0.07));
    sfx.whistle(v, 0.3);
  },
  sell(v: number): void {
    tone(1300, 0.05, 0.07 * v, 'triangle');
    tone(1700, 0.07, 0.07 * v, 'triangle', 0.05);
  },
  roll(v: number): void {
    for (let i = 0; i < 4; i++) tone(300 + i * 90, 0.03, 0.05 * v, 'square', i * 0.03);
  },
  freeze(v: number): void {
    tone(1568, 0.08, 0.06 * v, 'sine');
    tone(2349, 0.12, 0.05 * v, 'sine', 0.04);
  },
  deny(v: number): void {
    tone(180, 0.1, 0.08 * v, 'square', 0, -40);
  },
  hit(v: number, big = false): void {
    noise(0.07, (big ? 0.18 : 0.11) * v, 0, 400);
    tone(big ? 90 : 130, 0.1, 0.18 * v, 'square', 0, -50);
  },
  trig(v: number): void {
    tone(1200, 0.04, 0.05 * v, 'triangle', 0, 400);
  },
  faint(v: number): void {
    noise(0.18, 0.1 * v, 0, 2000);
    tone(400, 0.15, 0.08 * v, 'sine', 0, -300);
  },
  win(v: number): void {
    // Hyena cackle.
    for (let i = 0; i < 5; i++) tone(700 + (i % 2) * 250, 0.05, 0.08 * v, 'sawtooth', i * 0.07);
  },
  lose(v: number): void {
    tone(300, 0.2, 0.1 * v, 'triangle', 0, -120);
    tone(200, 0.3, 0.1 * v, 'triangle', 0.18, -80);
  },
  triumph(v: number): void {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, 0.15 * v, 'square', i * 0.1));
    noise(0.8, 0.05 * v, 0.2, 600);
  },
  coin(v: number, i: number): void {
    tone(1400 + i * 90, 0.05, 0.05 * v, 'triangle', i * 0.04);
  },
  whistle(v: number, delay = 0): void {
    tone(2200, 0.08, 0.07 * v, 'sine', delay);
    tone(2600, 0.18, 0.07 * v, 'sine', delay + 0.09, 200);
  },
  /** Snarl's hyena cackle (wins, Triumphs). */
  cackle(v: number): void {
    for (let i = 0; i < 5; i++) tone(520 + i * 40 + Math.random() * 60, 0.05, 0.06 * v, 'square', i * 0.07, 180);
  },
  /** Snarl: gravel barks. */
  snarl(v: number, words = 3): void {
    for (let i = 0; i < words; i++) tone(140 + Math.random() * 60, 0.07, 0.08 * v, 'sawtooth', i * 0.11, -40);
  },
};
