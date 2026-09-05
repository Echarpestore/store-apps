/* ECHARPE CCTV branch profiles v510.
   One shared, credential-free registry for POS and Office. Installations can
   replace/extend profiles at runtime with localStorage key
   `echarpe.cctv.profiles.v506` or by defining window.ECHARPE_CCTV_CONFIG
   before this file loads. No camera/NVR password belongs in web code. */
(function(){
  'use strict';
  var KEY='echarpe.cctv.profiles.v506';
  var DEFAULTS=[
    {id:'madinaty',name:'مدينتي',aliases:['madinaty','مدينتي'],gateway:'https://cctv-madinaty.echarpe.store',localAgent:'http://127.0.0.1:1985',localEvidence:false,playback:true,cashierCamera:'4',cameras:[
      {id:'4',name:'D04',label:'الكاشير',stream:'camera4'},
      {id:'5',name:'D05',label:'كاميرا 5',stream:'camera5'},
      {id:'7',name:'D07',label:'كاميرا 7',stream:'camera7'},
      {id:'8',name:'D08',label:'كاميرا 8',stream:'camera8'}
    ]},
    {id:'glow',name:'Glow',aliases:['glow'],gateway:'https://cctv-glow.echarpe.store',localAgent:'http://127.0.0.1:1985',localEvidence:true,playback:true,cashierCamera:'1',cameras:[
      {id:'1',name:'CAM1',label:'الكاشير',stream:'glow_cam1_h264'},
      {id:'2',name:'CAM2',label:'كاميرا 2',stream:'glow_cam2_h264'},
      {id:'3',name:'CAM3',label:'كاميرا 3',stream:'glow_cam3_h264'},
      {id:'4',name:'CAM4',label:'كاميرا 4',stream:'glow_cam4_h264'}
    ]},
    {id:'rehab',name:'الرحاب',aliases:['rehab','الرحاب'],gateway:'https://cctv-rehab.echarpe.store',localAgent:'http://127.0.0.1:1985',localEvidence:false,playback:false,cashierCamera:'1',cameras:[
      {id:'1',name:'CAM1',label:'الكاشير',stream:'rehab_cam1_h264'}
    ]}
  ];
  function norm(v){return String(v==null?'':v).trim().toLowerCase();}
  function cleanCamera(c,i){c=c||{};var id=String(c.id==null?(i+1):c.id);return {id:id,name:String(c.name||('CAM'+id)),label:String(c.label||''),stream:String(c.stream||('camera'+id))};}
  function cleanProfile(p){
    p=p||{};var id=norm(p.id||p.name);if(!id)return null;
    var cams=(Array.isArray(p.cameras)?p.cameras:[]).map(cleanCamera);if(!cams.length)cams=[cleanCamera({id:'1'},0)];
    var cashier=String(p.cashierCamera||p.playbackCamera||cams[0].id);
    if(!cams.some(function(c){return c.id===cashier;}))cashier=cams[0].id;
    var aliases=(Array.isArray(p.aliases)?p.aliases:(Array.isArray(p.liveAliases)?p.liveAliases:[])).map(String);
    aliases.push(id,String(p.name||id));
    return {id:id,name:String(p.name||id),aliases:aliases,gateway:String(p.gateway||'').replace(/\/$/,''),localAgent:String(p.localAgent||'http://127.0.0.1:1985').replace(/\/$/,''),localEvidence:!!p.localEvidence,playback:id==='madinaty'?true:!!p.playback,cashierCamera:cashier,playbackCamera:cashier,cameras:cams};
  }
  function configured(){
    var src=null;
    try{src=window.ECHARPE_CCTV_CONFIG;}catch(e){}
    if(!Array.isArray(src)){try{var raw=localStorage.getItem(KEY);if(raw)src=JSON.parse(raw);}catch(e){}}
    if(!Array.isArray(src)||!src.length)src=DEFAULTS;
    return src.map(cleanProfile).filter(Boolean);
  }
  var profiles=configured();
  function find(branch){
    var n=norm(branch);if(!n)return null;
    return profiles.find(function(p){return p.id===n||p.aliases.some(function(a){var q=norm(a);return q&&(n===q||n.indexOf(q)>=0);});})||null;
  }
  function setProfiles(next){
    if(!Array.isArray(next)||!next.length)throw new Error('cctv_profiles_required');
    var cleaned=next.map(cleanProfile).filter(Boolean);if(!cleaned.length)throw new Error('cctv_profiles_invalid');
    localStorage.setItem(KEY,JSON.stringify(cleaned));profiles=cleaned;return profiles.slice();
  }
  window.echarpeCctvProfiles=function(){return profiles.slice();};
  window.echarpeCctvProfile=find;
  window.echarpeCctvSetProfiles=setProfiles;
  window.echarpeCctvProfileStorageKey=KEY;
})();
