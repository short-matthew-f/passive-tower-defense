// Per-department player settings (DeptDef.settings, 00 §9): stored in meta.settings.depts, default
// filled on read, migrated once from older saves' `persistent` fields. Pure, no Pixi.
import type { DeptSettingDef } from './dept';
import type { DeptId, SaveRoot } from './types';

interface HasSettings {
  id: DeptId;
  settings?: DeptSettingDef[];
}

function bucket(save: SaveRoot, id: DeptId): Record<string, unknown> {
  const st = save.meta.settings;
  if (typeof st.depts !== 'object' || !st.depts) st.depts = {};
  return (st.depts[id] ??= {});
}

/** The setting's value, or its default when unset. */
export function deptSetting<T = unknown>(save: SaveRoot, def: HasSettings, key: string): T {
  const v = save.meta.settings.depts?.[def.id]?.[key];
  if (v !== undefined) return v as T;
  return def.settings?.find((s) => s.key === key)?.default as T;
}

export function setDeptSetting(save: SaveRoot, id: DeptId, key: string, value: unknown): void {
  bucket(save, id)[key] = value;
}

/** Every setting of a department with defaults filled (for hints). */
export function deptSettingValues(save: SaveRoot, def: HasSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of def.settings ?? []) out[s.key] = deptSetting(save, def, s.key);
  return out;
}

/**
 * Moves values older saves kept in a department's `persistent` (DeptSettingDef.legacy) into the
 * suite settings, once: a value already in settings wins, and the old field is removed. Gentle:
 * odd data is skipped. Returns how many values moved.
 */
export function migrateDeptSettings(save: SaveRoot, defs: Record<string, HasSettings>): number {
  let moved = 0;
  for (const def of Object.values(defs)) {
    const d = save.depts[def.id];
    const per = d?.persistent as Record<string, unknown> | undefined;
    if (!per || typeof per !== 'object') continue;
    for (const s of def.settings ?? []) {
      if (!s.legacy || !(s.legacy in per)) continue;
      const b = bucket(save, def.id);
      const v = per[s.legacy];
      if (b[s.key] === undefined && v !== undefined && v !== null && typeof v !== 'object') {
        b[s.key] = v;
        moved++;
      }
      delete per[s.legacy];
    }
  }
  return moved;
}
