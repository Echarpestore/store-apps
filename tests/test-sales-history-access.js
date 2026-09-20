#!/usr/bin/env node
// ============================================================
// test-sales-history-access.js (v712) — سجل المبيعات بيحترم صلاحية `canViewLogs`
// الثغرة: الصلاحية كانت متعرّفة وظاهرة في شاشة الأدوار ومفيش مكان بيفحصها ← الكاشير شايفة إيراد الفرع كله.
// سلوك فعلي: بنشغّل دوال السجل نفسها بدور كاشير وبدور مشرف ونشوف اتحمّل إيه واتعرض إيه.
// يتشغّل لوحده: node tests/test-sales-history-access.js
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
const g0 = rep.indexOf('// >>> SALESLOG_GROUP_START'), g1 = rep.indexOf('// <<< SALESLOG_GROUP_END');
if(g0 < 0 || g1 < g0) throw new Error('بلوك تجميع السجل مش موجود');
const code = "let salesHistoryTab='live'; let _shMonthKey=null; let _shDayFilter=null; const RATING_ICON_MAP={};\n"
  + rep.slice(g0, g1) + '\n'
  + ['function shFullAccess(', 'async function goToSalesHistory(', 'function switchSalesHistoryTab(', 'async function loadLiveSalesHistorySales(',
     'async function renderLiveSalesHistory(', 'async function renderLegacySalesHistory('].map(h => extractFn(rep, h)).join('\n')
  + ';this.peek = () => ({ tab:salesHistoryTab, month:_shMonthKey, day:_shDayFilter }); this.setFilters = (m,d) => { _shMonthKey = m; _shDayFilter = d; };';

const NOW = Date.UTC(2026, 8, 20, 15, 0, 0);          // 20 سبتمبر 6 مساءً القاهرة
const DAY0 = Date.UTC(2026, 8, 20, 3, 0, 0);          // بداية يوم الشغل (6 ص القاهرة)
const mkSale = (id, ts, total, phone) => ({ id, branch:'Rehab', total, invoiceNo:id, customerPhone:phone || '', createdAtMs:ts, items:[{ qty:1 }], employeeName:'سارة' });
const TODAY = [mkSale('T1', NOW - 3600e3, 500, '01011111111'), mkSale('T2', NOW - 7200e3, 300)];
const OLD = [mkSale('Y1', DAY0 - 3600e3, 900, '01022222222'), mkSale('M1', Date.UTC(2026, 6, 5, 12), 4000, '01033333333'), mkSale('M2', Date.UTC(2026, 5, 9, 12), 7000)];

function mk(perms){
  const st = { queries:[], els:{}, screen:'' };
  const el = id => st.els[id] || (st.els[id] = { id, style:{}, innerHTML:'', classList:{ toggle(){} } });
  const ctx = { st, window:{}, console:{ warn(){} }, Math, Number, String, Object, Array, Promise, Map, Infinity, isNaN,
    Date: class extends Date { constructor(...a){ if(a.length) super(...a); else super(NOW); } static now(){ return NOW; } },
    currentBranch:'Rehab', TEST_SALES:'pos_test_sales',
    hasPerm: k => !!perms[k], showScreen: s => { st.screen = s; },
    bizDayStartMs: () => DAY0, bizDayKey: ts => new Date(ts - 3 * 3600e3).toISOString().slice(0, 10), saleTs: s => s.createdAtMs,
    shLinkRatings: () => ({}),
    loadReportSales: async (from, to) => { st.queries.push({ kind:'range', from:from.getTime(), to:to.getTime() });
      return TODAY.concat(OLD).filter(s => s.createdAtMs >= from.getTime() && s.createdAtMs <= to.getTime()); },
    db: { collection: name => ({
      where(){ st.queries.push({ kind:'all:' + name }); return { get: async () => ({ docs: TODAY.concat(OLD).map(s => ({ id:s.id, data: () => s })) }), where(){ return this; } }; } }) },
    document: { getElementById: el } };
  vm.createContext(ctx); vm.runInContext(code, ctx); return ctx;
}

(async function(){
  console.log('\n🔐 1) كاشير (من غير canViewLogs)');
  let c = mk({ canViewLogs:false });
  c.setFilters('2026-07', '2026-07-05');               // فلتر سايبه مشرف قبلها على نفس الجهاز
  await c.goToSalesHistory(); await new Promise(r => setTimeout(r, 20));
  const html = c.st.els.salesHistoryWrap.innerHTML;
  ok(c.st.queries.every(q => q.kind === 'range' || q.kind === 'all:entries'), 'التحميل استعلام بنطاق اليوم — **مفيش** تحميل لكل فواتير الفرع');
  ok(c.st.queries.some(q => q.kind === 'range' && q.from === DAY0), 'والنطاق بيبدأ من بداية **يوم الشغل** (مش نص الليل)');
  ok(Object.keys(c.window._shSalesById).sort().join() === 'T1,T2', 'اللي في الذاكرة فواتير النهارده بس — القديم مش متحمّل أصلًا (مش متخبّي)');
  ok(/T1/.test(html) && /T2/.test(html), 'فواتير النهارده ظاهرة (إعادة الطباعة وإيصال الهدية شغالين)');
  ok(!/Y1|M1|M2/.test(html) && !/01022222222|01033333333/.test(html), 'مفيش فاتورة قديمة ولا تليفون عميلة قديمة');
  ok(!/📆/.test(html) && !/type="date"/.test(html) && !/امبارح/.test(html), 'مفيش شريط شهور ولا فلتر تاريخ ولا «امبارح»');
  ok(!/800\.00|800 ج/.test(html) && !/فاتورة · <b/.test(html), 'مفيش إجمالي اليوم (500+300=800 مش ظاهر)');
  ok(/فواتير النهارده بس/.test(html), 'ومكتوب للكاشير ليه السجل محدود');
  ok(c.st.els.shTabLegacy.style.display === 'none', 'تبويب QuickBooks مخفي');
  ok(c.peek().month === null && c.peek().day === null, 'فلتر المشرف القديم اتصفّر');
  // الحارسين (التبويب + الدالة) بيغطّوا على بعض — فكل واحد بيتختبر **لوحده** (الاختبار السلبي الأول عدّى لما كانوا متلخبطين)
  let legacyCalls = 0; const realLegacy = c.renderLegacySalesHistory;
  vm.runInContext('renderLegacySalesHistory = function(){ __legacyHit(); }', Object.assign(c, { __legacyHit: () => { legacyCalls++; } }));
  c.switchSalesHistoryTab('legacy'); await new Promise(r => setTimeout(r, 20));
  ok(legacyCalls === 0 && c.peek().tab === 'live', 'حارس التبويب: الكاشير تطلب «المستورد» ← الدالة **متتناداش أصلًا**');
  const c5 = mk({ canViewLogs:false }); let legacyReads = 0;
  c5.viewLegacySales = async () => { legacyReads++; return [{ invoiceNo:'QB-77', itemName:'بيعة قديمة', total:1234 }]; };
  vm.runInContext('switchSalesHistoryTab = function(){ __sw(); }', Object.assign(c5, { __sw: () => {} }));
  await c5.renderLegacySalesHistory(); await new Promise(r => setTimeout(r, 20));
  ok(legacyReads === 0 && !/QB-77|1234/.test((c5.st.els.salesHistoryWrap || {}).innerHTML || ''), 'حارس الدالة: نداء `renderLegacySalesHistory` مباشرة ← **مبيقراش** بيانات QuickBooks ولا بيعرضها');
  // خط الدفاع التاني: لو استعلام النطاق رجّع أكتر من المطلوب (فولباك/index ناقص) — الفلتر المحلي بيقص
  const c8 = mk({ canViewLogs:false }); c8.__leaky = async () => TODAY.concat(OLD);
  vm.runInContext('loadReportSales = __leaky', c8);
  const got = await c8.loadLiveSalesHistorySales();
  ok(got.map(x => x.id).sort().join() === 'T1,T2', 'الاستعلام رجّع فواتير قديمة بالغلط ← بتتقص محليًا قبل ما توصل الذاكرة');
  c = mk({ canViewLogs:false, canViewReports:false }); c.loadReportSales = async () => [];
  vm.runInContext('loadReportSales = this.loadReportSales', c); await c.goToSalesHistory(); await new Promise(r => setTimeout(r, 20));
  ok(/مفيش فواتير النهارده/.test(c.st.els.salesHistoryWrap.innerHTML), 'يوم فاضي = رسالة واضحة');

  console.log('👑 2) مشرف/مدير (معاه canViewLogs) — مفيش حاجة اتغيّرت');
  c = mk({ canViewLogs:true }); await c.goToSalesHistory(); await new Promise(r => setTimeout(r, 20));
  const h2 = c.st.els.salesHistoryWrap.innerHTML;
  ok(c.st.queries.some(q => q.kind === 'all:pos_test_sales'), 'السجل الكامل بيتحمّل');
  ok(Object.keys(c.window._shSalesById).length === 5, 'الـ5 فواتير كلهم');
  ok(/📆/.test(h2) && /type="date"/.test(h2) && /800\.00/.test(h2), 'شريط الشهور وفلتر التاريخ وإجمالي اليوم موجودين');
  ok(c.st.els.shTabLegacy.style.display === '', 'وتبويب QuickBooks ظاهر');

  console.log('🧱 3) الصلاحية نفسها');
  const defs = core.slice(core.indexOf('DEFAULT_ROLE_PERMISSIONS'), core.indexOf('DEFAULT_ROLE_PERMISSIONS') + 3000);
  const roleBlock = r => { const i = defs.indexOf(r + ':'); return i < 0 ? '' : defs.slice(i, i + 900); };
  ok(/canViewLogs:\s*false/.test(roleBlock('cashier')), 'الكاشير افتراضيًا: canViewLogs = false');
  ok(/canViewLogs:\s*true/.test(roleBlock('supervisor')) && /canViewLogs:\s*true/.test(roleBlock('admin')), 'المشرف والأدمن: true');
  const allPos = fs.readdirSync(path.join(ROOT, 'pos')).filter(f => /\.js$/.test(f) && !/^test-|\.min\.js$/.test(f)).map(f => fs.readFileSync(path.join(ROOT, 'pos', f), 'utf8')).join('\n');
  ok(/hasPerm\('canViewLogs'\)/.test(allPos), '`canViewLogs` بقت **بتتفحص فعلًا** في الكود (كانت صفر مرات)');
  ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8'), 712), 'CACHE_NAME ≥ v712');

  console.log('\n' + (fail ? '❌' : '✅') + ' test-sales-history-access: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
})().catch(e => { console.error('💥', e); process.exitCode = 1; });
