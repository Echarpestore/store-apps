#!/usr/bin/env node
// v770 — 🖥️ شاشة الجهاز من Office: زرار RustDesk على كارت الفرع في POS Live (ID بس — الباسورد ما بيتخزنش في Firestore)
'use strict';
const fs = require('fs'), path = require('path'); const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const html = fs.readFileSync(path.join(ROOT,'Office','index.html'),'utf8');
const src = fs.readFileSync(path.join(ROOT,'office2','m-live.js'),'utf8');
ok(/m-live\.js\?v=([5-9]|\d\d)/.test(html), 'Office بيحمّل m-live.js نسخة جديدة');
ok(!/rdPw|rdPass|password:/.test(src), 'سلبي: الباسورد مش بيتخزن ولا بيتبعت في Firestore');

const RUN = `
const { open, NOW } = require(${JSON.stringify(path.join(ROOT,'tests','_helpers','office2-page.js'))});
(async()=>{ const out = {};
  const pg = await open({ data:{
    office_pos_live:[ { id:'echarpe El Rehab', branch:'echarpe El Rehab', employee:'سارة', updatedAtMs: NOW - 60000 }, { id:'Glow', branch:'Glow', employee:'دينا', updatedAtMs: NOW - 60000 } ],
    pos_test_settings:[ { id:'pos_remote_Glow', remoteCtl:true, branch:'Glow', rdId:'123 456 789' } ], pos_pair:[], pos_activity_log:[] } });
  out.live = await pg.go('live', null, 500);
  out.clean = await pg.p.evaluate(()=> [O2.live.rdClean('123 456 789'), O2.live.rdClean('12'), O2.live.rdClean('abc'), O2.live.rdClean('12345678901234567')]);
  // ربط: ID غلط → مفيش كتابة
  await pg.p.evaluate(()=>{ window.__rdAnswer = '12'; });
  await pg.p.evaluate(()=>{ window.prompt = ()=> '12'; });
  await pg.call(()=> O2.live.rdSet('echarpe El Rehab'), 300); out.badWrites = (await pg.writes()).filter(w=> w.col==='pos_test_settings').length;
  // ربط: ID صح
  await pg.p.evaluate(()=>{ window.prompt = ()=> ' 987-654-321 '; });
  await pg.call(()=> O2.live.rdSet('echarpe El Rehab'), 300);
  out.writes = (await pg.writes()).filter(w=> w.col==='pos_test_settings');
  out.after = await pg.text();
  // فتح: بيحاول يفتح rustdesk://
  await pg.p.evaluate(()=>{ window.__href = null; O2.live.rdNav = (h)=>{ window.__href = h; }; });
  await pg.call(()=> O2.live.rdOpen('Glow'), 100); out.href = await pg.p.evaluate(()=> window.__href);
  out.errs = pg.errs; await pg.close(); console.log(JSON.stringify(out));
})().catch(e=>{ console.error(e); process.exit(1); });`;
const tmp = path.join(require('os').tmpdir(), 'o2-rd-' + Date.now() + '.js'); fs.writeFileSync(tmp, RUN);
let out; try{ out = JSON.parse(execFileSync(process.execPath, [tmp], { cwd: ROOT, encoding:'utf8', timeout: 120000 }).trim().split('\n').pop()); } finally { try{ fs.unlinkSync(tmp); }catch(e){} }
ok(out.live.includes('🖥️ شاشة الجهاز') && out.live.includes('RustDesk ID') && out.live.includes('123456789'), 'الفرع اللي ليه ID: زرار «شاشة الجهاز» + الـID ظاهر');
ok(out.live.includes('🖥️ ربط الريموت'), 'الفرع من غير ID: زرار «ربط الريموت»');
ok(JSON.stringify(out.clean) === JSON.stringify(['123456789','','','']), 'سلبي: ID لازم 6–16 رقم (حروف/قصير/طويل مرفوض)');
ok(out.badWrites === 0, 'سلبي: ID غلط → مفيش كتابة في Firestore');
const w = out.writes.find(x=> x.id==='pos_remote_echarpe El Rehab');
ok(w && w.p && w.p.rdId === '987654321' && w.p.remoteCtl === true && w.p.branch === 'echarpe El Rehab' && !('rdPw' in w.p), 'ربط: بيتسجل rdId نضيف في pos_remote_<branch> من غير باسورد');
ok(out.after.includes('987654321') && !out.after.includes('ربط الريموت'), 'بعد الربط الكارت بيعرض الـID وزرار الشاشة');
ok(out.href === 'rustdesk://connection/new/123456789', 'شاشة الجهاز بتفتح rustdesk://connection/new/<ID>');
ok(!out.errs.length, 'مفيش أخطاء JS: ' + (out.errs||[]).join(' | '));
const bat = fs.readFileSync(path.join('/home/claude/out','REMOTE-INSTALL.bat'), 'latin1');
ok(/^[\x00-\x7F]*$/.test(bat) && !/[^\r]\n/.test(bat), 'REMOTE-INSTALL.bat: ASCII + CRLF');
ok(/--silent-install/.test(bat) && /--password "%PW%"/.test(bat) && /--get-id/.test(bat) && /RunAs/.test(bat), 'REMOTE-INSTALL.bat: تثبيت صامت + باسورد دائم + قراءة ID + صلاحيات أدمن');
console.log(`\n${fail ? '❌' : '✅'} office remote screen v770: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
