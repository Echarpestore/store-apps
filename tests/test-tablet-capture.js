#!/usr/bin/env node
// ============================================================
// test-tablet-capture.js (POS v715 · kiosk v695) — «العميلة تسجّل بنفسها» على التابلت
//   باج 1: «أهلًا بيكي» ودعوة التطبيق بيظهروا مرتين.   باج 2: عميلة جديدة بتتملي بياناتها والكاشير لازم تدوس «سجّل».
// سلوك فعلي على المنطق الحقيقي للكشك وPOS. يتشغّل لوحده: node tests/test-tablet-capture.js
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const kiosk = fs.readFileSync(path.join(ROOT, 'feedback', 'index.html'), 'utf8');
const sale = fs.readFileSync(path.join(ROOT, 'pos', 'pos-sale.js'), 'utf8');
const invite = fs.readFileSync(path.join(ROOT, 'feedback', 'app-invite.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
function extractFn(src, header){
  const at = src.indexOf(header);
  if(at < 0) throw new Error('extractFn: مش لاقي «' + header + '»');
  let i = src.indexOf('{', at + header.length - 1), depth = 0, q = null;
  for(; i < src.length; i++){
    const c = src[i];
    if(q){ if(c === '\\'){ i++; continue; } if(c === q) q = null; continue; }
    if(c === '/' && src[i+1] === '/'){ while(i < src.length && src[i] !== '\n') i++; continue; }
    if(c === '/' && src[i+1] === '*'){ i = src.indexOf('*/', i) + 1; continue; }
    if(c === '"' || c === "'" || c === '`'){ q = c; continue; }
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('extractFn: أقواس مش متوازنة «' + header + '»');
}

(async function(){
  console.log('\n🔁 1) الترحيب مرة واحدة');
  const k0 = kiosk.indexOf('/* >>> CAP_KIOSK_START */'), k1 = kiosk.indexOf('/* <<< CAP_KIOSK_END */');
  if(k0 < 0 || k1 < k0) throw new Error('بلوك الكشك مش موجود');
  const K = { Date, String }; vm.createContext(K); vm.runInContext(kiosk.slice(k0, k1), K);
  const NOW = 1758400000000;
  // محاكاة حلقة الكشك بالظبط: كل snapshot → view → لو greet نعدّ ونحفظ المفتاح
  function runKiosk(snaps){
    let greeted = '', shows = 0;
    snaps.forEach(d => { const v = K.capKioskView(d, null, NOW + 1000, greeted); if(v.view === 'greet'){ shows++; greeted = v.key || ''; } });
    return shows;
  }
  const greet = { mode:'greet', greetName:'منى', isNew:true, ts:NOW, askId:'a1' };
  const story = [ greet,
    Object.assign({}, greet, { shownAskId:null, shownAt:0, kioskSeen:NOW + 4100 }),   // الترحيب قفل → الكشك كتب تأكيد القفل
    Object.assign({}, greet, { kioskSeen:NOW + 20000 }),                              // النبضة
    Object.assign({}, greet, { kioskSeen:NOW + 40000 }),
    Object.assign({}, greet, { kioskSeen:NOW + 60000 }) ];
  ok(runKiosk(story) === 1, '⭐ نفس الترحيب + تأكيد القفل + 3 نبضات = «أهلًا بيكي» **مرة واحدة** (كان 5) — طلع ' + runKiosk(story));
  ok(K.capKioskView(greet, null, NOW + 1000, '').view === 'greet' && !!K.capKioskView(greet, null, NOW + 1000, '').key, 'أول مرة بيتعرض ومعاه مفتاح');
  ok(runKiosk([greet, Object.assign({}, greet, { ts:NOW + 90000, askId:'a2', greetName:'سارة' })]) === 2, 'عميلة تانية بعدها (طلب جديد) = ترحيب جديد عادي');
  ok(runKiosk([greet, Object.assign({}, greet, { ts:NOW + 5000 })]) === 2, 'نفس الطلب بـts جديد (الكاشير بعت تاني) = بيتعرض');
  ok(K.capKioskView({ mode:'ask', ts:NOW, askId:'a3' }, null, NOW + 10, 'a1:' + NOW).view === 'phone', 'طلب رقم جديد متأثرش');
  ok(K.capKioskView({ mode:'need_name', ts:NOW, askId:'a3', phone:'01011111111' }, null, NOW + 10, 'x').view === 'name', 'وطلب الاسم متأثرش');
  ok(K.capKioskView(greet, null, NOW + 301000, '').view === 'hide', 'ترحيب قديم (5 دقايق) = مخفي زي الأول');
  ok(/capKioskView\(data, _capHandled, undefined, _capGreetedKey\)/.test(kiosk) && /_capGreetedKey = v\.key \|\| '';/.test(kiosk), 'الكشك موصّل: بيبعت المفتاح وبيحفظه لما يعرض');
  ok(/if \(!force && Date\.now\(\) - lastShownAt < 60000\) return;/.test(invite), 'ودعوة التطبيق عليها حزام أمان: مرة كل دقيقة بحد أقصى');

  console.log('🆕 2) عميلة التابلت بتتسجّل فعلًا');
  function mkPos(o){
    o = o || {};
    const st = { sets:[], gets:0, logs:[], els:{ newCustomerRow:{ style:{ display:'flex' } }, customerInfo:{ textContent:'' } }, refreshed:0 };
    const ctx = { st, window:{}, console:{ warn(){} }, Date, String, Promise,
      currentBranch:'Rehab', TEST_CUSTOMERS:'cust',
      normalizePhone: p => p, phoneRejectReason: p => (/^01\d{9}$/.test(p) ? null : 'رقم غلط'),
      refreshCustomerInfo: () => { st.refreshed++; }, _logActivity: (t, d) => st.logs.push([t, d]),
      firebase: { firestore: { FieldValue: { serverTimestamp: () => '__ts__' } } },
      document: { getElementById: id => st.els[id] || null },
      db: { collection: () => ({ doc: id => ({
        get: async () => { st.gets++; if(o.getFails) throw new Error('offline'); return { exists: !!o.exists }; },
        set: async (data, opt) => { if(o.setFails) throw new Error('denied'); st.sets.push({ id, data, opt }); } }) }) } };
    vm.createContext(ctx); vm.runInContext(extractFn(sale, 'async function capAutoRegister('), ctx); return ctx;
  }
  let p = mkPos({ exists:false }); let r = await p.capAutoRegister('01225406743', 'ريم');
  ok(r === true && p.st.sets.length === 1, 'عميلة جديدة = المستند بيتكتب **من غير دوسة «سجّل»**');
  const d = p.st.sets[0] || { data:{} };
  ok(d.id === '01225406743' && d.data.name === 'ريم' && d.data.phone === '01225406743' && d.data.points === 0 && d.data.branch === 'Rehab', 'بالاسم والرقم والفرع ونقط صفر (الرولز: الإنشاء لازم points=0)');
  ok(d.data.source === 'kiosk_self' && d.data.createdAt === '__ts__', 'ومتعلّم إنها سجّلت نفسها');
  ok(p.st.els.newCustomerRow.style.display === 'none' && /ريم/.test(p.st.els.customerInfo.textContent), 'وصف «مش مسجّل / سجّل» بيختفي من شاشة الكاشير');
  ok(p.st.logs.some(l => l[0] === 'customer_self_registered'), 'وبيتسجل في النشاط');
  p = mkPos({ exists:true }); r = await p.capAutoRegister('01225406743', 'ريم');
  ok(r === true && p.st.sets.length === 0, '⛔⭐ عميلة **موجودة** = ولا كتابة (merge مع points:0 كان هيصفّر نقطها)');
  p = mkPos({}); ok((await p.capAutoRegister('01225406743', '')) === false && p.st.sets.length === 0, 'من غير اسم = مبيسجّلش');
  p = mkPos({}); ok((await p.capAutoRegister('0122', 'ريم')) === false && p.st.gets === 0, 'رقم غلط = مبيسجّلش ومبيقراش');
  p = mkPos({ setFails:true }); ok((await p.capAutoRegister('01225406743', 'ريم')) === false, 'الكتابة اترفضت = false (الكاشير تتنبّه تدوس «سجّل»)');
  p = mkPos({ getFails:true }); ok((await p.capAutoRegister('01225406743', 'ريم')) === false && p.st.sets.length === 0, 'النت قاطع = false ومن غير كتابة عميا');

  const named = sale.slice(sale.indexOf("if(data.mode === 'named'){"), sale.indexOf("if(data.mode === 'named'){") + 1500);
  const iReg = named.indexOf('await capAutoRegister(phone, _nm)'), iGreet = named.indexOf("mode:'greet'");
  ok(iReg > 0 && iGreet > iReg, 'التسجيل **قبل** الترحيب — التابلت ميقولش «اتسجلتي معانا» قبل ما يحصل');
  ok(/_regOk \?[\s\S]{0,200}دوسي «سجّل»/.test(named), 'والتوست صادق: لو التسجيل متمّش بيقول للكاشير تدوس «سجّل»');
  ok(!/عميل جديد اتسجل في الفاتورة/.test(sale), 'التوست القديم اللي كان بيقول «اتسجل» وهو ماتسجلش — اتشال');

  console.log('📲 2ب) العميلة **المسجّلة** اللي معندهاش التطبيق بتتدعى (v716 / kiosk v698)');
  function mkInv(branch, o){
    o = o || {};
    const st = { writes:[] };
    const ctx = { st, window:{}, Set, Date, String, Object, Array,
      GLOW_BRANCHES:['Glow'], currentBranch: branch, bizDayKey: () => (o.day || '2026-09-21'),
      _capDocRef: () => ({ set: d => { st.writes.push(d); return Promise.resolve(); } }) };
    vm.createContext(ctx);
    vm.runInContext('let _capAskId = ' + JSON.stringify(o.askId || null) + ';\n'
      + ['function capBrandKey(', 'function custHasBrandApp(', 'function _capInviteKey(', 'function capMarkInvited(', 'function capInviteIfNoApp(']
          .map(h => extractFn(sale, h)).join('\n').replace('function _capInviteKey(', 'const _capInvitedToday = new Set();\nfunction _capInviteKey(')
      + ';this.setDay = d => { bizDayKey = () => d; };', ctx);
    return ctx;
  }
  let v = mkInv('echarpe El Rehab');
  ok(v.capInviteIfNoApp('01011111111', { name:'منى', points:40 }) === true && v.st.writes.length === 1, '⭐ مسجّلة + معندهاش التطبيق + الكاشير كتبت رقمها في POS = التابلت بياخد ترحيب ودعوة (كان: ولا حاجة)');
  const w = v.st.writes[0] || {};
  ok(w.mode === 'greet' && w.invite === true && w.isNew === false && w.greetName === 'منى' && /^inv_/.test(w.askId), 'الرسالة: ترحيب باسمها + `invite:true` + مش «جديدة»');
  ok(v.capInviteIfNoApp('01011111111', { name:'منى' }) === false && v.st.writes.length === 1, 'نفس الرقم تاني في نفس اليوم (الكاشير مسحت وكتبت) = مفيش دعوة تانية');
  v.setDay('2026-09-22'); ok(v.capInviteIfNoApp('01011111111', { name:'منى' }) === true, 'تاني يوم = بتتدعى تاني (لحد ما تنزّله)');
  v = mkInv('echarpe El Rehab');
  ok(v.capInviteIfNoApp('0102', { name:'x', fcmTokens_echarpe:['t'] }) === false && v.st.writes.length === 0, 'عندها تطبيق echarpe = مفيش دعوة');
  ok(v.capInviteIfNoApp('0103', { name:'x', welcomeGranted_echarpe:true }) === false, 'خدت هدية ترحيب التطبيق = عندها');
  ok(v.capInviteIfNoApp('0104', { name:'x', source:'loyalty_app:qr' }) === false, 'اتسجلت من التطبيق أصلًا = عندها');
  ok(v.capInviteIfNoApp('0105', { name:'x', loyaltyCode:'ECH 1234 5678' }) === true, '⭐ `loyaltyCode` لوحده **مش دليل** (استيراد QuickBooks بيديه لكل العملاء) = بتتدعى');
  ok(v.capInviteIfNoApp('0106', { name:'x', fcmTokens_glow:['t'], fcmTokenAt:1 }) === true, '⭐ عندها تطبيق **Glow** بس وهي في فرع echarpe = بتتدعى لتطبيق echarpe');
  v = mkInv('Glow');
  ok(v.capInviteIfNoApp('0107', { name:'x', fcmTokens_echarpe:['t'] }) === true, 'والعكس: عندها echarpe وهي في Glow = بتتدعى لـGlow');
  ok(v.capInviteIfNoApp('0108', { name:'x', fcmTokens_glow:['t'] }) === false, 'عندها Glow في Glow = لأ');
  ok(v.capInviteIfNoApp('0109', { name:'x', fcmTokens:{ tok1:{ brand:'glow', ts:1 } } }) === false, 'الشكل القديم للتوكنات بيتقري بالبراند');
  v = mkInv('echarpe El Rehab', { askId:'ask_77' });
  ok(v.capInviteIfNoApp('0110', { name:'x' }) === false && v.st.writes.length === 0, 'التابلت عليه طلب رقم شغّال = منقاطعهوش');
  v = mkInv('echarpe El Rehab'); v.capMarkInvited('0111');
  ok(v.capInviteIfNoApp('0111', { name:'x' }) === false, 'عميلة جاية من مسار التابلت نفسه (اترحّب بيها خلاص) = مفيش ترحيب تاني من POS');
  ok(v.capInviteIfNoApp('', { name:'x' }) === false && v.capInviteIfNoApp('0112', null) === false, 'مدخلات ناقصة = لأ');

  const rci = extractFn(sale, 'async function refreshCustomerInfo(');
  const iHook = rci.indexOf('if(doc.exists) capInviteIfNoApp(phone, doc.data() || {});');
  ok(iHook > 0 && iHook > rci.indexOf('if(_stale()) return;'), 'متوصّلة في `refreshCustomerInfo` بعد فحص «الرقم اتغيّر» — بنفس القراءة (صفر قراءات زيادة)');
  ok(/capMarkInvited\(phone\);[^\n]*\n\s*_capFill\(phone, cust\.name/.test(sale) && /capMarkInvited\(phone\);\s*\n\s*_capFill\(phone, _nm\)/.test(sale), 'ومسارين التابلت بيعلّموا الرقم قبل `_capFill` (اللي بينادي refreshCustomerInfo)');
  ok(/invite: !custHasBrandApp\(cust, capBrandKey\(\)\)/.test(sale) && /isNew:true, ts:Date\.now\(\), askId:_capAskId, invite:true/.test(sale), 'وترحيب التابلت نفسه شايل قرار الدعوة (موجودة: حسب التطبيق · جديدة: دايمًا)');

  // الكشك
  const gv = K.capKioskView({ mode:'greet', greetName:'منى', ts:NOW, askId:'inv_1', invite:true }, null, NOW + 10, '');
  ok(gv.view === 'greet' && gv.invite === true, 'الكشك بيمرّر `invite:true`');
  ok(K.capKioskView({ mode:'greet', ts:NOW, askId:'a9', invite:false }, null, NOW + 10, '').invite === false, 'و`invite:false`');
  ok(K.capKioskView({ mode:'greet', ts:NOW, askId:'a9' }, null, NOW + 10, '').invite === undefined, 'وPOS قديم (من غير الحقل) = undefined ← الكشك يفحص بنفسه');
  ok(/window\.__capInvite = v\.invite;/.test(kiosk), 'وبيسلّمه لشاشة الدعوة');
  const sh = invite.slice(invite.indexOf('async function show('), invite.indexOf('async function show(') + 1400);
  ok(/var hint = window\.__capInvite; window\.__capInvite = undefined;/.test(sh), 'شاشة الدعوة بتستهلك القرار مرة واحدة');
  ok(/if \(!force && hint === false\) return;/.test(sh) && /if \(!force && hint !== true && await hasApp\(_phone\)\) return;/.test(sh), 'false = متعرضش · true = اعرضي من غير فحص · مفيش قرار = فحص محلي');
  const ha = invite.slice(invite.indexOf('async function hasApp('), invite.indexOf('async function hasApp(') + 1500);
  ok(/var bk = brandKey\(\);/.test(ha) && /d\['fcmTokens_' \+ bk\]/.test(ha) && !/if \(d\.fcmTokenAt\) return true;/.test(ha), 'والفحص المحلي بقى بالبراند (مش `fcmTokenAt` العام)');

  console.log('🖼️ 3) لقطات Glow');
  const g = invite.slice(invite.indexOf('    glow: {'), invite.indexOf('  function brandKey'));
  const gs = (g.match(/src: '(invite\/[\w-]+\.jpg)'/g) || []).map(m => m.match(/'([^']+)'/)[1]);
  ok(gs.length === 3 && gs.every(f => fs.existsSync(path.join(ROOT, 'feedback', f))), 'Glow بقى ليه 3 لقطات وملفاتهم موجودة');
  ok(gs.every(f => fs.statSync(path.join(ROOT, 'feedback', f)).size < 160 * 1024), 'وخفيفة على نت الفرع');
  ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8'), 716) && swAtLeast(fs.readFileSync(path.join(ROOT, 'feedback', 'sw.js'), 'utf8'), 698), 'POS ≥ v716 · kiosk ≥ v698');

  console.log('\n' + (fail ? '❌' : '✅') + ' test-tablet-capture: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
})().catch(e => { console.error('💥', e); process.exitCode = 1; });
