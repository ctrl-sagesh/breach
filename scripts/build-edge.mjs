// Bundles the game engine for the Supabase Edge Function. Run it after changing anything under src/engine, src/missions
// or src/lib/daily.ts, then redeploy the function. The output is committed next to the function.

import { build } from 'esbuild';
import path from 'node:path';

const entry = path.resolve('supabase/functions/submit-run/engine-entry.ts');
const outfile = path.resolve('supabase/functions/submit-run/engine.js');

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile,
  logLevel: 'warning',
});
console.log(`bundled ${path.relative(process.cwd(), outfile)}`);
