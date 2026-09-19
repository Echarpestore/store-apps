/* ============================================================
   📱 instapay-pos.js — إنستاباي من ناحية الكاشير + الإعدادات
   ------------------------------------------------------------
   بيتحط في: pos/instapay-pos.js
   وبيتحمّل من pos/index.html بعد credit-ui.js:
     <script src="instapay-pos.js?v=690"></script>

   ⚠️ الملف ده **مبيعدّلش أي ملف تاني**. بيشتغل بالتغليف
      (monkey-patch) على دالتين موجودين:
        confirmPayAmount → يفتح الطلب بعد تأكيد المبلغ
        confirmPayment   → يمنع الحفظ قبل التأكيد، ويثبّت بعده
      السبب: pos-sale.js فيه ٤٠٠٠+ سطر فلوس متختبرة. أي سطر
      بنضيفه جوّاها احتمال نكسر حاجة شغالة. التغليف بيخلي
      إنستاباي طبقة فوق، ولو وقعت الفاتورة بتكمّل عادي.

   🔴 القاعدة: الكاشير **مبتأكدش** بنفسها إن التحويل وصل.
      السيرفر هو اللي بيعتمد بعد قراءة الإيصال. التأكيد اليدوي
      موجود للطوارئ وبيتسجّل باسمها.
   ============================================================ */
(function () {
  'use strict';

  const fnCall = (name, payload) =>
    firebase.app().functions('us-central1').httpsCallable(name)(payload).then(r => r.data || {});

  const cfgDocId = br => 'instapay_' + String(br || '');

  let S = null;        // { sid } الطلب الحالي
  let unsub = null;    // الاستماع اللايف
  let approved = false;
  let finalizing = false;

  /* ============================================================
     🎨 الواجهة
     ============================================================ */
  const CSS = `
#ipPosBox{position:fixed;inset:0;z-index:8000;display:none;background:rgba(6,8,12,.86);
  backdrop-filter:blur(6px);align-items:center;justify-content:center;padding:18px}
#ipPosBox.on{display:flex}
.ipCard{width:min(420px,94vw);background:var(--panel,#1b1e27);border:1px solid var(--border,#2b2f3b);
  border-radius:18px;padding:20px;text-align:center;color:var(--text,#eef0f4);
  animation:ipPopIn .3s cubic-bezier(.2,.8,.2,1)}
@keyframes ipPopIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.ipCard h3{margin:0 0 4px;font-size:18px}
.ipCard .sub{color:var(--muted,#8b90a0);font-size:12.5px;margin-bottom:14px}
.ipAmtBig{font-size:34px;font-weight:900;letter-spacing:-.5px;margin:6px 0 2px}
.ipRow{display:flex;gap:8px;margin:14px 0}
.ipPill{flex:1;border:1px solid var(--border,#2b2f3b);background:var(--panel2,#232733);
  border-radius:10px;padding:9px 4px;font-size:11.5px;font-weight:700;color:var(--muted,#8b90a0);
  transition:background .35s,color .35s,border-color .35s}
.ipPill.ok{background:#16a34a;border-color:#16a34a;color:#fff}
.ipState{font-size:13.5px;min-height:20px;margin-bottom:12px;font-weight:700}
.ipBtns{display:flex;gap:8px}
.ipBtns button{flex:1;padding:12px;border:none;border-radius:11px;font-family:inherit;
  font-weight:800;font-size:13px;cursor:pointer}
.ipGo{background:linear-gradient(#16a34a,#15803d);color:#fff}
.ipMan{background:var(--panel2,#232733);color:var(--text,#eef0f4);border:1px solid var(--border,#2b2f3b)!important}
.ipX{background:#3a2226;color:#ff9aa2;border:1px solid #5b2a30!important}
.ipSpin{width:34px;height:34px;margin:6px auto 10px;border-radius:50%;
  border:3px solid var(--border,#2b2f3b);border-top-color:#16a34a;animation:ipSpin 1s linear infinite}
@keyframes ipSpin{to{transform:rotate(360deg)}}
/* لوحة الإعدادات */
.ipSet{background:var(--panel,#1b1e27);border:1px solid var(--border,#2b2f3b);
  border-radius:14px;padding:16px;margin-top:14px}
.ipSet h4{margin:0 0 10px;font-size:15px}
.ipSet label{display:block;font-size:12px;margin:10px 0 4px;color:var(--muted,#8b90a0)}
.ipSet input,.ipSet select{width:100%;padding:10px;border-radius:9px;
  border:1px solid var(--border,#2b2f3b);background:var(--panel2,#232733);
  color:var(--text,#eef0f4);font-family:inherit;font-size:13px}
.ipSet .prev{margin-top:10px;background:#fff;border-radius:10px;padding:8px;display:none}
.ipSet .prev.on{display:block}
.ipSet .prev img{width:100%;max-width:180px;display:block;margin:0 auto}
.ipSet .save{width:100%;margin-top:12px;padding:12px;border:none;border-radius:10px;
  background:var(--accent,#4f46e5);color:#fff;font-family:inherit;font-weight:800;cursor:pointer}
`;

  const HTML = `
<div id="ipPosBox"><div class="ipCard">
  <h3>📱 انستا باي</h3>
  <div class="sub" id="ipPosSub">الطلب راح للتابلت</div>
  <div class="ipAmtBig" id="ipPosAmt">0 ج.م</div>
  <div class="ipSpin" id="ipPosSpin"></div>
  <div class="ipRow">
    <div class="ipPill" id="ipP1">المبلغ</div>
    <div class="ipPill" id="ipP2">الوقت</div>
    <div class="ipPill" id="ipP3">رقم العملية</div>
    <div class="ipPill" id="ipP4">المستفيد</div>
  </div>
  <div class="ipState" id="ipPosState">في انتظار العميلة…</div>
  <div id="ipPosWhy" style="display:none;font-size:11.5px;color:var(--muted,#8b90a0);
    background:var(--panel2,#232733);border-radius:9px;padding:8px;margin-bottom:10px;
    line-height:1.7;direction:rtl"></div>
  <div class="ipBtns">
    <button class="ipMan" id="ipPosManual">✍️ راجعت الإيصال — أكّدي يدوي</button>
  </div>
  <div class="ipBtns" style="margin-top:8px">
    <button class="ipX" id="ipPosCancel">إلغاء الطلب</button>
    <button class="ipGo" id="ipPosHide">إخفاء</button>
  </div>
</div></div>`;

  document.head.insertAdjacentHTML('beforeend', '<style>' + CSS + '</style>');
  document.body.insertAdjacentHTML('beforeend', HTML);
  const $ = id => document.getElementById(id);

  /* ============================================================
     ✋ مودال تأكيد داخلي — بديل confirm()/prompt()
     ⚠️ §10 في المستند: `prompt()` **ممنوع في POS** لأن Electron
        مش بيدعمها. وأنا خالفت القاعدة في أول نسخة: الديالوج طلع
        بشكل ويندوز وحش، والـprompt بعده فشل بصمت فالتأكيد اليدوي
        ماكانش بيتنفذ — والبوابة كانت بتفضل قافلة الفاتورة.
     ============================================================ */
  document.body.insertAdjacentHTML('beforeend', `
<div id="ipAsk" style="position:fixed;inset:0;z-index:9500;display:none;
  align-items:center;justify-content:center;background:rgba(6,8,12,.8);backdrop-filter:blur(5px);padding:18px">
  <div style="width:min(400px,94vw);background:var(--panel,#1b1e27);
    border:1px solid var(--border,#2b2f3b);border-radius:18px;padding:22px;
    color:var(--text,#eef0f4);animation:ipPopIn .25s cubic-bezier(.2,.8,.2,1)">
    <div id="ipAskTitle" style="font-size:17px;font-weight:900;margin-bottom:8px"></div>
    <div id="ipAskBody" style="font-size:13px;line-height:1.9;color:var(--muted,#8b90a0);margin-bottom:14px"></div>
    <input id="ipAskInput" style="display:none;width:100%;padding:11px;border-radius:10px;
      border:1px solid var(--border,#2b2f3b);background:var(--panel2,#232733);
      color:var(--text,#eef0f4);font-family:inherit;font-size:13px;margin-bottom:12px">
    <div style="display:flex;gap:8px">
      <button id="ipAskNo" style="flex:1;padding:12px;border-radius:11px;font-family:inherit;
        font-weight:800;font-size:13px;cursor:pointer;background:var(--panel2,#232733);
        color:var(--text,#eef0f4);border:1px solid var(--border,#2b2f3b)">رجوع</button>
      <button id="ipAskYes" style="flex:2;padding:12px;border:none;border-radius:11px;
        font-family:inherit;font-weight:800;font-size:13px;cursor:pointer;
        background:linear-gradient(#16a34a,#15803d);color:#fff">تأكيد</button>
    </div>
  </div></div>`);

  function ipAsk(opt) {
    return new Promise(function (res) {
      const box = $('ipAsk'), inp = $('ipAskInput');
      $('ipAskTitle').textContent = opt.title || '';
      $('ipAskBody').innerHTML = opt.body || '';
      $('ipAskYes').textContent = opt.yes || 'تأكيد';
      inp.style.display = opt.input ? '' : 'none';
      inp.value = ''; inp.placeholder = opt.input || '';
      box.style.display = 'flex';
      if (opt.input) setTimeout(function () { inp.focus(); }, 60);
      function done(v) {
        box.style.display = 'none';
        $('ipAskYes').onclick = null; $('ipAskNo').onclick = null; inp.onkeydown = null;
        res(v);
      }
      $('ipAskYes').onclick = function () { done(opt.input ? { text: inp.value.trim() } : true); };
      $('ipAskNo').onclick = function () { done(null); };
      inp.onkeydown = function (e) { if (e.key === 'Enter') $('ipAskYes').click(); };
    });
  }

  function paint(st) {
    const c = (st && st.checks) || {};
    $('ipP1').classList.toggle('ok', !!c.amount);
    $('ipP2').classList.toggle('ok', !!c.time);
    $('ipP3').classList.toggle('ok', !!c.reference);
    // 🔴 الرابع كان مخفي، والاعتماد مقفول عليه — الكاشير بتشوف
    //    تلاتة خضر والشاشة لسه بتلف من غير ما تعرف الناقص إيه.
    $('ipP4').classList.toggle('ok', !!c.beneficiary);
    const s = st && st.status;
    if (s === 'rejected') {
      // ⛔ رفض نهائي: السبب بالرقم، والكاشير تقرر — إيصال تاني
      //    ولا طريقة دفع تانية. مفيش انتظار.
      $('ipPosSpin').style.display = 'none';
      $('ipPosState').innerHTML = '⛔ ' + (st.hint || 'الإيصال مرفوض');
      $('ipPosManual').style.display = '';
      const ex0 = explain(st);
      $('ipPosWhy').textContent = ex0;
      $('ipPosWhy').style.display = ex0 ? '' : 'none';
      openBox();
      return;
    }
    if (s === 'approved') {
      approved = true;
      $('ipPosSpin').style.display = 'none';
      $('ipPosState').innerHTML = (st.mode === 'manual')
        ? '✍️ اتأكد يدوي — كمّلي الفاتورة'
        : '✅ التحويل اتأكد — كمّلي الفاتورة';
      $('ipPosManual').style.display = 'none';
    } else {
      $('ipPosSpin').style.display = '';
      $('ipPosState').textContent = (st && st.hint) ||
        (s === 'scanning' ? 'العميلة بتمسح الإيصال…' : 'في انتظار العميلة…');
      const ex = explain(st);
      $('ipPosWhy').textContent = ex;
      $('ipPosWhy').style.display = ex ? '' : 'none';
    }
  }

  /* 🩺 سبب الرفض بالأرقام — للكاشير بس.
     ⚠️ من غير ده أول رفض صح بيتحسب عطل: الشاشة بتقول "المبلغ
        مختلف" والكاشير مش عارفة قرا كام ولا المطلوب كام. */
  function explain(st) {
    const d = st && st.detail; if (!d) return '';
    const bits = [];
    if (d.seenCents && d.seenCents.length)
      bits.push('الإيصال: ' + d.seenCents.map(c => (c / 100).toFixed(2)).join(' / '));
    if (d.expectedCents) bits.push('المطلوب: ' + (d.expectedCents / 100).toFixed(2));
    if (d.driftMin != null) bits.push('فرق الوقت: ' + d.driftMin + ' دقيقة');
    if (d.benReason === 'ALIAS_IS_SENDER') bits.push('⚠️ تحويل صادر منك مش وارد');
    if (d.benReason === 'ALIAS_NOT_FOUND') bits.push('⚠️ العنوان مش في الإيصال');
    if (d.ref) bits.push('رقم العملية: ' + d.ref);
    return bits.join(' · ');
  }

  function listen(sid) {
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    const br = window.currentBranch || currentBranch;
    unsub = db.collection('insta_live').doc(br).onSnapshot(function (snap) {
      const d = snap.exists ? snap.data() : null;
      // المستند بيتمسح بعد التثبيت — مش خطأ
      if (!d || d.sid !== sid) return;
      paint(d);
    }, function (e) { console.warn('[instapay] live', e && e.code); });
  }

  function closeBox() { $('ipPosBox').classList.remove('on'); }
  function openBox() { $('ipPosBox').classList.add('on'); }

  /* 🔄 تصفير كامل — بيتنادى مع كل سلة جديدة */
  function resetFlow() {
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    S = null; approved = false; finalizing = false;
    ['ipP1', 'ipP2', 'ipP3'].forEach(i => $(i).classList.remove('ok'));
    $('ipPosManual').style.display = '';
    closeBox();
  }
  window.instaResetFlow = resetFlow;

  /* ============================================================
     ▶️ فتح الطلب — بعد ما الكاشير تأكّد المبلغ
     ============================================================ */
  async function startFlow(amount) {
    const br = window.currentBranch || currentBranch;
    const cents = Math.round(Math.abs(Number(amount) || 0) * 100);
    if (!(cents > 0)) return;
    $('ipPosAmt').textContent = (cents / 100).toFixed(2) + ' ج.م';
    $('ipPosState').textContent = 'بيتبعت للتابلت…';
    openBox();
    try {
      const r = await fnCall('instaPay', { action: 'start', branch: br, amountCents: cents });
      S = { sid: r.sid, cents: cents };
      listen(r.sid);
      $('ipPosState').textContent = 'في انتظار العميلة…';
    } catch (e) {
      const msg = (e && e.message) || 'مشكلة في الاتصال';
      $('ipPosSpin').style.display = 'none';
      $('ipPosState').textContent = '⛔ ' + msg;
      // 🔴 الفرع مش مفعّل أو مفيهوش QR → نشيل إنستاباي من الفاتورة
      //    بدل ما الكاشير تفتكر إن الطلب راح وهو مراحش.
      try {
        if (typeof selectedPayMethods !== 'undefined') selectedPayMethods.delete('instapay');
        if (typeof paymentAmounts !== 'undefined') delete paymentAmounts.instapay;
        const b = document.getElementById('pmInsta');
        if (b) b.classList.remove('selected', 'filled');
        if (typeof updatePaySummary === 'function') updatePaySummary();
      } catch (x) {}
    }
  }

  $('ipPosHide').onclick = closeBox;

  $('ipPosCancel').onclick = async function () {
    if (!S) { resetFlow(); return; }
    const go = await ipAsk({ title: 'إلغاء طلب الانستا باي',
      body: 'الطلب هيتشال من التابلت والفاتورة ترجع من غير انستا باي.', yes: 'إلغاء الطلب' });
    if (!go) return;
    try { await fnCall('instaPay', { action: 'cancel', sid: S.sid }); } catch (e) {
      $('ipPosState').textContent = '⛔ ماتلغاش: ' + ((e && e.message) || '');
      return;
    }
    try {
      if (typeof selectedPayMethods !== 'undefined') selectedPayMethods.delete('instapay');
      if (typeof paymentAmounts !== 'undefined') delete paymentAmounts.instapay;
      const b = document.getElementById('pmInsta');
      if (b) b.classList.remove('selected', 'filled');
      if (typeof updatePaySummary === 'function') updatePaySummary();
    } catch (x) {}
    resetFlow();
  };

  /* ✍️ التأكيد اليدوي — للطوارئ.
     ⚠️ التأكيد بيتسجّل باسم الكاشير وبعلامة manual، وبيفضل
        PENDING_BANK_RECONCILIATION لحد ما تراجع كشف الحساب. */
  $('ipPosManual').onclick = async function () {
    if (!S) return;
    const r = await ipAsk({
      title: '✍️ تأكيد يدوي',
      body: 'اتأكدي إن الإيصال ناجح، والمبلغ والمستفيد صح. التأكيد بيتسجّل باسمك.',
      input: 'السبب (اختياري) — الكاميرا / النت / الإيصال مش واضح',
      yes: 'أكّدي وكمّلي'
    });
    if (!r) return;
    const why = r.text || '';
    $('ipPosManual').disabled = true;
    try {
      await fnCall('instaPay', { action: 'approveManual', sid: S.sid, reason: why });
      approved = true;
      paint({ status: 'approved', mode: 'manual' });
      /* ✅ نقفل اللوحة على طول ونقول للكاشير تكمّل.
         🔴 قبل كده اللوحة كانت بتفضل مفتوحة والمؤشر بيلف، فالكاشير
            مش عارفة إن التأكيد تم وإنها تقدر تحفظ وتطبع دلوقتي. */
      setTimeout(closeBox, 700);
      if (typeof showToast === 'function')
        showToast('✅ اتأكد يدوي — احفظي الفاتورة', 'ok');
    } catch (e) {
      $('ipPosState').textContent = '⛔ ماتمّش: ' + ((e && e.message) || 'مشكلة اتصال');
    }
    $('ipPosManual').disabled = false;
  };

  /* ============================================================
     🪝 التغليف — الربط بـ pos-sale.js من غير ما نلمسه
     ============================================================ */
  const _origConfirmAmt = window.confirmPayAmount;
  window.confirmPayAmount = function () {
    // المتغيّر بيتصفّر جوّه الدالة الأصلية، فبنمسكه قبلها
    const m = (typeof pendingPayMethod !== 'undefined') ? pendingPayMethod : null;
    const val = parseFloat((document.getElementById('payAmountInput') || {}).value) || 0;
    const r = _origConfirmAmt.apply(this, arguments);
    // ✅ بنفتح الطلب **بس** لو الدالة الأصلية قبلت المبلغ فعلًا
    try {
      if (m === 'instapay' && val > 0 && cartTotal() > 0
          && typeof selectedPayMethods !== 'undefined' && selectedPayMethods.has('instapay')) {
        startFlow(val);
      }
    } catch (e) { console.warn('[instapay] hook', e); }
    return r;
  };

  const _origConfirmPay = window.confirmPayment;
  window.confirmPayment = async function () {
    let usingInsta = false;
    try { usingInsta = (typeof selectedPayMethods !== 'undefined') && selectedPayMethods.has('instapay'); } catch (e) {}
    // 🔒 البوابة: فاتورة فيها إنستاباي متأكدش = مفيش حفظ.
    //    ده أهم سطر في الملف — من غيره الكاشير تقدر تحفظ وتطبع
    //    والعميلة ماحوّلتش.
    if (usingInsta && cartTotal() > 0 && !approved) {
      openBox();
      if (typeof showToast === 'function')
        showToast('⛔ الانستا باي لسه ماتأكدش — استني القراءة أو أكّدي يدوي', 'err');
      return;
    }
    const out = await _origConfirmPay.apply(this, arguments);
    // 🔗 تثبيت بعد الحفظ: بيحجز الرقم المرجعي عشان نفس الإيصال
    //    ميتقبلش على فاتورة تانية.
    if (usingInsta && approved && S && !finalizing) {
      finalizing = true;
      const code = window._lastInvoiceCode || '';
      try {
        if (code) await fnCall('instaPay', { action: 'finalize', sid: S.sid, invoiceCode: code });
      } catch (e) {
        // ⚠️ الفاتورة اتحفظت خلاص — مبنرجّعش فيها. بنبلّغ بصوت عالي.
        console.error('[instapay] finalize', e);
        if (typeof showToast === 'function')
          showToast('⚠️ الفاتورة اتحفظت بس تثبيت الانستا باي فشل — بلّغ المالك', 'err');
      }
      resetFlow();
    }
    return out;
  };

  // 🧹 سلة جديدة = طلب قديم يتنسى
  const _origClear = window.clearCart;
  if (typeof _origClear === 'function') {
    window.clearCart = function () { resetFlow(); return _origClear.apply(this, arguments); };
  }

  /* ============================================================
     ⚙️ الإعدادات — بتتحقن جوّه لوحة الأدمن لوحدها
     ⚠️ بتتكتب مباشرة في pos_test_settings (الموظف مسموح له)،
        مش عن طريق دالة. المستند ده مفيهوش أسرار: الـQR والعنوان
        حاجات العميلة شايفاها على الشاشة أصلًا.
     ============================================================ */
  function settingsHtml() {
    return `<div class="ipSet" id="ipSetCard">
      <h4>📱 إعدادات انستا باي — <span id="ipSetBranch"></span></h4>
      <label>تشغيل الميزة في الفرع ده</label>
      <select id="ipSetEnabled">
        <option value="1">مفعّلة</option>
        <option value="0">مقفولة (الفرع مفيهوش تابلت)</option>
      </select>
      <label>عنوان الانستا باي (زي ما هو بالظبط)</label>
      <input id="ipSetAlias" placeholder="zogzog2000@instapay" dir="ltr">
      <label>عناوين إضافية مقبولة (رقم محفظة أو عنوان تاني — افصلهم بفاصلة)</label>
      <input id="ipSetExtra" placeholder="01144155987, name@instapay" dir="ltr">
      <label>اسم المستفيد (بيظهر للعميلة)</label>
      <input id="ipSetBen" placeholder="echarpe — الرحاب">
      <label>مدة قبول الإيصال بالدقايق</label>
      <input id="ipSetWin" type="number" min="1" max="60" value="5">
      <label>سقف القراءة الآلية في الشهر (0 = مفيش سقف)</label>
      <input id="ipSetCap" type="number" min="0" value="1000">
      <label>صورة الـQR بتاعة الفرع</label>
      <input id="ipSetQr" type="file" accept="image/*">
      <div class="prev" id="ipSetPrev"><img id="ipSetPrevImg" alt=""></div>
      <button class="save" id="ipSetSave">حفظ إعدادات انستا باي</button>
      <div id="ipSetMsg" style="font-size:12px;margin-top:8px;min-height:16px"></div>
    </div>`;
  }

  let _qrData = null;

  /* 🖼️ تصغير الصورة قبل الحفظ.
     ⚠️ صورة الموبايل ٣ ميجا، ومستند Firestore سقفه ١ ميجا —
        الحفظ كان هيترفض. وكمان التابلت بينزّلها، فكل كيلو بيتحسب. */
  function shrink(file, cb) {
    const fr = new FileReader();
    fr.onload = function () {
      const img = new Image();
      img.onload = function () {
        const max = 560;
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = function () { cb(null); };
      img.src = fr.result;
    };
    fr.onerror = function () { cb(null); };
    fr.readAsDataURL(file);
  }

  async function loadSettings() {
    const br = window.currentBranch || currentBranch;
    $('ipSetBranch').textContent = br || '—';
    try {
      const s = await db.collection(TEST_SETTINGS).doc(cfgDocId(br)).get();
      const d = s.exists ? s.data() : {};
      $('ipSetEnabled').value = (d.enabled === false) ? '0' : '1';
      $('ipSetAlias').value = d.alias || '';
      $('ipSetExtra').value = (d.extraAliases || []).join(', ');
      $('ipSetBen').value = d.beneficiary || '';
      $('ipSetWin').value = d.windowMin || 5;
      $('ipSetCap').value = (d.monthlyScanCap != null) ? d.monthlyScanCap : 1000;
      if (d.qr) { _qrData = d.qr; $('ipSetPrevImg').src = d.qr; $('ipSetPrev').classList.add('on'); }
    } catch (e) { $('ipSetMsg').textContent = 'ماقدرناش نقرا الإعدادات'; }
  }

  function wireSettings() {
    $('ipSetQr').onchange = function (ev) {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      $('ipSetMsg').textContent = 'بيصغّر الصورة…';
      shrink(f, function (data) {
        if (!data) { $('ipSetMsg').textContent = '⛔ الصورة مش مقروءة'; return; }
        _qrData = data;
        $('ipSetPrevImg').src = data;
        $('ipSetPrev').classList.add('on');
        $('ipSetMsg').textContent = 'الصورة جاهزة — دوس حفظ';
      });
    };
    $('ipSetSave').onclick = async function () {
      const br = window.currentBranch || currentBranch;
      const alias = $('ipSetAlias').value.trim();
      const on = $('ipSetEnabled').value === '1';
      // 🔴 فرع مفعّل من غير عنوان أو QR = طلب بيفشل قدام العميلة.
      //    بنمنعه هنا بدل ما نكتشفه وقت البيع.
      if (on && !alias) { $('ipSetMsg').textContent = '⛔ اكتب عنوان الانستا باي'; return; }
      if (on && !_qrData) { $('ipSetMsg').textContent = '⛔ ارفع صورة الـQR'; return; }
      $('ipSetSave').disabled = true;
      try {
        await db.collection(TEST_SETTINGS).doc(cfgDocId(br)).set({
          enabled: on, alias: alias,
          /* 👥 عناوين إضافية: الفرع ممكن يستقبل على أكتر من حساب
             (عنوان إنستاباي + رقم محفظة). أي واحد فيهم في ناحية
             «إلى» بيعدّي.
             ⚠️ بنشيل المسافات والشرط المائل عشان الرقم اللي الكاشير
                بتكتبه بمسافات ميفشلش المطابقة. */
          extraAliases: $('ipSetExtra').value.split(/[,،\n]/)
            .map(function(x){ return x.trim(); }).filter(Boolean),
          beneficiary: $('ipSetBen').value.trim(),
          windowMin: Math.max(1, +$('ipSetWin').value || 5),
          monthlyScanCap: Math.max(0, +$('ipSetCap').value || 0),
          qr: _qrData || '',
          updatedAt: Date.now()
        }, { merge: true });
        $('ipSetMsg').textContent = '✅ اتحفظ';
      } catch (e) {
        $('ipSetMsg').textContent = '⛔ ماتحفظش: ' + ((e && e.message) || '');
      }
      $('ipSetSave').disabled = false;
    };
  }

  /* 🧩 الحقن في شاشة **الصلاحيات** — جنب إعدادات ماكينة الفيزا
     وبداية يوم الشغل، لأن دي شاشة الإعدادات الفعلية في POS.
     بنحقن بدل ما نعدّل index.html أو pos-reports.js: الشاشة دي
     بتترسم وتتمسح، فبنراقبها وبنعيد الحقن لو الكارت اختفى. */
  function inject() {
    const host = document.getElementById('rolesScreen');
    if (!host) return;
    if (document.getElementById('ipSetCard')) return;
    // الشاشة مقفولة؟ منحقنش — عشان مانقراش الإعدادات من غير داعي
    if (!host.classList.contains('active') && host.offsetParent === null) return;
    host.insertAdjacentHTML('beforeend', settingsHtml());
    wireSettings();
    loadSettings();
  }
  try {
    const host = document.getElementById('rolesScreen');
    if (host) new MutationObserver(inject).observe(host, { childList: true, attributes: true, attributeFilter: ['class', 'style'] });
    setInterval(inject, 1500);
  } catch (e) { console.warn('[instapay] settings inject', e); }

  // 🩺 تشخيص: اكتب instaDiag() في الكونسول
  window.instaText = async function () {
    if (!S) { console.log('مفيش طلب شغال'); return; }
    const d = await db.collection('finance_sessions').doc(S.sid).get();
    const x = d.exists ? d.data() : {};
    console.log('— النص اللي Vision قراه —\n' + (x.lastText || '(لسه مفيش مسح)'));
    console.log('التفاصيل:', x.detail || null);
    console.log('الحقول:', x.checks || null);
  };

  window.instaDiag = function () {
    console.log('الفرع:', window.currentBranch || currentBranch);
    console.log('الطلب:', S ? S.sid : '— مفيش');
    console.log('اتأكد؟', approved ? '✅' : '❌');
    console.log('الاستماع:', unsub ? '✅ شغال' : '❌ واقف');
  };
})();
