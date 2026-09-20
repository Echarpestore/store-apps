#!/usr/bin/env node
// ============================================================
// test-customer-list-access.js (v713) — قايمة العملاء بصلاحية `canViewCustomers`
// كانت مفتوحة لأي حد: كل عميلات الفرع + تليفوناتهم + مشترياتهم. سلوك فعلي بدور كاشير وبدور مشرف.
// يتشغّل لوحده: node tests/test-customer-list-access.js
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const rep = fs.readFileSync(path.join(ROOT, 'pos', 'pos-reports.js'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'pos', 'pos-core.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
function extractFn(src, header){
  const at = src.indexOf(header);
  if(at < 0) throw new Error('extractFn: مش لاقي «' + header + '»');
  let i = src.indexOf('{', at + header.length - 1), depth = 0, q = null;
  for(; i < src.length; i++){
    const c = src[i];
    if(q){
      if(c === '\\'){ i++; continue; }
      if(q === '`' && c === '$' && src[i+1] === '{'){ let d = 1; i += 2; while(i < src.length && d){ if(src[i] === '{') d++; else if(src[i] === '}') d--; i++; } i--; continue; }
      if(c === q) q = null; continue;
    }
    if(c === '/' && src[i+1] === '/'){ while(i < src.length && src[i] !== '\n') i++; continue; }
    if(c === '/' && src[i+1] === '*'){ i = src.indexOf('*/', i) + 1; continue; }
    if(c === '"' || c === "'" || c === '`'){ q = c; continue; }
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('extractFn: أقواس مش متوازنة «' + header + '»');
}
const code = 'let custListData = [{phone:"01011111111",name:"منى"}]; let custListFiltered = [{phone:"01011111111"}]; let custListShown = 40; let rewardStats = {};\n'
  + ['async function goToCustomerList(', 'function renderCustList(', 'function clearProtectedScreenData('].map(h => extractFn(rep, h)).join('\n')
  + ';this.peek = () => ({ data: custListData.length, filtered: custListFiltered.length });';

function mk(perms){
  const st = { reads:0, screen:'', toasts:[], els:{} };
  const el = id => st.els[id] || (st.els[id] = { id, value:'', style:{}, innerHTML:'<b>منى 01011111111</b>' });
  const ctx = { st, window:{ _shSalesById:{ a:1 }, _shRatingById:{ a:1 } }, console:{ warn(){}, error(){} }, Promise, Object, Array, Number, String, Math, Date,
    currentBranch:'Rehab', TEST_CUSTOMERS:'pos_test_customers', TEST_SETTINGS:'s',
    hasPerm: k => !!perms[k], showScreen: s => { st.screen = s; }, showToast: (m) => st.toasts.push(m),
    pointsFieldFor: () => 'points', mergeCustDocs: () => [], getBranchSales: async () => { st.reads++; return []; }, saleTime: () => 0,
    db: { collection: () => { st.reads++; return { where(){ return this; }, doc(){ return this; }, get: async () => ({ docs:[], exists:false, data: () => ({}) }) }; } },
    document: { getElementById: el } };
  vm.createContext(ctx); vm.runInContext(code, ctx); return ctx;
}

(async function(){
  console.log('\n🔐 1) كاشير (من غير canViewCustomers)');
  let c = mk({ canViewCustomers:false, canViewLogs:true, canViewReports:true });   // صلاحيات تانية متفتحش القايمة
  await c.goToCustomerList();
  ok(c.st.reads === 0, '**ولا قراءة واحدة** من قاعدة البيانات (المنع قبل التحميل مش قبل العرض) — اتقرا ' + c.st.reads);
  ok(c.st.screen === '', 'الشاشة متفتحتش');
  ok(c.st.toasts.length === 1 && /شاشة البيع/.test(c.st.toasts[0]), 'ورسالة بتقول للكاشير تدوّر على العميلة منين');
  c.renderCustList();
  ok(c.peek().data === 0 && c.peek().filtered === 0 && c.st.els.customerListWrap.innerHTML === '', 'قايمة سايبها مشرف في الذاكرة ← بتتمسح ومتتعرضش للكاشير');

  console.log('👑 2) مشرف/مدير');
  c = mk({ canViewCustomers:true });
  await c.goToCustomerList();
  ok(c.st.screen === 'customerListScreen' && c.st.reads >= 3 && c.st.toasts.length === 0, 'القايمة بتفتح وبتتحمّل زي الأول');

  console.log('🚪 3) الخروج بيمسح اللي في الذاكرة');
  c = mk({ canViewCustomers:true }); c.st.els.customerListWrap = { innerHTML:'<b>منى</b>' }; c.st.els.salesHistoryWrap = { innerHTML:'<b>فاتورة</b>' };
  c.clearProtectedScreenData();
  ok(c.peek().data === 0 && Object.keys(c.window._shSalesById).length === 0 && Object.keys(c.window._shRatingById).length === 0, 'قايمة العملاء وسجل المبيعات المتحمّلين اتمسحوا');
  ok(c.st.els.customerListWrap.innerHTML === '' && c.st.els.salesHistoryWrap.innerHTML === '', 'والشاشتين فضيوا');
  const logout = extractFn(core, 'function logout(');
  ok(/clearProtectedScreenData\(\)/.test(logout) && logout.indexOf('clearProtectedScreenData') < logout.indexOf("showScreen('loginScreen')"), '`logout` بينادي المسح قبل شاشة الدخول');

  console.log('🧱 4) الصلاحية');
  const defs = core.slice(core.indexOf('const DEFAULT_ROLE_PERMISSIONS'), core.indexOf('const DEFAULT_ROLE_PERMISSIONS') + 3600);
  const block = r => { const i = defs.indexOf('\n  ' + r + ': {'); return i < 0 ? '' : defs.slice(i, defs.indexOf('\n  }', i)); };
  ok(/canViewCustomers:\s*false/.test(block('cashier')), 'الكاشير افتراضيًا: لأ');
  ['admin', 'supervisor', 'manager'].forEach(r => ok(/canViewCustomers:\s*true/.test(block(r)), r + ': أيوه'));
  ok(/canViewCustomers:'[^']+'/.test(rep), 'وظاهرة باسم عربي في شاشة الأدوار (المالك يقدر يغيّرها)');
  const my = extractFn(core, 'function myPerms(');
  ok(/Object\.assign\(\{\}, def, saved\)/.test(my), 'دور محفوظ قبل v713 (من غير المفتاح الجديد) بياخد القيمة الافتراضية — مش undefined');
  ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8'), 713), 'CACHE_NAME ≥ v713');

  console.log('\n' + (fail ? '❌' : '✅') + ' test-customer-list-access: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
})().catch(e => { console.error('💥', e); process.exitCode = 1; });
