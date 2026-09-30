// مساعد لاختبار test-sales-receive-flow-v625.js — بيشتغل في process لوحده لأن المسار async
'use strict';
const _res = [];
const assert = (c, m) => _res.push([!!c, m]);
const assertEq = (a, b, m) => _res.push([JSON.stringify(a) === JSON.stringify(b), m + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' — expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a))]);
const path = require('path'), fs = require('fs');
const root = path.join(__dirname, '..', '..');
const BR = 'echarpe Madinaty';

function el(id){ return { id, innerHTML:'', textContent:'', value:'', style:{}, className:'', disabled:false,
  _cls:new Set(), classList:{ add(c){ this._o._cls.add(c); }, remove(c){ this._o._cls.delete(c); }, contains(c){ return this._o._cls.has(c); } },
  focus(){}, pause(){}, set onclick(f){}, appendChild(){}, }; }
function mkDoc(){
  const byId = {};
  const d = {
    head:{ appendChild(){} },
    body:{ appendChild(n){ if(n.id) byId[n.id] = n; } },
    createElement(){ const n = el(''); n.classList._o = n; return n; },
    getElementById(id){
      if(byId[id]) return byId[id];
      // عناصر جوه innerHTML: بنعملها عند الطلب
      const n = el(id); n.classList._o = n; byId[id] = n; return n;
    }
  };
  return { d, byId };
}
function boot(opts){
  const { d } = mkDoc();
  const store = { commits:[], lookups:0 };
  const inv = { '555':[{ id:'p1', barcode:'555', name:'دبل فيس بوكس', qtyByBranch:{ [BR]:1 }, status:'active' }],
                '777':[{ id:'p2', barcode:'777', name:'طرحة', qtyByBranch:{ [BR]:0 }, status:'outofstock' }] };
  const win = {
    currentBranch: BR,
    employees: [{ id:'e1', name:'Amira', pin:'1234' }, { id:'e2', name:'Nour' }],
    RecvCore: require(path.join(root, 'pos', 'receive-core.js')),
    salesRecvApi: {
      findByBarcode(c){ store.lookups++; return Promise.resolve(inv[c] || []); },
      getInventoryCfg(){ return Promise.resolve({ allowNegativeStock: !!(opts && opts.allowNeg) }); },
      commit(br, rows){ if(opts && opts.fail) return Promise.reject(Object.assign(new Error('x'), { code:'permission-denied' })); store.commits.push({ br, rows }); return Promise.resolve(true); },
      recentLog(){ return Promise.resolve([]); }
    },
    addEventListener(){},
    alert(m){ store.alert = m; }
  };
  const ls = {}; 
  const g = { window:win, document:d, navigator:{}, history:{ pushState(){}, state:null, back(){} },
    localStorage:{ getItem:k => (k in ls ? ls[k] : null), setItem:(k,v)=>{ ls[k] = String(v); }, removeItem:k => { delete ls[k]; } },
    alert:win.alert, setTimeout:(f)=>{ f(); return 0; }, clearTimeout(){}, Promise, console:{ warn(){} , log(){} } };
  const src = fs.readFileSync(path.join(root, 'sales', 'sales-receive.js'), 'utf8');
  new Function(...Object.keys(g), src)(...Object.values(g));
  return { win, d, store, ls };
}
const tick = () => new Promise(r => setImmediate(r));

(async () => {
  // ✅ المسار الكامل
  let T = boot();
  T.win.salesRecvOpen();
  assert(T.d.getElementById('rcvOverlay').classList.contains('show'), 'الشاشة بتفتح');
  assert(/Amira/.test(T.d.getElementById('rcvBody').innerHTML), 'قايمة الموظفات ظاهرة');
  T.win.salesRecvPickEmp('e2');
  assert(!/rcvDots/.test(T.d.getElementById('rcvBody').innerHTML), 'سلبي: موظفة من غير كود متوصلش لشاشة الكود');
  T.win.salesRecvPickEmp('e1');
  '9999'.split('').forEach(k => T.win.salesRecvPinKey(k));
  assert(!/rcvScanBtn/.test(T.d.getElementById('rcvBody').innerHTML), 'سلبي: كود غلط ميدخلش');
  '1234'.split('').forEach(k => T.win.salesRecvPinKey(k));
  await tick();
  assert(/rcvScanBtn/.test(T.d.getElementById('rcvBody').innerHTML), 'الكود الصح بيفتح شاشة الاستلام');

  T.d.getElementById('rcvCode').value = '555'; T.win.salesRecvAddCode(); await tick();
  T.d.getElementById('rcvCode').value = '777'; T.win.salesRecvAddCode(); await tick();
  T.d.getElementById('rcvCode').value = '000'; T.win.salesRecvAddCode(); await tick();
  assert(/دبل فيس بوكس/.test(T.d.getElementById('rcvBody').innerHTML) && /طرحة/.test(T.d.getElementById('rcvBody').innerHTML), 'الكودين الصح اتضافوا');
  assert(/مفيش صنف بالكود ده: 000/.test(T.d.getElementById('rcvToast').textContent), 'سلبي: كود مش موجود = رسالة ومفيش سطر');
  T.d.getElementById('rcvCode').value = '555'; T.win.salesRecvAddCode(); await tick();
  assertEq(T.store.lookups, 3, 'نفس الكود تاني من الكاش (مفيش قراءة زيادة)');
  assert(T.ls['sales_recv_draft_v1_' + encodeURIComponent(BR)], 'المسودة اتحفظت');

  await T.win.salesRecvConfirm(); await tick();
  assertEq(T.store.commits.length, 1, 'التأكيد بعت مرة واحدة');
  const rows = T.store.commits[0].rows;
  assertEq(T.store.commits[0].br, BR, 'على فرع الجهاز');
  assertEq(rows.map(r => [r.id, r.qty]), [['p1', 1], ['p2', 1], ['p1', 1]], 'كل مسحة حركة مستقلة (زي POS)');
  assertEq(rows[1].status, 'active', 'الصنف النافد رجع active');
  assert(rows.every(r => r.log.employeeName === 'Amira' && r.log.source === 'sales' && r.log.type === 'receipt'), 'السجل باسم الموظفة ومصدره sales');
  assert(!T.ls['sales_recv_draft_v1_' + encodeURIComponent(BR)], 'المسودة اتمسحت بعد النجاح');
  await T.win.salesRecvConfirm();
  assertEq(T.store.commits.length, 1, 'سلبي: تأكيد تاني بقايمة فاضية مش بيبعت حاجة');

  // 📤 الإخراج والرصيد السالب
  T = boot();
  T.win.salesRecvOpen(); T.win.salesRecvPickEmp('e1'); '1234'.split('').forEach(k => T.win.salesRecvPinKey(k)); await tick();
  T.win.salesRecvMode(true);
  T.d.getElementById('rcvCode').value = '555'; T.win.salesRecvAddCode(); await tick();
  T.d.getElementById('rcvCode').value = '555'; T.win.salesRecvAddCode(); await tick();
  await T.win.salesRecvConfirm();
  assertEq(T.store.commits.length, 0, 'سلبي: إخراج ٢ من رصيد ١ مرفوض والإعداد مقفول');
  assert(/مينفعش تخرج/.test(T.d.getElementById('rcvToast').textContent), 'ورسالة واضحة');
  T.win.salesRecvRemove(0);
  await T.win.salesRecvConfirm(); await tick();
  assertEq(T.store.commits.length, 1, 'إخراج ١ من رصيد ١ يعدّي');
  const r0 = T.store.commits[0].rows[0];
  assert(r0.qty === -1 && r0.status === 'outofstock' && r0.log.type === 'adjustment', 'الإخراج = adjustment والصنف بقى نافد');

  T = boot({ allowNeg:true });
  T.win.salesRecvOpen(); T.win.salesRecvPickEmp('e1'); '1234'.split('').forEach(k => T.win.salesRecvPinKey(k)); await tick();
  T.win.salesRecvMode(true);
  T.d.getElementById('rcvCode').value = '777'; T.win.salesRecvAddCode(); await tick();
  await T.win.salesRecvConfirm(); await tick();
  assertEq(T.store.commits.length, 1, 'بالإعداد مفتوح: إخراج تحت الصفر بيعدّي');
  assert(/سالب/.test(T.store.commits[0].rows[0].log.reason), 'ومتعلّم في السجل إنه نزل سالب');

  // ❌ فشل الكتابة: القايمة متتمسحش
  T = boot({ fail:true });
  T.win.salesRecvOpen(); T.win.salesRecvPickEmp('e1'); '1234'.split('').forEach(k => T.win.salesRecvPinKey(k)); await tick();
  T.d.getElementById('rcvCode').value = '555'; T.win.salesRecvAddCode(); await tick();
  await T.win.salesRecvConfirm(); await tick();
  assert(/الجهاز مش مسجّل دخول/.test(T.d.getElementById('rcvToast').textContent), 'سلبي: رفض الصلاحية بيقول السبب');
  assert(T.ls['sales_recv_draft_v1_' + encodeURIComponent(BR)], 'سلبي: القايمة لسه محفوظة بعد الفشل');

  // 🚪 القفل والفتح تاني = المسودة راجعة
  T = boot();
  T.win.salesRecvOpen(); T.win.salesRecvPickEmp('e1'); '1234'.split('').forEach(k => T.win.salesRecvPinKey(k)); await tick();
  T.d.getElementById('rcvCode').value = '555'; T.win.salesRecvAddCode(); await tick();
  T.win.salesRecvClose();
  assert(!T.d.getElementById('rcvOverlay').classList.contains('show'), 'القفل بيقفل');
  T.win.salesRecvOpen();
  assert(/فيه 1 حركة محفوظة/.test(T.d.getElementById('rcvBody').innerHTML), 'المسودة راجعة بعد إعادة الفتح');
  assert(!/rcvScanBtn/.test(T.d.getElementById('rcvBody').innerHTML), 'سلبي: إعادة الفتح بتطلب الموظفة والكود تاني');
})().catch(e => assert(false, 'flow crashed: ' + e.message)).then(() => { process.stdout.write(JSON.stringify(_res)); });
