// Manager line lint (00 §5.4): every manager line and every onboarding / lesson beat fits the
// strip, i.e. <= 32 characters once icon tokens ({coin}, {gem} ...) count as one character.
// %var% placeholders count as written (departments keep their values short).
import { describe, expect, it } from 'vitest';
import { DEPARTMENTS } from '../src/depts';
import { ICON_NAMES } from '../src/ui/font';

const MAX = 32;
const len = (s: string) => s.replace(/\{[a-z-]+\}/gi, '#').length;

describe('manager lines', () => {
  for (const def of DEPARTMENTS) {
    it(`${def.id}: every line and beat is <= ${MAX} characters`, () => {
      const bad: string[] = [];
      for (const [key, pool] of Object.entries(def.manager.lines)) {
        for (const line of pool) if (len(line) > MAX) bad.push(`lines.${key}: "${line}" (${len(line)})`);
      }
      for (const st of def.onboarding) if (len(st.line) > MAX) bad.push(`onboarding.${st.id}: "${st.line}" (${len(st.line)})`);
      for (const [id, beats] of Object.entries(def.lessons ?? {})) {
        for (const st of beats) if (len(st.line) > MAX) bad.push(`lessons.${id}.${st.id}: "${st.line}" (${len(st.line)})`);
      }
      expect(bad).toEqual([]);
    });

    it(`${def.id}: every {icon} token names a font icon`, () => {
      const all = [...Object.values(def.manager.lines).flat(), ...def.onboarding.map((s) => s.line), ...Object.values(def.lessons ?? {}).flat().map((s) => s.line)];
      const unknown = all.flatMap((l) => [...l.matchAll(/\{([a-z-]+)\}/gi)].map((m) => m[1].toLowerCase())).filter((n) => !ICON_NAMES.includes(n));
      expect([...new Set(unknown)]).toEqual([]);
    });

    it(`${def.id}: expressions and moods are well formed`, () => {
      const m = def.manager;
      expect(m.portrait.length).toBeGreaterThanOrEqual(2);
      for (const f of m.portrait) expect(f.length).toBe(12);
      for (const [name, frames] of Object.entries(m.expressions ?? {})) {
        expect(frames.length, name).toBeGreaterThanOrEqual(1);
        for (const f of frames) expect(f.length, name).toBe(12);
      }
      for (const [key, name] of Object.entries(m.moods ?? {})) expect(m.expressions?.[name], `${key} -> ${name}`).toBeTruthy();
    });
  }
});
