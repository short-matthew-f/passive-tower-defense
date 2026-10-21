import type { DeptDef } from '../core/dept';
import { cauldron } from './cauldron';
import { mines } from './mines';
import { dungeon } from './dungeon';
import { bridge } from './bridge';
import { spire } from './spire';

// Departments built so far, in unlock order.
export const DEPARTMENTS: DeptDef[] = [cauldron, mines, dungeon, bridge, spire];
