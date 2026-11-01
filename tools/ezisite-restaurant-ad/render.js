// Renders the animated end card to frames, and the Arabic captions to transparent PNGs.
// Usage: node render.js [site-url]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, 'build');
const FPS = 30;
const END_SECONDS = 6;
const SITE_URL = process.argv[2] || 'ezisite.com';

const CAPTIONS = {
  cap1: '«الطلبات في حتة، والمطبخ في حتة،<br>والدليفري مش عارف رايح فين؟»'.replace(/ /g, "\u00a0").replace('<br>', '<br>'),
  cap2: '«مع إيزي سايت، تابع شغل مطعمك<br>من مكان واحد»',
  step1: '① طلب جديد',
  step2: '② تجهيز بالملاحظات والإضافات',
  step3: '③ إسناد للمندوب',
};

const captionHtml = (text) => `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:Cairo;font-weight:900;src:url(file://${DIR}/fonts/cairo-arabic-900-normal.woff2)}
@font-face{font-family:Cairo;font-weight:900;src:url(file://${DIR}/fonts/cairo-latin-900-normal.woff2);unicode-range:U+0000-00FF}
html,body{margin:0;width:1080px;height:1920px;background:transparent}
.c{position:absolute;left:40px;right:40px;bottom:260px;text-align:center}
span{display:inline-block;font-family:Cairo;font-weight:900;font-size:54px;line-height:1.45;color:#fff;
background:rgba(232,67,28,.92);padding:18px 40px;border-radius:28px;box-shadow:0 10px 40px rgba(0,0,0,.35)}
</style></head><body><div class="c"><span>${text}</span></div></body></html>`;

(async () => {
  fs.mkdirSync(path.join(OUT, 'end'), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });

  for (const [name, text] of Object.entries(CAPTIONS)) {
    await page.setContent(captionHtml(text), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: true });
  }

  async function seq(url, dir, seconds, prep) {
    fs.mkdirSync(path.join(OUT, dir), { recursive: true });
    await page.goto(url);
    if (prep) await page.evaluate(prep.fn, prep.arg);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
    for (let f = 0; f < FPS * seconds; f++) {
      await page.evaluate((ms) => document.getAnimations().forEach((a) => { a.currentTime = ms; }), (f * 1000) / FPS);
      await page.screenshot({ path: path.join(OUT, dir, `f${String(f).padStart(4, '0')}.png`) });
    }
  }
  await seq('file://' + path.join(DIR, 'endcard.html'), 'end', END_SECONDS,
    { fn: (u) => { document.getElementById('url').textContent = u; }, arg: SITE_URL });
  await seq('file://' + path.join(DIR, 'hook.html') + '?n=1', 'hook1', 4);
  await seq('file://' + path.join(DIR, 'hook.html') + '?n=2', 'hook2', 5);
  await browser.close();
  console.log('rendered to', OUT);
})();
