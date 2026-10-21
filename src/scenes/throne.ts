// The Throne Room hub (specs/00 §5): Tribute and Dread, department doors with Infamy, Throne upgrades and the Dread Altar.
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { Game } from '../core/game';
import type { UpgradeEntry } from '../core/dept';
import { BANNER, bannerId, DREAD_PERKS, RUINBORN, ruinbornId, THRONE_UPGRADES } from '../core/meta';
import { coreMult, infamy, tributeRate } from '../core/economy';
import { formatNum } from '../core/format';
import { DEPT_ORDER, type DeptId } from '../core/types';
import { PixelText } from '../ui/font';
import { Button, C, drawBar, drawPanel, drawSprite } from '../ui/widgets';
import { openSettings } from './settings';

const NAMES: Record<DeptId, string> = {
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

interface Door {
  id: DeptId;
  root: Container;
  g: Graphics;
  label: PixelText;
  status: PixelText;
  x: number;
  y: number;
  w: number;
  h: number;
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

  constructor(game: Game) {
    this.game = game;
    const L = game.layout;
    const bg = new Graphics();
    bg.rect(0, 0, L.w, L.h).fill(0x140c1c);
    // Flagstone floor pattern.
    for (let y = 0; y < L.h; y += 8) {
      for (let x = (y / 8) % 2 ? 4 : 0; x < L.w; x += 16) bg.rect(x, y, 15, 7).fill(0x1a1024);
    }
    // Carpet up to the throne.
    const cx = Math.floor(L.w / 2);
    bg.rect(cx - 12, L.safe.t + 60, 24, L.h).fill(0x4a1420);
    bg.rect(cx - 10, L.safe.t + 60, 1, L.h).fill(0xc0a040);
    bg.rect(cx + 9, L.safe.t + 60, 1, L.h).fill(0xc0a040);
    this.root.addChild(bg);

    // Top bar (extends under the notch).
    const top = new Graphics();
    top.rect(0, 0, L.w, L.safe.t + 22).fill(0x1c1028);
    top.rect(0, L.safe.t + 22, L.w, 1).fill(C.outline);
    this.root.addChild(top);
    this.tribute.position.set(L.safe.l + 4, L.safe.t + 4);
    this.tributeRate.position.set(L.safe.l + 4, L.safe.t + 13);
    this.root.addChild(this.tribute, this.tributeRate, this.dread);

    // The Overlord on the throne, with the War Pit gate behind.
    const throne = new Graphics();
    const ty = L.safe.t + 28;
    drawSprite(throne, OVERLORD, OVERLORD_PAL, cx - 16, ty, 2);
    // Braziers.
    throne.rect(cx - 40, ty + 18, 6, 10).fill(0x3a2a2a);
    throne.rect(cx + 34, ty + 18, 6, 10).fill(0x3a2a2a);
    this.root.addChild(throne);
    this.flames = new Graphics();
    this.flameXs = [cx - 40, cx + 34];
    this.flameY = ty + 18;
    this.root.addChild(this.flames);

    // Department doors: 3 columns x 2 rows, then the War Pit gate.
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
      const label = new PixelText(NAMES[id]);
      const status = new PixelText('', '#9c8aa8');
      root.addChild(g, label, status);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.hitArea = new Rectangle(0, 0, w, h);
      root.on('pointertap', () => this.tapDoor(id));
      this.root.addChild(root);
      this.doors.push({ id, root, g, label, status, x, y, w, h });
    });

    // Bottom tabs.
    const tabs: [string, () => void][] = [
      ['THRONE', () => this.openThrone()],
      ['ALTAR', () => this.openAltar()],
      ['SETTINGS', () => openSettings(game)],
    ];
    const tw = Math.floor((usableW - 8) / 3);
    tabs.forEach(([label, fn], i) => {
      const b = new Button({ w: tw, h: 18, label, color: C.edge, shade: 0x3a2046, textColor: C.ink, onTap: fn });
      b.position.set(L.safe.l + 4 + i * (tw + 4), bottomBar + 4);
      this.root.addChild(b);
    });

    this.update(0);
  }

  private flames: Graphics;
  private flameXs: number[];
  private flameY: number;

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

  private openThrone(): void {
    const g = this.game;
    const s = g.save;
    const throneEntry = (u: (typeof THRONE_UPGRADES)[number]): UpgradeEntry => ({
      id: u.id,
      name: u.name,
      desc: () => u.desc,
      level: () => s.meta.throne[u.id] ?? 0,
      max: u.max,
      cost: () => Math.ceil(u.cost(s.meta.throne[u.id] ?? 0)),
      currency: 'Tribute',
      canAfford: () => s.meta.tribute >= Math.ceil(u.cost(s.meta.throne[u.id] ?? 0)),
      buy: () => {
        const c = Math.ceil(u.cost(s.meta.throne[u.id] ?? 0));
        if (g.spendTribute(c)) s.meta.throne[u.id] = (s.meta.throne[u.id] ?? 0) + 1;
      },
    });
    const banners: UpgradeEntry[] = g.built
      .filter((id) => s.depts[id])
      .map((id) => {
        const key = bannerId(id);
        return {
          id: key,
          name: `${NAMES[id]} Banner`,
          desc: () => BANNER.desc,
          level: () => s.meta.throne[key] ?? 0,
          max: BANNER.max,
          cost: () => Math.ceil(BANNER.cost(s.meta.throne[key] ?? 0)),
          currency: 'Tribute',
          canAfford: () => s.meta.tribute >= Math.ceil(BANNER.cost(s.meta.throne[key] ?? 0)),
          buy: () => {
            const c = Math.ceil(BANNER.cost(s.meta.throne[key] ?? 0));
            if (g.spendTribute(c)) s.meta.throne[key] = (s.meta.throne[key] ?? 0) + 1;
          },
        };
      });
    g.openCustomSheet(
      'THRONE UPGRADES',
      () => ({ text: `${formatNum(s.meta.tribute, s.meta.settings.notation)} TRIBUTE`, color: C.goldText }),
      [
        { name: 'Banners', entries: banners },
        { name: 'Throne', entries: THRONE_UPGRADES.map(throneEntry) },
      ],
    );
  }

  private openAltar(): void {
    const g = this.game;
    const s = g.save;
    const entry = (id: string, name: string, desc: string, max: number, cost: (l: number) => number): UpgradeEntry => ({
      id,
      name,
      desc: () => desc,
      level: () => s.meta.dreadPerks[id] ?? 0,
      max,
      cost: () => Math.ceil(cost(s.meta.dreadPerks[id] ?? 0)),
      currency: 'Dread',
      canAfford: () => s.meta.dread >= Math.ceil(cost(s.meta.dreadPerks[id] ?? 0)),
      buy: () => {
        const c = Math.ceil(cost(s.meta.dreadPerks[id] ?? 0));
        if (g.spendDread(c)) s.meta.dreadPerks[id] = (s.meta.dreadPerks[id] ?? 0) + 1;
      },
    });
    const empire = DREAD_PERKS.map((p) => entry(p.id, p.name, p.desc, p.max, p.cost));
    const wings = g.built
      .filter((id) => s.depts[id])
      .map((id) => entry(ruinbornId(id), `${NAMES[id]} Ruinborn`, RUINBORN.desc, RUINBORN.max, RUINBORN.cost));
    g.openCustomSheet(
      'DREAD ALTAR',
      () => ({ text: `${formatNum(s.meta.dread)} DREAD`, color: '#c070e0' }),
      [
        { name: 'Empire', entries: empire },
        { name: 'Wings', entries: wings },
      ],
    );
    if (s.meta.dreadLifetime === 0) g.toast('DREAD COMES FROM FALLS. FILL A DEPARTMENT\'S INFAMY, THEN LET ITS LEGEND IN.');
  }

  update(dt: number): void {
    this.t += dt;
    const g = this.game;
    const s = g.save;
    const L = g.layout;
    const n = s.meta.settings.notation;
    this.tribute.set(`{coin}${formatNum(s.meta.tribute, n)} TRIBUTE`);
    let rate = 0;
    for (const id of g.built) rate += tributeRate(s, id, g.defs, false);
    this.tributeRate.set(`+${formatNum(rate * 60, n)}/MIN`);
    this.dread.set(`${formatNum(s.meta.dread, n)} DREAD`);
    this.dread.position.set(L.w - L.safe.r - this.dread.width - 4, L.safe.t + 4);

    const f = this.flames.clear();
    for (const fx of this.flameXs) {
      const flick = Math.floor(this.t * 8 + fx) % 3;
      f.rect(fx + 1, this.flameY - 4 - flick, 4, 4 + flick).fill(0xe8702a);
      f.rect(fx + 2, this.flameY - 2 - flick, 2, 2).fill(0xf8d84a);
    }

    this.redrawAcc += dt;
    if (this.redrawAcc >= 0.5) {
      this.redrawAcc = 0;
      for (const d of this.doors) this.drawDoor(d);
    }
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
        status = `{coin}${formatNum(g.sealCost(door.id))}`;
        statusColor = s.meta.tribute >= g.sealCost(door.id) ? C.greenText : C.goldText;
      }
    } else {
      const inf = infamy(def, d);
      if (d.cycle.legendWaiting) {
        status = '{skull}LEGEND';
        statusColor = Math.floor(this.t * 2) % 2 ? C.redText : C.ink;
      } else {
        const r = def.idleRate(d) * coreMult(s, door.id, g.defs, Date.now());
        status = `+${formatNum(r, s.meta.settings.notation)}/S`;
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
    this.root.destroy({ children: true });
  }
}
