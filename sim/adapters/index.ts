// Department adapters, in unlock order. Adding a department = one adapter file + one line here.
import type { AdapterFactory } from '../types';
import { createBridge, type BridgeOpts } from './bridge';
import { createCauldron, type CauldronOpts } from './cauldron';
import { createDungeon, type DungeonOpts } from './dungeon';
import { createMines, type MinesOpts } from './mines';
import { createPit, type PitOpts } from './pit';
import { createSpire, type SpireOpts } from './spire';
import { createStyx, type StyxOpts } from './styx';

export interface AdapterOpts {
  cauldron?: CauldronOpts;
  mines?: MinesOpts;
  dungeon?: DungeonOpts;
  bridge?: BridgeOpts;
  styx?: StyxOpts;
  spire?: SpireOpts;
  pit?: PitOpts;
}

export function allAdapters(opts: AdapterOpts = {}): AdapterFactory[] {
  return [
    createCauldron(opts.cauldron),
    createMines(opts.mines),
    createDungeon(opts.dungeon),
    createBridge(opts.bridge),
    createStyx(opts.styx),
    createSpire(opts.spire),
    createPit(opts.pit),
  ];
}
