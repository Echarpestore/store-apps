#!/usr/bin/env node
// v767 — تحكم المالك في الكاشير عن بُعد: قفل/فتح · خروج الموظفة · دخول الجهاز بحساب الفرع متشفّر
'use strict';
const fs = require('fs'), path = require('path'); const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const ok = (c, m)=>{ if(c){ pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const rules = fs.readFileSync(path.join(ROOT,'security','firestore-phase2.rules'),'utf8');
const html = fs.readFileSync(path.join(ROOT,'pos','index.html'),'utf8');
ok(/<script src="pos-remote\.js\?v=76[7-9]"><\/script>/.test(html), 'الكاشير بيحمّل pos-remote.js');
const m = rules.match(/match \/pos_pair\/\{code\} \{([\s\S]*?)\n    \}/);
ok(m && /allow create: if signedIn\(\) && request\.resource\.data\.status == 'waiting'\s*&& !\('enc' in request\.resource\.data\)/.test(m[1]) && /allow update, delete: if isStaff\(\);/.test(m[1]) && /allow list: if isStaff\(\);/.test(m[1]), 'قاعدة pos_pair: الجهاز يطلب بس (من غير بيانات دخول) · الرد والقايمة للموظفين بس');
const RUN = `
const { chromium } = require('playwright'); const fs = require('fs');
const { open, NOW } = require(${JSON.stringify(path.join(ROOT,'tests','_helpers','office2-page.js'))});
(async()=>{ const out = {};
  // ── POS: القفل والخروج ──
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent('<html><body><div id="x">pos</div><script>window.__auth=null;window.__snap=null;window.firebase={auth:()=>({currentUser:{isAnonymous:false},onAuthStateChanged(cb){setTimeout(()=>cb({}),10)}}),firestore:Object.assign(()=>({collection:()=>({doc:()=>({onSnapshot(ok){window.__snap=ok;return ()=>{}},set(p){(window.__acks=window.__acks||[]).push(p);return Promise.resolve()}})})}),{FieldValue:{}})};let currentBranch="echarpe El Rehab";let currentEmployee={name:"سارة"};window.__out=0;function logout(){window.__out++;currentEmployee=null;}<\/script><script>' + fs.readFileSync(${JSON.stringify(path.join(ROOT,'pos','pos-remote.js'))},'utf8') + '<\/script></body></html>');
  await p.waitForTimeout(500);
  const snap = (d)=> p.evaluate(d=> window.__snap({ exists:true, data:()=>d }), d);
  await snap({ locked:false, kickSeq:3, kickAt: Date.now() - 3600e3 }); out.firstNoKick = await p.evaluate(()=> window.__out);
  await snap({ locked:true, lockMsg:'جرد', kickSeq:3 }); out.lockShown = await p.evaluate(()=> !!document.getElementById('posRemoteLock') && document.getElementById('posRemoteLock').innerText);
  await snap({ locked:false, kickSeq:3 }); out.lockGone = await p.evaluate(()=> !document.getElementById('posRemoteLock'));
  await snap({ locked:false, kickSeq:4, kickAt: Date.now() }); out.kicked = await p.evaluate(()=> window.__out);
  await snap({ locked:false, kickSeq:5, kickAt: Date.now() - 600e3 }); out.oldKick = await p.evaluate(()=> window.__out);
  out.acks = await p.evaluate(()=> window.__acks||[]);
  await b.close();
  // ── Office: الأزرار + دخول الجهاز متشفّر ──
  const pg = await open({ secure:true, data:{ office_pos_live:[ { id:'echarpe El Rehab', branch:'echarpe El Rehab', employee:'سارة', updatedAtMs: NOW - 60000 }, { id:'Glow', branch:'Glow', employee:'دينا', updatedAtMs: NOW - 20*3600e3 } ], pos_pair:[], pos_activity_log:[ { id:'r1', type:'device_storage_reset', branch:'echarpe El Rehab', ts: NOW - 3600e3, shell:false, quotaMB: 120, incognitoHint:true }, { id:'r2', type:'device_storage_reset', branch:'echarpe El Rehab', ts: NOW - 2*86400e3, shell:true, quotaMB: 9000 } ] } });
  const keys = await pg.p.evaluate(async()=>{ const k = await crypto.subtle.generateKey({ name:'RSA-OAEP', modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256' }, true, ['encrypt','decrypt']); window.__k = k; return JSON.stringify(await crypto.subtle.exportKey('jwk', k.publicKey)); });
  await pg.p.evaluate((pub)=> O2.u.db.collection('pos_pair').doc('482913').set({ code:'482913', status:'waiting', pub, branchHint:'echarpe El Rehab', createdAt: window.__now }), keys);
  out.live = await pg.go('live', null, 500);
  await pg.call(()=> O2.live.lock('echarpe El Rehab', true), 200); out.afterLock = await pg.text();
  await pg.p.evaluate(()=> O2.u.db.collection('pos_test_settings').doc('pos_remote_echarpe El Rehab').set({ remoteCtl:true, branch:'echarpe El Rehab', ackLocked:true, ackKickSeq:0, ackAt: window.__now + 1000 }, { merge:true })); await pg.p.waitForTimeout(200); out.afterAck = await pg.text();
  await pg.call(()=> O2.live.kick('echarpe El Rehab'), 200);
  await pg.call(()=> O2.live.pairSheet('482913'), 200);
  await pg.p.evaluate(()=>{ document.getElementById('lpEmail').value='rehab@echarpe.pos'; document.getElementById('lpPass').value='S3cret!'; });
  await pg.call(()=> O2.live.pairSend('482913'), 600);
  out.writes = await pg.writes();
  const sent = out.writes.find(w=> w.col==='pos_pair' && w.op==='update');
  out.plainLeak = JSON.stringify(sent||{}).includes('S3cret!');
  out.decrypted = sent ? await pg.p.evaluate(async(enc)=>{ const bin = atob(enc), a = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return new TextDecoder().decode(await crypto.subtle.decrypt({ name:'RSA-OAEP' }, window.__k.privateKey, a.buffer)); }, sent.p.enc) : '';
  out.errs = pg.errs; await pg.close();
  process.stdout.write(JSON.stringify(out));
})().catch(e=>{ process.stdout.write(JSON.stringify({ fatal:String(e && e.stack || e) })); process.exit(0); });`;
let out; try{ out = JSON.parse(execFileSync(process.execPath, ['-e', RUN], { encoding:'utf8', timeout:90000, maxBuffer:20*1024*1024, cwd: __dirname })); }catch(e){ out = { fatal:String(e && e.message) }; }
if(out.fatal && /playwright|Cannot find module/i.test(out.fatal)) console.log('  ⏭ كروميوم مش متاح');
else {
  ok(!out.fatal, 'اشتغل ' + (out.fatal||'').slice(0,300));
  ok(out.firstNoKick === 0, 'سلبي: أول قراية للمستند مش أمر خروج (مايخرّجش الموظفة وقت فتح الكاشير)');
  ok(/الكاشير مقفول من الإدارة/.test(out.lockShown||'') && /جرد/.test(out.lockShown||''), '🔒 القفل: شاشة فوق كل حاجة بالرسالة');
  ok(out.lockGone, '🔓 الفتح: الشاشة اختفت');
  ok(out.kicked === 1, '🚪 الخروج: الموظفة خرجت');
  ok(out.oldKick === 1, 'سلبي: أمر خروج قديم (أكتر من دقيقتين) مبيتنفّذش');
  ok(/📲 أجهزة مستنية دخول/.test(out.live||'') && /482913/.test(out.live||'') && /🔒 اقفل الكاشير/.test(out.live||'') && /🚪 خرّج سارة/.test(out.live||''), 'Office: الطلبات والأزرار ظاهرة');
  ok(/🔓 افتح الكاشير/.test(out.afterLock||'') && /🔒 مقفول من/.test(out.afterLock||''), 'Office: بعد القفل بيظهر «افتح» والحالة');
  ok(/⏳ مستني الجهاز يستلم القفل/.test(out.afterLock||'') && !/✅ الجهاز اتقفل فعلًا/.test(out.afterLock||''), 'v768 سلبي: مبيقولش «اتقفل» قبل ما الجهاز يرد');
  ok(/✅ الجهاز اتقفل فعلًا/.test(out.afterAck||''), 'v768: بعد رد الجهاز = «الجهاز اتقفل فعلًا»');
  ok(/📴 الكاشير مش متصل بحساب الفرع/.test(out.live||'') && /الإدارة تدخّل الجهاز/.test(out.live||''), 'v768: الفرع اللي مش متصل بيقول كده صراحة وبيقول تعمل إيه');
  ok(!/🚪 خرّج دينا/.test(out.live||''), 'v768 سلبي: مفيش زرار خروج لجهاز مش متصل');
  ok((out.acks||[]).some(a=> a.ackLocked === true) && (out.acks||[]).some(a=> a.ackKickSeq === 4), 'v768: الكاشير بيرد إنه استلم القفل والخروج');
  const w = out.writes || [];
  ok(w.some(x=> x.col==='pos_test_settings' && x.id==='pos_remote_echarpe El Rehab' && x.p.locked===true && x.p.remoteCtl===true), 'القفل بيتكتب في pos_remote_<الفرع>');
  ok(w.some(x=> x.col==='pos_test_settings' && x.id==='pos_remote_echarpe El Rehab' && x.p.kickAt > 0), 'الخروج بيتكتب (kickSeq + kickAt)');
  ok(!out.plainLeak, 'سلبي: الباسورد مش مكتوب مكشوف في Firestore');
  ok(/"e":"rehab@echarpe\.pos"/.test(out.decrypted||'') && /"p":"S3cret!"/.test(out.decrypted||'') && /"b":"echarpe El Rehab"/.test(out.decrypted||''), 'الجهاز بمفتاحه بس بيفك الإيميل والباسورد والفرع');
  ok(/🧹 الجهاز ده اتمسحت بياناته 2 مرة آخر 30 يوم/.test(out.live||'') && /من متصفح عادي مش برنامج الكاشير/.test(out.live||'') && /بيتفتح مرة من البرنامج ومرة من المتصفح/.test(out.live||'') && /شكله تصفح خفي/.test(out.live||''), 'v769: Office بيورّي إن الجهاز بيتمسح وسببه المحتمل');
  ok(!/🧹/.test((out.live||'').split('📍 Glow')[1]||''), 'v769 سلبي: فرع ماتمسحش مفيهوش التنبيه');
  ok(!(out.errs||[]).length, 'مفيش أخطاء JS ' + JSON.stringify(out.errs||[]).slice(0,200));
}
const core = fs.readFileSync(path.join(ROOT,'pos','pos-core.js'),'utf8');
ok(/navigator\.storage\.persist\(\)/.test(core) && /type:'device_storage_reset'/.test(core) && /try\{ posReportStorageReset\(val\); \}catch\(e\)\{\}/.test(core), 'v769: الكاشير بيطلب حفظ دايم وبيبلّغ لو فتح فاضي');
ok(!/localStorage\.removeItem\(_BL_KEY\)/.test(core) && /window\._posSavedLoginRejected = true;/.test(core), 'v768 سلبي: الدخول المحفوظ مبيتمسحش من أول رفض (كان بيخلّي الجهاز يطلب الإيميل للأبد)');
console.log('\n  ' + pass + ' ناجح · ' + fail + ' فاشل'); if(fail) process.exitCode = 1;
