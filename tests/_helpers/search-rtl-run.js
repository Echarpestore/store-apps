// v761: يفتح pos/index.html الحقيقي في كروميوم، يحاكي ضغطة Ctrl+Shift (style مباشر ltr) ويتأكد إن #searchBar فضل RTL
const path=require('path'); const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage();
  const fs=require('fs'); const html=fs.readFileSync(path.join(__dirname,'..','..','pos','index.html'),'utf8')
    .replace(/<script[\s\S]*?<\/script>/g,''); // بدون سكريبتات — بنختبر الـCSS/الـHTML بس
  await p.setContent(html);
  const r=await p.evaluate(()=>{ const el=document.getElementById('searchBar'); el.style.direction='ltr'; el.style.textAlign='left';
    const cs=getComputedStyle(el); return {dir:cs.direction, align:cs.textAlign, attr:el.getAttribute('dir')}; });
  // سلبي: حقل عادي من غير الحماية بيتقلب فعلًا (يثبت إن المحاكاة بتعمل اللي بنحميه منه)
  const neg=await p.evaluate(()=>{ const el=document.createElement('input'); document.body.appendChild(el); el.style.direction='ltr'; return getComputedStyle(el).direction; });
  console.log(JSON.stringify({...r, neg})); await b.close();
})().catch(e=>{ console.log(JSON.stringify({err:String(e)})); process.exit(0); });
