// Campaign order. To add a mission: create a file in this folder that default-exports a MissionDef,
// import it here, and append it to MISSIONS. Then add it to the tests (they run every entry automatically).

import type { MissionDef } from '../engine/types';
import m01 from './m01-dead-drop';
import m02 from './m02-soft-target';
import m03 from './m03-lighthouse';
import m04 from './m04-blue-lines';
import m05 from './m05-personal-files';
import m06 from './m06-pivot';
import m07 from './m07-ledger';
import m08 from './m08-ghost-protocol';

export const MISSIONS: MissionDef[] = [m01, m02, m03, m04, m05, m06, m07, m08];

export function getMission(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id);
}
