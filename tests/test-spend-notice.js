#!/usr/bin/env node
// ============================================================
// test-spend-notice.js — إشعار الاستبدال/صرف الرصيد + فتح الفاتورة من كشف الحساب ومن الإشعار
// سلوك فعلي على موديول السيرفر بـFirestore وFCM وهميين. يتشغّل لوحده: node tests/test-spend-notice.js
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SN = require(path.join(ROOT, 'functions', 'spendNotice.js'));
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
const TOK = n => 'tok' + n + 'x'.repeat(140);

function deps(cust){
  const st = { sent:[], reads:0 };
  return { st, db: { collection: () => ({ doc: id => ({ get: async () => { st.reads++; return { exists: !!cust, data: () => cust || {} }; } }) }) },
           messaging: { sendEachForMulticast: async m => { st.sent.push(m); return { successCount: m.tokens.length, responses: m.tokens.map(() => ({ success:true })) }; } } };
}

(async function(){
  console.log('\n🎁 1) استبدال النقط');
  const SALE = { customerPhone:'01011111111', branch:'echarpe El Rehab', invoiceNo:'4413', invoiceCode:'FTR4413-AB12CD', pointsRedeemed:50, loyaltyPointsEarned:8, pointsBalanceBefore:102 };
  let n = SN.buildPointsNotice(SALE);
  ok(n && n.brand === 'echarpe' && /اتخصم 50 نقطة/.test(n.body) && /#4413/.test(n.body), 'الإشعار فيه النقط المخصومة ورقم الفاتورة');
  ok(/رصيدك دلوقتي 60 نقطة/.test(n.body), 'والباقي = 102 − 50 + 8 = **60** — ' + n.body);
  ok(n.link === './?inv=FTR4413-AB12CD', '🔗 اللينك بيفتح **الفاتورة نفسها** — ' + n.link);
  ok(SN.buildPointsNotice(Object.assign({}, SALE, { pointsRedeemed:0 })) === null, 'فاتورة من غير استبدال = مفيش إشعار');
  ok(SN.buildPointsNotice(Object.assign({}, SALE, { customerPhone:null })) === null, 'من غير عميلة = لأ');
  ok(SN.buildPointsNotice(Object.assign({}, SALE, { isReversal:true })) === null, 'فاتورة عكس = لأ');
  n = SN.buildPointsNotice(Object.assign({}, SALE, { pointsBalanceBefore:null }));
  ok(n && !/رصيدك دلوقتي/.test(n.body), 'POS قديم (من غير الرصيد قبل) = الإشعار بيتبعت من غير رقم متخمّن');
  n = SN.buildPointsNotice(Object.assign({}, SALE, { branch:'Glow' }));
  ok(n.brand === 'glow' && /Glow/.test(n.title), 'فاتورة فرع Glow = إشعار Glow');
  ok(SN.buildPointsNotice(Object.assign({}, SALE, { invoiceCode:'<script>' })).link === './?go=points', 'كود فاتورة مش نضيف = لينك عام مش حقن');

  console.log('💰 2) صرف الرصيد');
  n = SN.buildCreditNotice({ phone:'0101', spent:300, balanceAfter:25, brand:'echarpe', invoiceCode:'FTR4413-AB12CD' });
  ok(n && /اتسحب 300 ج\.م/.test(n.body) && /الباقي 25 ج\.م/.test(n.body), 'المبلغ اللي اتسحب والباقي — ' + n.body);
  ok(/لو مش إنتِ/.test(n.body), '🛡️ وفيه سطر الأمان: «لو مش إنتِ، كلّمي الفرع»');
  ok(n.link === './?inv=FTR4413-AB12CD' && SN.buildCreditNotice({ phone:'0101', spent:50, brand:'glow' }).link === './?go=credit', 'بفاتورة ← الفاتورة · من غير ← كشف الرصيد');
  ok(SN.buildCreditNotice({ phone:'0101', spent:0 }) === null && SN.buildCreditNotice({ spent:50 }) === null, 'صفر/من غير رقم = لأ');
  ok(/اتسحب 37\.50 ج\.م/.test(SN.buildCreditNotice({ phone:'1', spent:37.5, balanceAfter:12.5 }).body) && /الباقي 12\.50 ج\.م/.test(SN.buildCreditNotice({ phone:'1', spent:37.5, balanceAfter:12.5 }).body), 'الكسور بخانتين (فلوس) والصحيح من غير كسور');

  console.log('📨 3) الإرسال');
  let d = deps({ fcmTokens_echarpe:[TOK(1), TOK(2)], fcmTokens_glow:[TOK(9)] });
  let r = await SN.sendNotice(d, '0101', SN.buildPointsNotice(SALE));
  ok(r.sent === 2 && d.st.sent[0].tokens.length === 2 && d.st.sent[0].tokens.indexOf(TOK(9)) < 0, 'إشعار echarpe بيروح لتوكنات echarpe **بس**');
  const m = d.st.sent[0];
  ok(m.data.url === './?inv=FTR4413-AB12CD' && m.webpush.fcmOptions.link === m.data.url, 'اللينك في `data.url` (اللي الـSW بيقراه) وفي `fcmOptions.link`');
  d = deps({ fcmTokens_glow:[TOK(9)] }); r = await SN.sendNotice(d, '0101', SN.buildPointsNotice(SALE));
  ok(r.sent === 0 && r.reason === 'no-tokens' && d.st.sent.length === 0, 'عندها Glow بس والفاتورة echarpe = مفيش إرسال');
  d = deps(null); ok((await SN.sendNotice(d, '0101', SN.buildPointsNotice(SALE))).reason === 'no-customer', 'عميلة مش موجودة = هدوء');
  d = deps({ fcmTokens_echarpe:[TOK(1)] }); d.messaging.sendEachForMulticast = async () => { throw new Error('fcm down'); };
  r = await SN.sendNotice(d, '0101', SN.buildPointsNotice(SALE));
  ok(r.sent === 0 && r.reason === 'error', '⛔ FCM وقع = الدالة **مبترميش** (الفاتورة/الخصم ميتأثروش)');
  ok(SN.tokensFor({ fcmTokens:{ [TOK(5)]:{ brand:'glow' }, [TOK(6)]:{} } }, 'echarpe').join() === TOK(6), 'الشكل القديم للتوكنات: من غير براند = echarpe');

  console.log('🔌 4) التوصيل في السيرفر — من غير دالة جديدة');
  const idx = rd('functions/index.js'), gift = rd('functions/giftCredit.js');
  const trig = idx.slice(idx.indexOf('exports.onSaleForReferral'), idx.indexOf('exports.onSaleForReferral') + 1400);
  ok(trig.indexOf('buildPointsNotice(sale)') > 0 && trig.indexOf('buildPointsNotice(sale)') < trig.indexOf('if (total <= 0) return;'), 'جوّه تريجر الفاتورة الموجود، و**قبل** `total <= 0` (فاتورة اتدفعت كلها نقط إجماليها صفر)');
  ok(/try \{[\s\S]{0,400}buildPointsNotice[\s\S]{0,300}\} catch \(e\) \{ console\.error\("points notice"/.test(trig), 'ومعزول بـtry/catch عن تفعيل العمولة');
  const cs = gift.slice(gift.indexOf('exports.creditSpend'));
  ok(/if\(_out && !_out\.repeat\)\{[\s\S]{0,700}buildCreditNotice/.test(cs), 'و`creditSpend`: بعد نجاح المعاملة، ومش في إعادة المحاولة (`repeat`)');
  ok(/balanceAfter: _out\.balance/.test(cs) && /return _out;/.test(cs), 'بالرصيد المؤكد من المعاملة، والنتيجة بترجع لـPOS زي ما هي');
  ok(!/require\(["']\.\/spendNotice["']\)\)/.test(idx.replace(/const \{[^}]*\} = require\("\.\/spendNotice"\);/g, '')) && !/Object\.assign\(exports, require\(["']\.\/spendNotice/.test(idx), '⚠️ `spendNotice` **مش متصدّر كدوال** (الكوتة)');
  ok(Object.keys(SN).every(k => !new RegExp('exports\\.' + k + '\\s*=').test(idx + gift)), 'ولا اسم من أسماء الموديول متصدّر من `index.js`/`giftCredit.js`');
  ok(!/onCall|onRequest|onDocument|onSchedule/.test(rd('functions/spendNotice.js').replace(/\/\*[\s\S]*?\*\//g, '')), 'الموديول مفيهوش أي تعريف دالة سحابية');
  const posList = rd('pos/pos-core.js').match(/const GLOW_BRANCHES = (\[[^\]]*\]);/)[1];
  ok(JSON.stringify(SN.GLOW_BRANCHES).replace(/"/g, "'") === posList.replace(/\s/g, ''), 'قايمة فروع Glow = بتاعة POS');
  ok(/pointsBalanceBefore: \(phone && typeof custPointsBalance === 'number'\) \? custPointsBalance : null,/.test(rd('pos/pos-sale.js')), 'POS بيسجّل رصيد النقط قبل الفاتورة');

  ok(/"reward",\s*\n\s*event\.data\.after\.ref,\s*\n\s*"\.\/\?go=offers"/.test(idx), 'إشعار المكافأة بقى ليه لينك ← تبويب العروض (كان بيفتح الرئيسية)');
  ok(/"welcome",\s*\n\s*ref,\s*\n\s*"\.\/\?go=points"/.test(idx), 'وهدية الترحيب ← كارت النقط');
  ok(/"\.\/\?rate=" \+ doc\.id/.test(idx), 'والتقييم زي ما هو ← شاشة التقييم');
  console.log('📱 5) التطبيقين (echarpe + Glow)');
  ['loyalty/index.html', 'glow/index.html'].forEach(f => {
    const a = rd(f), tag = f.split('/')[0];
    ok(/function renderInvoiceSheet\(s\)\{/.test(a) && /function openInvoiceDetail\(i\)\{\s*\n\s*var s = invoicesData\[i\]; if\(!s\) return;\s*\n\s*renderInvoiceSheet\(s\);/.test(a), tag + ': شيت الفاتورة بيتفتح من أي مكان، وقايمة الفواتير لسه شغالة');
    ok(/var _link = \(r\.invoiceCode && \(r\.type === 'spend' \|\| r\.type === 'change_kept'\)\);/.test(a) && /onclick="openInvoiceByCode\(/.test(a), tag + ': سطر كشف الرصيد المربوط بفاتورة بيتداس');
    const ob = a.slice(a.indexOf('function openInvoiceByCode('), a.indexOf('window.openInvoiceByCode'));
    ok(ob.indexOf('for(var i = 0; i < pool.length') < ob.indexOf(".where('invoiceCode'"), tag + ': الأول من الفواتير المتحمّلة (صفر قراءات)، وبعدين قراءة واحدة');
    ok(/String\(s\.customerPhone\) !== String\(currentCustomer\.phone\)\) return;/.test(ob), tag + ': 🔒 فاتورة عميلة تانية متتفتحش');
    ok(/نقاط استبدلتيها/.test(a) && /رصيد استخدمتيه/.test(a) && /function invCreditUsed\(s\)/.test(a), tag + ': الفاتورة بتعرض النقط المستبدلة والرصيد المستخدم');
    ok(/drawBarcode\('invBarcode', s\.scanCode \|\| s\.invoiceCode\)/.test(a), tag + ': باركود الإرجاع = الكود القصير السريع لو موجود');
    const dl = a.slice(a.lastIndexOf('🔗 فتح المكان المطلوب من الإشعار'));
    ok(/q\.get\('inv'\)/.test(dl) && /go === 'credit'/.test(dl) && /openInvoiceByCode\(inv\)/.test(dl), tag + ': `?inv=` و`?go=credit` بيفتحوا المكان المطلوب');
    ok(/go === 'offers'\)\{ if\(typeof switchTab === 'function'\) switchTab\('offers'\)/.test(dl), tag + ': `?go=offers` (إشعار المكافأة) بيفتح تبويب العروض');
    ok(/\/\^\[A-Za-z0-9-\]\+\$\/\.test\(inv\)/.test(dl) && /history\.replaceState/.test(dl), tag + ': الكود بيتنضّف، والـquery بيتشال بعد الفتح (refresh ميفتحوش تاني)');
    ok(!/toast\('الفاتورة دي/.test(a) && /showToast\('الفاتورة دي مش متاحة للعرض'/.test(a), tag + ': بينادي `showToast` الموجودة (مش دالة مش موجودة)');
  });
  ok(swAtLeast(rd('loyalty/sw.js'), 693) && swAtLeast(rd('glow/sw.js'), 78), 'loyalty ≥ v693 · glow ≥ v78');

  console.log('\n' + (fail ? '❌' : '✅') + ' test-spend-notice: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
})().catch(e => { console.error('💥', e); process.exitCode = 1; });
