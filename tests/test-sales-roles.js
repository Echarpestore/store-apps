// ============================================================
// 🔐 أدوار لوحة الإدارة في تطبيق الحضور
// المالك يشوف كل حاجة · المدير يشوف الموافقات وشغل اليوم بس
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { loadSalesApp } = require('./helpers/load-sales');
const { sandbox: S } = loadSalesApp();

const permOf = S.permOfPanelTitle || S.window.permOfPanelTitle;
assert(typeof permOf === 'function', 'خريطة صلاحيات اللوحات متاحة');

// ---- كل لوحة بتتصنّف صح ----
const cases = [
  ['📩 طلبات الإذن',                       'approvals'],
  ['🔍 مخالفات محتاجة مراجعتك',            'approvals'],
  ['🔒 طلبات تسجيل مستنية اعتماد',         'approvals'],
  ['🚪 إنهاء خدمة موظف',                   'terminate'],
  ['📋 سجل المغادرين',                     'terminate'],
  ['💵 الرواتب الشهرية',                   'money'],
  ['💰 سجل السلف',                         'money'],
  ['💰 كشف الخصومات',                      'money'],
  ['⏳ رصيد الوقت والخصومات (الشهر الحالي)','money'],
  ['💰 عمولة النقط الشهرية',               'money'],
  ['⚙️ إعدادات الالتزام والمكافآت',         'settings'],
  ['⚙️ إعدادات رصيد الوقت',                'settings'],
  ['🎯 تارجت مبيعات الشيفت',               'settings'],
  ['🏬 إدارة الفروع',                      'settings'],
  ['🔐 كود المدير (صلاحيات محدودة)',        'settings'],
  ['إضافة موظف جديد',                      'people'],
  ['الموظفين الحاليين',                    'people'],
  ['⏰ مواعيد الحضور المحددة',              'people'],
  ['📋 المهام الأسبوعية',                  'tasks'],
  ['🎁 سجل المكافآت',                      'tasks'],
  ['📱 أكواد دعوة الموظفين (تنزيلات التطبيق)','orders'],
  ['📊 نظرة عامة على الموظفين النهاردة',    'day'],
  ['📢 رسالة للموظفين + 🎯 التارجت اليومي',  'day'],
];
cases.forEach(([title, expected])=> assertEq(permOf(title), expected, `"${title}" → ${expected}`));

// ---- المدير: إيه اللي يشوفه وإيه اللي لأ ----
const MANAGER = ['approvals','day','tasks','orders'];
const HIDDEN  = ['money','settings','terminate','people'];
const roles = S.window.SALES_ROLES || (function(){
  const src = fs.readFileSync(path.resolve(__dirname,'..','sales','sales-app.js'),'utf8');
  const m = src.match(/manager:\s*\{\s*label:'[^']*',\s*perms:\s*\[([^\]]*)\]/);
  return { manager: { perms: m[1].split(',').map(x=> x.trim().replace(/'/g,'')) } };
})();
MANAGER.forEach(p=> assert(roles.manager.perms.indexOf(p) >= 0, `المدير بيشوف: ${p}`));
HIDDEN.forEach(p=> assert(roles.manager.perms.indexOf(p) < 0, `المدير مش بيشوف: ${p}`));

// ---- 🔒 الأهم: كل لوحة فلوس/إعدادات/إنهاء خدمة مخفية عن المدير ----
const html = fs.readFileSync(path.resolve(__dirname,'..','sales','index.html'),'utf8');
const titles = (html.split('id="admin"')[1] || '').split('<h3').slice(1)
  .map(x=> x.split('</h3>')[0].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim())
  .filter(Boolean);
assert(titles.length > 20, `لقينا ${titles.length} لوحة في شاشة الأدمن`);
const leaked = titles.filter(t=> HIDDEN.indexOf(permOf(t)) >= 0 && MANAGER.indexOf(permOf(t)) >= 0);
assertEq(leaked, [], 'مفيش لوحة حساسة مصنّفة غلط');
// أي لوحة فيها كلمة مرتب/سلفة/عمولة لازم تبقى money
const moneyish = titles.filter(t=> /الرواتب|السلف|العمولات|عمولة|الخصومات/.test(t));
assert(moneyish.length >= 4, 'فيه لوحات فلوس فعلًا');
moneyish.forEach(t=> assertEq(permOf(t), 'money', `لوحة فلوس محمية: "${t}"`));

// ---- الدخول: كود المالك مش بيتلغي لو كود المدير اتساب فاضي ----
const src2 = fs.readFileSync(path.resolve(__dirname,'..','sales','sales-app.js'),'utf8');
assert(/isManager\s*=\s*!!window\.managerCode/.test(src2),
  'كود المدير الفاضي مش بيفتح الدخول (شرط !! موجود)');
assert(/pass\s*!==\s*ADMIN_CODE/.test(src2), 'كود المدير ماينفعش يساوي كود المالك');
assert(/roleHidden\s*===\s*'1'/.test(src2), 'اللوحات الممنوعة بتفضل مخفية مع تبديل التبويبات');

// ---------- 🔒 اختبار الإخفاء الفعلي على كل لوحات الشاشة ----------
{
  const vm4 = require('vm');
  const { makeSandbox, makeFirebaseStubs, makeEl } = require('./helpers/dom-stubs');
  const SB = makeSandbox(); Object.assign(SB, makeFirebaseStubs());
  const htmlR = fs.readFileSync(path.resolve(__dirname,'..','sales','index.html'),'utf8');
  const ts = (htmlR.split('id="admin"')[1]||'').split('<h3').slice(1)
    .map(x=> x.split('</h3>')[0].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim()).filter(Boolean);
  const panels = ts.map(t=>({ _t:t, style:{}, dataset:{}, querySelector:()=>({textContent:t}) }));
  const adminEl = { querySelectorAll:(sel)=> String(sel).includes('.panel') ? panels : [],
                    querySelector:(s)=> s==='.admin-top' ? makeEl() : null };
  SB.document.getElementById = (id)=> id==='admin' ? adminEl : (id==='adminTabBar' ? null : makeEl());
  SB.document.querySelector = (s)=> String(s).includes('#admin') ? adminEl : makeEl();
  SB.setInterval = ()=>0; SB.setTimeout = ()=>0;
  vm4.createContext(SB);
  const appSrc = fs.readFileSync(path.resolve(__dirname,'..','sales','sales-app.js'),'utf8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm,'');
  try{ vm4.runInContext(appSrc, SB, {filename:'sales-app.js'}); }catch(e){}
  // نحاكي دخول المدير من جوه الموديول (زي doAdminLogin بالظبط)
  vm4.runInContext("adminRole='manager'; applyRoleVisibility();", SB);

  const shown = panels.filter(p=> p.style.display !== 'none');
  const hidden = panels.filter(p=> p.style.display === 'none');
  assert(hidden.length > 10, `المدير: اتخفى ${hidden.length} لوحة`);
  assert(shown.length > 5,  `المدير: فاضل شايف ${shown.length} لوحة`);
  const FORBIDDEN = ['money','settings','terminate','people'];
  const leaked = shown.filter(p=> FORBIDDEN.indexOf(p.dataset.perm) >= 0);
  assertEq(leaked.map(p=> p._t.slice(0,24)), [], 'مفيش لوحة ممنوعة ظاهرة للمدير');
  // اللوحات اللي لازم يشوفها فعلاً
  ['طلبات الإذن','مخالفات محتاجة','طلبات تسجيل'].forEach(k=>{
    assert(shown.some(p=> p._t.includes(k)), `المدير شايف: ${k}`);
  });
  // واللي ممنوعة قطعًا
  ['الرواتب الشهرية','سجل السلف','إنهاء خدمة','كود المدير','إعدادات رصيد الوقت'].forEach(k=>{
    assert(hidden.some(p=> p._t.includes(k)), `مخفي عن المدير: ${k}`);
  });

  // المالك يشوف كل حاجة
  panels.forEach(p=> p.style.display = '');
  vm4.runInContext("adminRole='owner'; applyRoleVisibility();", SB);
  assertEq(panels.filter(p=> p.style.display === 'none').length, 0, 'المالك بيشوف كل اللوحات');

  // الحماية بتتطبّق كل مرة الشاشة تتفتح (مش وقت الدخول بس)
  assert(/function openAdmin\(\)[\s\S]{0,220}applyRoleVisibility/.test(appSrc),
    'الصلاحيات بتتطبّق داخل openAdmin كمان');
  assert(typeof SB.window.roleDiag === 'function', 'دالة التشخيص roleDiag متاحة');
}
