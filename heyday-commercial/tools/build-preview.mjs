// Bundles preview/main.tsx (live Remotion Player) and copies the public assets next to it.
import {build} from 'esbuild';
import fs from 'node:fs';

await build({
  entryPoints: ['preview/main.tsx'],
  bundle: true,
  outdir: 'preview/dist',
  format: 'iife',
  minify: true,
  jsx: 'automatic',
  loader: {'.woff': 'file', '.woff2': 'file'},
  define: {'process.env.NODE_ENV': '"production"'},
  logLevel: 'info',
});
// staticFile() resolves to /<path>, so public/ assets go to the preview root
for (const d of fs.readdirSync('public')) fs.cpSync(`public/${d}`, `preview/${d}`, {recursive: true});
console.log('Preview built → serve the preview/ folder, e.g. `npx serve preview` or `python3 -m http.server -d preview`');
