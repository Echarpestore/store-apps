/* 🧪 كشف الرصيد + عملاء التطبيق في القايمة — node tests/test-credit-ledger.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const src = rd('pos/credit-ledger-ui.js'), rep = rd('pos/pos-reports.js'), html = rd('pos/index.html');
const M = require(path.join(ROOT, 'pos/credit-ledger-ui.js'));
let p = 0, f = 0;
const t = (n, fn) => { try { fn(); p++; console.log('  ✅ ' + n); } catch (e) { f++; console.log('  ❌ ' + n + ' → ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw Error((m || '') + ' وجه ' + JSON.stringify(a) + ' والمتوقع ' + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw Error(m || 'شرط فشل'); };
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
function extractFn(s, head) { const i = s.indexOf(head); if (i < 0) throw Error('البلوك مش موجود: ' + head);
  const o = s.indexOf('{', i); let d = 0; for (let k = o; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (!d) return s.slice(i, k + 1); } } throw Error('أقواس'); }

console.log('\n📒 ملخص الدفتر');
const ROWS = [
  { at: 3, amount: -100, balanceAfter: 250, type: 'spend', invoiceCode: 'INV-9' },
  { at: 1, amount: 350, balanceAfter: 350, type: 'change_kept', reason: 'مرتجع INV-5' },
  { at: 4, amount: 50, balanceAfter: 300, type: 'gift_card' }
];
t('الترتيب مش مهم — الملخص بيرتّب بنفسه', () => { const s = M.creditLedgerSummary(ROWS, 300); eq(s.totalIn, 400); eq(s.totalOut, 100); eq(s.ledgerBalance, 300); eq(s.count, 3); });
t('⭐ متطابق = مفيش تحذير', () => { const s = M.creditLedgerSummary(ROWS, 300); eq(s.mismatch, false); eq(s.brokenAt.length, 0); });
t('⭐⭐ الرصيد المسجّل مختلف عن الدفتر = تحذير', () => eq(M.creditLedgerSummary(ROWS, 650).mismatch, true));
t('⭐⭐ سلسلة مكسورة (حد عدّل حركة) بتتمسك', () => {
  const bad = ROWS.map(r => r.at === 3 ? { ...r, balanceAfter: 200 } : r);
  const s = M.creditLedgerSummary(bad, 300); ok(s.brokenAt.indexOf(3) >= 0, 'الحركة 3 ماتمسكتش');
});
t('فرق قرش بسبب الكسور مش كسر', () => eq(M.creditLedgerSummary([{ at: 1, amount: 33.33, balanceAfter: 33.33 }, { at: 2, amount: 33.34, balanceAfter: 66.67 }], 66.67).brokenAt.length, 0));
t('من غير حركات: رصيد صفر سليم، رصيد موجب = تحذير', () => { eq(M.creditLedgerSummary([], 0).mismatch, false); eq(M.creditLedgerSummary([], 120).mismatch, true); });
t('قيم فاضية مبتكسرش', () => { eq(M.creditLedgerSummary(null, undefined).count, 0); });

console.log('\n🏷️ التسميات');
t('صرف بيجيب رقم الفاتورة', () => ok(/INV-9/.test(M.creditLedgerLabel(ROWS[0])) && /صرف/.test(M.creditLedgerLabel(ROWS[0]))));
t('مرتجع لرصيد مش «باقي محفوظ»', () => ok(/مرتجع/.test(M.creditLedgerLabel(ROWS[1]))));
t('عكس فاتورة بيبان بسببه', () => ok(/عكس/.test(M.creditLedgerLabel({ type: 'change_kept', reason: 'عكس فاتورة مدفوعة برصيد — INV-1' }))));
t('باقي فاتورة', () => ok(/باقي/.test(M.creditLedgerLabel({ type: 'change_kept', reason: 'باقي فاتورة INV-2', invoiceCode: 'INV-2' }))));
t('تعديل يدوي بسببه', () => ok(/تسوية/.test(M.creditLedgerLabel({ type: 'manual', reason: 'تسوية' }))));

console.log('\n🔒 قراءة بس');
const code = strip(src);
t('⭐⭐ مفيش أي كتابة في Firestore', () => ['.set(', '.update(', '.add(', '.delete(', 'batch(', 'httpsCallable'].forEach(x => ok(code.indexOf(x) < 0, 'لقيت ' + x)));
t('بيجرّب الاستعلام المرتّب الأول (أسرع لو الـindex موجود)', () => ok(/collection\('credit_ledger'\)/.test(code) && /col\.where\('phone', '==', ph\)\.orderBy\('at', 'desc'\)\.limit\(LIMIT\)/.test(code)));
t('⭐⭐ من غير index: بيرجع لاستعلام بالرقم بس ويرتّب بنفسه', () => {
  const b = extractFn(code, 'async function loadLedger');
  ok(/catch\s*\(e\)/.test(b), 'مفيش فولباك'); ok(/col\.where\('phone', '==', ph\)\.get\(\)/.test(b), 'الفولباك لسه فيه orderBy');
  ok(/sortDesc\(/.test(b) && /\.slice\(0, LIMIT\)/.test(b)); ok(/throw e/.test(b), 'الأخطاء التانية لازم تتعدّى مش تتبلع');
  const sd = eval('(' + extractFn(code, 'function sortDesc') + ')'); eq(sd([{ at: 1 }, { at: 5 }, { at: 3 }]).map(r => r.at).join(), '5,3,1');
});
t('أسماء/فروع الدفتر بتتهرّب قبل العرض', () => ok(/esc\(r\.branch\)/.test(code) && /esc\(r\.byName\)/.test(code) && /esc\(creditLedgerLabel\(r\)\)/.test(code)));
t('ممنوع prompt/confirm/alert', () => ok(!/\b(prompt|confirm|alert)\s*\(/.test(code)));
t('الرقم من مفتاح المستند مش من الحقل', () => ok(/_cp\.phone\)\s*\|\|\s*\(c && c\.phone\)/.test(code)));

console.log('\n📱 عملاء التطبيق في القايمة');
const ctx = vm.createContext({ window: {} });
vm.runInContext(extractFn(rep, 'function custAppBrandMatch') + ';' + extractFn(rep, 'function mergeCustDocs'), ctx);
const match = vm.runInContext('custAppBrandMatch', ctx), merge = vm.runInContext('mergeCustDocs', ctx);
const doc = (id, data) => ({ id, data: () => data });
t('echarpe: loyaltyCode أو source=loyalty_app', () => { ok(match({ loyaltyCode: 'E1' }, false)); ok(match({ source: 'loyalty_app:qr' }, false)); ok(!match({ loyaltyCode_glow: 'G1', source: 'glow_app' }, false), 'عميلة Glow ظهرت في echarpe'); });
t('Glow: loyaltyCode_glow أو source=glow_app', () => { ok(match({ loyaltyCode_glow: 'G1' }, true)); ok(match({ source: 'glow_app:receipt' }, true)); ok(!match({ loyaltyCode: 'E1', source: 'loyalty_app' }, true)); });
t('مسجّلة في الاتنين بتظهر في الاتنين', () => { const c = { loyaltyCode: 'E', loyaltyCode_glow: 'G' }; ok(match(c, true) && match(c, false)); });
t('⭐⭐ الدمج: عملاء الفرع + عملاء التطبيق بتوع البراند، من غير تكرار', () => {
  const out = merge([doc('010', { branch: 'الرحاب' })], [doc('010', {}), doc('011', { source: 'loyalty_app' }), doc('012', { source: 'glow_app' })], false);
  eq(out.map(d => d.id).join(), '010,011');
});
const repC = strip(rep);
t('⭐⭐ goToCustomerList بتجيب branch==\'\' كمان', () => { const b = extractFn(repC, 'async function goToCustomerList'); ok(/where\('branch','==', ''\)/.test(b), 'مفيش استعلام'); ok(/mergeCustDocs\(custSnap\.docs, appSnap\.docs/.test(b)); ok(/custListData = _custDocs\.map/.test(b), 'القايمة لسه من custSnap بس'); });
t('فشل استعلام التطبيق مايوقعش القايمة كلها', () => ok(/where\('branch','==', ''\)\.get\(\)\.catch\(/.test(repC)));
t('الرصيد ظاهر في الصف + ترتيب «عندهم رصيد» + إجمالي الدين', () => { ok(/sort==='credit'/.test(repC)); ok(/💳 \$\{Number\(c\.credit\)\.toFixed\(2\)\}/.test(rep)); ok(/أرصدة العملاء/.test(rep)); ok(/value="credit"/.test(html)); });

console.log('\n📦 التحميل');
t('بعد profiles.js وcredit-ui.js', () => { const h = html.replace(/<!--[\s\S]*?-->/g, ''); const i = n => { const k = h.indexOf('src="' + n); if (k < 0) throw Error(n); return k; }; ok(i('profiles.js') < i('credit-ledger-ui.js') && i('credit-ui.js') < i('credit-ledger-ui.js')); });
t('CACHE_NAME اترفع', () => ok(+rd('pos/sw.js').match(/pos-shell-v(\d+)/)[1] >= 701));

console.log('\n===============================\nالنتيجة: ' + p + ' ناجح · ' + f + ' فاشل\n===============================\n');
process.exit(f ? 1 : 0);
