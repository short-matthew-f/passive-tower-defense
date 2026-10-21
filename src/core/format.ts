// formatNum per specs/00 §8: 3 significant figures, K M B T then aa, ab, ... az, ba, ...

const SUFFIX = ['', 'K', 'M', 'B', 'T'];

export function formatNum(n: number, notation: 'suffix' | 'sci' = 'suffix'): string {
  if (!Number.isFinite(n)) return n > 0 ? 'INF' : '-INF';
  if (n < 0) return '-' + formatNum(-n, notation);
  if (n < 1000) {
    if (n < 10 && n % 1 !== 0) return (Math.floor(n * 10) / 10).toString();
    return Math.floor(n).toString();
  }
  const exp = Math.floor(Math.log10(n));
  if (notation === 'sci') {
    const m = n / 10 ** exp;
    return `${(Math.floor(m * 100) / 100).toFixed(2)}e${exp}`;
  }
  const tier = Math.floor(exp / 3);
  const scaled = n / 10 ** (tier * 3);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const f = 10 ** digits;
  const shown = (Math.floor(scaled * f) / f).toFixed(digits);
  return shown + suffixFor(tier);
}

function suffixFor(tier: number): string {
  if (tier < SUFFIX.length) return SUFFIX[tier];
  const i = tier - SUFFIX.length; // 0 -> aa
  const a = Math.floor(i / 26);
  const b = i % 26;
  return String.fromCharCode(97 + a) + String.fromCharCode(97 + b);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
