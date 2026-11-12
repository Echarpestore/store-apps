/* ============================================================
   🎐 silk.js — قماش بيتحرك في خلفية الواجهة (canvas خفيف)
   ------------------------------------------------------------
   شرايط لون ناعمة بتتموّج ببطء زي طرحة في الهوا. بيترسم على
   canvas صغير (ربع الدقة) والـCSS بيكبّره وينعّمه — رخيص على الموبايل.
   · بيقف لما الواجهة تخرج من الشاشة أو التاب يتخفّى.
   · «تقليل الحركة» في الجهاز = لقطة ثابتة من غير حركة.
   ============================================================ */
(function () {
  "use strict";
  var cv = document.getElementById("silk");
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");
  var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* [لون، ارتفاع الشريط (نسبة)، سُمكه، سرعته، طوله الموجي، إزاحة] */
  var BANDS = [
    ["#f7c9d6", .16, .30, .11, 1.25, 0.0],
    ["#e0447f", .34, .20, .16, .95, 1.7],
    ["#f4a78f", .50, .22, .13, 1.45, 3.1],
    ["#c7b2ea", .66, .24, .09, 1.1, 4.6],
    ["#fbe3ea", .84, .30, .14, 1.6, 2.4]
  ];
  var W = 0, H = 0, running = false, visible = true, last = 0;

  function size() {
    var r = cv.getBoundingClientRect();
    W = cv.width = Math.max(120, Math.round(r.width / 4));
    H = cv.height = Math.max(160, Math.round(r.height / 4));
  }
  function yAt(b, x, t, edge) {
    var k = x / W;
    return H * (b[1] + edge * b[2] / 2)
      + Math.sin(k * Math.PI * 2 / b[4] + t * b[3] + b[5]) * H * .085
      + Math.sin(k * Math.PI * 5.2 / b[4] - t * b[3] * 1.7 + b[5] * 2) * H * .028
      + (k - .5) * H * -.22;                              // ميل خفيف — القماش طاير لفوق
  }
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < BANDS.length; i++) {
      var b = BANDS[i], x;
      ctx.beginPath();
      for (x = 0; x <= W; x += 6) { var y1 = yAt(b, x, t, -1); if (x === 0) ctx.moveTo(x, y1); else ctx.lineTo(x, y1); }
      for (x = W; x >= 0; x -= 6) ctx.lineTo(x, yAt(b, x, t + 1.3, 1));
      ctx.closePath();
      var g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, b[0] + "00"); g.addColorStop(.25, b[0] + "cc"); g.addColorStop(.7, b[0] + "e6"); g.addColorStop(1, b[0] + "33");
      ctx.fillStyle = g; ctx.fill();
      // لمعة الطيّة
      ctx.beginPath();
      for (x = 0; x <= W; x += 6) { var yh = yAt(b, x, t + .5, -.2); if (x === 0) ctx.moveTo(x, yh); else ctx.lineTo(x, yh); }
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = Math.max(1.5, H * .012); ctx.stroke();
    }
  }
  function frame(now) {
    if (!running) return;
    if (now - last > 33) { last = now; draw(now / 1000); }     // ~30 لقطة في الثانية
    requestAnimationFrame(frame);
  }
  function sync() {
    var should = visible && !document.hidden && !REDUCED;
    if (should && !running) { running = true; requestAnimationFrame(frame); }
    else if (!should) running = false;
  }
  size(); draw(2.4);
  window.addEventListener("resize", function () { size(); draw(performance.now() / 1000); });
  document.addEventListener("visibilitychange", sync);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }).observe(cv);
  }
  sync();
})();
