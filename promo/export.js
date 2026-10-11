// Render promo/index.html to MP4 (1080x1920, 30fps). Needs playwright + ffmpeg.
// Usage: node promo/export.js "$PWD/promo/index.html" promo/echarpe-app-ad.mp4
const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const [src, out] = process.argv.slice(2), FPS = 30;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + src + '?export'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
  const DUR = await p.evaluate(() => window.__DUR);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const N = Math.round(DUR * FPS);
  for (let i = 0; i < N; i++) {
    await p.evaluate(t => window.__render(t), i / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close(); console.log('frames', N);
})();
