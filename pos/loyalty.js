// ============================================================
// loyalty.js — إدارة برنامج الولاء الكامل (المرحلة 5 المبكرة)
// معدل الكسب (كل كام جنيه = نقطة) + معدل الاستبدال (كل كام نقطة = كام جنيه خصم)
// كلهم قابلين للتعديل من هنا، وبيتطبقوا تلقائي في كل عمليات البيع.
// بيعتمد على العام من app.js: db, hasPerm, showToast, showScreen,
// TEST_SETTINGS, loyaltyRedemptionConfig, loadLoyaltyRedemptionConfig
// ============================================================

function goToLoyaltyScreen(){
  if(!hasPerm('canChangePrices')){ showToast('الصلاحية دي للمدير بس', 'err'); return; }
  showScreen('loyaltyScreen');
  renderLoyaltyScreen();
}

async function renderLoyaltyScreen(){
  await loadLoyaltyRedemptionConfig();
  const c = loyaltyRedemptionConfig;
  // إعدادات مكافأة الترحيب (لكل براند)
  let w = {};
  try{
    const d = await db.collection(TEST_SETTINGS).doc('loyalty').get();
    w = d.exists ? (d.data().welcome || {}) : {};
  }catch(e){}
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
