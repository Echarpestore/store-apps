/* ============================================================
   echarpe — Maison du Voile · atelier.js
   ------------------------------------------------------------
   · المنتجات: «منتجات البيع أونلاين» (pos_test_settings/online_shop_echarpe)
     الأول، وبعدها مجموعة الدار (صور atelier/collection الحقيقية).
   · بعد ما العميلة ترفع صورتها: كل قطعة في المجموعة + الواجهة
     يتحوّلوا لصورتها وهي لابساها.
   · التوليد: hijabLookbook (٤ قطع في نداء واحد) — ولو لسه مش منشورة،
     بننزل تلقائي لـhijabTryOn (قطعة لكل نداء، للطرح بس).
   · ?mock=1 = معاينة تصميم من غير أي نداء AI (للمراجعة بس).
   ============================================================ */
(function () {
  "use strict";
  var PC = window.PhotoCore, AC = window.AtelierCore;
  function $(id) { return document.getElementById(id); }
  var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var MOCK = /(?:^|[?&])mock=1(?:&|$)/.test(location.search);
  var LS = null; try { LS = window.localStorage; } catch (e) { LS = null; }
  var phone = ""; try { phone = (LS && LS.getItem("echarpe_loyalty_phone")) || ""; } catch (e) { }

  var MSG = {
    limit: "اكتفينا بهذا القدر اليوم 🤍 يسعدنا أن تكملي غداً.",
    retry: "تعذّر تجهيز بعض القطع — المسي «جرّبيها» لإعادة المحاولة.",
    badImg: "تعذّرت قراءة الصورة — جرّبي صورةً أخرى.",
    isdalSoon: "تجربة الإسدال تتوفّر قريباً.",
    forgot: "تم حذف صورتكِ وإطلالاتكِ من هاتفكِ."
  };

  var state = {
    products: [], byId: {}, face: "", alive: false,
    looks: {}, queued: {}, requested: 0, done: 0, target: 0,
    mode: "lookbook", lookbookWorked: false, stopped: false,
    queue: [], busy: 0, gen: 0, lbOpen: null, line: "all"
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
        fb.auth().onAuthStateChanged(function (u) { if (u) fin(); });
        fb.auth().signInAnonymously().catch(fin);
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
    var db = fb.firestore();
    return authReady.then(function () {
      return db.collection("pos_test_settings").doc("online_shop_echarpe").get();
    }).then(function (d) {
      return AC.shopItemsFrom(d.exists ? d.data() : null).concat(house);
    }).catch(function () { return house; });
  }

  /* صورة مرجعية للموديل (data-URL):
     · مجموعة الدار: صورة الملف نفسه مضغوطة لـ1280px.
     · منتجات البيع: صورة الجاليري الأكبر (٧٢٠px) لو موجودة، وإلا الغلاف. */
  var refCache = {};
  function refImage(p) {
    if (refCache[p.id]) return refCache[p.id];
    if (p.house) {
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
    // اختارت قطعة لسه ما اتجهزتش وهي جوّه — نقدّمها أول الطابور
    if (state.alive && userPicked && p.tryable && !state.looks[p.id] && !state.queued[p.id]) requestOne(p, true);
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
  $("mirror").addEventListener("click", function () { if (mirrorP) openLook(mirrorP); });
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
          '<button class="try-btn" type="button">جرّبيها</button>' +
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
        if (e.target.closest(".try-btn")) { e.stopPropagation(); requestOne(p, true); return; }
        openLook(p);
      });
      frame.addEventListener("keydown", function (e) { if (e.key === "Enter") openLook(p); });
      g.appendChild(c);
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
        if (state.alive) considerAuto(state.byId[c.dataset.id], +c.dataset.i, true);
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
    state.requested = 0; state.done = 0; state.target = 0; state.stopped = false;
    document.querySelectorAll(".card").forEach(function (c) { c.classList.remove("worn", "weaving", "manual", "revealing"); });
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
      state.products.forEach(function (p, i) {
        var c = card(p.id);
        considerAuto(p, i, !!(c && c.dataset.visible));
      });
      updateDock();
    });
  }

  function considerAuto(p, i, visible) {
    if (!p || !p.tryable || state.queued[p.id] || state.stopped || !state.face) return;
    if (state.line !== "all" && p.line !== state.line && !visible) return;
    var pol = AC.autoPolicy(i, state.requested, visible);
    if (pol === "auto") enqueue(p, false);
    else if (pol === "manual") { var c = card(p.id); if (c) c.classList.add("manual"); }
  }
  function requestOne(p, front) {
    if (!state.face) { pickPhoto(); return; }
    if (state.looks[p.id] || state.queued[p.id]) return;
    state.stopped = false;
    enqueue(p, front);
  }
  function enqueue(p, front) {
    if (state.mode === "single" && p.kind === "isdal") { markManual([p]); toast(MSG.isdalSoon); return; }
    state.queued[p.id] = true; state.requested++; state.target++;
    var c = card(p.id); if (c) { c.classList.remove("manual"); c.classList.add("weaving"); }
    if (front) state.queue.unshift(p); else state.queue.push(p);
    if (state.lbOpen === p) setLb(p);
    if (mirrorP === p) $("mirror").classList.add("busy");
    updateDock(); pump();
  }

  /* ---------------- محرك التوليد ---------------- */
  function pump() {
    var maxBusy = state.mode === "lookbook" ? 1 : 2;
    while (state.busy < maxBusy && state.queue.length && !state.stopped) {
      var t = AC.takeBatch(state.queue, state.mode === "lookbook" ? AC.BATCH_SIZE : 1);
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
        state.stopped = true;
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
      state.busy--; updateDock(); pump();
    });
  }

  function markManual(list) {
    list.forEach(function (p) {
      if (state.queued[p.id]) state.target = Math.max(state.done, state.target - 1);
      state.queued[p.id] = false;
      var c = card(p.id); if (c) { c.classList.remove("weaving"); c.classList.add("manual"); }
    });
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
      var lay = PC.computeGridLayout(n);
      var cells = PC.sliceGridProportional(img.naturalWidth, img.naturalHeight, lay.cols, lay.rows, n, 0.02);
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
      c.classList.remove("weaving", "manual");
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

  function updateDock() {
    var t = Math.max(state.target, state.done), d = state.done;
    $("dockSub").textContent = t && d < t ? ("نُجهّز " + d + " من " + t + "…") :
      (d ? d + " إطلالة جاهزة لكِ" : "نُجهّزها لكِ…");
    $("dockProg").style.width = t ? Math.round(d / t * 100) + "%" : "0";
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
    pic.querySelector(".chip").style.display = look ? "" : "none";
    $("lbLine").textContent = AC.lineName(p.line) ? "من مجموعة " + AC.lineName(p.line) : "";
    $("lbName").textContent = p.name;
    $("lbPrice").textContent = p.price ? AC.fmtPrice(p.price) : "";
    var busy = state.queued[p.id] && !look;
    var b = $("lbTry");
    b.style.display = look || !p.tryable ? "none" : "";
    b.disabled = !!busy;
    b.querySelector("span").textContent = busy ? "نُجهّزها لكِ…" : "جرّبيها عليكِ";
    $("lbHint").style.display = look ? "" : "none";
  }
  function closeLb() {
    state.lbOpen = null; $("lb").classList.remove("on"); document.body.style.overflow = "";
  }
  $("lbClose").addEventListener("click", closeLb);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });
  $("lbTry").addEventListener("click", function () {
    var p = state.lbOpen; if (!p) return;
    if (!state.face) { closeLb(); pickPhoto(); return; }
    requestOne(p, true); setLb(p);
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
  $("dockChange").addEventListener("click", pickPhoto);
  /* 🔒 حذف الصورة والإطلالات من الجهاز — الوش + الكاش (localStorage + IndexedDB) */
  $("forgetMe").addEventListener("click", function () {
    if (LS) { PC.clearFace(LS); PC.clearResults(LS); }
    try { indexedDB.deleteDatabase("echarpe_tryon_cache_v1"); } catch (e) { }
    state.gen++; state.face = ""; state.looks = {}; state.queued = {}; state.queue = [];
    state.done = 0; state.target = 0; state.requested = 0;
    document.body.classList.remove("alive"); state.alive = false;
    document.querySelectorAll(".card").forEach(function (c) { c.classList.remove("worn", "weaving", "manual", "revealing"); c.querySelector(".look").removeAttribute("src"); });
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
      var lay = PC.computeGridLayout(looks.length);
      return Promise.all(looks.map(loadImg)).then(function (ims) {
        var c = document.createElement("canvas"); c.width = 600 * lay.cols; c.height = 800 * lay.rows;
        var x = c.getContext("2d");
        ims.forEach(function (im, i) { x.drawImage(im, (i % lay.cols) * 600, Math.floor(i / lay.cols) * 800); });
        return c.toDataURL("image/jpeg", .9);
      });
    });
  }
  if (MOCK) document.body.appendChild(el("div", "demo-flag", "معاينة للتصميم فقط"));

  /* ---------------- البداية ---------------- */
  loadProducts().then(function (items) {
    state.products = items;
    items.forEach(function (p) { state.byId[p.id] = p; });
    renderHero(); renderFilters(); renderGrid();
    var saved = LS ? PC.readFace(LS) : "";
    if (saved) { $("salonImg").src = saved; $("salonArch").classList.add("has"); }
  });
})();
