import type { DeptDef } from '../core/dept';
import { cauldron } from './cauldron';
import { mines } from './mines';
import { dungeon } from './dungeon';
import { bridge } from './bridge';
import { styx } from './styx';
import { spire } from './spire';
import { pit } from './pit';

// Departments built so far, in unlock order.
export const DEPARTMENTS: DeptDef[] = [cauldron, mines, dungeon, bridge, styx, spire, pit];
