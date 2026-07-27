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
