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
    filterMine: true, imgData: null, blockArm: 0,
    sending: false
  };

  function isPOS(){ return typeof currentBranch !== 'undefined' && currentBranch; }
  function myBranch(){ return isPOS() ? currentBranch : ''; }
  function myName(){
    if(!isPOS()) return 'الإدارة';
    try{ return (currentEmployee && currentEmployee.name) || 'الفرع'; }catch(e){ return 'الفرع'; }
  }
  function toast(msg, err){
    try{ showToast(msg, err ? 'err' : 'ok'); }
    catch(e){ try{ showToast(msg, !!err); }catch(e2){ console.warn(msg); } }
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
      + '#ccWrap{position:fixed; inset:0; z-index:80; background:#14161c; color:#eceef2;'
      + 'display:none; flex-direction:column; font-family:inherit;}'
      + '#ccWrap.on{display:flex;}'
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
      + '<button id="ccFAll" onclick="ccFilter(false)">الكل</button></div>'
      + '<button id="ccBlock" style="display:none;" onclick="ccBlockToggle()">⛔ حظر</button>'
      + '</div>'
      + '<div id="ccList"></div>'
      + '<div id="ccThread"></div>'
      + '<div id="ccImgPrev"><img id="ccImgTag" alt="">'
      + '<label><input type="checkbox" id="ccTryFlag" checked style="width:15px;height:15px;"> زرار 🧕 جرّبيها</label>'
      + '<button class="ccIco" onclick="ccImgClear()" title="شيل الصورة">✖</button></div>'
      + '<div id="ccBar">'
      + '<button class="ccIco" onclick="document.getElementById(\'ccFile\').click()" title="صورة منتج">🖼️</button>'
      + '<textarea id="ccText" rows="1" placeholder="اكتب الرد…" maxlength="500"></textarea>'
      + '<button class="ccIco send" onclick="ccSend()">➤</button>'
      + '</div>'
      + '<input type="file" id="ccFile" accept="image/*" style="display:none;">';
    document.body.appendChild(wrap);
    document.getElementById('ccFile').onchange = onPickImage;
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
      CST.convUnsub = db.collection(CCOL)
        .where('lastAt', '>', Date.now() - 30 * 86400000)
        .orderBy('lastAt', 'desc').limit(60)
        .onSnapshot(function(s){
          CST.convs = s.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });
          renderBadge();
          if(CST.open && !CST.activeId) renderList();
          if(CST.open && CST.activeId) renderThreadHead();
        }, function(e){ console.warn('cc convs', e && e.code); });
    }catch(e){ console.warn('cc listen', e); }
  }

  function visibleConvs(){
    return CST.convs.filter(function(c){
      if(!CST.filterMine) return true;
      return !c.branch || c.branch === myBranch();
    });
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
    CST.msgsUnsub = db.collection(CCOL).doc(id).collection('messages')
      .orderBy('atMs', 'desc').limit(80)
      .onSnapshot(function(s){
        var arr = [];
        s.forEach(function(d){ arr.push(Object.assign({ id: d.id }, d.data())); });
        arr.reverse();
        renderThread(arr);
        var c = conv();
        if(c && Number(c.unreadStaff) > 0)
          db.collection(CCOL).doc(id).set({ unreadStaff: 0 }, { merge: true }).catch(function(){});
      }, function(e){ console.warn('cc msgs', e && e.code); });
  }

  function renderThreadHead(){
    var c = conv(); if(!c) return;
    document.getElementById('ccTitle').textContent =
      (c.name || c.phone || c.id) + (c.brand === 'glow' ? ' · Glow' : '');
    document.getElementById('ccSub').textContent =
      (c.phone || '') + (c.branch ? ' · 📍' + c.branch : '');
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
  function onPickImage(e){
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if(!f) return;
    var img = new Image();
    img.onload = function(){
      // 📏 تصغير لـ٩٠٠px وسقف حجم — مستند Firestore ماكسيمم 1MB
      var sc = Math.min(1, 900 / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var data = c.toDataURL('image/jpeg', 0.8);
      if(data.length > 650000){
        data = c.toDataURL('image/jpeg', 0.55);
        if(data.length > 650000){ toast('الصورة كبيرة قوي حتى بعد الضغط', true); return; }
      }
      CST.imgData = data;
      document.getElementById('ccImgTag').src = data;
      document.getElementById('ccImgPrev').style.display = 'flex';
    };
    img.onerror = function(){ toast('الصورة مش مقروءة', true); };
    img.src = URL.createObjectURL(f);
  }

  function ccImgClear(){
    CST.imgData = null;
    document.getElementById('ccImgPrev').style.display = 'none';
  }

  function ccSend(){
    if(CST.sending) return;
    var c = conv(); if(!c) return;
    var textEl = document.getElementById('ccText');
    var text = String(textEl.value || '').trim();
    if(!text && !CST.imgData){ toast('اكتب رد أو حط صورة', true); return; }
    if(text.length > 500){ toast('الرد طويل قوي', true); return; }
    CST.sending = true;
    var ts = Date.now();
    var ref = db.collection(CCOL).doc(c.id);
    var msg = {
      from: 'staff', by: myName(), atMs: ts,
      at: firebase.firestore.FieldValue.serverTimestamp(),
      expireAt: chatExpireAt(ts)
    };
    if(text) msg.text = text;
    if(CST.imgData){
      msg.img = CST.imgData;
      msg.tryon = !!document.getElementById('ccTryFlag').checked;
    }
    var batch = db.batch();
    batch.set(ref.collection('messages').doc(), msg);
    batch.set(ref, {
      lastAt: ts, lastText: text || '📷 صورة', lastFrom: 'staff',
      unreadCust: firebase.firestore.FieldValue.increment(1),
      unreadStaff: 0, expireAt: chatExpireAt(ts),
      // 🏢 محادثة من غير فرع بيتبناها أول فرع يرد (Office مبيغيرش)
      branch: c.branch || myBranch() || ''
    }, { merge: true });
    batch.commit().then(function(){
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
    db.collection(CCOL).doc(c.id)
      .set({ blocked: c.blocked !== true }, { merge: true })
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
  function ccFilter(mine){
    CST.filterMine = mine;
    document.getElementById('ccFMine').classList.toggle('on', mine);
    document.getElementById('ccFAll').classList.toggle('on', !mine);
    renderBadge();
    renderList();
  }

  /* ============================================================
     ٧) الإقلاع — مستني db يجهز (نفس أسلوب frames.js)
     ============================================================ */
  function boot(){
    try{
      if(typeof db === 'undefined' || !db){ setTimeout(boot, 800); return; }
      inject();
      startConvListener();
    }catch(e){ console.warn('cc boot', e); }
  }
  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(boot, 400); });
  else setTimeout(boot, 400);

  // §18
  window.ccOpenConv = ccOpenConv;
  window.ccBack = ccBack;
  window.ccFilter = ccFilter;
  window.ccSend = ccSend;
  window.ccImgClear = ccImgClear;
  window.ccBlockToggle = ccBlockToggle;
})();
