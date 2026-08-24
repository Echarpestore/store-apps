/* ============================================================
   💬 chat-staff-ui.js — شات العملاء (جهة الموظفين/المالك)
   ------------------------------------------------------------
   ملف **واحد مشترك** بين POS وOffice — نفس قرار chat-core:
   مصدر واحد، مفيش نسخة تتنسى. بيكتشف بيئته لوحده:
     · POS   → فيه currentBranch/currentEmployee → فلتر "فرعي" افتراضي
     · Office → مفيش → كل الفروع، والإرسال باسم "الإدارة"

   ⚠️ **معزول عن مسار البيع** (نفس قاعدة chat.js): كله جوه try —
      لو أي حاجة هنا وقعت، البيع شغال عادي.
   ⚠️ صفر HTML edits في المضيف غير سطر <script> — الملف بيبني
      الزرار العايم والشاشة بنفسه.
   ⚠️ ممنوع prompt() (Electron §10) — ولا حتى confirm(): الحظر
      بضغطتين (الزرار بيتحول "متأكد؟" لثواني).
   ============================================================ */
'use strict';
(function(){

  var CCOL = 'customer_chat';
  var CST = {
    open: false, activeId: null,
    convs: [], convUnsub: null, msgsUnsub: null,
    filterMine: true, funnelOnly: false, imgData: null, blockArm: 0,
    sending: false,
    // 🧢 بندانة — ألوان مختارة بالترتيب (الترتيب = ترتيب الخانات في
    // الشبكة بعدين، فلازم نحافظ عليه) + نتيجة معاينة باركودها.
    bandSelected: [], bandBcInfo: null
  };

  /* 🎨 لوحة ألوان البندانة — القيمة (v) بالإنجليزي بالظبط زي ما
     hijabTryOn.js بيتوقعها ويستخدمها في البرومبت (نفس قايمة
     COLOR_HEX في photo-core.js حرفيًا — أي إضافة هنا لازم تتضاف
     هناك كمان وإلا الدائرة هتظهر رمادي افتراضي في صفحة العميلة).
     اللابل بالعربي للموظفة بس — مبيتبعتش، القيمة الإنجليزي هي اللي بتتبعت. */
  var CC_BAND_COLORS = [
    { v: 'off-white', l: 'أوف وايت', hex: '#f3ece0' },
    { v: 'white',     l: 'أبيض',     hex: '#f7f5f2' },
    { v: 'black',     l: 'أسود',     hex: '#23211f' },
    { v: 'navy',      l: 'كحلي',     hex: '#1f2a44' },
    { v: 'beige',     l: 'بيج',      hex: '#c9ac86' },
    { v: 'grey',      l: 'رمادي',    hex: '#8c8a86' },
    { v: 'brown',     l: 'بني',      hex: '#6b4a34' },
    { v: 'rose',      l: 'وردي',     hex: '#d8a0a8' },
    { v: 'red',       l: 'أحمر',     hex: '#b83b3b' },
    { v: 'olive',     l: 'زيتوني',   hex: '#6b6f4a' },
    { v: 'green',     l: 'أخضر',     hex: '#4a6b52' },
    { v: 'blue',      l: 'أزرق',     hex: '#3a5a8c' },
    { v: 'mocha',     l: 'موكا',     hex: '#7d5a44' },
    { v: 'cream',     l: 'كريمي',    hex: '#fbf3df' },
    { v: 'burgundy',  l: 'عنابي',    hex: '#6e2436' },
    { v: 'mustard',   l: 'خردلي',    hex: '#c9a233' },
    { v: 'camel',     l: 'جملي',     hex: '#b08a5f' }
  ];
  var CC_BAND_MAX = 3;

  /* ============================================================
     🔌 طبقة البيانات — الملف بيشتغل على compat **و** modular
     ------------------------------------------------------------
     السبب: الملف ده كان مكتوب compat (`db.collection(...)` ·
     `firebase.firestore.FieldValue` · `db.batch()`) وده شغّال في
     POS وOffice. لكن تطبيق الحضور (sales) شغّال **modular**
     (`import { collection, onSnapshot } from 'firebase-firestore.js'`).

     🔴 ليه ماينفعش نحمّل compat جنب modular في sales: هيبقى
        **Firebase app تاني مستقل**، ومفتاح جلسة الدخول بيتخزن باسم
        التطبيق — فالتطبيق التاني بيبقى **مش مسجّل دخول**. وقواعد
        `customer_chat` بتطلب `isStaff()`، يعني الشات كان هيرجع
        permission-denied على طول. (نفس درس عزل الجلسات في §5.)

     ✅ الحل: ٦ عمليات بس، والملف بينادي `CDB` بدل Firestore مباشرة.
        · compat  → `db.collection(...)` زي ما هو
        · modular → دوال متعرّضة على window من `sales-app.js`
     ⚠️ الاكتشاف **وقت النداء** مش وقت التحميل: في sales الدوال
        بتتعرض بعد ما الموديول يشتغل، والملف ده بيتحمّل قبله.
     ============================================================ */
  var CDB = {
    mode: function(){
      // compat: `db` فيه .collection · modular: window.fsQuery متعرّضة
      try{ if(typeof db !== 'undefined' && db && typeof db.collection === 'function') return 'compat'; }catch(e){}
      try{ if(typeof window !== 'undefined' && typeof window.fsChatApi === 'object' && window.fsChatApi) return 'modular'; }catch(e){}
      return null;
    },
    ready: function(){ return CDB.mode() !== null; },

    /* 👂 مستمع المحادثات — نافذة ٣٠ يوم × ٦٠ محادثة */
    watchConvs: function(sinceMs, onData, onErr){
      var m = CDB.mode();
      if(m === 'compat'){
        return db.collection(CCOL)
          .where('lastAt', '>', sinceMs)
          .orderBy('lastAt', 'desc').limit(60)
          .onSnapshot(function(s){
            onData(s.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); }));
          }, onErr);
      }
      if(m === 'modular') return window.fsChatApi.watchConvs(CCOL, sinceMs, onData, onErr);
      return null;
    },

    /* 👂 مستمع الرسايل — آخر ٨٠ رسالة */
    watchMsgs: function(convId, onData, onErr){
      var m = CDB.mode();
      if(m === 'compat'){
        return db.collection(CCOL).doc(convId).collection('messages')
          .orderBy('atMs', 'desc').limit(80)
          .onSnapshot(function(s){
            var arr = [];
            s.forEach(function(d){ arr.push(Object.assign({ id: d.id }, d.data())); });
            onData(arr);
          }, onErr);
      }
      if(m === 'modular') return window.fsChatApi.watchMsgs(CCOL, convId, onData, onErr);
      return null;
    },

    /* ✏️ تعديل مستند المحادثة (دمج) */
    patchConv: function(convId, patch){
      var m = CDB.mode();
      if(m === 'compat') return db.collection(CCOL).doc(convId).set(patch, { merge: true });
      if(m === 'modular') return window.fsChatApi.patchConv(CCOL, convId, patch);
      return Promise.reject(new Error('no firestore'));
    },

    /* 👥 موظفات الفرع — لاختيار "مين بيرد" في sales/office.
       نفس مجموعة `sales_employees` اللي التلات تطبيقات بيقروها. */
    getEmployees: function(branch){
      var m = CDB.mode();
      var b = String(branch || '').trim();
      if(!b) return Promise.resolve([]);
      if(m === 'compat'){
        return db.collection('sales_employees').where('branch', '==', b).get()
          .then(function(s){
            var out = [];
            s.forEach(function(d){
              var n = (d.data() || {}).name;
              if(n) out.push(String(n));
            });
            return out;
          });
      }
      if(m === 'modular' && window.fsChatApi && typeof window.fsChatApi.getEmployees === 'function'){
        return window.fsChatApi.getEmployees('sales_employees', b);
      }
      return Promise.resolve([]);
    },

    /* ⚙️ قراءة مستند إعدادات (نصوص الردود السريعة مثلًا) */
    getSetting: function(docId){
      var m = CDB.mode();
      if(m === 'compat'){
        return db.collection('pos_test_settings').doc(String(docId)).get()
          .then(function(d){ return d.exists ? d.data() : null; });
      }
      if(m === 'modular' && window.fsChatApi && typeof window.fsChatApi.getSetting === 'function'){
        return window.fsChatApi.getSetting('pos_test_settings', String(docId));
      }
      return Promise.resolve(null);
    },

    /* 🔍 قراءة صنف من المخزون بالباركود.
       🔴 السبب: `findByBarcode` عايشة في `pos-sale.js` اللي بيتحمّل في
          **POS بس** — فمعاينة السعر في الشات كانت شغّالة من الكاشير
          وبتقول "مفيش صنف بالكود ده" من sales/office على طول، حتى
          للأكواد الصح. القراءة المباشرة دي بتشتغل في التلاتة. */
    getProduct: function(barcode){
      var m = CDB.mode();
      var bc = String(barcode || '').trim();
      if(!bc) return Promise.resolve(null);
      if(m === 'compat'){
        return db.collection('pos_test_inventory').doc(bc).get()
          .then(function(d){ return d.exists ? Object.assign({ barcode: bc }, d.data()) : null; });
      }
      if(m === 'modular' && window.fsChatApi && typeof window.fsChatApi.getProduct === 'function'){
        return window.fsChatApi.getProduct('pos_test_inventory', bc);
      }
      return Promise.resolve(null);
    },

    /* 📤 إرسال — الرسالة وتحديث المحادثة في **عملية واحدة**
       ⚠️ لازم batch: لو الرسالة اتكتبت والمحادثة ماتحدّثتش، الشارة
          والقايمة بيبقوا غلط والعميلة تفضل شايفة "مفيش رد". */
    sendMessage: function(convId, msg, convPatch){
      var m = CDB.mode();
      if(m === 'compat'){
        var ref = db.collection(CCOL).doc(convId);
        var batch = db.batch();
        batch.set(ref.collection('messages').doc(),
          Object.assign({}, msg, { at: firebase.firestore.FieldValue.serverTimestamp() }));
        batch.set(ref, Object.assign({}, convPatch, {
          unreadCust: firebase.firestore.FieldValue.increment(1)
        }), { merge: true });
        return batch.commit();
      }
      if(m === 'modular') return window.fsChatApi.sendMessage(CCOL, convId, msg, convPatch);
      return Promise.reject(new Error('no firestore'));
    }
  };

  function isPOS(){ return typeof currentBranch !== 'undefined' && currentBranch; }
  function myBranch(){ return isPOS() ? currentBranch : ''; }
  /* 👤 مين بيرد دلوقتي — بيتحفظ محليًا لكل جهاز/فرع.
     🔴 السبب: في sales الدخول بحساب **الفرع** مش بموظفة، وفي office
        بحساب الإدارة — فالتوقيع كان بيطلع "معاكي الرحاب" أو "معاكي
        الإدارة"، وشكله آلي وغريب للعميلة. الاختيار السريع بيخلّي
        التوقيع باسم حقيقي، **وبيجهّز لنقاط البيع** (نعرف مين رد على
        مين لما نحسب النقاط بعدين). */
  var CC_SIGNER_KEY = 'cc_signer_v1';
  function ccSigner(){
    try{ return localStorage.getItem(CC_SIGNER_KEY) || ''; }catch(e){ return ''; }
  }
  function ccSignerSet(name){
    try{
      if(name) localStorage.setItem(CC_SIGNER_KEY, String(name));
      else localStorage.removeItem(CC_SIGNER_KEY);
    }catch(e){}
    ccSignerRender();
    ccQuickRender();   // الردود الجاهزة فيها [اسم] — تتحدّث فورًا
  }
  window.ccSignerSet = ccSignerSet;

  var CC_EMPS = null;   // كاش موظفات الفرع (بيتحمّل مرة)

  function ccSignerRender(){
    var box = document.getElementById('ccSigner');
    if(!box) return;
    if(!conv()){ box.innerHTML = ''; return; }
    var cur = myName();
    var picked = !!ccSigner();
    box.innerHTML = '<span class="ccSgLbl">بترد باسم:</span>'
      + '<button class="ccSgName' + (picked ? ' on' : '') + '" onclick="ccSignerOpen()">'
      + ccEsc(cur) + ' ▾</button>';
  }
  window.ccSignerRender = ccSignerRender;

  /* بيفتح قايمة الأسماء — بيحمّل موظفات الفرع أول مرة بس */
  function ccSignerOpen(){
    var box = document.getElementById('ccSigner');
    if(!box) return;
    if(CC_EMPS){ ccSignerList(box); return; }
    box.innerHTML = '<span class="ccSgLbl">بنجيب الأسامي…</span>';
    var b = '';
    try{ b = (conv() && conv().branch) || (typeof currentBranch !== 'undefined' ? currentBranch : ''); }catch(e){}
    CDB.getEmployees(b).then(function(list){
      CC_EMPS = Array.isArray(list) ? list : [];
      ccSignerList(box);
    }).catch(function(){ CC_EMPS = []; ccSignerList(box); });
  }
  window.ccSignerOpen = ccSignerOpen;

  function ccSignerList(box){
    if(!CC_EMPS.length){
      // مفيش موظفات مسجّلة للفرع — منسيبهاش عالقة
      box.innerHTML = '<span class="ccSgLbl">مفيش أسامي مسجّلة للفرع</span>'
        + '<button class="ccSgName" onclick="ccSignerRender()">رجوع</button>';
      return;
    }
    box.innerHTML = '<span class="ccSgLbl">مين بيرد؟</span>'
      + CC_EMPS.map(function(n){
          return '<button class="ccSgPick" onclick="ccSignerSet(\'' + ccEsc(n).replace(/'/g, "\\'") + '\')">'
            + ccEsc(n) + '</button>';
        }).join('')
      + (ccSigner() ? '<button class="ccSgPick clr" onclick="ccSignerSet(\'\')">إلغاء الاختيار</button>' : '');
  }

  function myName(){
    // ١) اختيار صريح من الموظفة (كل التطبيقات) — بيكسب على أي حاجة
    var picked = ccSigner();
    if(picked) return picked;
    if(!isPOS()) return 'الإدارة';
    // ٢) 🖥️ POS: الكاشير الداخلة بالـPIN — اسمها بالظبط.
    try{ if(currentEmployee && currentEmployee.name) return currentEmployee.name; }catch(e){}
    /* ٣) 🕒 تطبيق الحضور: مفيش `currentEmployee` أصلًا — الدخول بحساب
       الفرع مش بموظفة. فبنوقّع باسم الفرع بدل "الفرع" الجافة، عشان
       العميلة تعرف مين بيكلمها. */
    try{ if(currentBranch) return String(currentBranch); }catch(e){}
    return 'الفرع';
  }
  /* 🔔 توست الشات — **مستقل بذاته**
     🔴 الباج اللي اتمسك قبل التسليم: الملف كان بينادي `showToast`
        بتاعت المضيف. في POS/Office توقيعها `(msg, type)` — تمام.
        لكن في تطبيق الحضور فيه دالة **بنفس الاسم وتوقيع مختلف
        تمامًا**: `showToast(empName)` بتكتب "🎉 +1 نقطة يا <اسم>".
        يعني رسالة خطأ زي "الرد موصلش" كانت هتظهر للموظفة كـ
        «🎉 +1 نقطة يا الرد موصلش».
     ⚠️ الدرس: ملف مشترك ميعتمدش على دالة عامة بالاسم — الاسم ممكن
        يكون محجوز لحاجة تانية خالص في المضيف التاني. */
  function toast(msg, err){
    try{
      var t = document.getElementById('ccToast');
      if(!t){
        t = document.createElement('div');
        t.id = 'ccToast';
        t.style.cssText = 'position:fixed; bottom:22px; left:50%; transform:translateX(-50%);'
          + 'z-index:12900; padding:11px 18px; border-radius:11px; font-family:inherit;'
          + 'font-size:13px; font-weight:700; color:#fff; box-shadow:0 6px 22px rgba(0,0,0,.4);'
          + 'opacity:0; transition:opacity .18s; pointer-events:none; max-width:86vw; text-align:center;';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.background = err ? '#b4232a' : '#15803d';
      t.style.opacity = '1';
      clearTimeout(t._h);
      t._h = setTimeout(function(){ t.style.opacity = '0'; }, 2600);
    }catch(e){ console.warn('cc toast', msg); }
  }
  function esc2(s){ return String(s == null ? '' : s).replace(/[&<>"]/g,
    function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  /* ============================================================
     ١) الحقن — زرار عايم + شاشة
     ============================================================ */
  function inject(){
    if(document.getElementById('ccFab')) return;
    var css = document.createElement('style');
    css.textContent =
      '#ccFab{position:fixed; bottom:86px; left:16px; z-index:70; width:52px; height:52px;'
      + 'border-radius:50%; border:none; background:#C79A38; color:#fff; font-size:23px;'
      + 'box-shadow:0 4px 16px rgba(0,0,0,.3); cursor:pointer;}'
      + '#ccFabBadge{position:absolute; top:-4px; right:-4px; background:#E5484D; color:#fff;'
      + 'border-radius:99px; min-width:20px; height:20px; font-size:11.5px; font-weight:800;'
      + 'display:none; align-items:center; justify-content:center; padding:0 5px;}'
      // 📐 لوحة جانبية بنص الشاشة — مش أوفرلاي كامل.
      //    ⚠️ السبب: الشات كان `inset:0` فبيغطي الفاتورة والسلة، والكاشير
      //       بيقفله عشان يشوف اللي قدامه، فالرد بيتأخر. دلوقتي مرصوص على
      //       الشمال (ناحية الزرار العايم) والبيع فاضل باين على اليمين.
      //    ⚠️ ومفيش طبقة سودة فوق باقي الشاشة — الطبقة دي كانت بتبلع
      //       الضغط على السلة حتى وهي شفافة.
      + '#ccWrap{position:fixed; top:0; bottom:0; inset-inline-start:0; width:50vw;'
      + 'min-width:340px; max-width:620px; z-index:80; background:#14161c; color:#eceef2;'
      + 'display:none; flex-direction:column; font-family:inherit;'
      + 'border-inline-end:1px solid #2a2e39; box-shadow:0 0 34px rgba(0,0,0,.5);}'
      + '#ccWrap.on{display:flex;}'
      // 📱 الشاشات الصغيرة: نص الشاشة مبيبقاش كفاية للكتابة — بيرجع كامل.
      + '@media (max-width:760px){#ccWrap{width:100vw; min-width:0; max-width:none;}}'
      // ↔️ زرار تكبير/تصغير — بعض الشغل (لصق رد طويل) عايز مساحة
      + '#ccWrap.wide{width:100vw; max-width:none;}'
      + '.ccWide{border:none; background:none; color:#9aa1af; font-size:16px;'
      + 'cursor:pointer; padding:4px 6px;}'
      + '.ccHead{display:flex; align-items:center; gap:10px; padding:11px 14px; background:#1b1e26;'
      + 'border-bottom:1px solid #2a2e39; flex-wrap:wrap;}'
      + '.ccHead b{font-size:15px;}'
      + '.ccX{border:none; background:none; color:#eceef2; font-size:21px; cursor:pointer; padding:4px;}'
      + '.ccFilter{margin-inline-start:auto; display:flex; gap:6px;}'
      + '.ccFilter button{border:1px solid #2a2e39; background:none; color:#9aa1af; border-radius:99px;'
      + 'padding:5px 12px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit;}'
      + '.ccFilter button.on{background:#C79A38; border-color:#C79A38; color:#14161c;}'
      + '#ccList{flex:1; overflow-y:auto;}'
      + '.ccConv{display:flex; gap:10px; align-items:center; padding:11px 14px; cursor:pointer;'
      + 'border-bottom:1px solid #20242e;}'
      + '.ccConv:hover{background:#191c24;}'
      + '.ccConv .ci{flex:1; min-width:0;}'
      + '.ccConv .cn{font-weight:800; font-size:14px; display:flex; gap:6px; align-items:center;}'
      + '.ccConv .cl{font-size:12.5px; color:#9aa1af; white-space:nowrap; overflow:hidden;'
      + 'text-overflow:ellipsis; margin-top:2px;}'
      + '.ccConv .ct{font-size:11px; color:#6f7683; text-align:left; flex:0 0 auto;}'
      + '.ccConv .cb{background:#E5484D; color:#fff; border-radius:99px; min-width:20px; height:20px;'
      + 'font-size:11px; font-weight:800; display:inline-flex; align-items:center;'
      + 'justify-content:center; padding:0 5px;}'
      + '.ccChip{font-size:10px; border-radius:99px; padding:1px 7px; font-weight:800;}'
      + '.ccChip.g{background:#333; color:#e8c8ff;} .ccChip.e{background:#3a2b33; color:#f7c8dc;}'
      + '.ccWaitW{color:#f0a020;} .ccWaitL{color:#E5484D;}'
      + '.ccEmpty{padding:40px 20px; text-align:center; color:#6f7683; font-size:13.5px;}'
      + '#ccThread{flex:1; overflow-y:auto; padding:14px 12px; display:none;'
      + 'flex-direction:column; gap:8px;}'
      + '.ccMsg{max-width:82%; border-radius:13px; padding:8px 12px; font-size:13.5px;'
      + 'line-height:1.6; word-break:break-word; white-space:pre-wrap;}'
      + '.ccMsg.st{align-self:flex-start; background:#C79A38; color:#14161c;'
      + 'border-bottom-right-radius:4px;}'
      + '.ccMsg.cu{align-self:flex-end; background:#232733; border-bottom-left-radius:4px;}'
      + '.ccMsg img{max-width:100%; border-radius:9px; display:block; margin-bottom:5px;}'
      + '.ccMsg .mt{display:block; font-size:10px; opacity:.65; margin-top:3px; text-align:left;}'
      + '.ccAuto{align-self:center; background:#20242e; color:#9aa1af; font-size:11.5px;'
      + 'border-radius:99px; padding:4px 13px;}'
      + '#ccSigner{display:flex; align-items:center; gap:7px; overflow-x:auto;'
      + ' padding:8px 12px 0; background:#1b1e26; font-size:12px;}'
      + '#ccSigner:empty{display:none;}'
      + '.ccSgLbl{color:#8b93a7; flex:0 0 auto;}'
      + '.ccSgName{background:#2a2f3a; color:#dfe4ee; border:1px solid #3a4152; border-radius:99px;'
      + ' padding:5px 12px; font-size:12px; font-family:inherit; cursor:pointer; flex:0 0 auto;}'
      + '.ccSgName.on{border-color:#c79a38; color:#f0d79a;}'
      + '.ccSgPick{background:#2a2f3a; color:#dfe4ee; border:1px solid #3a4152; border-radius:99px;'
      + ' padding:5px 12px; font-size:12px; font-family:inherit; cursor:pointer; flex:0 0 auto;}'
      + '.ccSgPick:hover{background:#343b49;}'
      + '.ccSgPick.clr{color:#e88; border-color:#5a3a3a;}'
      + '#ccQuick{display:flex; gap:7px; overflow-x:auto; padding:8px 12px 0; background:#1b1e26;}'
      + '#ccQuick:empty{display:none;}'
      + '.ccQuickChip{flex:0 0 auto; background:#2a2f3a; color:#dfe4ee; border:1px solid #3a4152;'
      + ' border-radius:99px; padding:7px 13px; font-size:12px; font-family:inherit; cursor:pointer;'
      + ' white-space:nowrap; max-width:230px; overflow:hidden; text-overflow:ellipsis;}'
      + '.ccQuickChip:hover{background:#343b49;}'
      + '#ccBar{display:none; gap:8px; padding:9px 12px; background:#1b1e26;'
      + 'border-top:1px solid #2a2e39; align-items:flex-end;}'
      + '#ccText{flex:1; border:1px solid #2a2e39; border-radius:12px; padding:9px 12px;'
      + 'font-family:inherit; font-size:13.5px; resize:none; max-height:90px; outline:none;'
      + 'background:#14161c; color:#eceef2;}'
      + '.ccIco{border:none; background:#232733; color:#eceef2; border-radius:50%; width:40px;'
      + 'height:40px; font-size:17px; cursor:pointer; flex:0 0 auto;}'
      + '.ccIco.send{background:#C79A38; color:#14161c;}'
      + '#ccImgPrev{display:none; padding:8px 12px; background:#1b1e26; gap:10px; align-items:center;}'
      + '#ccImgPrev img{height:54px; border-radius:8px;}'
      + '#ccImgPrev label{font-size:12px; color:#9aa1af; display:flex; gap:5px; align-items:center;}'
      + '#ccBandRow{display:none; gap:8px; padding:6px 12px; background:#1b1e26; align-items:center; flex-wrap:wrap;}'
      + '#ccBandRow input{font-size:12px; padding:6px 8px; border:1px solid #2a2e39; border-radius:8px; background:#14161c; color:#eceef2;}'
      + '.ccBandChip{display:inline-flex; align-items:center; gap:6px; border:1.5px solid #2a2e39;'
      + 'background:#14161c; color:#c7cbd4; border-radius:99px; padding:5px 10px 5px 6px; font-size:11.5px;'
      + 'font-weight:700; cursor:pointer; font-family:inherit;}'
      + '.ccBandChip .dot{width:14px; height:14px; border-radius:50%; flex:0 0 auto; border:1px solid rgba(255,255,255,.25);}'
      + '.ccBandChip.on{border-color:#C79A38; background:rgba(199,154,56,.15); color:#eceef2;}'
      + '#ccBlock{border:1px solid #E5484D; background:none; color:#E5484D; border-radius:99px;'
      + 'padding:4px 11px; font-size:11.5px; font-weight:800; cursor:pointer; font-family:inherit;}';
    document.head.appendChild(css);

    var fab = document.createElement('button');
    fab.id = 'ccFab'; fab.title = 'شات العملاء';
    fab.innerHTML = '💬<span id="ccFabBadge"></span>';
    fab.onclick = openPanel;
    document.body.appendChild(fab);

    var wrap = document.createElement('div');
    wrap.id = 'ccWrap';
    wrap.innerHTML =
      '<div class="ccHead">'
      + '<button class="ccX" onclick="ccBack()">→</button>'
      + '<div><b id="ccTitle">💬 شات العملاء</b>'
      + '<div id="ccSub" style="font-size:11px; color:#9aa1af;"></div></div>'
      + '<div class="ccFilter" id="ccFilterBox">'
      + '<button id="ccFMine" class="on" onclick="ccFilter(true)">فرعي</button>'
      + '<button id="ccFAll" onclick="ccFilter(false)">الكل</button>'
      + '<button id="ccFLead" onclick="ccFunnelFilter()">🔥 فرص البيع</button></div>'
      + '<button id="ccBlock" style="display:none;" onclick="ccBlockToggle()">⛔ حظر</button>'
      + '<button class="ccWide" id="ccWideBtn" onclick="ccWideToggle()" title="كبّر/صغّر">⛶</button>'
      + '</div>'
      + '<div id="ccList"></div>'
      + '<div id="ccThread"></div>'
      + '<div id="ccImgPrev"><img id="ccImgTag" alt="">'
      + '<label><input type="checkbox" id="ccTryFlag" checked style="width:15px;height:15px;"> زرار 🧕 جرّبيها</label>'
      + '<input id="ccTryBc" type="text" inputmode="latin" placeholder="باركود المنتج (للسلة)" oninput="ccTryBcPreview()" style="flex:1; min-width:120px; font-size:12px; padding:6px 8px; border:1px solid #ddd; border-radius:8px;">'
      + '<label><input type="checkbox" id="ccBandFlag" onchange="ccBandToggle()" style="width:15px;height:15px;"> 🧢 بندانة</label>'
      + '<button class="ccIco" onclick="ccImgClear()" title="شيل الصورة">✖</button></div>'
      + '<div id="ccTryBcInfo" style="font-size:11.5px; padding:0 2px; color:#888;"></div>'
      + '<div id="ccBandRow">'
      + '<div id="ccBandChips" style="display:flex; flex-wrap:wrap; gap:6px; flex:1 1 100%;"></div>'
      + '<input id="ccBandBc" type="text" inputmode="latin" placeholder="باركود البندانة" oninput="ccBandBcPreview()" style="flex:1; min-width:100px;">'
      + '</div>'
      + '<div id="ccBandBcInfo" style="font-size:11.5px; padding:0 12px; color:#888;"></div>'
      + ccOutfitPrevHtml()
      + '<div id="ccSigner"></div>'
      + ccQuickHtml()
      + '<div id="ccBar">'
      + '<button class="ccIco" onclick="document.getElementById(\'ccFile\').click()" title="صورة منتج">🖼️</button>'
      + '<button class="ccIco" onclick="ccOutfitToggle()" title="اقتراح طقم (٣ طرح)">🎨</button>'
      + '<textarea id="ccText" rows="1" placeholder="اكتب الرد…" maxlength="500"></textarea>'
      + '<button class="ccIco send" onclick="ccSend()">➤</button>'
      + '</div>'
      + '<input type="file" id="ccFile" accept="image/*" style="display:none;">';
    document.body.appendChild(wrap);
    document.getElementById('ccFile').onchange = onPickImage;
    renderBandChips();   // 🧢 لوحة الألوان جاهزة أول ما الواجهة تتبني
    [0, 1, 2].forEach(function(i){
      document.getElementById('ccOutFile' + i).onchange = function(e){ ccOutfitPick(i, e); };
    });
    if(!isPOS()){
      // Office: مفيش "فرعي" — كل الفروع على طول
      CST.filterMine = false;
      document.getElementById('ccFilterBox').style.display = 'none';
    }
  }

  /* ============================================================
     ٢) مستمع المحادثات — نافذة ٣٠ يوم × ٦٠ محادثة (للشارة كمان)
     ============================================================ */
  function startConvListener(){
    if(CST.convUnsub) return;
    try{
      CST.convUnsub = CDB.watchConvs(Date.now() - 30 * 86400000,
        function(rows){
          CST.convs = rows;
          renderBadge();
          if(CST.open && !CST.activeId) renderList();
          if(CST.open && CST.activeId) renderThreadHead();
        }, function(e){ console.warn('cc convs', e && e.code); });
    }catch(e){ console.warn('cc listen', e); }
  }

  var CC_FUNNEL_RANK={view:1,chat:2,tryon:3,cart:4,checkout:5,order:6,collected:7};
  function ccFunnelHot(c){var r=CC_FUNNEL_RANK[String((c&&c.funnelStage)||'')]||0;return r>=3&&r<6;}
  function visibleConvs(){
    var now=Date.now();
    var out=CST.convs.filter(function(c){
      if(CST.filterMine&&c.branch&&c.branch!==myBranch())return false;
      if(CST.funnelOnly&&!ccFunnelHot(c))return false;
      return true;
    });
    out.sort(function(a,b){
      var ah=ccFunnelHot(a),bh=ccFunnelHot(b),ad=Number(a.followUpDueAt)||0,bd=Number(b.followUpDueAt)||0;
      var ao=ah&&ad&&ad<=now,bo=bh&&bd&&bd<=now;
      if(ao!==bo)return ao?-1:1;if(ah!==bh)return ah?-1:1;
      return(Number(b.lastAt)||0)-(Number(a.lastAt)||0);
    });
    return out;
  }

  function renderBadge(){
    var n = 0;
    visibleConvs().forEach(function(c){ n += Number(c.unreadStaff) || 0; });
    var b = document.getElementById('ccFabBadge');
    if(b){ b.style.display = n ? 'inline-flex' : 'none'; b.textContent = n > 99 ? '99+' : n; }
  }

  /* ============================================================
     ٣) القايمة — بألوان الانتظار من المحرك
     ============================================================ */
  function renderList(){
    var list = document.getElementById('ccList');
    var arr = visibleConvs();
    document.getElementById('ccTitle').textContent = '💬 شات العملاء';
    document.getElementById('ccSub').textContent = '';
    document.getElementById('ccBlock').style.display = 'none';
    document.getElementById('ccThread').style.display = 'none';
    document.getElementById('ccBar').style.display = 'none';
    var _bc = document.getElementById('ccTryBc'); if(_bc) _bc.value = '';
    document.getElementById('ccImgPrev').style.display = 'none';
    list.style.display = 'block';
    if(!arr.length){
      list.innerHTML = '<div class="ccEmpty">مفيش محادثات' +
        (CST.filterMine ? ' لفرعك — جرّب "الكل"' : '') + ' 🌸</div>';
      return;
    }
    var now = Date.now();
    var html = '';
    arr.forEach(function(c){
      var wl = { level: 'ok', mins: 0 };
      try{ wl = chatWaitLevel(c, now); }catch(e){}
      var waitTxt = '';
      if(wl.level === 'warn') waitTxt = '<span class="ccWaitW">⏳ ' + wl.mins + ' دق</span>';
      if(wl.level === 'late') waitTxt = '<span class="ccWaitL">🔥 ' + wl.mins + ' دق</span>';
      var brand = (c.brand === 'glow')
        ? '<span class="ccChip g">Glow</span>' : '<span class="ccChip e">echarpe</span>';
      var t = c.lastAt ? new Date(Number(c.lastAt)).toLocaleTimeString('ar-EG',
                { hour: '2-digit', minute: '2-digit' }) : '';
      html += '<div class="ccConv" onclick="ccOpenConv(\'' + esc2(c.id) + '\')">'
        + '<div class="ci"><div class="cn">' + esc2(c.name || c.phone || c.id) + ' ' + brand
        + (c.blocked === true ? ' <span class="ccChip" style="background:#3a2222;color:#E5484D;">محظورة</span>' : '')
        + (c.branch ? ' <span style="font-size:10.5px;color:#6f7683;">📍' + esc2(c.branch) + '</span>' : '')
        + (c.funnelStage==='tryon'?' <span class="ccChip">🧕 جرّبت</span>':'')
        + (c.funnelStage==='cart'?' <span class="ccChip">🛒 سلة</span>':'')
        + (c.funnelStage==='checkout'?' <span class="ccChip">🔥 إتمام الطلب</span>':'')
        + (c.funnelStage==='order'?' <span class="ccChip">✅ أوردر</span>':'')
        + '</div>'
        + '<div class="cl">' + esc2(c.lastText || '') + ' ' + waitTxt + '</div></div>'
        + '<div class="ct">' + t
        + (Number(c.unreadStaff) > 0 ? '<br><span class="cb">' + c.unreadStaff + '</span>' : '')
        + '</div></div>';
    });
    list.innerHTML = html;
  }

  /* ============================================================
     ٤) المحادثة المفتوحة
     ============================================================ */
  function conv(){ 
    for(var i = 0; i < CST.convs.length; i++)
      if(CST.convs[i].id === CST.activeId) return CST.convs[i];
    return null;
  }

  function ccOpenConv(id){
    CST.activeId = id;
    CST.blockArm = 0;
    document.getElementById('ccList').style.display = 'none';
    document.getElementById('ccThread').style.display = 'flex';
    document.getElementById('ccBar').style.display = 'flex';
    renderThreadHead();
    if(CST.msgsUnsub) CST.msgsUnsub();
    CST.msgsUnsub = CDB.watchMsgs(id, function(rows){
        // ⚠️ الاستعلام تنازلي (أحدث ٨٠) والعرض تصاعدي — العكس هنا
        var arr = rows.slice().reverse();
        CST.msgs = arr;          // ⚡ الردود السريعة بتقرا منها المرحلة
        renderThread(arr);
        ccQuickRender();
        ccSignerRender();
        var c = conv();
        if(c && Number(c.unreadStaff) > 0)
          CDB.patchConv(id, { unreadStaff: 0 }).catch(function(){});
      }, function(e){ console.warn('cc msgs', e && e.code); });
  }

  function renderThreadHead(){
    var c = conv(); if(!c) return;
    document.getElementById('ccTitle').textContent =
      (c.name || c.phone || c.id) + (c.brand === 'glow' ? ' · Glow' : '');
    var _fs={tryon:'🧕 جرّبت منتج',cart:'🛒 أضافت للسلة',checkout:'🔥 وصلت لإتمام الطلب',order:'✅ عملت أوردر'};
    document.getElementById('ccSub').textContent=(c.phone||'')+(c.branch?' · 📍'+c.branch:'')
      +(_fs[c.funnelStage]?' · '+_fs[c.funnelStage]:'')+(c.funnelProductName?' · '+c.funnelProductName:'');
    var bb = document.getElementById('ccBlock');
    bb.style.display = 'inline-block';
    bb.textContent = c.blocked === true ? '✅ فك الحظر' : '⛔ حظر';
  }

  function renderThread(arr){
    var box = document.getElementById('ccThread');
    var html = '';
    arr.forEach(function(m){
      if(m.from === 'auto'){
        html += '<div class="ccAuto">🤖 ' + esc2(m.text || '') + '</div>';
        return;
      }
      var st = m.from !== 'cust';
      var body = '';
      if(m.img && String(m.img).indexOf('data:image/') === 0)
        body += '<img src="' + m.img.replace(/"/g, '') + '" alt="">';
      if(m.text) body += esc2(m.text);
      if(m.tryon) body += ' <span style="font-size:10.5px;opacity:.7;">🧕</span>';
      if(m.bandanaColors && m.bandanaColors.length) body += ' <span style="font-size:10.5px;opacity:.7;">🧢</span>';
      var t = m.atMs ? new Date(Number(m.atMs)).toLocaleTimeString('ar-EG',
                { hour: '2-digit', minute: '2-digit' }) : '';
      html += '<div class="ccMsg ' + (st ? 'st' : 'cu') + '">' + body
        + '<span class="mt">' + (st ? esc2(m.by || '') + ' · ' : '') + t + '</span></div>';
    });
    box.innerHTML = html || '<div class="ccEmpty">لسه مفيش رسايل</div>';
    box.scrollTop = box.scrollHeight;
  }

  /* ============================================================
     ٥) الرد + الصورة + جربيها
     ============================================================ */
  /* 📏 ضغط صورة مشترك — بيتستخدم للصورة الواحدة (900px/650KB) ولخانات
     الطقم التلاتة (700px/280KB لكل واحدة عشان تلات صور ميعدّوش سقف
     مستند Firestore ١ ميجا). */
  function ccCompressImage(file, maxDim, maxBytes, cb){
    var img = new Image();
    img.onload = function(){
      var sc = Math.min(1, maxDim / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var data = c.toDataURL('image/jpeg', 0.8);
      if(data.length > maxBytes){
        data = c.toDataURL('image/jpeg', 0.55);
        if(data.length > maxBytes){
          data = c.toDataURL('image/jpeg', 0.35);
          if(data.length > maxBytes){ cb(null, 'الصورة كبيرة قوي حتى بعد الضغط'); return; }
        }
      }
      cb(data, null);
    };
    img.onerror = function(){ cb(null, 'الصورة مش مقروءة'); };
    img.src = URL.createObjectURL(file);
  }

  function onPickImage(e){
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if(!f) return;
    // 📏 تصغير لـ٩٠٠px وسقف حجم — مستند Firestore ماكسيمم 1MB
    ccCompressImage(f, 900, 650000, function(data, err){
      if(err){ toast(err, true); return; }
      CST.imgData = data;
      document.getElementById('ccImgTag').src = data;
      document.getElementById('ccImgPrev').style.display = 'flex';
    });
  }

  function ccImgClear(){
    CST.imgData = null;
    var _bc = document.getElementById('ccTryBc'); if(_bc) _bc.value = '';
    var _bi = document.getElementById('ccTryBcInfo'); if(_bi) _bi.textContent = '';
    CST.bcInfo = null;
    // 🧢 بندانة مربوطة بنفس صورة المنتج — تتشال معاها عشان مايفضلش
    // باركود/ألوان قديمين عالقين على صورة تانية.
    var _bf = document.getElementById('ccBandFlag'); if(_bf) _bf.checked = false;
    var _br = document.getElementById('ccBandRow'); if(_br) _br.style.display = 'none';
    CST.bandSelected = []; renderBandChips();
    var _bcb = document.getElementById('ccBandBc'); if(_bcb) _bcb.value = '';
    var _bbi = document.getElementById('ccBandBcInfo'); if(_bbi) _bbi.textContent = '';
    CST.bandBcInfo = null;
    document.getElementById('ccImgPrev').style.display = 'none';
  }

  /* 🧢 إظهار/إخفاء صف ألوان وباركود البندانة — بيتمسحوا لو اتقفل
     عشان مايبقاش فيه بيانات مخفية بتتبعت من غير ما الموظفة تشوفها. */
  function ccBandToggle(){
    var on = !!(document.getElementById('ccBandFlag') || {}).checked;
    var row = document.getElementById('ccBandRow');
    if(row) row.style.display = on ? 'flex' : 'none';
    if(!on){
      CST.bandSelected = []; renderBandChips();
      var bi = document.getElementById('ccBandBc'); if(bi) bi.value = '';
      var bbi = document.getElementById('ccBandBcInfo'); if(bbi) bbi.textContent = '';
      CST.bandBcInfo = null;
    }
  }
  window.ccBandToggle = ccBandToggle;

  /* 🎨 لوحة ألوان البندانة — زراير بدل الكتابة. الترتيب اللي بتتضغط
     بيه الألوان هو **نفسه** ترتيب الخانات في الشبكة بعدين (نفس درس
     hijabTryOn.js: الترتيب هو الرابط الوحيد بين الخانة واللون) —
     فبنورّي رقم الترتيب على كل لون متاختار عشان يبقى واضح. */
  function ccBandChipToggle(v){
    var i = CST.bandSelected.indexOf(v);
    if(i >= 0){ CST.bandSelected.splice(i, 1); }
    else{
      if(CST.bandSelected.length >= CC_BAND_MAX){ toast('لحد ' + CC_BAND_MAX + ' ألوان بس', true); return; }
      CST.bandSelected.push(v);
    }
    renderBandChips();
  }
  window.ccBandChipToggle = ccBandChipToggle;

  function renderBandChips(){
    var box = document.getElementById('ccBandChips');
    if(!box) return;
    while(box.firstChild) box.removeChild(box.firstChild);
    CC_BAND_COLORS.forEach(function(c){
      var idx = CST.bandSelected.indexOf(c.v);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ccBandChip' + (idx >= 0 ? ' on' : '');
      b.onclick = function(){ ccBandChipToggle(c.v); };
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = c.hex;
      b.appendChild(dot);
      b.appendChild(document.createTextNode(c.l + (idx >= 0 ? ' (' + (idx + 1) + ')' : '')));
      box.appendChild(b);
    });
  }

  /* 🔍 معاينة باركود البندانة — نفس منطق ccTryBcPreview بالظبط،
     بس لمنتج البندانة نفسه. بدونها الموظفة ممكن تبعت باركود غلط
     وميتأكدش إلا العميلة تشتكي. */
  function ccBandBcPreview(){
    var el = document.getElementById('ccBandBc');
    var info = document.getElementById('ccBandBcInfo');
    if(!el || !info) return;
    var code = String(el.value || '').trim();
    if(!code){ info.textContent = ''; CST.bandBcInfo = null; return; }
    var p = (typeof window.findByBarcode === 'function') ? window.findByBarcode(code, { includeOut: true }) : null;
    if(p){ ccBcInfoShow(info, p); CST.bandBcInfo = Object.assign({ barcode: code }, p); return; }
    info.style.color = '#888'; info.textContent = '…';
    CST.bandBcInfo = null;
    CDB.getProduct(code).then(function(prod){
      if(String((document.getElementById('ccBandBc') || {}).value || '').trim() !== code) return;
      if(!prod){ info.textContent = '❓ مفيش صنف بالكود ده'; info.style.color = '#C0355C'; return; }
      ccBcInfoShow(info, prod);
      CST.bandBcInfo = Object.assign({ barcode: code }, prod);
    }).catch(function(){
      if(String((document.getElementById('ccBandBc') || {}).value || '').trim() !== code) return;
      info.textContent = '';
    });
  }
  window.ccBandBcPreview = ccBandBcPreview;

  /* 💰 معاينة فورية للسعر/الاسم وإحنا بنكتب الباركود — من الكاش المحلي
     (allInventory عن طريق findByBarcode)، من غير أي نداء شبكة. بيبيع
     أي صنف في المحل (سياسة §مبدأ POS نفسه) — مش بس اللي في كتالوج
     البيع أونلاين، فمفيش رفض هنا لصنف حقيقي موجود. */
  function ccTryBcPreview(){
    var el = document.getElementById('ccTryBc');
    var info = document.getElementById('ccTryBcInfo');
    if(!el || !info) return;
    var code = String(el.value || '').trim();
    if(!code){ info.textContent = ''; CST.bcInfo = null; return; }
    // ١) الكاش المحلي (POS بس) — فوري من غير شبكة
    var p = (typeof window.findByBarcode === 'function') ? window.findByBarcode(code, { includeOut: true }) : null;
    if(p){ ccBcInfoShow(info, p); CST.bcInfo = Object.assign({ barcode: code }, p); return; }
    // ٢) مفيش كاش (sales/office) → قراءة مباشرة. بنتأكد إن الكود
    //    ماتغيّرش وإحنا بنستنى الرد، وإلا نتيجة قديمة تظهر لكود جديد.
    info.style.color = '#888'; info.textContent = '…';
    CST.bcInfo = null;
    CDB.getProduct(code).then(function(prod){
      if(String((document.getElementById('ccTryBc') || {}).value || '').trim() !== code) return;
      if(!prod){ info.textContent = '❓ مفيش صنف بالكود ده'; info.style.color = '#C0355C'; return; }
      ccBcInfoShow(info, prod);
      CST.bcInfo = Object.assign({ barcode: code }, prod);
    }).catch(function(){
      if(String((document.getElementById('ccTryBc') || {}).value || '').trim() !== code) return;
      info.textContent = ''; // فشل شبكة ≠ كود غلط — منقولش حاجة مضللة
    });
  }
  function ccBcInfoShow(info, p){
    info.style.color = '#2E7D32';
    info.textContent = '✅ ' + (p.name || 'صنف') + ' — ' + (Number(p.price) || 0) + ' ج.م';
  }
  window.ccTryBcPreview = ccTryBcPreview;

  /* ============================================================
     ⚡ الردود السريعة — بتظهر فوق شريط الكتابة، وبتتغيّر حسب
     **مرحلة المحادثة** (ذكية مش قايمة ثابتة):
       · بداية  → مفيش رد من الموظفة لسه
       · وسط    → المحادثة شغّالة
       · نهاية  → العميلة عندها أوردر/طلب في المحادثة
     النصوص كلها قابلة للتعديل من إعدادات POS:
       pos_test_settings/chat_quick { start:[], mid:[], end:[] }
     ⚠️ [اسم] بيتبدل تلقائي باسم الموظفة اللي شغّالة.
     ============================================================ */
  var CC_QUICK_DEFAULT = {
    start: [
      'أهلاً بيكي في echarpe 🤍\nمعاكي [اسم]، أقدر أساعدك إزاي؟'
    ],
    mid: [
      'شايفة إن الاختيار ده هيكون مناسب جداً، وخصوصاً مع الألوان اللي اختارتيها 🤍\nولو حابة أقدر أوريكي اختيارات تانية قريبة منه.',
      'تحبي أبعتلك صور تانية من نفس النوع؟ 🌸',
      'الطرحة دي متوفرة دلوقتي — تحبي أحجزهالك؟'
    ],
    end: [
      'تمام 🤍 طلبك اتأكد.\nشكراً لاختيارك echarpe، ونتمنى يعجبك جداً لما تستلميه.\nولو احتجتي أي حاجة إحنا موجودين.'
    ]
  };
  var CC_QUICK = CC_QUICK_DEFAULT;

  /* الإعدادات من Firestore (اختياري) — لو مش موجودة نفضل على الافتراضي.
     ⚠️ عن طريق CDB — `db.collection` المباشر بيكسر sales (modular SDK). */
  function ccQuickLoad(){
    if(!CDB.ready()) return;
    var p = CDB.getSetting('chat_quick');
    if(!p || !p.then) return;
    p.then(function(cfg){
      if(!cfg) return;
      ['start','mid','end'].forEach(function(k){
        if(Array.isArray(cfg[k]) && cfg[k].length) CC_QUICK[k] = cfg[k];
      });
      ccQuickRender();
    }).catch(function(){});
  }

  /* 🧠 تحديد المرحلة من الرسايل المعروضة فعلاً */
  function ccQuickStage(){
    var rows = CST.msgs || [];
    if(!rows.length) return 'start';
    var staffReplied = rows.some(function(m){ return m && m.from === 'staff'; });
    if(!staffReplied) return 'start';
    // العميلة ضافت للسلة/طلبت؟ → مرحلة الإنهاء
    var hasOrder = rows.some(function(m){
      return m && (m.barcode || m.outfit === true ||
        (m.text && /طلب|أوردر|هاخد|عايزة اطلب|تمام هاخد/.test(String(m.text))));
    });
    return hasOrder ? 'end' : 'mid';
  }

  function ccQuickHtml(){
    return '<div id="ccQuick"></div>';
  }
  window.ccQuickHtml = ccQuickHtml;

  function ccQuickRender(){
    var box = document.getElementById('ccQuick');
    if(!box) return;
    if(!conv()){ box.innerHTML = ''; return; }
    var list = CC_QUICK[ccQuickStage()] || [];
    if(!list.length){ box.innerHTML = ''; return; }
    box.innerHTML = list.map(function(t, i){
      // أول سطر بس في الشريحة — النص الكامل بيتحط في الكتابة
      var label = String(t).split('\n')[0];
      if(label.length > 42) label = label.slice(0, 42) + '…';
      return '<button class="ccQuickChip" onclick="ccQuickUse(' + i + ')" title="اضغط للاستخدام">'
        + ccEsc(label) + '</button>';
    }).join('');
  }
  window.ccQuickRender = ccQuickRender;

  /* بيحط النص في خانة الكتابة (مش بيبعت على طول) — الموظفة تعدّل
     وتتأكد قبل الإرسال. */
  function ccQuickUse(i){
    var list = CC_QUICK[ccQuickStage()] || [];
    var t = list[i]; if(!t) return;
    var el = document.getElementById('ccText'); if(!el) return;
    el.value = String(t).replace(/\[اسم\]/g, myName() || '');
    el.focus();
    try{ el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }catch(e){}
  }
  window.ccQuickUse = ccQuickUse;
  try{ setTimeout(ccQuickLoad, 1200); }catch(e){}

  function ccEsc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ============================================================
     🎨 اقتراح طقم — لغاية ٣ طرح في رسالة واحدة (image+barcode لكل واحدة)
     مسار منفصل تمامًا عن ccSend/CST.imgData — صفر تداخل مع الإرسال العادي.
     ============================================================ */
  var CST_OUTFIT = { items: [null, null, null] }; // كل عنصر: {img, barcode, name, price} أو null

  function ccOutfitPrevHtml(){
    var rows = [0, 1, 2].map(function(i){
      return '<div style="display:flex; gap:8px; align-items:center;">'
        + '<img id="ccOutImg' + i + '" style="width:38px;height:38px;border-radius:8px;object-fit:cover;display:none;" alt="">'
        + '<button class="ccIco" onclick="document.getElementById(\'ccOutFile' + i + '\').click()" title="صورة">🖼️</button>'
        + '<input type="file" id="ccOutFile' + i + '" accept="image/*" style="display:none;">'
        + '<input id="ccOutBc' + i + '" type="text" inputmode="latin" placeholder="باركود طرحة ' + (i + 1) + '" '
        + 'oninput="ccOutfitBcPreview(' + i + ')" style="flex:1; min-width:100px; font-size:12px; padding:6px 8px; border:1px solid #ddd; border-radius:8px;">'
        + '</div>'
        + '<div id="ccOutInfo' + i + '" style="font-size:11px; color:#888; padding:0 2px 4px;"></div>';
    }).join('');
    return '<div id="ccOutfitPrev" style="display:none; flex-direction:column; gap:6px; padding:10px 12px; background:#1b1e26;">'
      + '<div style="font-size:12px; color:#9aa1af; display:flex; justify-content:space-between; align-items:center;">'
      + '<span>🎨 اقتراح طقم — لغاية ٣ طرح</span>'
      + '<button class="ccIco" onclick="ccOutfitToggle()" title="إلغاء" style="width:24px;height:24px;">✖</button></div>'
      + rows
      + '<button class="ccIco send" onclick="ccOutfitSend()">➤ ابعتي الاقتراح</button>'
      + '</div>';
  }
  window.ccOutfitPrevHtml = ccOutfitPrevHtml;

  function ccOutfitClearSlot(i){
    CST_OUTFIT.items[i] = null;
    var im = document.getElementById('ccOutImg' + i); if(im){ im.style.display = 'none'; im.src = ''; }
    var bc = document.getElementById('ccOutBc' + i); if(bc) bc.value = '';
    var info = document.getElementById('ccOutInfo' + i); if(info) info.textContent = '';
  }

  function ccOutfitToggle(){
    var box = document.getElementById('ccOutfitPrev'); if(!box) return;
    var willOpen = box.style.display !== 'flex';
    box.style.display = willOpen ? 'flex' : 'none';
    if(!willOpen){ [0, 1, 2].forEach(ccOutfitClearSlot); } // إلغاء = تصفير الخانات، مش تسريب لرسالة تانية
  }
  window.ccOutfitToggle = ccOutfitToggle;

  function ccOutfitPick(i, e){
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if(!f) return;
    // 📏 700px/280KB — تلات صور لازم يفضلوا تحت سقف مستند Firestore (١ ميجا)
    ccCompressImage(f, 700, 280000, function(data, err){
      if(err){ toast(err, true); return; }
      if(!CST_OUTFIT.items[i]) CST_OUTFIT.items[i] = {};
      CST_OUTFIT.items[i].img = data;
      var im = document.getElementById('ccOutImg' + i);
      im.src = data; im.style.display = 'block';
    });
  }
  window.ccOutfitPick = ccOutfitPick;

  /* 💰 نفس معاينة السعر اللحظية — بيبيع أي صنف حقيقي في المحل، مفيش
     تقييد على كتالوج البيع أونلاين المنسّق. */
  function ccOutfitBcPreview(i){
    var el = document.getElementById('ccOutBc' + i);
    var info = document.getElementById('ccOutInfo' + i);
    if(!el || !info) return;
    if(!CST_OUTFIT.items[i]) CST_OUTFIT.items[i] = {};
    var code = String(el.value || '').trim();
    if(!code){ info.textContent = ''; CST_OUTFIT.items[i].barcode = null; return; }
    var p = (typeof window.findByBarcode === 'function') ? window.findByBarcode(code, { includeOut: true }) : null;
    if(p){ ccOutfitApply(i, info, code, p); return; }
    // مفيش كاش محلي (sales/office) → قراءة مباشرة (نفس سبب ccTryBcPreview)
    info.style.color = '#888'; info.textContent = '…';
    CST_OUTFIT.items[i].barcode = null;
    CDB.getProduct(code).then(function(prod){
      var cur = String((document.getElementById('ccOutBc' + i) || {}).value || '').trim();
      if(cur !== code) return;   // الكود اتغيّر وإحنا مستنيين
      if(!prod){ info.textContent = '❓ مفيش صنف بالكود ده'; info.style.color = '#C0355C'; return; }
      ccOutfitApply(i, info, code, prod);
    }).catch(function(){
      var cur = String((document.getElementById('ccOutBc' + i) || {}).value || '').trim();
      if(cur === code) info.textContent = '';
    });
  }
  function ccOutfitApply(i, info, code, p){
    info.style.color = '#2E7D32';
    info.textContent = '✅ ' + (p.name || 'صنف') + ' — ' + (Number(p.price) || 0) + ' ج.م';
    CST_OUTFIT.items[i].barcode = code;
    CST_OUTFIT.items[i].name = p.name || 'صنف';
    CST_OUTFIT.items[i].price = Number(p.price) || 0;
    if(p.img) CST_OUTFIT.items[i].prodImg = p.img;   // 🖼️ صورة المنتج للسلة
  }
  window.ccOutfitBcPreview = ccOutfitBcPreview;

  function ccOutfitSend(){
    if(CST.sending) return;
    var c = conv(); if(!c) return;
    var products = [];
    for(var i = 0; i < 3; i++){
      var it = CST_OUTFIT.items[i];
      if(!it || !it.img) continue;                 // خانة فاضية — تتخطاها
      if(!it.barcode){ toast('طرحة ' + (i + 1) + ' محتاجة باركود صح', true); return; }
      products.push({ img: it.img, barcode: it.barcode, name: it.name, price: it.price, productImg: it.prodImg || '' });
    }
    if(!products.length){ toast('اختاري طرحة واحدة على الأقل', true); return; }
    CST.sending = true;
    var ts = Date.now();
    var msg = {
      from: 'staff', by: myName(), atMs: ts, expireAt: chatExpireAt(ts),
      outfit: true, products: products
    };
    var c2 = c;
    CDB.sendMessage(c2.id, msg, {
      lastAt: ts, lastText: '🎨 اقتراح طقم (' + products.length + ' طرح)', lastFrom: 'staff',
      unreadStaff: 0, expireAt: chatExpireAt(ts),
      branch: c2.branch || myBranch() || ''
    }).then(function(){
      ccOutfitToggle();
    }).catch(function(e){
      console.warn('cc outfit send', e);
      toast('الاقتراح ماتبعتش — جرّب تاني', true);
    }).then(function(){ CST.sending = false; });
  }
  window.ccOutfitSend = ccOutfitSend;

  function ccSend(){
    if(CST.sending) return;
    var c = conv(); if(!c) return;
    var textEl = document.getElementById('ccText');
    var text = String(textEl.value || '').trim();
    if(!text && !CST.imgData){ toast('اكتب رد أو حط صورة', true); return; }
    if(text.length > 500){ toast('الرد طويل قوي', true); return; }
    /* 🧢 بندانة — نتحقق **قبل** ما نبدأ الإرسال:
       - لازم لون واحد على الأقل (من الأزرار، مش كتابة يدوي) —
         الباك إند (computeGridCells) بيضيف خانة "بدون بندانة"
         تلقائي فوق أي لون تختاره، فمبقاش محتاج ٢ لون زي الأول.
       - ولازم باركود، **ولازم الباركود ده يطابق صنف حقيقي في
         المخزون** — من غيره "أضيفيها للسلة" هتفشل عند العميلة
         وهي مش هتعرف ليه. أحسن نوقف الموظفة دلوقتي بدل الشكوى بعدين. */
    var _bandOn = !!CST.imgData && !!(document.getElementById('ccBandFlag') || {}).checked;
    var _bandColors = null, _bandBc = '';
    if(_bandOn){
      if(CST.bandSelected.length < 1){
        toast('اختاري لون واحد على الأقل للبندانة', true);
        return;
      }
      _bandColors = CST.bandSelected.slice();
      _bandBc = String((document.getElementById('ccBandBc') || {}).value || '').trim();
      if(!_bandBc){
        toast('حطي باركود البندانة عشان تتضاف للسلة صح', true);
        return;
      }
      var _bandProd = (CST.bandBcInfo && CST.bandBcInfo.barcode === _bandBc) ? CST.bandBcInfo
                     : ((typeof window.findByBarcode === 'function')
                        ? window.findByBarcode(_bandBc, { includeOut: true }) : null);
      if(!_bandProd){
        toast('باركود البندانة مش لاقياه في المخزون — تأكدي منه', true);
        return;
      }
    }
    CST.sending = true;
    var ts = Date.now();
    var msg = {
      from: 'staff', by: myName(), atMs: ts,
      expireAt: chatExpireAt(ts)
    };
    if(text) msg.text = text;
    if(CST.imgData){
      msg.img = CST.imgData;
      msg.tryon = !!document.getElementById('ccTryFlag').checked;
      // 🛍️ باركود المنتج (اختياري) — بيخلّي زر "أضيفيها للسلة" في التجربة يشتغل.
      //    الاسم/السعر بيتاخدوا من **نتيجة المعاينة** (CST.bcInfo) مش من
      //    الكاش المحلي — الكاش موجود في POS بس، فمن sales/office كانت
      //    الرسالة بتتبعت من غير اسم ولا سعر (ولا صورة في السلة).
      if(msg.tryon){
        var _bc = String((document.getElementById('ccTryBc') || {}).value || '').trim();
        if(_bc){
          msg.barcode = _bc;
          var _p = (CST.bcInfo && CST.bcInfo.barcode === _bc) ? CST.bcInfo
                 : ((typeof window.findByBarcode === 'function')
                    ? window.findByBarcode(_bc, { includeOut: true }) : null);
          if(_p){
            msg.productName = _p.name || 'صنف';
            msg.productPrice = Number(_p.price) || 0;
            if(_p.img) msg.productImg = _p.img;   // 🖼️ صورة المنتج للسلة
          }
        }
        // 🧢 بندانة — بتحوّل صفحة التجربة لوضع الشبكة (توليد واحد،
        //    تبديل ألوان مجاني بعد كده). باركودها منتج منفصل عن الطرحة.
        if(_bandColors && _bandColors.length >= 1){
          msg.bandanaColors = _bandColors;
          if(_bandBc) msg.bandanaPid = _bandBc;
        }
      }
    }
    // ⚠️ `at` (طابع السيرفر) و`unreadCust` (increment) بيتحطوا **جوه**
    //    الطبقة — شكلهم مختلف بين compat وmodular.
    CDB.sendMessage(c.id, msg, {
      lastAt: ts, lastText: text || '📷 صورة', lastFrom: 'staff',
      unreadStaff: 0, expireAt: chatExpireAt(ts),
      // 🏢 محادثة من غير فرع بيتبناها أول فرع يرد (Office مبيغيرش)
      branch: c.branch || myBranch() || ''
    }).then(function(){
      textEl.value = '';
      ccImgClear();
    }).catch(function(e){
      console.warn('cc send', e);
      toast('الرد موصلش — جرّب تاني', true);
    }).then(function(){ CST.sending = false; });
  }

  /* ⛔ الحظر بضغطتين — من غير confirm/prompt (قاعدة Electron §10) */
  function ccBlockToggle(){
    var c = conv(); if(!c) return;
    var bb = document.getElementById('ccBlock');
    if(c.blocked !== true && Date.now() - CST.blockArm > 4000){
      CST.blockArm = Date.now();
      bb.textContent = 'متأكد؟ دوس تاني';
      setTimeout(function(){ if(conv()) renderThreadHead(); }, 4000);
      return;
    }
    CDB.patchConv(c.id, { blocked: c.blocked !== true })
      .then(function(){ toast(c.blocked !== true ? 'اتحظرت ⛔' : 'اتفك الحظر ✅'); })
      .catch(function(){ toast('العملية فشلت — الحظر للموظفين بس', true); });
    CST.blockArm = 0;
  }

  /* ============================================================
     ٦) فتح/قفل/فلتر
     ============================================================ */
  function openPanel(){
    CST.open = true;
    CST.activeId = null;
    document.getElementById('ccWrap').classList.add('on');
    ccApplyWidth();
    renderList();
  }
  function ccBack(){
    if(CST.activeId){
      CST.activeId = null;
      if(CST.msgsUnsub){ CST.msgsUnsub(); CST.msgsUnsub = null; }
      ccImgClear();
      renderList();
      return;
    }
    CST.open = false;
    document.getElementById('ccWrap').classList.remove('on');
  }
  /* ↔️ تكبير/تصغير اللوحة — الاختيار بيتحفظ للجهاز */
  function ccWideToggle(){
    var w = document.getElementById('ccWrap');
    if(!w) return;
    var on = !w.classList.contains('wide');
    w.classList.toggle('wide', on);
    try{ localStorage.setItem('cc_wide', on ? '1' : '0'); }catch(e){}
  }
  function ccApplyWidth(){
    var on = false;
    try{ on = localStorage.getItem('cc_wide') === '1'; }catch(e){}
    var w = document.getElementById('ccWrap');
    if(w) w.classList.toggle('wide', on);
  }
  function ccFilter(mine){
    CST.filterMine = mine;
    document.getElementById('ccFMine').classList.toggle('on', mine);
    document.getElementById('ccFAll').classList.toggle('on', !mine);
    renderBadge();
    renderList();
  }

  /* ============================================================
     ٧) الإقلاع — مستني طبقة البيانات تجهز (نفس أسلوب frames.js)
     ------------------------------------------------------------
     ⚠️ في sales الجسر (`window.fsChatApi`) بيتعرض من **موديول**،
        والموديولات بتتحمّل غير متزامنة — يعني الملف ده بيشتغل
        **قبله**. فالانتظار على `CDB.ready()` مش على `db` لوحده.
     ⚠️ والمحاولات **محدودة**: لو الجسر مش موجود خالص (تطبيق مش
        مظبوط)، حلقة لا نهائية كل ٨٠٠مللي بتفضل شغالة للأبد في
        الخلفية. ٢٥ محاولة (٢٠ ثانية) كفاية جدًا، وبعدها بنسيبها
        بسطر واضح في الكونسول بدل الصمت.
     ============================================================ */
  var _bootTries = 0;
  function boot(){
    try{
      if(!CDB.ready()){
        if(++_bootTries > 25){
          console.warn('cc: مفيش طبقة بيانات (لا compat ولا window.fsChatApi) — الشات مقفول');
          return;
        }
        setTimeout(boot, 800); return;
      }
      inject();
      startConvListener();
    }catch(e){ console.warn('cc boot', e); }
  }
  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(boot, 400); });
  else setTimeout(boot, 400);

  // §18
  function ccFunnelFilter(){
    CST.funnelOnly=!CST.funnelOnly;
    var b=document.getElementById('ccFLead');if(b)b.classList.toggle('on',CST.funnelOnly);
    if(CST.open&&!CST.activeId)renderList();
  }
  window.ccFunnelFilter=ccFunnelFilter;
  window.ccOpenConv = ccOpenConv;
  window.ccBack = ccBack;
  window.ccFilter = ccFilter;
  window.ccSend = ccSend;
  window.ccImgClear = ccImgClear;
  window.ccBlockToggle = ccBlockToggle;
  window.ccWideToggle = ccWideToggle;
})();
