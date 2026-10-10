// ============================================================
// 🧪 test-stories-app.js — الستوري في تطبيق العميلات (async — بيشتغل في run-async كمان)
//   · مقفولة لحد ما المالك يفتحها من Office 2 · المنشور بس · Glow لوحدها
//   · «جرّبيها» = نفس تجربة الشات · زرار الرجوع · الإشعار مش بيتبعت وهي مقفولة
// ============================================================
'use strict';
const path = require('path'); const fs = require('fs');
const ROOT = path.join(__dirname, '..');
let _fail = 0;
const assert = (c, m)=>{ if(c){ if(global.assert) global.assert(true, m); } else { _fail++; console.error('  ❌ ' + m); if(global.assert) global.assert(false, m); } };
const assertEq = (a, e, m)=> assert(JSON.stringify(a) === JSON.stringify(e), m + ' — expected ' + JSON.stringify(e) + ' got ' + JSON.stringify(a));
(async function(){

/* ٦) تطبيق العميلات: مقفول لحد ما المالك يفتحه · وبيعرض المنشور بس */
{
  const vm = require('vm');
  const src = fs.readFileSync(path.join(ROOT, 'pos', 'stories-app.js'), 'utf8');
  const mkDb = (live, rows)=>({ collection: (c)=>{ const q = { f:[], where(a,o,v){ q.f.push([a,v]); return q; }, limit(){ return q; },
      get(){ const r = (rows||[]).filter(x=> q.f.every(([a,v])=> x[a]===v)); return Promise.resolve({ docs: r.map(x=>({ id:x.id, data:()=>x })) }); },
      doc(id){ return { get(){ return Promise.resolve(c==='pos_test_settings' ? { exists:true, data:()=>({ live_echarpe: live }) } : { exists:false }); } }; } }; return q; } });
  const ctx = (live, rows)=>{ const w = {}; const c = { window:w, localStorage:{ getItem(){ return null; }, setItem(){} }, document:{ getElementById(){ return {}; }, createElement(){ return {}; }, head:{ appendChild(){} } }, console, Promise, setTimeout, clearTimeout, JSON, Object, String, Number, Date };
    vm.createContext(c); vm.runInContext(src, c); return w.StoriesApp; };
  const rows = [ { id:'p1', status:'published', brand:'echarpe', title:'جديد', thumb:'data:x', approvedAt:1 }, { id:'h1', status:'archived', brand:'echarpe', homeFeed:'echarpe', title:'لينن', productName:'لينن بيج', price:350, thumb:'data:y', approvedAt:1 },
                 { id:'g1', status:'published', brand:'glow', title:'Glow', thumb:'data:z', approvedAt:1 }, { id:'w1', status:'pending', brand:'echarpe', title:'مستنية', thumb:'data:w' } ];
  const off = ctx(false, rows); let reran = 0;
  off.init(mkDb(false, rows), 'echarpe', ()=>{ reran++; });
  const on = ctx(true, rows);
  on.init(mkDb(true, rows), 'echarpe', ()=>{ reran++; });
  await new Promise(r=> setTimeout(r, 30));
  {
    assertEq([off.storiesHtml(), off.homeHtml()], ['', ''], 'مقفول من Office 2 = مفيش ستوري ولا «مختارة ليكي» للعميلات');
    const sh = on.storiesHtml(), hh = on.homeHtml();
    assert(/جديد/.test(sh) && !/مستنية/.test(sh) && !/Glow/.test(sh.replace('جديد إيشارب','')), 'مفتوح = ستوري إيشارب المنشورة بس (مش المستنية ولا Glow)');
    assert(/لينن بيج/.test(hh) && /350/.test(hh), '«مختارة ليكي» من المنتجات اللي على الرئيسية');
  }
  const L = fs.readFileSync(path.join(ROOT, 'loyalty', 'index.html'), 'utf8');
  assert(/pos\/stories-app\.js/.test(L) && /StoriesApp\.init\(db, CATALOG_BRAND/.test(L), 'تطبيق إيشارب بيحمّل الستوري');
  assert(/StoriesApp\.storiesHtml\(\)/.test(L) && /StoriesApp\.homeHtml\(\)/.test(L), 'الستوري و«مختارة ليكي» جوه «بطاقتي»');
  assert(/isOn\('stvWrap','on'\)\) return 'story'/.test(L), 'زرار الرجوع بيقفل الستوري (مش بيخرج من التطبيق)');
  assert(/tryonOverlayOpen/.test(src) && /echarpe_tryon_img/.test(src), '«جرّبيها» بتفتح نفس تجربة الشات');
  const F = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
  const fn = F.slice(F.indexOf('stories_push_(echarpe|glow)'), F.indexOf('stories_push_(echarpe|glow)') + 700);
  assert(/live_" \+ brand\] !== true\) return/.test(fn), 'مفيش إشعار ستوري لو الستوري مقفولة على العميلات');
  assert(/after\.seq/.test(fn) && /before\.seq/.test(fn), 'الإشعار بس لما seq يزيد (موافقة جديدة بإشعار)');
}

if(_fail) process.exitCode = 1; else console.log('  ✅ test-stories-app');
})();
