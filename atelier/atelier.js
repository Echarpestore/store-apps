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
    limit: "جرّبتِ جولتين اليوم 🤍 نكمّل غداً بإطلالات جديدة.",
    retry: "تعذّر تجهيز بعض القطع — المسي «جرّبيها» لإعادة المحاولة.",
    badImg: "تعذّرت قراءة الصورة — جرّبي صورةً أخرى.",
    isdalSoon: "تجربة الإسدال تتوفّر قريباً.",
    forgot: "تم حذف صورتكِ وإطلالاتكِ من هاتفكِ."
  };

  var state = {
    products: [], byId: {}, face: "", alive: false,
    looks: {}, queued: {}, requested: 0, done: 0, target: 0,
    mode: "lookbook", lookbookWorked: false, stopped: false,
    queue: [], sel: [], busy: 0, gen: 0, lbOpen: null, line: "all"
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
    var words = ["كريب", "بليسيه", "مونوجرام", "زيبرا", "إسدال", "echarpe"];
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

  /* ---------------- الواجهة: المرآة + عيّنات القماش ----------------
     مفيش سلايدر بيتحرك لوحده: العميلة بتختار العيّنة، والمرآة
     بتبدّل القطعة عليها بستارة حرير. قبل الصورة = صورة المنتج،
     وبعدها = إطلالتها هي. */
  var mirrorP = null, mirrorShown = "", userPicked = false, paintT = 0;
  function tryables() { return state.products.filter(function (p) { return p.tryable; }); }
  function renderHero() {
    var box = $("swatches"); box.innerHTML = "";
    tryables().forEach(function (p) {
      var b = el("button", "sw"); b.type = "button"; b.dataset.id = p.id;
      b.setAttribute("aria-label", p.name); b.setAttribute("role", "option");
      b.innerHTML = '<span class="clip"><img alt="" loading="lazy"></span><i class="dot"></i>';
      b.querySelector("img").src = p.img;
      b.addEventListener("click", function () { userPicked = true; setMirror(p); });
      box.appendChild(b);
    });
    var first = tryables()[0] || state.products[0];
    if (first) setMirror(first, true);
  }
  function setMirror(p, instant) {
    mirrorP = p;
    document.querySelectorAll(".sw").forEach(function (sw) {
      var on = sw.dataset.id === p.id; sw.classList.toggle("on", on); sw.setAttribute("aria-selected", on);
      if (on && !instant) centerSwatch(sw);
    });
    $("mName").textContent = p.name;
    $("mLine").textContent = AC.lineName(p.line) ? "من مجموعة " + AC.lineName(p.line) : "";
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
  /* سحب المرآة يمين/شمال = القطعة اللي بعدها/قبلها */
  var swipeX = null, swiped = false;
  $("mirror").addEventListener("pointerdown", function (e) { swipeX = e.clientX; swiped = false; });
  $("mirror").addEventListener("pointerup", function (e) {
    if (swipeX == null) return;
    var dx = e.clientX - swipeX; swipeX = null;
    if (Math.abs(dx) > 45) { swiped = true; stepMirror(dx < 0 ? 1 : -1); }
  });
  function stepMirror(d) {
    var list = tryables(); if (!list.length) return;
    var i = Math.max(0, list.indexOf(mirrorP));
    userPicked = true; setMirror(list[(i + d + list.length) % list.length]); buzz();
  }
  $("mirror").addEventListener("click", function () {
    if (swiped) { swiped = false; return; }
    if (mirrorP) openLook(mirrorP);
  });
  $("mirror").addEventListener("keydown", function (e) { if (e.key === "Enter" && mirrorP) openLook(mirrorP); });
  function resetMirror() {
    document.querySelectorAll(".sw").forEach(function (sw) { sw.classList.remove("worn"); });
    userPicked = false; mirrorShown = "";
    if (mirrorP) setMirror(mirrorP, true);
  }

  /* ---------------- المجموعة ---------------- */
  var io = null;
  function renderFilters() {
    var box = $("filters"), counts = { all: state.products.length };
    state.products.forEach(function (p) { counts[p.line] = (counts[p.line] || 0) + 1; });
    var lines = AC.LINES.slice();
    if (counts.shop) lines.splice(1, 0, { id: "shop", ar: "الجديد" });
    box.innerHTML = "";
    lines.forEach(function (l) {
      if (!counts[l.id]) return;
      var b = el("button", l.id === state.line ? "on" : "", esc(l.ar) + "<sup>" + counts[l.id] + "</sup>");
      b.type = "button"; b.setAttribute("role", "tab");
      b.addEventListener("click", function () { setLine(l.id); });
      box.appendChild(b);
    });
  }
  function setLine(id) {
    state.line = id;
    Array.prototype.forEach.call($("filters").children, function (b, i) { b.classList.remove("on"); });
    renderFilters();
    document.querySelectorAll(".card").forEach(function (c) {
      var p = state.byId[c.dataset.id];
      var show = id === "all" || p.line === id;
      c.classList.toggle("hide", !show);
      if (show) { c.classList.remove("in"); requestAnimationFrame(function () { requestAnimationFrame(function () { c.classList.add("in"); }); }); }
    });
  }

  function renderGrid() {
    var g = $("grid"); g.innerHTML = "";
    if (!state.products.length) { g.innerHTML = '<div class="empty">تُعَدّ المجموعة الجديدة… قريباً.</div>'; return; }
    io = "IntersectionObserver" in window ? new IntersectionObserver(onSeen, { rootMargin: "0px 0px -8% 0px" }) : null;
    state.products.forEach(function (p, i) {
      var c = el("article", "card");
      c.dataset.id = p.id; c.dataset.i = i;
      c.innerHTML =
        '<div class="frame" role="button" tabindex="0">' +
          '<img class="prod" alt="" loading="lazy"><img class="look" alt="">' +
          '<i class="sheen"></i><div class="weave"></div><div class="weave-txt">نُجهّزها لكِ…</div>' +
          '<div class="chip"><img alt=""></div>' +
          '<button class="try-btn" type="button">اختاريها</button>' +
          '<button class="card-heart heart" type="button" aria-label="أضيفي للمفضّلة"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" stroke="currentColor" stroke-width="1.3"/></svg></button>' +
        '</div>' +
        '<div class="meta"><span class="nm">' + esc(p.name) + '</span>' +
          (p.price ? '<span class="pr">' + esc(AC.fmtPrice(p.price)) + '</span>' :
            (AC.lineName(p.line) ? '<span class="lt">' + esc(AC.lineName(p.line)) + '</span>' : '')) +
        '</div>';
      c.querySelector(".prod").src = p.img;
      c.querySelector(".prod").alt = p.name;
      c.querySelector(".chip img").src = p.img;
      var frame = c.querySelector(".frame");
      frame.addEventListener("click", function (e) {
        if (e.target.closest(".try-btn")) { e.stopPropagation(); toggleSel(p); return; }
        if (e.target.closest(".card-heart")) { e.stopPropagation(); toggleFav(p); return; }
        openLook(p);
      });
      frame.addEventListener("keydown", function (e) { if (e.key === "Enter") openLook(p); });
      g.appendChild(c);
      syncHearts(p);
      if (io) io.observe(c); else c.classList.add("in");
    });
  }
  function card(id) { return document.querySelector('.card[data-id="' + CSS.escape(id) + '"]'); }

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
    state.looks = {}; state.queued = {}; state.queue = []; state.sel = [];
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
      // الجولة الأولى لوحدها — أول ٦ طرح مالهاش إطلالة جاهزة
      var first = AC.firstRound(state.products, state.looks);
      if (first.length && roundsLeft() > 0) runRound(first);
      syncPickable(); updateDock();
    });
  }

  /* ---------------- الجولات: نداءين توليد بس لكل عميلة في اليوم ----------------
     الجولة = لحد ٦ قطع من نفس النوع في نداء واحد. الأولى لوحدها،
     والتانية العميلة بتختار قطعها. */
  var ROUNDS_KEY = "atelier_rounds";
  function today() { return new Date().toLocaleDateString("en-CA"); }
  function roundsUsed() {
    var rec = null; try { rec = JSON.parse((LS && LS.getItem(ROUNDS_KEY)) || "null"); } catch (e) { }
    return AC.roundsUsedToday(rec, today());
  }
  function setRoundsUsed(n) { try { LS && LS.setItem(ROUNDS_KEY, JSON.stringify({ day: today(), n: n })); } catch (e) { } }
  function roundsLeft() { return Math.max(0, AC.ROUNDS_PER_DAY - roundsUsed()); }
  function generating() { return state.busy > 0 || state.queue.length > 0; }

  function runRound(list) {
    if (!list.length) return;
    if (state.mode === "single" && list[0].kind === "isdal") { toast(MSG.isdalSoon); return; }
    setRoundsUsed(roundsUsed() + 1);
    list.forEach(function (p) {
      state.queued[p.id] = true; state.target++;
      var c = card(p.id); if (c) { c.classList.remove("pickable", "selected"); c.classList.add("weaving"); }
      state.queue.push(p);
      if (mirrorP === p) $("mirror").classList.add("busy");
    });
    state.sel = []; syncPickable();
    updateDock(); pump();
  }

  /* اختيار قطع الجولة الجاية */
  function toggleSel(p) {
    if (!state.face) { pickPhoto(); return; }
    var i = state.sel.indexOf(p);
    if (i >= 0) { state.sel.splice(i, 1); }
    else if (!roundsLeft()) { toast(MSG.limit); return; }
    else {
      var ok = AC.canSelect(state.sel, p, state.looks);
      if (ok === "full") { toast("٦ قطع في كل جولة — جهّزيها أولاً 🤍"); return; }
      if (ok === "kind") { toast("الإسدال يُجرَّب في جولة وحده — جهّزي الطُرَح أولاً"); return; }
      if (ok !== "ok" || state.queued[p.id]) return;
      state.sel.push(p); buzz();
    }
    syncPickable(); updateDock();
    if (state.lbOpen === p) setLb(p);
  }
  function syncPickable() {
    var left = roundsLeft() > 0;
    state.products.forEach(function (p) {
      var c = card(p.id), sel = state.sel.indexOf(p) >= 0;
      var pickable = state.alive && left && p.tryable && !state.looks[p.id] && !state.queued[p.id];
      if (c) {
        c.classList.toggle("pickable", pickable); c.classList.toggle("selected", sel);
        c.querySelector(".try-btn").textContent = sel ? "✓ مختارة" : "اختاريها";
      }
      var sw = document.querySelector('.sw[data-id="' + CSS.escape(p.id) + '"]');
      if (sw) sw.classList.toggle("selected", sel);
    });
    syncMirrorPick();
  }
  function syncMirrorPick() {
    var b = $("mPick"); if (!mirrorP) return;
    var pickable = state.alive && roundsLeft() > 0 && mirrorP.tryable && !state.looks[mirrorP.id] && !state.queued[mirrorP.id];
    var sel = state.sel.indexOf(mirrorP) >= 0;
    b.classList.toggle("show", pickable); b.classList.toggle("on", sel);
    b.textContent = sel ? "✓ مختارة للتجربة" : "اختاريها للتجربة";
  }
  $("mPick").addEventListener("click", function () { if (mirrorP) toggleSel(mirrorP); });
  $("dockGo").addEventListener("click", function () {
    if (!state.sel.length || generating()) return;
    runRound(state.sel.slice());
  });

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
        setRoundsUsed(AC.ROUNDS_PER_DAY);
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
    });
    syncPickable();
  }
  /* بعد كل جولة: نوجّهها للخطوة الجاية */
  function roundFinished() {
    if (!lookCount()) return;
    setTimeout(function () {
      if (roundsLeft() > 0) toast("إطلالاتكِ الأولى جاهزة ✨ اختاري ٦ قطع أخرى لتجرّبيها", 6000);
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
    var sw = document.querySelector('.sw[data-id="' + CSS.escape(p.id) + '"]');
    if (sw) sw.classList.add("worn");
    // أول إطلالة جاهزة تظهر في المرآة على طول — لحد ما العميلة تختار بنفسها
    if (mirrorP === p) setMirror(p);
    else if (!userPicked && (!mirrorP || !state.looks[mirrorP.id])) setMirror(p);
    if (state.lbOpen === p) setLb(p);
    updateDock();
  }

  function arN(n) { return Number(n).toLocaleString("ar-EG"); }
  function looksWord(n) { return n === 1 ? "إطلالة واحدة" : n === 2 ? "إطلالتان" : arN(n) + (n <= 10 ? " إطلالات" : " إطلالة"); }
  function updateDock() {
    var t = Math.max(state.target, state.done), d = state.done, left = roundsLeft(), n = state.sel.length;
    var sub;
    if (generating()) sub = "نُجهّز إطلالاتكِ…";
    else if (n) sub = "اخترتِ " + arN(n) + " من ٦ — في جولة واحدة";
    else if (left > 0 && lookCount()) sub = "اختاري ٦ قطع أخرى ✨";
    else if (!left && lookCount()) sub = looksWord(lookCount()) + " اليوم — نكمّل غداً 🤍";
    else sub = "نُجهّز إطلالاتكِ…";
    $("dockSub").textContent = sub;
    $("dockProg").style.width = t ? Math.round(d / t * 100) + "%" : "0";
    var go = $("dockGo");
    go.classList.toggle("show", n > 0 && !generating());
    go.textContent = "جهّزيها عليّ (" + arN(n) + ")";
    $("dockPoll").style.display = lookCount() >= 2 && !n ? "" : "none";
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
    if (p.admin) fullSrc(p).then(function (u) {
      if (state.lbOpen !== p) return;
      $("lbProd").src = u; if (!state.looks[p.id]) $("lbLook").src = u;
    });
    pic.querySelector(".chip").style.display = look ? "" : "none";
    $("lbLine").textContent = AC.lineName(p.line) ? "من مجموعة " + AC.lineName(p.line) : "";
    $("lbName").textContent = p.name;
    $("lbPrice").textContent = p.price ? AC.fmtPrice(p.price) : "";
    var busy = state.queued[p.id] && !look, sel = state.sel.indexOf(p) >= 0;
    var b = $("lbTry");
    b.style.display = look || !p.tryable || (state.face && !roundsLeft() && !busy) ? "none" : "";
    b.disabled = !!busy;
    b.querySelector("span").textContent = busy ? "نُجهّزها لكِ…" : (!state.face ? "جرّبيها عليكِ" : (sel ? "✓ مختارة للتجربة" : "اختاريها للتجربة"));
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
    if (!state.face) { closeLb(); pickPhoto(); return; }
    toggleSel(p); setLb(p);
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
    state.gen++; state.face = ""; state.looks = {}; state.queued = {}; state.queue = []; state.sel = [];
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
  var WA_NUMBER = "201148664485";
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
    toast("أُضيفت «" + p.name + "» إلى حقيبتكِ 🤍");
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
      row.innerHTML = '<img alt=""><div><b>' + esc(p.name) + '</b><small>' +
        esc(p.price ? AC.fmtPrice(p.price) : (state.looks[p.id] ? "جرّبتِها عليكِ ✓" : (AC.lineName(p.line) || ""))) +
        '</small></div><button class="rm" type="button">إزالة</button>';
      row.querySelector("img").src = state.looks[p.id] || p.img;
      row.querySelector(".rm").addEventListener("click", function () { removeFromBag(p.id); });
      list.appendChild(row);
    });
    $("bagTotal").textContent = items.length + (items.length === 1 ? " قطعة" : " قطع") + (total ? " · " + AC.fmtPrice(total) : "");
    var lines = ["أهلاً echarpe 🤍", "جرّبت القطع دي في غرفة القياس وعاوزة أطلبها:"];
    items.forEach(function (p) {
      lines.push("• " + p.name + (p.price ? " — " + AC.fmtPrice(p.price) : "") + (p.barcode ? " (" + p.barcode + ")" : ""));
    });
    lines.push("", "شكراً!");
    var wa = $("bagWa");
    wa.href = "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(lines.join("\n"));
    // جوّه التطبيق: القطع اللي ليها باركود تروح سلة التطبيق (الدفع والاستلام الحقيقيين)
    var inApp = EMBED && items.some(function (p) { return p.barcode; });
    wa.dataset.app = inApp ? "1" : "";
    wa.querySelector("span").textContent = inApp ? "أكملي الطلب" : "اطلبي عبر واتساب";
  }
  function openSheet(id) {
    if (id === "bag") renderBag();
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
  $("bagWa").addEventListener("click", function (e) {
    if (this.dataset.app !== "1") return;            // واتساب عادي
    e.preventDefault();
    var items = bag.map(function (id) { return state.byId[id]; }).filter(function (p) { return p && p.barcode; });
    var rest = bag.map(function (id) { return state.byId[id]; }).filter(function (p) { return p && !p.barcode; });
    Promise.all(items.map(function (p) { return smallJpeg(state.looks[p.id] || p.img); })).then(function (imgs) {
      toParent({ type: "atelier-order", items: items.map(function (p, i) {
        return { barcode: p.barcode, name: p.name, img: imgs[i] };
      }), note: "جرّبتها في غرفة القياس" });
      bag = rest.map(function (p) { return p.id; }); writeIds("atelier_bag", bag); syncBagCount();
      closeSheet("bag");
      if (rest.length) toast("القطع اللي من غير كود هتتطلب من واتساب — هي لسه في حقيبتكِ");
    });
  });
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
  loadProducts().then(function (items) {
    state.products = items;
    items.forEach(function (p) { state.byId[p.id] = p; });
    renderHero(); renderFilters(); renderGrid(); syncBagCount(); updateDock();
    var saved = LS ? PC.readFace(LS) : "";
    if (saved) { $("salonImg").src = saved; $("salonArch").classList.add("has"); }
  });
})();
