// Department adapters, in unlock order. Adding a department = one adapter file + one line here.
import type { AdapterFactory } from '../types';
import { createBridge, type BridgeOpts } from './bridge';
import { createCauldron, type CauldronOpts } from './cauldron';
import { createDungeon, type DungeonOpts } from './dungeon';
import { createMines, type MinesOpts } from './mines';

export interface AdapterOpts {
  cauldron?: CauldronOpts;
  mines?: MinesOpts;
  dungeon?: DungeonOpts;
  bridge?: BridgeOpts;
}

export function allAdapters(opts: AdapterOpts = {}): AdapterFactory[] {
  return [createCauldron(opts.cauldron), createMines(opts.mines), createDungeon(opts.dungeon), createBridge(opts.bridge)];
}
