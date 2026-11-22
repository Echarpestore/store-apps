/* 🏠 الصفحة الرئيسية = الأتيليه + شات الموقع + فوتر الفروع/السوشيال/التطبيق */
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fails = 0;
function ok(c, m){ if(c) console.log('  ✅ ' + m); else { fails++; console.log('  ❌ ' + m); } }

const home = rd('index.html'), at = rd('atelier/index.html'), chat = rd('atelier/chat.js'), js = rd('atelier/atelier.js');
ok(/location\.replace\('atelier\/' \+ q \+ location\.hash\)/.test(home), 'home: بتحوّل على الأتيليه وبتنقل الباراميترز والـ#');
ok(/noscript>\s*<meta http-equiv="refresh"/.test(home), 'home: تحويل احتياطي من غير جافاسكريبت');
ok(fs.existsSync(path.join(ROOT, 'home.html')), 'home: الصفحة القديمة محفوظة في home.html');
ok(/<script src="\.\/chat\.js\?v=\d+"><\/script>/.test(at), 'atelier: chat.js متحمّل');
ok(/href="\.\.\/loyalty\/\?chat=1" data-chat/.test(at), 'atelier: زرار الهيرو بيفتح الشات');
ok(/class="foot-chat"[^>]*data-chat/.test(at), 'footer: زرار الشات');
ok((at.match(/<ul class="foot-branches">[\s\S]*?<\/ul>/) || [''])[0].split('<li>').length - 1 === 3, 'footer: التلات فروع');
ok(/play\.google\.com\/store\/apps\/details\?id=store\.echarpe\.loyalty/.test(at), 'footer: لينك تحميل التطبيق');
ok(/instagram\.com\/echarpestore2/.test(at) && /facebook\.com\/echarpestore/.test(at), 'footer: صفحات السوشيال');
ok(/customer_chat/.test(chat) && /source: "web"/.test(chat), 'chat: نفس كوليكشن الشات بتاع POS');
ok(/chatValidate/.test(chat) && /chatAutoReply/.test(chat) && /chatExpireAt/.test(chat), 'chat: قواعد chat-core المشتركة');
ok(/\^01\[0-9\]\{9\}\$/.test(chat), 'chat: التليفون بصيغة مصرية');
ok(/show\("off"\)/.test(chat) && /wa\.me/.test(chat), 'chat: لو الدخول اترفض بيعرض واتساب');
ok(/if \(EMBED\) return;/.test(chat), 'chat: مش بيظهر جوّه التطبيق');
ok(!/\balert\(/.test(chat), 'chat: من غير alert');
ok(/window\.EcharpeChat\) \{ window\.EcharpeChat\.open\(\)/.test(js), 'atelier.js: openChatCta بيفتح شات الموقع');
try { new Function(chat); ok(true, 'chat.js: سليم نحويًا'); } catch (e) { ok(false, 'chat.js: ' + e.message); }
if(fails){ console.log('\n❌ ' + fails + ' فشل'); process.exit(1); }
console.log('\n✅ تمام');
