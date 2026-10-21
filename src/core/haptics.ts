// navigator.vibrate is ignored on iOS; Android honors it. Settings toggle lives in the save.
export function haptic(ms = 10): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
