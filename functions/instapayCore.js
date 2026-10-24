/* ============================================================
   🧾 instapayCore.js — قراءة إيصال إنستاباي ومطابقته (منطق خام)
   ------------------------------------------------------------
   بيتحط في: C:\Users\Mahmo\echarpe-push\functions\
   الملف ده **مفيهوش أي نداء على Firebase ولا الشبكة** عن قصد:
   كله دوال خام تاخد نص وترجّع نتيجة، عشان الاختبارات تشغّله
   من غير سيرفر ومن غير إنترنت.

   ⚠️ الدرس اللي اتعلمناه: أي منطق فلوس متشابك مع I/O = مستحيل
      يتختبر، وبالتالي مستحيل نثق فيه. الفصل ده مقصود.
   ============================================================ */

// 🔢 الأرقام العربية/الفارسية → إنجليزي، وتنضيف الفواصل الخفية.
//    ⚠️ إيصال إنستاباي بيطلع أحيانًا بأرقام هندية حسب لغة التليفون،
//    و Vision بيرجّعها زي ما هي. من غير التطبيع ده المبلغ مبيتقراش.
function normalizeDigits(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ''); // علامات اتجاه النص
}

// 🧹 تطبيع عام للنص: مسافات موحّدة + أشكال الألف والهاء/التاء المربوطة.
//    ⚠️ "المحفظه" في الإيصال بهاء، وممكن تتقرا "المحفظة" — الاتنين لازم
//    يتطابقوا وإلا الفحص يقع على فرق حرف واحد.
function normalizeText(s) {
  return normalizeDigits(s)
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u064A/g, '\u064A')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[ \t\u00A0]+/g, ' ');
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'مايو': 5, 'يونيو': 6,
  'يوليو': 7, 'اغسطس': 8, 'سبتمبر': 9, 'اكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12
};

/* 🟢 ١. الإيصال ناجح؟
   ⚠️ ده أول فحص وأهم من المبلغ: سكرين "جاري التحويل" أو "فشل"
      فيه نفس المبلغ ونفس المستفيد — والفرق بينه وبين الناجح كلمة واحدة. */
function checkSuccess(text) {
  const t = normalizeText(text);
  if (/تم\s*التحويل\s*بنجاح/.test(t)) return true;
  if (/transfer(ed)?\s*(is\s*)?success/i.test(t)) return true;
  if (/successful/i.test(t) && /EGP/i.test(t)) return true;
  // 🔴 رفض صريح للحالات اللي بتتلبس على الناجح
  return false;
}
function looksFailed(text) {
  const t = normalizeText(text);
  return /فشل|لم\s*يتم|مرفوض|قيد\s*التنفيذ|جار[ىي]|pending|failed|declined|processing/i.test(t);
}

/* 💵 ٢. المبلغ — بالقروش عشان مفيش كسور عائمة في الفلوس.
   الشكل في الإيصال: "1,600 EGP" فوق كلمة "مبلغ التحويل".
   ⚠️ بندوّر على الرقم اللي **جنب EGP** تحديدًا، مش أي رقم في الصفحة:
      الصفحة فيها رقم موبايل ورقم حساب ورقم مرجعي، وأي واحد فيهم
      ممكن يتقرا كمبلغ لو دوّرنا على "أي رقم". */
function extractAmountCents(text) {
  const t = normalizeText(text);
  const out = [];
  const re = /([0-9][0-9,\u066C ]{0,15}(?:[.\u066B][0-9]{1,2})?)\s*(?:EGP|E\.?G\.?P|ج\s*\.?\s*م|جنيه)/gi;
  let m;
  while ((m = re.exec(t))) {
    const raw = m[1].replace(/[,\u066C ]/g, '').replace(/\u066B/, '.');
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) out.push(Math.round(n * 100));
  }
  // الشكل المعكوس: "EGP 1,600" (لو التطبيق بالإنجليزي)
  const re2 = /(?:EGP|ج\s*\.?\s*م)\s*([0-9][0-9,\u066C ]{0,15}(?:[.\u066B][0-9]{1,2})?)/gi;
  while ((m = re2.exec(t))) {
    const raw = m[1].replace(/[,\u066C ]/g, '').replace(/\u066B/, '.');
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) out.push(Math.round(n * 100));
  }
  return out;
}

/* 🔢 ٣. الرقم المرجعي — 462046147040 (١٢ رقم في العيّنة).
   بندوّر عليه بعد كلمة "الرقم المرجعي" الأول، ولو ماظهرتش (قص أو
   ضبابية) بنقبل أي رقم ١٠–٢٠ خانة **مش** رقم موبايل مصري ولا تاريخ.
   ⚠️ الرقم ده هو المفتاح اللي بيمنع تكرار نفس الإيصال مرتين، فلو
      اتقرا غلط الحماية كلها بتقع — عشان كده الشرط ضيق. */
function extractReference(text) {
  const t = normalizeText(text);
  const labeled = t.match(/(?:الرقم\s*المرجع[يى]|reference(?:\s*(?:no|number|id))?)\s*[:\-#]?\s*([0-9]{8,24})/i);
  if (labeled) return labeled[1];
  const cands = (t.match(/\b[0-9]{10,24}\b/g) || [])
    .filter(n => !/^01[0125][0-9]{8}$/.test(n))   // موبايل مصري
    .filter(n => !/^(19|20)[0-9]{2}$/.test(n));
  // 🔒 لو فيه أكتر من مرشّح مبنخمّنش — نرجّع null ويتحوّل لتأكيد يدوي.
  const uniq = Array.from(new Set(cands));
  return uniq.length === 1 ? uniq[0] : null;
}

/* 🗓️ ٤. التاريخ والوقت — "14 Sep 2026 11:42 PM"
   بنرجّع {y,m,d,hh,mm} بتوقيت الجهاز اللي طبع الإيصال (القاهرة).
   ⚠️ الإيصال بيوقف عند الدقيقة — مفيش ثواني — فالمقارنة لازم
      تسمح بدقيقة زيادة أو ناقص، وإلا تحويل تمام الساعة يترفض. */
function extractReceiptTime(text) {
  const t = normalizeText(text);
  const re = new RegExp(
    '([0-9]{1,2})\\s*([A-Za-z\\u0600-\\u06FF]{3,10})\\s*([0-9]{4})' +
    '[\\s,]*([0-9]{1,2})\\s*[:\\u066C]\\s*([0-9]{2})(?:\\s*[:\\u066C]\\s*[0-9]{2})?' +
    '\\s*(AM|PM|ص|م)?', 'i');
  const m = t.match(re);
  if (!m) return null;
  const mon = MONTHS[String(m[2]).toLowerCase().slice(0, 4)] ||
              MONTHS[String(m[2]).toLowerCase().slice(0, 3)] ||
              MONTHS[String(m[2])];
  if (!mon) return null;
  let hh = Number(m[4]);
  const ap = (m[6] || '').toUpperCase();
  if (ap === 'PM' || ap === 'م') { if (hh < 12) hh += 12; }
  if (ap === 'AM' || ap === 'ص') { if (hh === 12) hh = 0; }
  const d = Number(m[1]), y = Number(m[3]), mm = Number(m[5]);
  if (d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  return { y, m: mon, d, hh, mm };
}

// دقايق من بداية الحقبة، بتوقيت مدني ثابت (بنقارن مدني بمدني).
function civilMinutes(p) {
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) / 60000;
}

/* 👤 ٥. المستفيد — أهم فحص ضد النصب.
   الإيصال بيقول "من <المرسل>" و "إلى <المستلم>". لازم عنوان الفرع
   يبقى في ناحية "إلى".
   ⚠️ لو اكتفينا بوجود العنوان في أي مكان، العميلة تقدر تورّي إيصال
      **هي المستلمة فيه** والعنوان بتاعنا هو المرسل — ويعدّي. */
/* 📞 عنوان الفرع ممكن يتكتب بأكتر من شكل في الإيصال:
     01144155987 · +201144155987 · 00201144155987 · 0114 415 5987
   المطابقة النصية المباشرة كانت بتقع على الأشكال الدولية (الصفر بيتشال).
   فالأرقام بنقارنها **كأرقام**: آخر 9 خانات كفاية للتطابق (كود الدولة والصفر بره).
   والعناوين (zigzag2000@instapay) بنقارن الجزء اللي قبل @ كمان، لأن الإيصال
   ساعات بيقص اللاحقة أو الـOCR بيلزقها بالسطر اللي بعده. */
function aliasForms(a){
  const c = normalizeText(a).toLowerCase().replace(/[\s\-()]/g, '');
  const digits = c.replace(/\D/g, '');
  if (digits.length >= 9 && /^[+0-9]+$/.test(c)) return { kind: 'phone', key: digits.slice(-9) };
  return { kind: 'text', key: c, local: c.split('@')[0] };
}
/* كل الأرقام اللي شكلها موبايل في النص — بنرجّع آخر 9 خانات للمقارنة والعرض */
function phonesIn(t){
  const out = [];
  String(t).replace(/[\s\-()]/g, ' ').replace(/[0-9]{9,15}/g, m => { out.push(m.slice(-9)); return m; });
  return [...new Set(out)];
}
// فرق خانة واحدة (استبدال بس — الطول واحد)
function off1(a, b){
  if (a === b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++){ if (a[i] !== b[i] && ++d > 1) return false; }
  return d === 1;
}
function checkBeneficiary(text, aliases) {
  const t = normalizeText(text).toLowerCase();
  // ⚠️ رقم المحفظة بيتكتب في الإيصال بمسافات أو شرط أحيانًا
  //    (0110 582 2087)، وفي الإعدادات من غيرها. بنشيل كل فاصل من
  //    الطرفين قبل المقارنة وإلا المطابقة بتفشل على مسافة.
  const clean = x => normalizeText(x).toLowerCase().replace(/[\s\-()]/g, '');
  const list = (aliases || []).map(clean).filter(Boolean);
  if (!list.length) return { ok: false, reason: 'NO_ALIAS_CONFIGURED' };
  const flat = t.replace(/[\s\-()]/g, '');
  const flatDigits = flat.replace(/\D/g, '');
  const forms = (aliases || []).map(aliasForms).filter(f => f.key);
  const idxTo0 = t.search(/(?:^|\s)(?:ال[يى]|to)(?:\s|$)/);
  // بندوّر على أي شكل من أشكال العنوان: رقم بآخر 9 خانات · عنوان كامل · الجزء قبل @
  const found = forms.find(f => f.kind === 'phone'
    ? flatDigits.includes(f.key)
    : (flat.includes(f.key) || (f.local.length >= 4 && flat.includes(f.local))));
  if (!found) {
    /* 🤏 قريب بخانة واحدة = قراية مش مضبوطة، مش مستفيد تاني.
       رقم المستفيد في الإيصال رمادي وصغير، والـOCR بيقلب 0/8 و1/7 و5/6 كتير.
       في الحالة دي **ممنوع** الرفض النهائي وممنوع القبول — الطلب بيروح للكاشير. */
    const near = phonesIn(t).some(p => forms.some(f => f.kind === 'phone' && off1(p, f.key)));
    return { ok: false, reason: near ? 'ALIAS_NEAR' : 'ALIAS_NOT_FOUND',
             sawTo: idxTo0 >= 0, seen: phonesIn(t).slice(0, 4) };
  }
  const hit = found.kind === 'phone' ? found.key : (flat.includes(found.key) ? found.key : found.local);

  // ناحية "إلى": من أول "الى"/"to" لآخر النص. Vision بيرجّع النص
  // بترتيب السطور، فالمستلم بييجي بعد المرسل في إيصال إنستاباي.
  const idxTo = idxTo0;
  const idxFrom = t.search(/(?:^|\s)(?:من|from)(?:\s|$)/);
  if (idxTo >= 0) {
    const afterRaw = t.slice(idxTo).replace(/[\s\-()]/g, '');
    const after = found.kind === 'phone' ? afterRaw.replace(/\D/g, '') : afterRaw;
    if (after.includes(hit)) return { ok: true, alias: hit, strict: true };
    // العنوان موجود بس بره ناحية "إلى" → مرفوض
    if (idxFrom >= 0 && idxFrom < idxTo) return { ok: false, reason: 'ALIAS_IS_SENDER', sawTo: true };
  }
  // ملقيناش كلمة "إلى" (قص/ضبابية) → نقبل بس نعلّم إنه غير مؤكد،
  // والقرار النهائي بيبقى للكاشير في المسار اليدوي.
  return { ok: true, alias: hit, strict: false };
}

/* ============================================================
   🎯 الحكم النهائي على فريم واحد.
   بيرجّع: checks (كل حقل true/false) + ok (الكل تمام).
   مبيرميش الفريم لو حقل واحد ناقص — بيرجّع اللي قراه عشان
   الشاشة تخضّر الحقول واحد واحد قدام العميلة.
   ============================================================ */
function inspectReceipt(text, expect) {
  const amountCents = Math.round(Number(expect.amountCents) || 0);
  const windowMin = Math.max(1, Number(expect.windowMin) || 5);
  const startedMin = Number(expect.startedCivilMin);

  const failed = looksFailed(text) && !checkSuccess(text);
  /* 🟢 النجاح بقى **غياب الفشل**، مش وجود عبارة بعينها.
     🔴 قبل كده كنا بنطلب "تم التحويل بنجاح" حرفيًا. العبارة دي عربي
        بخط رفيع فوق أيقونة خضرا، وهي أكتر سطر في الإيصال بيضيع في
        القراءة. النتيجة: المبلغ والوقت والرقم المرجعي كلهم يخضروا
        والاعتماد يفضل مقفول على سطر مش ظاهر للكاشير أصلًا.
     ✅ كلمات الفشل مميزة وواضحة (فشل · قيد التنفيذ · جاري · pending)،
        فالاعتماد على غيابها أمتن من الاعتماد على وجود عبارة النجاح.
        وباقي الحمايات زي ما هي: المبلغ والوقت والمستفيد والرقم. */
  const success = !failed;

  const amounts = extractAmountCents(text);
  const amountOk = amounts.includes(amountCents);

  const reference = extractReference(text);

  const rt = extractReceiptTime(text);
  let timeOk = false, driftMin = null;
  if (rt && Number.isFinite(startedMin)) {
    driftMin = civilMinutes(rt) - startedMin;
    /* ⏱️ النافذة في **الاتجاهين**.
       🔴 كانت دقيقة واحدة قبل الطلب بس — وده كان غلط في التصميم:
          العميلة بتحوّل وهي واقفة والكاشير لسه بتسجّل الأصناف، يعني
          التحويل بيحصل **قبل** ما تدوس OK بدقايق. الإيصال كان بيترفض
          بفرق −37 دقيقة وهو سليم تمامًا.
       🔒 التوسيع ده مبيفتحش باب للنصب: إعادة استخدام إيصال قديم
          محميّة بالرقم المرجعي المحجوز، مش بالوقت. الوقت بيمنع
          إيصال من إمبارح، والرقم بيمنع نفس الإيصال مرتين. */
    timeOk = driftMin >= -windowMin && driftMin <= windowMin;
  }

  const ben = checkBeneficiary(text, expect.aliases);

  const checks = {
    success,
    failed,
    amount: amountOk,
    reference: !!reference,
    time: timeOk,
    beneficiary: ben.ok
  };
  return {
    ok: success && amountOk && !!reference && timeOk && ben.ok,
    checks,
    amountsSeen: amounts,
    reference,
    receiptTime: rt,
    driftMin,
    beneficiaryStrict: !!ben.strict,
    beneficiaryReason: ben.reason || null,
    /* 🔎 قرينا ناحية "إلى" أصلًا؟ الرفض النهائي بـ"المستفيد مختلف" لازم يستند لده —
       صورة اتقص منها سطر المستلم مش دليل إن التحويل راح لحد تاني. */
    beneficiarySawTo: !!ben.sawTo,
    beneficiarySeen: ben.seen || []
  };
}

module.exports = {
  normalizeDigits, normalizeText,
  checkSuccess, looksFailed, aliasForms, phonesIn,
  extractAmountCents, extractReference, extractReceiptTime,
  civilMinutes, checkBeneficiary, inspectReceipt
};
