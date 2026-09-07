'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ctx={window:{},localStorage:{removeItem(){}},document:{getElementById(){return null;}},renderCameras(){}};
vm.createContext(ctx);
vm.runInContext(read('cctv-config.js'),ctx);
const profile=ctx.window.echarpeCctvProfile('echarpe El Rehab');
assert.equal(profile.cameras.length,8);
assert.equal(new Set(profile.cameras.map(c=>c.stream)).size,8);
assert.equal(profile.cashierCamera,'1');assert.equal(profile.playback,true);
assert.equal(profile.localEvidence,false);
const ui=read('Office/cctv.js');
vm.runInContext(ui.slice(0,ui.indexOf('  function renderLayouts()'))+
 'window.test549={state:state,branches:BRANCHES,recorded:recordedCameras,url:playbackUrl,all:setAllCameras,count:activeCameraCount};})();',ctx);
const t=ctx.window.test549;
for(const [branch,count] of [['rehab',8],['madinaty',4],['glow',4]]){
 t.state.branch=branch;t.all(true);assert.equal(t.count(),count);
 t.all(false);assert.equal(t.count(),0);
}
t.state.branch='rehab';
assert.equal(t.recorded(t.branches.find(b=>b.id==='rehab')).length,1);
assert(t.url(100000,1,'8').includes('camera=1&'));
assert(t.url(100000,1,'1').includes('atMs=100000'));
t.state.branch='glow';assert(t.url(100000,1,'4').includes('camera=4&'));
t.state.branch='madinaty';assert(t.url(100000,1,'7').includes('camera=7&'));
assert(ui.includes("d.clockSource='pos_pc';d.cameraId='1'"));
assert(ui.includes('السلة النهائية للفاتورة؛ توقيت الحركات التفصيلي غير متاح'));
const installer=read('branch-tools/rehab/live-v549/ADD-REHAB-LIVE-v549.ps1');
assert(installer.includes('foreach($n in 2..8)'));
assert(!/Stop-Process|Register-ScheduledTask|Stop-ScheduledTask/.test(installer));
assert(installer.includes('$proc.WaitForExit(30000)'));
assert(installer.includes('CASHIER_RECORDER_NOT_HEALTHY_NO_CHANGES'));
assert(installer.includes('EXISTING_CHANNEL_CONFIG_NO_CHANGES'));
assert(installer.includes('Copy-Item -LiteralPath $cfg -Destination $backup'));
assert(!installer.includes('stream=1\''));
for(const app of ['Office','pos']){
 assert(read(app+'/index.html').includes('cctv-config.js?v=549'));
 assert(read(app+'/sw.js').includes('v549'));
}
assert(read('Office/index.html').includes('cctv.js?v=549'));
console.log('Rehab v549: profile, eight toggles, cashier-only replay, branch isolation, installer safeguards and cache checks PASS');
