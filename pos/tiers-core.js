/* ============================================================
   🏅 tiers-core.js — v1 — مستويات العميلة (برونز · سيلفر · جولد · بلاتينيوم)
   ------------------------------------------------------------
   ملف **واحد** بيشتغل في POS (compat) وتطبيقات العميلة (glow/loyalty) والتابلت.
   منطق خالص من غير Firestore — عشان الاختبار وعشان كل التطبيقات تحسب نفس الرقم.

   📐 القواعد (قرار المالك 07-10):
   · النقطة = 35 ج.م (من إعدادات الولاء pointsPerEGP — مش مكتوبة هنا)
   · برونز: كل عميلة من أول يوم · سيلفر 60 · جولد 120 · بلاتينيوم 200 نقطة
   · المستوى بيتحسب على النقط **المكتسبة** في آخر 12 شهر (مش الرصيد — الاستبدال مبيوقّعش المستوى)

   🗄️ التخزين: على مستند العميلة خريطة شهرية لكل براند
      tierPts_echarpe: { "2026-10": 12, "2026-09": 7, ... }   (وبالمثل tierPts_glow)
      POS بيزوّدها مع كل فاتورة (loyaltyPointsEarned صافي المرتجع)، وزرار «احسب من الفواتير» بيبنيها لأول مرة.

   🚦 التشغيل: loyalty.tiers.enabled — لو مش true مفيش أي حاجة بتظهر في أي تطبيق،
      لكن الخريطة بتتكتب من دلوقتي عشان يوم الإطلاق العميلات يلاقوا مستواهم جاهز.
   ============================================================ */
(function(){
  'use strict';

  var TIERS = ['bronze', 'silver', 'gold', 'platinum'];
  var META = {
    bronze:   { ar: 'برونز',     en: 'Bronze',   icon: '🥉' },
    silver:   { ar: 'سيلفر',     en: 'Silver',   icon: '🥈' },
    gold:     { ar: 'جولد',      en: 'Gold',     icon: '🥇' },
    platinum: { ar: 'بلاتينيوم', en: 'Platinum', icon: '💎' }
  };

  var DEFAULT_PERKS = {
    bronze: [
      { icon: '⭐', t: 'نقطة على كل 35 ج.م', s: 'النقط بتتجمع من أول فاتورة' },
      { icon: '💬', t: 'خدمة العملاء', s: 'بنرد خلال 4 ساعات' },
      { icon: '🔁', t: 'استبدال 14 يوم', s: 'بالفاتورة' }
    ],
    silver: [
      { icon: '🚚', t: 'تقيسي في البيت', s: 'تختاري اليوم والساعة والمندوب يجيلك ويرجّع الباقي', ctr: '1 / شهر' },
      { icon: '⚡', t: 'خدمة العملاء', s: 'بنرد خلال ساعة' },
      { icon: '🔁', t: 'استبدال 21 يوم', s: 'بالفاتورة' },
      { icon: '🛍️', t: 'شنطة سيلفر', s: 'في كل زيارة' }
    ],
    gold: [
      { icon: '🚚', t: 'تقيسي في البيت', s: 'تختاري اليوم والساعة وتتابعي المندوب لايف', ctr: '2 / شهر' },
      { icon: '⚡', t: 'خدمة العملاء', s: 'بنرد خلال 15 دقيقة · وبنرجعلك في المعاد اللي تحدديه' },
      { icon: '🎁', t: 'تغليف هدية دايمًا', s: 'شنطة جولد + شريط ستان' },
      { icon: '🆕', t: 'الكوليكشن الجديد قبل الناس', s: 'بـ48 ساعة' },
      { icon: '🔁', t: 'استبدال 30 يوم', s: 'بالفاتورة' }
    ],
    platinum: [
      { icon: '🚚', t: 'تقيسي في البيت', s: 'اليوم والساعة على ذوقك · المندوب لايف · ادفعي بعد ما تقيسي', ctr: '3 / شهر' },
      { icon: '🏬', t: 'معاد خاص في الفرع', s: 'قبل الفتح أو بعد القفل — الفرع ليكي' },
      { icon: '👗', t: 'ستايلست في الشات', s: 'ترسم لك الطقم من صورتك قبل ما تنزلي' },
      { icon: '🆕', t: 'تحجزي من الكوليكشن قبل ما ينزل', s: 'وقطع محدودة باسمك' },
      { icon: '🔁', t: 'استبدال 60 يوم', s: 'من غير فاتورة — فاتورتك في التطبيق' },
      { icon: '🎁', t: 'علبة بلاتينيوم + كارت باسمك', s: 'وهدية عيد ميلادك' }
    ]
  };

  var DEFAULTS = { enabled: false, silver: 60, gold: 120, platinum: 200, windowMonths: 12, perks: DEFAULT_PERKS };

  function cfgOf(raw){
    var c = Object.assign({}, DEFAULTS, raw || {});
    c.silver = Math.max(1, Number(c.silver) || DEFAULTS.silver);
    c.gold = Math.max(c.silver + 1, Number(c.gold) || DEFAULTS.gold);
    c.platinum = Math.max(c.gold + 1, Number(c.platinum) || DEFAULTS.platinum);
    c.windowMonths = Math.max(1, Number(c.windowMonths) || 12);
    c.perks = Object.assign({}, DEFAULT_PERKS, (raw && raw.perks) || {});
    c.enabled = c.enabled === true;
    return c;
  }
  function tiersEnabled(loyaltyCfg){ return !!(loyaltyCfg && loyaltyCfg.tiers && loyaltyCfg.tiers.enabled === true); }

  // "2026-10" بتوقيت القاهرة (الفواتير كلها مصر)
  function monthKey(ms){
    var d = new Date(Number(ms) || Date.now());
    try{
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit' }).formatToParts(d);
      var y = '', m = '';
      p.forEach(function(x){ if(x.type === 'year') y = x.value; if(x.type === 'month') m = x.value; });
      if(y && m) return y + '-' + m;
    }catch(e){}
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function monthKeys(nowMs, months){
    var out = [], d = new Date(Number(nowMs) || Date.now());
    var k = monthKey(d.getTime()); var y = +k.slice(0, 4), m = +k.slice(5, 7);
    for(var i = 0; i < months; i++){
      out.push(y + '-' + String(m).padStart(2, '0'));
      m--; if(m === 0){ m = 12; y--; }
    }
    return out;
  }
  // مجموع النقط المكتسبة في آخر N شهر (الشهر الحالي محسوب)
  function pointsInWindow(map, nowMs, months){
    if(!map || typeof map !== 'object') return 0;
    var keys = monthKeys(nowMs, months || 12), sum = 0;
    keys.forEach(function(k){ sum += Number(map[k]) || 0; });
    return Math.max(0, Math.round(sum));
  }
  function fieldFor(brand){ return 'tierPts_' + (brand === 'glow' ? 'glow' : 'echarpe'); }
  function pointsFor(customer, brand, nowMs, cfg){
    var c = cfgOf(cfg);
    return pointsInWindow(customer && customer[fieldFor(brand)], nowMs, c.windowMonths);
  }

  function tierFor(pts, cfg){
    var c = cfgOf(cfg); pts = Number(pts) || 0;
    if(pts >= c.platinum) return 'platinum';
    if(pts >= c.gold) return 'gold';
    if(pts >= c.silver) return 'silver';
    return 'bronze';
  }
  function thresholdOf(tier, cfg){ var c = cfgOf(cfg); return tier === 'bronze' ? 0 : c[tier]; }
  // {tier, next, need, from, to, pct}
  function progress(pts, cfg){
    var c = cfgOf(cfg); pts = Math.max(0, Number(pts) || 0);
    var tier = tierFor(pts, c), i = TIERS.indexOf(tier);
    var next = i < TIERS.length - 1 ? TIERS[i + 1] : null;
    var from = thresholdOf(tier, c), to = next ? thresholdOf(next, c) : from;
    var need = next ? Math.max(0, to - pts) : 0;
    var pct = next ? Math.round(((pts - from) / (to - from)) * 100) : 100;
    return { tier: tier, next: next, need: need, from: from, to: to, pct: Math.max(0, Math.min(100, pct)), pts: pts };
  }
  // كام جنيه كمان للمستوى الجاي (بسعر النقطة من إعدادات الولاء)
  function egpToNext(pts, cfg, pointsPerEGP){
    var p = progress(pts, cfg); var rate = Number(pointsPerEGP) || 35;
    return p.next ? Math.ceil(p.need * rate) : 0;
  }

  /* ---------- HTML للتطبيق/التابلت ---------- */
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(ch){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function fmtN(n){ try{ return Number(n || 0).toLocaleString('en-US'); }catch(e){ return String(n); } }

  var CSS =
    '.tr-card{position:relative;border-radius:22px;padding:18px 18px 16px;color:#fff;overflow:hidden;min-height:150px;box-shadow:0 22px 40px -22px rgba(0,0,0,.6);isolation:isolate;margin:0 0 12px;font-family:"Space Grotesk",Cairo,sans-serif;direction:ltr;text-align:left}' +
    '.tr-card::before{content:"";position:absolute;inset:0;background:radial-gradient(80% 70% at 85% -10%,rgba(255,255,255,.32),transparent 60%);pointer-events:none}' +
    '.tr-card::after{content:"";position:absolute;top:-60%;left:-30%;width:60%;height:220%;background:linear-gradient(100deg,transparent 35%,rgba(255,255,255,.22) 50%,transparent 65%);transform:rotate(12deg);animation:trShine 4s ease-in-out infinite;pointer-events:none}' +
    '@keyframes trShine{0%{left:-60%}60%,100%{left:120%}}' +
    '.tr-card .brand{font-family:"Space Grotesk",Cairo,sans-serif;font-weight:700;letter-spacing:.22em;font-size:11px;opacity:.85}' +
    '.tr-card .tier{display:flex;align-items:center;gap:10px;margin-top:10px}' +
    '.tr-card .tier .ic{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;font-size:24px;background:rgba(255,255,255,.16);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.28)}' +
    '.tr-card .tier b{font-size:24px;font-weight:900;line-height:1.1;display:block}.tr-card .tier small{font-size:11.5px;opacity:.85;font-weight:700}' +
    '.tr-card .pts{position:absolute;right:18px;bottom:16px;text-align:right;direction:ltr}.tr-card .pts b{font-family:"Space Grotesk",Cairo,sans-serif;font-size:30px;font-weight:700;line-height:1;display:block}.tr-card .pts small{font-size:11px;opacity:.85;font-weight:700}' +
    '.tr-card .since{position:absolute;left:18px;bottom:16px;font-size:11px;opacity:.8;font-weight:700}' +
    '.tr-bronze{background:linear-gradient(135deg,#7a3f22 0%,#b8683d 45%,#dfa078 100%)}' +
    '.tr-silver{background:linear-gradient(135deg,#5b616b 0%,#9ea5ae 45%,#dfe3e8 100%);color:#1c2026}.tr-silver::before{background:radial-gradient(80% 70% at 85% -10%,rgba(255,255,255,.7),transparent 60%)}' +
    '.tr-gold{background:linear-gradient(135deg,#8a5a12 0%,#d9a53f 45%,#f6dd8a 100%);color:#2b1d05}' +
    '.tr-platinum{background:linear-gradient(135deg,#0b0b0f 0%,#26262e 55%,#4b4b57 100%);box-shadow:0 22px 40px -22px rgba(0,0,0,.9),inset 0 0 0 1px rgba(255,255,255,.14)}.tr-platinum .tier .ic{background:linear-gradient(135deg,#e9e9ef,#9fa3b1);color:#111;border:none}' +
    '.tr-prog{margin:6px 4px 6px;font-family:Cairo,sans-serif;direction:rtl}.tr-prog .row{display:flex;justify-content:space-between;font-size:12.5px;font-weight:800}.tr-prog .row span:last-child{color:#6b7280;font-weight:700}' +
    '.tr-bar{height:10px;border-radius:10px;background:#f1e4ea;margin-top:7px;overflow:hidden}.tr-bar i{display:block;height:100%;border-radius:10px;background:linear-gradient(90deg,#ee6a86,#f0bc62);animation:trFill 1.1s cubic-bezier(.22,1,.36,1) both}@keyframes trFill{from{width:0}}' +
    '.tr-ladder{display:flex;justify-content:space-between;margin-top:8px;font-size:10.5px;color:#6b7280;font-weight:700}.tr-ladder b{color:#1a1f2b}.tr-ladder .me{color:#d4518f}' +
    '.tr-hint{margin:10px 4px 0;background:#fff;border:1px solid #f3dde6;border-radius:14px;padding:10px 12px;font-size:12.5px;font-weight:700;line-height:1.6;color:#1a1f2b;font-family:Cairo,sans-serif;direction:rtl}.tr-hint em{font-style:normal;color:#d4518f}' +
    '.tr-sec{margin:16px 4px 6px;font-size:13px;font-weight:900;display:flex;align-items:center;gap:8px;color:#1a1f2b;font-family:Cairo,sans-serif;direction:rtl}.tr-sec small{color:#6b7280;font-weight:700;font-size:11px}' +
    '.tr-perk{display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #f3e3ea;border-radius:16px;padding:11px 12px;margin:0 4px 8px;color:#1a1f2b;font-family:Cairo,sans-serif;direction:rtl}' +
    '.tr-perk .pi{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:19px;background:#fff1f6;flex:0 0 auto}.tr-perk b{display:block;font-size:13px}.tr-perk small{display:block;color:#6b7280;font-size:11.5px;font-weight:600;margin-top:1px}' +
    '.tr-perk .ctr{margin-inline-start:auto;font-family:"Space Grotesk",Cairo,sans-serif;font-weight:700;font-size:13px;color:#d4518f;background:#fff1f6;padding:4px 9px;border-radius:9px;white-space:nowrap}.tr-perk .ok{margin-inline-start:auto;color:#2fa36b;font-weight:900}' +
    '.tr-perk.locked{opacity:.55;background:#fbf7f9}.tr-perk.locked .pi{background:#f1eef0;filter:grayscale(1)}.tr-perk.locked .ctr{background:#eee;color:#888}' +
    '.tr-chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:800;color:#fff;vertical-align:middle}' +
    '.tr-chip.tr-silver,.tr-chip.tr-gold{color:#1c2026}' +
    '@media (prefers-reduced-motion:reduce){.tr-card::after,.tr-bar i{animation:none}}';

  function injectCss(doc){
    doc = doc || (typeof document !== 'undefined' ? document : null); if(!doc) return;
    if(doc.getElementById('trCss')) return;
    var st = doc.createElement('style'); st.id = 'trCss'; st.textContent = CSS; (doc.head || doc.body).appendChild(st);
  }

  function perksHtml(list, locked){
    return (list || []).map(function(p){
      return '<div class="tr-perk' + (locked ? ' locked' : '') + '"><div class="pi">' + esc(p.icon || '✨') + '</div><div><b>' + esc(p.t) + '</b>' +
        (p.s ? '<small>' + esc(p.s) + '</small>' : '') + '</div>' +
        (p.ctr ? '<span class="ctr">' + esc(p.ctr) + '</span>' : (locked ? '' : '<span class="ok">✓</span>')) + '</div>';
    }).join('');
  }
  // القسم الكامل لتبويب «بطاقتي»: الكارت + التقدم + المميزات (الحالية + المقفولة في المستوى الجاي)
  function sectionHtml(o){
    o = o || {}; var c = cfgOf(o.cfg); var pts = Number(o.pts) || 0; var p = progress(pts, c);
    var m = META[p.tier], brandEn = (o.brand === 'glow' ? 'GLOW' : 'ECHARPE');
    var ladder = TIERS.map(function(t){
      var th = thresholdOf(t, c);
      return t === p.tier ? '<b class="me">' + META[t].icon + ' ' + META[t].en + '</b>' : '<span>' + META[t].icon + (th ? ' ' + th : '') + '</span>';
    }).join('');
    var h = '<div class="tr-card tr-' + p.tier + '">' +
      '<div class="brand">' + brandEn + ' ' + (p.tier === 'platinum' ? 'PLATINUM' : 'MEMBER') + '</div>' +
      '<div class="tier"><div class="ic">' + m.icon + '</div><div><b>' + m.en + '</b><small>' + (p.next ? 'Current tier' : 'Top tier') + (o.since ? ' · ' + esc(o.since) : '') + '</small></div></div>' +
      '<div class="pts"><b>' + fmtN(pts) + '</b><small>pts · last ' + c.windowMonths + ' months</small></div>' +
      (o.visits ? '<div class="since">' + fmtN(o.visits) + ' visits</div>' : '') +
      '</div>' +
      '<div class="tr-prog"><div class="row"><span>' + (p.next ? META[p.next].icon + ' فاضل لك ' + fmtN(p.need) + ' نقطة توصلي ' + META[p.next].en : m.icon + ' انتي في أعلى مستوى') + '</span>' +
      '<span>' + (p.next ? '<span dir="ltr">' + fmtN(pts) + ' / ' + fmtN(p.to) + '</span>' : fmtN(pts) + ' نقطة') + '</span></div>' +
      '<div class="tr-bar"><i style="width:' + p.pct + '%' + (p.next ? '' : ';background:linear-gradient(90deg,#9fa3b1,#e9e9ef)') + '"></i></div>' +
      '<div class="tr-ladder">' + ladder + '</div></div>' +
      // (قرار المالك 09-10: مفيش ذكر لمبلغ بالجنيه — نقط بس)
      '<div class="tr-sec">مميزاتك دلوقتي</div>' + perksHtml(c.perks[p.tier], false) +
      (p.next ? '<div class="tr-sec">هتفتحي في ' + META[p.next].en + ' <small>🔒</small></div>' + perksHtml(c.perks[p.next], true) : '');
    return h;
  }
  function chipHtml(tier){ var m = META[tier] || META.bronze; return '<span class="tr-chip tr-' + (META[tier] ? tier : 'bronze') + '">' + m.icon + ' ' + m.en + '</span>'; }

  var Tiers = {
    TIERS: TIERS, META: META, DEFAULTS: DEFAULTS, DEFAULT_PERKS: DEFAULT_PERKS, CSS: CSS,
    cfgOf: cfgOf, enabled: tiersEnabled, monthKey: monthKey, monthKeys: monthKeys, pointsInWindow: pointsInWindow,
    fieldFor: fieldFor, pointsFor: pointsFor, tierFor: tierFor, thresholdOf: thresholdOf, progress: progress, egpToNext: egpToNext,
    sectionHtml: sectionHtml, chipHtml: chipHtml, perksHtml: perksHtml, injectCss: injectCss
  };
  if(typeof window !== 'undefined') window.Tiers = Tiers;
  if(typeof module !== 'undefined' && module.exports) module.exports = Tiers;
})();
