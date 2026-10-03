// v704 — «مش موجود في الفرع» من الشات رغم إن ignoreBranchStock شغال: الإعدادات كانت بتتقري
// بس لما تبويب «اطلبي» يتفتح. دلوقتي بتتقري قبل فحص الطلب من أي مكان.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
for(const [app, doc] of [['loyalty', 'online_shop_echarpe_cfg'], ['glow', 'online_shop_glow_cfg']]){
  const H = fs.readFileSync(path.join(__dirname, '..', app, 'index.html'), 'utf8');
  const i = H.indexOf('function ensureShopCfg(){'); let d = 0, j = H.indexOf('{', i);
  for(; j < H.length; j++){ if(H[j] === '{') d++; else if(H[j] === '}'){ d--; if(!d) break; } }
  const fn = H.slice(i, j + 1);
  assert(fn.indexOf("doc('" + doc + "')") > 0, app + ': بيقرا مستند إعدادات البراند الصح');
  // تشغيل حقيقي (async في process منفصل)
  const res = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, '_helpers', 'shop-cfg-run.js'), app], { encoding:'utf8', timeout:15000 }));
  assert(res.length === 3, app + ': التشغيل الحقيقي خلص');
  res.forEach(r => assert(r[0], app + ': ' + r[1]));
  // الترتيب في الإرسال: الإعدادات الأول وبعدين المخزون وبعدين الفحص
  const sub = H.slice(H.indexOf('function shopSubmit(){'), H.indexOf('function shopSubmit(){') + 6000);
  const a = sub.indexOf('ensureShopCfg().then(function(){ return Promise.all(lines.map('), b = sub.indexOf('orderValidateCart(');
  assert(a > 0 && b > a, app + ': الطلب بيستنى الإعدادات قبل الفحص');
  assert(/\{ ignoreBranchStock: shopCfg\.ignoreBranchStock === true \}/.test(sub), app + ': والفحص بياخد العلم');
  assert(/function openQuickCheckout\(barcode\)\{[\s\S]{0,200}ensureShopCfg\(\)\.then/.test(H), app + ': السلة السريعة من الشات بتقرا الإعدادات');
  assert(/\.then\(function\(\)\{ return ensureShopCfg\(\); \}\)/.test(H), app + ': وتبويب «اطلبي» بيستخدم نفس الدالة (قراءة واحدة)');
}
