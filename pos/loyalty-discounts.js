/* ============================================================
   🎁 loyalty-discounts.js — خصومات الولاء في التقارير (نقط + مكافآت)
   ------------------------------------------------------------
   بيتحمّل من pos/index.html قبل ما التقارير تتفتح:
     <script src="loyalty-discounts.js?v=706"></script>

   النقط والمكافأة **خصومات مش مبيعات** (تصحيح 4هـ) — فمبيظهروش في ملخص
   المدفوعات. بس المالك لازم يشوف **كلّفوه كام ولمين**: ده مصروف تسويق،
   وكمان باب للتلاعب (كاشير تصرف مكافأة/نقط عميلة مش موجودة).

   ✅ بطاقة «خصومات الولاء» تحت ملخص المدفوعات: العدد والإجمالي لكل نوع.
   ✅ دوسة على أي نوع → كل فاتورة: التاريخ · العميلة · المبلغ · الكاشير.
      دوسة على الفاتورة تفتحها، وعلى العميلة تفتح بروفايلها.
   ⚠️ قراءة بس. بيفهم الشكلين: سطر سالب في `items` (الأصل) و
      `payments.points/reward` (فواتير v696→v704 الانتقالية).
   ============================================================ */

function loyaltyDiscountRows(sales){
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const mk = () => ({ total: 0, count: 0, pts: 0, rows: [] });
  const out = { points: mk(), reward: mk() };
  (sales || []).forEach(function(s){
    if(!s || s.reversed || s.isReversal) return;      // نفس قاعدة repAggregate
    const p = s.payments || {};
    let pointsAmt = Number(p.points) || 0, rewardAmt = Number(p.reward) || 0;
    (s.items || []).forEach(function(it){
      if(!it || !((Number(it.price) || 0) < 0) || it.isReturn) return;
      const v = Math.abs((Number(it.price) || 0) * (Number(it.qty) || 1));
      if(it.isRewardDiscount) rewardAmt += v;
      else if(it.isRedemption && !it.isCreditSpend) pointsAmt += v;   // ⚠️ سطر الرصيد عليه isRedemption كمان
    });
    const base = { id: s.id || '', invoiceNo: s.invoiceNo || '', invoiceCode: s.invoiceCode || '',
      t: (typeof s._t === 'number') ? s._t : 0, customerPhone: s.customerPhone || '', customerName: s.customerName || '',
      employeeName: s.employeeName || '', invoiceTotal: r2(s.total) };
    if(pointsAmt > 0){
      const pts = Number(s.pointsRedeemed) || 0;
      out.points.total += pointsAmt; out.points.count++; out.points.pts += pts;
      out.points.rows.push(Object.assign({ amount: r2(pointsAmt), pts: pts }, base));
    }
    if(rewardAmt > 0){
      out.reward.total += rewardAmt; out.reward.count++;
      out.reward.rows.push(Object.assign({ amount: r2(rewardAmt), pts: 0 }, base));
    }
  });
  ['points', 'reward'].forEach(function(k){
    out[k].total = r2(out[k].total);
    out[k].rows.sort(function(a, b){ return (b.t || 0) - (a.t || 0); });
  });
  out.total = r2(out.points.total + out.reward.total);
  return out;
}

if(typeof module !== 'undefined' && module.exports){ module.exports = { loyaltyDiscountRows }; }

(function(){
  'use strict';
  if(typeof window === 'undefined') return;
  window.loyaltyDiscountRows = loyaltyDiscountRows;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const safeId = s => String(s || '').replace(/[^\w\-]/g, '');
  const TITLES = { points: '🎁 استبدال نقط', reward: '🎁 مكافآت خاصة' };
  let _data = null;

  /* 🧾 البطاقة — بتتنادى من تبويب «ملخص المدفوعات» في pos-reports.js */
  window.loyaltyDiscountCardHTML = function(sales){
    // الوقت بيتحسب هنا (saleTs في pos-core) عشان الدالة الخام تفضل من غير اعتماديات
    const withT = (sales || []).map(function(s){ let t = 0; try{ t = (typeof saleTs === 'function' ? saleTs(s) : 0) || 0; }catch(e){} return Object.assign({}, s, { _t: t }); });
    _data = loyaltyDiscountRows(withT);
    if(!_data.points.count && !_data.reward.count) return '';
    const row = function(k){
      const d = _data[k]; if(!d.count) return '';
      return '<tr onclick="openLoyaltyDiscounts(\'' + k + '\')" style="cursor:pointer;"><td>' + TITLES[k] + ' <span style="color:var(--accent); font-size:11px;">◀ التفاصيل</span></td>'
        + '<td class="num">' + d.count + '</td><td class="num">' + (k === 'points' && d.pts ? d.pts + ' نقطة' : '—') + '</td>'
        + '<td class="num" style="color:var(--minus); font-weight:800;">−' + d.total.toFixed(2) + '</td></tr>';
    };
    return '<div class="rep-card" style="margin-top:12px;"><h2 style="margin:0 0 4px; font-size:15px;">🎁 خصومات الولاء</h2>'
      + '<div style="color:var(--muted); font-size:11.5px; margin-bottom:8px;">خصم من جيبك مش مبيعات — مش محسوبة في ملخص المدفوعات فوق. دوس على السطر للتفاصيل.</div>'
      + '<table class="rep-tbl"><thead><tr><th>النوع</th><th class="num">فواتير</th><th class="num">نقط</th><th class="num">القيمة</th></tr></thead><tbody>'
      + row('points') + row('reward') + '</tbody><tfoot><tr class="grand"><td>الإجمالي</td><td class="num">' + (_data.points.count + _data.reward.count)
      + '</td><td class="num"></td><td class="num">−' + _data.total.toFixed(2) + ' ج.م</td></tr></tfoot></table></div>';
  };

  function close(){ const o = document.getElementById('loyaltyDiscOverlay'); if(o) o.remove(); }
  window.closeLoyaltyDiscounts = close;
  window.loyaltyDiscOpenInvoice = function(id){ close(); if(typeof openInvoice === 'function') openInvoice(id); };
  window.loyaltyDiscOpenCustomer = function(phone){ close(); if(typeof openCustomerProfile === 'function') openCustomerProfile(phone); };

  window.openLoyaltyDiscounts = function(kind){
    if(!_data || !_data[kind]) return;
    close();
    const d = _data[kind];
    // 👥 تجميع بالعميلة — اللي بتتكرر كتير بتبان فوق
    const byCust = {};
    d.rows.forEach(function(r){ const k = r.customerPhone || '—'; (byCust[k] = byCust[k] || { name: r.customerName, n: 0, sum: 0 }); byCust[k].n++; byCust[k].sum += r.amount; });
    const top = Object.keys(byCust).map(k => Object.assign({ phone: k }, byCust[k])).sort((a, b) => b.sum - a.sum).slice(0, 5);
    const topHtml = top.length > 1 ? '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">' + top.map(function(c){
      return '<span ' + (c.phone !== '—' ? 'onclick="loyaltyDiscOpenCustomer(\'' + safeId(c.phone) + '\')" style="cursor:pointer; ' : 'style="')
        + 'background:var(--panel2); border:1px solid var(--border); border-radius:99px; padding:5px 11px; font-size:11px; font-weight:700;">👤 '
        + esc(c.name || c.phone) + ' · ' + c.n + '× · ' + c.sum.toFixed(0) + ' ج</span>'; }).join('') + '</div>' : '';
    const list = d.rows.map(function(r){
      const when = r.t ? new Date(r.t).toLocaleString('ar-EG', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
      const cust = r.customerPhone
        ? '<span onclick="event.stopPropagation(); loyaltyDiscOpenCustomer(\'' + safeId(r.customerPhone) + '\')" style="color:var(--accent); cursor:pointer; font-weight:800;">👤 ' + esc(r.customerName || r.customerPhone) + '</span>'
        : '<span style="color:var(--minus); font-weight:800;">⚠️ من غير عميلة</span>';
      return '<div onclick="loyaltyDiscOpenInvoice(\'' + safeId(r.id) + '\')" style="display:flex; justify-content:space-between; gap:10px; padding:10px 0; border-bottom:1px solid var(--border); cursor:pointer;">'
        + '<div style="min-width:0;"><div style="font-size:12.5px; font-weight:800;">🧾 ' + esc(r.invoiceNo || r.invoiceCode || r.id.slice(-6)) + ' · ' + cust + '</div>'
        +   '<div style="color:var(--muted); font-size:10.5px; margin-top:2px;">' + when + (r.employeeName ? ' · الكاشير: ' + esc(r.employeeName) : '') + ' · الفاتورة ' + r.invoiceTotal.toFixed(2) + '</div></div>'
        + '<div style="text-align:left; flex-shrink:0;"><div style="font-weight:900; font-size:15px; color:var(--minus);">−' + r.amount.toFixed(2) + '</div>'
        +   (r.pts ? '<div style="color:var(--muted); font-size:10px;">' + r.pts + ' نقطة</div>' : '') + '</div></div>';
    }).join('');
    const ov = document.createElement('div');
    ov.id = 'loyaltyDiscOverlay';
    ov.style.cssText = 'position:fixed; inset:0; z-index:9500; background:rgba(0,0,0,.72); display:flex; align-items:center; justify-content:center; padding:14px;';
    ov.innerHTML = '<div style="background:var(--panel); border:1px solid var(--border); border-radius:16px; width:100%; max-width:600px; max-height:88vh; display:flex; flex-direction:column;">'
      + '<div style="padding:14px 16px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">'
      +   '<b style="font-size:15px;">' + TITLES[kind] + ' — ' + d.count + ' فاتورة · −' + d.total.toFixed(2) + ' ج.م</b>'
      +   '<button onclick="closeLoyaltyDiscounts()" style="border:none; background:var(--panel2); color:var(--text); border-radius:9px; padding:7px 12px; font-weight:800; cursor:pointer;">✕</button></div>'
      + '<div style="padding:12px 16px; overflow:auto;">' + topHtml + list + '</div></div>';
    ov.addEventListener('click', e => { if(e.target === ov) close(); });
    document.body.appendChild(ov);
  };
})();
