'use strict';
// v754: one sync offset per branch+camera, shared through Firestore, one-tap calibration.
const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../Office/cctv.js'),'utf8');
const head=src.slice(0,src.indexOf('/* ECHARPE Office CCTV'));
// Self-contained asserts so run-async.js really fails on a broken check.
let n=0;
const assert=(c,m)=>{if(!c)throw new Error('❌ '+m);n++;};
const assertEq=(a,b,m)=>{if(a!==b)throw new Error('❌ '+m+' (got '+JSON.stringify(a)+', expected '+JSON.stringify(b)+')');n++;};

function makeDb(initial){
  const docs=new Map(Object.entries(initial||{}));const writes=[];
  return {writes,docs,collection(c){return{doc(id){const k=c+'/'+id;return{
    get(){return Promise.resolve({exists:docs.has(k),data:()=>docs.get(k)});},
    set(v,o){writes.push({k,v,o});docs.set(k,Object.assign({},o&&o.merge?docs.get(k)||{}:{},v));return Promise.resolve();}
  };}};}};
}
function makeCtx(db){
  const data=new Map();
  const ctx={window:{},db,localStorage:{getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v))},console};
  vm.createContext(ctx);vm.runInContext(head,ctx);return {ctx,data};
}

(async()=>{
  // --- per camera isolation + legacy fallback ---
  let {ctx,data}=makeCtx(makeDb());let w=ctx.window;
  data.set('echarpe.cctv.madinaty.basketOffsetMs.v746','1200');
  assertEq(w.ofCctvReadBasketOffset('madinaty','4'),1200,'camera without own value falls back to old branch value');
  w.ofCctvSaveBasketOffset('madinaty',800,'4');
  assertEq(w.ofCctvReadBasketOffset('madinaty','4'),800,'camera 4 keeps its own value');
  assertEq(w.ofCctvReadBasketOffset('madinaty','8'),1200,'camera 8 not changed by camera 4');
  assertEq(w.ofCctvReadBasketOffset('rehab','4'),0,'other branch not changed');
  assertEq(w.ofCctvReadBasketOffset('madinaty'),1200,'old one-argument call still works');
  assertEq(w.ofCctvSaveBasketOffset('madinaty',99999,'4'),15000,'limit kept');

  // --- shared across devices (Firestore) ---
  const db=makeDb();({ctx}=makeCtx(db));w=ctx.window;
  w.ofCctvSaveBasketOffset('madinaty',1300,'4');
  await new Promise(r=>setTimeout(r,0));
  assertEq(db.writes.length,1,'saving with a camera writes to Firestore');
  assertEq(db.writes[0].k,'pos_test_settings/cctv_sync_madinaty','written to the branch sync document');
  assertEq(db.writes[0].v.cam4,1300,'camera field written');
  assert(db.writes[0].o&&db.writes[0].o.merge===true,'merge write keeps other cameras');
  // a second device (empty localStorage) reads it
  const dev2=makeCtx(db);const w2=dev2.ctx.window;
  assertEq(w2.ofCctvReadBasketOffset('madinaty','4'),0,'second device before loading has nothing');
  const ok=await w2.ofCctvLoadSharedSync('madinaty');
  assert(ok===true,'shared load succeeds');
  assertEq(w2.ofCctvReadBasketOffset('madinaty','4'),1300,'second device gets the same calibration');
  // shared value wins over a stale local one
  dev2.data.set('echarpe.cctv.madinaty.cam4.offsetMs.v754','500');
  assertEq(w2.ofCctvReadBasketOffset('madinaty','4'),1300,'shared value beats stale local value');
  // junk in Firestore cannot poison
  const bad=makeDb({'pos_test_settings/cctv_sync_glow':{cam1:'x',cam2:99999,cam3:-200,evil:5}});
  const d3=makeCtx(bad);await d3.ctx.window.ofCctvLoadSharedSync('glow');
  assertEq(d3.ctx.window.ofCctvReadBasketOffset('glow','1'),0,'invalid shared value ignored');
  assertEq(d3.ctx.window.ofCctvReadBasketOffset('glow','2'),0,'out of range shared value ignored');
  assertEq(d3.ctx.window.ofCctvReadBasketOffset('glow','3'),-200,'valid shared value used');
  // no db / failing db never breaks playback
  const noDb=makeCtx(undefined);assert((await noDb.ctx.window.ofCctvLoadSharedSync('madinaty'))===false,'no db resolves false');
  const failDb={collection(){return{doc(){return{get(){return Promise.reject(new Error('offline'));},set(){return Promise.reject(new Error('offline'));}};}};}};
  const f=makeCtx(failDb);assert((await f.ctx.window.ofCctvLoadSharedSync('madinaty'))===false,'offline resolves false');
  assertEq(f.ctx.window.ofCctvSaveBasketOffset('madinaty',700,'4'),700,'offline save still works for the session');

  // --- one-tap calibration math ---
  w=makeCtx(makeDb()).ctx.window;
  const ev=[{atMs:10000,kind:'payment'},{atMs:12000,kind:'item_added'},{atMs:19000,kind:'qty_increased'},{atMs:50000,kind:'item_added'}];
  assertEq(w.ofCctvNearestBasketEvent(ev,12400,20000).atMs,12000,'nearest scan event chosen');
  assertEq(w.ofCctvNearestBasketEvent(ev,10100,20000).atMs,12000,'payment is not a scan moment');
  assertEq(w.ofCctvNearestBasketEvent(ev,90000,20000),null,'nothing within 20 s -> no calibration');
  assertEq(w.ofCctvOffsetForEvent({atMs:12000},10700),1300,'video frame at 10.7 s shows the 12.0 s scan -> +1.3 s');
  assertEq(w.ofCctvOffsetForEvent({atMs:12000},40000),-15000,'offset clamped');

  // --- real invoice player, one tap ---
  const {JSDOM}=require('jsdom');
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://echarpe.store/Office/'}),dw=dom.window;
  dw.HTMLMediaElement.prototype.load=function(){};dw.HTMLMediaElement.prototype.play=function(){return Promise.resolve()};dw.HTMLMediaElement.prototype.pause=function(){};
  const pdb=makeDb();
  const browser={window:dw,document:dw.document,localStorage:dw.localStorage,db:pdb,profile:{id:'madinaty',cashierCamera:'4'},d:{videoAtMs:1000,clockSource:'pos_pc',cameraId:'4'},
    timeline:{clockSource:'pos_pc',clipStartAtMs:1000,clipEndAtMs:31000,events:[{atMs:6000,kind:'item_added',cart:[['a',1,20,0]],total:20}],catalog:{a:{name:'Item'}}},
    timelineFallback:false,esc:x=>String(x),videoUrl:()=>'/test-video',closeOverlay:el=>el.remove(),setTimeout,clearTimeout,console};
  vm.createContext(browser);vm.runInContext(head,browser);
  vm.runInContext(src.slice(src.indexOf('window.ofCctvTimelineStateAt='),src.indexOf('window.ofCctvInvoiceShot = async',src.indexOf('window.ofCctvTimelineStateAt='))),browser);
  dw.ofCctvCartRows=x=>x;
  const ps=src.indexOf('    function openPlayer(sync){');vm.runInContext(src.slice(ps,src.indexOf('    var vbtn=',ps)),browser);
  browser.openPlayer(true);
  const video=dw.document.getElementById('ofSync506Video');
  // The owner pauses where the cashier scans: 3.5 s into the clip = wall 4500 ms, but the basket event is at 6000 ms.
  Object.defineProperty(video,'currentTime',{value:3.5,writable:true,configurable:true});
  dw.document.getElementById('ofSync506Tap').click();
  assertEq(dw.ofCctvReadBasketOffset('madinaty','4'),1500,'one tap computes +1.5 s for camera 4');
  video.dispatchEvent(new dw.Event('timeupdate'));
  assertEq(dw.document.getElementById('ofSync506Total').textContent,'20.00 ج.م','after one tap the scanned item shows at that exact frame');
  await new Promise(r=>setTimeout(r,0));
  assertEq(pdb.docs.get('pos_test_settings/cctv_sync_madinaty').cam4,1500,'one tap is shared to every device');
  // NEGATIVE: a frame 0.1 s earlier must NOT show the item yet (proves the sign is right).
  video.currentTime=3.4;video.dispatchEvent(new dw.Event('timeupdate'));
  assertEq(dw.document.getElementById('ofSync506Total').textContent,'0.00 ج.م','0.1 s before the scan the basket is still empty');
  assert(src.includes('data-sync-tap'),'day viewer has the one-tap button');
  dw.close();
  console.log('✅ cctv sync v754: '+n+' checks passed');
})().catch(e=>{console.error(e.message||e);process.exitCode=1;});
