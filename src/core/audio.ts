// The one shared AudioContext for every department's sfx (perf P-06). Created lazily on the first
// sound (after a user gesture); suspended while the page is hidden; resumed on the next sound or
// touch. Departments call getAudioContext() instead of constructing their own.
let ac: AudioContext | null = null;
let failed = false;
let hooked = false;
let noise: AudioBuffer | null = null;

function hook(): void {
  if (hooked || typeof document === 'undefined') return;
  hooked = true;
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    try {
      if (document.visibilityState === 'hidden') void ac.suspend();
    } catch {
      /* ignore */
    }
  });
  // iOS only resumes inside a gesture.
  const resume = () => {
    if (ac && ac.state === 'suspended' && document.visibilityState === 'visible') void ac.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', resume, { capture: true, passive: true });
}

/** The shared context, or null when WebAudio is unavailable. Resumes a suspended context. */
export function getAudioContext(): AudioContext | null {
  if (failed) return null;
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
