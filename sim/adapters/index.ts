// Department adapters, in unlock order. Adding a department = one adapter file + one line here.
import type { AdapterFactory } from '../types';
import { createCauldron, type CauldronOpts } from './cauldron';
import { createMines, type MinesOpts } from './mines';

export interface AdapterOpts {
  cauldron?: CauldronOpts;
  mines?: MinesOpts;
}

export function allAdapters(opts: AdapterOpts = {}): AdapterFactory[] {
  return [createCauldron(opts.cauldron), createMines(opts.mines)];
}
