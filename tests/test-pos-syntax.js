// ============================================================
// فحص صياغة كل ملفات POS — يمسك أخطاء syntax قبل الرفع
// ============================================================
'use strict';
const fs = require('fs'); const path = require('path');
const dir = path.resolve(__dirname, '..', 'pos');
if (fs.existsSync(dir)){
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.js') && !f.includes('.min.'))){
    const src = fs.readFileSync(path.join(dir,f),'utf8');
    let ok = true; try { new Function(src); } catch(e){ ok = false; console.error('   ', f, '→', e.message); }
    assert(ok, `pos/${f} صياغة سليمة`);
  }
} else { console.log('  (مجلد pos مش موجود جنب tests — اتخطى)'); }

// ============================================================
// 🧱 توازن الـdiv في index.html
// الباج: تعديل على خانة العميل ساب `</div>` زيادة — فقفل حاوية الشاشة
// بدري وطلعت السلة وشريط الدفع كلهم بيض. الصفحة مبتوقعش، بس الشكل
// بيتفرتك بالكامل ومفيش أي رسالة خطأ.
// ============================================================
{
  const fs2 = require('fs');
  const path2 = require('path');
  ['pos/index.html', 'sales/index.html', 'Office/index.html', 'join/index.html'].forEach(function(rel){
    const f = path2.resolve(__dirname, '..', rel);
    if(!fs2.existsSync(f)) return;
    const src = fs2.readFileSync(f, 'utf8');
    const body = src.slice(src.indexOf('<body'));
    // بنشيل الكود اللي جوه <script> — فيه سلاسل نصية فيها وسوم
    const clean = body.replace(/<script[\s\S]*?<\/script>/g, '');
    const open  = (clean.match(/<div\b/g)  || []).length;
    const close = (clean.match(/<\/div>/g) || []).length;
    assertEq(open - close, 0,
      '🧱 ' + rel + ' — الـdiv متوازن (مفتوح ' + open + ' · مقفول ' + close + ')');
  });
}
