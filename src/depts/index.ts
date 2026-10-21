import type { DeptDef } from '../core/dept';
import { cauldron } from './cauldron';
import { mines } from './mines';

// Departments built so far, in unlock order.
export const DEPARTMENTS: DeptDef[] = [cauldron, mines];
