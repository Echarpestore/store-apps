// مساعد test-branch-setup-v755.js — بيشغّل loadBranchSetupOptions الحقيقية بـdb وهمي (async)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'pos', 'pos-core.js'), 'utf8');
function grab(h){ const i = src.indexOf(h); let d = 0, st = false; for(let j = src.indexOf('{', i); j < src.length; j++){ if(src[j] === '{'){ d++; st = true; } else if(src[j] === '}'){ d--; if(st && !d) return src.slice(i, j + 1); } } }
const mode = process.argv[2];
const store = { pos_branch:'Glow', pos_branch_list: mode === 'nocache' ? null : JSON.stringify(['echarpe El Rehab', 'echarpe Madinaty']) };
const sel = { value:'', innerHTML:'' };
const ctx = { console:{ warn(){} }, JSON, Promise, Set, Array, setTimeout, clearTimeout,
  localStorage:{ getItem:k => store[k] == null ? null : store[k], setItem:(k, v) => { store[k] = v; } },
  document:{ getElementById: id => id === 'branchSetupSelect' ? sel : (id === 'branchSetupInput' ? { style:{}, focus(){} } : null) },
  GLOW_BRANCHES:['Glow'], EMPLOYEES_COLLECTION:'sales_employees',
  db:{ collection: () => ({ get: () => mode === 'hang' || mode === 'nocache' ? new Promise(() => {}) :
        mode === 'deny' ? Promise.reject(Object.assign(new Error('x'), { code:'permission-denied' })) :
        Promise.resolve({ docs:[{ data: () => ({ branch:'echarpe City Centre' }) }, { data: () => ({ branch:'الإدارة' }) }, { data: () => ({ branch:'X', isAdminAccount:true }) }] }) }) } };
vm.createContext(ctx);
vm.runInContext([grab('function _branchSetupRender('), grab('function _branchSetupCached('), grab('async function loadBranchSetupOptions('), grab('function onBranchSetupSelect(')].join('\n') + ';this.L=loadBranchSetupOptions;', ctx);
const t0 = Date.now();
const p = ctx.L();
const instant = sel.innerHTML;   // بعد أول سطر sync
p.then(() => {
  process.stdout.write(JSON.stringify({ instant, final: sel.innerHTML, ms: Date.now() - t0, cache: store.pos_branch_list }));
});
