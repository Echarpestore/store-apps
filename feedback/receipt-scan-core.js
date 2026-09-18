/* ECHARPE SmartScan v684: local image-quality analysis only. No OCR/payment approval on device. */
export function inspectFrame(imageData, previous=null){
  const {data,width:w,height:h}=imageData;
  if(!data||w<80||h<60)return {ready:false,stable:false,reason:'جاري تشغيل الكاميرا',score:0,sample:null};
  const luma=(x,y)=>{const p=(y*w+x)*4;return (data[p]*77+data[p+1]*150+data[p+2]*29)>>8;};
  let count=0,sum=0,squared=0,grad=0,edges=0,blown=0,changed=0;
  const sample=[];
  const left=Math.floor(w*.08),right=Math.floor(w*.92),top=Math.floor(h*.07),bottom=Math.floor(h*.93);
  // Subsample central document region. 240x180 canvas: ~7k comparisons, no network requests.
  for(let y=top+2;y<bottom;y+=2){
    for(let x=left+2;x<right;x+=2){
      const g=luma(x,y),dx=Math.abs(g-luma(x-2,y)),dy=Math.abs(g-luma(x,y-2)),edge=dx+dy;
      sum+=g;squared+=g*g;grad+=edge;if(edge>35)edges++;if(g>251)blown++;count++;
      if(((x-left)%8)<2&&((y-top)%8)<2){
        const index=sample.length;sample.push(g);
        if(previous&&previous.length>index)changed+=Math.abs(g-previous[index]);
      }
    }
  }
  const avg=sum/count,contrast=Math.sqrt(Math.max(0,squared/count-avg*avg));
  const edgeRatio=edges/count,gradient=grad/count,blowRatio=blown/count;
  const delta=previous&&previous.length===sample.length?changed/sample.length:Infinity;
  const stable=delta<19;
  const readable=avg>48&&avg<243&&contrast>24&&gradient>12&&edgeRatio>.055&&blowRatio<.84;
  let reason='ثبّتي الموبايل داخل الإطار';
  if(avg<=48)reason='زوّدي إضاءة شاشة الموبايل';
  else if(avg>=243||blowRatio>=.84)reason='قلّلي الانعكاس أو سطوع الشاشة';
  else if(contrast<=24||gradient<=12||edgeRatio<=.055)reason='قرّبي الإيصال بهدوء وخلي الكتابة أوضح';
  else if(!stable)reason='تمام، ثبّتي الموبايل لحظة';
  else reason='الصورة واضحة وثابتة · بنلتقط تلقائيًا';
  return {ready:readable&&stable,stable,reason,score:gradient+contrast*.22+edgeRatio*40,avg,contrast,edgeRatio,delta,sample};
}
export function captureReady(metrics,consecutive,elapsedMs){
  return !!metrics?.ready&&consecutive>=3&&elapsedMs>=650;
}
