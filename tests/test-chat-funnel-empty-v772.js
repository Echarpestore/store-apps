#!/usr/bin/env node
// v772 — محادثة «🧕 جرّبت منتج» من غير رسايل: بنقول للموظفة إن العميلة مبعتتش حاجة وإيه اللي عملته في التطبيق
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const ui = fs.readFileSync(path.join(ROOT,'pos','chat-staff-ui.js'),'utf8');
const pick = (name)=> ui.match(new RegExp('function ' + name + '\\(c\\)\\{[\\s\\S]*?\\n  \\}'))[0];
const ctx = { Date, Number, String, esc2: (t)=> String(t).replace(/[<>&"]/g, c=> ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]) };
vm.runInNewContext(pick('ccFunnelWhat') + pick('ccFunnelEmpty') + '; this.what = ccFunnelWhat; this.empty = ccFunnelEmpty;', ctx);
ok(ctx.what({ funnelStage:'tryon', funnelProductName:'طرحة ساتان' }).includes('«طرحة ساتان»'), 'جرّبت منتج معروف → اسمه');
ok(ctx.what({ funnelStage:'tryon', funnelFromAtelier:true }).includes('البروفة'), 'جرّبت من البروفة من غير منتج → «في البروفة (الأتيلييه)»');
ok(ctx.what({ funnelStage:'cart', funnelProductName:'X' }).includes('السلة'), 'سلة → «حطّت في السلة ومكمّلتش»');
ok(ctx.what({ funnelStage:'checkout' }).includes('الدفع'), 'دفع → «وصلت لصفحة الدفع»');
const e = ctx.empty({ funnelStage:'tryon', funnelFromAtelier:true, funnelAt: Date.parse('2026-10-28T15:00:00Z') });
ok(e.includes('مبعتتش رسايل') && e.includes('ابدئي انتي الكلام') && !e.includes('لسه مفيش رسايل'), 'المحادثة الفاضية بتشرح إن العميلة مبعتتش وإن الموظفة تبدأ');
ok(ctx.empty({}) .includes('لسه مفيش رسايل') && ctx.empty(null).includes('لسه مفيش رسايل'), 'سلبي: محادثة عادية من غير funnel → «لسه مفيش رسايل» زي الأول');
ok(ctx.what({ funnelStage:'view' }) === '' && ctx.what({ funnelStage:'chat' }) === '', 'سلبي: مشاهدة/شات مش بيتعرضوا كحدث');
ok(!ctx.empty({ funnelStage:'tryon', funnelProductName:'<img src=x onerror=alert(1)>' }).includes('<img'), 'سلبي: اسم المنتج متأمّن (escape)');
ok(ctx.what({ funnelStage:'order', funnelOrderCol:'atelier_orders', funnelOrderCode:'A12', funnelProductName:'طرحة' }).includes('غرفة القياس #A12'), 'أوردر من غرفة القياس → كوده واسم القطعة');
const lo = fs.readFileSync(path.join(ROOT,'loyalty','index.html'),'utf8'), at = fs.readFileSync(path.join(ROOT,'atelier','atelier.js'),'utf8');
ok(!/shopFunnelTrack\('tryon', null, \{ funnelFromAtelier:true \}\)/.test(lo) && /shopFunnelTrack\('view', null, \{ funnelFromAtelier:true \}\)/.test(lo), 'سلبي: فتح غرفة القياس لوحده مبقاش «جرّبت» (view بس)');
ok(/type: "atelier-tried"/.test(at) && /d\.type === 'atelier-tried'[\s\S]{0,300}shopFunnelTrack\('tryon'/.test(lo), 'صورة التجربة طلعت فعلًا → «جرّبت» باسم القطعة');
ok(/type: "atelier-ordered"/.test(at) && /d\.type === 'atelier-ordered'[\s\S]{0,400}shopFunnelTrack\('order'[\s\S]{0,200}funnelOrderCol:'atelier_orders'/.test(lo), 'أوردر غرفة القياس (توصيل) → «عملت أوردر» + الكود في الشات');
ok(/box\.innerHTML = html \|\| ccFunnelEmpty\(conv\(\)\);/.test(ui), 'renderThread بيستخدم الشرح لما مفيش رسايل');
['pos/index.html','sales/index.html','Office/old.html'].forEach(f=> ok(/chat-staff-ui\.js\?v=77[2-9]/.test(fs.readFileSync(path.join(ROOT,f),'utf8')), f + ' بيحمّل ≥ v772'));
console.log(`\n${fail ? '❌' : '✅'} chat funnel empty v772: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
