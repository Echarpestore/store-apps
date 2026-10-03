// مساعد test-shop-cfg-before-order-v704.js — بيشغّل ensureShopCfg الحقيقية (async)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const app = process.argv[2];
const H = fs.readFileSync(path.join(__dirname, '..', '..', app, 'index.html'), 'utf8');
const i = H.indexOf('function ensureShopCfg(){'); let d = 0, j = H.indexOf('{', i);
for(; j < H.length; j++){ if(H[j] === '{') d++; else if(H[j] === '}'){ d--; if(!d) break; } }
let reads = 0, fail = true; const out = [];
const ctx = { shopCfg:{ pickupEnabled:true }, COL_SETTINGS:'pos_test_settings', console:{ warn(){} }, Object, Promise,
  db:{ collection: () => ({ doc: () => ({ get: () => { reads++; return fail ? Promise.reject({ code:'unavailable' }) : Promise.resolve({ exists:true, data: () => ({ ignoreBranchStock:true }) }); } }) }) } };
vm.createContext(ctx); vm.runInContext('var _shopCfgP = null;\n' + H.slice(i, j + 1) + ';this.E=ensureShopCfg;', ctx);
ctx.E().then(() => { out.push([!ctx.shopCfg.ignoreBranchStock && reads === 1, 'سلبي: القراءة فشلت = الافتراضي (ومفيش خطأ يوقف الطلب)']); fail = false; return ctx.E(); })
  .then(() => { out.push([ctx.shopCfg.ignoreBranchStock === true && reads === 2, 'بعد فشل، المحاولة الجاية بتقرا تاني وبتاخد العلم']); return ctx.E(); })
  .then(() => { out.push([reads === 2, 'بعد ما نجحت مرة، مفيش قراءة زيادة']); process.stdout.write(JSON.stringify(out)); });
