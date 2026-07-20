// ============================================================
// loyalty.js — إدارة برنامج الولاء الكامل (المرحلة 5 المبكرة)
// معدل الكسب (كل كام جنيه = نقطة) + معدل الاستبدال (كل كام نقطة = كام جنيه خصم)
// كلهم قابلين للتعديل من هنا، وبيتطبقوا تلقائي في كل عمليات البيع.
// بيعتمد على العام من app.js: db, hasPerm, showToast, showScreen,
// TEST_SETTINGS, loyaltyRedemptionConfig, loadLoyaltyRedemptionConfig
// ============================================================


// >>> SOCIAL_POS_START
// 📲 أزرار التواصل في تطبيق العميل (واتساب فروع + فيسبوك + انستجرام + خدمة عملاء)
// بتتحفظ جوه نفس مستند loyalty اللي التطبيق بيقراه أصلًا عند الفتح → صفر قراءات إضافية.
let _socState = { echarpe:{ whatsapp:[] }, glow:{ whatsapp:[] } };

// بيحوّل أي صيغة رقم لصيغة واتساب الدولية (مصر): 01012345678 → 201012345678
function _waNormalize(raw){
  var d = String(raw||'').replace(/\D/g,'');
  if(d.slice(0,2)==='00') d = d.slice(2);              // 0020... → 20...
  if(d.slice(0,3)==='201' && d.length===12) return d;  // دولي جاهز
  if(d.slice(0,2)==='01' && d.length===11) return '2'+d; // محلي مصري
  return d;                                            // أي صيغة تانية زي ما هي
}
// بينضف قايمة الأرقام: بيطبّع + بيشيل الفاضي/القصير + اسم افتراضي لو مفيش
function _socCleanWa(list){
  return (Array.isArray(list)?list:[]).map(function(r){
    return { name: (String((r&&r.name)||'').trim() || 'واتساب'), number: _waNormalize(r&&r.number) };
  }).filter(function(r){ return r.number.length >= 10; });
}
function _socInitBrand(b){
  b = b || {};
  return { facebook:b.facebook||'', instagram:b.instagram||'', support:b.support||'', whatsapp:Array.isArray(b.whatsapp)?b.whatsapp.map(function(w){return {name:(w&&w.name)||'', number:(w&&w.number)||''};}):[] };
}
// <<< SOCIAL_POS_END

function _socWaRowsHTML(brand){
  const rows = _socState[brand].whatsapp;
  if(!rows.length) return '<div style="color:var(--muted); font-size:12px; margin-bottom:8px;">مفيش أرقام لسه — دوس ➕ تحت</div>';
  return rows.map((r,i)=>`
    <div style="display:flex; gap:6px; margin-bottom:6px;">
      <input id="soc_${brand}_wname_${i}" value="${String(r.name||'').replace(/"/g,'&quot;')}" placeholder="اسم الفرع" style="flex:1; min-width:90px; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-weight:700;">
      <input id="soc_${brand}_wnum_${i}" value="${String(r.number||'').replace(/"/g,'&quot;')}" placeholder="01xxxxxxxxx" style="flex:1.2; min-width:120px; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-weight:700; direction:ltr; text-align:center;">
      <button onclick="_socDelWa('${brand}',${i})" title="حذف" style="border:none; background:#5a2430; color:#ff9db1; border-radius:8px; padding:0 12px; cursor:pointer; font-weight:800;">✖</button>
    </div>`).join('');
}
function _socSyncFromDom(brand){
  const st = _socState[brand];
  st.whatsapp.forEach((r,i)=>{
    const n = document.getElementById('soc_'+brand+'_wname_'+i);
    const v = document.getElementById('soc_'+brand+'_wnum_'+i);
    if(n) r.name = n.value; if(v) r.number = v.value;
  });
  const fb=document.getElementById('soc_'+brand+'_fb'), ig=document.getElementById('soc_'+brand+'_ig'), su=document.getElementById('soc_'+brand+'_sup');
  if(fb) st.facebook = fb.value.trim();
  if(ig) st.instagram = ig.value.trim();
  if(su) st.support = su.value.trim();
}
function _socAddWa(brand){ _socSyncFromDom(brand); _socState[brand].whatsapp.push({name:'',number:''}); document.getElementById('soc_'+brand+'_walist').innerHTML = _socWaRowsHTML(brand); }
function _socDelWa(brand,i){ _socSyncFromDom(brand); _socState[brand].whatsapp.splice(i,1); document.getElementById('soc_'+brand+'_walist').innerHTML = _socWaRowsHTML(brand); }

function goToLoyaltyScreen(){
  if(!hasPerm('canChangePrices')){ showToast('الصلاحية دي للمدير بس', 'err'); return; }
  showScreen('loyaltyScreen');
  renderLoyaltyScreen();
}

async function renderLoyaltyScreen(){
  await loadLoyaltyRedemptionConfig();
  const c = loyaltyRedemptionConfig;
  // إعدادات مكافأة الترحيب (لكل براند)
  let w = {}; let _socRaw = {};
  try{
    const d = await db.collection(TEST_SETTINGS).doc('loyalty').get();
    const dd = d.exists ? d.data() : {};
    w = dd.welcome || {};
    _socRaw = dd.social || {};
  }catch(e){}
  _socState = { echarpe: _socInitBrand(_socRaw.echarpe), glow: _socInitBrand(_socRaw.glow) };
  const we = w.echarpe || {}; const wg = w.glow || {};
  const welcomeCard = (brand, label, cfg) => `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <div style="font-weight:800;">👋 مكافأة الترحيب — ${label}</div>
        <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
          <input type="checkbox" id="wl_${brand}_on" ${cfg.enabled?'checked':''} style="width:18px; height:18px;"> مفعّلة
        </label>
      </div>
      <p style="color:var(--muted); font-size:12px; margin:0 0 10px;">العميل اللي يثبّت التطبيق ويفعّل الإشعارات ياخدها تلقائي (مرة واحدة لكل رقم).</p>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:13.5px;">
        <span>النوع:</span>
        <select id="wl_${brand}_type" onchange="document.getElementById('wl_${brand}_minwrap').style.display = this.value==='fixed' ? 'flex' : 'none';" style="padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-weight:700;">
          <option value="fixed" ${cfg.type!=='points'?'selected':''}>خصم بالجنيه</option>
          <option value="points" ${cfg.type==='points'?'selected':''}>نقط ولاء (فورية)</option>
        </select>
        <input id="wl_${brand}_val" type="number" value="${cfg.value||''}" placeholder="القيمة" style="width:85px; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:700;">
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:13.5px; margin-top:10px;">
        <span>👩‍💼 عمولة الموظفة لكل تنزيل عن طريقها:</span>
        <input id="wl_${brand}_ref" type="number" value="${cfg.refBonus||''}" placeholder="0 = مقفولة" style="width:95px; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:700;">
        <span>ج.م</span>
        <span style="color:var(--muted); font-size:11.5px; width:100%; margin-top:2px;">💡 العمولة بتتفعّل بعد <b>أول فاتورة شراء حقيقية</b> للعميل (حماية من التنزيلات الوهمية)</span>
        <span>بحد أدنى للفاتورة:</span>
        <input id="wl_${brand}_refmin" type="number" value="${cfg.refMinInvoice||''}" placeholder="0 = أي فاتورة" style="width:110px; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:700;">
        <span>ج.م</span>
      </div>
      <div id="wl_${brand}_minwrap" style="display:${cfg.type==='points'?'none':'flex'}; gap:8px; align-items:center; flex-wrap:wrap; font-size:13.5px; margin-top:10px;">
        <span>حد أدنى للفاتورة (اختياري):</span>
        <input id="wl_${brand}_min" type="number" value="${cfg.minInvoice||''}" placeholder="من غير حد" style="width:100px; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:700;">
        <span>ج.م · صلاحية</span>
        <input id="wl_${brand}_days" type="number" value="${cfg.days||30}" style="width:65px; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:700;">
        <span>يوم</span>
      </div>
    </div>`;


  const socialCard = (brand, label) => { const sc = _socState[brand]; return `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:14px;">
      <div style="font-weight:800; margin-bottom:4px;">📲 أزرار التواصل في تطبيق ${label}</div>
      <p style="color:var(--muted); font-size:12px; margin:0 0 10px;">بتظهر للعميلة في تبويب «تواصلي معانا» + الزر الأخضر فوق. أي خانة فاضية → زرارها بيختفي من التطبيق تلقائي. اكتب الأرقام محلي عادي (01xxxxxxxxx) وهتتظبط لوحدها عند الحفظ.</p>
      <div style="font-size:12.5px; font-weight:800; margin-bottom:6px;">🟢 أرقام واتساب الفروع</div>
      <div id="soc_${brand}_walist">${_socWaRowsHTML(brand)}</div>
      <button class="secondary" onclick="_socAddWa('${brand}')" style="padding:8px 14px; margin:2px 0 12px;">➕ إضافة رقم فرع</button>
      <div style="display:grid; grid-template-columns:1fr; gap:8px;">
        <input id="soc_${brand}_fb" value="${String(sc.facebook||'').replace(/"/g,'&quot;')}" placeholder="لينك صفحة الفيسبوك (فاضي = الزر مخفي)" style="padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); direction:ltr;">
        <input id="soc_${brand}_ig" value="${String(sc.instagram||'').replace(/"/g,'&quot;')}" placeholder="لينك الانستجرام (فاضي = الزر مخفي)" style="padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); direction:ltr;">
        <input id="soc_${brand}_sup" value="${String(sc.support||'').replace(/"/g,'&quot;')}" placeholder="واتساب خدمة العملاء — الزر الأخضر فوق في التطبيق (اختياري)" style="padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); direction:ltr; text-align:center;">
      </div>
    </div>`; };
  document.getElementById('loyaltyScreenWrap').innerHTML = `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:14px;">
      <div style="font-weight:800; margin-bottom:4px;">💰 معدل كسب النقط</div>
      <p style="color:var(--muted); font-size:12px; margin:0 0 10px;">كل ما العميل يشتري بمبلغ معين، ياخد نقطة ولاء واحدة تلقائي.</p>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:14px;">
        <span>كل</span>
        <input id="loyaltyEarnInput" type="number" value="${c.pointsPerEGP}" style="width:90px; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:700;">
        <span>جنيه مشتريات = نقطة ولاء واحدة</span>
      </div>
    </div>

    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:14px;">
      <div style="font-weight:800; margin-bottom:4px;">🎁 معدل استبدال النقط بخصم</div>
      <p style="color:var(--muted); font-size:12px; margin:0 0 10px;">لما العميل يجمع نقط كفاية، يقدر يستبدلها بخصم على فاتورته من زرار "🎁 استبدال نقاط" في شاشة البيع.</p>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:14px;">
        <span>كل</span>
        <input id="loyaltyPointsInput" type="number" value="${c.pointsPerRedemption}" style="width:80px; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:700;">
        <span>نقطة = </span>
        <input id="loyaltyValueInput" type="number" value="${c.redemptionValueEGP}" style="width:80px; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:700;">
        <span>جنيه خصم</span>
      </div>
    </div>

    <div style="background:var(--panel2); border:1px dashed var(--border); border-radius:12px; padding:14px; margin-bottom:14px; font-size:12px; color:var(--muted);">
      💡 مثال بالأرقام الحالية: عميل اشترى بـ${c.pointsPerEGP * 3} جنيه → ياخد 3 نقط. لما يجمع ${c.pointsPerRedemption} نقطة، يقدر يستبدلها بخصم ${c.redemptionValueEGP} جنيه.
    </div>

    ${welcomeCard('echarpe', 'إيشارب', we)}
    ${welcomeCard('glow', 'Glow', wg)}

    ${socialCard('echarpe', 'إيشارب')}
    ${socialCard('glow', 'Glow')}

    <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:14px;">
      <div style="font-weight:800; margin-bottom:4px;">📱 كود QR لتحميل التطبيق</div>
      <p style="color:var(--muted); font-size:12px; margin:0 0 10px;">اطبعه وحطه عند الكاشير والفتارين — العميل يمسحه، التطبيق يفتح، والبانر يقترح التثبيت فورًا مع مكافأة الترحيب. الكود بيتعلّم بالفرع عشان تعرف من التقارير مين جه منين.</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
        <select id="qrApp" style="flex:1; min-width:130px; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">
          <option value="loyalty">تطبيق إيشارب</option>
          <option value="glow">تطبيق Glow</option>
        </select>
        <button class="secondary" onclick="generateAppQR()" style="padding:9px 16px;">🎯 توليد الكود</button>
      </div>
      <div id="qrResult" style="display:none; text-align:center; background:#fff; border-radius:12px; padding:16px;">
        <div id="qrCanvasBox" style="display:flex; justify-content:center;"></div>
        <div id="qrLinkTxt" style="font-size:10px; color:#555; margin-top:8px; direction:ltr; word-break:break-all;"></div>
        <button onclick="printAppQR()" style="margin-top:10px; padding:10px 22px; border-radius:9px; border:none; background:#1a7f37; color:#fff; font-weight:800; cursor:pointer;">🖨️ طباعة الملصق</button>
      </div>
    </div>

    <button onclick="saveLoyaltyConfig()" style="width:100%; padding:14px; border-radius:10px; border:none; background:var(--plus); color:#062; font-weight:800; font-size:14px; cursor:pointer;">حفظ إعدادات برنامج الولاء</button>`;
}

async function saveLoyaltyConfig(){
  if(!hasPerm('canChangePrices')){ showToast('مفيش صلاحية', 'err'); return; }
  const pointsPerEGP = parseFloat(document.getElementById('loyaltyEarnInput').value) || 100;
  const pointsPerRedemption = parseInt(document.getElementById('loyaltyPointsInput').value) || 10;
  const redemptionValueEGP = parseFloat(document.getElementById('loyaltyValueInput').value) || 5;

  if(pointsPerEGP <= 0 || pointsPerRedemption <= 0 || redemptionValueEGP <= 0){
    showToast('كل القيم لازم تكون أكبر من صفر', 'err'); return;
  }

  const config = { pointsPerEGP, pointsPerRedemption, redemptionValueEGP };
  // إعدادات مكافأة الترحيب لكل براند
  const readWelcome = (brand) => ({
    enabled: document.getElementById('wl_'+brand+'_on').checked,
    type: document.getElementById('wl_'+brand+'_type').value,
    value: parseFloat(document.getElementById('wl_'+brand+'_val').value) || 0,
    minInvoice: parseFloat(document.getElementById('wl_'+brand+'_min').value) || 0,
    days: parseInt(document.getElementById('wl_'+brand+'_days').value) || 30,
    refBonus: parseFloat(document.getElementById('wl_'+brand+'_ref').value) || 0,
    refMinInvoice: parseFloat(document.getElementById('wl_'+brand+'_refmin').value) || 0
  });
  config.welcome = { echarpe: readWelcome('echarpe'), glow: readWelcome('glow') };
  // 📲 أزرار التواصل — بنطبّع الأرقام ونشيل الفاضي قبل الحفظ
  _socSyncFromDom('echarpe'); _socSyncFromDom('glow');
  const readSocial = (brand) => ({
    facebook: _socState[brand].facebook || '',
    instagram: _socState[brand].instagram || '',
    support: _waNormalize(_socState[brand].support),
    whatsapp: _socCleanWa(_socState[brand].whatsapp)
  });
  config.social = { echarpe: readSocial('echarpe'), glow: readSocial('glow') };
  for(const b of ['echarpe','glow']){
    if(config.welcome[b].enabled && config.welcome[b].value <= 0){
      showToast('اكتب قيمة مكافأة الترحيب لـ ' + (b==='glow'?'Glow':'إيشارب'), 'err'); return;
    }
  }
  try{
    await db.collection(TEST_SETTINGS).doc('loyalty').set(config, { merge:true });
    loyaltyRedemptionConfig = config;
    showToast('اتحفظت إعدادات برنامج الولاء ✅');
    renderLoyaltyScreen();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}


// 📱 توليد QR لتحميل التطبيق — بعلامة الفرع للتتبع
function generateAppQR(){
  var app = document.getElementById('qrApp').value;
  var base = 'https://echarpestore.github.io/store-apps/' + app + '/';
  var src = 'qr-' + (currentBranch||'').replace(/\s+/g,'-');
  var url = base + '?src=' + encodeURIComponent(src);
  var img = 'https://api.qrserver.com/v1/create-qr-code/?size=340x340&margin=2&data=' + encodeURIComponent(url);
  document.getElementById('qrCanvasBox').innerHTML = '<img id="qrImg" src="'+img+'" style="width:220px; height:220px;">';
  document.getElementById('qrLinkTxt').textContent = url;
  document.getElementById('qrResult').style.display = 'block';
  window._qrPrintData = { img: img, app: (app==='glow'?'Glow':'echarpe'), branch: currentBranch||'' };
}
function printAppQR(){
  var d = window._qrPrintData; if(!d) return;
  var w = window.open('', '_blank', 'width=420,height=560');
  w.document.write('<html dir="rtl"><head><meta charset="UTF-8"><style>body{font-family:Tahoma,Arial; text-align:center; padding:24px;} h2{margin:6px 0;} .sub{color:#555; font-size:13px; margin-bottom:14px;} img{width:280px; height:280px;} .gift{margin-top:12px; font-size:15px; font-weight:800;}</style></head><body>'
    + '<h2>حمّلي تطبيق ' + d.app + ' 📱</h2>'
    + '<div class="sub">امسحي الكود بكاميرا موبايلك</div>'
    + '<img src="' + d.img + '">'
    + '<div class="gift">🎁 سجّلي وفعّلي الإشعارات — ومستنياكي مكافأة ترحيب!</div>'
    + '<script>var i=document.querySelector("img"); if(i.complete){window.print(); setTimeout(function(){window.close();},400);} else i.onload=function(){window.print(); setTimeout(function(){window.close();},400);};<\/script>'
    + '</body></html>');
  w.document.close();
}
