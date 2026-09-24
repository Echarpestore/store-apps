'use strict';
require('./helpers/swv');   // إصدار الكاش ≥ N بدل رقم مثبّت
const fs=require('fs');
// 🔄 23-09: بيعدّي على assert بتاع الـrunner (كان بيرمي ويوقف الملف كله عند أول فشل)
function ok(x,m){if(typeof global.assert==='function')return global.assert(!!x,m);if(!x)throw new Error(m);console.log('PASS '+m)}
const H=fs.readFileSync('tryon/photo.html','utf8');
const C=fs.readFileSync('tryon/photo-core.js','utf8');
const SW=fs.readFileSync('tryon/sw.js','utf8');
ok(H.includes('var n = gridCells.length;'),'crop uses actual requested result count');
ok(H.includes('PC.computeGridLayout(n)'),'crop layout matches backend computeGridLayout(n)');
// 🔄 الـinset بقى 0.015 (0.025 كان بياكل من الوش في الخانات الصغيرة) — المهم إنه موجود وصغير
ok(/layout\.cols, layout\.rows, n, 0\.0[1-3]\d*\s*\)/.test(H),'slice uses actual cells with safe inset');
ok(!H.includes('SERVER_GRID_CELLS = 4'),'wrong fixed-4 assumption removed');
ok(C.includes('RESULT_CACHE_SCHEMA = "v63-actual-grid"'),'old broken crop cache invalidated');
// 🔄 مفيش ?v= على photo-core — الـsw بيجيب js من الشبكة الأول بـno-cache
ok(assetAtLeast(H, 'photo-core.js', 63) || (/cache: 'no-cache'/.test(SW) && /fetch\(fresh\)/.test(SW)),'browser cache busted');
ok(swAtLeast(SW, 63),'service worker cache bumped');
console.log('tryon actual-grid v344 regression: PASS');
