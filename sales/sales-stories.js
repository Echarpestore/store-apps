/* ============================================================
   📸 sales-stories.js — v1 (Sales v648) — الموظفة بتصوّر ستوري/منتج
   ------------------------------------------------------------
   قرار المالك (10-10-2026):
   · الموظفات هما اللي بيصوّروا (المالك مش بيروح الفروع) — بالدور، كل يوم موظفة.
   · اللي بيترفع من هنا **مستني موافقة** — المالك بيوافق/يعدّل الكلام/يرجّعه من Office 2.
   · كل ٥ قطع تتباع من الباركود ده = نقطة بيع عادية للموظفة (Office 2 بيحسبها).
   المدخل: زرار «📸 ستوري» في صفحة الموظفة (جنب طلب النواقص).
   البيانات: window.salesStoryApi (sales-app.js) · المنطق: window.StoriesCore
   ============================================================ */
(function(){
  'use strict';
  var S = { emp:null, img:'', thumb:'', product:null, editId:null, busy:false, tab:'new' };
  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function api(){ return window.salesStoryApi; }
  function core(){ return window.StoriesCore; }
  function brand(){ return core().brandOfBranch(window.currentBranch || (S.emp && S.emp.branch) || ''); }
  function toast(msg, bad){ var t = $('stToast'); if(!t) return; t.textContent = msg; t.className = 'stToast on' + (bad ? ' bad' : ''); clearTimeout(t._h); t._h = setTimeout(function(){ t.className = 'stToast'; }, bad ? 3200 : 2000); }

  function inject(){
    if($('stOverlay')) return;
    var css = document.createElement('style');
    css.textContent = ''
      + '#stOverlay{position:fixed;inset:0;z-index:62;background:var(--bg,#12141a);display:none;flex-direction:column;color:var(--ink,#eef0f4);font-family:Cairo,sans-serif;}'
      + '#stOverlay.show{display:flex;}'
      + '.stHead{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line,#2b2f3b);background:var(--panel,#1b1e27);}'
      + '.stHead h3{margin:0;font-size:16px;font-weight:900;flex:1;}.stHead small{display:block;color:var(--sub,#8b90a0);font-size:11.5px;font-weight:600;}'
      + '.stX{width:40px;height:40px;border-radius:12px;border:1px solid var(--line,#2b2f3b);background:transparent;color:inherit;font-size:18px;cursor:pointer;}'
      + '.stTabs{display:flex;gap:6px;padding:10px 14px 0;}.stTabs button{flex:1;border:1px solid var(--line,#2b2f3b);background:transparent;color:var(--sub,#8b90a0);border-radius:12px;padding:9px;font:800 13px Cairo,sans-serif;cursor:pointer;}'
      + '.stTabs button.on{background:var(--gold-dim,#3a2f17);border-color:var(--gold,#d4a84b);color:var(--gold,#d4a84b);}'
      + '.stBody{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px;max-width:520px;width:100%;margin:0 auto;box-sizing:border-box;}'
      + '.stBody>*{flex-shrink:0;}'
      + '.stTurn{border:1px solid var(--gold,#d4a84b);background:var(--gold-dim,#3a2f17);color:var(--gold,#d4a84b);border-radius:14px;padding:10px 12px;font-size:13px;font-weight:800;}'
      + '.stFrame{position:relative;aspect-ratio:4/5;border-radius:18px;overflow:hidden;background:#0c0d12;border:1px dashed var(--line,#3a3f4d);display:grid;place-items:center;cursor:pointer;}'
      + '.stFrame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}'
      + '.stFrame .g{position:absolute;inset:12% 16%;border:1.5px dashed rgba(255,255,255,.35);border-radius:40% 40% 18px 18px;pointer-events:none;}'
      + '.stFrame .c{position:relative;text-align:center;color:var(--sub,#8b90a0);font-size:13px;font-weight:700;line-height:1.9;}.stFrame .c b{display:block;font-size:30px;}'
      + '.stTips{font-size:11.5px;color:var(--sub,#8b90a0);line-height:1.8;}'
      + '.stLbl{font-size:12px;font-weight:800;color:var(--sub,#8b90a0);margin-bottom:-6px;}'
      + '.stIn{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid var(--line,#2b2f3b);background:var(--panel,#1b1e27);color:inherit;font:600 14px Cairo,sans-serif;}'
      + '.stRow{display:flex;gap:8px;}.stRow .stIn{flex:1;}'
      + '.stBtn{border:1px solid var(--line,#2b2f3b);background:transparent;color:inherit;border-radius:12px;padding:11px 14px;font:800 13px Cairo,sans-serif;cursor:pointer;white-space:nowrap;}'
      + '.stBtn.p{background:var(--gold,#d4a84b);border-color:var(--gold,#d4a84b);color:#1a1408;width:100%;padding:14px;font-size:15px;}.stBtn:disabled{opacity:.5;}'
      + '.stProd{font-size:13px;border-radius:12px;padding:9px 12px;background:var(--panel,#1b1e27);border:1px solid var(--line,#2b2f3b);}.stProd.bad{color:#ffb4a8;border-color:#5a2a26;}'
      + '.stWhere{display:grid;grid-template-columns:1fr 1fr;gap:8px;}.stWhere button{border:1px solid var(--line,#2b2f3b);background:transparent;color:var(--sub,#8b90a0);border-radius:12px;padding:11px 6px;font:800 13px Cairo,sans-serif;cursor:pointer;}'
      + '.stWhere button.on{background:var(--gold-dim,#3a2f17);border-color:var(--gold,#d4a84b);color:var(--gold,#d4a84b);}'
      + '.stChk{display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:700;cursor:pointer;}.stChk input{width:20px;height:20px;accent-color:var(--gold,#d4a84b);}'
      + '.stItem{display:flex;gap:12px;align-items:flex-start;padding:10px;border:1px solid var(--line,#2b2f3b);border-radius:14px;background:var(--panel,#1b1e27);}'
      + '.stItem img{width:58px;height:72px;border-radius:10px;object-fit:cover;flex:0 0 auto;}.stItem .n{flex:1;min-width:0;font-size:13px;}.stItem .n b{display:block;font-size:14px;}'
      + '.stPill{display:inline-block;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:800;margin-top:4px;}'
      + '.stP-pending{background:#3a3217;color:#f1c75b;}.stP-published{background:#173a26;color:#5fd38d;}.stP-changes{background:#3a2117;color:#ff9b6b;}.stP-rejected,.stP-archived{background:#2b2f3b;color:#a3a8b8;}'
      + '.stNote{margin-top:6px;font-size:12px;background:#3a2117;color:#ffcfb8;border-radius:10px;padding:7px 9px;}'
      + '.stToast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(30px);opacity:0;z-index:70;background:#173a26;color:#d9ffe7;padding:10px 16px;border-radius:12px;font:800 13px Cairo,sans-serif;transition:.3s;pointer-events:none;}'
      + '.stToast.on{opacity:1;transform:translateX(-50%);}.stToast.bad{background:#4a1d19;color:#ffd9d3;}'
      + '#dh_storyBtn{display:flex;align-items:center;gap:6px;background:transparent;border:1px solid var(--gold,#d4a84b);color:var(--gold,#d4a84b);border-radius:99px;padding:6px 13px;font-family:Cairo;font-weight:800;font-size:11.5px;cursor:pointer;}'
      + '#dh_storyBtn.turn{background:var(--gold,#d4a84b);color:#1a1408;animation:stPulse 1.8s ease-in-out infinite;}'
      + '@keyframes stPulse{50%{box-shadow:0 0 0 6px rgba(212,168,75,.18);}}';
    document.head.appendChild(css);
    var ov = document.createElement('div'); ov.id = 'stOverlay';
    ov.innerHTML = '<div class="stHead"><div style="flex:1"><h3>📸 الستوري والمنتجات</h3><small id="stSub">—</small></div><button class="stX" id="stClose" aria-label="إغلاق">✕</button></div>'
      + '<div class="stTabs"><button data-t="new" class="on">صورة جديدة</button><button data-t="mine">صوري</button></div>'
      + '<div class="stBody" id="stBody"></div>'
      + '<input type="file" accept="image/*" capture="environment" id="stFile" style="display:none">';
    document.body.appendChild(ov);
    var t = document.createElement('div'); t.id = 'stToast'; t.className = 'stToast'; document.body.appendChild(t);
    $('stClose').onclick = close;
    ov.querySelectorAll('.stTabs button').forEach(function(b){ b.onclick = function(){ S.tab = b.dataset.t; if(S.tab === 'new' && !S.editId) reset(); render(); }; });
    $('stFile').onchange = onFile;
  }

  function reset(){ S.img = ''; S.thumb = ''; S.product = null; S.editId = null; S.draft = { where:{ story:true, home:false, offers:false, online:false }, qty:1, title:'', subtitle:'', barcode:'', tryable:true }; }
  function open(empId){
    inject();
    var emp = (api().employees() || []).find(function(e){ return e.id === empId; }); if(!emp){ toast('اختاري اسمك الأول', true); return; }
    S.emp = emp; S.tab = 'new'; reset();
    $('stSub').textContent = emp.name + ' · ' + String(emp.branch || '');
    $('stOverlay').classList.add('show'); render();
  }
  function close(){ var o = $('stOverlay'); if(o) o.classList.remove('show'); }

  function turnLine(){
    try{
      var b = core().brandOfBranch(S.emp.branch), t = core().turnFor(api().employees(), b, Date.now());
      if(!t) return '';
      return t.id === S.emp.id ? '<div class="stTurn">⭐ النهارده دورك — صوّري ستوري حلوة للعميلات</div>' : '<div class="stTurn" style="opacity:.75">دور النهارده: ' + esc(t.name) + ' — وأي حد يقدر يرفع كمان</div>';
    }catch(e){ return ''; }
  }

  function render(){
    document.querySelectorAll('#stOverlay .stTabs button').forEach(function(b){ b.classList.toggle('on', b.dataset.t === S.tab); });
    if(S.tab === 'mine') return renderMine();
    var d = S.draft;
    var prod = S.product === null ? '' : (S.product ? '<div class="stProd">✅ ' + esc(S.product.name || '') + (S.product.price ? ' · ' + esc(S.product.price) + ' ج.م' : '') + '</div>' : '<div class="stProd bad">الكود ده مش في المخزون — اتأكدي منه (من غير باركود صح مش هتاخدي نقط)</div>');
    var W = d.where, isP = !W.story, piece = W.online || W.home;
    var CH = [['story','📸 ستوري النهارده'],['home','🏠 الصفحة الرئيسية'],['offers','🏷️ العروض'],['online','🛒 بيع مباشر بعدد']];
    $('stBody').innerHTML = (S.editId ? '<div class="stTurn">✏️ بتعدّلي صورة رجعت لك — صوّري تاني وابعتي</div>' : turnLine())
      // 🗂️ الصورة تظهر فين (أكتر من اختيار) — الإدارة بتأكد أو تغيّر وهي بتوافق
      + '<div class="stLbl">تظهر فين؟ (اختاري واحد أو أكتر)</div>'
      + '<div class="stWhere">' + CH.map(function(c){ return '<button type="button" data-w="' + c[0] + '" class="' + (W[c[0]] ? 'on' : '') + '">' + c[1] + '</button>'; }).join('') + '</div>'
      + (piece ? '<div class="stRow" style="align-items:center"><span style="font-size:13px;font-weight:800;flex:1">كام قطعة من <u>اللون ده بالظبط</u> في الفرع؟</span><button class="stBtn" type="button" data-q="-1">−</button><b style="min-width:30px;text-align:center;font-size:18px">' + d.qty + '</b><button class="stBtn" type="button" data-q="1">+</button></div>'
        + '<div class="stTips" style="margin-top:-6px">أول ما عميلة تطلبها أونلاين بتتحجز ليها — وهيجيلك تنبيه تشيليها من الرف</div>' : '')
      + '<div class="stFrame" id="stPick">' + (S.img ? '<img src="' + S.img + '" alt="">' : '<span class="g"></span><div class="c"><b>📷</b>دوسي وصوّري الطرحة<br>خلّيها تملى الإطار</div>') + '</div>'
      + '<div class="stTips">💡 نور طبيعي (جنب الشباك أو الباب) · خلفية سادة · الطرحة نضيفة ومكوية وواضحة · صورة بالطول</div>'
      + '<div class="stLbl">باركود الطرحة</div>'
      + '<div class="stRow"><input class="stIn" id="stBc" inputmode="numeric" placeholder="امسحي أو اكتبي الكود" value="' + esc(d.barcode) + '"><button class="stBtn" id="stFind">دوّري</button></div>' + prod
      + '<div class="stLbl">الكلام اللي هيظهر للعميلة</div>'
      + '<input class="stIn" id="stTitle" maxlength="40" placeholder="' + (isP ? 'اسم المنتج زي ما هيظهر — مثلاً: لينن مكرمش بيج' : 'مثلاً: كوليكشن الخريف نزل') + '" value="' + esc(d.title) + '">'
      + '<input class="stIn" id="stSubT" maxlength="60" placeholder="سطر صغير تحته (اختياري) — مثلاً: ٤ ألوان جديدة" value="' + esc(d.subtitle) + '">'
      + '<label class="stChk"><input type="checkbox" id="stTry" ' + (d.tryable ? 'checked' : '') + '> العميلة تقدر تجرّبها على صورتها</label>'
      + '<button class="stBtn p" id="stSend" ' + (S.busy ? 'disabled' : '') + '>' + (S.busy ? 'بيترفع…' : 'ابعتي للمراجعة') + '</button>'
      + '<div class="stTips" style="text-align:center">مش هتظهر للعميلات غير لما الإدارة توافق · كل ٥ قطع تتباع من الكود ده = نقطة ليكي</div>';
    $('stPick').onclick = function(){ keep(); $('stFile').click(); };
    $('stBody').querySelectorAll('[data-w]').forEach(function(b){ b.onclick = function(){ keep(); var w = S.draft.where; w[b.dataset.w] = !w[b.dataset.w]; render(); }; });
    $('stBody').querySelectorAll('[data-q]').forEach(function(b){ b.onclick = function(){ keep(); S.draft.qty = Math.max(1, Math.min(20, S.draft.qty + Number(b.dataset.q))); render(); }; });
    $('stFind').onclick = function(){ keep(); find(); };
    $('stBc').onkeydown = function(e){ if(e.key === 'Enter'){ keep(); find(); } };
    $('stSend').onclick = function(){ keep(); send(); };
  }
  function keep(){ var d = S.draft; if(!$('stBc')) return; d.barcode = $('stBc').value.trim(); d.title = $('stTitle').value.trim(); d.subtitle = $('stSubT').value.trim(); d.tryable = $('stTry').checked; }

  function onFile(e){
    var f = e.target.files && e.target.files[0]; e.target.value = ''; if(!f) return;
    Promise.all([core().compressImage(f, 1080, 0.78), core().compressImage(f, 220, 0.7)]).then(function(r){ S.img = r[0]; S.thumb = r[1]; render(); })
      .catch(function(){ toast('الصورة مش بتفتح — جرّبي تاني', true); });
  }
  function find(){
    var bc = S.draft.barcode; if(!bc){ S.product = null; render(); return; }
    api().findByBarcode(bc).then(function(rows){ S.product = rows && rows.length ? rows[0] : false;
      // المنتج: اسمه بيتملى لوحده من المخزون لو لسه ما كتبتش
      if(S.product && !S.draft.where.story && !S.draft.title) S.draft.title = String(S.product.name || '').slice(0, 40);
      render(); })
      .catch(function(){ S.product = false; render(); });
  }
  function send(){
    var d = S.draft;
    if(!S.img){ toast('صوّري الطرحة الأول', true); return; }
    if(!d.title){ toast('اكتبي سطر للعميلة', true); return; }
    var W = d.where; if(!W.story && !W.home && !W.offers && !W.online){ toast('اختاري تظهر فين', true); return; }
    if((W.online || W.offers) && !(S.product && S.product.name)){ toast('للعروض والأونلاين لازم باركود صح — دوّري عليه الأول', true); return; }
    if(S.busy) return; S.busy = true; render();
    var b = brand(), now = Date.now(), p = S.product || null;
    var story = {
      brand: b, status: 'pending', feed: core().feedKey(b, 'pending'),
      title: d.title, subtitle: d.subtitle, tryable: !!d.tryable,
      barcode: d.barcode || '', productName: p ? (p.name || '') : '', price: p ? (Number(p.price) || 0) : 0,
      employeeId: S.emp.id, employeeName: S.emp.name || '', branch: S.emp.branch || window.currentBranch || '',
      thumb: S.thumb, updatedAt: now, ownerNote: ''
    };
    story.where = { story: !!W.story, home: !!W.home, offers: !!W.offers, online: !!W.online };   // اقتراح — القرار في Office
    story.kind = W.story ? 'story' : 'product';
    story.showOnHome = !!W.home;
    story.qty = Math.max(1, Number(d.qty) || 1);
    story.pieceBranch = S.emp.branch || window.currentBranch || '';
    if(!S.editId){ story.createdAt = now; }
    api().submit(story, S.img, S.editId).then(function(){
      S.busy = false; toast('اتبعتت للمراجعة ✅'); reset(); S.tab = 'mine'; render();
    }).catch(function(err){ S.busy = false; render(); toast('ما اترفعتش: ' + ((err && err.code) || 'جرّبي تاني'), true); });
  }

  var LBL = { pending:'مستنية موافقة', published:'اتنشرت ✓', changes:'محتاجة تعديل', rejected:'اترفضت', archived:'خلصت' };
  function renderMine(){
    $('stBody').innerHTML = '<div class="stTips">بتحمّل…</div>';
    api().mine(S.emp.id).then(function(list){
      if(!list.length){ $('stBody').innerHTML = '<div class="stTips" style="text-align:center;padding:30px 0">لسه ما رفعتيش ستوري</div>'; return; }
      $('stBody').innerHTML = list.map(function(s){
        return '<div class="stItem">' + (s.thumb ? '<img src="' + s.thumb + '" alt="">' : '') + '<div class="n"><b>' + (s.kind === 'product' ? '🛍️ ' : '') + esc(s.title || '') + '</b>'
          + '<span style="color:var(--sub,#8b90a0)">' + esc(s.productName || s.barcode || '') + '</span><br><span class="stPill stP-' + esc(s.status) + '">' + (LBL[s.status] || esc(s.status)) + '</span>'
          + (s.status === 'changes' ? '<div class="stNote">📝 ' + esc(s.ownerNote || 'الإدارة طالبة تعديل') + '</div><button class="stBtn" style="margin-top:8px" data-redo="' + esc(s.id) + '">صوّري تاني وابعتي</button>' : '')
          + '</div></div>';
      }).join('');
      $('stBody').querySelectorAll('[data-redo]').forEach(function(btn){ btn.onclick = function(){
        var s = list.find(function(x){ return x.id === btn.dataset.redo; }); if(!s) return;
        reset(); S.editId = s.id; S.draft = { where: Object.assign({ story: s.kind !== 'product', home: !!s.showOnHome, offers:false, online:false }, s.where || {}), qty: s.qty || 1, title: s.title || '', subtitle: s.subtitle || '', barcode: s.barcode || '', tryable: s.tryable !== false };
        S.product = s.barcode ? { name: s.productName, price: s.price } : null; S.tab = 'new'; render();
      }; });
    }).catch(function(){ $('stBody').innerHTML = '<div class="stTips">مش قادرة أحمّل — جرّبي تاني</div>'; });
  }

  /* زرار «📸 ستوري» في صفحة الموظفة — بيتحط مرة، وبيتلوّن لو النهارده دورها */
  function hubButton(){
    var sh = $('dh_shortageBtn'); if(!sh) return;
    var b = $('dh_storyBtn');
    if(!b){
      // الزرارين جوه غلاف واحد عشان صف العنوان (space-between) يفضل شكله زي ما هو
      var wrap = document.createElement('span'); wrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
      sh.parentNode.insertBefore(wrap, sh);
      b = document.createElement('button'); b.id = 'dh_storyBtn'; b.type = 'button';
      wrap.appendChild(b); wrap.appendChild(sh);
    }
    var empId = api() && api().hubEmp(); var emp = (api() ? api().employees() : []).find(function(e){ return e.id === empId; });
    var mine = false;
    try{ var t = emp && core().turnFor(api().employees(), core().brandOfBranch(emp.branch), Date.now()); mine = !!(t && emp && t.id === emp.id); }catch(e){}
    b.className = mine ? 'turn' : ''; b.textContent = mine ? '📸 دورك في التصوير' : '📸 صوّري';
    b.onclick = function(){ var id = api().hubEmp(); if(id) open(id); };
  }
  function watchHub(){
    var ov = $('dayHubOverlay'); if(!ov || !window.MutationObserver){ return; }
    new MutationObserver(function(){ if(ov.classList.contains('show')) hubButton(); }).observe(ov, { attributes:true, attributeFilter:['class'] });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchHub); else watchHub();
  window.SalesStories = { open: open, close: close };
})();
