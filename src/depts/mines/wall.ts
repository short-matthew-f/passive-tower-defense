// The Goblin Mines' live wall, headless (02 §2-§6, §13 "Logic"): the 5x5 rocks, regrowth, the
// goblin crew hopping between rocks, kegs, cave-ins, gas and bedrock, Chain Lightning, Magma Pick
// burns, Echo Strike, Heavy Knuckles, the Doom Drum's judged beat, Frenzy and Encore, Motherlodes
// and the 50-rock skill gate. No Pixi: scene.ts renders it and feeds it taps; the balance sim
// (sim/adapters/mines.ts) drives the very same class with its bot, so live play and the sim can't
// drift apart. All numbers come from model.ts.
import type { DeptSave } from '../../core/types';
import * as M from './model';

/** Logical tile size for goblin positions and hop distances (the scene scales to its own size). */
export const U = 32;
export const KEG_FUSE = 1.2;
export const KEG_AUTO = 8;
export const SAPPER_PLANT = M.SAPPER_PLANT_S;
const ECHO_CAP = 8;
const HOP_PX_S = 400;

export type By = 'tap' | 'gob' | 'blast' | 'zap' | 'burn';

export interface Tile {
  i: number;
  col: number;
  row: number;
  kind: M.RockKind | null;
  hp: number;
  maxHp: number;
  /** Seconds until an empty socket regrows. */
  regrow: number;
  /** Keg: < 0 unlit, else seconds to the blast. */
  fuse: number;
  kegAge: number;
  /** Hollow rocks: shells left (2 -> 1). */
  shell: number;
  /** Magma Pick / Hot rock burn: seconds left and damage per second. */
  burnT: number;
  burnDps: number;
  burnBy: By;
  /** Gas cloud over this tile: seconds left. */
  gas: number;
  /** Pre-rolled kind of the rock regrowing here (Keen Eye glint), or null. */
  next: M.RockKind | null;
  /** Who landed the first hit on this rock (Keen Eye pays when it was a tap). */
  first: By | null;
}

export interface Hop {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
}

export interface Gob {
  kind: M.GobKind;
  tile: number;
  x: number;
  y: number;
  hop: Hop | null;
  face: number;
  plant: number;
  zap: number;
  /** Seconds of swinging, for the scene's animation. */
  swing: number;
}

export interface TapResult {
  hit: boolean;
  crit: boolean;
  beatHit: boolean;
  /** This tap was the beat's judged tap (hit or miss). */
  judged: boolean;
  thunder: boolean;
  dmg: number;
}

/** A judged beat: index k on the beat clock, and whether the tap landed inside the window. */
export interface BeatJudge {
  k: number;
  inWindow: boolean;
}

export interface WallHooks {
  earn(base: number): number;
  /** Steady Drum (a suite setting): the beat window doubles. Absent = off (the balance sim). */
  steady?(): boolean;
  raiseSkill(level: number): void;
  rnd(): number;
  /** A kind the onboarding wants on the next spawn (scripted Ore Vein), or null. */
  forceKind?(t: Tile): M.RockKind | null;
  onHit?(t: Tile, dmg: number, by: By): void;
  onBreak?(t: Tile, kind: M.RockKind, by: By, got: number, gems: number): void;
  onShell?(t: Tile, got: number): void;
  onBlast?(t: Tile, auto: boolean): void;
  onZap?(path: number[], by: 'tap' | 'shock' | 'thunder'): void;
  onCaveIn?(tiles: Tile[]): void;
  onGas?(t: Tile): void;
  onSpawn?(t: Tile): void;
  onPlant?(t: Tile, g: Gob): void;
  onClink?(t: Tile): void;
  onFrenzy?(start: boolean): void;
  onEcho?(t: Tile): void;
}

export class Wall {
  readonly tiles: Tile[] = [];
  readonly gobs: Gob[] = [];
  /** Beat clock in seconds (runs while the drum is active). */
  clock = 0;
  depth: number;
  lastJudged = Number.NaN;
  streak = 0;
  /** Misses forgiven in the current streak (Steady Hands). */
  forgiven = 0;
  pips = 0;
  pipDecay = 0;
  frenzyT = 0;
  encoreT = 0;
  private echoes: { t: number; tile: number }[] = [];
  private save: DeptSave;
  private h: WallHooks;

  constructor(save: DeptSave, hooks: WallHooks) {
    this.save = save;
    this.h = hooks;
    const r = this.run;
    M.normalize(r, this.per);
    this.depth = r.depth;
    for (let i = 0; i < M.TILES; i++) {
      this.tiles.push({
        i,
        col: i % M.GRID,
        row: Math.floor(i / M.GRID),
        kind: null,
        hp: 0,
        maxHp: 0,
        regrow: 0,
        fuse: -1,
        kegAge: 0,
        shell: 0,
        burnT: 0,
        burnDps: 0,
        burnBy: 'burn',
        gas: 0,
        next: null,
        first: null,
      });
    }
    this.reset(true);
    this.syncGobs(true);
  }

  get run(): M.MinesRun {
    return this.save.run as M.MinesRun;
  }
  get per(): M.MinesPersistent {
    return this.save.persistent as M.MinesPersistent;
  }
  get drumActive(): boolean {
    return this.per.drum && this.per.drumOn;
  }
  get tempo(): M.Tempo {
    return M.tempoOf(this.per);
  }
  get period(): number {
    return M.beatPeriod(this.run.depth, this.tempo);
  }
  get window(): number {
    return M.beatWindow(this.run.wide, this.tempo, !!this.h.steady?.());
  }

  mineable(t: Tile): boolean {
    return t.kind !== null && t.kind !== 'keg' && t.kind !== 'bedrock';
  }

  /** Rebuild the wall: on the first build every socket holds a rock; after a depth change every
   * socket empties and regrows within 0.4 s. */
  reset(first: boolean): void {
    for (const t of this.tiles) {
      t.burnT = 0;
      t.gas = 0;
      t.next = null;
      t.fuse = -1;
      if (first) this.spawn(t, true);
      else {
        t.kind = null;
        t.regrow = 0.05 + this.h.rnd() * 0.35;
      }
    }
    for (const g of this.gobs) g.tile = -1;
    this.echoes.length = 0;
    this.depth = this.run.depth;
  }

  private roll(initial: boolean): M.RockKind {
    const r = this.run;
    const x = this.h.rnd();
    if (initial) {
      // The first wall never starts with kegs.
      const k = M.rollKind(x, r.depth, this.per.powder, r.prospectors);
      return k === 'keg' || k === 'bedrock' || k === 'gas' ? 'common' : k;
    }
    if (r.stats.sinceMother >= M.MOTHER_EVERY && !this.tiles.some((t) => t.kind === 'mother' || t.next === 'mother')) {
      r.stats.sinceMother = 0;
      return 'mother';
    }
    return M.rollKind(x, r.depth, this.per.powder, r.prospectors);
  }

  private spawn(t: Tile, initial = false): void {
    const kind = this.h.forceKind?.(t) ?? t.next ?? this.roll(initial);
    t.next = null;
    t.kind = kind;
    t.shell = kind === 'hollow' ? 2 : 0;
    t.maxHp = kind === 'keg' ? 1 : kind === 'bedrock' ? 1 : M.H(this.run.depth) * M.KIND_HP[kind];
    t.hp = t.maxHp;
    t.fuse = -1;
    t.kegAge = 0;
    t.burnT = 0;
    t.first = null;
    if (!initial) this.h.onSpawn?.(t);
  }

  /** Keeps the goblin list in step with the crew (hires, Bone Miners). */
  syncGobs(initial = false): void {
    const r = this.run;
    const want = M.crewSize(r, this.save.imports?.bones ?? 0);
    while (this.gobs.length < want) {
      const i = this.gobs.length;
      const side = i % 2 === 0 ? -1 : 1;
      const g: Gob = {
        kind: M.slotKind(r, i),
        tile: -1,
        x: side < 0 ? -8 : M.GRID * U + 8,
        y: M.GRID * U,
        hop: null,
        face: side < 0 ? 1 : -1,
        plant: SAPPER_PLANT * this.h.rnd(),
        zap: M.SHOCK_EVERY * this.h.rnd(),
        swing: this.h.rnd(),
      };
      if (initial) {
        const t = this.tiles[Math.floor(this.h.rnd() * M.TILES)];
        g.x = t.col * U + 6;
        g.y = t.row * U + U - 2;
      }
      this.gobs.push(g);
    }
    if (this.gobs.length > want) this.gobs.length = want;
    // Crew order can shift (a Sapper hired after Bone Miners arrived): re-label every slot.
    for (let k = 0; k < this.gobs.length; k++) this.gobs[k].kind = M.slotKind(r, k);
  }

  standPos(t: Tile, gi: number): { x: number; y: number; face: number } {
    const left = gi % 2 === 0;
    return { x: t.col * U + (left ? 7 : U - 7), y: t.row * U + U - 2, face: left ? 1 : -1 };
  }

  private pickTarget(g: Gob, gi: number): number {
    let best = -1;
    let bestScore = Infinity;
    for (const t of this.tiles) {
      if (!this.mineable(t)) continue;
      let crowd = 0;
      for (const o of this.gobs) if (o !== g && o.tile === t.i) crowd++;
      const p = this.standPos(t, gi);
      // A Motherlode "brings a crowd of goblins" (02 §5).
      const pull = t.kind === 'mother' ? -90 : 0;
      const score = Math.hypot(p.x - g.x, p.y - g.y) + crowd * (t.kind === 'mother' ? 10 : 60) + pull;
      if (score < bestScore) {
        bestScore = score;
        best = t.i;
      }
    }
    return best;
  }

  // ---------- the step ----------

  step(dt: number): void {
    const r = this.run;
    if (r.depth !== this.depth) this.reset(false);
    if (this.gobs.length !== M.crewSize(r, this.save.imports?.bones ?? 0)) this.syncGobs();
    if (this.drumActive) this.clock += dt;
    this.stepFrenzy(dt);
    this.stepTiles(dt);
    this.stepGobs(dt);
    if (this.echoes.length) {
      for (let k = this.echoes.length - 1; k >= 0; k--) {
        const e = this.echoes[k];
        e.t -= dt;
        if (e.t > 0) continue;
        this.echoes.splice(k, 1);
        const t = this.tiles[e.tile];
        if (this.mineable(t) && t.kind !== 'rubble') {
          this.h.onEcho?.(t);
          this.tap(e.tile, null, { echo: true });
        }
      }
    }
  }

  private stepFrenzy(dt: number): void {
    const r = this.run;
    if (this.frenzyT > 0) {
      this.frenzyT -= dt;
      if (this.frenzyT <= 0) {
        this.frenzyT = 0;
        if (r.encore > 0 && r.drummers > 0) this.encoreT = M.encoreDur(r.encore);
        this.h.onFrenzy?.(false);
      }
    } else if (this.pips > 0) {
      this.pipDecay += dt;
      if (this.pipDecay >= M.pipDecayS(r.steadyH)) {
        this.pipDecay = 0;
        this.pips--;
      }
    }
    if (this.encoreT > 0) this.encoreT = Math.max(0, this.encoreT - dt);
  }

  private stepTiles(dt: number): void {
    const r = this.run;
    for (const t of this.tiles) {
      if (t.gas > 0) t.gas = Math.max(0, t.gas - dt);
      if (t.kind === null) {
        t.regrow -= dt;
        // Keen Eye: the next rock is rolled a moment early so a shiny one can glint (02 §6A).
        if (t.next === null && t.regrow <= M.KEEN_GLINT_S) t.next = this.h.forceKind?.(t) ?? this.roll(false);
        if (t.regrow <= 0) this.spawn(t);
      } else if (t.kind === 'keg') {
        if (t.fuse >= 0) {
          t.fuse -= dt;
          if (t.fuse <= 0) this.explode(t, false);
        } else if ((t.kegAge += dt) >= KEG_AUTO) this.explode(t, true);
      } else if (t.burnT > 0) {
        const k = Math.min(dt, t.burnT);
        t.burnT -= dt;
        this.damage(t, t.burnDps * k, t.burnBy);
      }
    }
    void r;
  }

  /** Goblin DPS multiplier from Frenzy, Gritch's Whip and Encore. */
  crewMult(): number {
    const r = this.run;
    if (this.frenzyT > 0) return M.FRENZY_GOBLIN_MULT * M.whipMult(r.whip);
    return this.encoreT > 0 ? M.ENCORE_MULT : 1;
  }

  private stepGobs(dt: number): void {
    const r = this.run;
    const p = this.per;
    const fm = this.crewMult();
    for (let gi = 0; gi < this.gobs.length; gi++) {
      const g = this.gobs[gi];
      if (g.hop) {
        g.hop.t += dt;
        const k = Math.min(1, g.hop.t / g.hop.dur);
        g.x = g.hop.fx + (g.hop.tx - g.hop.fx) * k;
        g.y = g.hop.fy + (g.hop.ty - g.hop.fy) * k;
        if (k >= 1) g.hop = null;
      } else {
        const t = g.tile >= 0 ? this.tiles[g.tile] : null;
        if (!t || !this.mineable(t)) {
          g.tile = this.pickTarget(g, gi);
          if (g.tile >= 0) {
            const sp = this.standPos(this.tiles[g.tile], gi);
            const dist = Math.hypot(sp.x - g.x, sp.y - g.y);
            g.hop = { fx: g.x, fy: g.y, tx: sp.x, ty: sp.y, t: 0, dur: Math.min(0.5, 0.18 + dist / HOP_PX_S) };
            g.face = Math.abs(sp.x - g.x) < 4 ? sp.face : sp.x >= g.x ? 1 : -1;
          }
        } else {
          g.face = this.standPos(t, gi).face;
          const slow = t.gas > 0 ? M.GAS_SLOW : 1;
          g.swing += dt * (fm > 1 ? 1.6 : 1) * slow;
          const dps = M.goblinDps(M.baseDps(g.kind), r, p) * fm * slow;
          this.damage(t, dps * dt, 'gob');
        }
      }
      if (g.kind === 'sapper') {
        g.plant -= dt;
        if (g.plant <= 0) {
          g.plant = SAPPER_PLANT;
          const commons = this.tiles.filter((o) => o.kind === 'common');
          const o = commons[Math.floor(this.h.rnd() * commons.length)];
          if (o) {
            o.kind = 'keg';
            o.maxHp = 1;
            o.hp = 1;
            o.fuse = -1;
            o.kegAge = 0;
            o.burnT = 0;
            this.h.onPlant?.(o, g);
          }
        }
      } else if (g.kind === 'shocker') {
        g.zap -= dt;
        if (g.zap <= 0) {
          g.zap = M.SHOCK_EVERY;
          const from = g.tile >= 0 ? this.tiles[g.tile] : null;
          if (from && this.mineable(from)) {
            const dmg = M.goblinDps(M.SHOCKER_DPS, r, p) * M.SHOCK_DMG * fm;
            this.chain(from, dmg, M.SHOCK_JUMPS, 'shock', true);
          }
        }
      }
    }
  }

  // ---------- player input ----------

  /** Judges the beat for this tap (one judged tap per beat, from the previous beat's midpoint,
   * 02 §6E R4-01). Returns 'hit', 'miss' or null for a free (not judged) tap. */
  private judge(b: BeatJudge): 'hit' | 'miss' | null {
    if (b.k === this.lastJudged) return null;
    this.lastJudged = b.k;
    if (b.inWindow) return 'hit';
    // Steady Hands forgives a few missed judged taps per streak.
    if (this.streak > 0 && this.forgiven < this.run.steadyH) this.forgiven++;
    else {
      this.streak = 0;
      this.forgiven = 0;
    }
    return 'miss';
  }

  /**
   * A tap on tile i. `beat` is the judgement input when the drum is active (null for hold
   * auto-hits, echoes and drum-off taps); `soft` is the rapid-tap soft-cap multiplier.
   */
  tap(i: number, beat: BeatJudge | null, o: { soft?: number; echo?: boolean } = {}): TapResult {
    const r = this.run;
    const p = this.per;
    const res: TapResult = { hit: false, crit: false, beatHit: false, judged: false, thunder: false, dmg: 0 };
    if (!o.echo) r.stats.taps++;
    const j = beat && this.drumActive ? this.judge(beat) : null;
    res.judged = j !== null;
    const t = this.tiles[i];
    if (!t) return res;
    // Waft gas away: -1 s per tap on the tapped tile and its neighbours.
    if (t.gas > 0) for (const n of this.around(t, true)) n.gas = Math.max(0, n.gas - 1);
    if (t.kind === null) return res;
    if (t.kind === 'keg') {
      if (t.fuse < 0) t.fuse = KEG_FUSE;
      res.hit = true;
      return res;
    }
    if (t.kind === 'rubble') {
      this.breakRock(t, 'tap');
      res.hit = true;
      return res;
    }
    if (t.kind === 'bedrock') {
      this.h.onClink?.(t);
      return res;
    }
    res.hit = true;
    let dmg = M.fistDamage(r) * (o.soft ?? 1);
    const crit = this.h.rnd() < M.critChance(r.critC) || (!o.echo && M.stewCrit(this.save.imports?.potions ?? 0, r.stats.taps));
    if (crit) {
      dmg *= M.critMult(r.critP);
      r.stats.crits++;
      res.crit = true;
    }
    if (j === 'hit') {
      this.streak++;
      r.stats.beatHits++;
      r.stats.bestStreak = Math.max(r.stats.bestStreak, this.streak);
      dmg *= M.beatMult(r.drumhead, this.tempo) * M.streakBonus(this.streak);
      res.beatHit = true;
      this.onBeatHit();
      if (p.thunder > 0 && beat && beat.k % M.THUNDER_EVERY === 0) {
        res.thunder = true;
        r.stats.thunders++;
      }
    }
    if (this.frenzyT > 0) dmg *= M.frenzyTapMult(r.frenzy);
    res.dmg = dmg;
    if (t.first === null) t.first = 'tap';
    this.h.onHit?.(t, dmg, 'tap');

    // Chain Lightning: any tap can proc it; Beat Hits proc at double chance; a Thunder Beat
    // always fires it with +L jumps.
    if (res.thunder) this.chain(t, dmg * 0.5, M.chainJumps(p.chain) + p.thunder, 'thunder');
    else {
      const chance = M.chainChance(p.chain) * (res.beatHit ? 2 : 1);
      if (chance > 0 && this.h.rnd() < chance) this.chain(t, dmg * 0.5, M.chainJumps(p.chain), 'tap');
    }
    // Heavy Knuckles: splash onto the 4 adjacent tiles.
    // The splash carries the force that went into the rock (no overkill), so one-hit taps don't
    // turn into five kills.
    if (r.knuckles > 0) {
      const ns = this.around(t, false, true).filter((n) => this.mineable(n) && n.kind !== 'rubble');
      const s = (Math.min(dmg, Math.max(0, t.hp)) * M.knucklesSplash(r.knuckles)) / Math.max(1, ns.length);
      for (const n of ns) this.damage(n, s, 'tap');
    }
    // Magma Pick: a burn of 20% of the tap per second.
    if (p.magma > 0) {
      t.burnDps = Math.max(t.burnT > 0 ? t.burnDps : 0, dmg * M.MAGMA_DPS);
      t.burnT = M.magmaDur(p.magma);
      t.burnBy = 'tap';
    }
    // Echo Strike: the tap repeats 0.3 s later.
    if (!o.echo && p.echo > 0 && this.echoes.length < ECHO_CAP && this.h.rnd() < M.echoChance(p.echo)) {
      this.echoes.push({ t: M.ECHO_DELAY, tile: i });
    }
    this.damage(t, dmg, 'tap');
    return res;
  }

  /** A rake across tile i (02 §10): 25% of a tap; Rubble is cleared outright. */
  rake(i: number): boolean {
    const t = this.tiles[i];
    if (!t || t.kind === null || t.kind === 'keg' || t.kind === 'bedrock') return false;
    if (t.gas > 0) t.gas = Math.max(0, t.gas - 1);
    if (t.kind === 'rubble') {
      this.breakRock(t, 'tap');
      return true;
    }
    if (t.first === null) t.first = 'tap';
    this.damage(t, M.fistDamage(this.run) * 0.25, 'tap');
    return true;
  }

  private onBeatHit(): void {
    const r = this.run;
    this.pipDecay = 0;
    if (r.frenzy <= 0) return;
    if (this.frenzyT > 0) this.frenzyT = Math.min(M.frenzyCap(r.fuse), this.frenzyT + 0.25);
    else if (++this.pips >= M.frenzyPips(r.frenzy)) this.startFrenzy();
  }

  startFrenzy(): void {
    this.pips = 0;
    this.encoreT = 0;
    this.frenzyT = M.frenzyBase(this.run.fuse);
    this.run.stats.frenzies++;
    this.h.onFrenzy?.(true);
  }

  // ---------- damage, breaks, effects ----------

  /** Neighbours of t: the 3x3 (self optional) or the 4 orthogonal tiles. */
  around(t: Tile, self: boolean, ortho = false): Tile[] {
    const out: Tile[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !self) continue;
        if (ortho && dx && dy) continue;
        const c = t.col + dx;
        const w = t.row + dy;
        if (c < 0 || w < 0 || c >= M.GRID || w >= M.GRID) continue;
        out.push(this.tiles[w * M.GRID + c]);
      }
    return out;
  }

  damage(t: Tile, amount: number, by: By): void {
    if (!this.mineable(t) || amount <= 0) return;
    if (t.first === null) t.first = by;
    t.hp -= amount;
    if (t.hp <= 0) this.breakRock(t, by);
  }

  breakRock(t: Tile, by: By): void {
    const kind = t.kind;
    if (kind === null) return;
    const r = this.run;
    const p = this.per;
    // A Hollow rock's outer shell breaks into its inner core (02 §5 stratum behaviours).
    if (kind === 'hollow' && t.shell > 1) {
      t.shell = 1;
      t.hp = t.maxHp;
      const got = this.h.earn(M.R(r.depth) * M.HOLLOW_OUTER * M.oreMult(r));
      this.h.onShell?.(t, got);
      return;
    }
    t.kind = null;
    t.regrow = M.regrowTime(r.regrow);
    t.burnT = 0;
    for (const g of this.gobs) if (g.tile === t.i) g.tile = -1;
    if (kind === 'rubble') {
      this.h.onBreak?.(t, kind, by, 0, 0);
      return;
    }
    let gems = 0;
    let got = 0;
    if (kind === 'bedrock') {
      r.stats.bedrock++;
      gems = this.h.rnd() * M.BEDROCK_GEM_EVERY < 1 ? M.BEDROCK_GEMS : 0;
    } else {
      let reward = M.R(r.depth) * M.KIND_REWARD[kind] * M.oreMult(r);
      if ((kind === 'vein' || kind === 'geode' || kind === 'mother') && t.first === 'tap') reward *= M.keenBonus(r.keen);
      got = this.h.earn(reward);
      r.stats.rocks++;
      r.stats.sinceMother++;
      if (kind === 'vein') r.stats.veins++;
      if (kind === 'mother') r.stats.mothers++;
      if (kind === 'geode') {
        gems++;
        r.stats.geodes++;
      }
      if (p.lucky > 0 && this.h.rnd() < 0.001 * p.lucky) gems++;
      // Infamy skill gate: 50 rocks at a depth, on screen (this wall only runs on screen).
      const key = String(r.depth);
      const n = (r.gate[key] = (r.gate[key] ?? 0) + 1);
      if (n >= M.GATE_ROCKS) this.h.raiseSkill(r.depth);
    }
    if (gems) {
      p.gems += gems;
      p.gemsEver += gems;
    }
    this.h.onBreak?.(t, kind, by, got, gems);
    if (kind === 'gas') {
      const dur = M.gasDuration(r.lanterns);
      for (const n of this.around(t, true)) n.gas = Math.max(n.gas, dur);
      this.h.onGas?.(t);
    } else if (kind === 'hot') {
      for (const n of this.around(t, false, true)) {
        if (!this.mineable(n) || n.kind === 'rubble') continue;
        n.burnDps = Math.max(n.burnT > 0 ? n.burnDps : 0, (n.maxHp * 0.25) / 3);
        n.burnT = 3;
        n.burnBy = 'burn';
      }
    }
    if (kind !== 'bedrock' && this.h.rnd() < M.caveInChance(r)) this.caveIn();
  }

  caveIn(): void {
    const n = 3 + Math.floor(this.h.rnd() * 3);
    const cands = this.tiles.filter((t) => t.kind !== 'keg' && t.kind !== 'bedrock' && t.kind !== 'mother');
    const hit: Tile[] = [];
    for (let k = 0; k < n && cands.length; k++) {
      const t = cands.splice(Math.floor(this.h.rnd() * cands.length), 1)[0];
      t.kind = 'rubble';
      t.maxHp = 1;
      t.hp = 1;
      t.burnT = 0;
      t.next = null;
      for (const g of this.gobs) if (g.tile === t.i) g.tile = -1;
      hit.push(t);
    }
    this.h.onCaveIn?.(hit);
  }

  explode(t: Tile, auto: boolean, mult = 1): void {
    const r = this.run;
    t.kind = null;
    t.regrow = M.regrowTime(r.regrow);
    t.fuse = -1;
    r.stats.kegs++;
    const dmg = M.fistDamage(r) * M.blastMult(this.per.powder) * (auto ? 0.5 : 1) * mult;
    for (const o of this.around(t, false)) {
      if (o.kind === 'keg') {
        if (o.fuse < 0 || o.fuse > 0.15) o.fuse = 0.15;
      } else if (o.kind === 'rubble' || o.kind === 'bedrock') this.breakRock(o, 'blast');
      else this.damage(o, dmg, 'blast');
    }
    this.h.onBlast?.(t, auto);
  }

  /** Chain Lightning from `from`: `jumps` arcs of `dmg` each. Magnet rocks pull arcs toward them;
   * a Mirror rock gives +1 jump; bedrock struck by lightning cracks open. */
  chain(from: Tile, dmg: number, jumps: number, by: 'tap' | 'shock' | 'thunder', hitFrom = false): void {
    const path = [from.i];
    const hitSet = new Set([from.i]);
    if (hitFrom) this.damage(from, dmg, 'zap');
    let cur = from;
    for (let j = 0; j < jumps; j++) {
      let best: Tile | null = null;
      let bd = Infinity;
      for (const t of this.tiles) {
        if (hitSet.has(t.i) || !(this.mineable(t) || t.kind === 'bedrock')) continue;
        const d = Math.abs(t.col - cur.col) + Math.abs(t.row - cur.row) + this.h.rnd() * 0.5 - (t.kind === 'magnet' ? 2 : 0);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (!best) break;
      hitSet.add(best.i);
      path.push(best.i);
      if (best.kind === 'mirror') jumps++;
      if (best.kind === 'bedrock') this.breakRock(best, 'zap');
      else this.damage(best, dmg, 'zap');
      cur = best;
    }
    if (path.length > 1) {
      this.run.stats.lightning++;
      this.h.onZap?.(path, by);
    }
  }

  /** True while a lit keg is on the wall. */
  kegLit(): boolean {
    for (const t of this.tiles) if (t.kind === 'keg' && t.fuse >= 0) return true;
    return false;
  }
}
