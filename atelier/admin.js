/* ============================================================
   🗂️ admin.js — إدارة غرفة القياس (الأتيليه)
   ------------------------------------------------------------
   · الدخول بحساب الموظفين (email/password) — قواعد Firestore بتسمح
     للموظفين بس يكتبوا في pos_test_settings.
   · المستندات:
       pos_test_settings/atelier_echarpe           { items:[{id,name,price,line,barcode,active}] }
       pos_test_settings/atelier_echarpe_t_<id>    { img: مصغّرة ٤٨٠px }
       pos_test_settings/atelier_echarpe_f_<id>    { img: كاملة ١١٠٠px }
     ⚠️ الصور في مستندات منفصلة: حد المستند ١ ميجا.
     ⚠️ المسح ممنوع في القواعد (delete: false) — فالقطعة المحذوفة
        بتتشال من القايمة وصورها بتتفضّى.
   ============================================================ */
(function () {
  "use strict";
  var AC = window.AtelierCore, AD = window.AdminCore, PC = window.PhotoCore;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var tt = 0;
  function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove("on"); }, 3500); }

  firebase.initializeApp({
    apiKey: "AIzaSyCa6Qho3IKoKE_jCNHYuFX6rtaV88jekQs",
    authDomain: "customer-feedback-8ac1d.firebaseapp.com",
    projectId: "customer-feedback-8ac1d",
    storageBucket: "customer-feedback-8ac1d.appspot.com",
    messagingSenderId: "408860081491",
    appId: "1:408860081491:web:c5fa8b8e757c13196375a6"
  });
  var auth = firebase.auth(), db = firebase.firestore(), col = db.collection("pos_test_settings");
  var DOC = AC.ADMIN_DOC;

  var items = [];      // القايمة المحفوظة (+ thumb للعرض)
  var pending = [];    // مجموعات جديدة قبل الحفظ: {id,name,price,line,barcode,thumb,full,extras:[...]}
  var dirty = false;

  /* ---------------- الدخول ---------------- */
  auth.onAuthStateChanged(function (u) {
    var staff = u && u.providerData && u.providerData.some(function (p) { return p.providerId === "password"; });
    $("login").classList.toggle("hidden", !!staff);
    $("app").classList.toggle("hidden", !staff);
    if (staff) loadAll();
  });
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault(); $("loginErr").textContent = "";
    auth.signInWithEmailAndPassword($("email").value.trim(), $("pass").value)
      .catch(function () { $("loginErr").textContent = "الإيميل أو كلمة السر مش مظبوطين."; });
  });
  $("logout").addEventListener("click", function () { auth.signOut(); });

  /* ---------------- الأنواع ---------------- */
  function lineOptions(sel) {
    return AC.LINES.filter(function (l) { return l.id !== "all"; }).map(function (l) {
      return '<option value="' + l.id + '"' + (l.id === sel ? " selected" : "") + ">" + esc(l.ar) + "</option>";
    }).join("");
  }
  $("defLine").innerHTML = lineOptions("crepe");

  /* ---------------- التحميل ---------------- */
  function loadAll() {
    $("list").innerHTML = '<div class="empty">بتحمّل…</div>';
    col.doc(DOC).get().then(function (d) {
      var raw = d.exists && Array.isArray(d.data().items) ? d.data().items : [];
      items = raw.map(function (it) { return Object.assign({ thumb: "" }, it); });
      $("importHouse").classList.toggle("hidden", items.length > 0);
      renderList();
      items.forEach(function (it) {
        col.doc(DOC + "_t_" + it.id).get().then(function (t) {
          it.thumb = t.exists ? (t.data().img || "") : "";
          var im = document.querySelector('[data-id="' + it.id + '"] .ph img'); if (im && it.thumb) im.src = it.thumb;
        });
      });
    }).catch(function () { $("list").innerHTML = '<div class="empty">مقدرناش نحمّل المجموعة — اتأكدي من الدخول.</div>'; });
  }

  /* ---------------- عرض القايمة ---------------- */
  function itemCard(it, i, isNew) {
    var c = el("div", "item" + (it.active === false ? " off" : "") + (isNew ? " new" : ""));
    c.dataset.id = it.id;
    var extras = isNew && it.extras && it.extras.length
      ? '<div class="extras">' + it.extras.map(function (x, k) {
          return '<figure><img src="' + x.thumb + '" alt=""><button type="button" data-split="' + k + '">قطعة لوحدها</button></figure>';
        }).join("") + "</div>" : "";
    c.innerHTML =
      '<div class="ph"><img alt="" src="' + (it.thumb || "") + '"><span class="n">' + (i + 1) + "</span></div>" + extras +
      '<div class="fields">' +
        '<input type="text" data-f="name" value="' + esc(it.name) + '" placeholder="اسم القطعة">' +
        '<div class="row2"><input type="number" data-f="price" min="0" step="5" value="' + (Number(it.price) || 0) + '" placeholder="السعر">' +
        '<select data-f="line">' + lineOptions(it.line) + "</select></div>" +
        '<input type="text" data-f="barcode" value="' + esc(it.barcode || "") + '" placeholder="باركود (عشان الطلب يدخل سلة التطبيق)">' +
        '<small class="bc"></small>' +
      "</div>" +
      (isNew ? "" :
      '<div class="acts"><button type="button" data-a="up">↑</button><button type="button" data-a="down">↓</button>' +
        '<label><input type="checkbox" data-f="active"' + (it.active === false ? "" : " checked") + "> ظاهرة</label>" +
        '<button type="button" class="del" data-a="del">حذف</button></div>');
    c.querySelectorAll("[data-f]").forEach(function (inp) {
      inp.addEventListener(inp.type === "checkbox" ? "change" : "input", function () {
        var f = inp.dataset.f;
        it[f] = inp.type === "checkbox" ? inp.checked : (f === "price" ? Number(inp.value) || 0 : inp.value);
        if (f === "active") c.classList.toggle("off", !inp.checked);
        if (!isNew) markDirty();
      });
    });
    var bc = c.querySelector('[data-f="barcode"]');
    bc.addEventListener("blur", function () { checkBarcode(bc.value, c.querySelector(".bc")); });
    if (it.barcode) checkBarcode(it.barcode, c.querySelector(".bc"));
    c.querySelectorAll("[data-a]").forEach(function (b) {
      b.addEventListener("click", function () { action(b.dataset.a, i); });
    });
    c.querySelectorAll("[data-split]").forEach(function (b) {
      b.addEventListener("click", function () { splitExtra(it, +b.dataset.split); });
    });
    return c;
  }
  function renderList() {
    var box = $("list"); box.innerHTML = "";
    if (!items.length) { box.innerHTML = '<div class="empty">لسه مفيش قطع — ضيفي صور فوق، أو استوردي المجموعة الحالية.</div>'; }
    items.forEach(function (it, i) { box.appendChild(itemCard(it, i, false)); });
    var on = items.filter(function (it) { return it.active !== false; }).length;
    $("listInfo").textContent = items.length ? on + " ظاهرة من " + items.length : "";
  }
  function renderReview() {
    var box = $("review"); box.innerHTML = "";
    $("reviewSec").classList.toggle("hidden", !pending.length);
    pending.forEach(function (it, i) { box.appendChild(itemCard(it, i, true)); });
    var photos = pending.reduce(function (s, g) { return s + 1 + (g.extras ? g.extras.length : 0); }, 0);
    $("reviewInfo").textContent = photos + " صورة ← " + pending.length + " قطعة (الصور المتشابهة اتجمّعت)";
    updateBar();
  }
  function action(a, i) {
    if (a === "up" && i > 0) { var t = items[i - 1]; items[i - 1] = items[i]; items[i] = t; }
    else if (a === "down" && i < items.length - 1) { var t2 = items[i + 1]; items[i + 1] = items[i]; items[i] = t2; }
    else if (a === "del") {
      if (!confirm("حذف «" + items[i].name + "» من المجموعة؟")) return;
      var gone = items.splice(i, 1)[0];
      (deleted = deleted || []).push(gone.id);
    } else return;
    markDirty(); renderList();
  }
  var deleted = [];
  function splitExtra(group, k) {
    var x = group.extras.splice(k, 1)[0];
    pending.splice(pending.indexOf(group) + 1, 0, {
      id: AD.newId(), name: AD.defaultName($("defLine").value, x.color), price: Number($("defPrice").value) || 0,
      line: group.line, barcode: "", thumb: x.thumb, full: x.full, color: x.color, extras: []
    });
    renderReview();
  }
  var bcCache = {};
  function checkBarcode(v, out) {
    v = String(v || "").trim(); out.textContent = ""; out.className = "bc";
    if (!v) return;
    (bcCache[v] = bcCache[v] || db.collection("pos_test_inventory").doc(v).get().then(function (d) { return d.exists; }).catch(function () { return null; }))
      .then(function (ok) {
        if (ok === null) return;
        out.textContent = ok ? "✓ موجود في المخزون — الطلب هيدخل سلة التطبيق" : "✗ مش لاقيين الباركود ده في المخزون";
        out.className = "bc " + (ok ? "ok" : "bad");
      });
  }

  /* ---------------- الصور الجديدة ---------------- */
  function loadImg(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; }); }
  function jpeg(img, max, q) {
    var d = PC.computeResize(img.naturalWidth, img.naturalHeight, max);
    var c = document.createElement("canvas"); c.width = d.w; c.height = d.h;
    var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, d.w, d.h); x.drawImage(img, 0, 0, d.w, d.h);
    return c.toDataURL("image/jpeg", q);
  }
  /* بصمة الشكل (dHash) + لون القماش من نص الصورة (من غير الخلفية الفاتحة) */
  function features(img) {
    var c = document.createElement("canvas"), x = c.getContext("2d");
    c.width = 9; c.height = 8; x.drawImage(img, 0, 0, 9, 8);
    var px = x.getImageData(0, 0, 9, 8).data, gray = [];
    for (var i = 0; i < 72; i++) gray.push(px[i * 4] * .299 + px[i * 4 + 1] * .587 + px[i * 4 + 2] * .114);
    c.width = 48; c.height = 48;
    var w = img.naturalWidth, h = img.naturalHeight;
    x.drawImage(img, w * .15, h * .15, w * .7, h * .7, 0, 0, 48, 48);
    var d = x.getImageData(0, 0, 48, 48).data, r = 0, g = 0, b = 0, n = 0, ar = 0, ag = 0, ab = 0;
    for (var k = 0; k < d.length; k += 4) {
      ar += d[k]; ag += d[k + 1]; ab += d[k + 2];
      var mx = Math.max(d[k], d[k + 1], d[k + 2]), mn = Math.min(d[k], d[k + 1], d[k + 2]);
      if (mn > 205 && mx - mn < 30) continue;          // خلفية فاتحة
      r += d[k]; g += d[k + 1]; b += d[k + 2]; n++;
    }
    var all = d.length / 4;
    var color = n > all * 0.08 ? [r / n, g / n, b / n] : [ar / all, ag / all, ab / all];
    return { hash: AD.dHash(gray), color: color.map(Math.round) };
  }
  function addFiles(files) {
    files = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); });
    if (!files.length) return;
    var prog = $("prog"), bar = $("progBar"); prog.style.display = "block";
    var shots = [], i = 0;
    (function next() {
      if (i >= files.length) { prog.style.display = "none"; bar.style.width = "0"; group(shots); return; }
      var f = files[i++], url = URL.createObjectURL(f);
      loadImg(url).then(function (img) {
        var ft = features(img);
        shots.push({ thumb: jpeg(img, 480, 0.8), full: jpeg(img, 1100, 0.82), hash: ft.hash, color: ft.color });
      }).catch(function () { }).then(function () {
        URL.revokeObjectURL(url); bar.style.width = Math.round(i / files.length * 100) + "%";
        setTimeout(next, 0);
      });
    })();
  }
  function group(shots) {
    var line = $("defLine").value, price = Number($("defPrice").value) || 0;
    AD.groupSimilar(shots).forEach(function (g) {
      var main = shots[g[0]];
      pending.push({ id: AD.newId(), name: AD.defaultName(line, main.color), price: price, line: line, barcode: "",
        thumb: main.thumb, full: main.full, color: main.color,
        extras: g.slice(1).map(function (k) { return shots[k]; }) });
    });
    var names = AD.uniqueNames(items.map(function (it) { return it.name; }).concat(pending.map(function (p) { return p.name; })));
    pending.forEach(function (p, k) { p.name = names[items.length + k]; });
    renderReview();
    $("reviewSec").scrollIntoView({ behavior: "smooth" });
  }
  var drop = $("drop");
  drop.addEventListener("click", function () { $("files").click(); });
  $("files").addEventListener("change", function () { addFiles(this.files); this.value = ""; });
  ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { addFiles(e.dataTransfer && e.dataTransfer.files); });
  $("reviewCancel").addEventListener("click", function () { pending = []; renderReview(); });

  /* استيراد صور الموقع الحالية (مجموعة الدار) كبداية */
  $("importHouse").addEventListener("click", function () {
    var b = this; b.disabled = true; b.textContent = "بيستورد…";
    var price = Number($("defPrice").value) || 0;
    Promise.all(AC.houseCollection("collection/").map(function (h) {
      return loadImg(h.img).then(function (img) {
        return { id: AD.newId(), name: h.name, price: price, line: h.line, barcode: "",
          thumb: jpeg(img, 480, 0.8), full: jpeg(img, 1100, 0.82), extras: [] };
      }).catch(function () { return null; });
    })).then(function (list) {
      pending = pending.concat(list.filter(Boolean)); renderReview();
      b.classList.add("hidden");
    });
  });

  /* ---------------- الحفظ ---------------- */
  function markDirty() { dirty = true; updateBar(); }
  function updateBar() {
    var n = pending.length;
    $("bar").classList.toggle("on", dirty || n > 0);
    $("barText").textContent = n ? "هيتضاف " + n + " قطعة للمجموعة" + (dirty ? " + تعديلات" : "") : "فيه تعديلات لسه ما اتحفظتش";
    $("save").textContent = n ? "حفظ وإضافة " + n : "حفظ";
  }
  $("save").addEventListener("click", function () {
    var b = this; b.disabled = true; b.textContent = "بيحفظ…";
    var batchImgs = pending.slice(), k = 0;
    // الصور الأول (واحدة واحدة عشان حجم الطلب)، وبعدها القايمة مرة واحدة
    (function nextImg() {
      if (k >= batchImgs.length) return Promise.resolve();
      var p = batchImgs[k++];
      b.textContent = "بيرفع " + k + " من " + batchImgs.length + "…";
      return col.doc(DOC + "_t_" + p.id).set({ img: p.thumb })
        .then(function () { return col.doc(DOC + "_f_" + p.id).set({ img: p.full }); })
        .then(nextImg);
    })().then(function () {
      var clean = items.concat(batchImgs).map(function (it) { return AD.cleanItem(it); });
      return col.doc(DOC).set({ items: clean, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }).then(function () {
      // صور القطع المحذوفة بتتفضّى (المسح نفسه ممنوع في القواعد)
      return Promise.all(deleted.map(function (id) {
        return Promise.all([col.doc(DOC + "_t_" + id).set({ img: "", deleted: true }), col.doc(DOC + "_f_" + id).set({ img: "", deleted: true })]);
      }));
    }).then(function () {
      items = items.concat(batchImgs.map(function (p) { return { id: p.id, name: p.name, price: p.price, line: p.line, barcode: p.barcode, active: true, thumb: p.thumb }; }));
      pending = []; deleted = []; dirty = false;
      renderReview(); renderList(); updateBar();
      $("importHouse").classList.add("hidden");
      toast("اتحفظ ✓ — هيظهر في غرفة القياس على طول");
    }).catch(function (e) {
      console.error(e); toast("الحفظ وقف — جرّبي تاني (لو الصور كتير ارفعيها على دفعات)");
    }).then(function () { b.disabled = false; updateBar(); });
  });
  window.addEventListener("beforeunload", function (e) { if (dirty || pending.length) { e.preventDefault(); e.returnValue = ""; } });
})();
