const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'Office', 'office.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'Office', 'index.html'), 'utf8');
function ok(x,m){ if(!x) throw new Error('FAIL: '+m); console.log('✅ '+m); }
function block(from,to){ const a=src.indexOf(from), b=src.indexOf(to,a); if(a<0||b<0) throw new Error('missing '+from); return src.slice(a,b); }

ok(html.includes('id="actAttention"'), 'فلتر واضح حسب مستوى الاهتمام موجود');
ok(html.includes('value="action"') && html.includes('محتاج إجراء'), 'فلتر محتاج إجراء موجود');
ok(src.includes('function ofActIntelligence(a)'), 'فيه محرك تفسير مركزي لكل حدث');
ok(src.includes('function ofActSmartSummary(list)'), 'فيه ملخص ذكي قابل للاختبار');
ok(src.includes('أنماط متكررة') && src.includes('مبلغ تحت المراجعة') && src.includes('أكتر فرع فيه إشارات'), 'الملخص يحول اللوج لإشارات قرار');
ok(src.includes('<b>التفسير:</b>') && src.includes('<b>الأثر:</b>') && src.includes('<b>الخطوة الصح:</b>'), 'تفاصيل الحدث تشرح التفسير والأثر والخطوة');

const kinds = block('const OF_ACT_KINDS', 'function ofActLabel');
['basket_suggest_added','wa_message','inventory_branch_catalog_replace','inventory_full_reconcile'].forEach(t=>{
  ok(kinds.includes(t), 'النوع '+t+' له اسم عربي بدل كود خام');
});

const intelCode = block('function ofActIntelligence(a)', 'window.ofActIntelligence');
const summaryCode = block('function ofActSmartSummary(list)', 'window.ofActSmartSummary');
const ctx = {
  console,
  esc: x => String(x == null ? '' : x),
  ofMoney: x => Number(x||0).toFixed(2)+' ج.م',
  OF_ACT_KINDS: {},
  ofActLabel: t => ({card_overcharge_saved:'سحب فيزا زيادة',manual_discount:'خصم يدوي',sale_saved:'فاتورة'}[t] || t)
};
vm.createContext(ctx);
vm.runInContext(intelCode+'\n'+summaryCode, ctx);

let x = ctx.ofActIntelligence({type:'card_overcharge_saved', diff:350, cause:'شيل طرحة', causeExact:true});
ok(x.level==='action' && x.money===350, 'سحب الفيزا الزيادة = إجراء ومبلغ مخاطرة 350');
ok(x.explain.includes('شيل طرحة') && x.action.includes('Paymob'), 'السبب المسجل وخطوة الرد ظاهرين');
x = ctx.ofActIntelligence({type:'manual_discount', pct:15});
ok(x.level==='watch' && x.explain.includes('15%'), 'الخصم اليدوي = متابعة مع تفسير النسبة');
x = ctx.ofActIntelligence({type:'sale_saved'});
ok(x.level==='normal', 'البيع العادي لا يتحول لإنذار كاذب');
x = ctx.ofActIntelligence({type:'future_new_event'});
ok(x.explain && x.impact && x.action, 'أي نوع جديد/غير معروف يظل له تفسير وأثر وإجراء افتراضي');

const sm = ctx.ofActSmartSummary([
  {type:'card_overcharge_saved',diff:350,branch:'الرحاب'},
  {type:'manual_discount',pct:10,branch:'الرحاب'},
  {type:'manual_discount',pct:10,branch:'الرحاب'},
  {type:'manual_discount',pct:10,branch:'مدينتي'},
  {type:'sale_saved',branch:'مدينتي'}
]);
ok(sm.action===1 && sm.watch===3 && sm.money===350, 'الـKPI يفصل إجراء/متابعة ويجمع المبلغ مرة صحيحة');
ok(sm.topBranch==='الرحاب' && sm.topBranchCount===3, 'يحدد الفرع الأكثر إشارات');
ok(sm.repeats.length===1 && sm.repeats[0].type==='manual_discount' && sm.repeats[0].count===3, 'يكتشف النمط المتكرر بدل عرض أحداث منفصلة فقط');

const render = block('function ofRenderActivity()', 'window.ofRenderActivity');
ok(render.includes('ofActIntelligence(a)') && render.includes('يعني إيه؟') && render.includes('الإجراء:'), 'كل كارت نشاط يشرح المعنى والإجراء مباشرة');
ok(src.includes("const at = document.getElementById('actAttention')") && src.includes("at.addEventListener('change'"), 'فلتر الاهتمام فوري من غير قراءات Firestore جديدة');

console.log('✅ Office activity intelligence v70: PASS');
