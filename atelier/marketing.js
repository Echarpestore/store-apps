/* ============================================================
   📣 marketing.js — بيكسلات الإعلانات والتحليلات لغرفة القياس
   ------------------------------------------------------------
   · الأرقام (IDs) بتتكتب من صفحة الإدارة ← تاب «التسويق»، وبتتحفظ في
     pos_test_settings/atelier_site. مفيش أي رقم مكتوب في الكود.
   · بيدعم: Meta (فيسبوك/إنستجرام) · Google Analytics 4 · TikTok ·
     Google Ads (تحويل الشراء).
   · الأحداث: PageView · ViewContent · AddToCart · InitiateCheckout ·
     Purchase · Lead (شات/واتساب) · TryOn (رفعت صورتها).
   🔒 صورة العميلة ووشها وإطلالاتها **عمرهم ما بيتبعتوا** لأي بيكسل —
      بس اسم القطعة وسعرها ورقمها.
   ============================================================ */
(function (root) {
  "use strict";
  var RX = {
    meta: /^\d{10,20}$/,
    ga4: /^G-[A-Z0-9]{4,14}$/,
    tiktok: /^[A-Z0-9]{12,30}$/,
    ads: /^AW-\d{6,14}$/,
    adsLabel: /^[\w-]{4,40}$/
  };
  /* تنظيف الإعدادات — أي قيمة مش مظبوطة بتتشال (عشان محدش يحقن سكربت) */
  function cleanConfig(d) {
    d = d || {};
    var s = function (v) { return String(v == null ? "" : v).trim(); };
    var c = {
      meta: s(d.metaPixelId), ga4: s(d.ga4Id).toUpperCase(), tiktok: s(d.tiktokPixelId).toUpperCase(),
      ads: s(d.googleAdsId).toUpperCase(), adsLabel: s(d.googleAdsPurchaseLabel)
    };
    Object.keys(c).forEach(function (k) { if (!RX[k].test(c[k])) c[k] = ""; });
    if (!c.ads) c.adsLabel = "";
    return c;
  }

  var cfg = null, queue = [];
  function addScript(src) {
    var s = document.createElement("script"); s.async = true; s.src = src;
    document.head.appendChild(s);
  }
  function init(d) {
    if (cfg || typeof document === "undefined") return cfg;
    cfg = cleanConfig(d);
    var w = root;
    if (cfg.meta) {
      /* Meta Pixel — نفس الكود الرسمي */
      if (!w.fbq) {
        var n = w.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!w._fbq) w._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
        addScript("https://connect.facebook.net/en_US/fbevents.js");
      }
      w.fbq("init", cfg.meta); w.fbq("track", "PageView");
    }
    if (cfg.ga4 || cfg.ads) {
      w.dataLayer = w.dataLayer || [];
      w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
      addScript("https://www.googletagmanager.com/gtag/js?id=" + (cfg.ga4 || cfg.ads));
      w.gtag("js", new Date());
      if (cfg.ga4) w.gtag("config", cfg.ga4);
      if (cfg.ads) w.gtag("config", cfg.ads);
    }
    if (cfg.tiktok) {
      /* TikTok Pixel — نسخة مختصرة من الكود الرسمي */
      var t = w.ttq = w.ttq || [];
      t.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
      t.setAndDefer = function (o, m) { o[m] = function () { o.push([m].concat([].slice.call(arguments, 0))); }; };
      for (var i = 0; i < t.methods.length; i++) t.setAndDefer(t, t.methods[i]);
      addScript("https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=" + cfg.tiktok + "&lib=ttq");
      t.page();
    }
    var q = queue; queue = [];
    q.forEach(function (a) { track(a[0], a[1]); });
    return cfg;
  }

  /* ترجمة حدث واحد لكل منصة. data: { items:[{id,name,price,qty}], value, currency, orderId } */
  function mapEvent(name, data) {
    data = data || {};
    var items = (data.items || []).map(function (p) {
      return { id: String(p.id || ""), name: String(p.name || ""), price: Number(p.price) || 0, qty: Number(p.qty) || 1 };
    });
    var value = data.value != null ? Number(data.value) || 0 : items.reduce(function (s, p) { return s + p.price * p.qty; }, 0);
    var cur = data.currency || "EGP";
    var ids = items.map(function (p) { return p.id; });
    var META = { ViewContent: "ViewContent", AddToCart: "AddToCart", InitiateCheckout: "InitiateCheckout", Purchase: "Purchase", Lead: "Contact", TryOn: "TryOn" };
    var GA = { ViewContent: "view_item", AddToCart: "add_to_cart", InitiateCheckout: "begin_checkout", Purchase: "purchase", Lead: "generate_lead", TryOn: "try_on" };
    var TT = { ViewContent: "ViewContent", AddToCart: "AddToCart", InitiateCheckout: "InitiateCheckout", Purchase: "PlaceAnOrder", Lead: "Contact", TryOn: "SubmitForm" };
    return {
      meta: META[name] ? { name: META[name], custom: name === "TryOn",
        params: { content_ids: ids, content_type: "product", value: value, currency: cur, num_items: items.length } } : null,
      ga: GA[name] ? { name: GA[name], params: { currency: cur, value: value, transaction_id: data.orderId || undefined,
        items: items.map(function (p) { return { item_id: p.id, item_name: p.name, price: p.price, quantity: p.qty }; }) } } : null,
      tt: TT[name] ? { name: TT[name], params: { contents: items.map(function (p) { return { content_id: p.id, content_name: p.name, price: p.price, quantity: p.qty }; }),
        content_type: "product", value: value, currency: cur } } : null,
      adsConversion: name === "Purchase" ? { value: value, currency: cur, transaction_id: data.orderId || "" } : null
    };
  }

  function track(name, data) {
    if (!cfg) { if (queue.length < 30) queue.push([name, data]); return; }
    var m = mapEvent(name, data), w = root;
    try {
      if (cfg.meta && w.fbq && m.meta) w.fbq(m.meta.custom ? "trackCustom" : "track", m.meta.name, m.meta.params);
      if (cfg.ga4 && w.gtag && m.ga) w.gtag("event", m.ga.name, m.ga.params);
      if (cfg.ads && cfg.adsLabel && w.gtag && m.adsConversion)
        w.gtag("event", "conversion", Object.assign({ send_to: cfg.ads + "/" + cfg.adsLabel }, m.adsConversion));
      if (cfg.tiktok && w.ttq && m.tt) w.ttq.track(m.tt.name, m.tt.params);
    } catch (e) { }
  }

  var API = { init: init, track: track, cleanConfig: cleanConfig, mapEvent: mapEvent };
  root.AtelierMkt = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
