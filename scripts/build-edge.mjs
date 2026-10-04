// Bundles the game engine for the Supabase Edge Functions. The output lives in supabase/functions/_shared/, the folder
// Supabase treats as shared code, so every function that imports it deploys with it.
// Runs as part of `npm run build`, so the bundle can never be older than the source it was built from.

import { build } from 'esbuild';
import path from 'node:path';

const entry = path.resolve('supabase/functions/_shared/engine-entry.ts');
const outfile = path.resolve('supabase/functions/_shared/engine.js');

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
