#!/usr/bin/env node
// v656 — حافز الأسبوع المعتمد: مبيظهرش كسطر في كارت الموظف — بيظهر بوكس هدية مرة واحدة لما المالك يعتمده
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const src = fs.readFileSync(path.join(ROOT,'sales','sales-app.js'),'utf8');
const html = fs.readFileSync(path.join(ROOT,'sales','index.html'),'utf8');
ok(/sales-app\.js\?v=(65[6-9]|6[6-9]\d|[7-9]\d\d)/.test(html), 'sales بيحمّل النسخة الجديدة');
ok(!src.includes('✅ حافز أسبوع ${x.key'), 'سلبي: سطر «✅ حافز أسبوع … ج» اتشال من كارت الموظف');
ok(/const approvedHtml = '';/.test(src), 'الكارت مبيعرضش الحوافز المعتمدة كقائمة');
const fn = src.match(/function unseenApprovedBonus\([\s\S]*?\n\}/)[0];
const ctx = {}; vm.runInNewContext(fn + '; this.f = unseenApprovedBonus;', ctx); const f = ctx.f;
const NOW = Date.parse('2026-10-24T12:00:00Z'), D = 86400000;
const base = { id:'bw_e1_2026-10-17', employeeId:'e1', employeeName:'سارة', weekKey:'2026-10-17', amount:100, status:'approved', decidedAt: NOW - D };
ok(f([base], ['e1'], NOW) && f([base], ['e1'], NOW).id === base.id, 'حافز معتمد لموظف الفرع → يظهر كهدية');
ok(f([Object.assign({}, base, { bonusSeen:true })], ['e1'], NOW) === null, 'سلبي: اتشاف قبل كده → مايظهرش تاني');
ok(f([Object.assign({}, base, { status:'rejected', amount:0 })], ['e1'], NOW) === null, 'سلبي: مرفوض → لا');
ok(f([Object.assign({}, base, { amount:0 })], ['e1'], NOW) === null, 'سلبي: معتمد بصفر → لا');
ok(f([base], ['e2'], NOW) === null, 'سلبي: موظف فرع تاني → مايظهرش على الجهاز ده');
ok(f([Object.assign({}, base, { decidedAt: NOW - 30*D })], ['e1'], NOW) === null, 'سلبي: اعتماد أقدم من 21 يوم → مايطلعش فجأة');
const a = Object.assign({}, base, { id:'a', decidedAt: NOW - 2*D }), b = Object.assign({}, base, { id:'b', decidedAt: NOW - D });
ok(f([b, a], ['e1'], NOW).id === 'a', 'أكتر من حافز → الأقدم الأول والباقي بعده');
ok(/setDoc\(doc\(db,'sales_bonus_week', r\._bonusId\), \{ bonusSeen: true/.test(src), 'الدوسة على الهدية بتعلّم bonusSeen في sales_bonus_week');
ok(/حافز الأسبوع' : /.test(src) && /'أسبوع ' \+ String\(bw\.weekKey/.test(src), 'نص الهدية: «حافز الأسبوع — أسبوع MM-DD»');
ok(/allBonusDecisions = snap\.docs[\s\S]{0,200}showUnseenRewardsIfAny/.test(src), 'أول ما المالك يعتمد → الهدية بتظهر على الجهاز فورًا');
console.log(`\n${fail ? '❌' : '✅'} bonus gift box v656: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
