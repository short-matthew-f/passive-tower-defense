// Service worker registration with a "new version" reload prompt. Checks on launch, hourly,
// and whenever the app returns to the foreground (installed iOS apps rarely check on their own).
import { registerSW } from 'virtual:pwa-register';

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let prompted = false;

export function initPwa(onBeforeReload: () => void): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      showPrompt(onBeforeReload);
    },
    onRegisteredSW(_url, reg) {
      registration = reg;
      if (!reg) return;
      setInterval(() => void reg.update(), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update();
      });
    },
  });
}

export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false;
  try {
    await registration.update();
  } catch {
    return false;
  }
  return !!registration.waiting || prompted;
}

function showPrompt(onBeforeReload: () => void): void {
  if (prompted) return;
  prompted = true;
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `<div class="box">
      <h2>NEW ORDERS ARRIVED</h2>
      <p>A new version of Overlord is ready. Your empire is saved.</p>
      <button data-a="reload">Reload</button><button data-a="later" class="secondary">Later</button>
    </div>`;
  el.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).dataset.a;
    if (a === 'reload') {
      onBeforeReload();
      void updateSW?.(true);
    } else if (a === 'later') {
      el.remove();
      prompted = false;
    }
  });
  document.body.appendChild(el);
}
