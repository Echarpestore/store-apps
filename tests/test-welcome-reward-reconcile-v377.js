const fs=require('fs'), path=require('path');
let pass=0; function ok(v,m){if(!v) throw new Error(m); pass++;}
const root=path.join(__dirname,'..');
const fn=fs.readFileSync(path.join(root,'functions','index.js'),'utf8');
ok(fn.includes('const eligibleBrands = [...brandsOf(after)]'), 'server reconciles existing token');
ok(!fn.includes('Object.keys(newTokens)'), 'undefined newTokens removed');
ok(fn.includes('await db.runTransaction(async (tx) =>'), 'welcome grant is transactional');
ok(fn.includes('if (current["welcomeGranted_" + brand]) return false;'), 'marker prevents duplicate grant');
ok(fn.includes('if (!readTokens(current, brand).length) return false;'), 'grant requires real token');
ok(fn.includes('.catch((e) => console.warn("welcome push"'), 'push failure cannot undo grant');
for(const rel of ['loyalty/index.html','glow/index.html','tryon/index.html']){
  const s=fs.readFileSync(path.join(root,rel),'utf8');
  ok(s.includes("var welcomeField = 'welcomeGranted_' + CATALOG_BRAND;"), rel+' cached token recovery');
  ok(s.includes("u['fcmTokenAt'] = Date.now();"), rel+' re-touch triggers reconciliation');
}
ok(fs.readFileSync(path.join(root,'loyalty/sw.js'),'utf8').includes('echarpe-loyalty-v81'),'loyalty sw bumped');
ok(fs.readFileSync(path.join(root,'glow/sw.js'),'utf8').includes('glow-loyalty-v74'),'glow sw bumped');
ok(fs.readFileSync(path.join(root,'tryon/sw.js'),'utf8').includes('echarpe-tryon-v64'),'tryon sw bumped');
console.log('PASS welcome reward reconciliation v377 ('+pass+')');
