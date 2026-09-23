/* Shared, dependency-free camera geometry and quality checks. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.InstaScanCore=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  function cropRect(w,h,boxW,boxH,inset){
    if(!(w>0&&h>0&&boxW>0&&boxH>0))return null;
    // The preview uses object-fit:cover and object-position:center.
    const scale=Math.max(boxW/w,boxH/h), visibleW=boxW/scale,visibleH=boxH/scale;
    const x=(w-visibleW)/2+visibleW*inset,y=(h-visibleH)/2+visibleH*inset;
    return {sx:Math.round(x),sy:Math.round(y),sw:Math.round(visibleW*(1-2*inset)),sh:Math.round(visibleH*(1-2*inset))};
  }
  function quality(gray,w,h){
    if(!gray||!gray.length)return {contrast:0,edges:0};
    let mean=0,variance=0,edges=0,n=0;
    for(const p of gray)mean+=p;mean/=gray.length;
    for(let y=1;y<h;y++)for(let x=1;x<w;x++){
      const i=y*w+x;variance+=(gray[i]-mean)**2;
      edges+=Math.abs(gray[i]-gray[i-1])+Math.abs(gray[i]-gray[i-w]);n++;
    }
    return {contrast:Math.sqrt(variance/Math.max(1,n)),edges:edges/Math.max(1,2*n)};
  }
  function hasReading(checks,detail){
    return !!(checks&&(checks.amount||checks.reference||checks.time||checks.beneficiary))
      || !!(detail&&(detail.ref||(detail.seenCents&&detail.seenCents.length)));
  }
  return {cropRect,quality,hasReading};
});
