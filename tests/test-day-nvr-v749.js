'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),{JSDOM}=require('jsdom');
const s=fs.readFileSync(__dirname+'/../Office/cctv.js','utf8');
const source=s.slice(s.indexOf('  async function openDayBasketPlayback(){'),s.indexOf('  function renderDayRows(rows){'));
let checks=0;function eq(a,b){assert.deepStrictEqual(a,b);checks++;}
async function scenario(options={}){
 const start=new Date(2026,8,26).getTime(),end=new Date(2026,8,27).getTime();
 const dom=new JSDOM('<input id="ofCctvDayDate"><input id="ofCctvDayTime">',{url:'https://echarpe.store/Office/'}),w=dom.window;
 w.document.getElementById('ofCctvDayTime').value=options.time===undefined?'20:00':options.time;
 w.HTMLMediaElement.prototype.load=function(){};w.HTMLMediaElement.prototype.play=function(){return Promise.resolve()};w.HTMLMediaElement.prototype.pause=function(){};
 const branch=options.branch||'madinaty',cam=options.cam||'4',alerts=[],busy=[];
 const timeline={invoiceCode:'test',branch,endedAtMs:start+10*3600000,catalog:{a:{name:'item'}},events:[{atMs:start+9*3600000,kind:'item_added',cart:[['a',1,20,0]],total:20}]};
 const query={where(){return this},get:async()=>({forEach:fn=>{if(!options.empty)fn({data:()=>timeline})}})};
 const ctx={window:w,document:w.document,dayReviewBounds:{start,end},dayReviewRows:[],dayBounds:()=>({start,end}),db:{collection:()=>query},b:()=>({id:branch,name:branch,liveAliases:[],playbackCamera:cam}),agentGateway:()=> 'https://camera.invalid',setCctvBusy:(v)=>busy.push(v),resolveCashierCamera:async()=>({camera:cam}),fetchJsonRetry:async url=>{
 if(cam!=='8'&&url.includes('camera=8'))return {ok:true,camera:'8',startMs:start,endMs:end,segmentCount:2};
 if(options.error)throw Error(options.error);
 if('range' in options)return options.range;
 return {ok:true,camera:cam,startMs:end+86400000,endMs:end+172800000};
 },alert:m=>alerts.push(m),branchMatches:()=>true,timelineFromSale:()=>null,esc:x=>String(x),cartRows:x=>x,closePlaybackModal:()=>{},armPlaybackBackGuard:()=>{},closePlaybackModalByUser:()=>{},console,setTimeout,clearTimeout};
 w.ofCctvReadBasketOffset=()=>0;w.ofCctvSaveBasketOffset=(b,v)=>v;
 vm.createContext(ctx);vm.runInContext(source,ctx);await ctx.openDayBasketPlayback();
 const video=w.document.querySelector('[data-day-master]');
 return {start,end,alerts,busy,w,dom,video,url:video?new URL(video.src):null};
}
(async function(){
 let r=await scenario();eq(Number(r.url.searchParams.get('atMs')),r.start+20*3600000);eq(r.url.searchParams.get('durationSec'),'30');eq(r.w.document.querySelector('[data-day-slave]'),null);r.w.close();
 for(const options of [{error:'Failed to fetch'},{range:{ok:false,camera:'4'}},{range:null}]){r=await scenario(options);eq(!!r.video,true);eq(r.alerts.length,0);eq(Number(r.url.searchParams.get('atMs')),r.start+20*3600000);r.w.close();}
 for(const options of [{error:'cctv_http_403'},{error:'cctv_http_401'},{range:{ok:true,camera:'8'}}]){r=await scenario(options);eq(r.video,null);eq(r.alerts.length,1);eq(r.busy.at(-1),false);r.w.close();}
 for(const options of [{branch:'glow',error:'Failed to fetch'},{branch:'rehab',range:{ok:false}},{cam:'8',range:{ok:false}}]){r=await scenario(options);eq(r.video,null);eq(r.busy.at(-1),false);r.w.close();}
 r=await scenario({time:''});eq(Number(r.url.searchParams.get('atMs')),r.start+9*3600000-5000);r.w.close();
 r=await scenario({time:'00:00'});eq(Number(r.url.searchParams.get('atMs')),r.start);r.w.close();
 r=await scenario({empty:true});eq(Number(r.url.searchParams.get('atMs')),r.start+20*3600000);r.w.close();
 const start=new Date(2026,8,26).getTime(),end=new Date(2026,8,27).getTime();
 r=await scenario({range:{ok:true,camera:'4',startMs:start,endMs:end}});eq(r.url.searchParams.get('durationSec'),'60');eq(!!r.w.document.querySelector('[data-day-slave]'),true);r.w.close();
 console.log('v749 behavioral checks: '+checks+' passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
