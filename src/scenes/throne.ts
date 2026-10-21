// The Throne Room hub (specs/00 §5): Tribute and Dread, department doors with Infamy and one
// priority badge (skull for a waiting Legend > "Ready" pip), manager cameos, Throne upgrades
// (Banners, extras, Edicts, Steward, cosmetics), the Dread Altar with per-department wings, and
// the Trophy wall.
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { Game } from '../core/game';
import type { UpgradeEntry, UpgradeGroup } from '../core/dept';
import { BANNER, bannerId, DREAD_PERKS, RUINBORN, ruinbornId, THRONE_UPGRADES, type MetaUpgrade } from '../core/meta';
import {
  activeEdict,
  COSMETICS,
  EDICT_ORDER,
  edictCooldown,
  EDICTS,
  hasCosmetic,
  headStartId,
  LATER_PERKS,
  legendsBaneId,
  RESERVE_STEPS,
  satchelLevel,
  setEdict,
  signatureId,
  THRONE_EXTRAS,
  TROPHY_CAP,
  TROPHY_HALL_ID,
  trophyAdd,
  WING_PERKS,
  type EdictId,
} from '../core/perks';
import { coreMult, infamy, offlineFactor, tributeRate } from '../core/economy';
import { formatNum, formatTime } from '../core/format';
import { DEPT_ORDER, type DeptId } from '../core/types';
import { PixelText, wrap } from '../ui/font';
import { Button, C, drawBar, drawPanel, drawSprite } from '../ui/widgets';
import { openSettings } from './settings';
import { openArmory } from '../ui/goods';
import { destroyTree } from '../ui/destroy';

export const NAMES: Record<DeptId, string> = {
  cauldron: 'CAULDRON',
  mines: 'MINES',
  dungeon: 'DUNGEON',
  bridge: 'BRIDGE',
  styx: 'STYX',
  spire: 'SPIRE',
  pit: 'WAR PIT',
};

const OVERLORD = [
  '..C..........C..',
  '..CC........CC..',
  '...CKKKKKKKKC...',
  '...KhhhRRhhhK...',
  '..KhHHHHHHHHhK..',
  '..KHKKKKKKKKHK..',
  '..KHKGGKKGGKHK..',
  '..KHKKKKKKKKHK..',
  '...KHHHKKHHHK...',
  '.PPPKKKKKKKKPPP.',
  'PPPPPPPPPPPPPPPP',
  'PPPPPPPRRPPPPPPP',
  'PP.PPPPPPPPPP.PP',
  'P..PPPPPPPPPP..P',
  '...PPPP..PPPP...',
  '...KKK....KKK...',
];
const OVERLORD_PAL = { C: '#e8d08a', K: '#0a0410', H: '#5c3a6e', h: '#8a5c9e', R: '#c03a3a', G: '#8fd14f', P: '#3a1a4e' };

const GUARD = [
  '...KK...',
  '..KggK..',
  '..KgwK..',
  '..KggK..',
  '.KRRRRK.',
  'KgRRRRgK',
  'KgRRRRgK',
  '.KRRRRK.',
  '..KRRK..',
  '..K..K..',
  '..K..K..',
  '.KK..KK.',
];
const GUARD_PAL = { K: '#0a0410', g: '#6aa84f', w: '#f8d84a', R: '#5a1a2a' };

interface Door {
  id: DeptId;
  root: Container;
  g: Graphics;
  peek: Graphics;
  label: PixelText;
  status: PixelText;
  x: number;
  y: number;
  w: number;
  h: number;
  peekT: number; // seconds left of a manager cameo
}

export class ThroneScene {
  root = new Container();
  private game: Game;
  private tribute = new PixelText('', C.goldText);
  private tributeRate = new PixelText('', '#9c8aa8');
  private dread = new PixelText('', '#c070e0');
  private doors: Door[] = [];
  private t = 0;
  private redrawAcc = 1;
  private decor = new Graphics();
  private flames = new Graphics();
  private flameSpots: { x: number; y: number }[] = [];
  private decorKey = '';
  private cx: number;
  private ty: number;

  constructor(game: Game) {
    this.game = game;
    const L = game.layout;
    const bg = new Graphics();
    bg.rect(0, 0, L.w, L.h).fill(0x140c1c);
    // Flagstone floor pattern.
    for (let y = 0; y < L.h; y += 8) {
      for (let x = (y / 8) % 2 ? 4 : 0; x < L.w; x += 16) bg.rect(x, y, 15, 7).fill(0x1a1024);
    }
    this.root.addChild(bg);
    this.cx = Math.floor(L.w / 2);
    this.ty = L.safe.t + 28;
    // Carpet, braziers, guards and the throne (cosmetics redraw this layer when bought).
    this.root.addChild(this.decor, this.flames);

    // Top bar (extends under the notch).
    const top = new Graphics();
    top.rect(0, 0, L.w, L.safe.t + 22).fill(0x1c1028);
    top.rect(0, L.safe.t + 22, L.w, 1).fill(C.outline);
    this.root.addChild(top);
    this.tribute.position.set(L.safe.l + 4, L.safe.t + 4);
    this.tributeRate.position.set(L.safe.l + 4, L.safe.t + 13);
    this.root.addChild(this.tribute, this.tributeRate, this.dread);
    const menu = new Button({ w: 30, h: 9, label: 'MENU', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => openSettings(game) });
    menu.position.set(L.w - L.safe.r - 34, L.safe.t + 11);
    menu.hitArea = new Rectangle(-4, -2, 38, 14);
    this.root.addChild(menu);
    this.drawDecor();

    // Department doors: 3 columns x 2 rows, then the War Pit gate.
    const ty = this.ty;
    const bottomBar = L.h - L.safe.b - 26;
    const availH = bottomBar - (ty + 40) - 4;
    const cols = 3;
    const usableW = L.w - L.safe.l - L.safe.r - 8;
    const dw = Math.floor((usableW - (cols - 1) * 4) / cols);
    const pitH = 30;
    const dh = Math.min(84, Math.floor((availH - pitH - 8) / 2));
    // Center the door block in the space between the throne and the tabs.
    const gridTop = ty + 40 + Math.max(0, Math.floor((availH - (2 * dh + pitH + 8)) / 2));
    DEPT_ORDER.forEach((id, i) => {
      let x: number, y: number, w: number, h: number;
      if (id === 'pit') {
        w = usableW;
        h = pitH;
        x = L.safe.l + 4;
        y = gridTop + 2 * (dh + 4);
      } else {
        const col = i % cols;
        const row = Math.floor(i / cols);
        w = dw;
        h = dh;
        x = L.safe.l + 4 + col * (dw + 4);
        y = gridTop + row * (dh + 4);
      }
      const root = new Container();
      root.position.set(x, y);
      const g = new Graphics();
      const peek = new Graphics();
      const label = new PixelText(NAMES[id]);
      const status = new PixelText('', '#9c8aa8');
      root.addChild(g, peek, label, status);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.hitArea = new Rectangle(0, 0, w, h);
      root.on('pointertap', () => this.tapDoor(id));
      this.root.addChild(root);
      this.doors.push({ id, root, g, peek, label, status, x, y, w, h, peekT: 0 });
    });

    // Bottom tabs (00 §5: Throne · Altar · Armory · Trophies; Settings is the MENU button).
    const tabs: [string, () => void][] = [
      ['THRONE', () => this.openThrone()],
      ['ALTAR', () => this.openAltar()],
      ['ARMORY', () => openArmory(game)],
      ['TROPHIES', () => this.openTrophies()],
    ];
    const tw = Math.floor((usableW - 4 * (tabs.length - 1)) / tabs.length);
    tabs.forEach(([label, fn], i) => {
      const b = new Button({ w: tw, h: 18, label, color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: fn });
      b.position.set(L.safe.l + 4 + i * (tw + 4), bottomBar + 4);
      this.root.addChild(b);
    });

    this.update(0);
  }

  // ---------- decor and cosmetics ----------

  private drawDecor(): void {
    const s = this.game.save;
    const L = this.game.layout;
    const has = (id: string) => hasCosmetic(s, id);
    this.decorKey = COSMETICS.map((c) => (has(c.id) ? 1 : 0)).join('');
    const g = this.decor.clear();
    const cx = this.cx;
    const ty = this.ty;
    // Carpet up to the throne.
    const gilded = has('cosmetic.carpet');
    const cw = gilded ? 14 : 12;
    g.rect(cx - cw, L.safe.t + 60, cw * 2, L.h).fill(gilded ? 0x5a1428 : 0x4a1420);
    g.rect(cx - cw + 2, L.safe.t + 60, 1, L.h).fill(0xc0a040);
    g.rect(cx + cw - 3, L.safe.t + 60, 1, L.h).fill(0xc0a040);
    if (gilded) {
      g.rect(cx - cw, L.safe.t + 60, 1, L.h).fill(0xe8c04a);
      g.rect(cx + cw - 1, L.safe.t + 60, 1, L.h).fill(0xe8c04a);
      for (let y = L.safe.t + 66; y < L.h; y += 10) g.rect(cx - 1, y, 2, 2).fill(0xe8c04a);
    }
    // Obsidian throne back (behind the Overlord).
    if (has('cosmetic.throne')) {
      g.rect(cx - 19, ty - 2, 38, 34).fill(0x0a0410);
      g.rect(cx - 18, ty - 1, 36, 32).fill(0x24142e);
      g.rect(cx - 16, ty + 1, 32, 2).fill(0x3c2650);
      // Horns.
      g.rect(cx - 22, ty - 3, 4, 3).fill(0xd8d0b8);
      g.rect(cx - 23, ty - 5, 2, 2).fill(0xd8d0b8);
      g.rect(cx + 18, ty - 3, 4, 3).fill(0xd8d0b8);
      g.rect(cx + 21, ty - 5, 2, 2).fill(0xd8d0b8);
      g.rect(cx - 1, ty - 2, 2, 2).fill(0xc070e0);
    }
    drawSprite(g, OVERLORD, OVERLORD_PAL, cx - 16, ty, 2);
    // Braziers.
    this.flameSpots = [
      { x: cx - 40, y: ty + 18 },
      { x: cx + 34, y: ty + 18 },
    ];
    if (has('cosmetic.braziers')) {
      this.flameSpots.push({ x: cx - 56, y: ty + 24 }, { x: cx + 50, y: ty + 24 });
    }
    for (const f of this.flameSpots) {
      g.rect(f.x, f.y, 6, 10).fill(0x3a2a2a);
      g.rect(f.x - 1, f.y, 8, 2).fill(0x5a4a4a);
    }
    if (has('cosmetic.guards')) {
      drawSprite(g, GUARD, GUARD_PAL, cx - 30, ty + 18, 1);
      drawSprite(g, GUARD, GUARD_PAL, cx + 22, ty + 18, 1);
      // Halberds.
      g.rect(cx - 32, ty + 12, 1, 18).fill(0x8a7a6a);
      g.rect(cx - 34, ty + 12, 3, 3).fill(0xc8c8d0);
      g.rect(cx + 31, ty + 12, 1, 18).fill(0x8a7a6a);
      g.rect(cx + 31, ty + 12, 3, 3).fill(0xc8c8d0);
    }
  }

  // ---------- doors ----------

  private tapDoor(id: DeptId): void {
    const g = this.game;
    if (!g.defs[id]) {
      g.toast(`${NAMES[id]} IS UNDER CONSTRUCTION. THE MINIONS PROMISE IT SOON.`);
      return;
    }
    if (g.save.depts[id]) {
      g.enter(id);
      return;
    }
    const cost = g.sealCost(id);
    const dread = g.sealDread(id);
    if (g.save.meta.dreadLifetime < dread) {
      g.toast(`NEEDS ${dread} LIFETIME DREAD. LET A LEGEND SACK A DEPARTMENT FIRST.`);
      return;
    }
    if (g.buySeal(id)) {
      g.toast(`${NAMES[id]} UNSEALED!`);
      this.redrawAcc = 1;
    } else {
      g.toast(`BREAKING THE SEAL COSTS ${formatNum(cost)} TRIBUTE.`);
    }
  }

  // ---------- Throne upgrades ----------

  private tributeEntry(u: MetaUpgrade, onBuy?: () => void): UpgradeEntry {
    const g = this.game;
    const s = g.save;
    const cost = () => Math.ceil(u.cost(s.meta.throne[u.id] ?? 0));
    return {
      id: u.id,
      name: u.name,
      desc: () => u.desc,
      level: () => s.meta.throne[u.id] ?? 0,
      max: u.max,
      cost,
      currency: 'Tribute',
      // Exact X10 / MAX prices against the Tribute purse (U-06).
      costFor: (n: number) => {
        const l = s.meta.throne[u.id] ?? 0;
        let c = 0;
        for (let k = 0; k < n; k++) c += Math.ceil(u.cost(l + k));
        return c;
      },
      wallet: () => s.meta.tribute,
      maxLabel: u.max === 1 ? 'OWNED' : undefined,
      canAfford: () => s.meta.tribute >= cost(),
      buy: () => {
        if (g.spendTribute(cost())) {
          s.meta.throne[u.id] = (s.meta.throne[u.id] ?? 0) + 1;
          onBuy?.();
        }
      },
    };
  }

  openThrone(): void {
    const g = this.game;
    const s = g.save;
    const unlocked = g.built.filter((id) => s.depts[id]);
    const banners: UpgradeEntry[] = unlocked.map((id) => {
      const key = bannerId(id);
      return this.tributeEntry({ id: key, name: `${NAMES[id]} Banner`, desc: BANNER.desc, max: BANNER.max, cost: BANNER.cost });
    });
    const throneTab: UpgradeEntry[] = [
      ...THRONE_UPGRADES.map((u) => this.tributeEntry(u)),
      ...THRONE_EXTRAS.map((u) =>
        this.tributeEntry(u, () => {
          if (u.id === 'satchel' && (s.meta.throne.satchel ?? 0) === 2) g.toast('THE STEWARD IS HIRED. TURN IT ON PER DEPARTMENT IN THE STEWARD TAB.');
          if (u.id === 'edictBoard') g.toast('THE EDICT BOARD IS UP. PICK AN EDICT IN THE EDICTS TAB.');
        }),
      ),
    ];
    const groups: UpgradeGroup[] = [
      { name: 'Banners', entries: banners },
      { name: 'Throne', entries: throneTab },
      { name: 'Edicts', entries: this.edictEntries(unlocked), bank: () => this.edictBank() },
      { name: 'Steward', entries: this.stewardEntries(unlocked), bank: () => this.stewardBank() },
      { name: 'Looks', entries: COSMETICS.map((u) => this.tributeEntry(u, () => this.drawDecor())) },
    ];
    // On a resize the Throne Room is rebuilt: re-open from the new scene (these closures hold this one).
    g.openCustomSheet('THRONE UPGRADES', () => ({ text: `${formatNum(s.meta.tribute, s.meta.settings.notation)} TRIBUTE`, color: C.goldText }), groups, undefined, () =>
      g.throne?.openThrone(),
    );
  }

  private edictBank(): { text: string; color: string } {
    const s = this.game.save;
    if (!(s.meta.throne.edictBoard ?? 0)) return { text: 'BUILD THE EDICT BOARD (THRONE TAB)', color: '#9c8aa8' };
    const e = activeEdict(s);
    const cd = edictCooldown(s, Date.now());
    const name = e ? `${EDICTS[e.id].name}${e.target ? ` ${NAMES[e.target]}` : ''}`.toUpperCase() : 'NO EDICT';
    return { text: `${name}${cd > 0 ? `  SWITCH ${formatTime(cd / 1000)}` : ''}`, color: '#c070e0' };
  }

  private edictEntries(unlocked: DeptId[]): UpgradeEntry[] {
    const g = this.game;
    const s = g.save;
    const out: UpgradeEntry[] = [];
    const make = (id: EdictId, target?: DeptId): UpgradeEntry => ({
      id: `edict.${id}.${target ?? ''}`,
      name: target ? NAMES[target] : EDICTS[id].name,
      desc: () => {
        if (id === 'ironDiscipline' && target) {
          const now = offlineFactor(s, target);
          const e = activeEdict(s);
          const base = e?.id === 'ironDiscipline' && e.target === target ? now - 0.1 : now;
          return `Offline ${base.toFixed(2)} -> ${Math.min(0.9, base + 0.1).toFixed(2)}`;
        }
        return EDICTS[id].desc;
      },
      level: () => {
        const e = activeEdict(s);
        return e?.id === id && (e.target ?? undefined) === target ? 1 : 0;
      },
      levelText: () => '',
      max: 1,
      maxLabel: 'ACTIVE',
      buyLabel: 'ENACT',
      cost: () => 0,
      costText: () => 'FREE',
      canAfford: () => edictCooldown(s, Date.now()) <= 0,
      locked: () => {
        if (!(s.meta.throne.edictBoard ?? 0)) return 'BOARD';
        const cd = edictCooldown(s, Date.now());
        return cd > 0 ? formatTime(cd / 1000) : null;
      },
      buy: () => {
        if (setEdict(s, id, target, Date.now())) {
          g.toast(`EDICT: ${EDICTS[id].name.toUpperCase()}${target ? ` IN THE ${NAMES[target]}` : ''}. IT STANDS FOR AT LEAST AN HOUR.`);
          g.saveSoon();
        }
      },
    });
    for (const id of EDICT_ORDER) {
      if (!EDICTS[id].targeted) {
        out.push(make(id));
        continue;
      }
      out.push({ ...make(id), id: `edict.h.${id}`, name: `${EDICTS[id].name} (pick one)`, header: true });
      for (const d of unlocked) out.push(make(id, d));
    }
    return out;
  }

  private stewardBank(): { text: string; color: string } {
    const lv = satchelLevel(this.game.save);
    if (lv < 2) return { text: "STEWARD NEEDS GOBBO'S SATCHEL 2", color: '#9c8aa8' };
    return { text: `STEWARD SPENDS UP TO ${lv >= 3 ? 50 : 25}% OF EACH HAUL`, color: C.greenText };
  }

  private stewardEntries(unlocked: DeptId[]): UpgradeEntry[] {
    const g = this.game;
    const s = g.save;
    const out: UpgradeEntry[] = [];
    const st = (id: DeptId) => (s.meta.steward[id] ??= { on: false, reserve: 0.25, pool: 0 });
    for (const id of unlocked) {
      const def = g.defs[id];
      const avail = !!def?.stewardCandidates;
      const lock = () => (satchelLevel(s) < 2 ? 'SATCHEL 2' : !avail ? 'SOON' : null);
      out.push({ id: `steward.h.${id}`, name: NAMES[id], header: true, desc: () => '', level: () => 0, max: 1, cost: () => 0, canAfford: () => false, buy: () => {} });
      out.push({
        id: `steward.${id}`,
        name: 'Steward',
        desc: () => (avail ? (st(id).on ? 'On: buys best value while away' : 'Off: never spends here') : 'Not trained for this department yet'),
        level: () => 0,
        levelText: () => (s.meta.steward[id]?.on ? 'ON' : 'OFF'),
        max: 1,
        get buyLabel() {
          return s.meta.steward[id]?.on ? 'TURN OFF' : 'TURN ON';
        },
        cost: () => 0,
        costText: () => '',
        canAfford: () => true,
        locked: lock,
        buy: () => {
          const v = st(id);
          v.on = !v.on;
          g.toast(v.on ? `THE STEWARD NOW SHOPS IN THE ${NAMES[id]}.` : `THE STEWARD KEEPS OUT OF THE ${NAMES[id]}.`);
        },
      });
      out.push({
        id: `steward.reserve.${id}`,
        name: 'Reserve',
        desc: () => `Never below ${Math.round(st(id).reserve * 100)}% of the bank`,
        level: () => 0,
        levelText: () => `${Math.round((s.meta.steward[id]?.reserve ?? 0.25) * 100)}%`,
        max: 1,
        buyLabel: 'KEEP',
        cost: () => 0,
        costText: () => {
          const r = s.meta.steward[id]?.reserve ?? 0.25;
          const next = RESERVE_STEPS[(RESERVE_STEPS.findIndex((x) => Math.abs(x - r) < 1e-6) + 1) % RESERVE_STEPS.length];
          return `${Math.round(next * 100)}%`;
        },
        canAfford: () => true,
        locked: lock,
        buy: () => {
          const v = st(id);
          const i = RESERVE_STEPS.findIndex((x) => Math.abs(x - v.reserve) < 1e-6);
          v.reserve = RESERVE_STEPS[(i + 1) % RESERVE_STEPS.length];
        },
      });
    }
    return out;
  }

  // ---------- the Dread Altar ----------

  openAltar(): void {
    const g = this.game;
    const s = g.save;
    const entry = (
      id: string,
      name: string,
      desc: () => string,
      max: number,
      cost: (l: number) => number,
      extra?: Partial<UpgradeEntry> & { onBuy?: () => void },
    ): UpgradeEntry => {
      const price = () => Math.ceil(cost(s.meta.dreadPerks[id] ?? 0));
      const { onBuy, ...rest } = extra ?? {};
      return {
        id,
        name,
        desc,
        level: () => s.meta.dreadPerks[id] ?? 0,
        max,
        cost: price,
        currency: 'Dread',
        // Exact X10 / MAX prices against the Dread purse (U-06).
        costFor: (n: number) => {
          const l = s.meta.dreadPerks[id] ?? 0;
          let c = 0;
          for (let k = 0; k < n; k++) c += Math.ceil(cost(l + k));
          return c;
        },
        wallet: () => s.meta.dread,
        canAfford: () => s.meta.dread >= price(),
        buy: () => {
          if (g.spendDread(price())) {
            s.meta.dreadPerks[id] = (s.meta.dreadPerks[id] ?? 0) + 1;
            onBuy?.();
          }
        },
        ...rest,
      };
    };
    const empire = [...DREAD_PERKS, ...LATER_PERKS].map((p) => entry(p.id, p.name, () => p.desc, p.max, p.cost));
    const wings: UpgradeEntry[] = [];
    for (const id of g.built.filter((d) => s.depts[d])) {
      const def = g.defs[id];
      wings.push({ id: `wing.h.${id}`, name: `${NAMES[id]} WING`, header: true, desc: () => '', level: () => 0, max: 1, cost: () => 0, canAfford: () => false, buy: () => {} });
      wings.push(entry(ruinbornId(id), 'Ruinborn', () => RUINBORN.desc, RUINBORN.max, RUINBORN.cost));
      const hsId = headStartId(id);
      wings.push(
        entry(hsId, WING_PERKS.headStart.name, () => WING_PERKS.headStart.desc(s.meta.dreadPerks[hsId] ?? 0), WING_PERKS.headStart.max, WING_PERKS.headStart.cost, {
          locked: () => (def.applyHeadStart ? null : 'SOON'),
        }),
      );
      wings.push(entry(legendsBaneId(id), WING_PERKS.legendsBane.name, () => WING_PERKS.legendsBane.desc(0), WING_PERKS.legendsBane.max, WING_PERKS.legendsBane.cost));
      const sig = def.signature;
      wings.push(
        entry(signatureId(id), sig ? `Sig: ${sig.name}` : 'Signature', () => (sig ? sig.desc : 'A unique perk, coming soon'), 1, WING_PERKS.signature.cost, {
          maxLabel: 'OWNED',
          locked: () => (sig ? null : 'SOON'),
          onBuy: () => {
            const d = s.depts[id];
            try {
              if (d) sig?.apply(d);
            } catch (err) {
              console.error(err);
            }
            g.toast(`SIGNATURE: ${sig?.name.toUpperCase() ?? ''}. ${sig?.desc.toUpperCase() ?? ''}`);
          },
        }),
      );
    }
    g.openCustomSheet(
      'DREAD ALTAR',
      () => ({ text: `${formatNum(s.meta.dread)} DREAD`, color: '#c070e0' }),
      [
      { name: 'Empire', entries: empire },
      { name: 'Wings', entries: wings },
      ],
      undefined,
      () => g.throne?.openAltar(),
    );
    if (s.meta.dreadLifetime === 0) g.toast("DREAD COMES FROM FALLS. FILL A DEPARTMENT'S INFAMY, THEN LET ITS LEGEND IN.");
  }

  // ---------- Trophy wall ----------

  openTrophies(): void {
    const g = this.game;
    const s = g.save;
    const L = g.layout;
    const root = new Container();
    const dim = new Graphics().rect(0, 0, L.w, L.h).fill({ color: 0x0a0410, alpha: 0.7 });
    dim.eventMode = 'static';
    dim.on('pointertap', () => destroyTree(root));
    root.addChild(dim);
    const w = L.w - L.safe.l - L.safe.r - 8;
    const rows = g.built;
    const rowH = 20;
    const owned0 = (s.meta.throne[TROPHY_HALL_ID] ?? 0) > 0;
    const h = Math.min(L.h - L.safe.t - L.safe.b - 8, 40 + rows.length * rowH + (owned0 ? 4 : 26));
    const x = L.safe.l + 4;
    const y = Math.max(L.safe.t + 4, Math.floor((L.h - h) / 2));
    const panel = new Graphics();
    drawPanel(panel, x, y, w, h, 0x221428, C.gold);
    panel.eventMode = 'static';
    root.addChild(panel);
    const title = new PixelText('TROPHY WALL', C.goldText);
    title.position.set(x + 6, y + 6);
    const n = s.meta.trophies.length;
    const owned = (s.meta.throne[TROPHY_HALL_ID] ?? 0) > 0;
    const sub = new PixelText('', '#c8b8d0');
    sub.position.set(x + 6, y + 16);
    const setSub = () =>
      sub.set(
        wrap(
          owned
            ? `${n} LEGENDS CAPTURED. HALL: +${Math.round(trophyAdd(s) * 100)}% TRIBUTE (MAX ${TROPHY_CAP * 100}%)`
            : `${n} LEGENDS CAPTURED. BUILD THE TROPHY HALL: +1% TRIBUTE EACH, MAX ${TROPHY_CAP * 100}%.`,
          w - 30,
        ),
      );
    setSub();
    root.addChild(title, sub);
    const close = new Button({ w: 16, h: 14, label: 'X', color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: () => destroyTree(root) });
    close.position.set(x + w - 20, y + 4);
    root.addChild(close);

    let ry = y + 34;
    const wall = new Graphics();
    root.addChild(wall);
    for (const id of rows) {
      const caught = s.meta.trophies.filter((t) => t.dept === id);
      const def = g.defs[id];
      wall.rect(x + 4, ry, w - 8, rowH - 2).fill(0x2e1d3d);
      const label = new PixelText(`${NAMES[id]} x${caught.length}`, caught.length ? C.ink : '#7a6e80');
      label.position.set(x + 7, ry + 2);
      const last = caught[caught.length - 1];
      const shown = Math.min(6, caught.length);
      const maxC = Math.floor((w - 20 - shown * 9) / 4);
      const nameText = last ? last.name.toUpperCase() : def ? 'NO LEGEND YET' : 'UNDER CONSTRUCTION';
      const name = new PixelText(nameText.length > maxC ? `${nameText.slice(0, maxC - 2)}..` : nameText, last ? '#c8b8d0' : '#7a6e80');
      name.position.set(x + 7, ry + 10);
      root.addChild(label, name);
      // Helms on the wall: one per Legend, up to 6, then "+N".
      const helmX = x + w - 8;
      for (let i = 0; i < shown; i++) drawHelm(wall, helmX - (i + 1) * 9, ry + 2, def?.doorColor ?? 0x7a6a7a);
      ry += rowH;
    }
    if (!owned) {
      const hall = THRONE_EXTRAS.find((u) => u.id === TROPHY_HALL_ID)!;
      const btn = new Button({
        w: w - 16,
        h: 16,
        label: `BUILD TROPHY HALL`,
        sub: undefined,
        onTap: () => {
          const cost = hall.cost(0);
          if ((s.meta.throne[TROPHY_HALL_ID] ?? 0) > 0) return;
          if (g.spendTribute(cost)) {
            s.meta.throne[TROPHY_HALL_ID] = 1;
            g.toast('THE TROPHY HALL OPENS. VISITORS GASP. TRIBUTE FLOWS.');
            destroyTree(root);
            this.openTrophies();
          } else g.toast(`THE TROPHY HALL COSTS ${formatNum(cost)} TRIBUTE.`);
        },
      });
      btn.setLabel(`BUILD HALL {tribute}${formatNum(hall.cost(0))}`);
      btn.position.set(x + 8, y + h - 22);
      root.addChild(btn);
    }
    g.trackModal(root, { reopen: () => g.throne?.openTrophies() });
    g.modalLayer.addChild(root);
  }

  // ---------- frame ----------

  update(dt: number): void {
    this.t += dt;
    const g = this.game;
    const s = g.save;
    const L = g.layout;
    const n = s.meta.settings.notation;
    this.tribute.set(`{tribute}${formatNum(s.meta.tribute, n)} TRIBUTE`);
    let rate = 0;
    for (const id of g.built) rate += tributeRate(s, id, g.defs, false);
    this.tributeRate.set(`+${formatNum(rate * 60, n)}/MIN`);
    this.dread.set(`${formatNum(s.meta.dread, n)} DREAD`);
    this.dread.position.set(L.w - L.safe.r - this.dread.width - 4, L.safe.t + 2);

    const green = hasCosmetic(s, 'cosmetic.braziers');
    const f = this.flames.clear();
    for (const fs of this.flameSpots) {
      const flick = Math.floor(this.t * 8 + fs.x) % 3;
      f.rect(fs.x + 1, fs.y - 4 - flick, 4, 4 + flick).fill(green ? 0x4ad86a : 0xe8702a);
      f.rect(fs.x + 2, fs.y - 2 - flick, 2, 2).fill(green ? 0xc8f8a0 : 0xf8d84a);
    }

    for (const d of this.doors) if (d.peekT > 0) this.drawPeek(d, dt);

    this.redrawAcc += dt;
    if (this.redrawAcc >= 0.5) {
      this.redrawAcc = 0;
      const key = COSMETICS.map((c) => (hasCosmetic(s, c.id) ? 1 : 0)).join('');
      if (key !== this.decorKey) this.drawDecor();
      for (const d of this.doors) this.drawDoor(d);
    }
  }

  /** Manager cameo (00 §5.4.8): the manager's head peeks out of the door for 2 s, once per event. */
  private drawPeek(door: Door, dt: number): void {
    door.peekT = Math.max(0, door.peekT - dt);
    const def = this.game.defs[door.id];
    const p = door.peek.clear();
    if (!def || door.peekT <= 0) return;
    const rise = Math.min(1, (2 - door.peekT) / 0.25, door.peekT / 0.25);
    const px = Math.floor(door.w / 2) - 6;
    const py = 14 + Math.round((1 - rise) * 10);
    p.rect(px - 1, py - 1, 14, 14).fill(C.outline);
    drawSprite(p, def.manager.portrait[Math.floor(this.t * 4) % 2], def.manager.palette, px, py, 1);
  }

  private drawDoor(door: Door): void {
    const g = this.game;
    const s = g.save;
    const def = g.defs[door.id];
    const d = s.depts[door.id];
    const { w, h } = door;
    const gr = door.g.clear();
    const color = def?.doorColor ?? 0x3a3040;
    drawPanel(gr, 0, 0, w, h, 0x1c1028, d ? color : 0x3a3040);
    // The door itself: an arch.
    const dx = 6;
    const dy = 12;
    const dW = w - 12;
    const dH = h - (door.id === 'pit' ? 16 : 30);
    if (door.id === 'pit') {
      // Iron gate: vertical bars.
      gr.rect(dx, dy - 4, dW, dH).fill(0x0a0410);
      for (let x = dx + 2; x < dx + dW - 1; x += 5) gr.rect(x, dy - 4, 2, dH).fill(d ? 0x7a6a7a : 0x4a404a);
    } else {
      gr.rect(dx + 2, dy, dW - 4, dH).fill(d ? 0x0a0410 : 0x2a2030);
      gr.rect(dx, dy + 2, dW, dH - 2).fill(d ? 0x0a0410 : 0x2a2030);
      if (d) {
        // Warm light spilling from an open department.
        gr.rect(dx + 3, dy + dH - 6, dW - 6, 4).fill({ color, alpha: 0.6 });
      } else {
        // Boards across a sealed or unbuilt door.
        gr.rect(dx - 1, dy + 6, dW + 2, 3).fill(0x6e4a2e);
        gr.rect(dx - 1, dy + dH - 10, dW + 2, 3).fill(0x6e4a2e);
      }
    }
    door.label.set(NAMES[door.id], d ? C.ink : '#7a6e80');
    door.label.position.set(Math.floor((w - door.label.width) / 2), 3);

    let status = '';
    let statusColor = '#9c8aa8';
    if (!def) status = 'SOON';
    else if (!d) {
      const dread = g.sealDread(door.id);
      if (s.meta.dreadLifetime < dread) status = `${dread} DREAD`;
      else {
        status = `{tribute}${formatNum(g.sealCost(door.id))}`;
        statusColor = s.meta.tribute >= g.sealCost(door.id) ? C.greenText : C.goldText;
      }
    } else {
      const inf = infamy(def, d);
      // One priority badge (00 §5, D-25): skull for a waiting Legend > "Ready" pip.
      if (d.cycle.legendWaiting) {
        status = '{skull}LEGEND';
        statusColor = Math.floor(this.t * 2) % 2 ? C.redText : C.ink;
        const cameo = `cameo.legend.${d.cycle.n}`;
        if (!d.seen[cameo]) {
          d.seen[cameo] = 1;
          door.peekT = 2;
        }
      } else {
        const r = def.idleRate(d) * coreMult(s, door.id, g.defs, Date.now());
        status = `+${formatNum(r, s.meta.settings.notation)}/S`;
        if (g.readyBuys(door.id).length > 0) {
          // "Ready" pip, top-right corner.
          gr.rect(w - 9, 2, 7, 7).fill(C.outline);
          gr.rect(w - 8, 3, 5, 5).fill(Math.floor(this.t * 2) % 2 ? C.green : 0xc8f0a0);
          gr.rect(w - 6, 4, 1, 2).fill(C.outline);
          gr.rect(w - 6, 7, 1, 1).fill(C.outline);
        }
      }
      if (door.id !== 'pit') {
        drawBar(gr, 4, h - 17, Math.floor((w - 9) / 2), 4, inf.skill, C.green);
        drawBar(gr, 5 + Math.floor((w - 9) / 2), h - 17, Math.floor((w - 9) / 2), 4, inf.econ, C.gold);
      }
    }
    door.status.set(status, statusColor);
    door.status.position.set(Math.floor((w - door.status.width) / 2), h - 10);
  }

  destroy(): void {
    destroyTree(this.root);
  }
}

function drawHelm(g: Graphics, x: number, y: number, color: number): void {
  g.rect(x + 1, y, 6, 1).fill(C.outline);
  g.rect(x, y + 1, 8, 12).fill(C.outline);
  g.rect(x + 1, y + 1, 6, 11).fill(0xb8b8c8);
  g.rect(x + 1, y + 5, 6, 2).fill(0x2a1a3a);
  g.rect(x + 3, y + 7, 2, 4).fill(0x2a1a3a);
  g.rect(x + 3, y - 2, 2, 3).fill(color);
}
