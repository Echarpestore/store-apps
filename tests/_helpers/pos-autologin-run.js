// مساعد test-pos-autologin-v757.js — بيشغّل كود الدخول الحقيقي من pos-core.js بـFirebase وهمي (async)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'pos', 'pos-core.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if(i < 0 || j < 0) throw new Error('marker ' + a.slice(0, 30)); return src.slice(i, j); };
const partAuth = cut('let _posAuthReadyResolve;', 'const db = firebase.firestore();');
const partBL = cut("const _BL_KEY = 'pos_branch_login';", '// أول ما الصفحة تفتح: لو مفيش فرع');
const partBoot = cut('if(currentBranch){', '// ---------------- State ----------------');
const scenario = process.argv[2];
const store = { pos_branch: 'echarpe El Rehab' };
let user = null, listeners = [], signIns = 0;
const plan = { net2: ['auth/network-request-failed', 'auth/network-request-failed', 'ok'], anon: ['ok'], wrong: ['auth/invalid-credential'], restore: [], nocreds: [] }[scenario];
const fire = () => listeners.slice().forEach(f => f(user));
const auth = {
  get currentUser(){ return user; },
  onAuthStateChanged(f){ listeners.push(f); },
  setPersistence(){ return Promise.resolve(); },
  signInWithEmailAndPassword(e, p){ signIns++; const r = plan.shift(); return new Promise((res, rej) => setTimeout(() => {
    if(r === 'ok'){ user = { uid:'branch', isAnonymous:false }; fire(); res(); } else rej(Object.assign(new Error(r), { code:r })); }, 5)); }
};
const els = {};
const mkEl = id => ({ id, classList:{ _s:new Set(), add(c){ this._s.add(c); }, remove(c){ this._s.delete(c); }, contains(c){ return this._s.has(c); } }, style:{}, textContent:'', appendChild(){}, insertBefore(){}, querySelector(){ return { nextSibling:{} }; } });
['branchSetupScreen', 'loginScreen'].forEach(id => els[id] = mkEl(id));
const ctx = {
  console:{ log(){}, warn(){} }, JSON, Promise, Math, String, Error, Object,
  btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
  unescape, escape, encodeURIComponent, decodeURIComponent,
  setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 40)), clearTimeout,
  localStorage:{ getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  window:{ addEventListener(){}, removeEventListener(){} },
  document:{ getElementById: id => els[id] || (els[id] = mkEl(id)), createElement: () => mkEl('branchSetupAuto'),
    querySelector: q => q === '#branchSetupScreen .pin-box' ? { querySelector: () => ({ nextSibling:{} }), insertBefore(n){ els.branchSetupAuto = n; }, appendChild(n){ els.branchSetupAuto = n; } } : (q === '.screen.active#branchSetupScreen' ? (els.branchSetupScreen.classList.contains('active') ? els.branchSetupScreen : null) : null),
    querySelectorAll: () => Object.values(els) },
  firebase:{ auth: () => auth },
  currentBranch: 'echarpe El Rehab', loadEmployeePicker(){ ctx._picker = (ctx._picker || 0) + 1; }, loadBranchSetupOptions(){}
};
ctx.window.document = ctx.document;
vm.createContext(ctx);
vm.runInContext(partBL + '\n' + partAuth + '\n' + partBoot, ctx);
// بيانات الدخول المحفوظة (زي ما الجهاز بيحفظها أول مرة)
if(scenario !== 'nocreds') vm.runInContext("saveBranchLogin('rehab@echarpe.store','secret')", ctx);
els.branchSetupScreen.classList.add('active');   // الصفحة بتفتح على شاشة الإعداد (HTML)
// Firebase بيخلّص استرجاع الجلسة المحفوظة
setTimeout(() => {
  if(scenario === 'restore') user = { uid:'branch', isAnonymous:false };
  if(scenario === 'anon') user = { uid:'anon', isAnonymous:true };
  fire();
}, 20);
setTimeout(() => {
  process.stdout.write(JSON.stringify({
    onLogin: els.loginScreen.classList.contains('active'),
    onSetup: els.branchSetupScreen.classList.contains('active'),
    signIns, user: user && user.uid, status: (els.branchSetupAuto || {}).textContent || '',
    credsKept: !!store.pos_branch_login, picker: ctx._picker || 0
  }));
  process.exit(0);
}, 900);
