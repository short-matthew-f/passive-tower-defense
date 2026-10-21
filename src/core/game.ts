// The Game: owns the save, the clock, offline accounting, Tribute, Infamy/Falls and scene switching.
import { Application, Container } from 'pixi.js';
import type { DeptCtx, DeptDef, DeptScene, SayOpts, UpgradeGroup, VoiceSource } from './dept';
import { deptSetting, migrateDeptSettings, setDeptSetting } from './settings';
import {
  coreMult,
  commendationReward,
  idleEarnAllowed,
  offlineSecondsFor,
  dreadPayout,
  infamy,
  MAX_ELAPSED,
  offlineCapSeconds,
  offlineFactor,
  rank,
  safeIdleRate,
  tributeCapSeconds,
  tributeRate,
  updateLateRecruit,
} from './economy';
import { computeLayout, type Layout } from './layout';
import { acquireWriterLock, loadSave, repairClock, requestPersistence, writeMirror, writeSave } from './save';
import { DEPT_ORDER, newSave, type DeptId, type DeptSave, type SaveRoot } from './types';
import { SEAL_COST, SEAL_DREAD } from './meta';
import {
  econGateMult,
  headStartLevel,
  hasSignature,
  legendsBane,
  ritualBonus,
  stewardOn,
  stewardShare,
  stewardSpend,
} from './perks';
import { absenceGreeting, classify, PRIORITY_RANK } from './director';
import {
  activeGoodsStep,
  addGoods,
  buyImport,
  buyMarket,
  EXPORT_OF,
  GOODS,
  importsOf,
  lineOpen,
  marketDay,
  newActiveTrack,
  offlineGoods,
  passivePerH,
  type ActiveGoodsTrack,
  type GoodId,
  type ImportNode,
} from './goods';
import { DeptHud, HUD_H } from '../ui/hud';
import { ManagerDirector, pickLine } from '../ui/manager';
import { UpgradeSheet } from '../ui/sheet';
import { FloatLayer } from '../ui/floats';
import { showFallCard } from '../scenes/fall';
import { showReport, type ReportLine } from '../scenes/report';
import { ThroneScene } from '../scenes/throne';
import { haptic } from './haptics';
import { formatNum } from './format';
import { goodsGroup } from '../ui/goods';
import { maybeExportNag, maybeShowA2hs } from '../scenes/install';
import { destroyTree } from '../ui/destroy';

const AUTOSAVE_MS = 10_000;
export const IDLE_INPUT_MS = 10 * 60_000;
/** Longest wall-clock gap between two visible frames credited by the 1 Hz economy; longer gaps
 * (stalls, throttled windows) go through applyOffline instead (00 §7). */
export const MAX_FRAME_GAP_S = 5;

/** Hooks of an open modal (core/game.ts trackModal): `dispose` releases what the modal holds
 * outside its display tree (ticker callbacks); `reopen` rebuilds it for a new layout; `keep`
 * leaves it untouched on resize. */
export interface ModalHooks {
  dispose?: () => void;
  reopen?: () => void;
  keep?: () => boolean;
}

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
  private manager: ManagerDirector;
  ctx: DeptCtx | null = null;
  private econAcc = 0;
  private lastSave = 0;
  /** Last touch anywhere (ms epoch): idle-input rule (00 §7), ghost-finger repeat, ambient lines. */
  lastInputAt = Date.now();
  private stewardAcc = 0;
  private hiddenAt: number | null = null;
  /** Present but no input (00 §7): start of the idle span (ms epoch; = lastSeen, frozen) and the
   * department on screen then. Settled by the next input or carried through a hide. */
  idleSince: number | null = null;
  private idleDept: DeptId | null = null;
  /** performance.now() of the previous frame: economy time follows the wall clock (C-12). */
  private lastFrameAt = 0;
  /** Errors already logged once per guarded call site (a broken department logs once, not 60/s). */
  private logged = new Set<string>();
  private modalHooks = new Map<Container, ModalHooks>();
  /** On-screen active Goods (core/goods.ts): the export counter's last value and token bucket. */
  private goodsTrack: Partial<Record<DeptId, ActiveGoodsTrack>> = {};
  readOnly = false;

  constructor(app: Application, layout: Layout) {
    this.app = app;
    this.layout = layout;
    this.floatLayer = new FloatLayer();
    this.manager = new ManagerDirector(this);
    this.managerLayer.addChild(this.manager);
    // The manager's guidance overlay (highlight, ghost finger, caption) sits above the modal layer so
    // a beat can point inside the open upgrade sheet.
    app.stage.addChild(this.sceneLayer, this.hudLayer, this.floatLayer, this.managerLayer, this.modalLayer, this.manager.guide);
    app.stage.eventMode = 'static';
    // DOM capture: sees every touch, even ones a Pixi button stops (the manager strip is
    // pass-through and collapses when touched; 00 §5.4.5).
    (app.canvas as HTMLCanvasElement).addEventListener(
      'pointerdown',
      (e) => {
        this.lastInputAt = Date.now();
        if (this.idleSince !== null) this.guard('idle', () => this.settleIdle(this.lastInputAt));
        const c = (app.canvas as HTMLCanvasElement).getBoundingClientRect();
        const k = this.layout.device.cssW / this.layout.w;
        this.manager.onPointer((e.clientX - c.left) / k, (e.clientY - c.top) / k);
      },
      { capture: true },
    );
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
    this.migrateSettings();
    if (!this.save.depts.cauldron && this.defs.cauldron) this.unlock('cauldron', now);
    const elapsed = this.clampElapsed(now);
    const live = this.save.idleLive;
    delete this.save.idleLive;
    this.save.lastSeen = now;
    this.guard('clock', () => repairClock(this.save, now, this.marketDay(now)));
    this.goThrone();
    // Boot never bricks on one department's hook (C-04): the offline credit, the report and the
    // nag are each guarded; per-department work inside them is guarded again.
    if (elapsed >= 60) this.guard('boot.offline', () => this.applyOffline(elapsed, now, live));
    else this.guard('boot.nag', () => maybeExportNag(this));
    this.lastSave = now;
    this.lastFrameAt = performance.now();
    this.app.ticker.add((t) => this.frame(t.deltaMS / 1000));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.persistSync());
    if (this.readOnly) this.showReadOnly();
  }

  /** Runs `fn`; a throw is logged once per `key` and swallowed. Returns undefined on a throw. */
  guard<T>(key: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      this.logOnce(key, err);
      return undefined;
    }
  }

  private logOnce(key: string, err: unknown): void {
    if (this.logged.has(key)) return;
    this.logged.add(key);
    console.error(`[overlord] ${key}:`, err);
  }

  /** Per-department settings that older saves kept in `persistent` (DeptSettingDef.legacy). */
  private migrateSettings(): void {
    try {
      migrateDeptSettings(this.save, this.defs);
    } catch (err) {
      console.error(err);
    }
  }

  // ---------- clock and offline ----------

  private clampElapsed(now: number): number {
    const last = this.save.lastSeen || now;
    if (now < last) return 0; // clock went backwards: no penalty, no credit
    return Math.min(MAX_ELAPSED, (now - last) / 1000);
  }

  private onVisibility(): void {
    // A read-only tab never writes and never credits (C-01): its snapshot is stale.
    if (this.readOnly) return;
    const now = Date.now();
    if (document.visibilityState === 'hidden') {
      if (this.hiddenAt !== null) return;
      // Present-but-idle carries through the hide: lastSeen stays at the idle start so the idle
      // span and the hidden span share one cap (00 §7); idleLive records what was paid live.
      this.syncClock(now);
      this.hiddenAt = now;
      this.idleSince = null;
      this.idleDept = null;
      this.persistSync();
      void writeSave(this.save, now);
    } else if (this.hiddenAt !== null) {
      if (now < this.save.lastSeen) this.guard('clock', () => repairClock(this.save, now, this.marketDay(now)));
      const elapsed = this.clampElapsed(now);
      const live = this.save.idleLive;
      delete this.save.idleLive;
      this.hiddenAt = null;
      this.save.lastSeen = now;
      this.lastInputAt = now;
      this.lastFrameAt = performance.now();
      if (elapsed >= 5) this.guard('offline', () => this.applyOffline(elapsed, now, live));
    }
  }

  /** Brings lastSeen (and idleLive) up to date before a write: `now` normally, the idle start
   * while present-but-idle. */
  private syncClock(now: number): void {
    const s = this.save;
    // While hidden, lastSeen (and a carried idleLive) stay as the hide left them: the whole hidden
    // span is credited on return, or on the next boot if the page is discarded.
    if (this.hiddenAt !== null) return;
    if (this.idleSince !== null) {
      s.lastSeen = this.idleSince;
      if (this.idleDept) s.idleLive = { id: this.idleDept, seconds: Math.min(offlineCapSeconds(s), Math.max(0, (now - this.idleSince) / 1000)) };
      else delete s.idleLive;
    } else {
      s.lastSeen = now;
      delete s.idleLive;
    }
  }

  /** The first input after a present-but-idle span: credit it once as offline time (caps,
   * factor, Goods, report), skipping what the on-screen department already earned live. */
  private settleIdle(now: number): void {
    const since = this.idleSince;
    if (since === null) return;
    const dept = this.idleDept;
    this.idleSince = null;
    this.idleDept = null;
    delete this.save.idleLive;
    this.save.lastSeen = now;
    const elapsed = Math.max(0, Math.min(MAX_ELAPSED, (now - since) / 1000));
    if (elapsed >= 1) this.applyOffline(elapsed, now, dept ? { id: dept, seconds: elapsed } : undefined);
    this.saveSoon();
  }

  /** Credits offline income for every unlocked department plus Tribute, then shows Gobbo's report.
   * `live`: seconds of this span already paid on screen to one department (present-but-idle,
   * 00 §7); that department's local credit uses only what is left of the cap. */
  applyOffline(elapsed: number, now: number, live?: { id: DeptId; seconds: number }): void {
    if (this.readOnly) return;
    const s = this.save;
    const cap = offlineCapSeconds(s);
    const lines: ReportLine[] = [];
    const greet = absenceGreeting(elapsed);
    let tribute = 0;
    for (const id of this.built) {
      const d = s.depts[id];
      if (!d) continue;
      const def = this.defs[id];
      // One department's broken hook skips only that department (C-04).
      this.guard(`offline.${id}`, () => {
        const t = offlineSecondsFor(elapsed, cap, live?.id === id ? live.seconds : 0);
        const factor = offlineFactor(s, id); // + Iron Discipline here, <= 0.9
        const rate = safeIdleRate(def, d) * coreMult(s, id, this.defs, now);
        const amount = rate * factor * t;
        this.credit(d, amount, econGateMult(s, id));
        // Department offline extras (Mines Gems ...): gentle, a throwing hook skips only itself.
        if (def.onOffline && t > 0) {
          try {
            def.onOffline(d, t, factor, { now, capSeconds: cap });
          } catch (err) {
            console.error(err);
          }
        }
        const tr = tributeRate(s, id, this.defs, false) * factor * Math.min(elapsed, tributeCapSeconds(s));
        if (Number.isFinite(tr)) tribute += tr;
      // Return ritual (00 §5.3): the haul waits for the first entry after this absence.
      if (elapsed >= 60 && amount > 0) d.haul = (d.haul ?? 0) + amount;
      const steward = stewardOn(s, id) ? this.stewardPass(id, stewardShare(s) * amount) : [];
      // Report flavour line (00 §5.4.7): a carried high-priority line, else the long-absence
      // greeting (which replaces the greeting on entry: no double greeting, R4-14), else the pool.
      let flavor: string | null = null;
      if (d.reportCarry) flavor = d.reportCarry;
      else if (greet) flavor = (greet === 2 ? pickLine(def, 'returnLong3d') : null) ?? pickLine(def, 'returnLong');
      if (!flavor) flavor = pickLine(def, 'report');
      delete d.reportCarry;
      if (greet) d.seen['mgr.greet'] = greet;
      const inf = this.guard(`infamy.${id}`, () => infamy(def, d).value) ?? 0;
      lines.push({ id, def, amount, legend: d.cycle.legendWaiting, infamy: inf, flavor, ready: this.readyBuys(id), steward });
      });
    }
    this.addTribute(tribute);
    const goods = this.guard('offline.goods', () => offlineGoods(s, this.defs, elapsed)) ?? {};
    for (const [g, amt] of Object.entries(goods)) if (Number.isFinite(amt)) addGoods(s, g as GoodId, amt);
    if (elapsed >= 60) {
      this.guard('report', () => showReport(this, { elapsed, capped: elapsed > cap, cap, lines, tribute, goods }, () => maybeExportNag(this)));
      // The first manager with a report line speaks it in their own voice.
      const first = lines.find((l) => l.flavor);
      if (first?.flavor) this.voice(first.def, first.flavor, 'report', 'report');
    }
    this.checkProgress(now);
  }

  /** Steward (Satchel L2-L3): adds `allowance` to the department's pool and spends what the
   * ranking, the pool and the reserve allow. Returns what it bought. */
  private stewardPass(id: DeptId, allowance: number): string[] {
    const s = this.save;
    const d = s.depts[id];
    const def = this.defs[id];
    if (!d || !def?.stewardCandidates) return [];
    const st = (s.meta.steward[id] ??= { on: true, reserve: 0, pool: 0 });
    st.pool = Math.min(d.run.bank, (st.pool || 0) + Math.max(0, allowance));
    const floor = Math.max(0, Math.min(0.9, st.reserve || 0)) * d.run.bank;
    try {
      const r = stewardSpend(d, () => def.stewardCandidates!(d), st.pool, floor);
      st.pool = Math.max(0, st.pool - r.spent);
      return r.bought;
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  /** "Ready" buys for the Satchel list and the Throne door pip: affordable now (00 §5.2). */
  readyBuys(id: DeptId): { label: string; cost: number }[] {
    const d = this.save.depts[id];
    const def = this.defs[id];
    if (!d || !def) return [];
    try {
      const list = def.readyBuys ? def.readyBuys(d) : (def.stewardCandidates?.(d) ?? []).map((c) => ({ label: c.label ?? c.id, cost: c.cost }));
      return list.filter((b) => Number.isFinite(b.cost) && b.cost <= d.run.bank + 1e-9);
    } catch {
      return [];
    }
  }

  // ---------- currency ----------

  /** Adds local income to the bank and the economy gate. `gate` scales only what the gate counts
   * (Fear Itself, perks.econGateMult). */
  credit(d: DeptSave, amount: number, gate = 1): void {
    if (!(amount > 0) || !Number.isFinite(amount)) return;
    if (!Number.isFinite(gate)) gate = 1;
    d.run.bank += amount;
    d.cycle.earnings += amount * gate;
  }

  addTribute(amount: number): void {
    if (!(amount > 0) || !Number.isFinite(amount)) return;
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
    // Economy time follows the wall clock, not the clamped frame dt (C-12): a long frame still
    // credits its seconds. Gaps up to MAX_FRAME_GAP_S feed the 1 Hz economy; longer visible gaps
    // (stalls, throttled windows) are credited once like an absence. Hidden spans never reach here
    // (onVisibility resets the clock on return).
    const pnow = performance.now();
    const gap = this.lastFrameAt > 0 ? Math.max(0, (pnow - this.lastFrameAt) / 1000) : dt;
    this.lastFrameAt = pnow;
    if (!this.readOnly && this.hiddenAt === null) {
      if (gap > MAX_FRAME_GAP_S && this.idleSince === null) {
        this.econAcc = 0;
        const elapsed = Math.min(MAX_ELAPSED, gap);
        this.save.lastSeen = now;
        this.guard('offline', () => this.applyOffline(elapsed, now));
      } else {
        this.econAcc += Math.min(gap, MAX_FRAME_GAP_S);
        while (this.econAcc >= 1) {
          this.econAcc -= 1;
          this.guard('econTick', () => this.econTick(now));
        }
      }
    }
    try {
      this.scene?.update(dt);
    } catch (err) {
      this.recover(err);
      return;
    }
    // One part throwing never stops the ticker (Pixi schedules no further frame after a throw).
    this.guard('hud', () => this.hud?.update());
    this.guard('manager', () => this.manager.update(dt));
    this.guard('floats', () => this.floatLayer.update(dt));
    if (!this.readOnly && now - this.lastSave > AUTOSAVE_MS) {
      this.lastSave = now;
      this.syncClock(now);
      void writeSave(this.save, now);
    }
  }

  /** 1 Hz: background departments accrue closed-form idle income; Tribute accrues; Infamy updates.
   * Present but no input for 10 min (00 §7): accounting freezes at the idle start; the span is
   * credited once as offline time (caps, factor) on the next input or carried through a hide. */
  private econTick(now: number): void {
    const s = this.save;
    // A clock that jumped back (corrected) leaves future epochs behind: repair them (C-06).
    if (now + 2000 < s.lastSeen) {
      this.guard('clock', () => repairClock(s, now, this.marketDay(now)));
      s.lastSeen = now;
      if (this.idleSince !== null && this.idleSince > now) this.idleSince = now;
    }
    if (this.idleSince === null && now - this.lastInputAt > IDLE_INPUT_MS) {
      this.idleSince = s.lastSeen;
      this.idleDept = this.current === 'throne' ? null : this.current;
    }
    if (this.idleSince !== null) {
      this.guard('progress', () => this.checkProgress(now));
      return;
    }
    let tribute = 0;
    const share = stewardShare(s);
    const stewardNow = share > 0 && ++this.stewardAcc >= 5;
    if (stewardNow) this.stewardAcc = 0;
    for (const id of this.built) {
      const d = s.depts[id];
      if (!d) continue;
      const def = this.defs[id];
      // Per department: one broken hook (idleRate, Goods step) skips only that department (C-04).
      this.guard(`econ.${id}`, () => {
        const onScreen = this.current === id;
        if (!onScreen) {
          const amount = safeIdleRate(def, d) * coreMult(s, id, this.defs, now);
          this.credit(d, amount, econGateMult(s, id));
          // Steward: off-screen departments only; the allowance accrues every tick, spends every 5 s.
          if (stewardOn(s, id) && Number.isFinite(amount)) {
            const st = (s.meta.steward[id] ??= { on: true, reserve: 0, pool: 0 });
            st.pool = (st.pool || 0) + share * amount;
            if (stewardNow) this.stewardPass(id, 0);
          }
        }
        const tr = tributeRate(s, id, this.defs, onScreen);
        if (Number.isFinite(tr)) tribute += tr;
        // Goods (00 §4, §7): the passive rate everywhere; the active bonus while played on screen.
        const good = EXPORT_OF[id];
        const passive = passivePerH(s, id, this.defs) / 3600;
        if (Number.isFinite(passive)) addGoods(s, good, passive);
        if (onScreen) {
          const tr2 = (this.goodsTrack[id] ??= newActiveTrack());
          const step = activeGoodsStep(def, d, tr2, 1);
          if (Number.isFinite(step)) addGoods(s, good, step);
        }
      });
    }
    this.addTribute(tribute);
    s.lastSeen = now;
    this.guard('progress', () => this.checkProgress(now));
  }

  /** Infamy thresholds, peak rank, commendations. Each department, and each commendation test,
   * is guarded on its own: a throwing test (an old save shape) skips only itself (C-04). */
  checkProgress(_now: number): void {
    const s = this.save;
    for (const id of this.built) {
      const d = s.depts[id];
      if (!d) continue;
      const def = this.defs[id];
      this.guard(`progress.${id}`, () => {
        if (!Number.isFinite(d.lifetime.peakRank)) d.lifetime.peakRank = 0;
        d.lifetime.peakRank = Math.max(d.lifetime.peakRank, rank(s, id, this.defs));
        updateLateRecruit(s, id, this.defs);
        const inf = infamy(def, d).value;
        if (inf >= 50 && !d.seen[`inf50.${d.cycle.n}`]) {
          d.seen[`inf50.${d.cycle.n}`] = 1;
          if (this.current === id) this.managerSay(id, 'infamy50', { type: 'infamy_50' });
        }
        if (inf >= 100 && !d.cycle.legendWaiting) {
          d.cycle.legendWaiting = true;
          // Off screen, the director carries it to the next report (00 §5.4.7).
          this.managerSay(id, 'legend', { type: 'legend_arrives' });
        }
      });
      const mask = s.meta.commendations[id] ?? 0;
      def.commendations.forEach((c, i) => {
        if (mask & (1 << i)) return;
        if (this.guard(`commend.${id}.${i}`, () => !!c.test(d))) {
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
      pendingTips: [],
    };
  }

  /** Cycle-start wing perks: Head Start, then the Signature (00 §2.5). Gentle: a throwing hook
   * never blocks the Fall. */
  applyCyclePerks(id: DeptId): void {
    const def = this.defs[id];
    const d = this.save.depts[id];
    if (!def || !d) return;
    try {
      const hs = headStartLevel(this.save, id);
      if (hs > 0) def.applyHeadStart?.(d, hs);
      if (hasSignature(this.save, id)) def.signature?.apply(d);
    } catch (err) {
      console.error(err);
    }
  }

  // ---------- Goods ----------

  /** Buys the next level of an import node with Goods (the Armory or the department's sheet). */
  buyImportNode(node: ImportNode): boolean {
    if (this.readOnly || !buyImport(this.save, node)) return false;
    const d = this.save.depts[node.dept]!;
    if (!d.seen[`goodsNode.${node.key}`]) {
      d.seen[`goodsNode.${node.key}`] = 1;
      d.seen[`goods.${node.key}`] = 1;
      this.managerSay(node.dept, 'goodsLink', { type: 'goods_link', key: `node.${node.key}`, vars: { good: GOODS[node.good].name.toUpperCase() } });
    }
    this.onImportsChanged(node.dept);
    this.saveSoon();
    return true;
  }

  /** Black Market: a bundle of Goods for Tribute at today's price. */
  buyGoods(g: GoodId, qty?: number): boolean {
    if (this.readOnly || !buyMarket(this.save, g, this.marketDay(), qty)) return false;
    this.saveSoon();
    return true;
  }

  marketDay(now = Date.now()): number {
    return marketDay(now, new Date(now).getTimezoneOffset());
  }

  /** Lets the open department re-read import-driven state (flask width, crew, ladle charges). */
  private onImportsChanged(id: DeptId): void {
    if (this.current !== id || !this.scene || this.scene instanceof ThroneScene) return;
    try {
      this.scene.onImports?.();
    } catch (err) {
      console.error(err);
    }
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
    // The director knows the department before the scene is built, so a lesson fired from the
    // scene's constructor is queued, not dropped.
    this.manager.begin(def, d);
    let scene: DeptScene;
    try {
      scene = def.createScene(ctx);
    } catch (err) {
      // A throwing constructor drops back to the Throne Room instead of a blank scene (P-02).
      this.recover(err);
      return;
    }
    this.scene = scene;
    this.sceneLayer.addChild(scene.root);
    this.goodsTrack[id] = newActiveTrack();
    this.manager.attach(def, d, scene);
    const greet = d.seen['mgr.greet'];
    delete d.seen['mgr.greet'];
    if (!d.seen.intro) {
      d.seen.intro = 1;
      this.managerSay(id, 'intro', { milestone: true });
    } else if (d.cycle.n > 0 && !d.seen[`returnFall.${d.cycle.n}`]) {
      d.seen[`returnFall.${d.cycle.n}`] = 1;
      this.managerSay(id, 'returnFall', { type: 'return_after_fall' });
    } else if (greet) {
      // The report already carried the long-absence greeting: just a wave (R4-14).
      this.manager.wave();
    } else if (d.cycle.legendWaiting) {
      this.managerSay(id, 'legend', { milestone: true });
    }
    // goods_link (00 §5.4.3): an import line has opened since the last visit.
    const opened = importsOf(id).find((n) => lineOpen(this.save, n) && !d.seen[`goods.${n.key}`]);
    if (opened) {
      for (const n of importsOf(id)) if (lineOpen(this.save, n)) d.seen[`goods.${n.key}`] = 1;
      this.managerSay(id, 'goodsLink', { type: 'goods_link', key: `line.${opened.key}`, vars: { good: GOODS[opened.good].name.toUpperCase() } });
    }
    this.startRitual(id, scene);
  }

  /** A DeptSettingDef action from Settings: open the department (if needed) and hand it over. */
  runSettingAction(id: DeptId, key: string): void {
    if (!this.defs[id] || !this.save.depts[id]) return;
    if (this.current !== id) this.enter(id);
    const scene = this.scene;
    if (!scene || scene instanceof ThroneScene) return;
    try {
      scene.onSettingAction?.(key);
    } catch (err) {
      console.error(err);
    }
  }

  /** Return ritual (00 §5.3): once, on the first entry after an absence, if the scene has one and
   * no onboarding is running. Collect All already paid the base haul; this adds up to +5%. */
  private startRitual(id: DeptId, scene: DeptScene): void {
    const d = this.save.depts[id];
    if (!d || !(d.haul && d.haul > 0)) return;
    const haul = d.haul;
    delete d.haul;
    if (!scene.returnRitual || this.manager.busy || this.readOnly) return;
    let p: Promise<number>;
    try {
      p = scene.returnRitual(haul);
    } catch (err) {
      console.error(err);
      return;
    }
    Promise.resolve(p)
      .then((score) => {
        const bonus = ritualBonus(haul, score);
        // Only while the same scene is still open (a closed ritual forfeits nothing but the bonus).
        if (bonus > 0 && this.scene === scene) {
          this.credit(d, bonus, econGateMult(this.save, id));
          this.toast(`RITUAL BONUS +${formatNum(bonus, this.save.meta.settings.notation)} ${this.defs[id].currency.toUpperCase()}`);
          this.saveSoon();
        }
      })
      .catch((err) => console.error(err));
  }

  // ---------- modals ----------

  /** Registers an open modal's hooks. `dispose` runs exactly once, however the modal goes away
   * (teardown, a sheet replacing it, its own close), so ticker callbacks never outlive it (C-03). */
  trackModal(root: Container, hooks: ModalHooks): void {
    let done = false;
    const wrapped: ModalHooks = {
      ...hooks,
      dispose: () => {
        if (done) return;
        done = true;
        this.modalHooks.delete(root);
        if (hooks.dispose) this.guard('modal.dispose', hooks.dispose);
      },
    };
    this.modalHooks.set(root, wrapped);
    root.once('destroyed', () => wrapped.dispose!());
  }

  /** Disposes and destroys one modal-layer child. */
  private closeModal(c: Container): void {
    this.modalHooks.get(c)?.dispose?.();
    if (!c.destroyed) {
      c.parent?.removeChild(c);
      destroyTree(c);
    }
  }

  /** Closes every modal and returns the reopen hooks of those that have one (resize). With
   * `keep`, modals whose keep() is true stay open untouched. */
  private closeModals(keep = false): (() => void)[] {
    const reopen: (() => void)[] = [];
    for (const c of [...this.modalLayer.children]) {
      const h = this.modalHooks.get(c);
      if (keep && h?.keep && this.guard('modal.keep', h.keep)) continue;
      if (h?.reopen) reopen.push(h.reopen);
      this.closeModal(c);
    }
    return reopen;
  }

  private teardown(): void {
    this.manager.clear();
    this.closeModals();
    if (this.scene) {
      if ('destroy' in this.scene) this.scene.destroy();
      this.scene = null;
    }
    this.sceneLayer.removeChildren();
    if (this.hud) {
      destroyTree(this.hud);
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
        const now = Date.now();
        let amount = base * coreMult(game.save, def.id, game.defs, now);
        // Present but no input (00 §7): the on-screen department earns at the offline factor, and
        // only inside the offline cap counted from the idle start; the settlement skips it there.
        if (game.idleSince !== null) {
          amount = idleEarnAllowed(game.idleSince, now, offlineCapSeconds(game.save)) ? amount * offlineFactor(game.save, def.id) : 0;
        }
        if (!Number.isFinite(amount)) return 0;
        game.credit(d, amount, econGateMult(game.save, def.id));
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
          game.managerSay(def.id, 'firstUpgrade', { type: 'first_upgrade' }); // skipped via coreSkip
        }
        if (amount > d.run.bank * 0.1) game.saveSoon();
        return true;
      },
      raiseSkill(level: number) {
        if (level > d.cycle.heldLevel) d.cycle.heldLevel = level;
      },
      say(trigger, opts) {
        game.managerSay(def.id, trigger, opts, 'dept');
      },
      lesson(id, beats) {
        return game.current === def.id && game.manager.lesson(def, d, id, beats);
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
      setting<T = unknown>(key: string): T {
        return deptSetting<T>(game.save, def, key);
      },
      setSetting(key: string, value: unknown) {
        setDeptSetting(game.save, def.id, key, value);
        game.saveSoon();
      },
      leftHanded() {
        return !!game.save.meta.settings.leftHanded;
      },
    };
  }

  openSheet(def: DeptDef, groups: UpgradeGroup[]): void {
    const d = this.save.depts[def.id];
    const goods = goodsGroup(this, def.id);
    this.openCustomSheet(
      'UPGRADES',
      () => ({
        text: `${formatNum(d?.run.bank ?? 0, this.save.meta.settings.notation)} ${def.currency}`,
        color: def.currencyColor,
      }),
      goods ? [...groups, goods] : groups,
      () => this.save.depts[def.id]?.run.bank ?? 0,
    );
  }

  /** `wallet`: the funds bank-priced rows spend (x10 / MAX affordability); omit for none. */
  /** `reopen`: how to rebuild this sheet after a resize (default: the same arguments, right when
   * the groups' closures outlive the scene, as a department's do under DeptScene.resize). */
  openCustomSheet(title: string, bank: () => { text: string; color: string }, groups: UpgradeGroup[], wallet?: () => number, reopen?: () => void): void {
    this.closeModals();
    const sheet = new UpgradeSheet(this, title, bank, groups, () => destroyTree(sheet), wallet);
    this.trackModal(sheet, { reopen: reopen ?? (() => this.openCustomSheet(title, bank, groups, wallet)) });
    this.modalLayer.addChild(sheet);
  }

  /** The Throne Room, while it is the open scene. */
  get throne(): ThroneScene | null {
    return this.scene instanceof ThroneScene ? this.scene : null;
  }

  /** The open upgrade sheet, if any (onboarding highlights inside it). */
  get sheet(): UpgradeSheet | null {
    for (const c of this.modalLayer.children) if (c instanceof UpgradeSheet && !c.destroyed) return c;
    return null;
  }

  /** Plays a manager's voice blips for a line (ManagerDef.voice). Never throws. */
  voice(def: DeptDef, text: string | null, key: string, source: VoiceSource): void {
    const st = this.save.meta.settings;
    const vol = st.sfx ?? 0.6;
    if (!text || !def.manager.voice || !(vol > 0)) return;
    if ((source === 'report' || source === 'fall') && st.chatter === 'off') return;
    try {
      def.manager.voice(text, { key, source, vol, game: this });
    } catch (err) {
      console.error(err);
    }
  }

  /** Routes a manager line to the director. Off screen, a high-priority typed line (legend_arrives,
   * infamy_100, mechanic_unlocked) is kept for the next Gobbo report instead (00 §5.4.7). */
  managerSay(id: DeptId, trigger: string, opts?: SayOpts, source: VoiceSource = 'core'): void {
    const def = this.defs[id];
    if (!def) return;
    // A department may handle a core-fired line itself (ManagerDef.coreSkip).
    if (source === 'core' && def.manager.coreSkip?.includes(trigger)) return;
    if (this.current !== id) {
      const d = this.save.depts[id];
      const cls = classify(trigger, opts);
      if (d && opts?.type && PRIORITY_RANK[cls.rule.priority] === PRIORITY_RANK.high) {
        const text = pickLine(def, trigger, opts.vars);
        if (text) d.reportCarry = text;
      }
      return;
    }
    this.manager.say(def, trigger, opts, source);
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
    // iOS: suggest Add to Home Screen once, before the first Fall (00 §9).
    if (maybeShowA2hs(this, () => this.startFall(id))) return;
    showFallCard(this, def, d, inf, (crush) => this.completeFall(id, inf, crush));
    this.voice(def, pickLine(def, 'fall'), 'fall', 'fall');
  }

  private completeFall(id: DeptId, inf: number, crush: number): void {
    const def = this.defs[id];
    const d = this.save.depts[id];
    if (!def || !d) return;
    const dread = dreadPayout(d, inf, crush, legendsBane(this.save, id));
    this.save.meta.dread += dread;
    this.save.meta.dreadLifetime += dread;
    this.save.meta.trophies.push({ dept: id, name: def.legend.name, at: Date.now() });
    d.lifetime.falls += 1;
    d.run = def.defaultRun() as DeptSave['run'];
    d.cycle = { n: d.cycle.n + 1, startedAt: Date.now(), earnings: 0, heldLevel: 0, legendWaiting: false };
    // A ritual bonus earned on the old cycle's haul must not land in the new cycle's economy gate.
    delete d.haul;
    this.applyCyclePerks(id);
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
    const now = Date.now();
    this.syncClock(now);
    writeMirror(this.save, now);
  }

  replaceSave(s: SaveRoot): void {
    this.save = s;
    this.migrateSettings();
    this.idleSince = null;
    this.idleDept = null;
    delete this.save.idleLive;
    const now = Date.now();
    this.save.lastSeen = now;
    this.guard('clock', () => repairClock(this.save, now, this.marketDay(now)));
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
    // Re-lay out instead of rebuilding (C-11): open modals (report, A2HS, Fall card, sheet) are
    // closed and re-opened for the new layout with their continuations; a modal that must not be
    // interrupted (a running Last Stand) stays as it is.
    const reopen = this.closeModals(true);
    const id = this.current;
    const scene = this.scene;
    let relaid = false;
    if (id !== 'throne' && scene && !(scene instanceof ThroneScene) && this.defs[id] && this.save.depts[id]) {
      try {
        scene.resize(L);
        if (this.hud) {
          destroyTree(this.hud);
          this.hud = null;
        }
        this.hud = new DeptHud(this, this.defs[id], this.save.depts[id]!);
        this.hudLayer.addChild(this.hud);
        relaid = true;
      } catch (err) {
        this.logOnce(`resize.${id}`, err);
      }
    }
    if (!relaid) {
      // Kept modals (a Last Stand) would lose their scene with a rebuild: close them too (a Last
      // Stand falls back to the Crush bar) and re-open what can be re-opened.
      reopen.push(...this.closeModals());
      if (id === 'throne') this.goThrone();
      else this.enter(id);
    }
    for (const r of reopen) this.guard('modal.reopen', r);
  }

  /** A department threw during its update: save, drop back to the Throne Room, and say so. */
  private recovering = false;
  recover(err: unknown): void {
    console.error(err);
    if (this.recovering) return;
    this.recovering = true;
    const where = this.current;
    try {
      this.persistSync();
      this.goThrone();
      this.toast(`THE ${String(where).toUpperCase()} MINIONS TRIPPED. YOUR PROGRESS IS SAFE. (${String((err as Error)?.message ?? err).slice(0, 60)})`);
    } finally {
      this.recovering = false;
    }
  }

  private showReadOnly(): void {
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = '<div class="box"><h2>OPEN ELSEWHERE</h2><p>Overlord is already open in another tab. Close it, then reload here.</p><button>Reload</button></div>';
    el.querySelector('button')!.addEventListener('click', () => location.reload());
    document.body.appendChild(el);
  }
}
