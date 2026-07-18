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
    days: parseInt(document.getElementById('wl_'+brand+'_days').value) || 30
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
