#!/usr/bin/env node
// test-instapay-flip.js (kiosk v703) — «الصورة متشقلبة وبيفضل بنقرا»: القلب كان بيتحفظ للأبد من أول لقطة فاضية
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'feedback', 'instapay-tablet.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
function extractFn(s, h){ const at = s.indexOf(h); if(at < 0) throw new Error(h); let i = s.indexOf('{', at + h.length - 1), d = 0, q = null;
  for(; i < s.length; i++){ const c = s[i]; if(q){ if(c === '\\'){ i++; continue; } if(c === q) q = null; continue; }
    if(c === '/' && s[i+1] === '/'){ while(s[i] !== '\n') i++; continue; } if(c === '/' && s[i+1] === '*'){ i = s.indexOf('*/', i) + 1; continue; }
    if(c === '"' || c === "'" || c === '`'){ q = c; continue; } if(c === '{') d++; else if(c === '}'){ d--; if(!d) return s.slice(at, i + 1); } } throw new Error('braces'); }

function mk(stored, reader){
  const ls = { v: stored == null ? null : stored }, st = { sent:[], flipClass:false, hint:'' };
  const el = id => ({ get videoWidth(){ return 640; }, readyState: 4, classList:{ toggle: (c, on) => { if(c === 'flip') st.flipClass = on; } }, set textContent(t){ if(id === 'ipHint') st.hint = t; }, set innerHTML(x){} });
  const ctx = { st, Math, String, Number, Date, Uint8Array, console:{ warn(){} },
    localStorage:{ getItem: k => (k.indexOf('insta_flip2_') === 0 ? ls.v : null), setItem: (k, v) => { if(k.indexOf('insta_flip2_') === 0) ls.v = v; } },
    $: el, branch:'Glow', cur:{ sid:'s1' }, busy:false, prevGray:null,
    // v707: tick بقى بيتأكد إن شاشة المسح هي المفتوحة وإن الرد لسه للطلب ده
    curPane:'scan', stream:{}, document:{ hidden:false }, nextScanAt:0, scanGeneration:0, readErrors:0,
    scanCore: require(path.join(__dirname, '..', 'feedback', 'instapay-scan-core.js')),
    grayOf: () => { const g = new Uint8Array(96 * 128); for(let i = 0; i < g.length; i++) g[i] = (i % 7) * 30; return g; },
    diffScore: () => 0, paintChecks(){}, stopCam(){}, show(){},
    frameJpeg: () => 'IMG', callScan: async p => { const flipped = vm.runInContext('flipCapture', ctx); st.sent.push(flipped); return { data: reader(flipped, st.sent.length) }; } };
  vm.createContext(ctx);
  const code = src.slice(src.indexOf("const FLIP_KEY = 'insta_flip2_'"), src.indexOf('\n', src.indexOf("let flipCapture = localStorage.getItem(FLIP_KEY)")))
    + '\n' + extractFn(src, 'function setFlipView(') + '\n' + extractFn(src, 'function setFlip(') + '\n' + extractFn(src, 'async function tick(')
    + ';this.ls = () => localStorage.getItem(FLIP_KEY);';
  vm.runInContext(code, ctx); ctx._ls = ls; return ctx;
}
const BLIND = () => ({ checks:{} }), SEES = () => ({ checks:{ amount:true } });

(async function(){
  console.log('\n🔄 1) لقطة فاضية مبتقلبش الكاميرا للأبد');
  let c = mk(null, BLIND);
  await c.tick();
  ok(c.st.sent.length === 1 && c.st.flipClass === false, '⭐ لقطة عمى واحدة (العميلة لسه مرفعتش الموبايل) = مفيش قلب (كان: قلب فورًا)');
  await c.tick();
  ok(c.st.flipClass === true && c._ls.v === null, 'لقطتين عمى = **تجربة** قلب — ومش محفوظة');
  await c.tick(); await c.tick();
  ok(c.st.flipClass === false && c._ls.v === null, '⭐ التجربة فشلت كمان = رجوع للطبيعي، ومفيش حاجة اتحفظت (كان: مقلوب للأبد)');
  await c.tick(); await c.tick(); await c.tick();
  ok(c.st.flipClass === false, 'ومفيش تذبذب — التجربة مرة واحدة في العملية');

  console.log('✅ 2) التابلت اللي فعلًا بيعكس');
  c = mk(null, (flipped) => flipped ? SEES() : BLIND());
  await c.tick(); await c.tick(); await c.tick();
  ok(c.st.flipClass === true && c._ls.v === '1', 'القلب اتقرا منه ← **ساعتها بس** بيتحفظ للجهاز');
  c = mk('1', (flipped) => flipped ? SEES() : BLIND());
  await c.tick();
  ok(c.st.sent[0] === true, 'والمرة الجاية بيبدأ مقلوب على طول');

  console.log('🧹 3) التابلتات اللي اتحفظ عليها القلب الغلط');
  ok(/const FLIP_KEY = 'insta_flip2_' \+ branch;/.test(src), 'مفتاح جديد (flip2) — القديم الغلط اتنسى');
  c = mk(null, SEES); await c.tick();
  ok(c.st.sent[0] === false && c.st.flipClass === false, 'طبيعي من أول لقطة');

  console.log('📉 4) فريم فاضي مبيتبعتش');
  const c2 = mk(null, SEES); c2.grayOf = () => new Uint8Array(96 * 128).fill(90);
  await c2.tick();
  ok(c2.st.sent.length === 0 && /قرّبي|جوّه الإطار/.test(c2.st.hint), 'فريم من غير تفاصيل = مبيتبعتش (بيوفّر حصة القراءة) + «قرّبي شاشة الإيصال»');
  ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'feedback', 'sw.js'), 'utf8'), 703), 'kiosk ≥ v703');
  console.log('\n' + (fail ? '❌' : '✅') + ' test-instapay-flip: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
})().catch(e => { console.error('💥', e); process.exitCode = 1; });
