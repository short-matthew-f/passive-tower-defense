// Settings live in a DOM overlay: it needs text input for save export/import and must work even if the canvas misbehaves.
import type { Game } from '../core/game';
import { exportSave, importSave, wipeSave } from '../core/save';
import { deptSetting, deptSettingValues, setDeptSetting } from '../core/settings';
import type { DeptId } from '../core/types';
import { checkForUpdate } from '../pwa';

declare const __APP_VERSION__: string;

export function openSettings(game: Game): void {
  const s = game.save.meta.settings;
  const el = document.createElement('div');
  el.className = 'overlay';
  const opt = (v: string, cur: string, label: string) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;
  // Settings -> Managers (00 §5.4.2): replay each department's intro and its seen micro-lessons.
  const esc = (t: string) => t.replace(/[<>&"]/g, '');
  const replayRows = game.built
    .filter((id) => game.save.depts[id])
    .map((id) => {
      const def = game.defs[id];
      const d = game.save.depts[id]!;
      const lessons = Object.keys(def.lessons ?? {}).filter((k) => d.seen[`ls.${k}`]);
      const lessonBtns = lessons.map((k) => `<button data-a="lesson" data-d="${id}" data-l="${esc(k)}" class="secondary">${esc(k)}</button>`).join(' ');
      return `<p style="margin:6px 0">${esc(def.manager.name)} <span style="opacity:.6">(${esc(def.name)})</span><br>
        <button data-a="intro" data-d="${id}" class="secondary">Replay intro</button> ${lessonBtns}</p>`;
    })
    .join('');
  // Per-department settings (DeptDef.settings): one section per unlocked department that has any.
  const deptRows = game.built
    .filter((id) => game.save.depts[id] && game.defs[id].settings?.length)
    .map((id) => {
      const def = game.defs[id];
      const d = game.save.depts[id]!;
      const vals = deptSettingValues(game.save, def);
      const rows = def
        .settings!.filter((st) => safe(() => st.visible?.(d) ?? true, true))
        .map((st) => {
          const hint = st.hint ? esc(safe(() => st.hint!(vals, d), '')) : '';
          const sub = hint ? `<br><span style="opacity:.6;font-size:12px">${hint}</span>` : '';
          if (st.kind === 'toggle') {
            const on = !!deptSetting(game.save, def, st.key);
            return `<p style="margin:4px 0"><label><input type="checkbox" data-ds="${id}" data-key="${esc(st.key)}"${on ? ' checked' : ''}> ${esc(st.label)}</label>${sub}</p>`;
          }
          if (st.kind === 'action') return `<p style="margin:4px 0"><button data-a="dsAction" data-d="${id}" data-key="${esc(st.key)}" class="secondary">${esc(st.label)}</button>${sub}</p>`;
          return `<p style="margin:4px 0">${esc(st.label)}${sub}</p>`;
        })
        .join('');
      return rows ? `<h3 style="margin:8px 0 4px">${esc(def.name.toUpperCase())}</h3>${rows}` : '';
    })
    .join('');
  const hasLog = game.built.some((id) => Array.isArray((game.save.depts[id]?.persistent as any)?.log));
  el.innerHTML = `
    <div class="box" style="text-align:left;max-height:80vh;overflow:auto">
      <h2>SETTINGS</h2>
      <h3 style="margin:8px 0 4px">MANAGERS</h3>
      <p><label>Chattiness<br><select data-k="chatter">
        ${opt('full', s.chatter, 'Full')}${opt('milestones', s.chatter, 'Milestones only')}${opt('off', s.chatter, 'Off')}
      </select></label></p>
      ${replayRows}
      <h3 style="margin:8px 0 4px">GAME</h3>
      <p><label>Numbers<br><select data-k="notation">
        ${opt('suffix', s.notation, '1.23K / 4.56M')}${opt('sci', s.notation, '1.23e3')}
      </select></label></p>
      <p><label><input type="checkbox" data-k="haptics"${s.haptics ? ' checked' : ''}> Vibration (Android)</label></p>
      <p><label>Sound<br><input type="range" data-k="sfx" min="0" max="1" step="0.1" value="${s.sfx ?? 0.6}" style="width:100%"></label></p>
      <p><label><input type="checkbox" data-k="leftHanded"${s.leftHanded ? ' checked' : ''}> Left-handed (mirror controls)</label></p>
      ${deptRows}
      <p><button data-a="update" class="secondary">Check for updates</button></p>
      <p><button data-a="export" class="secondary">Export save</button> <button data-a="import" class="secondary">Import</button></p>
      ${hasLog ? '<p><button data-a="log" class="secondary">Export playtest log</button></p>' : ''}
      <p><textarea data-k="io" rows="3" style="width:100%;font:12px monospace;display:none"></textarea></p>
      <p><button data-a="wipe" class="secondary" style="background:#7a2020">Erase everything</button></p>
      <p style="opacity:.6;font-size:12px">Overlord v${__APP_VERSION__}</p>
      <p style="text-align:center"><button data-a="close">Done</button></p>
    </div>`;
  const io = el.querySelector<HTMLTextAreaElement>('[data-k="io"]')!;
  el.querySelector<HTMLSelectElement>('[data-k="chatter"]')!.onchange = (e) => (s.chatter = (e.target as HTMLSelectElement).value as typeof s.chatter);
  el.querySelector<HTMLSelectElement>('[data-k="notation"]')!.onchange = (e) => (s.notation = (e.target as HTMLSelectElement).value as typeof s.notation);
  el.querySelector<HTMLInputElement>('[data-k="haptics"]')!.onchange = (e) => (s.haptics = (e.target as HTMLInputElement).checked);
  el.querySelector<HTMLInputElement>('[data-k="sfx"]')!.oninput = (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    s.sfx = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.6;
  };
  const wasLeft = !!s.leftHanded;
  el.querySelector<HTMLInputElement>('[data-k="leftHanded"]')!.onchange = (e) => (s.leftHanded = (e.target as HTMLInputElement).checked);
  el.querySelectorAll<HTMLInputElement>('input[data-ds]').forEach((inp) => {
    inp.onchange = () => setDeptSetting(game.save, inp.dataset.ds as DeptId, inp.dataset.key!, inp.checked);
  });
  /** Closing: a changed handedness rebuilds the open department so it re-lays out. */
  const done = () => {
    game.saveSoon();
    el.remove();
    if (!!s.leftHanded !== wasLeft && game.current !== 'throne') game.enter(game.current);
  };
  el.addEventListener('click', async (e) => {
    const a = (e.target as HTMLElement).dataset.a;
    if (!a) return;
    if (a === 'close') {
      done();
    } else if (a === 'dsAction') {
      const id = (e.target as HTMLElement).dataset.d as DeptId;
      const key = (e.target as HTMLElement).dataset.key!;
      if (!game.save.depts[id]) return;
      game.saveSoon();
      el.remove();
      game.runSettingAction(id, key);
    } else if (a === 'log') {
      // Playtest logs (07 §19): every department that keeps a persistent `log` array.
      const out: Record<string, unknown> = { app: __APP_VERSION__, at: new Date().toISOString() };
      for (const id of game.built) {
        const log = (game.save.depts[id]?.persistent as any)?.log;
        if (Array.isArray(log)) out[id] = log;
      }
      const text = JSON.stringify(out);
      io.style.display = 'block';
      io.value = text;
      io.select();
      try {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `overlord-playtest-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        /* downloads may be blocked; the text is selected for manual copy */
      }
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* clipboard may be blocked */
      }
    } else if (a === 'intro' || a === 'lesson') {
      const id = (e.target as HTMLElement).dataset.d as keyof typeof game.save.depts;
      const d = game.save.depts[id];
      if (!d) return;
      if (a === 'intro') {
        for (const k of Object.keys(d.seen)) if (k.startsWith('ob.') || k === 'onboardingDone' || k === 'onboardingSkipped') delete d.seen[k];
        d.seen.onboardingReplay = 1;
      } else {
        const l = (e.target as HTMLElement).dataset.l!;
        for (const k of Object.keys(d.seen)) if (k === `ls.${l}` || k.startsWith(`ls.${l}.`)) delete d.seen[k];
        d.seen[`lsReplay.${l}`] = 1;
      }
      game.saveSoon();
      el.remove();
      game.enter(id);
    } else if (a === 'update') {
      const btn = e.target as HTMLButtonElement;
      btn.textContent = 'Checking...';
      const found = await checkForUpdate();
      btn.textContent = found ? 'Update found!' : 'You are up to date';
    } else if (a === 'export') {
      io.style.display = 'block';
      game.save.meta.seen.exportAt = Date.now(); // resets the weekly backup reminder
      io.value = exportSave(game.save);
      io.select();
      try {
        await navigator.clipboard.writeText(io.value);
      } catch {
        /* clipboard may be blocked; the text is selected for manual copy */
      }
    } else if (a === 'import') {
      if (io.style.display === 'none') {
        io.style.display = 'block';
        io.value = '';
        io.placeholder = 'Paste an exported save, then tap Import again';
        return;
      }
      const loaded = importSave(io.value);
      if (!loaded) {
        io.value = 'That save could not be read.';
        return;
      }
      game.replaceSave(loaded);
      el.remove();
    } else if (a === 'wipe') {
      // A read-only tab does not own the save: the writer tab would write it straight back (C-02).
      if (game.readOnly) {
        alert('Overlord is open in another tab. Erase from that tab.');
        return;
      }
      if (!confirm('Erase all progress? This cannot be undone.')) return;
      game.readOnly = true;
      // wipeSave closes the save module's write gate first: no autosave, hide or unload write in
      // this page can bring the empire back.
      await wipeSave();
      location.reload();
    }
  });
  document.body.appendChild(el);
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
