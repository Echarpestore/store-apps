#!/usr/bin/env node
// ============================================================
// test-reward-send-guard.js (v714) — إرسال المكافآت وتعديل النقط: صلاحية + سقف + أثر
// الثغرة: `sendRewardConfirm` من غير فحص/سقف/تسجيل، وزرارها في بروفايل بتوصله الكاشير من البحث.
// سلوك فعلي على قاعدة بيانات وهمية. يتشغّل لوحده: node tests/test-reward-send-guard.js
// ============================================================
'use strict';
require('./helpers/swv');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const adm = fs.readFileSync(path.join(ROOT, 'pos', 'pos-admin.js'), 'utf8');
const prof = fs.readFileSync(path.join(ROOT, 'pos', 'profiles.js'), 'utf8');
const core = fs.readFileSync(path.join(ROOT, 'pos', 'pos-core.js'), 'utf8');
const rep = fs.readFileSync(path.join(ROOT, 'pos', 'pos-reports.js'), 'utf8');
const office = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; } else { fail++; console.error('  ❌ ' + m); } };
function extractFn(src, header){
  const at = src.indexOf(header);
  if(at < 0) throw new Error('extractFn: مش لاقي «' + header + '»');
  let i = src.indexOf('{', at + header.length - 1), depth = 0, q = null;
  for(; i < src.length; i++){
    const c = src[i];
    if(q){
      if(c === '\\'){ i++; continue; }
      if(q === '`' && c === '$' && src[i+1] === '{'){ let d = 1; i += 2; while(i < src.length && d){ if(src[i] === '{') d++; else if(src[i] === '}') d--; i++; } i--; continue; }
      if(c === q) q = null; continue;
    }
    if(c === '/' && src[i+1] === '/'){ while(i < src.length && src[i] !== '\n') i++; continue; }
    if(c === '/' && src[i+1] === '*'){ i = src.indexOf('*/', i) + 1; continue; }
    if(c === '"' || c === "'" || c === '`'){ q = c; continue; }
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('extractFn: أقواس مش متوازنة «' + header + '»');
}
const code = 'let rewardTarget = null; const _busyOps = new Set(); let selectedCustomers = new Set(); let custListFiltered = []; let custListData = [];\n'
  + ['function rewardSendBlockReason(', 'function openRewardModal(', 'function closeRewardModal(', 'async function sendRewardConfirm('].map(h => extractFn(adm, h)).join('\n')
  + ';this.setTarget = t => { rewardTarget = t; }; this.busy = () => _busyOps.size;';

function mk(perms, form){
  const st = { writes:[], logs:[], toasts:[], modal:false };
  const vals = Object.assign({ rwType:'amount', rwValue:'', rwMin:'', rwDays:'7' }, form || {});
  const ctx = { st, window:{}, console:{ warn(){} }, Math, Number, String, Object, Array, Promise, Date, parseFloat, parseInt, Set,
    currentBranch:'Rehab', TEST_CUSTOMERS:'c', TEST_SETTINGS:'s',
    hasPerm: k => !!perms[k], myPerms: () => perms, pointsFieldFor: () => 'points',
    showToast: (m, t) => st.toasts.push([m, t]), _logActivity: (t, d) => st.logs.push([t, JSON.parse(JSON.stringify(d))]), renderCustList(){},
    firebase: { firestore: { FieldValue: { arrayUnion: r => ({ __union:r }), increment: n => ({ __inc:n }) } } },
    db: { batch: () => ({ set: (ref, data) => st.writes.push([ref.id, data]), commit: async () => {} }),
          collection: () => ({ doc: id => ({ id, set: async () => {} }) }) },
    document: { getElementById: id => ({ get value(){ return vals[id]; }, set value(v){ vals[id] = v; }, textContent:'', classList:{ add(){ st.modal = true; }, remove(){ st.modal = false; } } }) } };
  vm.createContext(ctx); vm.runInContext(code, ctx); return ctx;
}
const CASHIER = { canSendRewards:false, maxDiscountPct:0 };
const SUPER = { canSendRewards:true, maxDiscountPct:20 };
const MANAGER = { canSendRewards:true, maxDiscountPct:100 };

(async function(){
  console.log('\n🔐 1) الكاشير — السيناريو الأصلي للثغرة');
  let c = mk(CASHIER, { rwValue:'5000', rwMin:'0' });
  c.openRewardModal('01011111111');
  ok(c.st.modal === false && c.st.toasts.length === 1, 'زرار المكافأة في البروفايل: الشاشة متتفتحش');
  c.setTarget('01011111111'); await c.sendRewardConfirm();
  ok(c.st.writes.length === 0, '⛔⭐ نداء `sendRewardConfirm` **مباشرة** (تخطّي الشاشة) = ولا كتابة — الفحص على الكتابة نفسها');
  ok(c.busy() === 0, 'والقفل بيتفك (الرفض ميعلّقش الزرار)');
  c = mk({ canSendRewards:false, maxDiscountPct:100, canViewCustomers:true, canRedeemManual:true }, { rwValue:'50', rwMin:'1000' });
  c.setTarget('0101'); await c.sendRewardConfirm();
  ok(c.st.writes.length === 0, 'صلاحيات تانية (حتى سقف خصم 100%) متفتحش الإرسال من غير `canSendRewards`');

  console.log('📏 2) المشرف — في حدود سقف خصمه (20%)');
  const R = (p, t, v, m) => mk(p).rewardSendBlockReason(t, v, m, 1);
  ok(R(SUPER, 'percent', 20, 0) === null && /20%/.test(R(SUPER, 'percent', 21, 0) || ''), 'نسبة: 20% ✓ · 21% ✗');
  ok(R(SUPER, 'amount', 100, 500) === null, 'مبلغ 100 بحد أدنى 500 (= 20%) ✓');
  ok(/سقف دورك 20%/.test(R(SUPER, 'amount', 101, 500) || ''), 'مبلغ 101 بحد أدنى 500 ✗');
  ok(/حد أدنى للفاتورة/.test(R(SUPER, 'amount', 50, 0) || ''), '⭐ مبلغ **من غير حد أدنى** ✗ (ده اللي كان بيطلّع فاتورة ببلاش)');
  const hint = R(SUPER, 'amount', 300, 500) || '';
  ok(/100 ج\.م/.test(hint) && /1500 ج\.م/.test(hint), 'والرسالة بتقول الحل: قلّل لـ100 أو زوّد الحد الأدنى لـ1500');
  c = mk(SUPER, { rwValue:'5000', rwMin:'0' }); c.setTarget('0101'); await c.sendRewardConfirm();
  ok(c.st.writes.length === 0 && c.st.logs.length === 0, 'مشرف بيحاول 5000 من غير حد أدنى = مرفوض ومفيش كتابة');
  c = mk(SUPER, { rwValue:'100', rwMin:'500' }); c.setTarget('01022222222'); await c.sendRewardConfirm();
  ok(c.st.writes.length === 1 && c.st.writes[0][0] === '01022222222', 'مشرف في الحدود = بتتبعت عادي');

  console.log('👑 3) المدير/الأدمن (سقف 100%) — زي الأول');
  ok(R(MANAGER, 'amount', 5000, 0) === null && R(MANAGER, 'percent', 100, 0) === null, 'مفيش سقف — زي الخصم على الكاشير بالظبط');
  ok(/سقف|أقصى/.test(R({ canSendRewards:true }, 'percent', 5, 0) || ''), 'دور من غير `maxDiscountPct` محفوظ = سقف صفر (مش مفتوح)');

  console.log('🕵️ 4) الأثر — كل إرسال بيتسجّل');
  c = mk(MANAGER, { rwValue:'200', rwMin:'0', rwDays:'3' }); c.setTarget({ bulk:true, phones:['1', '2', '3', '4', '5', '6', '7'] });
  await c.sendRewardConfirm();
  const lg = c.st.logs.find(l => l[0] === 'reward_sent');
  ok(c.st.writes.length === 7 && !!lg, 'إرسال جماعي لـ7 = 7 كتابات + تسجيل واحد');
  ok(lg && lg[1].count === 7 && lg[1].bulk === true && lg[1].value === 200 && lg[1].minInvoice === 0 && lg[1].days === 3, 'بالقيمة والحد الأدنى والمدة والعدد');
  ok(lg && lg[1].maxPossibleEGP === 1400 && /\+2/.test(lg[1].phones), 'وأقصى تكلفة (200×7=1400) وأول 5 أرقام + الباقي');
  ok(/reward_sent:\s*\{ t:'[^']+', g:'money', hot:true \}/.test(office) && office.includes("if(type === 'reward_sent') return watch("), 'Office: اسم عربي + hot + شرح للمالك');

  console.log('🎁 5) تعديل رصيد النقط — صلاحية مستقلة');
  const ep = extractFn(prof, 'async function editCustomerPoints(');
  ok(/if\(!hasPerm\('canEditPoints'\)\)\{[^}]*return; \}/.test(ep) && !/hasPerm\('canRedeemManual'\)/.test(ep), 'بقت `canEditPoints` — مش راكبة على الاستبدال اليدوي');
  ok(/_logActivity\('customer_points_edit'/.test(ep) && /لازم تكتب السبب/.test(ep), 'والسبب إجباري والتسجيل زي ما هو');
  ok(/\$\{hasPerm\('canEditPoints'\) \? `<button onclick="editCustomerPoints/.test(prof), 'والزرار بيظهر للي معاه الصلاحية بس');
  ok(/openRewardModal\('\$\{d\.phone\}'\)" style="\$\{hasPerm\('canSendRewards'\)\?'':'display:none;'\}/.test(prof), 'وزرار المكافأة في البروفايل مخفي عن اللي مالوش');

  console.log('🧱 6) الافتراضي لكل دور');
  const defs = core.slice(core.indexOf('const DEFAULT_ROLE_PERMISSIONS'), core.indexOf('const DEFAULT_ROLE_PERMISSIONS') + 4200);
  const block = r => { const i = defs.indexOf('\n  ' + r + ': {'); return i < 0 ? '' : defs.slice(i, defs.indexOf('\n  }', i)); };
  ok(/canSendRewards: false, canEditPoints: false/.test(block('cashier')), 'كاشير: الاتنين ✗');
  ok(/canSendRewards: true, canEditPoints: false/.test(block('supervisor')), 'مشرف: مكافآت ✓ (بسقف) · تعديل نقط ✗');
  ['admin', 'manager'].forEach(r => ok(/canSendRewards: true, canEditPoints: true/.test(block(r)), r + ': الاتنين ✓'));
  ok(/canSendRewards:'[^']+'/.test(rep) && /canEditPoints:'[^']+'/.test(rep), 'والاتنين ظاهرين في شاشة الأدوار');
  ok(swAtLeast(fs.readFileSync(path.join(ROOT, 'pos', 'sw.js'), 'utf8'), 714) && swAtLeast(fs.readFileSync(path.join(ROOT, 'Office', 'sw.js'), 'utf8'), 682), 'POS ≥ v714 · Office ≥ v682');

  console.log('\n' + (fail ? '❌' : '✅') + ' test-reward-send-guard: ' + pass + ' ناجح · ' + fail + ' فاشل');
  if(fail) process.exitCode = 1;
})().catch(e => { console.error('💥', e); process.exitCode = 1; });
