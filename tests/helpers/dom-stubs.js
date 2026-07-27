// ============================================================
// dom-stubs.js — بيئة DOM وهمية موحّدة لكل الاختبارات
// نفس أسلوب الـ harness المُثبت في الجلسات، كملف دائم.
// ============================================================
'use strict';

function makeEl(){
  const base = {
    style:{}, dataset:{}, innerHTML:'', value:'', textContent:'', checked:false,
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
    appendChild(c){ return c; }, removeChild(){}, remove(){}, focus(){}, blur(){}, click(){},
    querySelector(){ return makeEl(); }, querySelectorAll(){ return []; },
    closest(){ return null; }, insertAdjacentHTML(){}, getContext(){ return { drawImage(){}, fillRect(){} }; },
    toDataURL(){ return 'data:image/png;base64,'; },
  };
  return new Proxy(base, {
    get: (t,k)=> (k in t) ? t[k] : undefined,
    set: (t,k,v)=>{ t[k]=v; return true; },
  });
}

function makeDocument(){
  return {
    getElementById: ()=> makeEl(),
    querySelector: ()=> makeEl(),
    querySelectorAll: ()=> [],
    createElement: ()=> makeEl(),
    addEventListener(){}, removeEventListener(){},
    body: makeEl(), head: makeEl(), documentElement: makeEl(),
    hidden:false, visibilityState:'visible',
  };
}

// ---- Firestore stubs: كل الدوال no-op وبترجع أشكال آمنة ----
function makeFirebaseStubs(){
  const unsub = ()=>{};
  return {
    initializeApp: ()=>({}),
    getAuth: ()=>({ currentUser:null }),
    signInWithEmailAndPassword: async ()=>({ user:{ uid:'stub' } }),
    onAuthStateChanged: ()=> unsub,
    setPersistence: async ()=>{},
    browserLocalPersistence: {},
    getFirestore: ()=>({}),
    collection: ()=>({}), doc: ()=>({ id:'stub' }),
    addDoc: async ()=>({ id:'stub' }), setDoc: async ()=>{}, updateDoc: async ()=>{}, deleteDoc: async ()=>{},
    getDoc: async ()=>({ exists: ()=>false, data: ()=>({}) }),
    getDocs: async ()=>({ docs: [], forEach(){} , empty:true, size:0 }),
    onSnapshot: ()=> unsub,
    query: ()=>({}), where: ()=>({}),
    enableIndexedDbPersistence: async ()=>{},
    Timestamp: { now: ()=>({ toMillis: ()=>Date.now() }), fromDate: (d)=>({ toMillis: ()=>d.getTime() }) },
  };
}

function makeSandbox(){
  const windowStub = {};
  const sandbox = {
    document: makeDocument(),
    navigator: { serviceWorker:{ register: async ()=>({}) }, mediaDevices:{ getUserMedia: async ()=>{ throw new Error('stub'); } } },
    console,
    // ⏱️ مؤقتات وهمية — بتسجّل من غير ما تشغّل، عشان الاختبارات متعلّقش
    setTimeout: ()=>0, setInterval: ()=>0, clearTimeout(){}, clearInterval(){}, requestAnimationFrame: ()=>0,
    alert(){}, confirm(){ return false; }, prompt(){ return null; },
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
    localStorage:{ _s:{}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } },
    sessionStorage:{ _s:{}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } },
    fetch: async ()=>({ ok:true, json: async ()=>({}), text: async ()=>'' }),
    URL, URLSearchParams, Date, JSON, Math, Promise, Image: function(){ return makeEl(); },
    Notification: { permission:'denied', requestPermission: async ()=>'denied' },
    location: { href:'https://test.local/sales/', search:'', origin:'https://test.local', pathname:'/sales/' },
    FileReader: function(){ return { readAsDataURL(){}, onload:null }; },
    atob: (s)=>Buffer.from(s,'base64').toString('binary'),
    btoa: (s)=>Buffer.from(s,'binary').toString('base64'),
  };
  sandbox.window = new Proxy(windowStub, {
    get: (t,k)=> (k in t) ? t[k] : sandbox[k],
    set: (t,k,v)=>{ t[k]=v; return true; },
    has: ()=> true,
  });
  sandbox.globalThis = sandbox;
  return sandbox;
}

module.exports = { makeEl, makeDocument, makeFirebaseStubs, makeSandbox };
