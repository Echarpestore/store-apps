/* ECHARPE Customer Display — dedicated anonymous Firebase app, isolated from Feedback. */
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
const app=window.fbApp,auth=window.fbAuth;
if(!app||!auth)throw new Error('Feedback Firebase app not initialized');
const functions=getFunctions(app,'us-central1');
const call=async (name,data={})=>(await httpsCallable(functions,name)(data)).data;
const style=document.createElement('style');style.textContent=`
#finOverlay{position:fixed;inset:0;z-index:99999;display:none;overflow:auto;align-items:center;justify-content:center;padding:16px;background:#f7f5f0;color:#292520;font-family:Cairo,Arial,sans-serif;direction:rtl;animation:finAppear .3s ease}
#finOverlay.visible{display:flex}#finOverlay *{box-sizing:border-box}
#finOverlay .finCard{width:min(540px,100%);max-height:96vh;overflow:auto;text-align:center;background:white;border:1px solid #e9e5dd;border-radius:28px;box-shadow:0 18px 55px #29252016;padding:clamp(16px,4vw,35px)}
#finOverlay .finBrand{letter-spacing:.38em;font:700 15px 'Space Grotesk',sans-serif;color:#4a4038;margin-bottom:18px}
#finOverlay .finAmount{font:700 clamp(42px,8vw,72px) 'Space Grotesk',Arial,sans-serif;direction:ltr;unicode-bidi:isolate;margin:5px 0}
#finOverlay .finSub{font-size:14px;color:#827970;margin:10px 0 24px}
#finOverlay .finPaymentQr{display:block;width:min(260px,63vw);height:auto;aspect-ratio:1;margin:8px auto 10px;object-fit:contain;image-rendering:auto;border:8px solid #fff;border-radius:12px}
#finOverlay .finBadge{display:inline-flex;align-items:center;justify-content:center;border-radius:99px;background:#f0f7f2;color:#187847;padding:7px 14px;font-weight:800;font-size:12px}
#finOverlay .finDots{font-size:30px;letter-spacing:10px;direction:ltr;min-height:49px;margin:8px auto}
#finOverlay .finPad{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;max-width:350px;margin:0 auto 16px;direction:ltr}
#finOverlay button{cursor:pointer;font-family:Cairo,Arial,sans-serif;font-weight:800;touch-action:manipulation}
#finOverlay .finPad button{background:#faf9f6;color:#2b2621;border:1px solid #e8e3dc;border-radius:15px;min-height:60px;font:700 26px 'Space Grotesk',Arial,sans-serif;transition:transform .15s,background .15s}
#finOverlay .finPad button:active{transform:scale(.94);background:#eae6de}
#finOverlay .finPrimary{width:100%;min-height:56px;background:#242b27;color:white;border:0;border-radius:16px;font-size:16px;transition:transform .2s}
#finOverlay .finPrimary:disabled{opacity:.4;cursor:not-allowed}
#finOverlay .finErr{color:#ba3030;font-size:13px;min-height:24px;margin:8px 0}
#finOverlay video{display:block;width:100%;max-height:52vh;object-fit:contain;border-radius:18px;background:#181818}
#finOverlay .finCameraFrame{position:relative;border-radius:18px;overflow:hidden;margin:15px 0}
#finOverlay .finCameraFrame::after{content:'';position:absolute;inset:9%;border:3px solid #65c895;border-radius:12px;pointer-events:none;box-shadow:0 0 0 150px #0001}
@keyframes finAppear{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion:reduce){#finOverlay,*{animation:none!important;transition:none!important}}

/* ECHARPE payment experience — graceful motion, readable QR, accessibility. */
#finOverlay{background:radial-gradient(circle at 12% 8%,#e5ede6 0,transparent 42%),linear-gradient(155deg,#f9f8f4,#e7eee8);}
#finOverlay.visible{animation:finSoftAppear .28s cubic-bezier(.2,.8,.2,1);}
#finOverlay .finCard{width:min(570px,100%);background:#fffdfa;border:1px solid #dce5dd;
 box-shadow:0 28px 80px #0b2f2426,0 3px 16px #0b2f2410;border-radius:32px;
 padding:clamp(22px,4vw,38px);animation:finCardArrive .34s cubic-bezier(.2,.8,.2,1);}
#finOverlay .finBrand{color:#173b30;font-size:14px;letter-spacing:.35em;padding-bottom:16px;border-bottom:1px solid #e7ede5;}
#finOverlay .finBadge{background:#e9f5ed;color:#175c40;border:1px solid #c8e7d2;letter-spacing:.03em;}
#finOverlay h2{font-size:clamp(22px,4.8vw,31px);color:#173a2d;line-height:1.4;margin:14px 0 8px;font-weight:900;}
#finOverlay .finAmount{color:#173e32;font-size:clamp(44px,10vw,72px);letter-spacing:-.04em;}
#finOverlay #finRecipient{background:#f4f7f2;border:1px solid #e2eae0;border-radius:13px;
 padding:12px 9px;line-height:1.65;overflow-wrap:anywhere;color:#30463d;font-size:13px;}
#finOverlay #finPaymentQrHost:empty{display:none;}
#finOverlay #finPaymentQrHost{background:#fff;border:1px solid #e1e9df;border-radius:22px;margin:14px auto;
 width:fit-content;max-width:100%;padding:10px;box-shadow:0 7px 25px #1535270a;}
#finOverlay .finPaymentQr{width:min(278px,58vw);max-height:min(278px,38vh);border:0;border-radius:5px;margin:0 auto;
 background:white;padding:7px;object-fit:contain;}
#finOverlay .finPrimary{background:linear-gradient(135deg,#173c30,#285a46);border-radius:15px;
 min-height:62px;font-size:16px;box-shadow:0 7px 19px #1a4b352e;transition:transform .19s ease,box-shadow .19s ease,opacity .19s;}
#finOverlay .finPrimary:active{transform:scale(.985);box-shadow:0 2px 7px #1a4b3524;}
#finOverlay .finErr{font-weight:800;line-height:1.55;}
#finOverlay .finCameraFrame{border:2px solid #d8e8dd;}
#finOverlay .finCameraFrame::after{border-color:#74c295;border-width:2px;}
#finOverlay .finSteps{display:flex;align-items:center;justify-content:center;gap:8px;
 color:#587165;font-size:11px;margin:13px 0 6px;}
#finOverlay .finSteps b{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;
 border-radius:50%;background:#e6f0e8;color:#275b41;}
#finOverlay .finSteps .finCurrent b{background:#20553c;color:#fff;box-shadow:0 0 0 4px #d5e9db;}
#finPairBar{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:95;direction:rtl;
 max-width:min(96vw,520px);width:max-content;min-width:min(340px,92vw);padding:13px 17px;
 font:700 12px Cairo,Arial,sans-serif;background:#f8faf5;color:#173d30;
 border:1px solid #cde0d2;border-radius:19px;box-shadow:0 16px 35px #0003;text-align:center;}
#finPairBar[hidden]{display:none!important;}
#finPairBar .finPairCode{display:block;font:800 28px 'Space Grotesk',Arial,sans-serif;letter-spacing:.23em;
 direction:ltr;color:#173d30;margin:6px auto;}
#finPairBar .finPairHint{color:#526b5f;line-height:1.7;}
@keyframes finSoftAppear{from{opacity:0}to{opacity:1}}
@keyframes finCardArrive{from{opacity:.35;transform:translateY(10px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
@media(max-height:760px){#finOverlay .finCard{padding:14px 22px;}#finOverlay .finPaymentQr{max-height:31vh;width:min(222px,50vw)}#finOverlay h2{margin:7px 0}}
@media(prefers-reduced-motion:reduce){#finOverlay.visible,#finOverlay .finCard{animation:none!important;}
 #finOverlay .finPrimary{transition:none!important}}
`;document.head.appendChild(style);
const overlay=document.createElement('div');overlay.id='finOverlay';overlay.setAttribute('aria-live','polite');document.body.appendChild(overlay);
let activeId='',activeKind='',pin='',firstPin='',step=0,busy=false,stream=null,lastStatus='',scanStarted=false;
const card=html=>{overlay.innerHTML='<section class="finCard"><div class="finBrand">E C H A R P E</div>'+html+'</section>';overlay.classList.add('visible');};
const error=m=>{const e=overlay.querySelector('.finErr');if(e)e.textContent=String(m||'حدث خطأ');};
const close=()=>{if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}overlay.classList.remove('visible');overlay.innerHTML='';activeId='';activeKind='';pin='';firstPin='';step=0;scanStarted=false;};
function keypad(){return '<div class="finDots" id="finDots">○ ○ ○ ○ ○ ○</div><div class="finPad">'+[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(n=>'<button type="button" data-digit="'+n+'" '+(n===''?'disabled':'')+'>'+n+'</button>').join('')+'</div><button class="finPrimary" id="finSubmit" disabled>تأكيد</button><p class="finErr"></p>';}
function pinScreen(s){
 activeId=s.sessionId;activeKind=s.kind;pin='';firstPin='';step=0;
 card('<span class="finBadge">'+(s.kind==='pin_setup'?'إعداد الرقم السري':'دفع آمن من الرصيد')+'</span><h2 id="finTitle">'+(s.kind==='pin_setup'?'اعملي رقم سري من 6 أرقام':'أكّدي العملية برقمك السري')+'</h2><div class="finAmount">'+(s.kind==='credit'?Number(s.amount).toFixed(2)+' EGP':'●●●●●●')+'</div><div class="finSub">'+(s.maskedPhone||'')+' — الرقم السري خاص بيكي، الموظفة مش بتشوفه.</div>'+keypad());
 overlay.querySelectorAll('[data-digit]').forEach(b=>b.onclick=()=>{if(b.dataset.digit==='⌫')pin=pin.slice(0,-1);else if(pin.length<6)pin+=b.dataset.digit;overlay.querySelector('#finDots').textContent='● '.repeat(pin.length)+'○ '.repeat(6-pin.length);overlay.querySelector('#finSubmit').disabled=pin.length!==6;error('');});
 overlay.querySelector('#finSubmit').onclick=async()=>{
  if(busy||pin.length!==6)return;
  if(activeKind==='pin_setup'&&step===0){firstPin=pin;pin='';step=1;overlay.querySelector('#finTitle').textContent='أكّدي الرقم السري مرة ثانية';overlay.querySelector('#finDots').textContent='○ ○ ○ ○ ○ ○';overlay.querySelector('#finSubmit').disabled=true;return;}
  if(activeKind==='pin_setup'&&firstPin!==pin){error('الرقمان مختلفان، حاولي مرة ثانية');pin='';firstPin='';step=0;overlay.querySelector('#finTitle').textContent='اعملي رقم سري من 6 أرقام';overlay.querySelector('#finDots').textContent='○ ○ ○ ○ ○ ○';overlay.querySelector('#finSubmit').disabled=true;return;}
  busy=true;overlay.querySelector('#finSubmit').disabled=true;
  try{const r=await call('creditPinSubmit',{sessionId:activeId,pin,confirmPin:activeKind==='pin_setup'?firstPin:undefined});pin='';firstPin='';
   if(!r.ok){error('الرقم السري غير صحيح، المحاولات المتبقية: '+r.remaining);overlay.querySelector('#finDots').textContent='○ ○ ○ ○ ○ ○';overlay.querySelector('#finSubmit').disabled=true;return;}
   card('<span class="finBadge">✓ تم التأكيد بنجاح</span><h2>شكرًا ليكي</h2><div class="finSub">الكاشير هيكمل العملية دلوقتي.</div>');lastStatus='approved';
  }catch(e){error(e.message||'لم تنجح العملية، راجعي الموظفة');overlay.querySelector('#finDots')?.replaceChildren(document.createTextNode('○ ○ ○ ○ ○ ○'));pin='';}
  finally{busy=false;}
 };
}
async function cameraScreen(s){activeId=s.sessionId;activeKind='instapay';scanStarted=false;
 card('<span class="finBadge">InstaPay</span><div class="finSteps"><span class="finCurrent"><b>1</b> الدفع</span><span>—</span><span><b>2</b> الإيصال</span><span>—</span><span><b>3</b> المراجعة</span></div><h2>حوّلي المبلغ للحساب ده</h2><div class="finAmount">'+Number(s.amount).toFixed(2)+' EGP</div><div class="finSub" id="finRecipient"></div><div id="finPaymentQrHost"></div><button class="finPrimary" id="finTransferred">تم التحويل — صوّري الإيصال</button><p class="finErr"></p>');
 const details=await call('instaTabletDetails');if(details.sessionId!==activeId)throw Error('الجلسة اتغيرت');
 overlay.querySelector('#finRecipient').textContent=details.recipientName+' · '+details.recipientBank+' · '+details.recipientAlias+' · تأكدي من المبلغ والمستفيد قبل التحويل';
 // Only show this account's QR when the SERVER recipient matches the uploaded QR.
 // A configuration change must not silently direct customers to the old account.
 const isMatchingQr=String(details.recipientAlias||'').trim().toLowerCase()==='zogzog2000@instapay';
 if(isMatchingQr){
  const image=document.createElement('img');image.className='finPaymentQr';
  image.src='instapay-qr.png?v=1';image.alt='QR حساب InstaPay: zogzog2000@instapay';
  image.width=260;image.height=260;
  image.onerror=()=>{image.remove();error('QR مش متاح حاليًا؛ استخدمي عنوان الحساب المكتوب فوق.');};
  overlay.querySelector('#finPaymentQrHost').appendChild(image);
 }
 overlay.querySelector('#finTransferred').onclick=async()=>{
  if(scanStarted)return;scanStarted=true;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:1920},height:{ideal:1080}}});
   card('<div class="finSteps"><span><b>1</b> الدفع</span><span>—</span><span class="finCurrent"><b>2</b> الإيصال</span><span>—</span><span><b>3</b> المراجعة</span></div><h2>وجّهي إيصال InstaPay كامل داخل الإطار</h2><p class="finSub">خلي الشاشة ثابتة وواضحة من غير انعكاس أو إضاءة قوية</p><div class="finCameraFrame"><video autoplay playsinline muted id="finVideo"></video></div><button class="finPrimary" id="finSnap">تصوير الإيصال وفحصه</button><p class="finErr"></p>');const video=overlay.querySelector('#finVideo');video.srcObject=stream;await video.play();
   overlay.querySelector('#finSnap').onclick=async()=>{if(busy)return;busy=true;const btn=overlay.querySelector('#finSnap');btn.disabled=true;btn.textContent='جاري التصوير والفحص…';
    try{if(video.videoWidth<640||video.videoHeight<480)throw Error('دقة الكاميرا غير كافية، جرّبي إضاءة أفضل');
      const canvas=document.createElement('canvas');let w=video.videoWidth,h=video.videoHeight;const crop=.9;w=Math.floor(w*crop);h=Math.floor(h*crop);canvas.width=w;canvas.height=h;
      canvas.getContext('2d').drawImage(video,(video.videoWidth-w)/2,(video.videoHeight-h)/2,w,h,0,0,w,h);
      let jpeg=canvas.toDataURL('image/jpeg',.94);while(jpeg.length>1050000&&canvas.width>800){canvas.width=Math.floor(canvas.width*.84);canvas.height=Math.floor(canvas.height*.84);canvas.getContext('2d').drawImage(video,0,0,video.videoWidth,video.videoHeight,0,0,canvas.width,canvas.height);jpeg=canvas.toDataURL('image/jpeg',.9);}
      if(jpeg.length>1050000)throw Error('الصورة كبيرة جدًا، حاول مرة أخرى');
      const r=await call('instaSubmitPhoto',{sessionId:activeId,jpeg});
      if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
      card(r.status==='approved'?'<span class="finBadge">✓ تم قبول إثبات التحويل</span><h2>شكرًا ليكي</h2><p class="finSub">تم قبول إثبات التحويل. الكاشير هيكمل حفظ الفاتورة والطباعة؛ التأكيد البنكي النهائي بيتم لاحقًا.</p>':'<span class="finBadge">تم تصوير الإيصال</span><h2>الموظفة هتراجع الإيصال</h2><p class="finSub">البيانات مش كلها واضحة أو مش متطابقة. استني المراجعة.</p>');lastStatus=r.status;
    }catch(e){error(e.message||'تعذر فحص الإيصال');btn.disabled=false;btn.textContent='إعادة تصوير الإيصال';}
    finally{busy=false;}
   };
  }catch(e){scanStarted=false;error(e.message||'الكاميرا غير متاحة، اطلب مساعدة الموظفة');}
 };
}
// Branch is a discovery hint, never an authentication credential. Owner approval is mandatory once.
const pairBar=document.createElement('div');pairBar.id='finPairBar';pairBar.hidden=true;
pairBar.setAttribute('role','status');pairBar.setAttribute('aria-live','polite');document.body.appendChild(pairBar);
let pairReady=false,pairBusy=false,pairLastCheck=0,pairLastBranch='';
const branch=()=>String(window.financeFeedbackBranch?.()||'').trim();
function pairingMessage(message,code){
 pairBar.replaceChildren();
 const line=document.createElement('div');line.textContent=message;pairBar.appendChild(line);
 if(code){const c=document.createElement('strong');c.className='finPairCode';c.textContent=code;pairBar.appendChild(c);
  const hint=document.createElement('div');hint.className='finPairHint';hint.textContent='المالك: افتح الصلاحيات ← إعدادات الدفع والأجهزة ← عرض الطلبات، وقارن الرمز على الجهاز.';pairBar.appendChild(hint);}
 pairBar.hidden=false;
}
async function ensurePairing(){
 if(pairBusy||!auth.currentUser||!navigator.onLine)return;
 const b=branch();if(!b){pairReady=false;pairingMessage('اختاري فرع التابلت أولًا من الإعدادات');return;}
 if(b!==pairLastBranch){pairReady=false;pairLastBranch=b;}
 if(pairReady||Date.now()-pairLastCheck<3900)return;
 pairBusy=true;pairLastCheck=Date.now();
 try{
  let result=await call('financeTabletPairStatus',{branch:b});
  if(result.status==='unpaired')result=await call('financeTabletRequestPair',{branch:b});
  if(result.status==='paired'){
    pairReady=true;pairBar.hidden=true;return;
  }
  if(result.status==='pending'){
    pairReady=false;pairingMessage('طلب اعتماد تابلت '+b+' · الرمز صالح لخمس دقائق',result.code);return;
  }
  pairReady=false;pairingMessage('الجهاز مرتبط بفرع آخر. راجعي المالك قبل تغيير الربط.');
 }catch(e){pairReady=false;pairingMessage(e.message||'تعذر اعتماد الجهاز. افتحي الإنترنت وحاولي مرة أخرى.');}
 finally{pairBusy=false;}
}
window.addEventListener('echarpe:branch-changed',()=>{pairReady=false;pairLastCheck=0;ensurePairing();});
async function tick(){
 if(busy||!auth.currentUser||!navigator.onLine)return;
 await ensurePairing();if(!pairReady)return;
 try{
  const s=await call('financeTabletPoll');
  if(s.status==='idle'){if(activeId)close();return;}
  if(s.sessionId===activeId){if(s.status==='finished'||s.status==='cancelled')close();return;}
  if(s.status!=='pending')return;
  if(s.kind==='credit'||s.kind==='pin_setup')pinScreen(s);
  else if(s.kind==='instapay')await cameraScreen(s);
 }catch(e){pairReady=false;pairLastCheck=0;pairingMessage('انقطع الاتصال بطلبات الدفع؛ جاري إعادة التحقق من اعتماد الجهاز.');}
}
onAuthStateChanged(auth,u=>{pairReady=false;pairLastCheck=0;if(u)tick();});
setInterval(tick,2200);tick();
