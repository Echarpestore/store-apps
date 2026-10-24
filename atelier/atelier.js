/* ============================================================
   echarpe — Maison du Voile · atelier.js
   ------------------------------------------------------------
   · المنتجات: «منتجات البيع أونلاين» (pos_test_settings/online_shop_echarpe)
     الأول، وبعدها مجموعة الدار (صور atelier/collection الحقيقية).
   · بعد ما العميلة ترفع صورتها: كل قطعة في المجموعة + الواجهة
     يتحوّلوا لصورتها وهي لابساها.
   · التوليد: hijabLookbook (٦ قطع في نداء واحد) — ولو لسه مش منشورة،
     بننزل تلقائي لـhijabTryOn (قطعة لكل نداء، للطرح بس).
   · ?mock=1 = معاينة تصميم من غير أي نداء AI (للمراجعة بس).
   ============================================================ */
(function () {
  "use strict";
  var PC = window.PhotoCore, AC = window.AtelierCore;
  function $(id) { return document.getElementById(id); }
  var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var MOCK = /(?:^|[?&])mock=1(?:&|$)/.test(location.search);
  /* 📱 جوّه تطبيق العملاء (iframe من «اطلبي»): زرار قفل، والطلب بيروح
     لسلة التطبيق الحقيقية بدل الواتساب للقطع اللي ليها باركود. */
  var EMBED = /(?:^|[?&])embed=1(?:&|$)/.test(location.search) ||
    (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  function toParent(msg) {
    try { window.parent.postMessage(Object.assign({ ns: "echarpeTryon" }, msg), location.origin); } catch (e) { }
  }
  var LS = null; try { LS = window.localStorage; } catch (e) { LS = null; }
  var phone = ""; try { phone = (LS && LS.getItem("echarpe_loyalty_phone")) || ""; } catch (e) { }

  var MSG = {
    limit: "خلصت تجارب النهاردة 🤍 نكمّل غداً بإطلالات جديدة.",
    earn: "🎁 أضيفي أي قطعة لحقيبتكِ واحصلي على تجربة كمان.",
    retry: "تعذّر تجهيز بعض القطع — المسي «جرّبيها» لإعادة المحاولة.",
    badImg: "تعذّرت قراءة الصورة — جرّبي صورةً أخرى.",
    isdalSoon: "تجربة الإسدال تتوفّر قريباً.",
    forgot: "تم حذف صورتكِ وإطلالاتكِ من هاتفكِ."
  };

  /* ⚙️ إعدادات الموقع — بتتعدّل من صفحة الإدارة (pos_test_settings/atelier_site) */
  var SITE = {
    whatsapp: "201148664485",
    chatText: "عندنا آلاف الطرح في الفروع 🤍 كلّمينا في الشات، ونبعتلكِ صورها تجرّبيها عليكِ هنا.",
    branches: ["الرحاب", "مدينتي", "سيتي سنتر"],
    shippingFee: 40, freeOver: 0
  };
  var state = {
    products: [], byId: {}, face: "", alive: false,
    looks: {}, queued: {}, requested: 0, done: 0, target: 0,
    mode: "lookbook", lookbookWorked: false, stopped: false,
    queue: [], focus: null, busy: 0, gen: 0, lbOpen: null, line: "all"
  };

  /* ---------------- Firebase ---------------- */
  var fb = null, authReady = Promise.resolve();
  if (!MOCK && window.firebase) {
    try {
      if (!firebase.apps.length) firebase.initializeApp({
        apiKey: "AIzaSyCa6Qho3IKoKE_jCNHYuFX6rtaV88jekQs",
        authDomain: "customer-feedback-8ac1d.firebaseapp.com",
        projectId: "customer-feedback-8ac1d",
        storageBucket: "customer-feedback-8ac1d.appspot.com",
        messagingSenderId: "408860081491",
        appId: "1:408860081491:web:c5fa8b8e757c13196375a6"
      });
      fb = firebase;
      authReady = new Promise(function (res) {
        var done = false, fin = function () { if (!done) { done = true; res(); } };
        // v766: الدخول المجهول بس لو مفيش أي دخول محفوظ — مايمسحش دخول الكاشير/الموظف على نفس الجهاز
        var _first = true; fb.auth().onAuthStateChanged(function (u) { if (u) { fin(); return; } if (_first) { _first = false; fb.auth().signInAnonymously().catch(fin); } });
        setTimeout(fin, 6000);
      });
    } catch (e) { fb = null; }
  }
  function callable(name) {
    return fb.app().functions("us-central1").httpsCallable(name, { timeout: 180000 });
  }

  /* ---------------- أدوات ---------------- */
  var toastT = 0;
  function toast(msg, ms) {
    var t = $("toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("on"); }, ms || 4600);
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function loadImg(src) {
    return new Promise(function (res, rej) {
      var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src;
    });
  }
  function imgToJpeg(img, maxDim, q) {
    var d = PC.computeResize(img.naturalWidth, img.naturalHeight, maxDim);
    var c = document.createElement("canvas"); c.width = d.w; c.height = d.h;
    var x = c.getContext("2d");
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, d.w, d.h);   // PNG شفاف ميطلعش أسود
    x.drawImage(img, 0, 0, d.w, d.h);
    return c.toDataURL("image/jpeg", q || 0.9);
  }
  function fileToFace(file) {
    return new Promise(function (resolve, reject) {
      if (!file || String(file.type || "").indexOf("image/") !== 0) { reject(new Error("not-image")); return; }
      var url = URL.createObjectURL(file);
      loadImg(url).then(function (img) {
        URL.revokeObjectURL(url); resolve(imgToJpeg(img, PC.TARGET_MAX_DIM, PC.JPEG_QUALITY));
      }).catch(function (e) { URL.revokeObjectURL(url); reject(e); });
    });
  }
  /* بيقسّم النص لحروف في span — للكتابة الحرف بحرف.
     ⚠️ العربي حروفه متصلة: بنقسّم بالكلمة مش بالحرف عشان التشكيل
        والوصل ميتكسروش. */
  function splitLetters(node) {
    var words = node.textContent.trim().split(/\s+/);
    node.innerHTML = words.map(function (w, i) {
      return '<span class="ch" style="transition-delay:' + (i * 0.12) + 's">' + esc(w) + "</span>";
    }).join(" ");
  }

  /* ---------------- الافتتاحية ---------------- */
  (function intro() {
    var seen = false;
    try { seen = sessionStorage.getItem("atelier_intro") === "1"; } catch (e) { }
    var finish = function () {
      $("intro").classList.add("lift");
      document.body.classList.remove("intro-on");
      setTimeout(function () { $("heroTitle").classList.add("in"); document.querySelector(".hero").classList.add("in"); }, 350);
      setTimeout(function () { $("intro").style.display = "none"; }, 1500);
      try { sessionStorage.setItem("atelier_intro", "1"); } catch (e) { }
    };
    if (seen || REDUCED) { $("intro").style.display = "none"; document.body.classList.remove("intro-on");
      requestAnimationFrame(function () { $("heroTitle").classList.add("in"); document.querySelector(".hero").classList.add("in"); }); return; }
    setTimeout(finish, 2700);
    $("intro").addEventListener("click", finish, { once: true });
  })();

  /* ---------------- الهيدر + الشريط ---------------- */
  function onScroll() {
    $("hdr").classList.toggle("solid", window.scrollY > window.innerHeight * 0.75);
    var b = document.querySelector(".banner-img img");
    if (b && !REDUCED) {
      var r = b.parentNode.getBoundingClientRect();
      var p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
      b.style.transform = "translate3d(0," + (-8 + p * 10).toFixed(2) + "%,0)";
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  (function marquee() {
    var words = ["ميسي شيفون كويتي", "ألوان جديدة", "جرّبي قبل ما تختاري", "echarpe"];
    var one = words.map(function (w) { return "<span>" + w + "</span><span><b>✦</b></span>"; }).join("");
    $("marquee").innerHTML = one + one;
  })();

  /* كشف عند الظهور — البيان + البانر */
  var revealIO = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); revealIO.unobserve(en.target); } });
  }, { threshold: 0.25 }) : null;
  (function statement() {
    var p = document.querySelector(".statement p");
    var html = p.innerHTML.split(/(<br>|<em>|<\/em>)/).map(function (part) {
      if (/^<\/?(br|em)>$/.test(part)) return part;
      return part.split(/(\s+)/).map(function (w, i) {
        return /^\s+$/.test(w) || !w ? w : '<span class="w" style="transition-delay:' + (i * 0.04) + 's">' + w + "</span>";
      }).join("");
    }).join("");
    p.innerHTML = html;
    var host = document.querySelector(".statement");
    if (revealIO) { revealIO.observe(host); revealIO.observe(document.querySelector(".banner-img")); }
    else { host.classList.add("in"); document.querySelector(".banner-img").classList.add("in"); }
  })();

  /* ---------------- المنتجات ---------------- */
  function loadProducts() {
    var house = AC.houseCollection("collection/");
    if (MOCK || !fb) return Promise.resolve(house);
    var db = fb.firestore(), col = db.collection("pos_test_settings");
    return authReady.then(function () {
      return Promise.all([
        col.doc("online_shop_echarpe").get().catch(function () { return null; }),
        col.doc(AC.ADMIN_DOC).get().catch(function () { return null; })
      ]);
    }).then(function (r) {
      var shop = AC.shopItemsFrom(r[0] && r[0].exists ? r[0].data() : null);
      var admin = AC.atelierItemsFrom(r[1] && r[1].exists ? r[1].data() : null);
      if (!admin.length) return shop.concat(house);
      // قطع صفحة الإدارة: المصغّرة بتتحمّل دلوقتي، والكاملة وقت الحاجة
      return Promise.all(admin.map(function (p) {
        return col.doc(AC.ADMIN_DOC + "_t_" + p.docId).get().then(function (d) {
          var img = d.exists ? d.data().img : "";
          if (AC.isImageDataUrl(img)) { p.img = img; return p; }
          return null;
        }).catch(function () { return null; });
      })).then(function (list) { return shop.concat(list.filter(Boolean)); });
    }).catch(function () { return house; });
  }

  /* صور زيادة لنفس اللون (قطع صفحة الإدارة) — بتتحمّل لما الصفحة تتفتح */
  function loadGallery(p) {
    if (MOCK || !fb) return Promise.resolve();
    return fb.firestore().collection("pos_test_settings").doc(AC.ADMIN_DOC + "_x_" + p.docId).get()
      .then(function (d) { p.gallery = d.exists && Array.isArray(d.data().imgs) ? d.data().imgs.filter(AC.isImageDataUrl) : []; })
      .catch(function () { p.gallery = []; });
  }

  /* الصورة الكاملة لقطعة من صفحة الإدارة — مرة واحدة لكل قطعة */
  var fullCache = {};
  function fullSrc(p) {
    if (!p.admin || MOCK || !fb) return Promise.resolve(p.img);
    if (!fullCache[p.id]) {
      fullCache[p.id] = fb.firestore().collection("pos_test_settings").doc(AC.ADMIN_DOC + "_f_" + p.docId).get()
        .then(function (d) { var v = d.exists ? d.data().img : ""; return AC.isImageDataUrl(v) ? v : p.img; })
        .catch(function () { return p.img; });
    }
    return fullCache[p.id];
  }

  /* صورة مرجعية للموديل (data-URL):
     · مجموعة الدار: صورة الملف نفسه مضغوطة لـ1280px.
     · منتجات البيع: صورة الجاليري الأكبر (٧٢٠px) لو موجودة، وإلا الغلاف. */
  var refCache = {};
  function refImage(p) {
    if (refCache[p.id]) return refCache[p.id];
    if (p.admin) {
      refCache[p.id] = fullSrc(p);
    } else if (p.house) {
      refCache[p.id] = loadImg(p.img).then(function (img) { return imgToJpeg(img, 1280, 0.9); });
    } else if (MOCK || !fb || !p.galleryId) {
      refCache[p.id] = Promise.resolve(p.img);
    } else {
      refCache[p.id] = fb.firestore().collection("pos_test_settings")
        .doc("online_shop_echarpe_img_" + p.galleryId).get()
        .then(function (d) {
          var arr = (d.exists && Array.isArray(d.data().images)) ? d.data().images : [];
          return arr.filter(AC.isImageDataUrl)[0] || p.img;
        }).catch(function () { return p.img; });
    }
    return refCache[p.id];
  }
  /* بصمة المنتج في الكاش — data-URL أو مسار الملف */
  function prodSig(p) { return p.img; }

  /* ---------------- الموديلات + رف الألوان ----------------
     القطع اللي بنفس الموديل = كارت واحد + نقط ألوان (من غير أسماء:
     الدرجات كتير وصعب تتسمّى). المرآة بتعرض الموديلات، وتحتها ألوان
     الموديل اللي قدامها. */
  var models = [], modelOf = {}, toneSel = "";
  function buildModels() {
    models = AC.groupModels(state.products);
    modelOf = {};
    models.forEach(function (m) {
      m.active = m.items[0];
      m.items.forEach(function (p, i) { modelOf[p.id] = m; p.colorNo = i + 1; });
    });
  }
  function colorLabel(p) {
    var m = modelOf[p.id];
    if (!m || m.items.length < 2) return "";
    return p.colorName || ("لون " + arN(p.colorNo) + " من " + arN(m.items.length));
  }
  function displayName(p) { var m = modelOf[p.id]; return m && m.items.length > 1 ? m.title : p.name; }
  function colorDot(v, on, onClick) {
    var b = el("button", "cdot" + (on ? " on" : ""));
    b.type = "button"; b.dataset.id = v.id; b.setAttribute("aria-label", displayName(v) + " — " + colorLabel(v));
    b.innerHTML = '<img alt="" loading="lazy">'; b.querySelector("img").src = v.img;
    b.addEventListener("click", function (e) { e.stopPropagation(); onClick(); });
    paintDot(b, v);
    return b;
  }
  function paintDot(d, p) {
    d.classList.toggle("worn", !!state.looks[p.id]);
    d.classList.toggle("busy", !!(state.queued[p.id] && !state.looks[p.id]));
  }
  function syncDots(p) {
    document.querySelectorAll('.cdot[data-id="' + CSS.escape(p.id) + '"]').forEach(function (d) { paintDot(d, p); });
    var m = modelOf[p.id]; if (!m) return;
    var sw = document.querySelector('.sw[data-model="' + CSS.escape(m.key) + '"]');
    if (sw) sw.classList.toggle("worn", m.items.some(function (x) { return state.looks[x.id]; }));
  }

  /* ---------------- الواجهة: المرآة ---------------- */
  var mirrorP = null, mirrorShown = "", userPicked = false, paintT = 0;
  function tryables() { return state.products.filter(function (p) { return p.tryable; }); }
  function mirrorModels() { return models.filter(function (m) { return m.items.some(function (p) { return p.tryable; }); }); }
  function renderHero() {
    var box = $("swatches"); box.innerHTML = "";
    mirrorModels().forEach(function (m) {
      var b = el("button", "sw"); b.type = "button"; b.dataset.model = m.key;
      b.setAttribute("aria-label", m.title); b.setAttribute("role", "option");
      b.innerHTML = '<span class="clip"><img alt="" loading="lazy"></span><i class="dot"></i>' +
        (m.items.length > 1 ? '<em class="cnt">' + arN(m.items.length) + "</em>" : "");
      b.querySelector("img").src = m.items[0].img;
      b.addEventListener("click", function () { userPicked = true; setMirror(m.active); });
      box.appendChild(b);
    });
    var first = mirrorModels()[0];
    if (first) setMirror(first.active, true);
  }
  function setMirror(p, instant) {
    mirrorP = p;
    var m = modelOf[p.id]; if (m) m.active = p;
    document.querySelectorAll(".sw").forEach(function (sw) {
      var on = !!m && sw.dataset.model === m.key; sw.classList.toggle("on", on); sw.setAttribute("aria-selected", on);
      if (on && !instant) centerSwatch(sw);
    });
    $("mName").textContent = displayName(p);
    $("mLine").textContent = colorLabel(p) || (AC.lineName(p.line) ? "من مجموعة " + AC.lineName(p.line) : "");
    var box = $("mColors"); box.innerHTML = "";
    box.classList.toggle("hidden", !m || m.items.length < 2);
    if (m && m.items.length > 1) m.items.forEach(function (v) {
      box.appendChild(colorDot(v, v === p, function () { userPicked = true; setMirror(v); }));
    });
    $("mirror").classList.toggle("busy", !!(state.queued[p.id] && !state.looks[p.id]));
    paintMirror(state.looks[p.id] || p.img, instant);
    if (p.admin && !state.looks[p.id]) fullSrc(p).then(function (u) {
      if (mirrorP === p && !state.looks[p.id]) paintMirror(u, true);
    });
    syncMirrorActs();
    syncMirrorPick();
  }
  /* توسيط العيّنة جوّه الشريط بس — scrollIntoView كان بيحرّك الصفحة كلها بالعرض */
  function centerSwatch(sw) {
    var box = $("swatches"), br = box.getBoundingClientRect(), r = sw.getBoundingClientRect();
    var delta = (r.left + r.width / 2) - (br.left + br.width / 2);
    if (box.scrollBy) box.scrollBy({ left: delta, behavior: REDUCED ? "auto" : "smooth" }); else box.scrollLeft += delta;
  }
  function paintMirror(src, instant) {
    if (!src || src === mirrorShown) return;
    mirrorShown = src;
    var m = $("mirror"), layers = m.querySelectorAll(".m-layer"), base = layers[0], top = layers[1];
    clearTimeout(paintT);
    if (instant || !base.getAttribute("src")) {
      base.src = src; base.className = "m-layer base"; top.className = "m-layer"; return;
    }
    top.className = "m-layer top"; top.onload = null;
    var go = function () {
      m.style.setProperty("--mh", m.offsetHeight + "px");
      requestAnimationFrame(function () {
        top.classList.add("show");
        m.classList.remove("wipe"); void m.offsetWidth; m.classList.add("wipe");
      });
      paintT = setTimeout(function () { base.src = src; base.className = "m-layer base"; top.className = "m-layer"; }, 1600);
    };
    top.src = src;
    if (top.complete) go(); else top.onload = go;
  }
  /* سحب المرآة يمين/شمال = الموديل اللي بعده/قبله */
  var swipeX = null, swiped = false;
  $("mirror").addEventListener("pointerdown", function (e) { swipeX = e.clientX; swiped = false; });
  $("mirror").addEventListener("pointerup", function (e) {
    if (swipeX == null) return;
    var dx = e.clientX - swipeX; swipeX = null;
    if (Math.abs(dx) > 45) { swiped = true; stepMirror(dx < 0 ? 1 : -1); }
  });
  function stepMirror(d) {
    var list = mirrorModels(); if (!list.length) return;
    var i = Math.max(0, list.indexOf(modelOf[mirrorP && mirrorP.id]));
    userPicked = true; setMirror(list[(i + d + list.length) % list.length].active); buzz();
  }
  $("mirror").addEventListener("click", function () {
    if (swiped) { swiped = false; return; }
    if (mirrorP) openLook(mirrorP);
  });
  $("mirror").addEventListener("keydown", function (e) { if (e.key === "Enter" && mirrorP) openLook(mirrorP); });
  function resetMirror() {
    document.querySelectorAll(".sw").forEach(function (sw) { sw.classList.remove("worn"); });
    document.querySelectorAll(".cdot").forEach(function (d) { d.classList.remove("worn", "busy"); });
    userPicked = false; mirrorShown = "";
    if (mirrorP) setMirror(mirrorP, true);
  }

  /* ---------------- المجموعة ---------------- */
  var io = null;
  function renderFilters() {
    var box = $("filters"), counts = { all: models.length };
    models.forEach(function (m) { counts[m.line] = (counts[m.line] || 0) + 1; });
    var lines = AC.LINES.slice();
    if (counts.shop) lines.splice(1, 0, { id: "shop", ar: "الجديد" });
    box.innerHTML = "";
    // نوع واحد بس؟ الفلاتر ملهاش لازمة
    var kinds = lines.filter(function (l) { return l.id !== "all" && counts[l.id]; }).length;
    box.style.display = kinds < 2 ? "none" : "";
    lines.forEach(function (l) {
      if (!counts[l.id]) return;
      var b = el("button", l.id === state.line ? "on" : "", esc(l.ar) + "<sup>" + counts[l.id] + "</sup>");
      b.type = "button"; b.setAttribute("role", "tab");
      b.addEventListener("click", function () { setLine(l.id); });
      box.appendChild(b);
    });
  }
  function setLine(id) { state.line = id; renderFilters(); applyFilters(); }

  /* 🎨 رف الألوان: عائلة اللون بتتحسب من صورة القطعة نفسها (مرة واحدة) */
  function toneFor(p) {
    if (p.tone !== undefined) return Promise.resolve(p.tone);
    var byName = AC.toneFromName(p.colorName);
    if (byName) { p.tone = byName; return Promise.resolve(byName); }
    return loadImg(p.img).then(function (img) {
      var c = document.createElement("canvas"), x = c.getContext("2d"), w = img.naturalWidth, h = img.naturalHeight;
      c.width = c.height = 32; x.drawImage(img, w * .2, h * .2, w * .6, h * .6, 0, 0, 32, 32);
      var d = x.getImageData(0, 0, 32, 32).data, r = 0, g = 0, b = 0, n = 0;
      for (var k = 0; k < d.length; k += 4) {
        var mx = Math.max(d[k], d[k + 1], d[k + 2]), mn = Math.min(d[k], d[k + 1], d[k + 2]);
        if (mn > 205 && mx - mn < 30) continue;            // خلفية فاتحة
        r += d[k]; g += d[k + 1]; b += d[k + 2]; n++;
      }
      p.tone = n ? AC.toneOf([r / n, g / n, b / n]) : "white";
      return p.tone;
    }).catch(function () { p.tone = ""; return ""; });
  }
  function renderTones() {
    Promise.all(state.products.map(toneFor)).then(function () {
      var have = {};
      state.products.forEach(function (p) { if (p.tone) have[p.tone] = (have[p.tone] || 0) + 1; });
      var list = AC.TONES.filter(function (t) { return have[t.id]; });
      var box = $("tones"); box.innerHTML = "";
      box.classList.toggle("hidden", list.length < 3);
      list.forEach(function (t) {
        var b = el("button", "tone" + (toneSel === t.id ? " on" : ""), '<i style="background:' + t.hex + '"></i>' + esc(t.ar));
        b.type = "button"; b.setAttribute("aria-pressed", toneSel === t.id);
        b.addEventListener("click", function () { toneSel = toneSel === t.id ? "" : t.id; renderTones(); applyFilters(); });
        box.appendChild(b);
      });
    });
  }
  function applyFilters() {
    var shown = 0;
    document.querySelectorAll(".card[data-model]").forEach(function (c) {
      var m = models.filter(function (x) { return x.key === c.dataset.model; })[0]; if (!m) return;
      var okLine = state.line === "all" || m.line === state.line;
      var match = toneSel ? m.items.filter(function (p) { return p.tone === toneSel; }) : m.items;
      var show = okLine && match.length > 0;
      if (show && toneSel && match.indexOf(state.byId[c.dataset.id]) < 0) setCardVariant(c, match[0]);
      c.classList.toggle("hide", !show);
      if (show) { shown++; c.classList.remove("in"); requestAnimationFrame(function () { requestAnimationFrame(function () { c.classList.add("in"); }); }); }
    });
    var more = document.querySelector(".more-card h3");
    if (more) more.textContent = shown ? "مش لاقية اللي في بالكِ؟" : "مفيش هنا اللون ده لسه…";
  }

  function renderGrid() {
    var g = $("grid"); g.innerHTML = "";
    if (!models.length) { g.innerHTML = '<div class="empty">تُعَدّ المجموعة الجديدة… قريباً.</div>'; return; }
    io = "IntersectionObserver" in window ? new IntersectionObserver(onSeen, { rootMargin: "0px 0px -8% 0px" }) : null;
    models.forEach(function (m, i) {
      var p = m.active;
      var c = el("article", "card");
      c.dataset.model = m.key; c.dataset.id = p.id; c.dataset.i = i;
      var n = m.items.length;
      c.innerHTML =
        '<div class="frame" role="button" tabindex="0">' +
          '<img class="prod" alt="" loading="lazy"><img class="look" alt="">' +
          '<i class="sheen"></i><div class="weave"></div><div class="weave-txt">نُجهّزها لكِ…</div>' +
          '<div class="chip"><img alt=""></div>' +
          '<button class="try-btn" type="button">جرّبيها بألوانها</button>' +
          '<button class="card-heart heart" type="button" aria-label="أضيفي للمفضّلة"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" stroke="currentColor" stroke-width="1.3"/></svg></button>' +
        '</div>' +
        '<div class="meta"><span class="nm">' + esc(n > 1 ? m.title : p.name) + '</span>' +
          '<span class="pr"></span>' + (n > 1 ? '<span class="cnt">' + arN(n) + ' ألوان</span>' : '') +
        '</div>' + (n > 1 ? '<div class="cdots"></div>' : '');
      if (n > 1) {
        var dots = c.querySelector(".cdots"), MAXD = 9;
        m.items.slice(0, MAXD).forEach(function (v) {
          dots.appendChild(colorDot(v, v === p, function () { setCardVariant(c, v); }));
        });
        if (n > MAXD) {
          var more = el("button", "more", "+" + arN(n - MAXD)); more.type = "button";
          more.addEventListener("click", function () { openLook(state.byId[c.dataset.id]); });
          dots.appendChild(more);
        }
      }
      var frame = c.querySelector(".frame");
      var cur = function () { return state.byId[c.dataset.id]; };
      frame.addEventListener("click", function (e) {
        if (e.target.closest(".try-btn")) { e.stopPropagation(); tryPiece(cur()); return; }
        if (e.target.closest(".card-heart")) { e.stopPropagation(); toggleFav(cur()); return; }
        openLook(cur());
      });
      frame.addEventListener("keydown", function (e) { if (e.key === "Enter") openLook(cur()); });
      g.appendChild(c);
      setCardVariant(c, p);
      if (io) io.observe(c); else c.classList.add("in");
    });
    g.appendChild(moreCard());
    renderTones();
  }
  /* الكارت بيعرض لون واحد — تغيير اللون بيغيّر الصورة والإطلالة والحالة */
  function setCardVariant(c, p) {
    var m = modelOf[p.id]; if (m) m.active = p;
    c.dataset.id = p.id;
    var prod = c.querySelector(".prod"); prod.src = p.img; prod.alt = p.name;
    c.querySelector(".chip img").src = p.img;
    var look = state.looks[p.id], lk = c.querySelector(".look");
    if (look) { lk.src = look; c.classList.add("worn"); } else { c.classList.remove("worn"); lk.removeAttribute("src"); }
    c.classList.toggle("weaving", !!(state.queued[p.id] && !look));
    c.querySelector(".pr").textContent = p.price ? AC.fmtPrice(p.price) : "";
    c.querySelectorAll(".cdots .cdot").forEach(function (d) { d.classList.toggle("on", d.dataset.id === p.id); });
    syncHearts(p);
    if (typeof syncPickable === "function" && state.alive) syncPickable();
  }
  function card(id) { return document.querySelector('.card[data-id="' + CSS.escape(id) + '"]'); }

  /* 💬 آخر كارت: مش لاقية؟ عندنا آلاف الطرح في الفروع — الشات */
  function moreCard() {
    var c = el("article", "card more-card in");
    c.innerHTML = '<h3>مش لاقية اللي في بالكِ؟</h3>' +
      '<p>' + esc(SITE.chatText) + '</p>' +
      '<button class="btn btn-dark" type="button"><span>كلّمينا في الشات</span></button>' +
      '<a class="bag-wa" target="_blank" rel="noopener">أو على واتساب</a>';
    c.querySelector("button").addEventListener("click", openChatCta);
    c.querySelector("a").href = "https://wa.me/" + SITE.whatsapp + "?text=" + encodeURIComponent("أهلاً echarpe 🤍 عاوزة أشوف طرح أكتر وأجرّبها عليّا");
    return c;
  }
  function openChatCta() {
    if (EMBED) { toParent({ type: "atelier-chat" }); return; }
    location.href = "../loyalty/?chat=1";
  }

  function onSeen(entries) {
    entries.forEach(function (en) {
      var c = en.target;
      if (en.isIntersecting) {
        c.classList.add("in");
        c.dataset.visible = "1";
      } else c.dataset.visible = "";
    });
  }

  /* ---------------- الدخول إلى غرفة القياس ---------------- */
  function dust() {
    var box = $("dust"); if (box.childElementCount) return;
    for (var i = 0; i < 34; i++) {
      var d = el("i");
      d.style.left = (Math.random() * 100) + "%";
      d.style.setProperty("--d", (7 + Math.random() * 7) + "s");
      d.style.setProperty("--delay", (-Math.random() * 10) + "s");
      d.style.setProperty("--x", ((Math.random() - 0.5) * 120) + "px");
      box.appendChild(d);
    }
  }
  function awaken(face) {
    var a = $("awaken");
    $("awakenFace").src = face;
    dust(); splitLetters($("w1")); splitLetters($("w2"));
    a.classList.remove("out"); a.classList.add("on");
    var T = REDUCED ? 0.2 : 1;
    setTimeout(function () { $("w1").classList.add("on"); }, 700 * T);
    setTimeout(function () { $("w1").classList.remove("on"); $("w1").classList.add("off"); }, 2300 * T);
    setTimeout(function () { $("w2").classList.add("on"); $("w3").classList.add("on"); }, 2800 * T);
    return new Promise(function (res) {
      setTimeout(function () {
        a.classList.add("out");
        becomeAlive(face);
        window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
        setTimeout(function () {
          a.classList.remove("on", "out");
          ["w1", "w2", "w3"].forEach(function (id) { $(id).classList.remove("on", "off"); });
        }, 1700);
        res();
      }, 5200 * T);
    });
  }
  function becomeAlive(face) {
    document.body.classList.add("alive"); state.alive = true;
    $("heroEyebrow").textContent = "إطلالاتكِ";
    var t = $("heroTitle"); t.classList.remove("in");
    t.innerHTML = '<span class="ln"><span>المجموعة،</span></span><span class="ln"><span><em>عليكِ</em></span></span>';
    requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add("in"); }); });
    $("heroSub").textContent = "المسي أي قطعة لتريها عن قرب.";
    $("ctaUpload").querySelector("span").textContent = "شاهدي إطلالاتكِ";
    $("ctaSalon").querySelector("span").textContent = "صورة أخرى";
    setFace(face);
  }
  function setFace(face) {
    $("dockFace").src = face; document.querySelector("#meDot img").src = face;
    $("salonImg").src = face; $("salonArch").classList.add("has");
  }

  function startWithFace(face) {
    state.face = face; state.gen++;
    state.looks = {}; state.queued = {}; state.queue = [];
    state.requested = 0; state.done = 0; state.target = 0; state.stopped = false; celebrated = false;
    document.querySelectorAll(".card").forEach(function (c) { c.classList.remove("worn", "weaving", "pickable", "selected", "revealing"); });
    resetMirror();
    if (LS) PC.saveFace(LS, face);
    var ready = state.alive ? Promise.resolve(setFace(face)) : awaken(face);
    var gen = state.gen;
    Promise.all(state.products.map(function (p) {
      return PC.readResultAsync(LS, AC.cacheProductId(p, false), face, null, prodSig(p)).then(function (v) {
        if (gen === state.gen && v) state.looks[p.id] = v;
      });
    })).then(function () { return ready; }).then(function () {
      if (gen !== state.gen) return;
      var delay = 0;
      state.products.forEach(function (p) {
        if (state.looks[p.id]) {
          state.queued[p.id] = true;
          (function (pp, url) { setTimeout(function () { showLook(pp, url, false); }, delay); })(p, state.looks[p.id]);
          delay += 160;
        }
      });
      // التجربة الأولى لوحدها: القطعة اللي ضغطت عليها (لو فيه) + ألوانها، وإلا أول ٦ طرح
      var first = AC.buildRound(state.focus, state.products, state.looks, state.queued);
      state.focus = null;
      if (first.length && roundsLeft() > 0) runRound(first);
      syncPickable(); updateDock();
    });
  }

  /* ---------------- التجارب: مرة ببلاش + 🎁 مرة لما تحط حاجة في الحقيبة ----------------
     التجربة = نداء توليد واحد = ٦ قطع: اللي اختارتها + ألوانها
     (نفس الموديل) + نفس النوع. السيرفر بيقفل على نداءين في اليوم. */
  var ROUNDS_KEY = "atelier_rounds";
  function today() { return new Date().toLocaleDateString("en-CA"); }
  function roundsRec() {
    var rec = null; try { rec = JSON.parse((LS && LS.getItem(ROUNDS_KEY)) || "null"); } catch (e) { }
    return AC.roundsState(rec, today());
  }
  function saveRounds(st) { try { LS && LS.setItem(ROUNDS_KEY, JSON.stringify({ day: today(), n: st.used, bonus: st.bonus })); } catch (e) { } }
  function roundsLeft() { return roundsRec().left; }
  function generating() { return state.busy > 0 || state.queue.length > 0; }

  function runRound(list) {
    if (!list.length) return;
    if (state.mode === "single" && list[0].kind === "isdal") { toast(MSG.isdalSoon); return; }
    var st = roundsRec(); st.used++; saveRounds(st);
    list.forEach(function (p) {
      state.queued[p.id] = true; state.target++;
      var c = card(p.id); if (c) { c.classList.remove("pickable"); c.classList.add("weaving"); }
      state.queue.push(p);
      if (mirrorP === p) $("mirror").classList.add("busy");
      syncDots(p);
    });
    syncPickable(); updateDock(); pump();
  }

  /* «جرّبيها» على قطعة: لو مفيش صورة → نطلب الصورة ونبدأ بيها،
     لو فيه تجربة متاحة → القطعة + ألوانها، وإلا نقولها إزاي تكسب تجربة */
  function tryPiece(p) {
    if (!p || !p.tryable || state.looks[p.id]) return;
    if (!state.face) { state.focus = p; pickPhoto(); return; }
    if (state.queued[p.id]) return;
    if (generating()) { toast("لحظات — بنخلّص التجربة الحالية الأول 🤍"); return; }
    if (!roundsLeft()) { toast(roundsRec().bonus ? MSG.limit : MSG.earn, 5200); return; }
    buzz();
    runRound(AC.buildRound(p, state.products, state.looks, state.queued));
  }
  /* 🎁 أول قطعة في الحقيبة النهاردة = تجربة كمان */
  function grantBonus() {
    var st = roundsRec(); if (st.bonus) return false;
    st.bonus = true; saveRounds(st);
    return true;
  }
  function syncPickable() {
    var left = roundsLeft() > 0;
    state.products.forEach(function (p) {
      var c = card(p.id);
      var pickable = state.alive && left && p.tryable && !state.looks[p.id] && !state.queued[p.id];
      if (c) { c.classList.toggle("pickable", pickable); c.querySelector(".try-btn").textContent = "جرّبيها بألوانها"; }
    });
    syncMirrorPick();
  }
  function syncMirrorPick() {
    var b = $("mPick"); if (!mirrorP) return;
    var pickable = state.alive && roundsLeft() > 0 && !generating() && mirrorP.tryable && !state.looks[mirrorP.id] && !state.queued[mirrorP.id];
    b.classList.toggle("show", pickable);
    b.textContent = "جرّبيها هي وألوانها ✨";
  }
  $("mPick").addEventListener("click", function () { if (mirrorP) tryPiece(mirrorP); });

  /* ---------------- محرك التوليد ---------------- */
  function pump() {
    var maxBusy = state.mode === "lookbook" ? 1 : 2;
    while (state.busy < maxBusy && state.queue.length && !state.stopped) {
      var t = AC.takeBatch(state.queue, state.mode === "lookbook" ? AC.ROUND_SIZE : 1);
      state.queue = t.rest;
      runBatch(t.batch, t.kind, state.gen);
    }
  }

  function runBatch(batch, kind, gen) {
    state.busy++;
    var face = state.face;
    var useGrid = state.mode === "lookbook";
    var work = useGrid ? runLookbook(batch, kind, face) : runSingles(batch, face);
    work.then(function (results) {
      if (gen !== state.gen) return;
      results.forEach(function (r) {
        showLook(r.p, r.img, true);
        PC.saveResultAsync(LS, AC.cacheProductId(r.p, false), face, r.img, null, prodSig(r.p));
      });
    }).catch(function (err) {
      if (gen !== state.gen) return;
      var code = String(err && err.code || "").replace(/^functions\//, "");
      if (code === "resource-exhausted") {
        var st0 = roundsRec(); st0.used = AC.MAX_ROUNDS; st0.bonus = true; saveRounds(st0);
        toast(MSG.limit);
        markManual(batch.concat(state.queue)); state.queue = [];
      } else if (useGrid && !state.lookbookWorked && AC.shouldFallbackToSingle(err)) {
        state.mode = "single";                 // hijabLookbook لسه مش منشورة
        var isdal = batch.concat(state.queue).filter(function (p) { return p.kind === "isdal"; });
        state.queue = batch.concat(state.queue).filter(function (p) { return p.kind !== "isdal"; });
        if (isdal.length) markManual(isdal);
      } else {
        markManual(batch);
        toast(MSG.retry);
      }
    }).then(function () {
      state.busy--; pump(); syncPickable(); updateDock();
      if (!generating() && gen === state.gen) roundFinished();
    });
  }

  function markManual(list) {
    list.forEach(function (p) {
      if (state.queued[p.id]) state.target = Math.max(state.done, state.target - 1);
      state.queued[p.id] = false;
      var c = card(p.id); if (c) c.classList.remove("weaving");
      if (mirrorP === p) $("mirror").classList.remove("busy");
      syncDots(p);
    });
    syncPickable();
  }
  /* بعد كل جولة: نوجّهها للخطوة الجاية */
  function roundFinished() {
    if (!lookCount()) return;
    setTimeout(function () {
      var st = roundsRec();
      if (st.left > 0) toast("جاهزة ✨ اختاري أي قطعة وجرّبيها هي وألوانها", 6000);
      else if (!st.bonus) toast("🎁 أضيفي قطعة لحقيبتكِ واحصلي على تجربة كمان", 6500);
      else { toast("اختاري مفضّلتكِ واسألي صديقاتكِ 🤍", 6000); $("dockPoll").classList.add("glow"); }
    }, 900);
  }

  function lookbookCall(products, kind, face) {
    return Promise.all(products.map(refImage)).then(function (refs) {
      if (MOCK) return mockGrid(face, refs);
      return callable("hijabLookbook")({
        customerImage: face, garment: kind,
        products: products.map(function (p, i) { return { id: p.id, image: refs[i] }; })
      }).then(function (res) {
        var d = res && res.data;
        if (!d || !d.image) throw { code: "internal" };
        return d.image;
      });
    });
  }

  function runLookbook(batch, kind, face) {
    return lookbookCall(batch, kind, face).then(function (gridUrl) {
      state.lookbookWorked = true;
      return batch.length === 1 ? [gridUrl] : sliceGrid(gridUrl, batch.length);
    }).then(function (cells) {
      return batch.map(function (p, i) { return { p: p, img: cells[i] }; });
    });
  }

  function runSingles(batch, face) {
    return Promise.all(batch.map(function (p) {
      return single(p, face).then(function (img) { return { p: p, img: img }; });
    }));
  }

  /* قطعة واحدة بجودة كاملة: الطرحة بـhijabTryOn، والإسدال بـhijabLookbook (خانة واحدة) */
  function single(p, face) {
    if (p.kind === "isdal") return lookbookCall([p], "isdal", face);
    return refImage(p).then(function (ref) {
      if (MOCK) return mockLook(face, ref, true);
      return callable("hijabTryOn")({ customerImage: face, productImage: ref, productId: p.id, phone: phone })
        .then(function (res) {
          var d = res && res.data;
          if (!d || !d.image) throw { code: "internal" };
          return d.image;
        });
    });
  }

  function sliceGrid(url, n) {
    return loadImg(url).then(function (img) {
      var cells = AC.gridCells(img.naturalWidth, img.naturalHeight, n, 0.02);
      return cells.map(function (c) {
        var cv = document.createElement("canvas"); cv.width = c.w; cv.height = c.h;
        cv.getContext("2d").drawImage(img, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
        return cv.toDataURL("image/jpeg", 0.9);
      });
    });
  }

  /* ---------------- ظهور الإطلالة ---------------- */
  function showLook(p, url, fresh) {
    state.looks[p.id] = url;
    state.done++; if (!fresh) state.target++;
    var c = card(p.id);
    if (c) {
      var lk = c.querySelector(".look");
      lk.src = url;
      c.classList.remove("weaving", "pickable", "selected");
      c.querySelector(".frame").style.setProperty("--h", c.querySelector(".frame").offsetHeight + "px");
      requestAnimationFrame(function () {
        c.classList.add("worn", "revealing");
        setTimeout(function () { c.classList.remove("revealing"); }, 2100);
      });
    }
    syncDots(p);
    // أول إطلالة جاهزة تظهر في المرآة على طول — لحد ما العميلة تختار بنفسها
    if (mirrorP === p) setMirror(p);
    else if (!userPicked && (!mirrorP || !state.looks[mirrorP.id])) setMirror(p);
    if (state.lbOpen === p) setLb(p);
    updateDock();
  }

  function arN(n) { return Number(n).toLocaleString("ar-EG"); }
  function looksWord(n) { return n === 1 ? "إطلالة واحدة" : n === 2 ? "إطلالتان" : arN(n) + (n <= 10 ? " إطلالات" : " إطلالة"); }
  function updateDock() {
    var t = Math.max(state.target, state.done), d = state.done, st = roundsRec();
    var sub;
    if (generating()) sub = "نُجهّز إطلالاتكِ…";
    else if (st.left > 0 && lookCount()) sub = "اختاري قطعة وجرّبيها بألوانها ✨";
    else if (!st.bonus && lookCount()) sub = "🎁 أضيفي قطعة لحقيبتكِ = تجربة كمان";
    else if (lookCount()) sub = looksWord(lookCount()) + " اليوم — نكمّل غداً 🤍";
    else sub = "نُجهّز إطلالاتكِ…";
    $("dockSub").textContent = sub;
    $("dockProg").style.width = t ? Math.round(d / t * 100) + "%" : "0";
    $("dockPoll").style.display = lookCount() >= 2 ? "" : "none";
  }

  /* ---------------- عرض القطعة + الدقة العالية ---------------- */
  function openLook(p) {
    state.lbOpen = p; setLb(p);
    $("lb").classList.add("on"); document.body.style.overflow = "hidden";
  }
  function setLb(p) {
    var pic = $("lbPic"), look = state.looks[p.id];
    var img = $("lbLook"); img.src = look || p.img;
    img.style.animation = "none"; void img.offsetWidth; img.style.animation = "";
    $("lbProd").src = p.img; $("lbChip").src = p.img;
    // 🖼️ صور زيادة لنفس اللون — اللمس بيعرضها مكان الصورة الكبيرة
    var th = $("lbThumbs"), pics = [p.img].concat(p.gallery || []);
    th.innerHTML = ""; th.classList.toggle("hidden", pics.length < 2 && !look);
    if (look) pics = [look].concat(pics);
    if (pics.length > 1) pics.forEach(function (u, i) {
      var b = el("button", i === 0 ? "on" : "", '<img alt="">'); b.type = "button"; b.querySelector("img").src = u;
      b.addEventListener("click", function () {
        $("lbLook").src = u; th.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
      });
      th.appendChild(b);
    });
    if (p.admin) fullSrc(p).then(function (u) {
      if (state.lbOpen !== p) return;
      $("lbProd").src = u; if (!state.looks[p.id]) $("lbLook").src = u;
    });
    pic.querySelector(".chip").style.display = look ? "" : "none";
    $("lbLine").textContent = colorLabel(p) || (AC.lineName(p.line) ? "من مجموعة " + AC.lineName(p.line) : "");
    // 🎨 ألوان الموديل جوّه صفحة القطعة — تضغطي لون تشوفيه على طول
    var lc = $("lbColors"), lm = modelOf[p.id];
    lc.innerHTML = ""; lc.classList.toggle("hidden", !lm || lm.items.length < 2);
    if (lm && lm.items.length > 1) lm.items.forEach(function (v) {
      lc.appendChild(colorDot(v, v === p, function () {
        state.lbOpen = v; setLb(v);
        var c = document.querySelector('.card[data-model="' + CSS.escape(lm.key) + '"]'); if (c) setCardVariant(c, v);
        if (mirrorP && modelOf[mirrorP.id] === lm) setMirror(v, true);
      }));
    });
    if (p.admin && p.extras && !p.gallery) loadGallery(p).then(function () { if (state.lbOpen === p) setLb(p); });
    $("lbName").textContent = displayName(p);
    $("lbPrice").textContent = p.price ? AC.fmtPrice(p.price) : "";
    var busy = state.queued[p.id] && !look, st = roundsRec();
    var b = $("lbTry");
    b.style.display = look || !p.tryable ? "none" : "";
    b.disabled = !!busy;
    b.querySelector("span").textContent = busy ? "نُجهّزها لكِ…" : (!state.face ? "جرّبيها عليكِ" :
      (st.left > 0 ? "جرّبيها هي وألوانها" : (!st.bonus ? "🎁 أضيفيها للحقيبة = تجربة كمان" : "نكمّل غداً 🤍")));
    $("lbHint").style.display = look ? "" : "none";
    $("lbBag").querySelector("span").textContent = inBag(p) ? "في حقيبتكِ ✓" : "أضيفيها للحقيبة";
    $("lbShare").style.display = look ? "" : "none";
    syncHearts(p);
  }
  function closeLb() {
    state.lbOpen = null; $("lb").classList.remove("on"); document.body.style.overflow = "";
  }
  $("lbClose").addEventListener("click", closeLb);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });
  $("lbTry").addEventListener("click", function () {
    var p = state.lbOpen; if (!p) return;
    if (!state.face) { closeLb(); state.focus = p; pickPhoto(); return; }
    if (!roundsLeft()) {
      if (!roundsRec().bonus) { addToBag(p, $("lbLook")); setLb(p); }
      return;
    }
    tryPiece(p); setLb(p);
  });
  (function () {
    var pic = $("lbPic");
    function on() { pic.classList.add("compare"); }
    function off() { pic.classList.remove("compare"); }
    pic.addEventListener("pointerdown", on);
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { pic.addEventListener(ev, off); });
    pic.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  })();

  /* ---------------- رفع الصورة ---------------- */
  function pickPhoto() { $("file").value = ""; $("file").click(); }
  function enter() {
    if (state.alive) { document.getElementById("collection").scrollIntoView({ behavior: "smooth" }); return; }
    var saved = LS ? PC.readFace(LS) : "";
    if (saved) startWithFace(saved); else pickPhoto();
  }
  $("ctaUpload").addEventListener("click", enter);
  $("ctaSalon").addEventListener("click", function () { if (state.alive) pickPhoto(); else enter(); });
  $("meDot").addEventListener("click", pickPhoto);
  /* 🔒 حذف الصورة والإطلالات من الجهاز — الوش + الكاش (localStorage + IndexedDB) */
  $("forgetMe").addEventListener("click", function () {
    if (LS) { PC.clearFace(LS); PC.clearResults(LS); }
    try { indexedDB.deleteDatabase("echarpe_tryon_cache_v1"); } catch (e) { }
    state.gen++; state.face = ""; state.looks = {}; state.queued = {}; state.queue = []; state.focus = null;
    state.done = 0; state.target = 0; state.requested = 0;
    document.body.classList.remove("alive"); state.alive = false;
    document.querySelectorAll(".card").forEach(function (c) { c.classList.remove("worn", "weaving", "pickable", "selected", "revealing"); c.querySelector(".look").removeAttribute("src"); });
    resetMirror();
    ["salonImg", "dockFace"].forEach(function (id) { $(id).removeAttribute("src"); });
    $("salonArch").classList.remove("has");
    $("heroEyebrow").textContent = "مجموعة الموسم";
    $("heroTitle").innerHTML = '<span class="ln"><span>المجموعة كاملة،</span></span><span class="ln"><span><em>عليكِ أنتِ</em></span></span>';
    $("heroTitle").classList.add("in");
    $("heroSub").textContent = "صورةٌ واحدة، وتظهر كل قطعة عليكِ قبل أن تختاري.";
    $("ctaUpload").querySelector("span").textContent = "جرّبي المجموعة";
    $("ctaSalon").querySelector("span").textContent = "جرّبي المجموعة";
    toast(MSG.forgot);
  });
  $("file").addEventListener("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    fileToFace(f).then(startWithFace).catch(function () { toast(MSG.badImg); });
  });

  /* ---------------- معاينة التصميم (?mock=1) ----------------
     ⚠️ مش AI: بنرسم صورة العميلة وعليها لمسة من لون القطعة عشان
        نراجع الحركة والتصميم من غير ما نصرف ولا نداء. */
  function mockLook(face, prod, slow) {
    return Promise.all([loadImg(face), loadImg(prod)]).then(function (im) {
      var f = im[0], p = im[1], W = 600, H = 800;
      var c = document.createElement("canvas"); c.width = W; c.height = H;
      var x = c.getContext("2d");
      var s = Math.max(W / f.naturalWidth, H / f.naturalHeight);
      x.drawImage(f, (W - f.naturalWidth * s) / 2, (H - f.naturalHeight * s) / 2, f.naturalWidth * s, f.naturalHeight * s);
      x.globalAlpha = .55; x.globalCompositeOperation = "color";
      x.drawImage(p, 0, 0, W, H);
      return new Promise(function (r) { setTimeout(function () { r(c.toDataURL("image/jpeg", .85)); }, (slow ? 2600 : 1400) + Math.random() * 1600); });
    });
  }
  function mockGrid(face, refs) {
    return Promise.all(refs.map(function (r) { return mockLook(face, r, false); })).then(function (looks) {
      if (looks.length === 1) return looks[0];
      var lay = AC.gridLayout(looks.length);
      return Promise.all(looks.map(loadImg)).then(function (ims) {
        var c = document.createElement("canvas"); c.width = 600 * lay.cols; c.height = 800 * lay.rows;
        var x = c.getContext("2d");
        ims.forEach(function (im, i) { x.drawImage(im, (i % lay.cols) * 600, Math.floor(i / lay.cols) * 800); });
        return c.toDataURL("image/jpeg", .9);
      });
    });
  }
  if (MOCK) document.body.appendChild(el("div", "demo-flag", "معاينة للتصميم فقط"));
  if (EMBED) {
    document.body.classList.add("embed");
    var x = el("button", "embed-x", "<i></i><i></i>"); x.type = "button"; x.setAttribute("aria-label", "رجوع");
    x.addEventListener("click", function () { toParent({ type: "tryon-close" }); });
    document.body.appendChild(x);
  }

  /* ============================================================
     ♡ المفضّلة · 👜 الحقيبة · ↗ المشاركة
     ------------------------------------------------------------
     كله على جهاز العميلة (localStorage). الطلب بيروح واتساب
     للفرع بأسماء القطع، والصور اللي بتتشارك بتتعمل على الموبايل
     ومبتتنشرش غير لو هي شاركتها.
     ============================================================ */
  var WA_NUMBER = SITE.whatsapp;
  var SITE_URL = "https://www.echarpe.store/atelier/";
  var celebrated = false;
  function readIds(k) { try { var v = JSON.parse((LS && LS.getItem(k)) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function writeIds(k, v) { try { LS && LS.setItem(k, JSON.stringify(v)); } catch (e) { } }
  var fav = readIds("atelier_fav"), bag = readIds("atelier_bag");
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { } }
  function lookCount() { return Object.keys(state.looks).length; }
  function isFav(p) { return fav.indexOf(p.id) >= 0; }
  function inBag(p) { return bag.indexOf(p.id) >= 0; }

  function toggleFav(p) {
    var i = fav.indexOf(p.id);
    if (i >= 0) fav.splice(i, 1); else { fav.push(p.id); buzz(); }
    writeIds("atelier_fav", fav);
    syncHearts(p, true);
  }
  function syncHearts(p, pop) {
    var on = isFav(p);
    var list = [];
    var c = card(p.id); if (c) list.push(c.querySelector(".card-heart"));
    if (mirrorP === p) list.push($("mHeart"));
    if (state.lbOpen === p) list.push($("lbHeart"));
    list.forEach(function (h) {
      if (!h) return;
      h.classList.toggle("on", on); h.setAttribute("aria-pressed", on);
      if (pop && on) { h.classList.remove("pop"); void h.offsetWidth; h.classList.add("pop"); }
    });
  }
  function syncMirrorActs() {
    if (!mirrorP) return;
    syncHearts(mirrorP);
    $("mBag").querySelector("span").textContent = inBag(mirrorP) ? "في حقيبتكِ ✓" : "أضيفيها للحقيبة";
  }
  $("mHeart").addEventListener("click", function () { if (mirrorP) toggleFav(mirrorP); });
  $("lbHeart").addEventListener("click", function () { if (state.lbOpen) toggleFav(state.lbOpen); });

  /* ---------- الحقيبة ---------- */
  function syncBagCount() {
    var n = bag.filter(function (id) { return state.byId[id]; }).length;
    document.querySelectorAll(".bag-btn").forEach(function (b) {
      b.classList.toggle("has", n > 0); b.querySelector(".bagCount").textContent = n;
    });
  }
  function bagTarget() {
    var d = $("dockBag");
    return state.alive && d.getBoundingClientRect().width ? d : $("bagBtn");
  }
  function flyToBag(srcImg) {
    var tgt = bagTarget();
    if (!srcImg || REDUCED) { tgt.classList.remove("bump"); void tgt.offsetWidth; tgt.classList.add("bump"); return; }
    var r = srcImg.getBoundingClientRect(), t = tgt.getBoundingClientRect();
    var size = Math.min(r.width, r.height, 160);
    var f = el("img", "fly"); f.src = srcImg.currentSrc || srcImg.src;
    f.style.left = (r.left + r.width / 2 - size / 2) + "px"; f.style.top = (r.top + r.height / 2 - size / 2) + "px";
    f.style.width = f.style.height = size + "px";
    document.body.appendChild(f); void f.offsetWidth;
    var dx = (t.left + t.width / 2) - (r.left + r.width / 2), dy = (t.top + t.height / 2) - (r.top + r.height / 2);
    f.style.transform = "translate(" + dx + "px," + dy + "px) scale(.12)"; f.style.opacity = ".4";
    setTimeout(function () {
      f.remove(); tgt.classList.remove("bump"); void tgt.offsetWidth; tgt.classList.add("bump");
    }, 860);
  }
  function addToBag(p, srcImg) {
    if (inBag(p)) { openSheet("bag"); return; }
    bag.push(p.id); writeIds("atelier_bag", bag); buzz();
    flyToBag(srcImg);
    setTimeout(syncBagCount, 700);
    syncMirrorActs(); if (state.lbOpen === p) setLb(p);
    if (state.face && grantBonus()) {
      toast("🎁 أُضيفت «" + p.name + "» — وحصلتِ على تجربة كمان! اختاري أي قطعة وجرّبيها بألوانها", 6500);
      syncPickable(); updateDock();
    } else toast("أُضيفت «" + p.name + "» إلى حقيبتكِ 🤍");
  }
  function removeFromBag(id) {
    bag = bag.filter(function (x) { return x !== id; }); writeIds("atelier_bag", bag);
    syncBagCount(); renderBag(); syncMirrorActs();
    if (state.lbOpen) setLb(state.lbOpen);
  }
  function renderBag() {
    var items = bag.map(function (id) { return state.byId[id]; }).filter(Boolean);
    var list = $("bagList"); list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = '<div class="bag-empty">حقيبتكِ في انتظار قطعتها الأولى 🤍</div>';
      $("bagFoot").style.display = "none"; return;
    }
    $("bagFoot").style.display = "";
    var total = 0;
    items.forEach(function (p) {
      total += p.price || 0;
      var row = el("div", "bag-item");
      row.innerHTML = '<img alt=""><div><b>' + esc(displayName(p)) + '</b><small>' +
        esc([colorLabel(p), p.price ? AC.fmtPrice(p.price) : "", state.looks[p.id] ? "جرّبتِها ✓" : ""].filter(Boolean).join(" · ")) +
        '</small></div><button class="rm" type="button">إزالة</button>';
      row.querySelector("img").src = state.looks[p.id] || p.img;
      row.querySelector(".rm").addEventListener("click", function () { removeFromBag(p.id); });
      list.appendChild(row);
    });
    $("bagTotal").textContent = items.length + (items.length === 1 ? " قطعة" : " قطع") + (total ? " · " + AC.fmtPrice(total) : "");
    var lines = ["أهلاً echarpe 🤍", "جرّبت القطع دي في غرفة القياس وعاوزة أطلبها:"];
    items.forEach(function (p) {
      lines.push("• " + displayName(p) + (colorLabel(p) ? " (" + colorLabel(p) + ")" : "") + (p.price ? " — " + AC.fmtPrice(p.price) : "") + (p.barcode ? " [" + p.barcode + "]" : ""));
    });
    lines.push("", "شكراً!");
    $("bagWa").href = "https://wa.me/" + SITE.whatsapp + "?text=" + encodeURIComponent(lines.join("\n"));
    showBagStep("list");
  }
  function openSheet(id) {
    if (id === "bag") { renderBag(); }
    $(id).classList.add("on"); document.body.style.overflow = "hidden";
  }
  function closeSheet(id) {
    $(id).classList.remove("on");
    if (!$("lb").classList.contains("on")) document.body.style.overflow = "";
  }
  ["bag", "shareSheet"].forEach(function (id) {
    $(id).addEventListener("click", function (e) { if (e.target.closest("[data-close]")) closeSheet(id); });
  });
  $("bagBtn").addEventListener("click", function () { openSheet("bag"); });
  function smallJpeg(src) {
    return loadImg(src).then(function (img) { return imgToJpeg(img, 360, 0.82); }).catch(function () { return ""; });
  }
  /* ============================================================
     🧾 إتمام الطلب جوّه الحقيبة
     · توصيل (أو أي طلب من الموقع) → atelierOrderPlace: الطلب بيتسجّل
       والمالك بيوصله إشعار بصورة القطعة. **مفيش POS.**
     · استلام من الفرع جوّه التطبيق وكل القطع ليها باركود → سلة التطبيق
       العادية (onlineOrderPlace → POS) — ده الطريق الوحيد للـPOS.
     · لو الدالة مش منشورة/وقعت → واتساب بكل التفاصيل (الطلب ميضيعش).
     ============================================================ */
  var EG_GOVS = ["القاهرة", "الجيزة", "القليوبية", "الإسكندرية", "الدقهلية", "الشرقية", "الغربية", "المنوفية",
    "البحيرة", "كفر الشيخ", "دمياط", "بورسعيد", "الإسماعيلية", "السويس", "الفيوم", "بني سويف", "المنيا", "أسيوط",
    "سوهاج", "قنا", "الأقصر", "أسوان", "البحر الأحمر", "مطروح", "شمال سيناء", "جنوب سيناء", "الوادي الجديد"];
  var co = { ful: "delivery", branch: "" };
  function bagItems() { return bag.map(function (id) { return state.byId[id]; }).filter(Boolean); }
  function showBagStep(step) {
    $("bagList").classList.toggle("hidden", step !== "list");
    $("bagFoot").style.display = step === "list" && bagItems().length ? "" : "none";
    $("checkout").classList.toggle("hidden", step !== "form");
    $("orderDone").classList.toggle("hidden", step !== "done");
  }
  function fillCheckout() {
    var gov = $("coGov");
    if (!gov.options.length) gov.innerHTML = '<option value="">اختاري المحافظة</option>' +
      (SITE.governorates && SITE.governorates.length ? SITE.governorates : EG_GOVS).map(function (g) { return "<option>" + esc(g) + "</option>"; }).join("");
    var bb = $("coBranches"); bb.innerHTML = "";
    SITE.branches.forEach(function (b) {
      var x = el("button", b === co.branch ? "on" : "", esc(b)); x.type = "button";
      x.addEventListener("click", function () { co.branch = b; fillCheckout(); });
      bb.appendChild(x);
    });
    try {
      if (!$("coPhone").value) $("coPhone").value = (LS && (LS.getItem("atelier_phone") || LS.getItem("echarpe_loyalty_phone"))) || "";
      if (!$("coName").value) $("coName").value = (LS && LS.getItem("atelier_name")) || "";
    } catch (e) { }
    document.querySelectorAll("#checkout .seg button").forEach(function (b) { b.classList.toggle("on", b.dataset.ful === co.ful); });
    $("coDelivery").classList.toggle("hidden", co.ful !== "delivery");
    $("coPickup").classList.toggle("hidden", co.ful !== "pickup");
    var items = bagItems(), sub = items.reduce(function (t, p) { return t + (p.price || 0); }, 0);
    var ship = co.ful === "delivery" ? (SITE.freeOver && sub >= SITE.freeOver ? 0 : SITE.shippingFee) : 0;
    $("coSum").innerHTML = arN(items.length) + (items.length === 1 ? " قطعة" : " قطع") +
      (sub ? " · " + esc(AC.fmtPrice(sub)) : "") +
      (co.ful === "delivery" ? "<br>الشحن: " + (ship ? esc(AC.fmtPrice(ship)) : "مجاني") : "") +
      (sub ? "<br><b>الإجمالي: " + esc(AC.fmtPrice(sub + ship)) + "</b>" : "<br><small>السعر بنأكّده معاكِ على واتساب</small>");
  }
  $("bagCheckout").addEventListener("click", function () { $("coErr").textContent = ""; fillCheckout(); showBagStep("form"); });
  $("coBack").addEventListener("click", function () { showBagStep("list"); });
  document.querySelectorAll("#checkout .seg button").forEach(function (b) {
    b.addEventListener("click", function () { co.ful = b.dataset.ful; fillCheckout(); });
  });
  function cleanPhone(v) {
    var d = String(v || "").replace(/[^\d]/g, "");
    if (d.indexOf("0020") === 0) d = d.slice(4); else if (d.indexOf("20") === 0 && d.length === 12) d = d.slice(2);
    if (d.length === 10 && d.charAt(0) === "1") d = "0" + d;
    return /^01[0125]\d{8}$/.test(d) ? d : "";
  }
  $("checkout").addEventListener("submit", function (e) {
    e.preventDefault();
    var items = bagItems(); if (!items.length) return;
    var f = { name: $("coName").value.trim(), phone: cleanPhone($("coPhone").value), fulfillment: co.ful,
      governorate: $("coGov").value, address: $("coAddr").value.trim(), branch: co.branch, notes: $("coNotes").value.trim() };
    var err = f.name.length < 2 ? "اكتبي اسمكِ" : !f.phone ? "رقم الموبايل مش مظبوط (01xxxxxxxxx)" :
      co.ful === "delivery" && (!f.governorate || f.address.length < 6) ? "اكتبي المحافظة والعنوان بالتفصيل" :
      co.ful === "pickup" && !f.branch ? "اختاري الفرع" : "";
    $("coErr").textContent = err; if (err) return;
    try { LS && LS.setItem("atelier_name", f.name); LS && LS.setItem("atelier_phone", f.phone); } catch (e2) { }
    // استلام من الفرع جوّه التطبيق + كله بباركود → سلة التطبيق (POS)
    if (EMBED && co.ful === "pickup" && items.every(function (p) { return p.barcode; })) {
      Promise.all(items.map(function (p) { return smallJpeg(p.img); })).then(function (imgs) {
        toParent({ type: "atelier-order", items: items.map(function (p, i) {
          return { barcode: p.barcode, name: displayName(p) + (colorLabel(p) ? " — " + colorLabel(p) : ""), img: imgs[i] };
        }), note: "جرّبتها في غرفة القياس" + (f.notes ? " · " + f.notes : "") });
        bag = []; writeIds("atelier_bag", bag); syncBagCount(); closeSheet("bag");
      });
      return;
    }
    var btn = $("coSubmit"); btn.disabled = true; btn.querySelector("span").textContent = "بنسجّل طلبكِ…";
    var payload = Object.assign({}, f, { source: EMBED ? "app" : "web", items: items.map(function (p) {
      return { docId: p.docId || "", barcode: p.barcode || "", name: displayName(p), model: modelOf[p.id] ? modelOf[p.id].title : "",
               color: p.colorNo || 0, img: p.house ? p.img : "" };
    }) });
    var call = MOCK || !fb ? Promise.reject({ code: "mock" }) : authReady.then(function () { return callable("atelierOrderPlace")(payload); });
    call.then(function (res) {
      var d = (res && res.data) || {};
      orderDone("رقم الطلب " + (d.code || "") + (d.total ? " · الإجمالي " + AC.fmtPrice(d.total) : "") +
        "<br>هنكلمكِ على واتساب على " + esc(f.phone) + " للتأكيد 🤍");
    }).catch(function (er) {
      var code = String(er && er.code || "").replace(/^functions\//, "");
      if (code === "resource-exhausted" || code === "invalid-argument") {
        $("coErr").textContent = (er && er.message && code === "resource-exhausted") ? er.message : "راجعي البيانات وجرّبي تاني"; return;
      }
      // الدالة مش متاحة → واتساب بكل التفاصيل عشان الطلب ميضيعش
      var t = ["أهلاً echarpe 🤍 عاوزة أطلب من غرفة القياس:"];
      items.forEach(function (p) { t.push("• " + displayName(p) + (colorLabel(p) ? " (" + colorLabel(p) + ")" : "") + (p.price ? " — " + AC.fmtPrice(p.price) : "")); });
      t.push("", "الاسم: " + f.name, "الموبايل: " + f.phone,
        co.ful === "delivery" ? "توصيل: " + f.governorate + " — " + f.address : "استلام من فرع: " + f.branch);
      if (f.notes) t.push("ملاحظات: " + f.notes);
      window.open("https://wa.me/" + SITE.whatsapp + "?text=" + encodeURIComponent(t.join("\n")), "_blank");
      orderDone("بعتنا طلبكِ على واتساب — ابعتي الرسالة وهنأكّد معاكِ في دقائق 🤍");
    }).then(function () { btn.disabled = false; btn.querySelector("span").textContent = "تأكيد الطلب"; });
  });
  function orderDone(html) {
    $("doneText").innerHTML = html;
    bag = []; writeIds("atelier_bag", bag); syncBagCount(); syncMirrorActs();
    showBagStep("done"); buzz();
  }

  $("dockBag").addEventListener("click", function () { openSheet("bag"); });
  $("mBag").addEventListener("click", function () {
    if (mirrorP) addToBag(mirrorP, $("mirror").querySelector(".m-layer.base"));
  });
  $("lbBag").addEventListener("click", function () { if (state.lbOpen) addToBag(state.lbOpen, $("lbLook")); });

  /* ---------- المشاركة: صورة ستوري بلوجو echarpe ---------- */
  var AR_NUM = ["١", "٢", "٣", "٤"];
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([document.fonts.load('400 72px "Amiri"'), document.fonts.load('400 36px "IBM Plex Sans Arabic"')])
      .catch(function () { });
  }
  function archPath(x, y, w, h, ctx) {
    var r = w / 2;
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath();
  }
  function drawArch(ctx, img, x, y, w, h) {
    ctx.save();
    ctx.shadowColor = "rgba(28,25,22,.28)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 26;
    archPath(x, y, w, h, ctx); ctx.fillStyle = "#e4dbcf"; ctx.fill();
    ctx.restore();
    ctx.save(); archPath(x, y, w, h, ctx); ctx.clip();
    var s = Math.max(w / img.naturalWidth, h / img.naturalHeight), iw = img.naturalWidth * s, ih = img.naturalHeight * s;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) * 0.3, iw, ih);
    ctx.restore();
    ctx.save(); archPath(x + 12, y + 12, w - 24, h - 24, ctx);
    ctx.strokeStyle = "rgba(255,252,246,.7)"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }
  function txt(ctx, t, x, y, font, color) {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.direction = "rtl"; ctx.fillText(t, x, y);
  }
  function makeStory(items, poll) {
    var W = 1080, H = 1920;
    return Promise.all([fontsReady(), loadImg("../logo.png").catch(function () { return null; })]
      .concat(items.map(function (p) { return loadImg(state.looks[p.id] || p.img); }))).then(function (res) {
      var logo = res[1], imgs = res.slice(2);
      var c = document.createElement("canvas"); c.width = W; c.height = H;
      var x = c.getContext("2d");
      var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#fbf8f3"); g.addColorStop(1, "#ede6dc");
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      if (logo) { var lw = 280, lh = lw * logo.naturalHeight / logo.naturalWidth; x.drawImage(logo, (W - lw) / 2, 96, lw, lh); }
      if (!poll) {
        drawArch(x, imgs[0], 150, 300, 780, 1060);
        txt(x, items[0].name, W / 2, 1490, '400 76px "Amiri", serif', "#1c1916");
        var ln = AC.lineName(items[0].line);
        if (ln) txt(x, "من مجموعة " + ln, W / 2, 1556, '400 34px "IBM Plex Sans Arabic", sans-serif', "#8a6f4e");
      } else {
        txt(x, "أي واحدة أختار؟", W / 2, 330, '400 92px "Amiri", serif', "#1c1916");
        txt(x, "ساعدوني 🤍", W / 2, 400, '400 38px "IBM Plex Sans Arabic", sans-serif', "#8a6f4e");
        // الترتيب من اليمين (١ يمين فوق) — زي القراية بالعربي
        var cw = 390, ch = 520, n = imgs.length;
        var pos = n === 2 ? [[630, 640], [120, 640]] :
          n === 3 ? [[630, 470], [120, 470], [345, 1060]] : [[630, 470], [120, 470], [630, 1060], [120, 1060]];
        imgs.forEach(function (im, i) {
          var px = pos[i][0], py = pos[i][1];
          drawArch(x, im, px, py, cw, ch);
          x.beginPath(); x.arc(px + cw / 2, py + ch, 40, 0, Math.PI * 2); x.fillStyle = "#1c1916"; x.fill();
          txt(x, AR_NUM[i], px + cw / 2, py + ch + 16, '400 46px "Amiri", serif', "#f6f2ec");
        });
      }
      x.fillStyle = "rgba(138,111,78,.5)"; x.fillRect(W / 2 - 60, 1672, 120, 2);
      txt(x, "جرّبي المجموعة عليكِ", W / 2, 1760, '400 54px "Amiri", serif', "#1c1916");
      x.direction = "ltr";
      x.font = '400 32px "IBM Plex Sans Arabic", sans-serif'; x.fillStyle = "#8a6f4e"; x.textAlign = "center";
      x.fillText("echarpe.store/atelier", W / 2, 1828);
      return c;
    });
  }
  var shareFile = null, shareText = "";
  function openShare(items, poll) {
    shareFile = null;
    $("shareTitle").textContent = poll ? "اسألي صديقاتكِ" : "شاركي إطلالتكِ";
    $("shareImg").removeAttribute("src");
    openSheet("shareSheet");
    shareText = poll
      ? "ساعدوني أختار 🤍 أي واحدة أحلى؟ جرّبتهم كلهم عليّا في echarpe — جرّبي إنتِ كمان: " + SITE_URL
      : "جرّبت «" + items[0].name + "» عليّا في غرفة القياس من echarpe 🤍 جرّبي إنتِ كمان: " + SITE_URL;
    makeStory(items, poll).then(function (c) {
      var url = c.toDataURL("image/jpeg", 0.9);
      $("shareImg").src = url; $("shareSave").href = url;
      $("shareSave").download = poll ? "echarpe-ساعديني-أختار.jpg" : "echarpe-إطلالتي.jpg";
      c.toBlob(function (b) { if (b) shareFile = new File([b], "echarpe.jpg", { type: "image/jpeg" }); }, "image/jpeg", 0.9);
    }).catch(function () { closeSheet("shareSheet"); toast(MSG.generic || "تعذّر تجهيز الصورة."); });
  }
  $("shareGo").addEventListener("click", function () {
    var data = { title: "echarpe", text: shareText };
    if (shareFile && navigator.canShare && navigator.canShare({ files: [shareFile] })) data.files = [shareFile];
    else data.url = SITE_URL;
    if (navigator.share) navigator.share(data).catch(function () { });
    else $("shareSave").click();
  });
  function shareOne(p) { openShare([p], false); }
  $("mShare").addEventListener("click", function () { if (mirrorP) shareOne(mirrorP); });
  $("lbShare").addEventListener("click", function () { if (state.lbOpen) shareOne(state.lbOpen); });
  $("dockPoll").addEventListener("click", function () {
    $("dockPoll").classList.remove("glow");
    var withLook = state.products.filter(function (p) { return state.looks[p.id]; });
    var pick = withLook.filter(isFav).concat(withLook.filter(function (p) { return !isFav(p); })).slice(0, 4);
    if (pick.length < 2) { toast("جرّبي قطعتين على الأقل لتسألي صديقاتكِ 🤍"); return; }
    openShare(pick, true);
  });

  /* ---------------- البداية ---------------- */
  /* ⚙️ إعدادات الموقع من صفحة الإدارة — النصوص والبانر والواتساب والفروع */
  function loadSite() {
    if (MOCK || !fb) return Promise.resolve();
    var col = fb.firestore().collection("pos_test_settings");
    return authReady.then(function () {
      return Promise.all([col.doc("atelier_site").get(), col.doc("online_shop_echarpe_cfg").get().catch(function () { return null; })]);
    }).then(function (r) {
      var cfg = r[1] && r[1].exists ? r[1].data() : {};
      if (cfg.shippingFee != null) SITE.shippingFee = Number(cfg.shippingFee) || 0;
      if (cfg.freeOver) SITE.freeOver = Number(cfg.freeOver) || 0;
      if (Array.isArray(cfg.governorates) && cfg.governorates.length) SITE.governorates = cfg.governorates;
      if (!r[0].exists) return;
      var d = r[0].data() || {};
      applySite(d);
      if (d.hasBanner) col.doc("atelier_site_banner").get().then(function (b) {
        var u = b.exists ? b.data().img : "";
        if (AC.isImageDataUrl(u)) document.querySelector(".banner-img img").src = u;
      }).catch(function () { });
    }).catch(function () { });
  }
  function applySite(d) {
    var set = function (id, v) { if (v && $(id)) $(id).textContent = v; };
    if (/^\d{10,15}$/.test(String(d.whatsapp || ""))) SITE.whatsapp = String(d.whatsapp);
    if (d.chatText) SITE.chatText = String(d.chatText).slice(0, 300);
    if (Array.isArray(d.branches) && d.branches.length) SITE.branches = d.branches.map(String).slice(0, 12);
    if (!state.alive) {
      set("heroEyebrow", d.eyebrow); set("heroSub", d.sub);
      if (d.title1 || d.title2) $("heroTitle").innerHTML = '<span class="ln"><span>' + esc(d.title1 || "") + '</span></span><span class="ln"><span><em>' + esc(d.title2 || "") + "</em></span></span>";
      $("heroTitle").classList.add("in");
    }
    if (d.statement) { var st = document.querySelector(".statement p"); st.textContent = d.statement; st.parentNode.classList.add("in"); }
    if (d.marquee) {
      var words = String(d.marquee).split(/[،,]/).map(function (w) { return w.trim(); }).filter(Boolean).slice(0, 12);
      if (words.length) { var one = words.map(function (w) { return "<span>" + esc(w) + "</span><span><b>✦</b></span>"; }).join(""); $("marquee").innerHTML = one + one; }
    }
    var mc = document.querySelector(".more-card p"); if (mc) mc.textContent = SITE.chatText;
  }

  Promise.all([loadProducts(), loadSite()]).then(function (r) {
    var items = r[0];
    state.products = items;
    items.forEach(function (p) { state.byId[p.id] = p; });
    buildModels();
    renderHero(); renderFilters(); renderGrid(); syncBagCount(); updateDock();
    var saved = LS ? PC.readFace(LS) : "";
    if (saved) { $("salonImg").src = saved; $("salonArch").classList.add("has"); }
  });
})();
