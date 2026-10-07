// The game's version, read from package.json so there is one place to bump it. Shown in About and prefilled into
// bug reports, so a report always says which build it came from.

import pkg from '../../package.json';

export const GAME_VERSION: string = pkg.version;
