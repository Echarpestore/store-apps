// ============================================================
// 🎫 بطاقات الموظفين — إعدادات الخصم + إصدار الكروت (5×9 سم)
// الوش: أفاتار + اسم + فرع + باركود الكارت (للدخول والشراء)
// الضهر: QR دعوة شخصي لتحميل التطبيق (نفس كود العمولة emp-<id>)
// ============================================================

let staffCardsConfig = null;   // {enabled, discountPct, maxTimesPerMonth, maxSalaryEGP}
let staffList = [];            // موظفي sales_employees (نفس قايمة الحضور والكاشير)

function goToStaffCards(){
  if(!hasPerm('canManageRoles')){ showToast('الشاشة دي للإدارة بس', 'err'); return; }
  showScreen('staffCardsScreen');
  renderStaffCardsScreen();
}

async function loadStaffCardsConfig(){
  staffCardsConfig = { enabled:false, discountPct:10, maxTimesPerMonth:3, maxSalaryEGP:500 };
  try{
    const d = await db.collection(TEST_SETTINGS).doc('staff_cards').get();
    if(d.exists) staffCardsConfig = { ...staffCardsConfig, ...d.data() };
  }catch(e){}
}

async function renderStaffCardsScreen(){
  const wrap = document.getElementById('staffCardsWrap');
  wrap.innerHTML = '<div style="padding:30px; text-align:center; color:var(--muted);">بيتحمّل...</div>';
  await loadStaffCardsConfig();
  try{
    const snap = await db.collection('sales_employees').get();
    staffList = snap.docs.map(d=> ({id:d.id, ...d.data()})).filter(e=> !e.isAdminAccount).sort((a,b)=> (a.branch||'').localeCompare(b.branch||'') || (a.name||'').localeCompare(b.name||''));
  }catch(e){ wrap.innerHTML = '<div class="empty-cart">تعذر تحميل الموظفين: '+e.message+'</div>'; return; }

  const c = staffCardsConfig;
  _refreshAdminAccStatus_pending = true;
  wrap.innerHTML = `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:16px; margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <div style="font-weight:800;">🛍️ خصم شراء الموظفين</div>
        <label style="display:flex; align-items:center; gap:6px; font-size:13px; cursor:pointer;">
          <input type="checkbox" id="sc_on" ${c.enabled?'checked':''} style="width:18px; height:18px;"> مفعّل
        </label>
      </div>
      <p style="color:var(--muted); font-size:12px; margin:0 0 12px;">الموظفة بتمسح كارتها في شاشة البيع → الخصم بيتطبق → تدفع كاش أو خصم من الراتب (بموافقة الإدارة من برنامج الحضور).</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; font-size:13px; align-items:center;">
        <span>الخصم:</span>
        <input id="sc_pct" type="number" min="1" max="90" value="${c.discountPct}" style="width:70px; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:800;">%
        <span style="margin-right:8px;">· عدد مرات في الشهر:</span>
        <input id="sc_times" type="number" min="1" value="${c.maxTimesPerMonth}" style="width:60px; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:800;">
        <span style="margin-right:8px;">· أقصى خصم من الراتب شهريًا:</span>
        <input id="sc_max" type="number" min="0" value="${c.maxSalaryEGP}" style="width:85px; padding:9px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:800;"> ج.م
      </div>
      <button onclick="saveStaffCardsConfig()" style="margin-top:14px; width:100%; padding:12px; border-radius:10px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">حفظ الإعدادات</button>
    </div>

    <div style="background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:16px; margin-bottom:14px;">
      <div style="font-weight:800; margin-bottom:4px;">⭐ نقاط البيع الأوتوماتيك + 🎯 نسبة التارجت</div>
      <p style="color:var(--muted); font-size:12px; margin:0 0 12px;">النقطة بتتسجل لوحدها للبياعة المختارة وقت الدفع لما الفاتورة تستوفي الشروط دي — من غير أي سكان في برنامج الحضور.</p>
      <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
        <label style="font-size:12.5px;">أقل عدد قطع: <input id="spMinItems" type="number" min="1" style="width:70px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:800;"></label>
        <label style="font-size:12.5px;">أقل قيمة فاتورة: <input id="spMinInvoice" type="number" min="0" style="width:90px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:800;"> ج.م (0 = مفيش حد)</label>
      </div>
      <div style="border-top:1px dashed var(--border); padding-top:10px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
        <label style="font-size:12.5px; display:flex; align-items:center; gap:6px;"><input type="checkbox" id="spTargetEnabled" style="width:18px; height:18px;"> 🎯 نسبة من المبيعات عند تحقيق تارجت</label>
        <select id="spTargetScope" style="padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:12px;">
          <option value="employee">تارجت الموظفة نفسها</option>
          <option value="branch">تارجت الفرع كله</option>
        </select>
        <label style="font-size:12.5px;">التارجت الشهري: <input id="spTargetAmount" type="number" min="0" style="width:100px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:800;"> ج.م</label>
        <label style="font-size:12.5px;">النسبة: <input id="spCommissionPct" type="number" min="0" step="0.1" style="width:70px; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); text-align:center; font-weight:800;"> %</label>
      </div>
      <button onclick="saveStaffPointsSettings()" style="margin-top:12px; padding:10px 18px; border-radius:9px; border:none; background:var(--accent); color:#fff; font-weight:800; cursor:pointer;">💾 حفظ إعدادات النقاط</button>
    </div>

    <div style="background:var(--panel); border:1.5px solid var(--warn); border-radius:14px; padding:16px; margin-bottom:14px;">
      <div style="font-weight:800; margin-bottom:4px;">👑 حساب الأدمن العام</div>
      <p style="color:var(--muted); font-size:12px; margin:0 0 12px;">بيظهر في شاشة الدخول على <b>كل الفروع</b> (والجديدة تلقائيًا) بكل الصلاحيات — انت اللي بتحدد الرقم السري.</p>
      <div id="adminAccStatus" style="font-size:12.5px; margin-bottom:10px; color:var(--muted);">جارٍ التحقق...</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <input id="adminAccName" placeholder="الاسم (مثلًا: الإدارة)" value="الإدارة" style="flex:1; min-width:130px; padding:10px; border-radius:9px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:13px;">
        <input id="adminAccPin" placeholder="الرقم السري الجديد" type="text" inputmode="numeric" style="width:140px; padding:10px; border-radius:9px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:13px; text-align:center; font-weight:800;">
        <button onclick="saveAdminAccount()" style="padding:11px 16px; border-radius:9px; border:none; background:var(--warn); color:#3a2600; font-weight:800; cursor:pointer;">💾 حفظ</button>
      </div>
    </div>

    <div style="font-weight:800; margin:14px 2px 8px;">🎫 كروت الموظفين <span style="color:var(--muted); font-size:11.5px; font-weight:400;">(مقاس 5×9 سم — اطبعه وقصّه وغلّفه)</span></div>
    ${staffList.map(e=>{
      const hasCard = !!e.cardCode;
      const av = e.avatar==='boy' ? '👨' : '👩';
      return `
      <div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:11px 13px; margin-bottom:7px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <div style="font-size:22px;">${av}</div>
        <div style="flex:1; min-width:130px;">
          <div style="font-weight:800; font-size:13.5px;">${e.name||'؟'}</div>
          <div style="color:var(--muted); font-size:11px;">📍 ${e.branch||'—'} ${hasCard?'· 🎫 كارت صادر':'· لسه مفيش كارت'}</div>
        </div>
        <select onchange="setStaffAvatar('${e.id}', this.value)" style="padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:12px;">
          <option value="girl" ${e.avatar!=='boy'?'selected':''}>👩 بنت</option>
          <option value="boy" ${e.avatar==='boy'?'selected':''}>👨 ولد</option>
        </select>
        <button onclick="openStaffCard('${e.id}')" style="padding:9px 13px; border-radius:9px; border:none; background:var(--accent); color:#fff; font-weight:800; font-size:12px; cursor:pointer;">🎫 ${hasCard?'عرض الكارت':'إصدار كارت'}</button>
        ${hasCard?`<button onclick="reissueStaffCard('${e.id}')" title="لو الكارت ضاع — بيبطّل القديم فورًا" style="padding:9px 11px; border-radius:9px; border:1px solid var(--border); background:var(--panel2); color:var(--warn); font-weight:800; font-size:12px; cursor:pointer;">🔄</button>`:''}
      </div>`;
    }).join('') || '<div class="empty-cart">لسه مفيش موظفين في نظام المبيعات</div>'}`;
  _refreshAdminAccStatus();
  _loadStaffPointsSettingsUI();
}

const ADMIN_ACC_ID = 'admin_master';
async function _loadStaffPointsSettingsUI(){
  try{
    const d = await db.collection(TEST_SETTINGS).doc('staff_points').get();
    const c = d.exists ? d.data() : {};
    const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.value = (v!=null? v : ''); };
    set('spMinItems', c.minItems!=null? c.minItems : 5);
    set('spMinInvoice', c.minInvoice!=null? c.minInvoice : 0);
    set('spTargetAmount', c.targetAmount||'');
    set('spCommissionPct', c.commissionPct||'');
    const cb=document.getElementById('spTargetEnabled'); if(cb) cb.checked = !!c.targetEnabled;
    const sc=document.getElementById('spTargetScope'); if(sc) sc.value = c.targetScope||'employee';
  }catch(e){}
}
async function saveStaffPointsSettings(){
  try{
    await db.collection(TEST_SETTINGS).doc('staff_points').set({
      enabled: true,
      minItems: parseInt(document.getElementById('spMinItems').value)||5,
      minInvoice: parseFloat(document.getElementById('spMinInvoice').value)||0,
      targetEnabled: document.getElementById('spTargetEnabled').checked,
      targetScope: document.getElementById('spTargetScope').value,
      targetAmount: parseFloat(document.getElementById('spTargetAmount').value)||0,
      commissionPct: parseFloat(document.getElementById('spCommissionPct').value)||0
    }, { merge:true });
    if(typeof staffPointsConfig !== 'undefined') staffPointsConfig = null;   // يتقري تاني في البيعة الجاية
    showToast('⭐ اتحفظت إعدادات النقاط والتارجت');
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}
async function _refreshAdminAccStatus(){
  const box = document.getElementById('adminAccStatus'); if(!box) return;
  try{
    const d = await db.collection('sales_employees').doc(ADMIN_ACC_ID).get();
    if(d.exists){
      const nm = d.data().name || 'الإدارة';
      box.innerHTML = '✅ الحساب موجود باسم <b>' + nm + '</b> — عايز تغيّر الرقم السري؟ اكتب الجديد واحفظ';
      const ni = document.getElementById('adminAccName'); if(ni) ni.value = nm;
    }else{
      box.textContent = 'لسه مفيش حساب أدمن عام — اكتب الاسم والرقم السري واحفظ';
    }
  }catch(e){ box.textContent = 'تعذر التحقق: ' + e.message; }
}
async function saveAdminAccount(){
  const name = (document.getElementById('adminAccName').value || '').trim() || 'الإدارة';
  const pin = (document.getElementById('adminAccPin').value || '').trim();
  if(!pin || pin.length < 4){ showToast('الرقم السري 4 أرقام على الأقل', 'err'); return; }
  try{
    await db.collection('sales_employees').doc(ADMIN_ACC_ID).set({
      name, pin, branch: 'الإدارة', active: true, isAdminAccount: true, updatedAt: Date.now()
    }, { merge: true });
    // تعيينه "أدمن" في التوزيعات — ده اللي بيخليه يظهر في كل الفروع بكل الصلاحيات
    await db.collection(TEST_ROLES).doc('_assignments').set({ [ADMIN_ACC_ID]: 'admin' }, { merge: true });
    document.getElementById('adminAccPin').value = '';
    showToast('👑 اتحفظ حساب الأدمن — جرّب الدخول بيه من أي فرع');
    _refreshAdminAccStatus();
  }catch(e){ showToast('حصل خطأ: ' + e.message, 'err'); }
}
async function saveStaffCardsConfig(){
  const cfg = {
    enabled: document.getElementById('sc_on').checked,
    discountPct: parseFloat(document.getElementById('sc_pct').value)||10,
    maxTimesPerMonth: parseInt(document.getElementById('sc_times').value)||3,
    maxSalaryEGP: parseFloat(document.getElementById('sc_max').value)||0
  };
  try{
    await db.collection(TEST_SETTINGS).doc('staff_cards').set(cfg);
    staffCardsConfig = cfg;
    showToast('اتحفظت إعدادات خصم الموظفين ✅');
  }catch(e){ showToast('حصل خطأ: '+e.message, 'err'); }
}

async function setStaffAvatar(empId, av){
  try{ await db.collection('sales_employees').doc(empId).update({ avatar: av }); 
    const e = staffList.find(x=>x.id===empId); if(e) e.avatar = av;
    renderStaffCardsScreen();
  }catch(e){ showToast('حصل خطأ: '+e.message, 'err'); }
}

function _newCardCode(){
  let s = '';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let i=0;i<10;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return 'EC' + s;   // بيتقرا CODE128 — ومميز عن باركود المنتجات
}

async function openStaffCard(empId){
  const e = staffList.find(x=>x.id===empId); if(!e) return;
  if(!e.cardCode){
    e.cardCode = _newCardCode();
    try{ await db.collection('sales_employees').doc(empId).update({ cardCode: e.cardCode, cardIssuedAt: Date.now() }); }
    catch(err){ showToast('تعذر إصدار الكارت: '+err.message, 'err'); return; }
  }
  showStaffCardOverlay(e);
}

async function reissueStaffCard(empId){
  const e = staffList.find(x=>x.id===empId); if(!e) return;
  if(!confirm('إعادة إصدار كارت '+e.name+'؟ الكارت القديم هيتبطّل فورًا (للكروت الضايعة).')) return;
  e.cardCode = _newCardCode();
  try{
    await db.collection('sales_employees').doc(empId).update({ cardCode: e.cardCode, cardIssuedAt: Date.now() });
    showToast('اتعمل كارت جديد — اطبعه وسلّمه ✅');
    showStaffCardOverlay(e);
  }catch(err){ showToast('حصل خطأ: '+err.message, 'err'); }
}

// ---------- تصميم الكارت 5×9 (وش وضهر) ----------
function _staffBrand(e){
  const glow = /glow/i.test(e.branch||'');
  return glow
    ? { name:'Glow', main:'#111111', accent:'#d4af37', text:'#ffffff', soft:'#2a2a2a', app:'glow',
        logoUrl:'https://www.echarpe.store/glow/wordmark.png' }
    : { name:'echarpe', main:'#b76e79', accent:'#f7dfe4', text:'#ffffff', soft:'#fdf1f3', app:'loyalty',
        logoUrl:'https://www.echarpe.store/loyalty/logo-white.png' };
}
function _staffAvatarSVG(av, brand){
  const skin = '#f2c9a8', bg = brand.accent;
  if(av==='boy') return `<svg viewBox="0 0 100 100" style="width:100%; height:100%;"><circle cx="50" cy="50" r="48" fill="${bg}"/><circle cx="50" cy="40" r="17" fill="${skin}"/><path d="M33 38 q17 -22 34 0 l0 -8 q-17 -14 -34 0 z" fill="#5a3d2b"/><path d="M22 88 q28 -26 56 0 l0 12 -56 0 z" fill="${brand.main}"/></svg>`;
  return `<svg viewBox="0 0 100 100" style="width:100%; height:100%;"><circle cx="50" cy="50" r="48" fill="${bg}"/><path d="M50 16 q-26 0 -24 34 q-2 18 8 24 l32 0 q10 -6 8 -24 q2 -34 -24 -34z" fill="${brand.main}"/><circle cx="50" cy="42" r="14.5" fill="${skin}"/><path d="M50 18 q-22 0 -21 30 q9 -16 21 -16 q12 0 21 16 q1 -30 -21 -30z" fill="${brand.main}"/><path d="M24 90 q26 -24 52 0 l0 10 -52 0 z" fill="${brand.main}" opacity=".85"/></svg>`;
}
function buildStaffCardHTML(e, side){
  const b = _staffBrand(e);
  const logo = (typeof receiptDesignConfig!=='undefined' && receiptDesignConfig && receiptDesignConfig.logo) ? receiptDesignConfig.logo : '';
  const qrUrl = 'https://www.echarpe.store/' + b.app + '/?src=emp-' + e.id;
  const qrImg = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=1&data=' + encodeURIComponent(qrUrl);

  if(side==='front') return `
  <div class="stcard" style="width:50mm; height:90mm; box-sizing:border-box; background:#fff; border-radius:3.5mm; overflow:hidden; display:flex; flex-direction:column; font-family:Tahoma,Arial; page-break-after:always; border:0.3mm solid #ddd;">
    <div style="background:${b.main}; color:${b.text}; text-align:center; padding:4mm 2mm 3mm;">
      <img src="${b.logoUrl}" style="max-height:9mm; max-width:76%; display:block; margin:0 auto;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"><div style="display:none; font-weight:900; font-size:14px; letter-spacing:1px;">${b.name}</div>
      <div style="font-size:7px; opacity:.85; margin-top:1mm;">بطاقة موظف · Staff Card</div>
    </div>
    <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:3mm;">
      <div style="width:24mm; height:24mm; border-radius:50%; overflow:hidden; border:1mm solid ${b.accent};">${_staffAvatarSVG(e.avatar, b)}</div>
      <div style="font-weight:900; font-size:13px; margin-top:3mm; color:#222; text-align:center;">${e.name||''}</div>
      <div style="font-size:9px; color:#888; margin-top:1mm;">📍 ${e.branch||''}</div>
    </div>
    <div style="text-align:center; padding:0 3mm 3.5mm;">
      <svg class="stBc" data-code="${e.cardCode}" style="width:88%; height:11mm;"></svg>
      <div style="font-size:6.5px; color:#aaa; letter-spacing:1px; direction:ltr;">${e.cardCode}</div>
    </div>
  </div>`;

  return `
  <div class="stcard" style="width:50mm; height:90mm; box-sizing:border-box; background:${b.main}; border-radius:3.5mm; overflow:hidden; display:flex; flex-direction:column; align-items:center; font-family:Tahoma,Arial; color:${b.text}; text-align:center; page-break-after:always;">
    <div style="padding:5mm 3mm 2mm; font-weight:900; font-size:13px;">حمّلي تطبيق ${b.name} 📱</div>
    <div style="font-size:8px; opacity:.9; padding:0 4mm;">امسحي الكود بكاميرا موبايلك</div>
    <div style="background:#fff; border-radius:2.5mm; padding:2.5mm; margin:3.5mm 0;">
      <img src="${qrImg}" style="width:30mm; height:30mm; display:block;">
    </div>
    <div style="font-size:8.5px; padding:0 4mm; line-height:1.5;">🎁 سجّلي وفعّلي الإشعارات<br>ومستنياكي مكافأة ترحيب!</div>
    <div style="margin-top:auto; padding:3mm; font-size:7.5px; opacity:.8;">دعوة من: ${e.name||''} 💕</div>
  </div>`;
}
function showStaffCardOverlay(e){
  const old = document.getElementById('stCardOverlay'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'stCardOverlay';
  ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.72); z-index:9999; display:flex; align-items:center; justify-content:center; padding:14px; overflow-y:auto;';
  ov.innerHTML = `<div style="background:var(--panel); border:1px solid var(--border); border-radius:16px; padding:16px; max-width:520px; width:100%;">
    <div style="font-weight:800; margin-bottom:10px; text-align:center;">🎫 كارت ${e.name}</div>
    <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap; background:#e8e8e8; border-radius:12px; padding:14px;">
      <div style="transform:scale(.85); transform-origin:top;">${buildStaffCardHTML(e,'front')}</div>
      <div style="transform:scale(.85); transform-origin:top;">${buildStaffCardHTML(e,'back')}</div>
    </div>
    <div style="display:flex; gap:8px; margin-top:12px;">
      <button onclick="printStaffCard('${e.id}')" style="flex:2; padding:12px; border-radius:10px; border:none; background:var(--plus); color:#062; font-weight:800; cursor:pointer;">🖨️ طباعة (وش + ضهر)</button>
      <button onclick="document.getElementById('stCardOverlay').remove()" style="flex:1; padding:12px; border-radius:10px; border:1px solid var(--border); background:var(--panel2); color:var(--text); cursor:pointer;">إغلاق</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  _renderStaffBarcodes(ov);
}
function _renderStaffBarcodes(root){
  try{
    if(typeof JsBarcode==='undefined') return;
    root.querySelectorAll('svg.stBc').forEach(svg=>{
      JsBarcode(svg, svg.dataset.code, {format:'CODE128', width:2, height:40, margin:0, displayValue:false});
      const w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
      if(w&&h){ svg.setAttribute('viewBox','0 0 '+w+' '+h); svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('preserveAspectRatio','none'); }
    });
  }catch(e){}
}
function printStaffCard(empId){
  const e = staffList.find(x=>x.id===empId); if(!e) return;
  const html = buildStaffCardHTML(e,'front') + buildStaffCardHTML(e,'back');
  const w = window.open('', '_blank', 'width=460,height=680');
  w.document.write(`<html dir="rtl"><head><meta charset="UTF-8"><style>@page{size:50mm 90mm; margin:0;} body{margin:0;} .stcard{border-radius:0 !important;}</style></head><body>${html}</body></html>`);
  w.document.close();
  const draw = ()=>{ try{
    const JB = w.JsBarcode || (typeof JsBarcode!=='undefined' ? JsBarcode : null);
    if(typeof JsBarcode!=='undefined'){
      w.document.querySelectorAll('svg.stBc').forEach(svg=>{
        JsBarcode(svg, svg.dataset.code, {format:'CODE128', width:2, height:40, margin:0, displayValue:false});
        const wd = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
        if(wd&&h){ svg.setAttribute('viewBox','0 0 '+wd+' '+h); svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('preserveAspectRatio','none'); }
      });
    }
    setTimeout(()=>{ w.print(); setTimeout(()=> w.close(), 600); }, 500);
  }catch(err){ w.print(); } };
  setTimeout(draw, 300);
}
