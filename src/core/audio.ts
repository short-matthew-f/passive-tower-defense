// The one shared AudioContext for every department's sfx (perf P-06), the iOS unlock, and the
// suite's shared sfx kit (fun plan A1).
//
// What iOS allows (honest notes; feature-detected, never assumed):
//  - WebAudio starts suspended and only resumes inside a user gesture. unlockAudio() runs on the
//    first touchend / pointerup / click / keydown (capture phase), resumes the context and plays a
//    one-sample silent buffer, which is the reliable unlock on every iOS version we know of. The
//    context is suspended while the page is hidden and resumed on the next gesture.
//  - The ring/silent switch mutes WebAudio by default (Safari puts web audio in the "ambient"
//    category). Two ways round it, both only from a gesture:
//      1. navigator.audioSession.type = 'playback' (the W3C Audio Session API, shipped in recent
//         Safari; feature-detected). Sound then plays with the switch on silent.
//      2. Fallback where audioSession is missing: start a looping silent <audio> element on that
//         gesture. HTML media playback moves the page into the playback category, and WebAudio
//         rides along. Paused while hidden.
//    Side effects, both ways: like any app that plays sound on silent, starting the game pauses
//    music or podcasts from other apps, and the fallback may show a media control on the lock
//    screen. That is why Settings has "Play sound when iPhone is on silent" (default on); off sets
//    the session to 'ambient' (mixes with other audio, respects the switch) and stops the element.
//  - None of this can make sound while the app is closed or in the background.
let ac: AudioContext | null = null;
let failed = false;
let hooked = false;
let noise: AudioBuffer | null = null;
let bus: GainNode | null = null;

/** Volume source (the suite SFX setting, 0-1) and the "sound on silent" setting; the Game
 * installs both at start. */
let volSrc: () => number = () => 0.6;
let silentSrc: () => boolean = () => true;

export function setAudioSettings(volume: () => number, soundOnSilent: () => boolean): void {
  volSrc = volume;
  silentSrc = soundOnSilent;
}

function vol(): number {
  try {
    const v = volSrc();
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.6;
  } catch {
    return 0.6;
  }
}

function hook(): void {
  if (hooked || typeof document === 'undefined') return;
  hooked = true;
  document.addEventListener('visibilitychange', () => {
    try {
      if (document.visibilityState === 'hidden') {
        if (ac) void ac.suspend();
        silentEl?.pause();
      }
    } catch {
      /* ignore */
    }
  });
}

/** The shared context, or null when WebAudio is unavailable. Resumes a suspended context. */
export function getAudioContext(): AudioContext | null {
  if (failed || typeof window === 'undefined') return null;
  try {
    if (!ac) {
      const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) {
        failed = true;
        return null;
      }
      ac = new AC() as AudioContext;
      hook();
    }
    if (ac.state === 'suspended' && document.visibilityState === 'visible') void ac.resume().catch(() => {});
    return ac;
  } catch {
    failed = true;
    return null;
  }
}

/** A shared 1 s white-noise buffer on the shared context (for hiss / crunch sounds). */
export function getNoiseBuffer(): AudioBuffer | null {
  const a = getAudioContext();
  if (!a) return null;
  if (!noise || noise.sampleRate !== a.sampleRate) {
    const len = a.sampleRate;
    noise = a.createBuffer(1, len, a.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  }
  return noise;
}

// ---------- iOS unlock and the silent switch ----------

let silentEl: HTMLAudioElement | null = null;
let unlockHooked = false;
let unlockedOnce = false;

/** A tiny silent 8-bit mono WAV (0.25 s at 8 kHz) as a data URI. */
function silentWav(): string {
  const n = 2000;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => (buf[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  str(36, 'data');
  dv.setUint32(40, n, true);
  buf.fill(128, 44);
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/** Which silent-switch route this browser offers (for Settings hints and the report). */
export function silentSwitchSupport(): 'audioSession' | 'mediaElement' | 'none' {
  if (typeof navigator === 'undefined') return 'none';
  if ((navigator as any).audioSession && 'type' in (navigator as any).audioSession) return 'audioSession';
  return typeof Audio === 'function' ? 'mediaElement' : 'none';
}

/** Applies the "sound on silent" choice. Must run inside a user gesture to take effect on iOS. */
function applySilentSwitch(): void {
  const want = silentSrc() && vol() > 0;
  const session = (navigator as any).audioSession;
  try {
    if (session && 'type' in session) {
      session.type = want ? 'playback' : 'ambient';
      return;
    }
  } catch {
    /* fall through to the element */
  }
  if (!want) {
    silentEl?.pause();
    return;
  }
  // Only iOS-like browsers need the element trick (no audioSession, touch, no vibrate).
  const iosLike = typeof (navigator as any).vibrate !== 'function' && 'ontouchend' in window;
  if (!iosLike) return;
  try {
    if (!silentEl) {
      silentEl = new Audio(silentWav());
      silentEl.loop = true;
      silentEl.setAttribute('playsinline', '');
      silentEl.setAttribute('x-webkit-airplay', 'deny');
      silentEl.preload = 'auto';
      silentEl.volume = 0.01;
    }
    if (silentEl.paused) void silentEl.play().catch(() => {});
  } catch {
    /* media playback refused: sound follows the switch */
  }
}

/** Resume + unlock from a gesture. Safe to call often (cheap after the first time). */
export function unlockAudio(): void {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
  const a = getAudioContext();
  applySilentSwitch();
  if (!a) return;
  try {
    if (a.state !== 'running') void a.resume().catch(() => {});
    if (!unlockedOnce) {
      unlockedOnce = true;
      const b = a.createBuffer(1, 1, 22050);
      const src = a.createBufferSource();
      src.buffer = b;
      src.connect(a.destination);
      src.start(0);
    }
  } catch {
    /* ignore */
  }
}

/** Installs the gesture listeners (once). touchend / pointerup / click / keydown are the events
 * that grant user activation; pointerdown is kept for older iOS that unlocked on touchstart. */
export function installAudioUnlock(): void {
  if (unlockHooked || typeof window === 'undefined') return;
  unlockHooked = true;
  const opts = { capture: true, passive: true } as AddEventListenerOptions;
  for (const ev of ['touchend', 'pointerup', 'click', 'keydown', 'pointerdown']) window.addEventListener(ev, unlockAudio, opts);
}

/** Settings changed ("sound on silent" or volume): re-apply on the next gesture. */
export function refreshSilentSwitch(): void {
  try {
    applySilentSwitch();
  } catch {
    /* ignore */
  }
}

// ---------- the shared sfx kit ----------

function out(a: AudioContext): AudioNode {
  if (!bus || bus.context !== a) {
    bus = a.createGain();
    bus.gain.value = 1;
    // A gentle compressor keeps stacked sounds from clipping.
    try {
      const comp = a.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      bus.connect(comp).connect(a.destination);
    } catch {
      bus.connect(a.destination);
    }
  }
  return bus;
}

/** Voice limiter: at most MAX_VOICES kit sounds ring at once (end times in a fixed ring). */
const MAX_VOICES = 14;
const voiceEnds = new Float64Array(MAX_VOICES);
const lastAt: Record<string, number> = {};

function admit(key: string, minGapS: number, a: AudioContext, dur: number): boolean {
  const t = a.currentTime;
  if (t - (lastAt[key] ?? -1) < minGapS) return false;
  let slot = -1;
  for (let i = 0; i < MAX_VOICES; i++) {
    if (voiceEnds[i] <= t) {
      slot = i;
      break;
    }
  }
  if (slot < 0) return false;
  voiceEnds[slot] = t + dur;
  lastAt[key] = t;
  return true;
}

function tone(a: AudioContext, freq: number, dur: number, v: number, type: OscillatorType, delay = 0, slide = 0): void {
  if (v <= 0.0005) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out(a));
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function hiss(a: AudioContext, dur: number, v: number, freq: number, delay = 0, q = 1): void {
  const buf = getNoiseBuffer();
  if (!buf || v <= 0.0005) return;
  const t0 = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out(a));
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

/** Runs a kit sound: volume from settings, voice limit, never throws. */
function play(key: string, minGap: number, dur: number, fn: (a: AudioContext, v: number) => void): void {
  const v = vol();
  if (!(v > 0)) return;
  const a = getAudioContext();
  if (!a || a.state === 'closed') return;
  try {
    if (!admit(key, minGap, a, dur)) return;
    fn(a, v);
  } catch {
    /* audio is optional */
  }
}

/** Semitone ratio. */
const st = (n: number) => 2 ** (n / 12);
/** Major-pentatonic ladder for rising-pitch chains. */
const PENTA = [0, 2, 4, 7, 9];
const ladder = (step: number) => {
  const s = Math.max(0, Math.min(14, Math.floor(step)));
  return PENTA[s % 5] + 12 * Math.floor(s / 5);
};

/**
 * The shared sfx kit: baseline sounds every scene can call (the Throne Room and departments
 * without their own). All respect the suite SFX volume and a voice limit; all are cheap and never
 * throw. Departments with a richer palette keep theirs and use these for the shared moments.
 */
export const sfx = {
  /** A soft UI click (every Button plays it on tap). */
  tap(): void {
    play('tap', 0.03, 0.05, (a, v) => tone(a, 1900, 0.035, 0.035 * v, 'triangle'));
  },
  /** A purchase "ka-ching"; `step` = consecutive buys (pitch climbs a pentatonic ladder). */
  buy(step = 0): void {
    play('buy', 0.035, 0.25, (a, v) => {
      const f = 880 * st(ladder(step));
      tone(a, f, 0.07, 0.07 * v, 'square');
      tone(a, f * 1.5, 0.16, 0.06 * v, 'triangle', 0.05);
      hiss(a, 0.05, 0.03 * v, 6000, 0.05, 2);
    });
  },
  /** A coin landing (coin-fly, collect). `step` raises the pitch a little. */
  coin(step = 0): void {
    play('coin', 0.04, 0.12, (a, v) => {
      const f = 1500 * st(Math.min(12, step));
      tone(a, f, 0.05, 0.05 * v, 'square');
      tone(a, f * 1.33, 0.08, 0.04 * v, 'square', 0.04);
    });
  },
  /** A big win: rising arpeggio + shimmer. */
  bigWin(): void {
    play('bigWin', 0.25, 0.7, (a, v) => {
      [0, 4, 7, 12, 16].forEach((n, i) => tone(a, 523 * st(n), 0.16, 0.07 * v, 'square', i * 0.06));
      tone(a, 523 * st(24), 0.4, 0.04 * v, 'triangle', 0.32);
      hiss(a, 0.35, 0.025 * v, 8000, 0.3, 1);
    });
  },
  /** Not allowed / can't afford. */
  error(): void {
    play('error', 0.12, 0.2, (a, v) => {
      tone(a, 220, 0.09, 0.07 * v, 'square');
      tone(a, 165, 0.12, 0.07 * v, 'square', 0.08);
    });
  },
  /** A whoosh (cards sliding in, things flying). */
  whoosh(): void {
    play('whoosh', 0.08, 0.3, (a, v) => hiss(a, 0.25, 0.05 * v, 1200, 0, 0.7));
  },
  /** A heavy slam (the Overlord lands, a gate breaks). */
  slam(): void {
    play('slam', 0.1, 0.5, (a, v) => {
      tone(a, 110, 0.35, 0.16 * v, 'sine', 0, -70);
      tone(a, 70, 0.4, 0.12 * v, 'triangle', 0.01, -30);
      hiss(a, 0.18, 0.08 * v, 400, 0, 0.6);
    });
  },
  /** A short count-up tick (Dread counting up); `step` climbs. */
  tick(step = 0): void {
    play('tick', 0.03, 0.05, (a, v) => tone(a, 1200 * st(Math.min(18, step * 0.5)), 0.03, 0.04 * v, 'square'));
  },
  /** The Legend's sting: low brass-ish minor stab. */
  legend(): void {
    play('legend', 0.4, 0.9, (a, v) => {
      [0, 3, 7].forEach((n) => tone(a, 147 * st(n), 0.7, 0.05 * v, 'sawtooth'));
      tone(a, 73, 0.8, 0.06 * v, 'triangle');
    });
  },
  /** The Fall: drum roll into a sack crash (the department is overrun). */
  fall(): void {
    play('fall', 0.4, 1.3, (a, v) => {
      for (let i = 0; i < 8; i++) hiss(a, 0.06, (0.03 + i * 0.008) * v, 300 + i * 40, i * 0.07, 1.5);
      tone(a, 98, 0.5, 0.12 * v, 'sine', 0.58, -50);
      hiss(a, 0.6, 0.09 * v, 2500, 0.58, 0.5);
    });
  },
  /** Capture: a triumphant fanfare (Avenged!). */
  capture(): void {
    play('capture', 0.4, 1.0, (a, v) => {
      [0, 7, 12].forEach((n, i) => tone(a, 392 * st(n), 0.14, 0.07 * v, 'square', i * 0.1));
      [4, 7, 12, 16].forEach((n) => tone(a, 392 * st(n), 0.55, 0.035 * v, 'triangle', 0.32));
    });
  },
};

export type SfxKit = typeof sfx;
