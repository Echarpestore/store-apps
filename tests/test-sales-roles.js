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
