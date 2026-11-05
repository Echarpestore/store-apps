const { chromium } = require('playwright');
const path=require('path'), fs=require('fs');
(async()=>{
  const [mode, out, ...rest]=process.argv.slice(2);
  const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:1080,height:1920}});
  pg.on('pageerror',e=>console.error('ERR',e.message));
  await pg.goto('file://'+path.resolve(__dirname,'index.html'));
  await pg.evaluate(()=>document.fonts.ready); await pg.waitForTimeout(300);
  fs.mkdirSync(out,{recursive:true});
  if(mode==='stills'){ for(const t of rest){ await pg.evaluate(t=>seek(+t),t); await pg.screenshot({path:`${out}/s_${t}.png`}); } }
  else { const fps=+rest[0]||30; const D=await pg.evaluate(()=>DURATION); const n=Math.round(D*fps);
    for(let i=0;i<n;i++){ await pg.evaluate(t=>seek(t),i/fps); await pg.screenshot({path:`${out}/f_${String(i).padStart(5,'0')}.jpg`,type:'jpeg',quality:92}); if(i%150==0) console.log(i,'/',n); } }
  await b.close();
})();
