/* ============================================================
   🚦 gate.js — البوابة. مفيش ملف بيتسلّم قبل ما دي تطلع خضرا.
   ------------------------------------------------------------
   الاستخدام:
     node tests/gate.js                 ← فحص كامل
     node tests/gate.js --zip x.zip     ← + التأكد إن اللي جوّه الزيب هو نفسه المتختبر
     node tests/gate.js --update-baseline   ← تسجيل قايمة الفشل المعروفة (مرة واحدة)
     node tests/gate.js --quick         ← من غير تشغيل الاختبارات (للتجربة السريعة وسط الشغل)

   بتفحص 4 حاجات:
     1) كل ملف JS (وكل <script> جوّه HTML) **بيتفسّر فعلًا** — مش بحث عن كلام في النص.
        الباج اللي كسر تابلت إنستاباي 22-09 كان علامة backtick جوّه تعليق في بلوك CSS:
        النص قفل في نصّه، الملف بقى مكسور، والمتصفح رفض يحمّله. الاختبارات النصية عدّته
        لأن الكلام كان مكتوب، و`node --check` عدّاه لأنه مش بيفحص الملف كموديول.
     2) شاشات التابلت **بتتبني فعلًا** في DOM حقيقي (jsdom) — مش بس بتتفسّر.
     3) `run.js` + `run-async.js` مقارنة بخط أساس مسجّل — أي فشل **جديد** = البوابة حمرا.
        (الـ178 الفاشلين القدام معروفين ومسجّلين، فمينفعش يغطّوا على فشل جديد.)
     4) لو فيه زيب: كل ملف جواه = نفس الملف اللي اتفحص بالبايت. ده بيمنع الباج المتكرر
        بتاع تسليم ملف من فرع أقدم.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const BASELINE = path.join(__dirname, 'gate-baseline.json');
const APP_DIRS = ['pos', 'feedback', 'sales', 'Office', 'loyalty', 'glow', 'tryon', 'functions', 'apply', 'join', 'guide'];
const SKIP = /node_modules|[\\/]dist[\\/]|\.min\.js$/;

let problems = [];
const fail = (m) => problems.push(m);
const say = (m) => console.log(m);

/* ---------- 1) الملفات بتتفسّر؟ ---------- */
function bodyOf(code){
  // بنشيل سطور import/export بس — الباقي بيتفسّر زي ما هو
  return code
    .replace(/^#![^\n]*/, '')                                                 // shebang في سكربتات الأوامر
    .replace(/^\s*import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]*['"];?/gm, '')   // import { a, b } from '...'
    .replace(/^\s*import\s+[^;\n]*from\s*['"][^'"]*['"];?/gm, '')            // import x from '...'
    .replace(/^\s*import\s*['"][^'"]*['"];?/gm, '')                          // import '...'
    .replace(/^\s*export\s+(default\s+)?/gm, '');
}
function parseCheck(code, label){
  try{ new Function(bodyOf(code)); return true; }
  catch(e){ fail('❌ ' + label + ' — خطأ لغوي: ' + e.message); return false; }
}
function walk(dir, out){
  let ents = [];
  try{ ents = fs.readdirSync(dir, { withFileTypes: true }); }catch(e){ return out; }
  for(const e of ents){
    const p = path.join(dir, e.name);
    if(SKIP.test(p)) continue;
    if(e.isDirectory()) walk(p, out);
    else if(/\.(js|mjs|html)$/i.test(e.name)) out.push(p);
  }
  return out;
}
function step1(){
  const files = [];
  APP_DIRS.forEach(d => walk(path.join(ROOT, d), files));
  ['index.html', 'sw.js', 'sales-app.js', 'cctv-config.js', 'photo-core.js', 'recolor-core.js']
    .forEach(f => { const p = path.join(ROOT, f); if(fs.existsSync(p)) files.push(p); });
  let js = 0, inline = 0;
  for(const f of files){
    const rel = path.relative(ROOT, f), code = fs.readFileSync(f, 'utf8');
    if(f.endsWith('.html')){
      // كل <script> جوّه الصفحة (من غير src) — نفس نوع الباج بيحصل هنا برضه
      const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
      let m, i = 0;
      while((m = re.exec(code))){
        if(/\bsrc=/i.test(m[1])) continue;
        if(/type\s*=\s*["'](?!text\/javascript|module)/i.test(m[1])) continue;   // application/json وخلافه
        i++; inline++;
        parseCheck(m[2], rel + ' → <script> #' + i);
      }
    }else{ js++; parseCheck(code, rel); }
  }
  say(`1️⃣ التفسير: ${js} ملف JS · ${inline} سكربت جوّه HTML`);
}

/* ---------- 2) شاشات التابلت بتتبني فعلًا ---------- */
function step2(){
  let JSDOM;
  try{ ({ JSDOM } = require('jsdom')); }
  catch(e){ say('2️⃣ الشاشات: jsdom مش متثبّت — اتخطّت (npm i)'); return; }
  const cases = [
    { file: 'feedback/instapay-tablet.js', needs: ['ipWrap', 'ipWait', 'ipScan', 'ipAmt', 'ipQrImg', 'ipVid'] },
    { file: 'feedback/app-invite.js',      needs: ['aiWrap'] }
  ];
  for(const c of cases){
    const full = path.join(ROOT, c.file);
    if(!fs.existsSync(full)){ fail('❌ ' + c.file + ' مش موجود'); continue; }
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
      { pretendToBeVisual: true, url: 'https://echarpe.store/feedback/' });   // من غير url الـlocalStorage بيرمي
    const w = dom.window;
    // بدائل صامتة للحاجات اللي بتيجي من فايربيز/الجهاز — إحنا بنختبر إن الشاشة **اتبنت**
    const nop = () => {}, aNop = async () => ({ exists: () => false, data: () => ({}) });
    const stub = new Proxy(function(){}, { get: () => nop, apply: () => undefined });
    try{
      const body = bodyOf(fs.readFileSync(full, 'utf8'));
      new Function('window','document','localStorage','navigator','fetch','getFirestore','doc','getDoc','getDocs',
        'onSnapshot','collection','query','where','limit','updateDoc','setDoc','addDoc','serverTimestamp',
        'httpsCallable','getFunctions','Image','console',
        body)(
        w, w.document, w.localStorage, w.navigator, nop, () => stub, () => ({}), aNop, async () => ({ empty: true, docs: [] }),
        nop, () => ({}), () => ({}), () => ({}), () => ({}), nop, nop, nop, () => 0,
        () => nop, () => ({}), w.Image, { log: nop, warn: nop, error: nop });
      const missing = c.needs.filter(id => !w.document.getElementById(id));
      if(missing.length) fail('❌ ' + c.file + ' — الشاشة ماتبنتش: ناقص ' + missing.join(', '));
    }catch(e){ fail('❌ ' + c.file + ' — وقع وهو بيتنفّذ: ' + e.message); }
    dom.window.close();
  }
  say('2️⃣ الشاشات: اتبنت في DOM حقيقي');
}

/* ---------- 3) الاختبارات مقارنة بخط الأساس ---------- */
function runSuite(file){
  const r = cp.spawnSync('node', [path.join(__dirname, file)], { cwd: ROOT, encoding: 'utf8', timeout: 20 * 60 * 1000, env: Object.assign({}, process.env, { TZ: process.env.TZ || 'Africa/Cairo' }) });
  const out = (r.stdout || '') + (r.stderr || '');
  const list = [];
  const i = out.indexOf('\nالفشل:');
  if(i > 0) out.slice(i).split('\n').filter(l => l.startsWith(' - ')).forEach(l => list.push(l.slice(3).trim()));
  out.split('\n').filter(l => l.includes('❌') && l.includes('→')).forEach(l => list.push(l.trim()));
  return { out, list };
}
function step3(update){
  const res = { 'run.js': runSuite('run.js'), 'run-async.js': runSuite('run-async.js') };
  const now = {}; Object.keys(res).forEach(k => now[k] = res[k].list.slice().sort());
  if(update){
    fs.writeFileSync(BASELINE, JSON.stringify({ at: new Date().toISOString(), failures: now }, null, 2));
    say('📝 خط الأساس اتسجّل: ' + Object.keys(now).map(k => k + '=' + now[k].length).join(' · '));
    return;
  }
  if(!fs.existsSync(BASELINE)){ fail('❌ مفيش خط أساس — شغّل: node tests/gate.js --update-baseline'); return; }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).failures || {};
  let newly = 0, fixed = 0;
  Object.keys(now).forEach(k => {
    const was = new Set(base[k] || []);
    now[k].filter(m => !was.has(m)).forEach(m => { newly++; fail('❌ فشل جديد في ' + k + ': ' + m.slice(0, 160)); });
    fixed += (base[k] || []).filter(m => !now[k].includes(m)).length;
  });
  say(`3️⃣ الاختبارات: ${Object.keys(now).map(k => k + '=' + now[k].length).join(' · ')} فاشل` +
      ` (معروف) · جديد: ${newly}${fixed ? ' · اتصلّح: ' + fixed : ''}`);
}

/* ---------- 4) الزيب = اللي اتفحص ---------- */
function step4(zip){
  if(!zip) return;
  const r = cp.spawnSync('unzip', ['-o', '-q', zip, '-d', '/tmp/_gate_zip'], { encoding: 'utf8' });
  if(r.status !== 0){ fail('❌ مقدرتش أفك الزيب: ' + (r.stderr || '')); return; }
  const files = [];
  walk('/tmp/_gate_zip', files);
  const all = [];
  (function w2(d){ fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name); e.isDirectory() ? w2(p) : all.push(p); }); })('/tmp/_gate_zip');
  let same = 0;
  all.forEach(p => {
    const rel = path.relative('/tmp/_gate_zip', p), src = path.join(ROOT, rel);
    if(!fs.existsSync(src)) return fail('❌ ' + rel + ' في الزيب ومش في الشجرة المتفحوصة');
    if(!fs.readFileSync(p).equals(fs.readFileSync(src))) fail('❌ ' + rel + ' في الزيب **مختلف** عن اللي اتفحص');
    else same++;
  });
  cp.spawnSync('rm', ['-rf', '/tmp/_gate_zip']);
  say('4️⃣ الزيب: ' + same + '/' + all.length + ' ملف مطابق');
}

const args = process.argv.slice(2);
const zip = args.includes('--zip') ? args[args.indexOf('--zip') + 1] : null;
const update = args.includes('--update-baseline');
say('🚦 البوابة\n');
step1();
step2();
if(args.includes('--quick')) say('3️⃣ الاختبارات: اتخطّت (--quick) — ممنوع التسليم بيها');
else step3(update);
step4(zip);
say('');
if(problems.length){
  problems.slice(0, 40).forEach(p => say(p));
  say('\n🔴 البوابة حمرا — ' + problems.length + ' مشكلة. ممنوع التسليم.');
  process.exit(1);
}
say('✅ البوابة خضرا — جاهز للتسليم.');
