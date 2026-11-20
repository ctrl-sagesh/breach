// Entry point for the Edge Function's copy of the game engine. scripts/build-edge.mjs bundles this into engine.js,
// so the function runs exactly the code the browser runs. Edit the game in src/, not here.

export { validateRun, checkToken, suspicionFor, RUN_LIMITS, TOKEN_TOLERANCE_MS, SUSPICION_HIDE_THRESHOLD } from '../../../src/engine/replay';
export { MISSIONS } from '../../../src/missions';
export { dailyMission, shiftDate, utcDate } from '../../../src/lib/daily';
export { applyFlagVariation } from '../../../src/lib/variation';
export { nicknameProblem } from '../../../src/lib/nickname';
export { admit, generateRecoveryKey, isWellFormedKey, normalizeRecoveryKey, RESTORE_LIMIT } from '../../../src/lib/recoverykey';
export { mergeSaves } from '../../../src/lib/merge';
export { corsHeaders, parseAllowedOrigins } from '../../../src/lib/origins';
