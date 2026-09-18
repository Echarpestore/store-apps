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
 card('<span class="finBadge">InstaPay</span><h2>حوّلي المبلغ للحساب ده</h2><div class="finAmount">'+Number(s.amount).toFixed(2)+' EGP</div><div class="finSub" id="finRecipient"></div><div id="finPaymentQrHost"></div><button class="finPrimary" id="finTransferred">تم التحويل — صوّري الإيصال</button><p class="finErr"></p>');
 const details=await call('instaTabletDetails');if(details.sessionId!==activeId)throw Error('الجلسة اتغيرت');
 overlay.querySelector('#finRecipient').textContent=details.recipientName+' · '+details.recipientBank+' · '+details.recipientAlias;
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
   card('<h2>وجّهي إيصال InstaPay كامل داخل الإطار</h2><p class="finSub">خلي الشاشة ثابتة وواضحة من غير انعكاس أو إضاءة قوية</p><div class="finCameraFrame"><video autoplay playsinline muted id="finVideo"></video></div><button class="finPrimary" id="finSnap">تصوير الإيصال وفحصه</button><p class="finErr"></p>');const video=overlay.querySelector('#finVideo');video.srcObject=stream;await video.play();
   overlay.querySelector('#finSnap').onclick=async()=>{if(busy)return;busy=true;const btn=overlay.querySelector('#finSnap');btn.disabled=true;btn.textContent='جاري التصوير والفحص…';
    try{if(video.videoWidth<640||video.videoHeight<480)throw Error('دقة الكاميرا غير كافية، جرّبي إضاءة أفضل');
      const canvas=document.createElement('canvas');let w=video.videoWidth,h=video.videoHeight;const crop=.9;w=Math.floor(w*crop);h=Math.floor(h*crop);canvas.width=w;canvas.height=h;
      canvas.getContext('2d').drawImage(video,(video.videoWidth-w)/2,(video.videoHeight-h)/2,w,h,0,0,w,h);
      let jpeg=canvas.toDataURL('image/jpeg',.94);while(jpeg.length>1050000&&canvas.width>800){canvas.width=Math.floor(canvas.width*.84);canvas.height=Math.floor(canvas.height*.84);canvas.getContext('2d').drawImage(video,0,0,video.videoWidth,video.videoHeight,0,0,canvas.width,canvas.height);jpeg=canvas.toDataURL('image/jpeg',.9);}
      if(jpeg.length>1050000)throw Error('الصورة كبيرة جدًا، حاول مرة أخرى');
      const r=await call('instaSubmitPhoto',{sessionId:activeId,jpeg});
      if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
      card(r.status==='approved'?'<span class="finBadge">✓ تم قبول إثبات التحويل</span><h2>شكرًا ليكي</h2><p class="finSub">الفاتورة بتتطبع الآن. التأكيد البنكي النهائي بيتم لاحقًا.</p>':'<span class="finBadge">تم تصوير الإيصال</span><h2>الموظفة هتراجع الإيصال</h2><p class="finSub">البيانات مش كلها واضحة أو مش متطابقة. استني المراجعة.</p>');lastStatus=r.status;
    }catch(e){error(e.message||'تعذر فحص الإيصال');btn.disabled=false;btn.textContent='إعادة تصوير الإيصال';}
    finally{busy=false;}
   };
  }catch(e){scanStarted=false;error(e.message||'الكاميرا غير متاحة، اطلب مساعدة الموظفة');}
 };
}
const pairDisplay=document.createElement('p');pairDisplay.style.cssText='font-size:11px;direction:ltr;user-select:text;word-break:break-all;color:#8b90a0';pairDisplay.textContent='Finance tablet ID: loading…';document.querySelector('#branchSetup .branch-box')?.appendChild(pairDisplay);
async function tick(){if(busy||!auth.currentUser||!navigator.onLine)return;try{const s=await call('financeTabletPoll');pairDisplay.textContent='Finance tablet ID: '+auth.currentUser.uid;
 if(s.status==='idle'){if(activeId)close();return;}
 if(s.sessionId===activeId){if(s.status==='finished'||s.status==='cancelled')close();return;}
 if(s.status!=='pending')return;
 if(s.kind==='credit'||s.kind==='pin_setup')pinScreen(s);
 else if(s.kind==='instapay')await cameraScreen(s);
 }catch(e){pairDisplay.textContent='Finance tablet ID: '+auth.currentUser.uid+' (unpaired / offline)';}}
onAuthStateChanged(auth,u=>{if(u){pairDisplay.textContent='Finance tablet ID: '+u.uid;tick();}});
setInterval(tick,2200);tick();
