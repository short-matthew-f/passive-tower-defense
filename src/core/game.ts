// The Game: owns the save, the clock, offline accounting, Tribute, Infamy/Falls and scene switching.
import { Application, Container } from 'pixi.js';
import type { DeptCtx, DeptDef, DeptScene, SayOpts, UpgradeGroup } from './dept';
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
  private manager: ManagerDirector;
  ctx: DeptCtx | null = null;
  private econAcc = 0;
  private lastSave = 0;
  /** Last touch anywhere (ms epoch): idle-input rule (00 §7), ghost-finger repeat, ambient lines. */
  lastInputAt = Date.now();
  private stewardAcc = 0;
  private hiddenAt: number | null = null;
  /** On-screen active Goods (core/goods.ts): the export counter's last value and token bucket. */
  private goodsTrack: Partial<Record<DeptId, ActiveGoodsTrack>> = {};
  readOnly = false;

  constructor(app: Application, layout: Layout) {
    this.app = app;
    this.layout = layout;
    this.floatLayer = new FloatLayer();
    this.manager = new ManagerDirector(this);
    this.managerLayer.addChild(this.manager);
    app.stage.addChild(this.sceneLayer, this.hudLayer, this.floatLayer, this.managerLayer, this.modalLayer);
    app.stage.eventMode = 'static';
    // DOM capture: sees every touch, even ones a Pixi button stops (the manager strip is
    // pass-through and collapses when touched; 00 §5.4.5).
    (app.canvas as HTMLCanvasElement).addEventListener(
      'pointerdown',
      (e) => {
        this.lastInputAt = Date.now();
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
    if (!this.save.depts.cauldron && this.defs.cauldron) this.unlock('cauldron', now);
    const elapsed = this.clampElapsed(now);
    this.save.lastSeen = now;
    this.goThrone();
    if (elapsed >= 60) this.applyOffline(elapsed, now);
    else maybeExportNag(this);
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
      this.lastInputAt = now;
      if (elapsed >= 5) this.applyOffline(elapsed, now);
    }
  }

  /** Credits offline income for every unlocked department plus Tribute, then shows Gobbo's report. */
  applyOffline(elapsed: number, now: number): void {
    if (this.readOnly) return;
    const s = this.save;
    const cap = offlineCapSeconds(s);
    const t = Math.min(elapsed, cap);
    const lines: ReportLine[] = [];
    const greet = absenceGreeting(elapsed);
    let tribute = 0;
    for (const id of this.built) {
      const d = s.depts[id];
      if (!d) continue;
      const def = this.defs[id];
      const factor = offlineFactor(s, id); // + Iron Discipline here, <= 0.9
      const rate = def.idleRate(d) * coreMult(s, id, this.defs, now);
      const amount = rate * factor * t;
      this.credit(d, amount, econGateMult(s, id));
      tribute += tributeRate(s, id, this.defs, false) * factor * Math.min(elapsed, tributeCapSeconds(s));
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
      const inf = infamy(def, d);
      lines.push({ id, def, amount, legend: d.cycle.legendWaiting, infamy: inf.value, flavor, ready: this.readyBuys(id), steward });
    }
    this.addTribute(tribute);
    const goods = offlineGoods(s, this.defs, elapsed);
    for (const [g, amt] of Object.entries(goods)) addGoods(s, g as GoodId, amt);
    if (elapsed >= 60) {
      showReport(this, { elapsed, capped: elapsed > cap, cap, lines, tribute, goods }, () => maybeExportNag(this));
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
    if (!(amount > 0)) return;
    d.run.bank += amount;
    d.cycle.earnings += amount * gate;
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
    try {
      this.scene?.update(dt);
    } catch (err) {
      this.recover(err);
      return;
    }
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
    const idle = now - this.lastInputAt > IDLE_INPUT_MS;
    let tribute = 0;
    const share = stewardShare(s);
    const stewardNow = share > 0 && ++this.stewardAcc >= 5;
    if (stewardNow) this.stewardAcc = 0;
    for (const id of this.built) {
      const d = s.depts[id];
      if (!d) continue;
      const onScreen = this.current === id;
      const def = this.defs[id];
      const factor = idle ? offlineFactor(s, id) : 1;
      if (!onScreen) {
        const amount = def.idleRate(d) * coreMult(s, id, this.defs, now) * factor;
        this.credit(d, amount, econGateMult(s, id));
        // Steward: off-screen departments only; the allowance accrues every tick, spends every 5 s.
        if (stewardOn(s, id)) {
          const st = (s.meta.steward[id] ??= { on: true, reserve: 0, pool: 0 });
          st.pool = (st.pool || 0) + share * amount;
          if (stewardNow) this.stewardPass(id, 0);
        }
      }
      tribute += tributeRate(s, id, this.defs, onScreen && !idle) * factor;
      // Goods (00 §4, §7): the passive rate everywhere; the active bonus while played on screen.
      const good = EXPORT_OF[id];
      addGoods(s, good, passivePerH(s, id, this.defs) / 3600);
      if (onScreen && !idle) {
        const tr = (this.goodsTrack[id] ??= newActiveTrack());
        addGoods(s, good, activeGoodsStep(def, d, tr, 1));
      }
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
        if (this.current === id) this.managerSay(id, 'infamy50', { type: 'infamy_50' });
      }
      if (inf >= 100 && !d.cycle.legendWaiting) {
        d.cycle.legendWaiting = true;
        // Off screen, the director carries it to the next report (00 §5.4.7).
        this.managerSay(id, 'legend', { type: 'legend_arrives' });
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
    const scene = def.createScene(ctx);
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
          game.managerSay(def.id, 'firstUpgrade', { type: 'first_upgrade' });
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
    };
  }

  openSheet(def: DeptDef, groups: UpgradeGroup[]): void {
    const d = this.save.depts[def.id];
    const goods = goodsGroup(this, def.id);
    this.openCustomSheet('UPGRADES', () => ({
      text: `${formatNum(d?.run.bank ?? 0, this.save.meta.settings.notation)} ${def.currency}`,
      color: def.currencyColor,
    }), goods ? [...groups, goods] : groups);
  }

  openCustomSheet(title: string, bank: () => { text: string; color: string }, groups: UpgradeGroup[]): void {
    this.modalLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const sheet = new UpgradeSheet(this, title, bank, groups, () => sheet.destroy({ children: true }));
    this.modalLayer.addChild(sheet);
  }

  /** Routes a manager line to the director. Off screen, a high-priority typed line (legend_arrives,
   * infamy_100, mechanic_unlocked) is kept for the next Gobbo report instead (00 §5.4.7). */
  managerSay(id: DeptId, trigger: string, opts?: SayOpts): void {
    const def = this.defs[id];
    if (!def) return;
    if (this.current !== id) {
      const d = this.save.depts[id];
      const cls = classify(trigger, opts);
      if (d && opts?.type && PRIORITY_RANK[cls.rule.priority] === PRIORITY_RANK.high) {
        const text = pickLine(def, trigger, opts.vars);
        if (text) d.reportCarry = text;
      }
      return;
    }
    this.manager.say(def, trigger, opts);
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
