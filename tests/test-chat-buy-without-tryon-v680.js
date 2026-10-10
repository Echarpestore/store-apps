// v680 — «أضيفيها للسلة» تشتغل حتى لو الموظفة شالت زر جرّبيها (منتج مش طرحة)
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'pos', 'chat-staff-ui.js'), 'utf8');

// جهة الموظفة: بلوك الباركود لازم يبقى **برّه** if(msg.tryon)
const sendStart = ui.indexOf('function ccSend(){');
const send = ui.slice(sendStart, ui.indexOf('function ccBlockToggle', sendStart));
const bcIdx = send.indexOf("msg.barcode = _bc;");
const tryIdx = send.indexOf('if(msg.tryon){');
assert(bcIdx > 0 && tryIdx > 0 && bcIdx < tryIdx, 'v680: الباركود بيتحط قبل/برّه شرط جرّبيها');
// سلبي: البندانة لسه مربوطة بجرّبيها (وضع الشبكة في صفحة التجربة بس)
assert(send.indexOf('msg.bandanaColors = _bandColors') > tryIdx, 'v680 سلبي: البندانة لسه جوّه شرط جرّبيها');

// جهة العميلة (echarpe + Glow): الزراير مع جرّبيها أو باركود، وزر جرّبيها بشرطه بس
for(const app of ['loyalty', 'glow']){
  const h = fs.readFileSync(path.join(root, app, 'index.html'), 'utf8');
  assert(h.includes('if(chatImgs[m.id] && (m.tryon || m.barcode)){'), app + ': البلوك بيظهر مع جرّبيها أو باركود');
  assert(!h.includes('if(m.tryon && chatImgs[m.id]){'), app + ' سلبي: الشرط القديم اتشال');
  assert(h.includes("if(m.tryon) body += '<button class=\"m-try\""), app + ': زر جرّبيها بشرطه لوحده');
  assert(h.includes("if(m.barcode){"), app + ': زر أضيفيها للسلة بشرط الباركود');
}
assert(/loyalty-shell-v7(0[1-9]|[1-9]\d)/.test(fs.readFileSync(path.join(root, 'loyalty', 'sw.js'), 'utf8')), 'loyalty CACHE_NAME اترفع');
assert(/glow-loyalty-v(8[6-9]|9\d)/.test(fs.readFileSync(path.join(root, 'glow', 'sw.js'), 'utf8')), 'glow CACHE_NAME اترفع');
for(const f of ['pos/index.html', 'Office/index.html', 'sales/index.html'])
  assert(fs.readFileSync(path.join(root, f), 'utf8').match(/chat-staff-ui\.js\?v=(680|762)/), f + ': chat-staff-ui v680+');

// محاكاة منطق العرض كدالة نقية — نفس الشرط حرفيًا
function show(m){ return !!(m.img && (m.tryon || m.barcode)); }
assert(show({ img: 'x', tryon: false, barcode: '123' }), 'صورة + باركود من غير جرّبيها = زراير');
assert(show({ img: 'x', tryon: true, barcode: '' }), 'صورة + جرّبيها من غير باركود = زراير');
assert(!show({ img: 'x', tryon: false, barcode: '' }), 'سلبي: صورة بس = مفيش زراير');
assert(!show({ img: '', tryon: true, barcode: '123' }), 'سلبي: من غير صورة = مفيش زراير');
