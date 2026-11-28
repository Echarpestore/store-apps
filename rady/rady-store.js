/* ============================================================
 * rady-store.js — «راضي؟» طبقة التخزين
 * ------------------------------------------------------------
 * وضعين بنفس الواجهة بالظبط:
 *   demo  : كل حاجة على الجهاز (localStorage). التابلت واللوحة في
 *           تابين على نفس الجهاز بيكلّموا بعض لايف. للعرض على العميل.
 *   cloud : Firebase (Firestore + Auth)، كل صاحب شغل بياناته لوحده
 *           تحت rady_tenants/{ownerUid}. بيشتغل لما rady-config.js
 *           يكون فيه RADY_FIREBASE.
 *
 * شكل البيانات في cloud:
 *   rady_tenants/{t}                 { name, ownerUid, cutoffHour, pin, createdAt }
 *   rady_tenants/{t}/points/{p}      { name, type, question, bad[], good[], callback, active }
 *   rady_tenants/{t}/keys/{p}        { k }   ← سر التابلت، المالك بس يقراه
 *   rady_tenants/{t}/votes/{auto}    { pointId, v, ts, workday, hour, reason?, phone?, flag?, k, done? }
 * القواعد: rady/firestore.rules
 * ============================================================ */
(function (root) {
  'use strict';
  var C = root.RadyCore;

  function uid(n) {
    var a = 'abcdefghjkmnpqrstuvwxyz23456789', s = '';
    var buf = (root.crypto && root.crypto.getRandomValues) ? root.crypto.getRandomValues(new Uint8Array(n)) : null;
    for (var i = 0; i < n; i++) s += a[(buf ? buf[i] : Math.floor(Math.random() * 256)) % a.length];
    return s;
  }

  function defaultPoint(type, name) {
    var t = C.BUSINESS_TYPES[type] || C.BUSINESS_TYPES.shop;
    return { id: 'p' + uid(6), name: name || 'المدخل', type: type || 'shop', question: t.question,
      bad: t.bad.slice(), good: t.good.slice(), callback: true, active: true };
  }

  function safeGet(k, fb) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : fb; } catch (e) { return fb; } }
  function safeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /* ======================= DEMO ======================= */
  function DemoStore() {
    var K_CFG = 'rady_demo_cfg', K_VOTES = 'rady_demo_votes';
    var listeners = [];
    var self = {
      mode: 'demo',
      ready: function () {
        if (!safeGet(K_CFG, null)) {
          safeSet(K_CFG, {
            name: 'محل تجريبي', cutoffHour: 6, pin: '1234',
            points: [defaultPoint('shop', 'المدخل'), defaultPoint('shop', 'الكاشير')]
          });
        }
        return Promise.resolve({ signedIn: true });
      },
      getConfig: function () { return Promise.resolve(safeGet(K_CFG, null)); },
      saveConfig: function (cfg) { safeSet(K_CFG, cfg); return Promise.resolve(); },
      getPoint: function (pid) {
        var cfg = safeGet(K_CFG, null);
        var p = cfg && cfg.points.filter(function (x) { return x.id === pid; })[0];
        return Promise.resolve(p ? { point: p, tenant: { name: cfg.name, cutoffHour: cfg.cutoffHour, pin: cfg.pin } } : null);
      },
      addVote: function (vote) {
        var all = safeGet(K_VOTES, []);
        vote.id = 'v' + uid(8);
        all.push(vote);
        if (all.length > 60000) all = all.slice(-60000);
        safeSet(K_VOTES, all);
        emit([vote]);
        return Promise.resolve(vote);
      },
      loadVotes: function (fromDay) {
        return Promise.resolve(safeGet(K_VOTES, []).filter(function (v) { return !fromDay || v.workday >= fromDay; }));
      },
      updateVote: function (id, patch) {
        var all = safeGet(K_VOTES, []);
        all.forEach(function (v) { if (v.id === id) Object.assign(v, patch); });
        safeSet(K_VOTES, all);
        return Promise.resolve();
      },
      onVotes: function (cb) { listeners.push(cb); return function () { listeners = listeners.filter(function (f) { return f !== cb; }); }; },
      seedDemo: function (days) {
        var cfg = safeGet(K_CFG, null);
        var votes = C.demoVotes(cfg.points, days || 30, Date.now(), 11);
        safeSet(K_VOTES, votes);
        return Promise.resolve(votes.length);
      },
      clearVotes: function () { safeSet(K_VOTES, []); return Promise.resolve(); },
      kioskUrl: function (point) { return 'kiosk.html?p=' + encodeURIComponent(point.id); },
      signOut: function () { return Promise.resolve(); }
    };
    function emit(v) { listeners.forEach(function (f) { try { f(v); } catch (e) { console.error(e); } }); }
    // التابلت في تاب تاني → اللوحة تحس بيه لايف
    root.addEventListener && root.addEventListener('storage', function (e) {
      if (e.key !== K_VOTES || !e.newValue) return;
      try {
        var oldIds = {}; (JSON.parse(e.oldValue || '[]')).forEach(function (v) { oldIds[v.id] = 1; });
        var fresh = JSON.parse(e.newValue).filter(function (v) { return !oldIds[v.id]; });
        if (fresh.length && fresh.length < 50) emit(fresh);
      } catch (er) { }
    });
    return self;
  }

  /* ======================= CLOUD ======================= */
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  function CloudStore(fbConfig, params) {
    var fb = null, user = null, tenantId = params.t || null, kioskKey = params.k || null;
    var QKEY = 'rady_queue_' + (params.t || 'x');

    function load() {
      if (fb) return Promise.resolve(fb);
      return Promise.all([
        import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')
      ]).then(function (m) {
        var app = m[0].initializeApp(fbConfig);
        fb = { app: m[0], auth: m[1], fs: m[2], a: m[1].getAuth(app), db: m[2].getFirestore(app) };
        return fb;
      });
    }
    function tdoc() { return fb.fs.doc(fb.db, 'rady_tenants', tenantId); }
    function col(name) { return fb.fs.collection(fb.db, 'rady_tenants', tenantId, name); }

    function flushQueue() {
      var q = safeGet(QKEY, []);
      if (!q.length || !fb || !user) return Promise.resolve();
      var v = q[0];
      return fb.fs.addDoc(col('votes'), v).then(function () {
        safeSet(QKEY, safeGet(QKEY, []).slice(1));
        return flushQueue();
      }).catch(function () { /* لسه مفيش نت — هنحاول تاني */ });
    }

    var self = {
      mode: 'cloud',
      /* role: 'kiosk' (دخول مجهول) أو 'owner' (إيميل وباسورد) */
      ready: function (role) {
        return load().then(function () {
          return new Promise(function (resolve) {
            var un = fb.auth.onAuthStateChanged(fb.a, function (u) {
              user = u;
              if (role === 'kiosk' && !u) { fb.auth.signInAnonymously(fb.a).catch(function () { resolve({ signedIn: false }); }); return; }
              un();
              if (u && role === 'owner') tenantId = u.uid;
              resolve({ signedIn: !!u && (role !== 'owner' || !u.isAnonymous) });
            });
          });
        }).then(function (r) {
          if (role === 'kiosk' && r.signedIn) {
            flushQueue();
            root.addEventListener('online', flushQueue);
            setInterval(flushQueue, 60000);
          }
          return r;
        });
      },
      signIn: function (email, pass) {
        return fb.auth.signInWithEmailAndPassword(fb.a, email, pass).then(function (c) { user = c.user; tenantId = user.uid; });
      },
      signUp: function (email, pass, bizName) {
        return fb.auth.createUserWithEmailAndPassword(fb.a, email, pass).then(function (c) {
          user = c.user; tenantId = user.uid;
          return fb.fs.setDoc(tdoc(), { name: bizName || 'شغلي', ownerUid: user.uid, cutoffHour: 6, pin: '1234', createdAt: Date.now() });
        });
      },
      signOut: function () { return fb.auth.signOut(fb.a); },
      getConfig: function () {
        return Promise.all([fb.fs.getDoc(tdoc()), fb.fs.getDocs(col('points'))]).then(function (r) {
          var t = r[0].exists() ? r[0].data() : { name: 'شغلي', cutoffHour: 6, pin: '1234' };
          t.points = r[1].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
          return t;
        });
      },
      saveConfig: function (cfg) {
        var batch = fb.fs.writeBatch(fb.db);
        batch.set(tdoc(), { name: cfg.name, cutoffHour: cfg.cutoffHour, pin: cfg.pin, ownerUid: user.uid }, { merge: true });
        cfg.points.forEach(function (p) {
          var data = Object.assign({}, p); delete data.id; delete data.k;
          batch.set(fb.fs.doc(fb.db, 'rady_tenants', tenantId, 'points', p.id), data);
          if (p.k) batch.set(fb.fs.doc(fb.db, 'rady_tenants', tenantId, 'keys', p.id), { k: p.k });
        });
        return batch.commit();
      },
      /* المالك بس — بيجيب سر كل نقطة عشان يطلّع لينك التابلت */
      getKeys: function (points) {
        var made = 0;
        return Promise.all(points.map(function (p) {
          return fb.fs.getDoc(fb.fs.doc(fb.db, 'rady_tenants', tenantId, 'keys', p.id)).then(function (d) {
            p.k = d.exists() ? d.data().k : null;
            if (!p.k) { p.k = uid(16); made++; }
          });
        })).then(function () { return made; });
      },
      getPoint: function (pid) {
        var ck = 'rady_point_' + tenantId + '_' + pid;
        return Promise.all([fb.fs.getDoc(fb.fs.doc(fb.db, 'rady_tenants', tenantId, 'points', pid)), fb.fs.getDoc(tdoc())])
          .then(function (r) {
            if (!r[0].exists()) return null;
            var t = r[1].exists() ? r[1].data() : {};
            var out = { point: Object.assign({ id: pid }, r[0].data()), tenant: { name: t.name, cutoffHour: t.cutoffHour, pin: t.pin } };
            safeSet(ck, out);
            return out;
          }).catch(function () { return safeGet(ck, null); }); // من غير نت: آخر نسخة محفوظة
      },
      addVote: function (vote) {
        vote.k = kioskKey;
        var q = safeGet(QKEY, []); q.push(vote); safeSet(QKEY, q);
        flushQueue();
        return Promise.resolve(vote);
      },
      loadVotes: function (fromDay) {
        var qy = fb.fs.query(col('votes'), fb.fs.where('workday', '>=', fromDay || '0000'), fb.fs.orderBy('workday'));
        return fb.fs.getDocs(qy).then(function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); });
      },
      updateVote: function (id, patch) { return fb.fs.updateDoc(fb.fs.doc(fb.db, 'rady_tenants', tenantId, 'votes', id), patch); },
      onVotes: function (cb) {
        var first = true;
        var qy = fb.fs.query(col('votes'), fb.fs.where('ts', '>', Date.now()));
        return fb.fs.onSnapshot(qy, function (s) {
          var fresh = s.docChanges().filter(function (c) { return c.type === 'added'; })
            .map(function (c) { return Object.assign({ id: c.doc.id }, c.doc.data()); });
          if (!first || fresh.length) cb(fresh);
          first = false;
        });
      },
      seedDemo: function () { return Promise.reject(new Error('البيانات التجريبية في وضع العرض بس')); },
      clearVotes: function () { return Promise.reject(new Error('مش متاح')); },
      kioskUrl: function (point) {
        return 'kiosk.html?t=' + encodeURIComponent(tenantId) + '&p=' + encodeURIComponent(point.id) + '&k=' + encodeURIComponent(point.k || '');
      }
    };
    return self;
  }

  function params() {
    var o = {};
    (root.location ? root.location.search.slice(1) : '').split('&').forEach(function (kv) {
      if (!kv) return; var i = kv.indexOf('=');
      o[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
    });
    return o;
  }

  root.RadyStore = {
    params: params,
    defaultPoint: defaultPoint,
    uid: uid,
    create: function () {
      var p = params();
      if (root.RADY_FIREBASE && p.demo !== '1') return CloudStore(root.RADY_FIREBASE, p);
      return DemoStore();
    }
  };
})(typeof self !== 'undefined' ? self : this);
