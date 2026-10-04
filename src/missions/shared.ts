// Helpers shared by mission files. Nothing here is mission-specific.

import type { FileDef, MachineDef } from '../engine/types';

/**
 * Where bug reports about the leaderboard go. The easter egg below prints it, so it is visible to anyone who finds the file.
 */
export const BUG_REPORT_CONTACT = 'breachgame.contact@gmail.com';

/** A hidden file on the rig. Finding it (cat, grep) is one of the hidden achievements. */
export const EASTER_EGG_PATH = '/home/ghost/.leaderboard-bug';

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
    files: {
      [EASTER_EGG_PATH]: {
        owner: 'ghost',
        private: true,
        content: `Found a way to break the leaderboard? Report it, do not exploit it.\nContact: ${BUG_REPORT_CONTACT}\nSerious reports get a name on the wall of thanks.`,
      },
      ...files,
    },
    dirs: { '/home/ghost': { owner: 'ghost', private: true } },
  };
}
