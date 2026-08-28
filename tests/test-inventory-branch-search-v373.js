const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root,'pos','pos-admin.js'),'utf8');
const sw = fs.readFileSync(path.join(root,'pos','sw.js'),'utf8');
function ok(v,m){ if(!v) throw new Error(m); }

ok(/function\s+inventoryItemInBranch\s*\(/.test(src), 'branch visibility helper missing');
ok(/Object\.prototype\.hasOwnProperty\.call\(by, branch\)/.test(src), 'qtyByBranch ownership recovery missing');
ok(/excludedByImportBranch\s*===\s*branch/.test(src), 'explicit import detach guard missing');
ok(/\(Number\(by\[branch\]\)\s*\|\|\s*0\)\s*!==\s*0/.test(src), 'stale branches recovery must require real branch stock');
ok(/if\(!inventoryItemInBranch\(it, currentBranch\)\) return false;/.test(src), 'inventory list still uses stale branches-only gate');
ok(/الكود موجود في المخزون، لكنه مش مربوط بفرع/.test(src), 'cross-branch diagnostic message missing');
const m = sw.match(/store-apps-shell-v(\d+)/);
ok(m && Number(m[1]) >= 373, 'POS SW must be v373 or newer');
console.log('PASS inventory branch search v373');
