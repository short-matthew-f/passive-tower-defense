// Report rendering: a console table, a markdown report and a JSON dump.
import type { DaySnap, SimEvent } from './meta';
import { fmt, type Metric } from './metrics';

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n - 1) + '…' : s + ' '.repeat(n - s.length));
export function consoleTable(title: string, ms: Metric[]): string {
  const lines = [`\n== ${title} ==`];
  lines.push(`${pad('STATUS', 7)}${pad('LEVEL', 9)}${pad('DEPT', 10)}${pad('METRIC', 46)}${pad('VALUE', 58)}BAND`);
  for (const m of ms) {
    const lvl = m.level + (m.ci ? '+CI' : '');
    lines.push(`${pad(m.status, 7)}${pad(lvl, 9)}${pad(m.dept ?? 'suite', 10)}${pad(m.label, 46)}${pad(m.display, 58)}${m.band}`);
  }
  const c = { FAIL: 0, WARN: 0, PASS: 0, INFO: 0 };
  for (const m of ms) c[m.status]++;
  lines.push(`-- ${c.PASS} pass, ${c.WARN} warn, ${c.FAIL} fail, ${c.INFO} info`);
  return lines.join('\n');
}

export function markdownTable(ms: Metric[]): string {
  const rows = ['| Status | Level | Dept | Metric | Value | Band |', '|---|---|---|---|---|---|'];
  for (const m of ms) {
    const lvl = m.level + (m.ci ? ' (CI)' : '');
    const val = m.display.replace(/\|/g, '/') + (m.note ? `<br><sub>${m.note}</sub>` : '');
    rows.push(`| ${m.status} | ${lvl} | ${m.dept ?? 'suite'} | ${m.label} | ${val} | ${m.band} |`);
  }
  return rows.join('\n');
}

export function snapsTable(snaps: DaySnap[]): string {
  const ids = [...new Set(snaps.flatMap((s) => Object.keys(s.depts)))];
  const head = ['Day', 'Active min', 'Tribute (lifetime)', 'Dread (lifetime)', ...ids.map((id) => `${id}: rank / Infamy / Falls / state`)];
  const rows = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const s of snaps) {
    const cells = ids.map((id) => {
      const d = s.depts[id];
      return d ? `${d.rank} / ${d.infamy.toFixed(0)}% / ${d.falls} / ${d.desc}` : 'locked';
    });
    rows.push(`| ${s.day + 1} | ${s.activeMin.toFixed(0)} | ${fmt(s.tributeLifetime, 0)} | ${s.dreadLifetime} | ${cells.join(' | ')} |`);
  }
  return rows.join('\n');
}

export function eventsList(events: SimEvent[], kinds = ['unlock', 'firstBuy', 'fall']): string {
  return events
    .filter((e) => kinds.includes(e.kind))
    .map((e) => {
      const h = (e.t % 86400) / 3600;
      const hh = Math.floor(h);
      const mm = Math.floor((h - hh) * 60);
      return `- day ${e.day + 1} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} (active ${e.activeMin.toFixed(0)} min): ${e.text}`;
    })
    .join('\n');
}

export function statusCounts(ms: Metric[]): string {
  const c = { FAIL: 0, WARN: 0, PASS: 0, INFO: 0 };
  for (const m of ms) c[m.status]++;
  return `${c.PASS} pass, ${c.WARN} warn, ${c.FAIL} fail`;
}
