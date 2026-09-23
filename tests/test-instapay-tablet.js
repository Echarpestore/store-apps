require('./helpers/swv');
// 🧪 فحص جاف لشاشة التابلت: الثبات، تنسيق المبلغ، وعدم كسر الكشك
const fs=require('fs'); const src=fs.readFileSync('feedback/instapay-tablet.js','utf8');
let p=0,f=0; const t=(n,fn)=>{try{fn();p++;console.log('  ✅ '+n)}catch(e){f++;console.log('  ❌ '+n+' → '+e.message)}};
const has=s=>{if(!src.includes(s))throw Error('ناقص: '+s)};
const no=s=>{if(src.includes(s))throw Error('موجود وماينفعش: '+s)};

console.log('\n🔐 أمان');
t('مبيكتبش في Firestore خالص',()=>{no('setDoc(');no('updateDoc(');no('addDoc(');no('deleteDoc(')});
t('بينده الدالتين بس',()=>{has("'instaPay'");has("'instaScan'")});
t('الكاميرا بتطفي عند إخفاء الصفحة',()=>{has("pagehide");has("visibilitychange")});

console.log('\n💸 توفير التكلفة');
t('الفريم الأول بيتبعت فورًا',()=>has('if (previous && d > 24)'));
t('بيقص على الإطار بس',()=>{has('const INSET = 0.06');has('x.drawImage(video, sx, sy, sw, sh')});
t('المربعات بتوري الأرقام',()=>{has('function chip(');has('d.seenCents')});
t('فيه زرار رجوع للـQR',()=>{has("id=\"ipBack\"");has("$('ipBack').onclick")});
t('شاشة الكاشير مش مسدودة',()=>{has("id=\"ipManBack\"");has("$('ipManBack').onclick")});
t('فيه مؤقّت مش نداء متواصل',()=>has('setInterval(tick, SCAN_POLL_MS)'));
t('قفل تزامن يمنع نداءين مع بعض',()=>has('if (busy || Date.now() < nextScanAt) return'));
t('الـQR بيتحمّل مرة واحدة',()=>has('if (_qr)'));

console.log('\n🖼️ الصورة');
t('العرض مش مقلوب (العميلة تشوف اللي بيتبعت)',()=>{
  if(src.includes('object-fit:cover;transform:scaleX(-1)'))throw Error('العرض لسه مقلوب')});
t('فيه شبكة أمان للانعكاس',()=>{has('let flipCapture =');has('x.scale(-1, 1)')});
t('القلب تجربة بعد محاولتين عمياء',()=>has('blindTries >= 2 && !flipTrial && !flipTested'));
t('القلب بيتحفظ للجهاز',()=>{has('FLIP_KEY');has('localStorage.setItem(FLIP_KEY')});
t('زرار القلب اتشال من الواجهة',()=>{
  if(/id="ipFlip"/.test(src))throw Error('لسه ظاهر للعميلة')});
t('الكشف التلقائي لسه شغال',()=>{has('blindTries >= 2');has('setFlip(flipCapture)')});
t('العنوان والأرقام بتظهر للعميلة',()=>has("extra.join(' · ')"));
t('الشاشة متفضلش واقفة على بنقرا',()=>has('مش شايف الإيصال'));
t('الجودة مضغوطة',()=>has("'image/jpeg', 0.88"));
t('الكاميرا الأمامية',()=>has("facingMode: 'user'"));

console.log('\n🧯 الأعطال');
t('الكاميرا مرفوضة → الكاشير',()=>has("show('man')"));
t('خلصت المحاولات → الكاشير',()=>has('resource-exhausted'));
t('زرار يدوي للعميلة',()=>has('ipHelp'));

console.log('\n🏗️ مبيكسرش الكشك');
const html=fs.readFileSync('feedback/index.html','utf8');
// سطرين لإنستاباي + سطرين لدعوة التطبيق = 4
t('الكشك اتضافله 4 سطور بس',()=>{const o=baselineOrSkip('/home/claude/repo/store-apps-main/feedback/index.html'); if(o===null) return;
  const d=html.split('\n').length-o.split('\n').length; if(d!==4)throw Error('فرق '+d+' سطر')});
t('الطبقة فوق كل حاجة',()=>has('z-index:9000'));
t('مخفية لحد ما يجي طلب',()=>has('#ipWrap{position:fixed;inset:0;z-index:9000;display:none'));
console.log('\n⏲️ الشاشة بتقفل نفسها (التابلت المعلّق)');
const codeNC=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"`\\])\/\/[^\n]*/g,'$1');
function grab(head){const i=codeNC.indexOf(head);if(i<0)throw Error('البلوك مش موجود: '+head);
  const o=codeNC.indexOf('{',i);let d=0;for(let k=o;k<codeNC.length;k++){if(codeNC[k]==='{')d++;else if(codeNC[k]==='}'){d--;if(!d)return codeNC.slice(i,k+1)}}throw Error('أقواس')}
const idleLine=codeNC.match(/const IP_PANE_IDLE_MS\s*=\s*\{[^}]*\};/); const maxLine=codeNC.match(/const IP_SESSION_MAX_MS\s*=[^;]*;/);
if(!idleLine||!maxLine)throw Error('ثوابت المؤقّت مش موجودة');
const should=eval('(function(){'+idleLine[0]+maxLine[0]+grab('function ipShouldAutoHide')+';return ipShouldAutoHide})()');
const MIN=60*1000;
t('⭐⭐ «سلّمي للكاشير» بتقفل بعد دقيقة ونص',()=>{if(should('man',89*1000,0)!==false)throw Error('بدري');if(should('man',90*1000,0)!==true)throw Error('مقفلتش')});
t('«تم» بتقفل بعد دقيقة',()=>{if(should('ok',59*1000,0)||!should('ok',60*1000,0))throw Error()});
t('«مرفوض» بتدّي وقت أطول (٣ دقايق)',()=>{if(should('bad',2*MIN,0)||!should('bad',3*MIN,0))throw Error()});
t('⭐ شاشة الـQR والمسح **مبتقفلش** بدري — العميلة لسه بتحوّل',()=>{
  if(should('wait',10*MIN,10*MIN)||should('scan',10*MIN,10*MIN))throw Error('قفلت على عميلة بتحوّل')});
t('⭐⭐ أي شاشة بتقفل بعد عمر الطلب (٢٠ دقيقة)',()=>{
  if(!should('wait',0,20*MIN)||!should('scan',0,20*MIN))throw Error('معلّقة للأبد')});
t('مفيش شاشة = مفيش قفل',()=>{if(should(null,1e9,1e9)!==false)throw Error()});
t('عمر الطلب = نفس مدة السيرفر',()=>{
  const fn=fs.readFileSync('functions/instapay.js','utf8'); if(!/expiresAt:\s*now\s*\+\s*20\s*\*\s*60\s*\*\s*1000/.test(fn))throw Error('مدة السيرفر اتغيّرت');
  if(!/IP_SESSION_MAX_MS\s*=\s*20\s*\*\s*60\s*\*\s*1000/.test(codeNC))throw Error('مش متطابقين')});
t('show() بتصفّر العدّاد وhide() بتوقفه',()=>{
  if(!/curPane\s*=\s*name;\s*paneAt\s*=\s*Date\.now\(\)/.test(grab('function show')))throw Error('show');
  if(!/curPane\s*=\s*null/.test(grab('function hide')))throw Error('hide')});
t('المؤقّت شغال ووقته محلي (seenAt من التابلت مش السيرفر)',()=>{
  if(!/setInterval\(\(\)\s*=>\s*\{[\s\S]{0,300}ipShouldAutoHide\(curPane[\s\S]{0,120}hide\(\)/.test(codeNC))throw Error('مفيش مؤقّت');
  if(!/cur\s*=\s*\{\s*sid:\s*s\.sid,\s*seenAt:\s*Date\.now\(\)\s*\}/.test(codeNC))throw Error('seenAt')});
t('لسه مبيكتبش في Firestore',()=>{no('setDoc(');no('deleteDoc(')});

console.log('\n⏳ v701 — طلب قديم معلّق مبيتعرضش');
t('طلب waiting/scanning أقدم من 20 دقيقة = الشاشة تتقفل',()=>{ const src=fs.readFileSync('feedback/instapay-tablet.js','utf8');
  if(!/_age > 20 \* 60 \* 1000 && \(s\.status === 'waiting' \|\| s\.status === 'scanning'\)\) \{ stopCam\(\); hide\(\); return; \}/.test(src))throw Error('مفيش فحص عمر الطلب'); });
t('وPOS بيلغي الطلب اليتيم عند الفتح',()=>{ const p=fs.readFileSync('pos/instapay-pos.js','utf8'); if(!/function cleanupOrphan\(\)/.test(p)||!/setTimeout\(cleanupOrphan, 15000\)/.test(p)||!/action: 'cancel', sid: d\.sid/.test(p))throw Error('ناقص'); });

t('v702: «تم التأكيد» مبيعلّقش — نتيجة أقدم من 3 دقايق بتتقفل + مؤقت 90ث',()=>{ const src=fs.readFileSync('feedback/instapay-tablet.js','utf8');
  if(!/_age > 3 \* 60 \* 1000 && \(s\.status === 'approved' \|\| s\.status === 'rejected'\)\) \{ stopCam\(\); hide\(\); return; \}/.test(src)) throw Error('مفيش فحص عمر النتيجة');
  if(!/window\._ipOkT = setTimeout\(\(\) => \{ if \(cur && cur\.sid === _sid\) hide\(\); \}, 90 \* 1000\)/.test(src)) throw Error('مفيش مؤقت'); });

console.log('\n=============================== \nالنتيجة: '+p+' ناجح · '+f+' فاشل\n===============================\n');
process.exit(f?1:0);
