/* ============================================================
   ✨👑 atelier.js — صفحة «الأتيليه»: الموقع بيصحى بصورة العميلة
   ------------------------------------------------------------
   · المنتجات: نفس «منتجات البيع أونلاين» بتاعت loyalty
     (pos_test_settings/online_shop_echarpe)، وفولباك للكتالوج.
   · بعد ما العميلة ترفع صورتها: كل كارت + سلايدر الصفحة الرئيسية
     يتحوّلوا لصورتها وهي لابسة الطرحة.
   · التوليد: hijabLookbook (٤ منتجات في نداء واحد) — ولو لسه مش
     منشورة، بننزل تلقائي لـhijabTryOn (منتج لكل نداء) عشان التجربة
     تشتغل النهاردة من غير نشر.
   · «جودة عالية» = نداء hijabTryOn لمنتج واحد بس.
   · ?mock=1 = معاينة تصميم من غير أي نداء AI (للمراجعة بس).
   ============================================================ */
(function () {
  "use strict";
  var PC = window.PhotoCore, AC = window.AtelierCore;
  function $(id) { return document.getElementById(id); }

  var MOCK = /(?:^|[?&])mock=1(?:&|$)/.test(location.search);
  var LS = null; try { LS = window.localStorage; } catch (e) { LS = null; }
  var phone = ""; try { phone = (LS && LS.getItem("echarpe_loyalty_phone")) || ""; } catch (e) { }

  var state = {
    products: [], byId: {}, face: "", alive: false,
    looks: {}, hq: {}, queued: {}, requested: 0, done: 0, target: 0,
    mode: "lookbook", lookbookWorked: false, stopped: false,
    queue: [], busy: 0, gen: 0, lbOpen: null
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
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("on"); }, ms || 4200);
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function loadImg(src) {
    return new Promise(function (res, rej) {
      var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src;
    });
  }
  function urlToDataUrl(url) {
    return fetch(url).then(function (r) { return r.blob(); }).then(function (b) {
      return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); });
    });
  }
  function fileToFace(file) {
    return new Promise(function (resolve, reject) {
      if (!file || String(file.type || "").indexOf("image/") !== 0) { reject(new Error("not-image")); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var d = PC.computeResize(img.naturalWidth, img.naturalHeight, PC.TARGET_MAX_DIM);
          var c = document.createElement("canvas"); c.width = d.w; c.height = d.h;
          c.getContext("2d").drawImage(img, 0, 0, d.w, d.h);
          URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", PC.JPEG_QUALITY));
        } catch (err) { URL.revokeObjectURL(url); reject(err); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }

  /* ---------------- المنتجات ---------------- */
  function fallbackProducts() {
    var src = [["../col-hero.jpg", "طرحة الكولكشن"], ["../col-grays.jpg", "طرحة الرمادي"]];
    return Promise.all(src.map(function (s, i) {
      return urlToDataUrl(s[0]).then(function (d) {
        return { id: "demo" + i, galleryId: "", barcode: "", name: s[1], price: 0, img: d, tryable: AC.isImageDataUrl(d) };
      }).catch(function () { return null; });
    })).then(function (a) { return a.filter(Boolean); });
  }

  function loadProducts() {
    if (MOCK || !fb) return fallbackProducts();
    var db = fb.firestore();
    return authReady.then(function () {
      return db.collection("pos_test_settings").doc("online_shop_echarpe").get();
    }).then(function (d) {
      var items = AC.shopItemsFrom(d.exists ? d.data() : null);
      if (items.length) return items;
      return db.collection("pos_test_settings").doc("catalog_echarpe").get().then(function (c) {
        return AC.catalogItemsFrom(c.exists ? c.data() : null);
      });
    }).then(function (items) {
      return items.length ? items : fallbackProducts();
    }).catch(function () { return fallbackProducts(); });
  }

  /* صورة مرجعية أكبر للمنتج (الجاليري ٧٢٠px) — أدق للموديل من غلاف
     الكارت (٤٢٠px). مرة واحدة لكل منتج في الجلسة. */
  var refCache = {};
  function refImage(p) {
    if (refCache[p.id]) return refCache[p.id];
    var fallback = Promise.resolve(p.img);
    if (MOCK || !fb || !p.galleryId) return (refCache[p.id] = fallback);
    refCache[p.id] = fb.firestore().collection("pos_test_settings")
      .doc("online_shop_echarpe_img_" + p.galleryId).get()
      .then(function (d) {
        var arr = (d.exists && Array.isArray(d.data().images)) ? d.data().images : [];
        var big = arr.filter(AC.isImageDataUrl)[0];
        return big || p.img;
      }).catch(function () { return p.img; });
    return refCache[p.id];
  }

  /* ---------------- الهيرو ---------------- */
  var heroIdx = 0, heroT = 0, heroList = [];
  function renderHero() {
    var box = $("slides"), bars = $("bars");
    heroList = state.products.filter(function (p) { return p.tryable; }).slice(0, 5);
    if (!heroList.length) heroList = state.products.slice(0, 5);
    box.innerHTML = ""; bars.innerHTML = "";
    heroList.forEach(function (p, i) {
      var s = el("div", "slide" + (i === 0 ? " on" : ""));
      s.dataset.id = p.id;
      s.innerHTML = '<div class="ph"><img class="prod" alt=""><img class="look" alt=""></div>';
      s.querySelector(".prod").src = p.img;
      box.appendChild(s);
      bars.appendChild(el("i"));
    });
    goHero(0);
  }
  function goHero(i) {
    var slides = $("slides").children, bars = $("bars").children;
    if (!slides.length) return;
    heroIdx = (i + slides.length) % slides.length;
    for (var k = 0; k < slides.length; k++) {
      slides[k].classList.toggle("on", k === heroIdx);
      bars[k].classList.remove("on");
      bars[k].classList.toggle("done", k < heroIdx);
    }
    void bars[heroIdx].offsetWidth; bars[heroIdx].classList.add("on");
    var p = heroList[heroIdx];
    $("slideMeta").innerHTML = p ? "<b>" + esc(p.name) + "</b>" + (p.price ? " · " + esc(AC.fmtPrice(p.price)) : "") : "";
    clearTimeout(heroT); heroT = setTimeout(function () { goHero(heroIdx + 1); }, 6000);
  }
  $("hero").addEventListener("click", function (e) {
    if (e.target.closest("button,a")) return;
    var p = heroList[heroIdx]; if (p) openLook(p);
  });

  /* ---------------- الكولكشن ---------------- */
  var io = null;
  function renderGrid() {
    var g = $("grid"); g.innerHTML = "";
    if (!state.products.length) { g.innerHTML = '<div class="empty">الكولكشن هينزل قريب 🤍</div>'; return; }
    $("colTitle").textContent = "الكولكشن · " + state.products.length;
    io = "IntersectionObserver" in window ? new IntersectionObserver(onSeen, { rootMargin: "120px" }) : null;
    state.products.forEach(function (p, i) {
      var c = el("article", "card");
      c.dataset.id = p.id; c.dataset.i = i;
      c.innerHTML =
        '<div class="frame" role="button" tabindex="0" aria-label="' + esc(p.name) + '">' +
          '<img class="prod" alt="" loading="lazy"><img class="look" alt="">' +
          '<div class="veil"></div><div class="veil-txt">بنلبّسهالك…</div>' +
          '<div class="chip"><img alt=""></div><div class="spark"></div>' +
          '<button class="try-btn" type="button">✨ جرّبيها عليكي</button>' +
        '</div>' +
        '<div class="meta"><span class="nm">' + esc(p.name) + '</span><span class="pr">' + esc(AC.fmtPrice(p.price)) + '</span></div>';
      c.querySelector(".prod").src = p.img;
      c.querySelector(".chip img").src = p.img;
      c.querySelector(".frame").addEventListener("click", function (e) {
        if (e.target.closest(".try-btn")) { e.stopPropagation(); requestOne(p, true); return; }
        openLook(p);
      });
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

  /* ---------------- لحظة الصحيان ---------------- */
  function awaken(face) {
    var a = $("awaken");
    $("awakenFace").src = face; $("dockFace").src = face;
    a.classList.add("on");
    setTimeout(function () { $("w1").classList.add("on"); }, 350);
    setTimeout(function () { $("w1").classList.remove("on"); }, 1500);
    setTimeout(function () { $("w2").classList.add("on"); }, 2000);
    return new Promise(function (res) {
      setTimeout(function () {
        a.classList.remove("on"); $("w2").classList.remove("on");
        document.body.classList.add("alive"); state.alive = true;
        $("heroEyebrow").textContent = "Your Atelier";
        $("heroTitle").innerHTML = "الكولكشن <em>بقى عليكي</em>";
        $("heroSub").textContent = "دوسي على أي طرحة تشوفيها أقرب — أو بجودة عالية.";
        $("ctaUpload").style.display = "none";
        res();
      }, 3400);
    });
  }

  function startWithFace(face) {
    state.face = face; state.gen++;
    state.looks = {}; state.hq = {}; state.queued = {}; state.queue = [];
    state.requested = 0; state.done = 0; state.target = 0; state.stopped = false;
    document.querySelectorAll(".card").forEach(function (c) { c.classList.remove("worn", "weaving", "manual"); });
    document.querySelectorAll(".slide").forEach(function (s) { s.classList.remove("worn"); });
    if (LS) PC.saveFace(LS, face);
    var ready = state.alive ? Promise.resolve() : awaken(face);
    $("dockFace").src = face;
    // الكاش الأول (مجاني وفوري)، وبعدين التوليد
    var gen = state.gen;
    Promise.all(state.products.map(function (p) {
      return PC.readResultAsync(LS, AC.cacheProductId(p, false), face, null, p.img).then(function (v) {
        if (gen === state.gen && v) state.looks[p.id] = v;
      });
    })).then(function () { return ready; }).then(function () {
      if (gen !== state.gen) return;
      state.products.forEach(function (p, i) {
        if (state.looks[p.id]) { showLook(p, state.looks[p.id], false); state.queued[p.id] = true; }
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
    state.queued[p.id] = true; state.requested++; state.target++;
    var c = card(p.id); if (c) { c.classList.remove("manual"); c.classList.add("weaving"); }
    if (front) state.queue.unshift(p); else state.queue.push(p);
    updateDock(); pump();
  }

  /* ---------------- محرك التوليد ---------------- */
  function pump() {
    var maxBusy = state.mode === "lookbook" ? 1 : 2;
    while (state.busy < maxBusy && state.queue.length && !state.stopped) {
      var batch = state.queue.splice(0, state.mode === "lookbook" ? AC.BATCH_SIZE : 1);
      runBatch(batch, state.gen);
    }
  }

  function runBatch(batch, gen) {
    state.busy++;
    var face = state.face;
    var work = state.mode === "lookbook" && batch.length > 1 ? runLookbook(batch, face) : runSingles(batch, face);
    work.then(function (results) {
      if (gen !== state.gen) return;
      results.forEach(function (r) {
        showLook(r.p, r.img, true);
        PC.saveResultAsync(LS, AC.cacheProductId(r.p, false), face, r.img, null, r.p.img);
      });
    }).catch(function (err) {
      if (gen !== state.gen) return;
      var code = String(err && err.code || "").replace(/^functions\//, "");
      if (code === "resource-exhausted") {
        state.stopped = true;
        toast((err && err.message) || "وصلتي للحد بتاع النهاردة 🤍");
        markManual(batch.concat(state.queue)); state.queue = [];
      } else if (state.mode === "lookbook" && !state.lookbookWorked && AC.shouldFallbackToSingle(err)) {
        state.mode = "single";                 // hijabLookbook لسه مش منشورة
        state.queue = batch.concat(state.queue);
      } else {
        markManual(batch);
        toast("في طرح مقدرناش نجهّزها — دوسي «جرّبيها عليكي» عليها تاني");
      }
    }).then(function () {
      state.busy--; updateDock(); pump();
    });
  }

  function markManual(list) {
    list.forEach(function (p) {
      state.queued[p.id] = false; state.target = Math.max(state.done, state.target - 1);
      var c = card(p.id); if (c) { c.classList.remove("weaving"); c.classList.add("manual"); }
    });
  }

  function runLookbook(batch, face) {
    return Promise.all(batch.map(refImage)).then(function (refs) {
      if (MOCK) return mockGrid(face, refs);
      return callable("hijabLookbook")({
        customerImage: face,
        products: batch.map(function (p, i) { return { id: p.id, image: refs[i] }; })
      }).then(function (res) {
        var d = res && res.data;
        if (!d || !d.image) throw { code: "internal" };
        return d.image;
      });
    }).then(function (gridUrl) {
      state.lookbookWorked = true;
      return sliceGrid(gridUrl, batch.length);
    }).then(function (cells) {
      return batch.map(function (p, i) { return { p: p, img: cells[i] }; });
    });
  }

  function runSingles(batch, face) {
    return Promise.all(batch.map(function (p) {
      return single(p, face).then(function (img) { return { p: p, img: img }; });
    }));
  }

  function single(p, face) {
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

  /* ---------------- عرض النتيجة ---------------- */
  function showLook(p, url, fresh) {
    state.looks[p.id] = url;
    if (fresh) state.done++; else { state.done++; state.target++; }
    var c = card(p.id);
    if (c) {
      c.querySelector(".look").src = url;
      c.classList.remove("weaving", "manual");
      requestAnimationFrame(function () { c.classList.add("worn"); });
      if (fresh) sparkle(c.querySelector(".spark"));
    }
    var s = document.querySelector('.slide[data-id="' + CSS.escape(p.id) + '"]');
    if (s) { s.querySelector(".look").src = url; s.classList.add("worn"); }
    if (state.lbOpen === p && !state.hq[p.id]) setLb(p);
    updateDock();
  }

  function sparkle(box) {
    if (!box) return;
    for (var i = 0; i < 14; i++) {
      var s = el("i"); var a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 70;
      s.style.left = "50%"; s.style.top = "40%";
      s.style.setProperty("--dx", Math.cos(a) * r + "px"); s.style.setProperty("--dy", Math.sin(a) * r + "px");
      s.style.animationDelay = (Math.random() * .25) + "s";
      box.appendChild(s);
    }
    setTimeout(function () { box.innerHTML = ""; }, 1600);
  }

  function updateDock() {
    var t = Math.max(state.target, state.done), d = state.done;
    $("dockSub").textContent = t && d < t ? ("بنلبّسك… " + d + " من " + t) :
      (d ? d + " طرحة عليكي — دوسي على أي واحدة" : "بنلبّسك…");
    $("dockProg").style.width = t ? Math.round(d / t * 100) + "%" : "0";
  }

  /* ---------------- عرض الإطلالة + الجودة العالية ---------------- */
  function openLook(p) {
    state.lbOpen = p; setLb(p);
    $("lb").classList.add("on"); document.body.style.overflow = "hidden";
  }
  function setLb(p) {
    var pic = $("lbPic"), hq = state.hq[p.id], look = hq || state.looks[p.id];
    $("lbLook").src = look || p.img; $("lbProd").src = p.img; $("lbChip").src = p.img;
    pic.classList.toggle("is-hq", !!hq);
    pic.querySelector(".chip").style.display = look ? "" : "none";
    $("lbName").textContent = p.name; $("lbPrice").textContent = AC.fmtPrice(p.price);
    var b = $("lbHq");
    b.style.display = hq || !p.tryable ? "none" : "";
    b.textContent = state.face ? "✨ شوفيها بجودة عالية" : "✨ جرّبيها عليكي";
  }
  function closeLb() {
    state.lbOpen = null; $("lb").classList.remove("on"); document.body.style.overflow = "";
  }
  $("lbClose").addEventListener("click", closeLb);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });
  $("lbHq").addEventListener("click", function () {
    var p = state.lbOpen; if (!p) return;
    if (!state.face) { closeLb(); pickPhoto(); return; }
    var pic = $("lbPic"), face = state.face, b = $("lbHq");
    pic.classList.add("hq-loading"); b.disabled = true;
    PC.readResultAsync(LS, AC.cacheProductId(p, true), face, null, p.img).then(function (cached) {
      return cached || single(p, face).then(function (img) {
        PC.saveResultAsync(LS, AC.cacheProductId(p, true), face, img, null, p.img);
        return img;
      });
    }).then(function (img) {
      state.hq[p.id] = img;
      if (!state.looks[p.id]) showLook(p, img, true);
      if (state.lbOpen === p) setLb(p);
    }).catch(function (err) {
      toast((err && err.message) || PC.FRIENDLY_ERR);
    }).then(function () { pic.classList.remove("hq-loading"); b.disabled = false; });
  });
  // اضغطي واسكتي = الطرحة لوحدها
  (function () {
    var pic = $("lbPic");
    function on() { pic.classList.add("compare"); }
    function off() { pic.classList.remove("compare"); }
    pic.addEventListener("pointerdown", on);
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { pic.addEventListener(ev, off); });
  })();

  /* ---------------- رفع الصورة ---------------- */
  function pickPhoto() { $("file").value = ""; $("file").click(); }
  $("ctaUpload").addEventListener("click", function () {
    var saved = LS ? PC.readFace(LS) : "";
    if (saved) startWithFace(saved); else pickPhoto();
  });
  $("dockChange").addEventListener("click", pickPhoto);
  $("file").addEventListener("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    fileToFace(f).then(startWithFace).catch(function () { toast("الصورة دي مش هتنفع — جرّبي صورة تانية"); });
  });

  /* ---------------- معاينة التصميم (?mock=1) ----------------
     ⚠️ مش AI: بنرسم صورة العميلة وعليها لمسة من لون الطرحة عشان
        نراجع الحركة والتصميم من غير ما نصرف ولا نداء. */
  function mockLook(face, prod, slow) {
    return Promise.all([loadImg(face), loadImg(prod)]).then(function (im) {
      var f = im[0], p = im[1], W = 600, H = 800;
      var c = document.createElement("canvas"); c.width = W; c.height = H;
      var x = c.getContext("2d");
      var s = Math.max(W / f.naturalWidth, H / f.naturalHeight);
      x.drawImage(f, (W - f.naturalWidth * s) / 2, (H - f.naturalHeight * s) / 2, f.naturalWidth * s, f.naturalHeight * s);
      x.globalAlpha = .45; x.globalCompositeOperation = "soft-light";
      x.drawImage(p, 0, 0, W, H);
      return new Promise(function (r) { setTimeout(function () { r(c.toDataURL("image/jpeg", .85)); }, (slow ? 2500 : 1200) + Math.random() * 1500); });
    });
  }
  function mockGrid(face, refs) {
    return Promise.all(refs.map(function (r) { return mockLook(face, r, false); })).then(function (looks) {
      var lay = PC.computeGridLayout(looks.length);
      return Promise.all(looks.map(loadImg)).then(function (ims) {
        var c = document.createElement("canvas"); c.width = 600 * lay.cols; c.height = 800 * lay.rows;
        var x = c.getContext("2d");
        ims.forEach(function (im, i) { x.drawImage(im, (i % lay.cols) * 600, Math.floor(i / lay.cols) * 800); });
        return c.toDataURL("image/jpeg", .9);
      });
    });
  }
  if (MOCK) document.body.appendChild(el("div", "demo-flag", "معاينة تصميم — مش تجربة AI حقيقية"));

  /* ---------------- البداية ---------------- */
  loadProducts().then(function (items) {
    state.products = items;
    items.forEach(function (p) { state.byId[p.id] = p; });
    renderHero(); renderGrid();
    if (LS && PC.readFace(LS)) $("ctaUpload").textContent = "✨ شوفي الكولكشن عليكي";
  });
})();
