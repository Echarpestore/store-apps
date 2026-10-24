/* ============================================================
   🌐 i18n.js — اللغة: الإنجليزي هو الأساسي، والعربي بزرار في الهيدر.
   ------------------------------------------------------------
   · الترتيب: ?lang=en|ar في اللينك ← اختيار العميلة المحفوظ ← جوّه
     تطبيق العملاء (iframe) عربي ← غير كده إنجليزي.
   · النص العربي مكتوب في الـHTML؛ الإنجليزي في data-en (نص)،
     data-en-html (فيه وسوم)، data-en-aria، data-en-ph (placeholder).
   · بيتحمّل في الـhead عشان الاتجاه (dir) يتظبط قبل الرسم.
   ============================================================ */
(function () {
  "use strict";
  var KEY = "atelier_lang";
  var m = /[?&]lang=(en|ar)(?:&|$)/.exec(location.search);
  var saved = "";
  try { saved = localStorage.getItem(KEY) || ""; if (m) localStorage.setItem(KEY, m[1]); } catch (e) { }
  var embed = /(?:^|[?&])embed=1(?:&|$)/.test(location.search) ||
    (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  var lang = m ? m[1] : (saved === "en" || saved === "ar") ? saved : (embed ? "ar" : "en");

  var html = document.documentElement;
  html.lang = lang; html.dir = lang === "ar" ? "rtl" : "ltr";
  window.AtelierLang = lang;

  function apply() {
    var btn = document.getElementById("langBtn");
    if (btn) {
      btn.textContent = lang === "en" ? "عربي" : "EN";
      btn.setAttribute("aria-label", lang === "en" ? "اقرئي بالعربي" : "Read in English");
      btn.addEventListener("click", function () {
        var next = lang === "en" ? "ar" : "en";
        try { localStorage.setItem(KEY, next); } catch (e) { }
        var q = location.search.replace(/([?&])lang=(en|ar)(&|$)/, "$1").replace(/[?&]$/, "");
        location.replace(location.pathname + (q ? q + "&" : "?") + "lang=" + next + location.hash);
      });
    }
    if (lang !== "en") return;
    var t = document.querySelector("title[data-en]"); if (t) document.title = t.getAttribute("data-en");
    document.querySelectorAll("meta[data-en]").forEach(function (e) { e.setAttribute("content", e.getAttribute("data-en")); });
    document.querySelectorAll("body [data-en]").forEach(function (e) { e.textContent = e.getAttribute("data-en"); });
    document.querySelectorAll("[data-en-html]").forEach(function (e) { e.innerHTML = e.getAttribute("data-en-html"); });
    document.querySelectorAll("[data-en-aria]").forEach(function (e) { e.setAttribute("aria-label", e.getAttribute("data-en-aria")); });
    document.querySelectorAll("[data-en-ph]").forEach(function (e) { e.setAttribute("placeholder", e.getAttribute("data-en-ph")); });
  }
  window.AtelierI18n = { lang: lang, apply: apply };
})();
