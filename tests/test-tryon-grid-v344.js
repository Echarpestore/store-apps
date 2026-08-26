'use strict';
const fs=require('fs');
function ok(x,m){if(!x)throw new Error(m);console.log('PASS '+m)}
const H=fs.readFileSync('tryon/photo.html','utf8');
const C=fs.readFileSync('tryon/photo-core.js','utf8');
const SW=fs.readFileSync('tryon/sw.js','utf8');
ok(H.includes('var n = gridCells.length;'),'crop uses actual requested result count');
ok(H.includes('PC.computeGridLayout(n)'),'crop layout matches backend computeGridLayout(n)');
ok(H.includes('layout.cols, layout.rows, n, 0.025'),'slice uses actual cells with safe inset');
ok(!H.includes('SERVER_GRID_CELLS = 4'),'wrong fixed-4 assumption removed');
ok(C.includes('RESULT_CACHE_SCHEMA = "v63-actual-grid"'),'old broken crop cache invalidated');
ok(H.includes('photo-core.js?v=63'),'browser cache busted');
ok(SW.includes("echarpe-tryon-v63"),'service worker cache bumped');
console.log('tryon actual-grid v344 regression: PASS');
