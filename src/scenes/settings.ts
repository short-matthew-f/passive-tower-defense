// Settings live in a DOM overlay: it needs text input for save export/import and must work even if the canvas misbehaves.
import type { Game } from '../core/game';
import { exportSave, importSave, wipeSave } from '../core/save';
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
      <p><button data-a="update" class="secondary">Check for updates</button></p>
      <p><button data-a="export" class="secondary">Export save</button> <button data-a="import" class="secondary">Import</button></p>
      <p><textarea data-k="io" rows="3" style="width:100%;font:12px monospace;display:none"></textarea></p>
      <p><button data-a="wipe" class="secondary" style="background:#7a2020">Erase everything</button></p>
      <p style="opacity:.6;font-size:12px">Overlord v${__APP_VERSION__}</p>
      <p style="text-align:center"><button data-a="close">Done</button></p>
    </div>`;
  const io = el.querySelector<HTMLTextAreaElement>('[data-k="io"]')!;
  el.querySelector<HTMLSelectElement>('[data-k="chatter"]')!.onchange = (e) => (s.chatter = (e.target as HTMLSelectElement).value as typeof s.chatter);
  el.querySelector<HTMLSelectElement>('[data-k="notation"]')!.onchange = (e) => (s.notation = (e.target as HTMLSelectElement).value as typeof s.notation);
  el.querySelector<HTMLInputElement>('[data-k="haptics"]')!.onchange = (e) => (s.haptics = (e.target as HTMLInputElement).checked);
  el.addEventListener('click', async (e) => {
    const a = (e.target as HTMLElement).dataset.a;
    if (!a) return;
    if (a === 'close') {
      game.saveSoon();
      el.remove();
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
      if (!confirm('Erase all progress? This cannot be undone.')) return;
      game.readOnly = true;
      await wipeSave();
      location.reload();
    }
  });
  document.body.appendChild(el);
}
