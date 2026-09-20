// ============================================================
// swv.js — فحص إصدار الكاش من غير تثبيت رقم ولا اسم
// الدرس: 60+ اختبار كانوا بيدوّروا على 'store-apps-shell-v340' بالحرف. أول ما
// الرقم اترفع أو اسم الكاش اتغيّر (POS بقى pos-shell · loyalty بقى loyalty-shell)
// وقعوا كلهم وغطّوا على الفشل الحقيقي. القاعدة: «الإصدار ≥ N» مش «= N».
// ============================================================
'use strict';
function swVersion(swText){
  const m = String(swText || '').match(/CACHE_NAME\s*=\s*['"][^'"]*?-v(\d+)/);
  return m ? Number(m[1]) : 0;
}
function swAtLeast(swText, n){ return swVersion(swText) >= Number(n); }
global.swVersion = swVersion;
global.swAtLeast = swAtLeast;
module.exports = { swVersion, swAtLeast };

// نفس الفكرة لملفات `<script src="x.js?v=N">` — «≥ N» مش «= N»، والترتيب بالاسم مش بالرقم.
function _escRe(s){ return String(s).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }
function assetVersion(html, name){
  const m = String(html || '').match(new RegExp(_escRe(name) + '\\?v=(\\d+)'));
  return m ? Number(m[1]) : -1;
}
function assetAtLeast(html, name, n){ return assetVersion(html, name) >= Number(n); }
function assetIndex(html, name){ return String(html || '').search(new RegExp(_escRe(name) + '\\?v=\\d+')); }
global.assetVersion = assetVersion; global.assetAtLeast = assetAtLeast; global.assetIndex = assetIndex;
module.exports.assetVersion = assetVersion; module.exports.assetAtLeast = assetAtLeast; module.exports.assetIndex = assetIndex;

// فحوصات «اتغيّر كام سطر عن الأصل» بتقارن بنسخة أصلية في مسار جلسة التطوير.
// الفحص ده صالح **وقت التسليم بس**. برّه الجلسة الأصل مش موجود → تخطّي معلن، مش فشل وهمي.
function baselineOrSkip(absPath){
  const fs = require('fs');
  if(!fs.existsSync(absPath)){ console.log('  ⏭️  تخطّي (فحص وقت التسليم — الأصل مش موجود): ' + absPath.split('/').slice(-2).join('/')); return null; }
  return fs.readFileSync(absPath, 'utf8');
}
global.baselineOrSkip = baselineOrSkip; module.exports.baselineOrSkip = baselineOrSkip;
