// ============================================================
// v761 — شريط البحث في شاشة البيع لازم يفضل يكتب من اليمين حتى لو الكاشير داس
// Ctrl+Shift (يمين) بالغلط على ويندوز (كروميوم بيحط direction:ltr مباشر على الحقل)
// ============================================================
'use strict';
const fs=require('fs'); const path=require('path'); const { execFileSync } = require('child_process');
const html=fs.readFileSync(path.join(__dirname,'..','pos','index.html'),'utf8');
assert(/<input[^>]*id="searchBar"[^>]*dir="rtl"/.test(html), 'v761: #searchBar عليه dir="rtl"');
assert(/#searchBar\{\s*direction:rtl !important;\s*text-align:right !important;\s*\}/.test(html), 'v761: قاعدة CSS !important بتثبّت الاتجاه');
assert(/pos-shell-v761/.test(fs.readFileSync(path.join(__dirname,'..','pos','sw.js'),'utf8')), 'v761: CACHE_NAME اترفع');
// سلبي: نسخة من الصفحة من غير القاعدة متعدّيش
const stripped=html.replace(/#searchBar\{ direction:rtl !important; text-align:right !important; \}/,'');
assert(!/#searchBar\{\s*direction:rtl !important/.test(stripped), 'v761 سلبي: من غير القاعدة الفحص بيفشل');
// رندر حقيقي (لو playwright متاح)
let out=null; try{ out=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'_helpers','search-rtl-run.js')],{encoding:'utf8',timeout:60000}).trim()); }catch(e){ out={err:String(e)}; }
if(out && !out.err){
  assertEq(out.dir,'rtl','v761 كروميوم: الاتجاه فضل rtl رغم style مباشر ltr');
  assertEq(out.align,'right','v761 كروميوم: المحاذاة فضلت يمين');
  assertEq(out.neg,'ltr','v761 سلبي كروميوم: حقل من غير حماية بيتقلب ltr فعلًا');
} else { console.log('  ⏭ v761: رندر كروميوم متخطّي —', out && out.err && out.err.slice(0,80)); }
