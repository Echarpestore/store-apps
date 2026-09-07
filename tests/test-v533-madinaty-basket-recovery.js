'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),rd=p=>fs.readFileSync(path.join(root,p),'utf8');
const office=rd('Office/cctv.js'),html=rd('Office/index.html'),sw=rd('Office/sw.js');

assert(office.startsWith('/* ECHARPE Office CCTV v533'),'Office CCTV is v533');
const officeSwVersion=Number((sw.match(/echarpe-office-v(\d+)/)||[])[1]||0);
assert(Number((html.match(/cctv\.js\?v=(\d+)/)||[])[1])>=533&&officeSwVersion>=533,'Office browser and service-worker caches are busted');

const helperStart=office.indexOf('  function timelineFromSale(sale){');
const helperEnd=office.indexOf('  function branchMatches(',helperStart);
assert(helperStart>=0&&helperEnd>helperStart,'sale fallback timeline helper exists');
const ctx={result:null,isFinite};vm.createContext(ctx);
vm.runInContext(office.slice(helperStart,helperEnd)+'\nresult=timelineFromSale({id:"sale-1",invoiceCode:"FTMAD129",invoiceNo:129,branch:"echarpe Madinaty",firstItemAt:100000,createdAtMs:160000,total:350,items:[{id:"p1",name:"طرحة",barcode:"832",qty:1,price:350}]});',ctx);
assert(ctx.result&&ctx.result.synthetic===true,'missing POS timeline is reconstructed from the saved sale');
assert.strictEqual(ctx.result.clipStartAtMs,95000,'fallback clip keeps five seconds before the first item');
assert.strictEqual(ctx.result.clipEndAtMs,170000,'fallback clip keeps ten seconds after save');
assert.strictEqual(ctx.result.events[0].kind,'invoice_cart','fallback exposes the invoice basket');
assert.strictEqual(ctx.result.events[0].cart[0][0],'p1#1','fallback uses Office-compatible compact cart rows');

const authoritative=office.slice(office.indexOf('/* v506: authoritative invoice viewer.'));
assert(authoritative.includes("collection('pos_test_sales').where('invoiceCode','==',String(invoiceCode)).limit(1)"),'invoice review falls back to the authoritative saved sale');
assert(authoritative.includes("clockSource:(saleProfile&&(saleProfile.id==='madinaty'||saleProfile.id==='rehab'))?'pos_pc':''"),'Madinaty and Rehab fallback remain on the POS-PC recording clock');
assert(authoritative.includes("cameraId:saleProfile&&saleProfile.playbackCamera||'1'"),'Madinaty fallback uses the configured cashier camera');
assert(authoritative.includes('invoiceProfile.id!==timelineProfile.id'),'a timeline from another branch can never be shown over a Madinaty recording');
assert(!authoritative.includes("if(!snap||!snap.exists){alert('مفيش لقطات محفوظة للفاتورة دي.');return;}"),'missing JPEG snapshots no longer block video plus basket review');
assert(authoritative.includes('timelineFallback=!!(timeline&&timeline.synthetic)')&&authoritative.includes('🎬 الكاميرا + السلة'),'recovered invoices expose the synchronized review action');

assert(office.includes('(dayReviewRows||[]).forEach(function(sale)')&&office.includes('timelineFromSale(sale)'),'full-day review also recovers baskets from saved sales');
assert(office.includes('branchMatches(d.branch,x.id,aliases)'),'day timelines are restricted to the selected branch profile');
assert(office.includes("{id:'4',name:'D04',label:'الكاشير',stream:'camera4',liveStream:'camera4_live'}"),'fast Madinaty live mapping is untouched');
assert(office.includes("playbackCamera:'4'"),'Madinaty playback remains camera 4');

console.log('Madinaty basket + camera recovery v533: PASS');
