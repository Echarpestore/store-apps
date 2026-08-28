const fs=require('fs'), assert=require('assert');
const app=fs.readFileSync('sales/sales-app.js','utf8');
const html=fs.readFileSync('sales/index.html','utf8');
const sw=fs.readFileSync('sales/sw.js','utf8');

// تفاصيل السلف/المشتريات لازم تيجي من نفس العناصر اللي دخلت حسبة الراتب،
// مش query مختلفة ممكن تعرض أرقام لا تطابق المخصوم.
assert(app.includes('advanceItems: periodAdvances.slice().sort'), 'salary calc must expose exactly the charged advance/order items');
assert(app.includes('window.openPayrollAdvanceDetails = function(empId, periodKey)'), 'clickable salary advances detail dialog missing');
assert(app.includes("onclick=\"openPayrollAdvanceDetails('${emp.id}','${pk}')\""), 'salary advances row is not clickable');
assert(app.includes("const typeOf = (a)=> String(a.source||'').indexOf('staff_order')===0 ? '🛒 مشتريات' : '💰 سلفة';"), 'detail dialog must distinguish purchase orders from cash advances');
assert(app.includes("if(a.date) return String(a.date).slice(0,10);"), 'advance/order detail must show transaction date');
assert(app.includes("a.invoiceNo ? '<div"), 'staff purchase detail should show invoice number when available');

// النقط وقيمتها لازم تبان صراحة في كشف المرتب.
assert(app.includes("row('⭐ نقاط الشهر',fmtPts(due.ptsTotal)+' نقطة')"), 'payroll detail must show monthly points count');
assert(app.includes("row('قيمة النقاط المستحقة','+'+due.ptsDueAmt+' ج.م'"), 'payroll detail must show points cash value');

// الدفع مع المرتب موجود فعلياً: شاشة الصرف تبدأ بكل النقط المستحقة،
// والإجمالي يضم قيمتها، ثم تسجل مستند عمولة مع withSalary=true.
assert(app.includes('value="' + "' + due.ptsDue + '"), 'salary payout points input must default to all due points');
assert(/total:\s*Math\.round\(\(calc\.netSalary \+ commission\)/.test(app), 'salary payout total must include points commission');
assert(app.includes('withSalary: true, partial: s.pts < due.ptsDue, paidAt'), 'points paid with salary must be recorded as such');

assert(/sales-app\.js\?v=(2[0-9]|[3-9]\d+)/.test(html), 'sales app cache bust must be v20 or newer');
assert(sw.includes('store-apps-shell-v368'), 'Sales SW must be v368');
console.log('PASS payroll advances detail + points value v368');
