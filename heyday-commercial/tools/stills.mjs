// Render inspection stills: node tools/stills.mjs [HeydayVertical] [sec,sec,...] [scale]
// Bundles once, renders each requested second to out/stills/, then builds a contact sheet.
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const id = process.argv[2] || 'HeydayVertical';
const secs = (process.argv[3] || '1,2.5,3.5,4.5,6,8,10,13,15,17,20,23,26,29,32,34,37,39,41,45,48,52,54').split(',').map(Number);
const scale = Number(process.argv[4] || 0.4);
const browserExecutable = process.env.CHROME || undefined;

const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const composition = await selectComposition({serveUrl, id, browserExecutable});
fs.mkdirSync('out/stills', {recursive: true});
const files = [];
for (const s of secs) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(s * composition.fps));
  const output = `out/stills/${id}-${String(s).padStart(5, '0')}.png`;
  await renderStill({composition, serveUrl, output, frame, scale, browserExecutable, imageFormat: 'png'});
  files.push(output);
  console.log('still', s, output);
}
const cols = id === 'HeydayVertical' ? 6 : 4;
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex',
  `${files.map((_, i) => `[${i}:v]drawtext=text='${secs[i]}s':x=10:y=10:fontsize=28:fontcolor=red[v${i}]`).join(';')};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) ? Array.from({length: i % cols}, () => 'w0').join('+') : '0'}_${Math.floor(i / cols) ? Array.from({length: Math.floor(i / cols)}, () => 'h0').join('+') : '0'}`).join('|')}:fill=black`,
  `out/stills/${id}-sheet.png`]);
console.log('sheet', `out/stills/${id}-sheet.png`);
