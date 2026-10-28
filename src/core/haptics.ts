// Haptics (fun plan A1). What each platform allows (honest notes):
//  - Android (Chrome): navigator.vibrate(ms) works from anywhere; used as before.
//  - iOS: navigator.vibrate does not exist in Safari. The only web route is an undocumented one:
//    since iOS 18, toggling an <input type="checkbox" switch> (the native switch control, Safari
//    17.4+) plays the system "selection" haptic. We keep one hidden switch in the DOM and click its
//    label. It fires ONLY while handling a user gesture (a tap), so call haptic() synchronously
//    from tap handlers: Pixi pointer events are dispatched synchronously from the DOM event, so
//    department tap handlers qualify. Timer- or ticker-driven calls (a ball landing, a battle hit)
//    do nothing on iOS. The tap is always the same light tick: `ms` cannot make it stronger.
//    Apple may change or remove this at any time; every step is feature-detected and guarded.
//  - Rate-limited to one tick per 60 ms so a hold-to-repeat does not buzz continuously.
//  - The Settings toggle (meta.settings.haptics) is respected through setHapticsEnabled().
let enabledSrc: () => boolean = () => true;
let lastAt = -Infinity;
let label: HTMLLabelElement | null = null;
let switchOk: boolean | null = null;

export const HAPTIC_MIN_GAP_MS = 60;

export function setHapticsEnabled(fn: () => boolean): void {
  enabledSrc = fn;
}

/** Which route this browser offers: Android vibrate, the iOS 18 switch trick, or nothing. */
export function hapticsSupport(): 'vibrate' | 'ios-switch' | 'none' {
  if (typeof navigator === 'undefined') return 'none';
  if (typeof (navigator as any).vibrate === 'function') return 'vibrate';
  if (switchOk === null) {
    try {
      switchOk = typeof document !== 'undefined' && 'switch' in document.createElement('input');
    } catch {
      switchOk = false;
    }
  }
  return switchOk ? 'ios-switch' : 'none';
}

function iosSwitch(): HTMLLabelElement | null {
  if (label?.isConnected) return label;
  try {
    const l = document.createElement('label');
    l.setAttribute('aria-hidden', 'true');
    l.style.cssText = 'position:fixed;left:-60px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.setAttribute('switch', '');
    inp.tabIndex = -1;
    l.appendChild(inp);
    // The click must not reach game listeners (dblclick guard, settings overlays).
    l.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(l);
    label = l;
    return l;
  } catch {
    return null;
  }
}

/** Whether a gesture is being handled right now, where the browser can tell (userActivation).
 * Unknown -> true (try anyway; the switch is harmless outside a gesture). */
function inGesture(): boolean {
  const ua = (navigator as any).userActivation;
  return ua && typeof ua.isActive === 'boolean' ? ua.isActive : true;
}

/** A haptic tick. Android: vibrate `ms`. iOS 18+: one light tick, only inside a tap handler. */
export function haptic(ms = 10): void {
  try {
    if (!enabledSrc()) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastAt < HAPTIC_MIN_GAP_MS) return;
    const how = hapticsSupport();
    if (how === 'vibrate') {
      lastAt = now;
      navigator.vibrate(ms);
    } else if (how === 'ios-switch' && inGesture()) {
      const l = iosSwitch();
      if (!l) return;
      lastAt = now;
      l.click();
    }
  } catch {
    /* unsupported */
  }
}

/** The light tick every Button gives on tap: iOS only (the switch trick, inside the tap). Android
 * keeps its vibrations where departments chose them, so buttons there stay quiet. */
export function tapHaptic(): void {
  if (hapticsSupport() === 'ios-switch') haptic(6);
}
