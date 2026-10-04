// Helpers shared by mission files. Nothing here is mission-specific.

import type { FileDef, MachineDef } from '../engine/types';

/** The player's own machine. Every mission has one; it is where the job starts. */
export function makeRig(neighbors: string[], files: Record<string, FileDef> = {}): MachineDef {
  return {
    id: 'rig',
    hostname: 'ghost-rig',
    ip: '10.66.0.1',
    neighbors,
    defaultUser: 'ghost',
    users: [{ name: 'ghost', password: 'local-only', home: '/home/ghost' }],
    ports: [],
    files: { ...files },
    dirs: { '/home/ghost': { owner: 'ghost', private: true } },
  };
}
