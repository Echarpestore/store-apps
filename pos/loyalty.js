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
  try{
    await db.collection(TEST_SETTINGS).doc('loyalty').set(config, { merge:true });
    loyaltyRedemptionConfig = config;
    showToast('اتحفظت إعدادات برنامج الولاء ✅');
    renderLoyaltyScreen();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}
