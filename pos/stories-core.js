/* ============================================================
   📸 stories-core.js — v1 — منطق الستوري المشترك (Sales · Office 2 · التطبيق)
   ------------------------------------------------------------
   قرار المالك (10-10-2026):
   · الموظفات بيصوّروا الستوري/المنتجات من Sales — بالدور: كل يوم موظفة.
   · مفيش حاجة بتتنشر غير بموافقة المالك من Office 2 (يعدّل الكلام أو يرجّعها).
   · كل ٥ قطع تتباع من الباركود اللي الموظفة صوّرته = نقطة بيع عادية
     (بتنزل في sales_points وتتحسب في المرتب آخر الشهر).
   · نفس الباركود يتصور عادي أكتر من مرة (الكود الواحد عليه ألوان كتير)،
     ولو أكتر من موظفة صوّروه — البيع **يتقسم بينهم**.
   الملف ده **دوال صافية** (من غير Firebase) عشان تتختبر في node.
   ============================================================ */
(function(root){
'use strict';

var DAY = 86400000;
var GLOW_BRANCHES = ['Glow'];
var DEFAULTS = { piecesPerPoint: 5, windowDays: 30 };

/* ---------- 🕒 يوم القاهرة ---------- */
var _fmt = null;
function caiParts(ms){
  if(!_fmt) _fmt = new Intl.DateTimeFormat('en-GB', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit', weekday:'short' });
  var o = {}; _fmt.formatToParts(new Date(ms)).forEach(function(p){ o[p.type] = p.value; });
  return { y:+o.year, m:+o.month, d:+o.day, wd:o.weekday };
}
function dayKey(ms){ var p = caiParts(ms); return p.y + '-' + (p.m < 10 ? '0' : '') + p.m + '-' + (p.d < 10 ? '0' : '') + p.d; }
// رقم اليوم (ثابت لكل يوم قاهرة) — للدور
function dayIndex(ms){ var p = caiParts(ms); return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / DAY); }
var WD = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
function dow(ms){ return WD[caiParts(ms).wd]; }   // 0 = الأحد (نفس dayOff في sales_employees)

function brandOfBranch(branch){ return GLOW_BRANCHES.indexOf(String(branch || '').trim()) >= 0 ? 'glow' : 'echarpe'; }
function feedKey(brand, status){ return String(brand || 'echarpe') + '_' + String(status || 'pending'); }

/* ---------- 🔁 الدور: موظفة واحدة كل يوم لكل براند ----------
   الترتيب ثابت (بالمعرّف) · اليوم بيحدد نقطة البداية · اللي إجازتها
   الأسبوعية النهارده بتتعدّى للي بعدها. */
function eligible(emps, brand){
  return (emps || []).filter(function(e){
    if(!e || e.deletedAt || e.active === false || e.terminated) return false;
    var br = String(e.branch || '').trim();
    if(!br || br === 'الإدارة') return false;
    return brandOfBranch(br) === brand;
  }).sort(function(a, b){ return String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0); });
}
function turnFor(emps, brand, ms){
  var list = eligible(emps, brand); if(!list.length) return null;
  var n = list.length, start = ((dayIndex(ms) % n) + n) % n, wd = dow(ms);
  for(var i = 0; i < n; i++){
    var e = list[(start + i) % n];
    var off = (e.dayOff === undefined || e.dayOff === null || e.dayOff === '') ? -1 : Number(e.dayOff);
    if(off !== wd) return e;
  }
  return list[start];
}

/* ---------- ⭐ النقط من البيع ----------
   stories: [{ id, brand, barcode, employeeId, employeeName, branch, approvedAt, status }]
   sales:   [{ id, branch, ms, items:[{ barcode, qty, isReturn }] }]  (مترتبة أو لأ)
   credits: { empId: { credit, awarded, name, branch } }  ← الحالة اللي فاتت
   بيرجع: { credits, awards:[{ empId, name, branch, k, ts }] }
   · القطعة اللي اتباعت وهي جوه نافذة صورة (approvedAt → +windowDays) بتتحسب.
   · لو أكتر من موظفة ليهم صورة شغالة لنفس الباركود: القطعة بتتقسم بالتساوي.
   · المرتجع بينقص الرصيد (بس النقط اللي اتصرفت خلاص مش بتتسحب). */
function active(s){ return s && s.barcode && s.approvedAt && (s.status === 'published' || s.status === 'archived'); }
function computeCredits(stories, sales, credits, opts){
  opts = opts || {};
  var per = Number(opts.piecesPerPoint) > 0 ? Number(opts.piecesPerPoint) : DEFAULTS.piecesPerPoint;
  var win = (Number(opts.windowDays) > 0 ? Number(opts.windowDays) : DEFAULTS.windowDays) * DAY;
  var out = {}; Object.keys(credits || {}).forEach(function(k){ var c = credits[k] || {}; out[k] = { credit: Number(c.credit) || 0, awarded: Number(c.awarded) || 0, name: c.name || '', branch: c.branch || '' }; });
  var byBarcode = {};
  (stories || []).filter(active).forEach(function(s){
    var bc = String(s.barcode).trim(); (byBarcode[bc] = byBarcode[bc] || []).push(s);
  });
  var awards = [];
  var list = (sales || []).slice().sort(function(a, b){ return (a.ms || 0) - (b.ms || 0); });
  list.forEach(function(sale){
    var brand = brandOfBranch(sale.branch);
    (sale.items || []).forEach(function(it){
      if(!it || !it.barcode || it.isRedemption || it.isRewardDiscount) return;
      var group = byBarcode[String(it.barcode).trim()]; if(!group) return;
      var emps = {};
      group.forEach(function(s){
        if((s.brand || 'echarpe') !== brand) return;
        if(sale.ms < s.approvedAt || sale.ms >= s.approvedAt + win) return;
        emps[s.employeeId] = s;
      });
      var ids = Object.keys(emps); if(!ids.length) return;
      var qty = Math.abs(Number(it.qty) || 0) * (it.isReturn ? -1 : 1); if(!qty) return;
      var share = qty / ids.length;
      ids.forEach(function(id){
        var s = emps[id];
        var c = out[id] = out[id] || { credit: 0, awarded: 0, name: s.employeeName || '', branch: s.branch || '' };
        if(!c.name) c.name = s.employeeName || ''; if(!c.branch) c.branch = s.branch || '';
        c.credit = Math.round((c.credit + share) * 1000) / 1000;
        var due = Math.floor(c.credit / per + 1e-9);
        while(c.awarded < due){ c.awarded++; awards.push({ empId: id, name: c.name, branch: c.branch, k: c.awarded, ts: sale.ms }); }
      });
    });
  });
  return { credits: out, awards: awards };
}

/* ---------- 🖼️ تصغير الصورة (المتصفح بس) ---------- */
function compressImage(file, maxSide, quality){
  return new Promise(function(resolve, reject){
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function(){
      try{
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, maxSide / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', quality || 0.78));
      }catch(e){ reject(e); }
    };
    img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('الصورة مش بتفتح')); };
    img.src = url;
  });
}

var api = { DAY: DAY, DEFAULTS: DEFAULTS, dayKey: dayKey, dayIndex: dayIndex, dow: dow, brandOfBranch: brandOfBranch, feedKey: feedKey,
            eligible: eligible, turnFor: turnFor, computeCredits: computeCredits, compressImage: compressImage };
if(typeof module !== 'undefined' && module.exports) module.exports = api;
root.StoriesCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
