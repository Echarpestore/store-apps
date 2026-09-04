const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const rd=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const timelineSrc=rd('pos/cctv-timeline.js'),configSrc=rd('cctv-config.js'),pos=rd('pos/cctv-invoice.js'),sale=rd('pos/pos-sale.js'),office=rd('Office/cctv.js'),pidx=rd('pos/index.html'),oidx=rd('Office/index.html'),rules=rd('security/firestore-phase2.rules'),agent=rd('branch-tools/glow/cctv-gateway/GLOW-CCTV-AGENT.ps1'),installer=rd('cctv-gateway/INSTALL-CCTV-v506.ps1');

const mem={};let writes=[];
const localStorage={getItem:k=>Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]}};
const window={addEventListener(){}};
const db={collection:name=>({doc:id=>({set:(doc,opt)=>{writes.push({name,id,doc,opt});return Promise.resolve();}})})};
const ctx={window,localStorage,db,Date,JSON,Promise,console,setTimeout(){return 1},clearTimeout(){}};
vm.createContext(ctx);vm.runInContext(timelineSrc,ctx);

assert.strictEqual(writes.length,0,'loading timeline must not write Firestore');
window.cctvBasketTimelineObserve({sid:'s1',branch:'Glow',firstItemAt:1000,atMs:1100,cart:[{id:'a',name:'طرحة',barcode:'10',qty:1,price:100}]});
window.cctvBasketTimelineObserve({sid:'s1',branch:'Glow',atMs:1200,cart:[{id:'a',name:'طرحة',barcode:'10',qty:2,price:100}]});
window.cctvBasketTimelineObserve({sid:'s1',branch:'Glow',atMs:1250,cart:[{id:'a',name:'طرحة',barcode:'10',qty:2,price:100}]});
assert.strictEqual(writes.length,0,'cart scans stay local; no Firestore write per change');

(async()=>{
  const ok=await window.cctvFinalizeBasketTimeline({sid:'s1',invoiceCode:'INV-1',invoiceNo:'1',branch:'Glow',atMs:1300,total:200});
  assert.strictEqual(ok,true,'timeline finalizes');
  assert.strictEqual(writes.length,1,'exactly one Firestore write per finalized invoice');
  const w=writes[0];assert.strictEqual(w.name,'pos_cctv_invoice_timelines');assert.strictEqual(w.id,'INV-1');assert.strictEqual(w.opt.merge,true,'idempotent merge on invoice code');
  assert.strictEqual(w.doc.events.length,3,'two unique cart states plus sale_saved');
  assert.strictEqual(w.doc.events[1].kind,'qty_increased');
  assert.strictEqual(w.doc.clipStartAtMs,1,'five-second pre-roll is safely clamped');
  assert.strictEqual(w.doc.clipEndAtMs,11300,'ten-second post-roll is stored');
  assert.ok(w.doc.catalog['a#1'],'catalog deduplicates product text');

  const cfgCtx={window:{ECHARPE_CCTV_CONFIG:[{id:'client-branch',name:'Client',aliases:['shop'],gateway:'https://cctv.client.test',localEvidence:true,playback:true,cashierCamera:'9',cameras:[{id:'9',name:'Till',stream:'till9'}]}]},localStorage:{getItem(){return null},setItem(){}}};
  vm.createContext(cfgCtx);vm.runInContext(configSrc,cfgCtx);
  const custom=cfgCtx.window.echarpeCctvProfile('shop');assert.strictEqual(custom.id,'client-branch','sold installations can inject profiles without editing consumers');assert.strictEqual(custom.cashierCamera,'9');

  assert(pidx.indexOf('../cctv-config.js?v=506')<pidx.indexOf('cctv-invoice.js?v=506'),'POS config loads before CCTV');
  assert(pidx.indexOf('cctv-timeline.js?v=506')<pidx.indexOf('pos-sale.js'),'timeline hook loads before sale logic');
  assert(oidx.indexOf('../cctv-config.js?v=506')<oidx.indexOf('cctv.js?v=506'),'Office config loads before CCTV');
  assert(sale.includes('cartSid:(typeof _cartSid')&&sale.includes('_cartSid = d.cartSid ||'),'refresh/reopen preserves basket sid');
  assert(sale.includes('cctvBasketTimelineObserve')&&pos.includes('cctvFinalizeBasketTimeline(meta)'),'POS observes locally and finalizes through CCTV hook');
  assert(rules.includes('match /pos_cctv_invoice_timelines/{invoiceCode}')&&rules.includes('allow read, create, update: if isStaff();'),'timeline is staff-only');
  assert(office.includes("collection('pos_cctv_invoice_timelines')"),'Office reads one timeline doc on invoice open');
  assert(office.includes('🎬 الكاميرا + السلة')&&office.includes("video.addEventListener('timeupdate',renderAt)"),'Office synchronizes basket to video seek/time');
  const helperMatch=office.match(/window\.ofCctvTimelineStateAt=function\([\s\S]*?\n\};/);assert(helperMatch,'pure timeline seek helper exists');
  const seekCtx={window:{}};vm.createContext(seekCtx);vm.runInContext(helperMatch[0],seekCtx);const ev=[{atMs:1100,kind:'first'},{atMs:1250,kind:'second'}];
  assert.strictEqual(seekCtx.window.ofCctvTimelineStateAt(ev,1000,.20).event.kind,'first','playback selects state at exact video time');
  assert.strictEqual(seekCtx.window.ofCctvTimelineStateAt(ev,1000,.30).event.kind,'second','forward seek advances basket state');
  assert.strictEqual(seekCtx.window.ofCctvTimelineStateAt(ev,1000,.15).event.kind,'first','backward seek restores older basket state');
  assert(office.includes('timeline.clipStartAtMs')&&office.includes('duration=Math.max(30,Math.min(1800'),'full sale window drives video duration');
  assert(pos.includes('nvrOffsetMs')&&office.includes("u+='&offsetMs='"),'invoice carries measured NVR offset into playback');
  assert(agent.includes('/ISAPI/System/time')&&agent.includes("source='nvr_isapi'")&&agent.includes('$startMs+=$offset'),'agent measures and applies NVR clock delta');
  assert(agent.includes('if($durationSec -gt 1800)'),'agent supports long baskets up to 30 minutes');
  assert(installer.includes('[Parameter(Mandatory=$true)][string]$BranchId')&&installer.includes('CameraJson'),'universal installer is branch/camera driven');
  assert(!installer.includes('passwordDpapi=\'')&&!configSrc.includes('passwordDpapi'),'no credential embedded in web/config/installer');
  console.log('CCTV basket sync v506: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
