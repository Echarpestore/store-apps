// v757 — شاشة «في انتظار التأكيد»: إنستاباي (من غير مسح إيصال) + فيزا لايف
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const C = require(path.join(root, 'pos', 'pay-live-core.js'));

// ===== المدة المعتادة =====
assertEq(C.etaFrom([], 'instapay'), 40000, 'من غير بيانات: إنستاباي 40 ثانية');
assertEq(C.etaFrom([5000, 6000], 'card'), 25000, 'أقل من 3 عينات: الافتراضي');
assertEq(C.etaFrom([20000, 30000, 25000], 'instapay'), 27500, 'وسيط × 1.1');
assertEq(C.etaFrom([20000, 30000, 25000, 600000, 590000], 'card'), 33000, 'الوسيط مش المتوسط — حالة شاذة مش بتبوّظه');
assertEq(C.etaFrom([2000, 2100, 2200], 'card'), 8000, 'سقف أدنى 8 ثواني');
assertEq(C.etaFrom([1000000, 980000, 970000], 'card'), 25000, 'سلبي: عينات أطول من 15 دقيقة بتتشال (غلط)');
let s = []; for(let i = 0; i < 30; i++) s = C.addSample(s, 10000 + i);
assertEq(s.length, 20, 'آخر 20 بس');
assertEq(C.addSample([1, 2], 500).length, 0, 'سلبي: أقل من 1.5 ثانية مش عينة حقيقية');

// ===== منحنى التقدّم =====
const E = 30000;
assertEq(C.progressAt(0, E), 1, 'بيبدأ 1%');
const atE = C.progressAt(E, E);
assert(atE >= 94 && atE <= 95, 'عند المدة المعتادة ≈95%: ' + atE);
assert(C.progressAt(E / 2, E) > 70, 'سريع في الأول (نص المدة > 70%)');
let prev = 0, mono = true;
for(let t = 0; t <= 10 * E; t += 500){ const p = C.progressAt(t, E); if(p < prev) mono = false; prev = p; }
assert(mono, 'مبيرجعش لورا أبدًا');
assertEq(C.progressAt(100 * E, E), 99, 'مبيوصلش 100 من غير تأكيد');
assert(C.progressAt(2 * E, E) < 99, 'بعد المدة: زحف بطيء مش قفزة');

// ===== المراحل =====
assert(/حطّي الكارت/.test(C.phase(1000, E, 'card', 'customer')), 'كارت/عميلة: حطّي الكارت');
assert(/البنك بيراجع/.test(C.phase(E * 0.5, E, 'card', 'staff')), 'منتصف: البنك بيراجع');
assert(/أكّدي يدوي/.test(C.phase(E * 4, E, 'instapay', 'staff')), 'إنستاباي متأخر جدًا: الكاشير تتعرض عليها اليدوي');
assert(!/يدوي/.test(C.phase(E * 4, E, 'instapay', 'customer')), 'سلبي: العميلة مبتشوفش كلام الكاشير');
assert(C.isLate(E * 3.1, E) && !C.isLate(E * 2, E), 'متأخر = أكتر من 3 أضعاف');

// ===== أسباب الرفض =====
assertEq(C.reasonAr('51'), 'الرصيد مش كفاية', 'كود 51');
assertEq(C.reasonAr('Insufficient Funds'), 'الرصيد مش كفاية', 'نص Paymob');
assertEq(C.reasonAr('5'), C.reasonAr('05'), 'كود من رقم واحد = بصفر');
assertEq(C.reasonAr('Do not honour'), C.reasonAr('05'), 'Do not honour (إنجليزي بريطاني)');
assertEq(C.reasonAr('Expired Card'), 'الكارت منتهي', 'منتهي');
assertEq(C.reasonAr('Incorrect PIN'), 'الرقم السري غلط', 'رقم سري');
assert(/اتلغت/.test(C.reasonAr('Cancelled by user')), 'اتلغت من الماكينة');
assert(/البنك رفض العملية \(XYZ\)/.test(C.reasonAr('XYZ')), 'سلبي: سبب مش معروف بيظهر زي ما هو بين قوسين');
assertEq(C.reasonAr(null), 'البنك رفض العملية', 'من غير سبب');

// ===== التوصيل =====
const PI = fs.readFileSync(path.join(root, 'pos', 'index.html'), 'utf8');
const order = ['pos-sale.js?v=', 'pay-live-core.js?v=757', 'pay-live-ring.js?v=757', 'pay-live.js?v=757', 'instapay-pos.js?v=757'].map(x => PI.indexOf(x));
assert(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), 'POS: الترتيب pos-sale ← core ← ring ← pay-live ← instapay');
const FI = fs.readFileSync(path.join(root, 'feedback', 'index.html'), 'utf8');
assert(FI.indexOf('../pos/pay-live-core.js?v=757') > 0 && FI.indexOf('../pos/pay-live-ring.js?v=757') < FI.indexOf('instapay-tablet.js?v=757') && /pay-live-tablet\.js\?v=757/.test(FI), 'التابلت: المحرك والدايرة قبل الشاشات');
const IT = fs.readFileSync(path.join(root, 'feedback', 'instapay-tablet.js'), 'utf8');
const _d0 = IT.indexOf("$('ipDone').onclick"); const done = IT.slice(_d0, IT.indexOf("$('ipVBack').onclick", _d0));
assert(/show\('verify'\); vStart\(\)/.test(done) && !/startCam/.test(done), 'التابلت: «تم التحويل» = عداد التأكيد، مش كاميرا');
assert(/else if \(s\.status === 'scanning'\) \{ stopCam\(\); if \(curPane !== 'verify'\) show\('verify'\); vStart\(\); \}/.test(IT), 'التابلت: حالة scanning مبتفتحش الكاميرا');
assert(!/s\.status === 'scanning'\) \{ if \(!stream\) \{ show\('scan'\)/.test(IT), 'سلبي: مسار الكاميرا القديم اتشال من الاستماع');
const IP = fs.readFileSync(path.join(root, 'pos', 'instapay-pos.js'), 'utf8');
assert(/#ipPosBox \.ipRow\{display:none\}/.test(IP) && /id="ipPosRing"/.test(IP), 'POS: مؤشرات المسح اتشالت والدايرة مكانها');
assert(/st\.mode === 'bank' && ipT0 && window\.PayLive\) window\.PayLive\.record\('instapay'/.test(IP), 'POS: وقت تأكيد البنك بيتسجّل عشان المرة الجاية');
assert(/id="ipPosManual"/.test(IP), 'POS: التأكيد اليدوي لسه موجود للطوارئ');
const PT = fs.readFileSync(path.join(root, 'feedback', 'pay-live-tablet.js'), 'utf8');
assert(!/setDoc|updateDoc|addDoc/.test(PT), 'سلبي: التابلت مبيكتبش حاجة');
const PL = fs.readFileSync(path.join(root, 'pos', 'pay-live.js'), 'utf8');
const pubBlock = PL.slice(PL.indexOf("publish({ state: 'approved'"), PL.indexOf("publish({ state: 'approved'") + 80);
assert(!/cardLast4|last4/.test(pubBlock) && !/publish\([^)]*last4/.test(PL), 'سلبي: آخر 4 أرقام مش بتتبعت للتابلت');
for(const [f, re] of [['pos/sw.js', /pos-shell-v7(5[8-9]|[6-9]\d)/], ['feedback/sw.js', /feedback-shell-v7(1[1-9]|[2-9]\d)/]])
  assert(re.test(fs.readFileSync(path.join(root, f), 'utf8')), f + ' اترفع');

// ===== تشغيل حقيقي للوحة الكارت على POS =====
const run = m => JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, '_helpers', 'pay-live-run.js'), m], { encoding:'utf8', timeout:15000 }));
let r = run('ok');
assert(r.calls[0] === 'send:350' && r.calls.filter(c => c.startsWith('watch')).length === 2, 'الدوال الأصلية لسه بتتنده زي ما هي (اللف شفاف)');
const live = r.writes.filter(w => w.id === 'paylive_echarpe Madinaty').map(w => w.d.state);
assertEq(live, ['waiting', 'approved'], 'التابلت: منتظر ← اتقبلت (والرد المتأخر بعد النجاح اتجاهل)');
assert(r.writes.find(w => w.d.state === 'waiting').d.etaMs === 24200, 'المدة المعتادة من بيانات الفرع (وسيط 22000 × 1.1)');
assert(r.ring.includes('OK') && !r.ring.includes('BAD'), 'الدايرة: ✓');
assert(/اتقبلت/.test(r.st) && /Visa ••4417/.test(r.sub), 'POS: نوع الكارت وآخر 4 أرقام للكاشير');
assert(!r.writes.some(w => JSON.stringify(w.d).includes('4417')), 'سلبي: آخر 4 أرقام مااتبعتتش للتابلت');
assert(r.writes.some(w => w.id === 'payeta_echarpe Madinaty' && Array.isArray(w.d.card) && w.d.card.length === 4), 'وقت العملية اتسجّل في بيانات الفرع');
r = run('bad');
assertEq(r.writes.filter(w => w.id.startsWith('paylive_')).map(w => w.d.state), ['waiting', 'declined'], 'رفض: منتظر ← اترفضت');
assert(r.writes.find(w => w.d.state === 'declined').d.reason === 'الرصيد مش كفاية' && /الرصيد مش كفاية/.test(r.sub), 'السبب بالعربي على الشاشتين');
assert(!r.writes.some(w => w.id.startsWith('payeta_')), 'سلبي: الرفض مش بيتحسب في المدة المعتادة');
r = run('cancel');
assertEq(r.writes.filter(w => w.id.startsWith('paylive_')).map(w => w.d.state), ['waiting', 'cancelled'], 'إلغاء: التابلت بيقفل');

// ===== الدايرة (بعد الفحص بالصور) =====
const RG = fs.readFileSync(path.join(root, 'pos', 'pay-live-ring.js'), 'utf8');
assert(/\.plr svg\.dial\{[^}]*rotate\(-90deg\)/.test(RG) && !/\.plr svg\{[^}]*rotate/.test(RG), 'الدوران على الدايرة بس — علامة ✓/✗ مش مقلوبة');
assert(/var gid = 'plrG' \+ \(\+\+seq\)/.test(RG) && /stroke="url\(#' \+ gid \+ '\)"/.test(RG) && !/url\(#plrG\)/.test(RG), 'كل دايرة ليها تدرّج خاص (اتنين على نفس الصفحة كان القوس بيختفي)');
const IT2 = fs.readFileSync(path.join(root, 'feedback', 'instapay-tablet.js'), 'utf8');
assert(/vRing\.done\(true\); \$\('ipVText'\)\.textContent = 'التحويل وصل ✓'; \$\('ipVSub'\)\.textContent = 'شكرًا/.test(IT2) && /\$\('ipVBack'\)\.style\.visibility = 'hidden'/.test(IT2), 'بعد التأكيد: كلام الانتظار وزرار الرجوع بيختفوا');
