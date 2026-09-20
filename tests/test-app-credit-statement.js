/* 🧪 كشف الرصيد في تطبيق العميلة (loyalty + glow) — node tests/test-app-credit-statement.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
let p = 0, f = 0;
const t = (n, fn) => { try { fn(); p++; console.log('  ✅ ' + n); } catch (e) { f++; console.log('  ❌ ' + n + ' → ' + e.message); } };
const ok = (c, m) => { if (!c) throw Error(m || 'شرط فشل'); };
const eq = (a, b, m) => { if (a !== b) throw Error((m || '') + ' وجه ' + JSON.stringify(a) + ' والمتوقع ' + JSON.stringify(b)); };
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
function extractFn(s, head) { const i = s.indexOf(head); if (i < 0) throw Error('البلوك مش موجود: ' + head);
  const o = s.indexOf('{', i); let d = 0; for (let k = o; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (!d) return s.slice(i, k + 1); } } throw Error('أقواس'); }

/* قاعدة وهمية: الاستعلام المرتّب بيفشل (مفيش index) أو ينجح حسب الوضع */
function run(html, mode, app) {
  const fn = extractFn(html, 'function watchCredit(phone)');
  const log = { orderedSubs: 0, plainSubs: 0, unsubs: 0, renders: 0 };
  // 🏷️ كل تطبيق بيعرض حركات براندو بس: 3 بتوعه + 2 بتوع البراند التاني لازم يتفلتروا.
  //    (حركة من غير brand = قديمة = echarpe)
  const mine = app === 'glow' ? { brand: 'glow' } : {}, other = app === 'glow' ? {} : { brand: 'glow' };
  const DOCS = [{ at: 1, amount: 350, ...mine }, { at: 9, amount: -25, ...mine }, { at: 5, amount: 10, ...mine },
                { at: 7, amount: 999, ...other }, { at: 2, amount: 888, ...other }].map(x => ({ data: () => x }));
  const q = ordered => ({
    where() { return q(ordered); }, orderBy() { return q(true); }, limit() { return q(ordered); },
    onSnapshot(okCb, errCb) {
      if (ordered) { log.orderedSubs++; if (mode === 'noindex') setImmediate(() => errCb({ code: 'failed-precondition' })); else setImmediate(() => okCb({ docs: DOCS })); }
      else { log.plainSubs++; setImmediate(() => okCb({ docs: DOCS })); }
      return () => { log.unsubs++; };
    }
  });
  const ctx = vm.createContext({ console: { warn() {}, log() {} }, setImmediate, db: { collection: () => q(false) },
    $: () => ({ style: { display: 'block' } }), renderAccount: () => { log.renders++; } });
  vm.runInContext('var _creditRows = [];' + fn + '; var __u = watchCredit("010");', ctx);
  return new Promise(r => setTimeout(() => r({ log, rows: vm.runInContext('_creditRows', ctx), unsub: vm.runInContext('__u', ctx) }), 30));
}

(async () => {
  for (const app of ['loyalty', 'glow']) {
    const html = fs.readFileSync(path.join(ROOT, app, 'index.html'), 'utf8'), code = strip(html);
    console.log('\n📱 ' + app);
    const A = await run(html, 'noindex', app);
    t('⭐⭐ من غير index: الحركات بتظهر (كانت «لسه مفيش حركات»)', () => { eq(A.rows.length, 3); eq(A.log.plainSubs, 1, 'الفولباك'); });
    t('⭐ مرتّبة الأحدث فوق', () => eq(A.rows.map(r => r.at).join(), '9,5,1'));
    t('⭐⭐ حركات البراند التاني مابتظهرش (الرصيد مفصول)', () => ok(!A.rows.some(r => r.amount === 999 || r.amount === 888)));
    t('الحساب بيتحدّث لما الحركات توصل', () => ok(A.log.renders >= 1));
    t('⭐ الخروج بيقفل المستمعين الاتنين', () => { A.unsub(); eq(A.log.unsubs, 2); });
    const B = await run(html, 'ok', app);
    t('مع index: مستمع واحد بس (مفيش قراءات مضاعفة)', () => { eq(B.rows.length, 3); eq(B.log.plainSubs, 0); });
    t('⭐⭐ صف «رصيدي» بيفتح الكشف', () => ok(/class="acct-row" onclick="openCreditStatement\(\)"[^>]*><span class="k">💰 رصيدي/.test(code)));
    t('⭐ الزرار المكرر بيظهر بس لو الرصيد صفر وفيه حركات', () => {
      const i = code.indexOf('📒 كشف حساب الرصيد</button>'); ok(i > 0, 'الزرار اتشال خالص — اللي رصيدها صفر مش هتوصل للكشف');
      ok(/\(!\(\(Number\(currentCustomer\.credit(_glow)?\)\|\|0\) > 0\) && _creditRows\.length/.test(code.slice(i - 300, i)), 'الشرط');
    });
  }
  t('الكاش اترفع', () => { ok(+fs.readFileSync(path.join(ROOT, 'loyalty/sw.js'), 'utf8').match(/loyalty-shell-v(\d+)/)[1] >= 692); ok(+fs.readFileSync(path.join(ROOT, 'glow/sw.js'), 'utf8').match(/glow-loyalty-v(\d+)/)[1] >= 77); });
  console.log('\n===============================\nالنتيجة: ' + p + ' ناجح · ' + f + ' فاشل\n===============================\n');
  process.exit(f ? 1 : 0);
})();
