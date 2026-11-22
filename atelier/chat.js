/* ============================================================
   💬 chat.js — شات echarpe على الموقع (زائرة من غير حساب)
   ------------------------------------------------------------
   · منقول من شات الصفحة الرئيسية القديمة: **نفس** كوليكشن الشات اللي
     الموظفة شايفاه في POS (customer_chat/<phone>/messages) ونفس
     قواعد pos/chat-core.js (ساعات العمل/الرد الآلي/التحقق).
   · الاسم والرقم بيتاخدوا مرة واحدة ويتحفظوا على جهاز العميلة.
   · لو الدخول للشات مش متاح (Firebase رفض) بنعرض واتساب بدل ما
     الزرار يبقى ميت.
   · الملف بيحقن الـCSS والـHTML بتوعه — الصفحة تحمّله وخلاص.
   ============================================================ */
(function () {
  "use strict";
  var EMBED = /(?:^|[?&])embed=1(?:&|$)/.test(location.search) ||
    (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  if (EMBED) return;                       // جوّه التطبيق: الشات بتاع التطبيق نفسه

  var BASE = (function () { try { return new URL(".", document.currentScript.src).href; } catch (e) { return ""; } })();
  var EN = window.AtelierLang === "en";
  function tr(ar, en) { return EN ? en : ar; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  var COL_CHAT = "customer_chat";
  var LS_NAME = "ws_chat_name", LS_PHONE = "ws_chat_phone";
  var CHAT_MAX_IMG_DIM = 1024;
  var WA_DEFAULT = "201148664485";
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 5.94 2 10.8c0 2.76 1.44 5.22 3.7 6.82-.12 1.06-.5 2.4-1.5 3.68a.5.5 0 0 0 .5.8c2.02-.4 3.6-1.28 4.6-1.98.87.22 1.78.34 2.7.34 5.52 0 10-3.94 10-8.8S17.52 2 12 2z"/></svg>';

  var css = ''
    + '.cw-fab{position:fixed; z-index:66; inset-inline-start:16px; bottom:calc(92px + env(safe-area-inset-bottom)); display:flex; align-items:center; gap:9px;'
    + ' height:50px; padding:0 20px 0 16px; border:0; border-radius:999px; background:var(--rose,#d6336c); color:#fff; font:600 14.5px/1 var(--sans,system-ui,sans-serif);'
    + ' cursor:pointer; box-shadow:0 12px 28px -8px rgba(214,51,108,.6); transition:transform .25s, opacity .25s;}'
    + '.cw-fab svg{width:22px; height:22px; fill:#fff; flex:none;}'
    + '.cw-fab:active{transform:scale(.96);}'
    + '.cw-fab .cw-dot{position:absolute; top:-4px; inset-inline-end:-2px; min-width:20px; height:20px; padding:0 5px; border-radius:10px; background:var(--ink,#191715); color:#fff; font-size:11px; font-weight:700; display:none; align-items:center; justify-content:center; border:2px solid #fff;}'
    + '.cw-fab .cw-dot.on{display:flex;}'
    + '.cw-fab:not(.show), body.intro-on .cw-fab, body.cw-on .cw-fab, body.sty-on .cw-fab{transform:scale(0); opacity:0; pointer-events:none;}'
    + '@media (min-width:900px){ .cw-fab{bottom:24px; inset-inline-start:24px;} }'
    + '.cw-panel{position:fixed; z-index:210; inset:0; background:#fff; display:none; flex-direction:column; font-family:var(--sans,system-ui,sans-serif); color:var(--ink,#191715);}'
    + '.cw-panel.on{display:flex;}'
    + '@media (min-width:700px){ .cw-panel{inset:auto; inset-inline-start:24px; bottom:24px; width:390px; height:min(640px,calc(100vh - 48px)); border-radius:18px; overflow:hidden; box-shadow:0 30px 80px -20px rgba(0,0,0,.45); border:1px solid var(--hair,#e4e0db);} }'
    + '.cw-head{display:flex; align-items:center; justify-content:space-between; gap:12px; padding:calc(14px + env(safe-area-inset-top)) 18px 14px; background:var(--ink,#191715); color:#fff;}'
    + '.cw-t{font-size:16px; font-weight:600;} .cw-s{font-size:12px; opacity:.72; margin-top:4px; line-height:1.5;}'
    + '.cw-head button{width:36px; height:36px; flex:none; border:0; border-radius:50%; background:rgba(255,255,255,.14); color:#fff; font-size:15px; cursor:pointer;}'
    + '.cw-outfit-cta{margin:12px 14px 0; padding:12px; border:1px solid var(--hair,#e4e0db); border-radius:12px; background:var(--stone,#f4f2ef); color:var(--ink,#191715); font:600 13.5px/1.3 inherit; cursor:pointer;}'
    + '.cw-body{flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:8px; background:#fff;}'
    + '.cw-welcome{margin:auto; text-align:center; font-size:14px; line-height:1.9; color:var(--ink-2,#4b4743); padding:20px;}'
    + '.cw-welcome b{display:block; font-size:17px; color:var(--ink,#191715); margin-bottom:4px;}'
    + '.cw-msg{max-width:82%; padding:10px 13px; border-radius:16px; font-size:14px; line-height:1.7; white-space:pre-wrap; word-break:break-word;}'
    + '.cw-msg.cust{align-self:flex-start; background:var(--ink,#191715); color:#fff; border-end-start-radius:5px;}'
    + '.cw-msg.staff,.cw-msg.auto{align-self:flex-end; background:var(--stone,#f4f2ef); border-end-end-radius:5px;}'
    + '.cw-msg.auto{font-size:13px; color:var(--ink-2,#4b4743);}'
    + '.cw-msg img{display:block; max-width:100%; border-radius:10px; margin-top:4px;}'
    + '.cw-try{margin-top:8px; padding:9px 14px; border:0; border-radius:999px; background:var(--rose,#d6336c); color:#fff; font:600 13px/1 inherit; cursor:pointer;}'
    + '.cw-outfit-wrap{display:flex; gap:8px; overflow-x:auto; margin-bottom:6px;}'
    + '.cw-outfit-card{flex:0 0 150px; background:#fff; border:1px solid var(--hair,#e4e0db); border-radius:12px; padding:8px; color:var(--ink,#191715);}'
    + '.cw-outfit-card img{width:100%; aspect-ratio:3/4; object-fit:cover; margin:0;}'
    + '.oc-name{font-size:12.5px; font-weight:600; margin-top:6px;} .oc-price{font-size:12px; color:var(--muted,#8a847e);}'
    + '.oc-btns{display:grid; gap:5px; margin-top:6px;} .oc-btns button{padding:8px; border:0; border-radius:8px; font:600 12px/1 inherit; cursor:pointer;}'
    + '.oc-try{background:var(--stone,#f4f2ef); color:var(--ink,#191715);} .oc-buy{background:var(--ink,#191715); color:#fff;}'
    + '.cw-gate,.cw-off{padding:18px 18px calc(22px + env(safe-area-inset-bottom)); border-top:1px solid var(--hair,#e4e0db); display:none;}'
    + '.cw-gate h3,.cw-off h3{font-size:16px; font-weight:600;} .cw-gate p,.cw-off p{font-size:13px; color:var(--muted,#8a847e); margin:6px 0 12px; line-height:1.7;}'
    + '.cw-gate input{display:block; width:100%; padding:13px 14px; margin-bottom:8px; border:1px solid var(--hair,#e4e0db); border-radius:10px; font:16px/1.2 inherit; background:#fff; color:inherit;}'
    + '.cw-gate button,.cw-off a{display:block; width:100%; padding:14px; border:0; border-radius:10px; background:var(--ink,#191715); color:#fff; font:600 15px/1 inherit; cursor:pointer; text-align:center; text-decoration:none;}'
    + '.cw-off a.wa{background:#25D366; margin-bottom:8px;}'
    + '.cw-err{display:none; margin:0 14px 8px; padding:9px 12px; border-radius:10px; background:#fdecef; color:#a3173f; font-size:13px;} .cw-err.on{display:block;}'
    + '.cw-imgprev{display:none; align-items:center; gap:10px; padding:8px 14px; border-top:1px solid var(--hair,#e4e0db); font-size:12.5px; color:var(--muted,#8a847e);}'
    + '.cw-imgprev.on{display:flex;} .cw-imgprev img{width:44px; height:44px; object-fit:cover; border-radius:8px;} .cw-imgprev span{flex:1;} .cw-imgprev button{border:0; background:none; font-size:15px; cursor:pointer; color:inherit;}'
    + '.cw-inputbar{display:none; align-items:center; gap:8px; padding:10px 12px calc(10px + env(safe-area-inset-bottom)); border-top:1px solid var(--hair,#e4e0db);}'
    + '.cw-inputbar input[type=text]{flex:1; min-width:0; padding:12px 14px; border:1px solid var(--hair,#e4e0db); border-radius:999px; font:16px/1.2 inherit; background:var(--stone,#f4f2ef); color:inherit;}'
    + '.cw-att,.cw-send{width:42px; height:42px; flex:none; border:0; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer;}'
    + '.cw-att{background:var(--stone,#f4f2ef);} .cw-att svg{width:20px; height:20px; fill:var(--ink-2,#4b4743);}'
    + '.cw-send{background:var(--rose,#d6336c);} .cw-send svg{width:19px; height:19px; fill:#fff;} [dir="rtl"] .cw-send svg{transform:scaleX(-1);}'
    + '.cw-send:disabled{opacity:.5;}'
    + '.img-zoom-wrap{position:fixed; inset:0; z-index:300; background:rgba(0,0,0,.9); display:none; align-items:center; justify-content:center; padding:16px;}'
    + '.img-zoom-wrap.on{display:flex;} .img-zoom-wrap img{max-width:100%; max-height:100%; border-radius:8px;}'
    + '.img-zoom-x{position:absolute; top:calc(14px + env(safe-area-inset-top)); inset-inline-end:14px; width:40px; height:40px; border:0; border-radius:50%; background:rgba(255,255,255,.18); color:#fff; font-size:16px; cursor:pointer;}';
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var WELCOME = '<div class="cw-welcome"><b>' + tr("أهلاً بيكي 👋", "Hello 👋") + '</b>'
    + tr("قوليلنا عايزة إيه واطلبي طرحتك من هنا، أو ابعتيلنا صورة طقمك وهنختارلك الطرحة المناسبة 🧕✨",
      "Tell us what you’re looking for and order right here, or send a photo of your outfit and we’ll pick the hijab that suits it 🧕✨") + '</div>';

  var host = document.createElement("div");
  host.innerHTML = ''
    + '<button class="cw-fab" id="cwLauncher" type="button">' + ICON + '<span>' + tr("اطلبي من الشات", "Order in chat") + '</span><b class="cw-dot" id="cwDot">0</b></button>'
    + '<div class="cw-panel" id="cwPanel" role="dialog" aria-label="' + tr("الشات مع echarpe", "Chat with echarpe") + '">'
    + '<div class="cw-head"><div><div class="cw-t">' + tr("اطلبي من الشات", "Order in chat") + '</div><div class="cw-s" id="cwStatus">' + tr("بنرد بسرعة", "We reply fast") + '</div></div>'
    + '<button id="cwClose" type="button" aria-label="' + tr("قفل", "Close") + '">✕</button></div>'
    + '<button class="cw-outfit-cta" id="cwOutfitCta" type="button">' + tr("🧥 اختاري طرحة لطقمك ✨", "🧥 Match a hijab to your outfit ✨") + '</button>'
    + '<div class="cw-body" id="cwBody">' + WELCOME + '</div>'
    + '<div class="cw-err" id="cwErr" role="status"></div>'
    + '<div class="cw-gate" id="cwGate"><h3>' + tr("قبل ما نبدأ 🌸", "Before we start 🌸") + '</h3><p>' + tr("محتاجين اسمك ورقمك عشان نقدر نرد عليكي", "We need your name and number so we can reply") + '</p>'
    + '<input type="text" id="cwGateName" autocomplete="name" placeholder="' + tr("اسمك", "Your name") + '">'
    + '<input type="tel" inputmode="numeric" id="cwGatePhone" autocomplete="tel" placeholder="' + tr("رقم موبايلك", "Mobile number") + ' (01xxxxxxxxx)">'
    + '<button id="cwGateBtn" type="button">' + tr("ابدئي المحادثة", "Start chatting") + '</button></div>'
    + '<div class="cw-off" id="cwOff"><h3>' + tr("كلمينا على واتساب 🤍", "Message us on WhatsApp 🤍") + '</h3><p>' + tr("الشات هنا مش متاح دلوقتي — ابعتيلنا على واتساب وهنرد عليكي على طول.", "Chat isn’t available here right now — message us on WhatsApp and we’ll reply right away.") + '</p>'
    + '<a class="wa" id="cwOffWa" target="_blank" rel="noopener">' + tr("افتحي واتساب", "Open WhatsApp") + '</a></div>'
    + '<div class="cw-imgprev" id="cwImgPrev"><img id="cwImgPrevImg" alt=""><span>' + tr("صورة جاهزة للإرسال", "Photo ready to send") + '</span><button id="cwImgClear" type="button">✖</button></div>'
    + '<div class="cw-inputbar" id="cwInputbar"><label class="cw-att" for="cwFile"><svg viewBox="0 0 24 24"><path d="M4 5h3l1.5-2h7L17 5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z"/></svg></label>'
    + '<input type="file" id="cwFile" accept="image/*" hidden>'
    + '<input type="text" id="cwText" placeholder="' + tr("اكتبي رسالتك…", "Type your message…") + '">'
    + '<button class="cw-send" id="cwSend" type="button" aria-label="' + tr("إرسال", "Send") + '"><svg viewBox="0 0 24 24"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg></button></div>'
    + '</div>';
  while (host.firstChild) document.body.appendChild(host.firstChild);

  // قواعد الشات المشتركة (ساعات العمل/الرد الآلي/التحقق)
  if (BASE && !window.chatValidate) { var cs = document.createElement("script"); cs.src = BASE + "../pos/chat-core.js"; document.head.appendChild(cs); }

  var cwPhone = "", cwName = "", cwConv = null;
  var cwMsgsUnsub = null, cwConvUnsub = null, cwImgData = null, cwSending = false;
  var cwMsgImgs = {}, cwMsgBarcodes = {}, cwMsgOutfits = {};

  function fb() { return window.firebase && firebase.apps && firebase.apps.length ? firebase : null; }
  function cwDb() { return firebase.firestore(); }
  function waHref() {
    return "https://wa.me/" + WA_DEFAULT + "?text=" + encodeURIComponent(tr("أهلاً echarpe 🤍 عايزة أطلب طرحة", "Hello echarpe 🤍 I’d like to order a hijab"));
  }
  var errT = 0;
  function cwErr(msg) {
    var e = $("cwErr"); e.textContent = msg; e.classList.add("on");
    clearTimeout(errT); errT = setTimeout(function () { e.classList.remove("on"); }, 4200);
  }

  /* الشات محتاج دخول (مجهول كفاية). لو مفيش → نحاول، ولو اترفض نرجّع false */
  function ensureAuth() {
    var f = fb(); if (!f || !f.auth) return Promise.resolve(false);
    if (f.auth().currentUser) return Promise.resolve(true);
    return new Promise(function (res) {
      var done = false, fin = function (v) { if (!done) { done = true; res(v); } };
      var off = f.auth().onAuthStateChanged(function (u) {
        if (u) { off(); fin(true); return; }
        f.auth().signInAnonymously().then(function () { fin(true); }).catch(function () { fin(false); });
      });
      setTimeout(function () { fin(!!f.auth().currentUser); }, 7000);
    });
  }

  function show(which) {                    // gate | chat | off
    $("cwGate").style.display = which === "gate" ? "block" : "none";
    $("cwOff").style.display = which === "off" ? "block" : "none";
    $("cwInputbar").style.display = which === "chat" ? "flex" : "none";
    $("cwOutfitCta").style.display = which === "off" ? "none" : "";
  }

  function cwOpen() {
    $("cwPanel").classList.add("on"); document.body.classList.add("cw-on");
    cwUpdateBadge(true);
    try { cwName = localStorage.getItem(LS_NAME) || ""; cwPhone = localStorage.getItem(LS_PHONE) || ""; } catch (e) { }
    show(cwPhone ? "chat" : "gate");
    ensureAuth().then(function (ok) {
      if (!$("cwPanel").classList.contains("on")) return;
      if (!ok) { $("cwOffWa").href = waHref(); show("off"); return; }
      if (cwPhone) cwConnect();
    });
  }
  function cwClose() {
    $("cwPanel").classList.remove("on"); document.body.classList.remove("cw-on");
    if (cwMsgsUnsub) { cwMsgsUnsub(); cwMsgsUnsub = null; }
    if (cwConvUnsub) { cwConvUnsub(); cwConvUnsub = null; }
  }
  function cwUpdateBadge(clear) {
    var n = clear ? 0 : ((cwConv && Number(cwConv.unreadCust)) || 0), d = $("cwDot");
    d.textContent = n; d.classList.toggle("on", n > 0);
  }
  function cwStatusText() {
    if (cwConv && cwConv.blocked === true) return tr("مش متاح", "Unavailable");
    return (window.chatIsOpen && window.chatIsOpen(Date.now()))
      ? tr("متواجدين دلوقتي — بنرد في دقايق 🌸", "We’re online — replies in minutes 🌸")
      : tr("بنرد من ١٠ الصبح لـ١٠ بالليل 🌸 سيبي رسالتك وأول ما نفتح نرد عليكي", "We reply 10am–10pm 🌸 Leave a message and we’ll get back to you");
  }

  function cwGateSubmit() {
    var n = ($("cwGateName").value || "").trim();
    var p = ($("cwGatePhone").value || "").replace(/\s|-/g, "");
    if (n.length < 2) { cwErr(tr("اكتبي اسمك", "Please enter your name")); return; }
    if (!/^01[0-9]{9}$/.test(p)) { cwErr(tr("رقم الموبايل غلط (01xxxxxxxxx)", "Please check your mobile number (01xxxxxxxxx)")); return; }
    cwName = n; cwPhone = p;
    try { localStorage.setItem(LS_NAME, cwName); localStorage.setItem(LS_PHONE, cwPhone); } catch (e) { }
    show("chat"); cwConnect();
    setTimeout(function () { try { $("cwText").focus(); } catch (e) { } }, 50);
  }

  function cwConnect() {
    if (!fb() || !firebase.auth().currentUser) return;
    if (cwConvUnsub) cwConvUnsub();
    cwConvUnsub = cwDb().collection(COL_CHAT).doc(cwPhone).onSnapshot(function (doc) {
      cwConv = doc.exists ? doc.data() : null;
      cwUpdateBadge($("cwPanel").classList.contains("on"));
      $("cwStatus").textContent = cwStatusText();
    }, function () { });
    if (cwMsgsUnsub) cwMsgsUnsub();
    // ⚠️ نافذة محدودة مش مستمع مفتوح — limit(80) بالأحدث (نفس التطبيق)
    cwMsgsUnsub = cwDb().collection(COL_CHAT).doc(cwPhone).collection("messages")
      .orderBy("atMs", "desc").limit(80)
      .onSnapshot(function (snap) {
        var arr = [];
        snap.forEach(function (d) { arr.push(Object.assign({ id: d.id }, d.data())); });
        arr.reverse(); cwRenderMsgs(arr);
        if (cwConv && Number(cwConv.unreadCust) > 0) {
          cwDb().collection(COL_CHAT).doc(cwPhone).set({ unreadCust: 0 }, { merge: true }).catch(function () { });
        }
      }, function () { });
  }

  function cwRenderMsgs(arr) {
    var body = $("cwBody");
    if (!arr.length) { body.innerHTML = WELCOME; return; }
    cwMsgOutfits = {};
    body.innerHTML = arr.map(function (m) {
      var cls = m.from === "cust" ? "cust" : (m.from === "auto" ? "auto" : "staff");
      var html = '<div class="cw-msg ' + cls + '">';
      if (m.outfit === true && Array.isArray(m.products) && m.products.length) {
        var prods = m.products.filter(function (p) { return p && p.img && String(p.img).indexOf("data:image/") === 0; }).slice(0, 3);
        cwMsgOutfits[m.id] = prods;
        html += '<div class="cw-outfit-wrap">' + prods.map(function (p, idx) {
          return '<div class="cw-outfit-card">'
            + '<img src="' + esc(p.img) + '" alt="" data-zoom>'
            + '<div class="oc-name">' + esc(p.name || tr("طرحة", "Hijab")) + '</div>'
            + '<div class="oc-price">' + (Number(p.price) || 0) + tr(" ج.م", " EGP") + '</div>'
            + '<div class="oc-btns">'
            + '<button class="oc-try" type="button" data-otry="' + esc(m.id) + '" data-i="' + idx + '">' + tr("🧕 جربيها عليكي", "🧕 Try it on") + '</button>'
            + '<button class="oc-buy" type="button" data-obuy="' + esc(m.id) + '" data-i="' + idx + '">' + tr("🛍️ اطلبيها", "🛍️ Order it") + '</button>'
            + '</div></div>';
        }).join("") + '</div>';
      }
      if (m.text) html += esc(m.text);
      if (m.img) {
        html += '<img src="' + esc(m.img) + '" alt="" data-zoom>';
        if (m.tryon) html += '<br><button class="cw-try" type="button" data-try="' + esc(m.id) + '">' + tr("🧕 جرّبيها ✨", "🧕 Try it on ✨") + '</button>';
      }
      return html + '</div>';
    }).join("");
    body.scrollTop = body.scrollHeight;
    arr.forEach(function (m) {
      if (m.img) cwMsgImgs[m.id] = m.img;
      if (m.barcode) cwMsgBarcodes[m.id] = String(m.barcode);
    });
  }

  /* 🧕 تجربة صورة من الشات — نفس جسر صفحة التجربة */
  function openTryOn(img, barcode) {
    if (!img) return;
    try {
      sessionStorage.setItem("echarpe_tryon_img", img);
      sessionStorage.setItem("echarpe_tryon_phone", cwPhone || "");
      if (barcode) sessionStorage.setItem("echarpe_tryon_pid", barcode); else sessionStorage.removeItem("echarpe_tryon_pid");
    } catch (e) { }
    window.open(BASE + "../tryon/photo.html?brand=site", "_blank");
  }

  var _cwOutfitIntent = false;
  function cwOutfitCta() {
    if (!cwPhone) { cwErr(tr("اكتبي اسمك ورقمك الأول", "Enter your name and number first")); return; }
    _cwOutfitIntent = true; $("cwFile").click();
  }
  function cwPickImg() {
    var f = $("cwFile").files && $("cwFile").files[0];
    $("cwFile").value = "";
    if (!f || String(f.type || "").indexOf("image/") !== 0) return;
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () {
      var m = Math.max(img.naturalWidth, img.naturalHeight);
      var scale = m > CHAT_MAX_IMG_DIM ? (CHAT_MAX_IMG_DIM / m) : 1;
      var c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      cwImgData = c.toDataURL("image/jpeg", .82);
      URL.revokeObjectURL(url);
      $("cwImgPrevImg").src = cwImgData; $("cwImgPrev").classList.add("on");
      if (_cwOutfitIntent) {
        _cwOutfitIntent = false;
        if (!$("cwText").value.trim()) $("cwText").value = tr("عايزة تقترحولي طرحة تناسب طقمي 🧥✨", "Please suggest a hijab that suits my outfit 🧥✨");
      }
    };
    img.src = url;
  }
  function cwImgClear() { cwImgData = null; $("cwImgPrev").classList.remove("on"); }

  function cwSend() {
    if (cwSending || !cwPhone) return;
    if (!fb() || !firebase.auth().currentUser) { $("cwOffWa").href = waHref(); show("off"); return; }
    var raw = ($("cwText").value || "").trim(), v;
    if (!raw && cwImgData) { v = window.chatValidate ? window.chatValidate("📷", cwConv) : { ok: true, text: "" }; if (v.ok) v.text = ""; }
    else { v = window.chatValidate ? window.chatValidate(raw, cwConv) : { ok: !!raw, text: raw, msg: tr("اكتبي رسالة", "Type a message") }; }
    if (!v.ok) { cwErr(v.msg); return; }
    cwSending = true; $("cwSend").disabled = true;
    var ts = Date.now(), db = cwDb();
    var convRef = db.collection(COL_CHAT).doc(cwPhone), batch = db.batch();
    var expireAt = window.chatExpireAt ? window.chatExpireAt(ts) : (ts + 60 * 86400000);
    var custMsg = { from: "cust", atMs: ts, at: firebase.firestore.FieldValue.serverTimestamp(), expireAt: expireAt };
    if (v.text) custMsg.text = v.text;
    if (cwImgData) custMsg.img = cwImgData;
    batch.set(convRef.collection("messages").doc(), custMsg);
    batch.set(convRef, {
      phone: cwPhone, name: cwName || "", branch: "", source: "web",
      lastAt: ts, lastText: (v.text || "📷 صورة").slice(0, 80), lastFrom: "cust",
      unreadStaff: firebase.firestore.FieldValue.increment(1),
      unreadCust: 0, expireAt: expireAt
    }, { merge: true });
    var auto = window.chatAutoReply ? window.chatAutoReply(cwConv, ts) : null;
    if (auto) {
      batch.set(convRef.collection("messages").doc(), { from: "auto", text: auto, atMs: ts + 1, at: firebase.firestore.FieldValue.serverTimestamp(), expireAt: expireAt });
      batch.set(convRef, { autoReplyAt: ts }, { merge: true });
    }
    batch.commit().then(function () { $("cwText").value = ""; cwImgClear(); })
      .catch(function () { cwErr(tr("الرسالة موصلتش — جرّبي تاني", "Message not sent — please try again")); })
      .then(function () { cwSending = false; $("cwSend").disabled = false; });
  }

  function cwImgZoom(src) {
    var ov = $("imgZoomWrap");
    if (!ov) {
      ov = document.createElement("div"); ov.id = "imgZoomWrap"; ov.className = "img-zoom-wrap";
      ov.innerHTML = '<img id="imgZoomTag" alt=""><button class="img-zoom-x" type="button">✕</button>';
      document.body.appendChild(ov);
      ov.addEventListener("click", function (e) { if (e.target !== $("imgZoomTag")) ov.classList.remove("on"); });
    }
    $("imgZoomTag").src = src; ov.classList.add("on");
  }

  $("cwLauncher").addEventListener("click", cwOpen);
  $("cwOutfitCta").addEventListener("click", cwOutfitCta);
  $("cwClose").addEventListener("click", cwClose);
  $("cwGateBtn").addEventListener("click", cwGateSubmit);
  $("cwGatePhone").addEventListener("keydown", function (e) { if (e.key === "Enter") cwGateSubmit(); });
  $("cwSend").addEventListener("click", cwSend);
  $("cwText").addEventListener("keydown", function (e) { if (e.key === "Enter") cwSend(); });
  $("cwFile").addEventListener("change", cwPickImg);
  $("cwImgClear").addEventListener("click", cwImgClear);
  $("cwBody").addEventListener("click", function (e) {
    var t = e.target, id, it;
    if (t.hasAttribute("data-zoom")) { cwImgZoom(t.src); return; }
    if ((id = t.getAttribute("data-try"))) { openTryOn(cwMsgImgs[id], cwMsgBarcodes[id]); return; }
    if ((id = t.getAttribute("data-otry"))) { it = (cwMsgOutfits[id] || [])[Number(t.getAttribute("data-i"))]; if (it) openTryOn(it.img, it.barcode); return; }
    if ((id = t.getAttribute("data-obuy"))) {
      it = (cwMsgOutfits[id] || [])[Number(t.getAttribute("data-i"))]; if (!it) return;
      $("cwText").value = tr("عايزة أطلب: ", "I’d like to order: ") + (it.name || tr("الطرحة دي", "this hijab"));
      try { $("cwText").focus(); } catch (e2) { }
    }
  });
  // أي زرار في الصفحة عليه data-chat بيفتح الشات
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-chat]");
    if (a) { e.preventDefault(); cwOpen(); }
  });

  // الواجهة فيها زرار «اطلبي من الشات» بتاعها — العائم بيظهر بعد ما العميلة تنزل عنها
  function fabSync() { $("cwLauncher").classList.toggle("show", (window.scrollY || 0) > window.innerHeight * .55); }
  window.addEventListener("scroll", fabSync, { passive: true }); fabSync();

  window.EcharpeChat = { open: cwOpen, close: cwClose };
})();
