// The Game: owns the save, the clock, offline accounting, Tribute, Infamy/Falls and scene switching.
import { Application, Container } from 'pixi.js';
import type { DeptCtx, DeptDef, DeptScene, UpgradeGroup } from './dept';
import {
  coreMult,
  commendationReward,
  dreadPayout,
  infamy,
  MAX_ELAPSED,
  offlineCapSeconds,
  offlineFactor,
  rank,
  tributeCapSeconds,
  tributeRate,
} from './economy';
import { computeLayout, type Layout } from './layout';
import { acquireWriterLock, loadSave, requestPersistence, writeMirror, writeSave } from './save';
import { DEPT_ORDER, newSave, type DeptId, type DeptSave, type SaveRoot } from './types';
import { SEAL_COST, SEAL_DREAD } from './meta';
import { DeptHud, HUD_H } from '../ui/hud';
import { ManagerBubble } from '../ui/manager';
import { UpgradeSheet } from '../ui/sheet';
import { FloatLayer } from '../ui/floats';
import { showFallCard } from '../scenes/fall';
import { showReport, type ReportLine } from '../scenes/report';
import { ThroneScene } from '../scenes/throne';
import { haptic } from './haptics';
import { formatNum } from './format';

const AUTOSAVE_MS = 10_000;
const IDLE_INPUT_MS = 10 * 60_000;

export class Game {
  app: Application;
  save!: SaveRoot;
  layout: Layout;
  defs: Record<string, DeptDef> = {};

  /** Layers, bottom to top. */
  sceneLayer = new Container();
  hudLayer = new Container();
  floatLayer: FloatLayer;
  managerLayer = new Container();
  modalLayer = new Container();

  current: DeptId | 'throne' = 'throne';
  private scene: DeptScene | ThroneScene | null = null;
  private hud: DeptHud | null = null;
  private manager: ManagerBubble;
  ctx: DeptCtx | null = null;
  private econAcc = 0;
  private lastSave = 0;
  private lastInput = Date.now();
  private hiddenAt: number | null = null;
  readOnly = false;

  constructor(app: Application, layout: Layout) {
    this.app = app;
    this.layout = layout;
    this.floatLayer = new FloatLayer();
    this.manager = new ManagerBubble(this);
    this.managerLayer.addChild(this.manager);
    app.stage.addChild(this.sceneLayer, this.hudLayer, this.floatLayer, this.managerLayer, this.modalLayer);
    app.stage.eventMode = 'static';
    app.stage.on('pointerdown', () => (this.lastInput = Date.now()));
  }

  register(def: DeptDef): void {
    this.defs[def.id] = def;
  }

  /** Departments that exist in this build, in unlock order. */
  get built(): DeptId[] {
    return DEPT_ORDER.filter((id) => this.defs[id]);
  }

  async start(): Promise<void> {
    const hasLock = await acquireWriterLock();
    this.readOnly = !hasLock;
    const now = Date.now();
    this.save = (await loadSave()) ?? newSave(now);
    if (!this.save.depts.cauldron && this.defs.cauldron) this.unlock('cauldron', now);
    const elapsed = this.clampElapsed(now);
    this.save.lastSeen = now;
    this.goThrone();
    if (elapsed >= 60) this.applyOffline(elapsed, now);
    this.lastSave = now;
    this.app.ticker.add((t) => this.frame(t.deltaMS / 1000));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.persistSync());
    if (this.readOnly) this.showReadOnly();
  }

  // ---------- clock and offline ----------

  private clampElapsed(now: number): number {
    const last = this.save.lastSeen || now;
    if (now < last) return 0; // clock went backwards: no penalty, no credit
    return Math.min(MAX_ELAPSED, (now - last) / 1000);
  }

  private onVisibility(): void {
    const now = Date.now();
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = now;
      this.save.lastSeen = now;
      this.persistSync();
      void writeSave(this.save, now);
    } else if (this.hiddenAt !== null) {
      const elapsed = this.clampElapsed(now);
      this.hiddenAt = null;
      this.save.lastSeen = now;
      this.lastInput = now;
      if (elapsed >= 5) this.applyOffline(elapsed, now);
    }
  }

  /** Credits offline income for every unlocked department plus Tribute, then shows Gobbo's report. */
  applyOffline(elapsed: number, now: number): void {
    if (this.readOnly) return;
    const s = this.save;
    const factor = offlineFactor(s);
    const cap = offlineCapSeconds(s);
    const t = Math.min(elapsed, cap);
    const lines: ReportLine[] = [];
    let tribute = 0;
    for (const id of this.built) {
      const d = s.depts[id];
      if (!d) continue;
      const def = this.defs[id];
      const rate = def.idleRate(d) * coreMult(s, id, this.defs, now);
      const amount = rate * factor * t;
      this.credit(d, amount);
      tribute += tributeRate(s, id, this.defs, false) * factor * Math.min(elapsed, tributeCapSeconds(s));
      const inf = infamy(def, d);
      lines.push({ id, def, amount, legend: d.cycle.legendWaiting, infamy: inf.value });
    }
    this.addTribute(tribute);
    if (elapsed >= 60) {
      showReport(this, { elapsed, capped: elapsed > cap, cap, lines, tribute });
    }
    this.checkProgress(now);
  }

  // ---------- currency ----------

  credit(d: DeptSave, amount: number): void {
    if (!(amount > 0)) return;
    d.run.bank += amount;
    d.cycle.earnings += amount;
  }

  addTribute(amount: number): void {
    if (!(amount > 0)) return;
    const m = this.save.meta;
    m.tribute += amount;
    m.tributeLifetime += amount;
    m.tributePeak = Math.max(m.tributePeak, m.tribute);
  }

  spendTribute(amount: number): boolean {
    if (this.save.meta.tribute + 1e-9 < amount) return false;
    this.save.meta.tribute -= amount;
    this.saveSoon();
    return true;
  }

  spendDread(amount: number): boolean {
    if (this.save.meta.dread + 1e-9 < amount) return false;
    this.save.meta.dread -= amount;
    this.saveSoon();
    return true;
  }

  // ---------- frame loop ----------

  private frame(dtRaw: number): void {
    const dt = Math.min(0.1, dtRaw);
    const now = Date.now();
    if (!this.readOnly) {
      this.econAcc += dt;
      while (this.econAcc >= 1) {
        this.econAcc -= 1;
        this.econTick(now);
      }
    }
    this.scene?.update(dt);
    this.hud?.update();
    this.manager.update(dt);
    this.floatLayer.update(dt);
    if (!this.readOnly && now - this.lastSave > AUTOSAVE_MS) {
      this.lastSave = now;
      this.save.lastSeen = now;
      void writeSave(this.save, now);
    }
  }

  /** 1 Hz: background departments accrue closed-form idle income; Tribute accrues; Infamy updates. */
  private econTick(now: number): void {
    const s = this.save;
    const idle = now - this.lastInput > IDLE_INPUT_MS;
    const factor = idle ? offlineFactor(s) : 1;
    let tribute = 0;
    for (const id of this.built) {
      const d = s.depts[id];
      if (!d) continue;
      const onScreen = this.current === id;
      if (!onScreen) {
        const def = this.defs[id];
        this.credit(d, def.idleRate(d) * coreMult(s, id, this.defs, now) * factor);
      }
      tribute += tributeRate(s, id, this.defs, onScreen && !idle) * factor;
    }
    this.addTribute(tribute);
    s.lastSeen = now;
    this.checkProgress(now);
  }

  /** Infamy thresholds, peak rank, commendations. */
  checkProgress(_now: number): void {
    const s = this.save;
    for (const id of this.built) {
      const d = s.depts[id];
      if (!d) continue;
      const def = this.defs[id];
      d.lifetime.peakRank = Math.max(d.lifetime.peakRank, rank(s, id, this.defs));
      const inf = infamy(def, d).value;
      if (inf >= 50 && !d.seen[`inf50.${d.cycle.n}`]) {
        d.seen[`inf50.${d.cycle.n}`] = 1;
        if (this.current === id) this.managerSay(id, 'infamy50', { milestone: true });
      }
      if (inf >= 100 && !d.cycle.legendWaiting) {
        d.cycle.legendWaiting = true;
        if (this.current === id) this.managerSay(id, 'legend', { milestone: true });
      }
      const mask = s.meta.commendations[id] ?? 0;
      def.commendations.forEach((c, i) => {
        if (mask & (1 << i)) return;
        if (c.test(d)) {
          s.meta.commendations[id] = (s.meta.commendations[id] ?? 0) | (1 << i);
          const reward = commendationReward(i);
          this.addTribute(reward);
          this.toast(`COMMENDATION: ${c.label}  +${reward} TRIBUTE`);
        }
      });
    }
  }

  // ---------- departments ----------

  unlock(id: DeptId, now = Date.now()): void {
    const def = this.defs[id];
    if (!def || this.save.depts[id]) return;
    this.save.depts[id] = {
      v: def.version,
      unlockedAt: now,
      cycle: { n: 0, startedAt: now, earnings: 0, heldLevel: 0, legendWaiting: false },
      lifetime: { peakRank: 0, falls: 0, best: {} },
      imports: {},
      persistent: def.defaultPersistent(),
      run: def.defaultRun() as DeptSave['run'],
      seen: {},
    };
  }

  sealCost(id: DeptId): number {
    return SEAL_COST[id];
  }

  sealDread(id: DeptId): number {
    return SEAL_DREAD[id] ?? 0;
  }

  buySeal(id: DeptId): boolean {
    if (!this.defs[id] || this.save.depts[id]) return false;
    if (this.save.meta.dreadLifetime < this.sealDread(id)) return false;
    if (!this.spendTribute(this.sealCost(id))) return false;
    this.unlock(id);
    this.saveSoon();
    return true;
  }

  goThrone(): void {
    this.teardown();
    this.current = 'throne';
    const t = new ThroneScene(this);
    this.scene = t;
    this.sceneLayer.addChild(t.root);
  }

  enter(id: DeptId): void {
    const def = this.defs[id];
    const d = this.save.depts[id];
    if (!def || !d) return;
    this.teardown();
    this.current = id;
    const ctx = this.makeCtx(def, d);
    this.ctx = ctx;
    this.hud = new DeptHud(this, def, d);
    this.hudLayer.addChild(this.hud);
    const scene = def.createScene(ctx);
    this.scene = scene;
    this.sceneLayer.addChild(scene.root);
    if (!d.seen.intro) {
      d.seen.intro = 1;
      this.managerSay(id, 'intro', { milestone: true });
    } else if (d.cycle.n > 0 && !d.seen[`returnFall.${d.cycle.n}`]) {
      d.seen[`returnFall.${d.cycle.n}`] = 1;
      this.managerSay(id, 'returnFall', { milestone: true });
    } else if (d.cycle.legendWaiting) {
      this.managerSay(id, 'legend', { milestone: true });
    }
    this.manager.startOnboarding(def, d);
  }

  private teardown(): void {
    this.manager.clear();
    this.modalLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (this.scene) {
      if ('destroy' in this.scene) this.scene.destroy();
      this.scene = null;
    }
    this.sceneLayer.removeChildren();
    if (this.hud) {
      this.hud.destroy({ children: true });
      this.hud = null;
    }
    this.ctx = null;
  }

  private makeCtx(def: DeptDef, d: DeptSave): DeptCtx {
    const game = this;
    return {
      game,
      def,
      save: d,
      get layout() {
        return game.layout;
      },
      content() {
        const L = game.layout;
        const top = L.safe.t + HUD_H;
        return { x: L.safe.l, y: top, w: L.w - L.safe.l - L.safe.r, h: L.h - top - L.safe.b };
      },
      earn(base: number) {
        const amount = base * coreMult(game.save, def.id, game.defs, Date.now());
        game.credit(d, amount);
        return amount;
      },
      mult() {
        return coreMult(game.save, def.id, game.defs, Date.now());
      },
      spend(amount: number) {
        if (d.run.bank + 1e-9 < amount) return false;
        d.run.bank -= amount;
        if (!d.seen.firstUpgrade) {
          d.seen.firstUpgrade = 1;
          game.managerSay(def.id, 'firstUpgrade', { milestone: true });
        }
        if (amount > d.run.bank * 0.1) game.saveSoon();
        return true;
      },
      raiseSkill(level: number) {
        if (level > d.cycle.heldLevel) d.cycle.heldLevel = level;
      },
      say(trigger, opts) {
        game.managerSay(def.id, trigger, opts);
      },
      seen(key) {
        return !!d.seen[key];
      },
      markSeen(key) {
        d.seen[key] = 1;
      },
      haptic(ms = 10) {
        if (game.save.meta.settings.haptics) haptic(ms);
      },
      float(text, x, y, color) {
        game.floatLayer.spawn(text, x, y, color);
      },
      saveSoon() {
        game.saveSoon();
      },
      openUpgrades(groups: UpgradeGroup[]) {
        game.openSheet(def, groups);
      },
    };
  }

  openSheet(def: DeptDef, groups: UpgradeGroup[]): void {
    const d = this.save.depts[def.id];
    this.openCustomSheet('UPGRADES', () => ({
      text: `${formatNum(d?.run.bank ?? 0, this.save.meta.settings.notation)} ${def.currency}`,
      color: def.currencyColor,
    }), groups);
  }

  openCustomSheet(title: string, bank: () => { text: string; color: string }, groups: UpgradeGroup[]): void {
    this.modalLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const sheet = new UpgradeSheet(this, title, bank, groups, () => sheet.destroy({ children: true }));
    this.modalLayer.addChild(sheet);
  }

  managerSay(id: DeptId, trigger: string, opts?: { milestone?: boolean; vars?: Record<string, string | number> }): void {
    if (this.current !== id) return;
    const def = this.defs[id];
    if (def) this.manager.say(def, trigger, opts);
  }

  haptic(ms = 10): void {
    if (this.save.meta.settings.haptics) haptic(ms);
  }

  toast(text: string): void {
    this.manager.toast(text);
  }

  // ---------- the Fall ----------

  startFall(id: DeptId): void {
    const def = this.defs[id];
    const d = this.save.depts[id];
    if (!def || !d || !d.cycle.legendWaiting) return;
    const inf = infamy(def, d).value;
    showFallCard(this, def, d, inf, (crush) => this.completeFall(id, inf, crush));
  }

  private completeFall(id: DeptId, inf: number, crush: number): void {
    const def = this.defs[id];
    const d = this.save.depts[id];
    if (!def || !d) return;
    const dread = dreadPayout(d, inf, crush);
    this.save.meta.dread += dread;
    this.save.meta.dreadLifetime += dread;
    this.save.meta.trophies.push({ dept: id, name: def.legend.name, at: Date.now() });
    d.lifetime.falls += 1;
    d.run = def.defaultRun() as DeptSave['run'];
    d.cycle = { n: d.cycle.n + 1, startedAt: Date.now(), earnings: 0, heldLevel: 0, legendWaiting: false };
    void requestPersistence();
    this.persistSync();
    void writeSave(this.save, Date.now());
    this.toast(`+${dread} DREAD`);
    // Re-enter so the department rebuilds from its fresh run state.
    this.enter(id);
  }

  // ---------- persistence ----------

  saveSoon(): void {
    this.lastSave = 0;
  }

  persistSync(): void {
    if (this.readOnly) return;
    this.save.lastSeen = Date.now();
    writeMirror(this.save, Date.now());
  }

  replaceSave(s: SaveRoot): void {
    this.save = s;
    this.save.lastSeen = Date.now();
    this.persistSync();
    this.goThrone();
  }

  // ---------- resize ----------

  resize(): void {
    this.layout = computeLayout();
    const L = this.layout;
    this.app.renderer.resize(L.device.w, L.device.h);
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.width = `${L.device.cssW}px`;
    canvas.style.height = `${L.device.cssH}px`;
    canvas.style.left = `${Math.floor((window.innerWidth - L.device.cssW) / 2)}px`;
    canvas.style.top = `${Math.floor((window.innerHeight - L.device.cssH) / 2)}px`;
    this.app.stage.scale.set(L.scale);
    this.app.stage.hitArea = { contains: () => true };
    if (this.current === 'throne') this.goThrone();
    else this.enter(this.current);
  }

  private showReadOnly(): void {
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = '<div class="box"><h2>OPEN ELSEWHERE</h2><p>Overlord is already open in another tab. Close it, then reload here.</p><button>Reload</button></div>';
    el.querySelector('button')!.addEventListener('click', () => location.reload());
    document.body.appendChild(el);
  }
}
