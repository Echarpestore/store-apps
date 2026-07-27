import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, setDoc, deleteDoc, updateDoc, enableIndexedDbPersistence, getDoc, getDocs, query, where, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCa6Qho3IKoKE_jCNHYuFX6rtaV88jekQs",
  authDomain: "customer-feedback-8ac1d.firebaseapp.com",
  projectId: "customer-feedback-8ac1d",
  storageBucket: "customer-feedback-8ac1d.firebasestorage.app",
  messagingSenderId: "408860081491",
  appId: "1:408860081491:web:c5fa8b8e757c13196375a6",
  measurementId: "G-6K33TSHDZ6"
};

const app = initializeApp(firebaseConfig);
// حساب الفرع (Email/Password) — نفس نظام الكاشير: الجهاز بيدخل مرة واحدة
// وده اللي بيسمحله يكتب الحضور/النقط/المرتبات تحت قواعد الأمان الجديدة.
const _auth = getAuth(app);
setPersistence(_auth, browserLocalPersistence).catch(()=>{});
const db = getFirestore(app);
// 🔗 نعرّض أدوات Firestore على window عشان بلوكات السكريبت التانية في الصفحة تقدر تستخدمها
window.db = db;
window.fbDoc = doc;
window.fbSetDoc = setDoc;
window.fbAddDoc = addDoc;
window.fbUpdateDoc = updateDoc;
window.fbDeleteDoc = deleteDoc;
window.fbCollection = collection;
// 🔍 نعرّض دوال الكشف عشان لوحة المراجعة (في بلوك تاني) تستخدمها
// (التعريض اتنقل لبعد تعريف الدوال والمتغيرات — تحت مباشرة بعد COMPLIANCE_END)
enableIndexedDbPersistence(db).catch((err)=> console.warn('Offline persistence not enabled:', err.code));

const empCol = collection(db, 'sales_employees');

// ===== 🧭 معالج تسجيل الموظف =====
const regCol = collection(db, 'sales_registrations');
let _rwStep = 0;
let _rwData = { name:'', gender:'', shift:'', dayOff:'', pin:'', agreed:false };
const _rwDayNames = ['الأحد','الاتنين','التلات','الأربع','الخميس','الجمعة','السبت'];
const RW_STEPS = 8;

window.rwSetPin = function(v){
  v = String(v).replace(/[^0-9]/g,'').slice(0,4);
  _rwData.pin = v;
  const inp = document.querySelector('#rwPin'); if(inp && inp.value!==v) inp.value = v;
  const btn = document.querySelector('#rwPinNext'); if(btn) btn.disabled = !/^\d{4}$/.test(v);
};
window.rwExit = function(){
  const started = _rwData.name || _rwData.shift || _rwData.dayOff || _rwData.pin;
  if(started && !confirm('تلغي التسجيل؟ البيانات اللي كتبتها هتضيع.')) return;
  window.rwClose();
};
window.rwPick = function(field, val){
  _rwData[field] = val;
  window.rwRender();
};
window.rwSetName = function(v){
  _rwData.name = v;
  const btn = document.querySelector('#rwNext1');
  if(btn) btn.disabled = !String(v).trim();
};
window.rwSetAgree = function(checked){
  _rwData.agreed = !!checked;
  const btn = document.querySelector('#rwSubmit');
  if(btn) btn.disabled = !checked;
};
function applyWizardBrand(){
  const isGlow = /glow/i.test(window.currentBranch || '');
  const img = document.querySelector('#rwLogo');
  if(img){
    img.src = isGlow ? '../glow/wordmark.png' : '../loyalty/logo-white.png';
    img.alt = isGlow ? 'Glow' : 'echarpe';
    img.onerror = function(){ this.onerror=null; this.src = isGlow ? '../glow/icon-192.png' : '../loyalty/icon-192.png'; };
  }
}
window.openRegWizard = function(){
  applyWizardBrand();
  _rwStep = 0; _rwData = { name:'', gender:'', shift:'', dayOff:'', pin:'', agreed:false };
  $('#regWizard').classList.add('show');
  window.rwRender();
};
window.rwClose=function(){ $('#regWizard').classList.remove('show'); };

function rwDots(){
  let h='';
  for(let i=0;i<RW_STEPS;i++) h += '<div class="rw-dot'+(i<=_rwStep?' on':'')+'"></div>';
  $('#rwDots').innerHTML = h;
}
function esc(x){ return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

window.rwRender=function(){
  rwDots();
  const b = $('#rwBody');
  const cfg = complianceCfg;
  const tcfg = (typeof timeCfgDefaults !== 'undefined') ? (window.timeCfg || timeCfgDefaults) : {};
  if(_rwStep===0){
    b.innerHTML = `<div class="rw-step">
      <div class="rw-eyebrow">${/glow/i.test(window.currentBranch||'') ? 'Glow' : 'echarpe'} ⭐</div>
      <div class="rw-title">أهلاً بك في فريق ${/glow/i.test(window.currentBranch||'') ? 'Glow' : 'echarpe'}</div>
      <div class="rw-sub">سجّل بياناتك، واطّلع على نظام المكافآت والالتزام.</div>
      <div class="rw-nav"><button class="rw-btn rw-next" onclick="rwGo(1)">ابدأ التسجيل</button></div>
    </div>`;
  } else if(_rwStep===1){
    b.innerHTML = `<div class="rw-step">
      <div class="rw-eyebrow">خطوة 1</div>
      <div class="rw-title">اسمك إيه؟</div>
      <div class="rw-sub">اكتب اسمك زي ما تحب يظهر في الترتيب والمكافآت</div>
      <input class="rw-input" id="rwName" placeholder="الاسم" value="${esc(_rwData.name)}" oninput="window.rwSetName(this.value)">
      <div class="rw-nav"><button class="rw-btn rw-back" onclick="rwGo(0)">◀</button><button class="rw-btn rw-next" id="rwNext1" onclick="rwGo(2)" ${_rwData.name.trim()?'':'disabled'}>التالي ▶</button></div>
    </div>`;
    setTimeout(()=>{ const i=$('#rwName'); if(i) i.focus(); },100);
  } else if(_rwStep===2){
    b.innerHTML = `<div class="rw-step">
      <div class="rw-eyebrow">خطوة 2</div>
      <div class="rw-title">النوع</div>
      <div class="rw-sub">بيستخدم في صياغة الرسايل والتقارير</div>
      <div class="rw-choice">
        <div class="rw-opt ${_rwData.gender==='female'?'sel':''}" onclick="window.rwPick('gender','female')">👩 بنت</div>
        <div class="rw-opt ${_rwData.gender==='male'?'sel':''}" onclick="window.rwPick('gender','male')">👨 ولد</div>
      </div>
      <div class="rw-nav"><button class="rw-btn rw-back" onclick="rwGo(1)">◀</button><button class="rw-btn rw-next" onclick="rwGo(3)" ${_rwData.gender?'':'disabled'}>التالي ▶</button></div>
    </div>`;
  } else if(_rwStep===3){
    const S=cfg.shifts;
    b.innerHTML = `<div class="rw-step">
      <div class="rw-eyebrow">خطوة 3</div>
      <div class="rw-title">اختار شيفتك</div>
      <div class="rw-sub">ده معاد حضورك اليومي — والتأخير أكتر من ${cfg.lateGraceMin} دقيقة عليه خصم</div>
      <div class="rw-choice">
        <div class="rw-opt ${_rwData.shift==='morning'?'sel':''}" onclick="window.rwPick('shift','morning')">${S.morning.label}<small>${S.morning.start} → ${S.morning.end}</small></div>
        <div class="rw-opt ${_rwData.shift==='evening'?'sel':''}" onclick="window.rwPick('shift','evening')">${S.evening.label}<small>${S.evening.start} → ${S.evening.end}</small></div>
      </div>
      <div class="rw-nav"><button class="rw-btn rw-back" onclick="rwGo(2)">◀</button><button class="rw-btn rw-next" onclick="rwGo(4)" ${_rwData.shift?'':'disabled'}>التالي ▶</button></div>
    </div>`;
  } else if(_rwStep===4){
    b.innerHTML = `<div class="rw-step">
      <div class="rw-eyebrow">خطوة 4</div>
      <div class="rw-title">يوم إجازتك</div>
      <div class="rw-sub">اختار يوم إجازتك الأسبوعي — تغييره بعد كده عليه خصم</div>
      <div class="rw-days">
        ${_rwDayNames.map((d,i)=>`<div class="rw-day ${String(_rwData.dayOff)===String(i)?'sel':''}" onclick="window.rwPick('dayOff','${i}')">${d}</div>`).join('')}
      </div>
      <div class="rw-nav"><button class="rw-btn rw-back" onclick="rwGo(3)">◀</button><button class="rw-btn rw-next" onclick="rwGo(5)" ${_rwData.dayOff!==''?'':'disabled'}>التالي ▶</button></div>
    </div>`;
  } else if(_rwStep===5){
    b.innerHTML = `<div class="rw-step">
      <div class="rw-eyebrow">خطوة 5</div>
      <div class="rw-title">نظام المكافآت والالتزام</div>
      <div class="rw-sub">اقرا كويس — ده اللي بيحدد مكافأتك ومرتبك</div>
      <div class="rw-rules">
        <div class="rw-rule good"><div class="ic">🎁</div><div><b>المكافأة على 3 حاجات</b><small>التزامك بالمواعيد (${cfg.weights.commitment}%) + مبيعاتك (${cfg.weights.sales}%) + تقييم العملاء ليك (${cfg.weights.rating}%)</small></div></div>
        <div class="rw-rule good"><div class="ic">✅</div><div><b>تأخير أقل من ${tcfg.lateMinPerHour} دقايق = مسموح</b><small>عندك سماح يومي، مش هيتحسب عليك حاجة</small></div></div>
        <div class="rw-rule warn"><div class="ic">⏰</div><div><b>كل ${tcfg.lateMinPerHour} دقايق تأخير = ساعة على رصيدك</b><small>مثال: اتأخرت ${tcfg.lateMinPerHour*2} دقيقة → ساعتين رصيد</small></div></div>
        <div class="rw-rule warn"><div class="ic">☕</div><div><b>البريك ${tcfg.breakMin} دقيقة (+${tcfg.breakGraceMin} سماح)</b><small>الزيادة بعد كده: كل ${tcfg.breakMinPerHour} دقايق = ساعة رصيد · بريك ${tcfg.breakPerDay} في اليوم</small></div></div>
        <div class="rw-rule warn"><div class="ic">🔄</div><div><b>تبديل الشيفت أو الإجازة</b><small>أول تبديل في الشهر مجاني · اللي بعده = ${tcfg.swapHours} ساعات رصيد</small></div></div>
        <div class="rw-rule warn"><div class="ic">💰</div><div><b>كل ${tcfg.hoursPerDay} ساعات رصيد = يوم يتخصم من مرتبك</b><small>يعني لو تأخيرك في الشهر عدّى ${tcfg.hoursPerDay*tcfg.lateMinPerHour} دقيقة</small></div></div>
        <div class="rw-rule warn"><div class="ic">🚪</div><div><b>رصيدك لازم مايعدّيش ${tcfg.allowedHoursMonth} ساعات في الشهر</b><small>لو عدّاها → بتخرج من المكافأة، مهما كانت مبيعاتك وتقييمك</small></div></div>
        <div class="rw-rule good"><div class="ic">⭐</div><div><b>الالتزام هو الأساس</b><small>الملتزم بمواعيده هو اللي بياخد المكافأة</small></div></div>
      </div>
      <div class="rw-nav"><button class="rw-btn rw-back" onclick="rwGo(4)">◀</button><button class="rw-btn rw-next" onclick="rwGo(6)">فهمت ▶</button></div>
    </div>`;
  } else if(_rwStep===6){
    b.innerHTML = `<div class="rw-step">
      <div class="rw-eyebrow">خطوة 6</div>
      <div class="rw-title">رقمك السري</div>
      <div class="rw-sub">اختار رقم من 4 أرقام تستخدمه لتسجيل حضورك وانصرافك. احفظه كويس ومتقولهوش لحد.</div>
      <input class="rw-input" id="rwPin" inputmode="numeric" maxlength="4" placeholder="••••" value="${_rwData.pin}" style="letter-spacing:12px; font-size:26px;" oninput="window.rwSetPin(this.value)">
      <div class="rw-nav"><button class="rw-btn rw-back" onclick="rwGo(5)">◀</button><button class="rw-btn rw-next" id="rwPinNext" onclick="rwGo(7)" ${/^\d{4}$/.test(_rwData.pin)?'':'disabled'}>التالي ▶</button></div>
    </div>`;
  } else if(_rwStep===7){
    b.innerHTML = `<div class="rw-step">
      <div class="rw-eyebrow">آخر خطوة</div>
      <div class="rw-title">تأكيد التسجيل</div>
      <div class="rw-sub">راجع بياناتك</div>
      <div class="rw-rules">
        <div class="rw-rule"><div class="ic">🙋</div><div><b>${esc(_rwData.name)}</b><small>الاسم</small></div></div>
        <div class="rw-rule"><div class="ic">${_rwData.gender==='female'?'👩':'👨'}</div><div><b>${_rwData.gender==='female'?'بنت':'ولد'}</b><small>النوع</small></div></div>
        <div class="rw-rule"><div class="ic">🕐</div><div><b>${cfg.shifts[_rwData.shift].label} (${cfg.shifts[_rwData.shift].start}→${cfg.shifts[_rwData.shift].end})</b><small>الشيفت</small></div></div>
        <div class="rw-rule"><div class="ic">📅</div><div><b>${_rwDayNames[Number(_rwData.dayOff)]}</b><small>يوم الإجازة</small></div></div>
      </div>
      <label class="rw-agree"><input type="checkbox" id="rwAgree" ${_rwData.agreed?'checked':''} onchange="window.rwSetAgree(this.checked)"> قرأت النظام ووافقت عليه</label>
      <div class="rw-nav"><button class="rw-btn rw-back" onclick="rwGo(6)">◀</button><button class="rw-btn rw-next" id="rwSubmit" onclick="rwSubmit()" ${_rwData.agreed?'':'disabled'}>تأكيد ✅</button></div>
    </div>`;
  }
};
window.rwGo=function(step){ _rwStep = step; window.rwRender(); };

window.rwSubmit=async function(){
  if(!_rwData.agreed) return;
  const btn = $('#rwSubmit'); if(btn){ btn.disabled=true; btn.textContent='...'; }
  try{
    await addDoc(regCol, {
      name: _rwData.name.trim(),
      gender: _rwData.gender || '',
      shift: _rwData.shift,
      // مواعيد الشيفت المختار بتتسجّل مع الطلب (بيتحسب عليها التأخير)
      scheduledStartTime: (complianceCfg.shifts[_rwData.shift] || {}).start || null,
      scheduledEndTime: (complianceCfg.shifts[_rwData.shift] || {}).end || null,
      dayOff: _rwData.dayOff,
      pin: _rwData.pin || '0000',
      branch: window.currentBranch || '',
      status: 'pending',            // مستني اعتماد الأدمن
      agreedAt: Date.now(),
      ts: Date.now()
    });
    $('#rwBody').innerHTML = `<div class="rw-step" style="padding:30px 0;">
      <div class="rw-done">🎉</div>
      <div class="rw-title" style="margin-top:14px;">تم استلام تسجيلك ✅</div>
      <div class="rw-sub">بياناتك وصلت للإدارة، والحساب هيتفعّل بعد الاعتماد.<br>الرقم السري اللي اخترته هو اللي هتسجّل بيه حضورك.</div>
      <div class="rw-nav"><button class="rw-btn rw-next" onclick="rwClose()">تمام 🤍</button></div>
    </div>`;
    $('#rwDots').innerHTML='';
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent='تأكيد ✅'; }
    alert('حصل خطأ، حاول تاني: ' + e.message);
  }
}

// ===== 🔒 اعتماد التسجيلات (أدمن) =====
let allRegistrations = [];
onSnapshot(regCol, (snap)=>{
  allRegistrations = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  if(adminUnlocked) renderPendingRegs();
  updateRegBadge();
}, (e)=> console.warn('regs sync', e && e.code));

function updateRegBadge(){
  const pend = allRegistrations.filter(r=> r.status==='pending' && r.branch===window.currentBranch).length;
  const el = $('#regPendBadge');
  if(el){ el.textContent = pend; el.style.display = pend ? 'inline-flex' : 'none'; }
}

function renderPendingRegs(){
  const wrap = $('#pendingRegsList'); if(!wrap) return;
  const pend = allRegistrations.filter(r=> r.status==='pending' && r.branch===window.currentBranch);
  if(!pend.length){ wrap.innerHTML = '<p style="color:var(--sub); font-size:12px;">مفيش طلبات تسجيل مستنية.</p>'; return; }
  wrap.innerHTML = pend.map(r=>`
    <div style="background:var(--panel); border:1px solid var(--gold-dim); border-radius:13px; padding:13px; margin-bottom:9px;">
      <div style="font-weight:800; font-size:15px;">🙋 ${esc(r.name)}</div>
      <div style="color:var(--sub); font-size:12.5px; margin:5px 0 11px; line-height:1.7;">
        ${r.gender ? (r.gender==='female'?'👩 بنت':'👨 ولد') + ' &nbsp;·&nbsp; ' : ''}
        🕐 ${complianceCfg.shifts[r.shift] ? complianceCfg.shifts[r.shift].label : r.shift}
        ${r.scheduledStartTime ? ' ('+r.scheduledStartTime+' → '+(r.scheduledEndTime||'')+')' : ''}
        &nbsp;·&nbsp; 📅 إجازة: ${_rwDayNames[Number(r.dayOff)]||'—'}
      </div>
      <div style="display:flex; gap:8px;">
        <button onclick="approveReg('${r.id}')" style="flex:1; padding:11px; border:none; border-radius:10px; background:linear-gradient(180deg,var(--gold),#d9a838); color:#1b1400; font-family:'Cairo'; font-weight:800; cursor:pointer;">✅ اعتماد</button>
        <button onclick="rejectReg('${r.id}')" style="padding:11px 16px; border:1px solid var(--line); border-radius:10px; background:var(--panel2); color:var(--sub); font-family:'Cairo'; font-weight:700; cursor:pointer;">حذف</button>
      </div>
    </div>`).join('');
}

window.approveReg = async function(id){
  const r = allRegistrations.find(x=> x.id===id); if(!r) return;
  try{
    // بننشئ الموظف فعليًا في sales_employees ببياناته المعتمدة
    await addDoc(empCol, {
      name: r.name, gender: r.gender || '', avatar: (r.gender === 'male' ? 'boy' : 'girl'), shift: r.shift, dayOff: r.dayOff,
      scheduledStartTime: r.scheduledStartTime || (complianceCfg.shifts[r.shift]||{}).start || null,
      scheduledEndTime: r.scheduledEndTime || (complianceCfg.shifts[r.shift]||{}).end || null,
      branch: r.branch, active: true, createdAt: Date.now(), pin: (r.pin || '0000')
    });
    await updateDoc(doc(db,'sales_registrations', id), { status:'approved', approvedAt: Date.now() });
    alert('تم اعتماد ' + r.name + ' — الحساب اتفعّل بالرقم السري اللي اختاره الموظف ✅');
  }catch(e){ alert('تعذر الاعتماد: ' + e.message); }
};
window.rejectReg = async function(id){
  if(!confirm('تحذف طلب التسجيل ده؟')) return;
  try{ await updateDoc(doc(db,'sales_registrations', id), { status:'rejected' }); }catch(e){}
};

const pointsCol = collection(db, 'sales_points');
const referralsCol = collection(db, 'sales_app_referrals');
const staffOrdersCol = collection(db, 'sales_staff_orders');
const printJobsCol = collection(db, 'pos_print_jobs');
const entriesCol = collection(db, 'entries'); // shared with the feedback (happy-or-not) app
const shiftsCol = collection(db, 'sales_shifts');
const tasksCol = collection(db, 'sales_tasks');
const submissionsCol = collection(db, 'sales_task_submissions');
const rewardsCol = collection(db, 'sales_rewards');
const settingsCol = collection(db, 'sales_settings');
const commissionPaymentsCol = collection(db, 'sales_commission_payments');
const salaryPaymentsCol = collection(db, 'sales_salary_payments');
const terminationsCol = collection(db, 'sales_terminations');
const advancesCol = collection(db, 'sales_advances');
const deductionsCol = collection(db, 'sales_deductions');   // 💰 خصومات الالتزام (تأخير/تبديل)
const breaksCol = collection(db, 'sales_breaks');           // ☕ البريكات
let allBreaks = [];
const attDecisionsCol = collection(db, 'sales_att_decisions'); // 🔍 قرارات الأدمن على المخالفات المكتشفة
let allAttDecisions = [];
const vioReviewCol = collection(db, 'sales_violation_reviews'); // 🔍 قرارات الأدمن على المخالفات المكتشفة
let allVioReviews = [];
let allDeductions = [], deductions = [];
const timeCreditCol = collection(db, 'sales_time_credit');   // ⏳ رصيد ساعات الوقت
let allTimeCredit = [];
const leaveReqCol = collection(db, 'sales_leave_requests');  // 📩 طلبات الإذن/الإجازة
let allLeaveReqs = [];
let allSettingsDocs = [];   // معرّفات مستندات الإعدادات = أسماء الفروع

// Simple admin access code — checked on-device, no network call.
// Change this string to whatever code you want, then re-download the file.
const ADMIN_CODE = '2005';

const $ = s => document.querySelector(s);
window.employees = [];   // filtered to this device's own branch (kiosk grid)
let allEmployees = []; // raw from Firestore
window.points = [];      // {id, employeeId, employeeName, invoiceNumber, ts}
let allFeedback = []; // raw customer satisfaction entries from the feedback app
let selectedEmp = null;
let adminUnlocked = false;
let allShifts = [], shifts = [];           // clock in/out records
let allTasks = [], tasks = [];             // current weekly task assignment per employee
let allSubmissions = [], submissions = []; // daily task photo submissions
let allRewards = [], rewards = [];         // earned weekly/monthly rewards
let commissionPerPoint = 0;                // set by admin, per branch

// ============================================================================
// >>> COMPLIANCE_START — نظام الالتزام والمكافآت (v20)
// كل القيم دي افتراضية وبتتحمّل من إعدادات الفرع (الأدمن بيعدّلها من لوحته).
// ============================================================================
let complianceCfg = {
  penalty: 50,                       // خصم الجنيه للمخالفة الواحدة
  lateGraceMin: 20,                  // سماح التأخير بالدقايق قبل الخصم
  shifts: {
    morning: { label: '🌅 صباحي', start: '10:00', end: '18:00' },
    evening: { label: '🌆 مسائي', start: '14:00', end: '22:00' }
  },
  weights: { commitment: 40, sales: 30, rating: 30 }   // أوزان المكافأة (مجموعها 100)
};

// بيحوّل "HH:MM" لعدد دقايق من نص الليل
function _hm2min(hm){ const [h,m] = String(hm||'0:0').split(':').map(Number); return (h||0)*60 + (m||0); }

// 🕒 حساب دقايق التأخير: وقت الحضور مقابل بداية شيفت الموظف (+سماح)
// بيرجع {lateMin, penalized} — penalized=true لو عدّى السماح (يعني خصم)
function computeLate(clockInDate, shiftKey, cfg){
  cfg = cfg || complianceCfg;
  const sh = (cfg.shifts||{})[shiftKey];
  if(!sh || !clockInDate) return { lateMin: 0, penalized: false };
  const inMin = clockInDate.getHours()*60 + clockInDate.getMinutes();
  const lateMin = Math.max(0, inMin - _hm2min(sh.start));
  return { lateMin, penalized: lateMin > (cfg.lateGraceMin||0) };
}

// 💰 إجمالي خصومات موظف في فترة: تأخير + تبديل شيفت + تبديل إجازة
// violations = [{type:'late'|'shiftSwap'|'dayoffSwap', ...}]
function computeDeductions(violations, cfg){
  cfg = cfg || complianceCfg;
  const per = Number(cfg.penalty) || 0;
  const list = (violations||[]).filter(v => v && (v.type==='late' ? v.penalized : true));
  return { count: list.length, total: list.length * per, items: list };
}

// 🏆 نتيجة المكافأة بـ3 عوامل (0..100) — كل عامل بيتطبّع لنسبة ثم بالوزن
// inp = { commitmentPct(0..100), salesValue, maxSalesValue, ratingPct(0..100) }
function computeRewardScore(inp, cfg){
  cfg = cfg || complianceCfg;
  const w = cfg.weights || { commitment:40, sales:30, rating:30 };
  const wsum = (w.commitment + w.sales + w.rating) || 100;
  const commit = Math.max(0, Math.min(100, Number(inp.commitmentPct)||0));
  const rating = Math.max(0, Math.min(100, Number(inp.ratingPct)||0));
  const salesPct = (inp.maxSalesValue > 0) ? Math.min(100, (Number(inp.salesValue)||0) / inp.maxSalesValue * 100) : 0;
  const score = (commit*w.commitment + salesPct*w.sales + rating*w.rating) / wsum;
  return {
    score: Math.round(score*10)/10,
    breakdown: {
      commitment: Math.round(commit*w.commitment/wsum*10)/10,
      sales: Math.round(salesPct*w.sales/wsum*10)/10,
      rating: Math.round(rating*w.rating/wsum*10)/10
    }
  };
}

// 🎯 نسبة الالتزام: تبدأ 100 وينزل منها لكل مخالفة (كل مخالفة -pointsPerViolation)
function commitmentPct(violationCount, pointsPerViolation){
  const pen = (pointsPerViolation!=null ? pointsPerViolation : 15);
  return Math.max(0, 100 - (Number(violationCount)||0) * pen);
}

// ============ 🔍 كشف المخالفات (غياب / تبديل يوم إجازة) ============
// بنقارن كل يوم شغل بالحضور الفعلي. النتيجة "مشتبه فيها" — الأدمن هو اللي بيقرر.
// shiftsByDay = { 'YYYY-MM-DD': true }  (الأيام اللي الموظف سجّل فيها حضور)
// resolved    = { 'YYYY-MM-DD': 'deducted'|'excused' }  (اللي الأدمن حسمها قبل كده)
function detectViolations(emp, fromDate, toDate, shiftsByDay, resolved, dayKeyFn){
  const out = [];
  if(!emp || emp.dayOff === undefined || emp.dayOff === null || emp.dayOff === '') return out;
  const off = Number(emp.dayOff);
  const start = new Date(fromDate), end = new Date(toDate);
  start.setHours(0,0,0,0); end.setHours(0,0,0,0);
  const key = dayKeyFn;
  let workedOnDayOff = null, missedWorkDays = [];

  for(let d = new Date(start); d <= end; d.setDate(d.getDate()+1)){
    const k = key(d);
    if(resolved && resolved[k]) continue;          // الأدمن حسمها خلاص
    const attended = !!(shiftsByDay && shiftsByDay[k]);
    const isOff = d.getDay() === off;
    if(isOff && attended) workedOnDayOff = k;       // اشتغل في يوم إجازته
    if(!isOff && !attended) missedWorkDays.push(k); // غاب في يوم شغله
  }

  // اشتغل في إجازته + غاب يوم شغل = تبديل يوم إجازة (مخالفة واحدة مش اتنين)
  if(workedOnDayOff && missedWorkDays.length){
    out.push({ type:'dayoffSwap', date: missedWorkDays[0], workedOn: workedOnDayOff,
               label:'بدّل يوم إجازته' });
    missedWorkDays = missedWorkDays.slice(1);
  }
  missedWorkDays.forEach(k => out.push({ type:'absence', date:k, label:'غياب في يوم شغل' }));
  return out;
}

// ===== 🔍 كشف المخالفات: غياب في يوم شغل / شغل في يوم إجازة (تبديل) =====
// بيقارن جدول الموظف بحضوره الفعلي على مدى فترة، ويرجع قايمة "مشتبه فيها"
// مفيش خصم تلقائي هنا — الأدمن هو اللي بيقرر (خصم / تجاهل).
//
// emps    : [{id, name, dayOff, createdAt}]
// shifts  : [{employeeId, clockInTs}]
// decided : { 'empId|YYYY-MM-DD': 'charged'|'ignored' }  القرارات اللي اتاخدت قبل كده
// يرجع: [{empId, empName, dateKey, type:'absent'|'workedDayOff', dow}]
function detectAttendanceIssues(emps, shifts, fromTs, toTs, decided, todayTs){
  decided = decided || {};
  const out = [];
  const DAY = 86400000;
  const keyOf = (d)=> d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  // حضور كل موظف بمفتاح اليوم
  const present = {};
  (shifts||[]).forEach(sh=>{
    if(!sh || !sh.clockInTs) return;
    present[sh.employeeId + '|' + keyOf(new Date(sh.clockInTs))] = true;
  });
  const start = new Date(fromTs); start.setHours(0,0,0,0);
  const end   = new Date(toTs);   end.setHours(0,0,0,0);
  const today = new Date(todayTs || Date.now()); today.setHours(0,0,0,0);

  for(let t = start.getTime(); t <= end.getTime(); t += DAY){
    const d = new Date(t);
    if(d.getTime() >= today.getTime()) continue;      // النهاردة لسه مخلصش — مش بنحكم عليه
    const dateKey = keyOf(d), dow = d.getDay();
    (emps||[]).forEach(e=>{
      if(!e || e.active === false) return;
      if(e.dayOff === undefined || e.dayOff === null || e.dayOff === '') return;   // ملوش جدول
      if(e.createdAt && t < new Date(e.createdAt).setHours(0,0,0,0)) return;        // قبل ما يتسجّل
      const k = e.id + '|' + dateKey;
      if(decided[k]) return;                                                        // اتقرر فيها قبل كده
      const isOff = Number(e.dayOff) === dow;
      const came  = !!present[k];
      if(!isOff && !came)      out.push({ empId:e.id, empName:e.name, dateKey, type:'absent', dow });
      else if(isOff && came)   out.push({ empId:e.id, empName:e.name, dateKey, type:'workedDayOff', dow });
    });
  }
  return out;
}

// بيجمّع نتايج الكشف: لو موظف اشتغل يوم إجازته + غاب يوم شغل في نفس الأسبوع → ده تبديل يوم إجازة
function pairSwaps(issues){
  const byEmpWeek = {};
  const weekOf = (dateKey)=>{
    const d = new Date(dateKey + 'T00:00:00');
    const s = new Date(d); s.setDate(d.getDate() - d.getDay());
    return s.toISOString().slice(0,10);
  };
  (issues||[]).forEach(i=>{
    const k = i.empId + '|' + weekOf(i.dateKey);
    (byEmpWeek[k] = byEmpWeek[k] || []).push(i);
  });
  const swaps = [], singles = [];
  Object.values(byEmpWeek).forEach(list=>{
    const worked = list.filter(x=> x.type==='workedDayOff');
    const absent = list.filter(x=> x.type==='absent');
    const n = Math.min(worked.length, absent.length);
    for(let i=0;i<n;i++) swaps.push({ ...absent[i], type:'dayoffSwap', pairedWith: worked[i].dateKey });
    singles.push(...worked.slice(n), ...absent.slice(n));
  });
  return { swaps, singles };
}

// ===== ⏳ نظام رصيد الوقت (بديل خصم الـ50 جنيه) =====
// كل 10 دقايق تأخير = ساعة · بريك زايد >20 دقيقة = ساعة · تبديل بعد الأول = 4 ساعات
// وكل 7 ساعات متراكمة في الشهر = يوم يتخصم من المرتب
const timeCfgDefaults = {
  lateMinPerHour: 10,      // كل كام دقيقة تأخير تساوي ساعة
  breakMin: 30,            // مدة البريك المسموحة (دقيقة)
  breakGraceMin: 5,        // سماح إضافي بعد مدة البريك
  breakMinPerHour: 10,     // كل كام دقيقة زيادة في البريك تساوي ساعة (زي التأخير)
  swapFreePerMonth: 1,     // كام تبديل مجاني في الشهر
  swapHours: 4,            // ساعات التبديل بعد المجاني
  hoursPerDay: 7,          // كل كام ساعة = يوم خصم
  maxDaysPerMonth: 0,      // سقف أيام الخصم الشهري (0 = مفتوح)
  minStaffPerDay: 2,       // أقل عدد موظفين لازم يفضلوا في الفرع (لكل فرع يتظبط)
  breakPerDay: 1,          // كام بريك مسموح في اليوم
  maxOnBreak: 1,           // كام موظف يقدروا يطلعوا بريك مع بعض
  commitPointsPerHour: 5,  // كل ساعة رصيد بتنزّل درجة الالتزام كام نقطة
  outWeeklyHours: 7,       // ساعات الأسبوع اللي بتطلّعه من السباق الأسبوعي
  outMonthlyHours: 14,     // ساعات الشهر اللي بتطلّعه من السباق الشهري
  commitGate: 90,          // 🚪 أقل نسبة التزام لدخول المكافأة (أقل منها = خارج تمامًا)
  allowedHoursWeek: 2,     // الرصيد المسموح في الأسبوع
  allowedHoursMonth: 7,    // الرصيد المسموح في الشهر (= يوم خصم: أول ما توصله تخرج من المكافأة)
  maxLateHoursPerDay: 0,   // 🧢 سقف عقوبة التأخير في اليوم الواحد (0 = مفيش سقف — الأدمن يحدده)
  earlyMinPerHour: 10,     // 🚪 الانصراف بدري: كل كام دقيقة = ساعة (زي التأخير)
  absenceHours: 7,         // 🚫 غياب بدون عذر = كام ساعة رصيد (7 = خروج فوري من المكافأة)
  autoCloseBreakMult: 2    // البريك بيتقفل تلقائي بعد كام ضعف من مدته
};

// 🎯 درجة الالتزام من رصيد الساعات (بديل العد بالمخالفات)
function commitmentFromHours(hours, cfg){
  cfg = cfg || timeCfgDefaults;
  const per = Number(cfg.commitPointsPerHour) || 5;
  return Math.max(0, Math.min(100, 100 - (Number(hours)||0) * per));
}

// 🚪 هل الموظف مؤهّل للمكافأة؟ — الالتزام شرط دخول مش مجرد وزن
// أقل من العتبة (90% افتراضي) = خارج المكافأة مهما كانت مبيعاته وتقييمه
// period = 'week' | 'month' — كل فترة ليها رصيدها المسموح
// عند الرصيد المسموح بالظبط → النسبة = العتبة (90%) → لسه مؤهّل
// أكتر منه → تحت العتبة → خارج المكافأة
function rewardEligibility(hours, period, cfg){
  cfg = cfg || timeCfgDefaults;
  const gate = Number(cfg.commitGate) || 90;
  const allowed = period === 'month'
    ? (Number(cfg.allowedHoursMonth) || 8)
    : (Number(cfg.allowedHoursWeek) || 2);
  const h = Math.max(0, Number(hours) || 0);
  // النسبة منسوبة لرصيد الفترة: عند allowed تساوي gate بالظبط
  const commit = allowed > 0
    ? Math.max(0, Math.min(100, 100 - (h / allowed) * (100 - gate)))
    : (h > 0 ? 0 : 100);
  return {
    commitPct: Math.round(commit * 10) / 10,
    gate,
    period: period === 'month' ? 'month' : 'week',
    eligible: h <= allowed,
    hours: h,
    allowedHours: allowed,
    hoursLeft: Math.max(0, allowed - h)
  };
}

// 🏁 هل الموظف خرج من السباق؟ (أسبوعي/شهري حسب ساعاته)
function isOutOfRace(hours, period, cfg){
  cfg = cfg || timeCfgDefaults;
  const limit = period === 'week'
    ? (Number(cfg.outWeeklyHours) || 0)
    : (Number(cfg.outMonthlyHours) || 0);
  return limit > 0 && (Number(hours)||0) >= limit;
}

// ===== 🖼️ نظام الإطارات: يومي + تارجت الشيفت + أسبوعي + سلاسل + جماعي =====
const framesDefaults = {
  minWeekDays: 5,     // أقل أيام حضور فعلية عشان "أسبوع نضيف" يتحسب (سد ثغرة أسبوع اشتغل فيه يومين)
  streakSilver: 4,    // 🥈 عدد الأسابيع النضيفة المتتالية للفضي
  streakGold: 8       // 🥇 وللدهبي
};

// أسبوع العمل المصري: السبت → الجمعة. المفتاح = تاريخ السبت
function frameWeekStart(d){
  const dt = new Date(d); dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate() - ((dt.getDay() + 1) % 7));   // Sat=6→0 · Sun=0→1 · ... · Fri=5→6
  return dt;
}
function frameWeekLabel(d){ return 'W' + todayStr(frameWeekStart(d)); }

// 🎯 صافي مبيعات فريق شيفت من صفوف مبيعات اليوم
// نفس منطق عمولة التارجت: المرتجع الكامل بيستبعد الأصل (reversed) وصف العكس (isReversal)
// عشان ميتحسبش مرتين — والفواتير اللي من غير بياع مسجّل مش بتتحسب لأي شيفت
function shiftTeamNet(rows, teamIds){
  const set = new Set(teamIds || []);
  return (rows || []).filter(r => r && !r.reversed && !r.isReversal && set.has(r.sellerEmployeeId))
                     .reduce((s, r) => s + (Number(r.total) || 0), 0);
}

// 🟢 يوم نضيف (حي): حضر النهارده + صفر رصيد غير معذور بتاريخ النهارده
// "حي" يعني بيتسحب فورًا لو نزل رصيد (تأخير بريك / انصراف بدري) — الحساب بيتعاد مع كل snapshot
function dailyCleanFrame(empId, dateKey, credit, shiftRows){
  const attended = (shiftRows || []).some(s => s.employeeId === empId && s.clockInTs
                    && todayStr(new Date(s.clockInTs)) === dateKey);
  if(!attended) return false;
  const hours = (credit || []).filter(x => x && x.employeeId === empId && !x.excused && x.date === dateKey)
                              .reduce((a, x) => a + (Number(x.hours) || 0), 0);
  return hours === 0;
}

// 🏅 أسبوع نضيف (بيتحسب على أسبوع مكتمل): صفر رصيد + حد أدنى أيام حضور فعلية
function weeklyCleanFrame(empId, weekStartDate, credit, shiftRows, cfg){
  cfg = cfg || framesDefaults;
  const daySet = new Set();
  for(let i = 0; i < 7; i++){
    const d = new Date(weekStartDate); d.setDate(d.getDate() + i);
    daySet.add(todayStr(d));
  }
  const attendedDays = new Set(
    (shiftRows || []).filter(s => s.employeeId === empId && s.clockInTs && daySet.has(todayStr(new Date(s.clockInTs))))
                     .map(s => todayStr(new Date(s.clockInTs))));
  if(attendedDays.size < (Number(cfg.minWeekDays) || 5)) return false;
  const hours = (credit || []).filter(x => x && x.employeeId === empId && !x.excused && daySet.has(x.date))
                              .reduce((a, x) => a + (Number(x.hours) || 0), 0);
  return hours === 0;
}

// 🥈🥇 مستوى السلسلة من عدد الأسابيع النضيفة المتتالية (0 = مفيش، 1 = فضي، 2 = دهبي)
function streakLevel(count, cfg){
  cfg = cfg || framesDefaults;
  const n = Number(count) || 0;
  return n >= (cfg.streakGold || 8) ? 2 : n >= (cfg.streakSilver || 4) ? 1 : 0;
}
window.frameWeekStart = frameWeekStart;
window.frameWeekLabel = frameWeekLabel;
window.shiftTeamNet = shiftTeamNet;
window.dailyCleanFrame = dailyCleanFrame;
window.weeklyCleanFrame = weeklyCleanFrame;
window.streakLevel = streakLevel;
window.framesDefaults = framesDefaults;

// ساعات التأخير من دقايق التأخير (تقريب لأسفل)
function lateHoursFrom(lateMin, cfg){
  cfg = cfg || timeCfgDefaults;
  const per = Number(cfg.lateMinPerHour) || 10;
  let h = Math.floor(Math.max(0, Number(lateMin) || 0) / per);
  const cap = Number(cfg.maxLateHoursPerDay) || 0;   // سقف اليوم الواحد لو الأدمن حدده
  if(cap > 0 && h > cap) h = cap;
  return h;
}

// ساعات البريك الزايد — متدرّجة زي التأخير بالظبط (مفيش ثغرة سماح كبير)
// الزيادة = مدة البريك الفعلية − المسموحة − السماح الإضافي، وكل (breakMinPerHour) دقيقة = ساعة
function breakHoursFrom(actualMin, allowedMin, cfg){
  cfg = cfg || timeCfgDefaults;
  const allowed = Number(allowedMin != null ? allowedMin : cfg.breakMin) || 30;
  const grace = Number(cfg.breakGraceMin) || 0;
  const over = Math.max(0, (Number(actualMin)||0) - allowed - grace);
  const per = Number(cfg.breakMinPerHour) || 10;
  return Math.floor(over / per);
}

// ساعات التبديلات: الأول مجاني، واللي بعده بساعاته
function swapHoursFrom(swapCount, cfg){
  cfg = cfg || timeCfgDefaults;
  const free = Number(cfg.swapFreePerMonth) || 0;
  const charged = Math.max(0, (Number(swapCount)||0) - free);
  return charged * (Number(cfg.swapHours) || 0);
}

// تجميع رصيد الشهر وتحويله لأيام خصم
// entries = [{type:'late'|'break'|'swap', hours}]
function monthlyTimeSummary(entries, cfg){
  cfg = cfg || timeCfgDefaults;
  const totalHours = (entries||[]).reduce((x,e)=> x + (Number(e.hours)||0), 0);
  const perDay = Number(cfg.hoursPerDay) || 7;
  let days = Math.floor(totalHours / perDay);
  const cap = Number(cfg.maxDaysPerMonth) || 0;
  const capped = cap > 0 && days > cap;
  if(capped) days = cap;
  return {
    totalHours,
    days,
    remainderHours: totalHours - (days * perDay),
    capped,
    byType: {
      late:  (entries||[]).filter(e=> e.type==='late').reduce((x,e)=> x+(Number(e.hours)||0), 0),
      break: (entries||[]).filter(e=> e.type==='break').reduce((x,e)=> x+(Number(e.hours)||0), 0),
      swap:  (entries||[]).filter(e=> e.type==='swap').reduce((x,e)=> x+(Number(e.hours)||0), 0)
    }
  };
}

// قيمة الخصم بالجنيه = عدد الأيام × قيمة اليوم (المرتب ÷ 30)
function deductionAmount(days, monthlySalary){
  const dayValue = (Number(monthlySalary)||0) / 30;
  return Math.round((Number(days)||0) * dayValue);
}

// 🚪 ساعات الانصراف بدري — نفس منطق التأخير
// clockOutDate = وقت الانصراف الفعلي · shiftEnd = "HH:MM" نهاية شيفته
function earlyLeaveHours(clockOutDate, shiftEnd, cfg){
  cfg = cfg || timeCfgDefaults;
  if(!clockOutDate || !shiftEnd) return { earlyMin: 0, hours: 0 };
  const outMin = clockOutDate.getHours()*60 + clockOutDate.getMinutes();
  const endMin = _hm2min(shiftEnd);
  const earlyMin = Math.max(0, endMin - outMin);
  const per = Number(cfg.earlyMinPerHour) || 10;
  let hours = Math.floor(earlyMin / per);
  const cap = Number(cfg.maxLateHoursPerDay) || 0;
  if(cap > 0 && hours > cap) hours = cap;
  return { earlyMin, hours };
}

// 🚫 ساعات الغياب بدون عذر
function absenceHoursFrom(cfg){
  cfg = cfg || timeCfgDefaults;
  return Number(cfg.absenceHours) || 0;
}

// 🩺 تطبيق العذر: بيصفّر ساعات السجل ويحتفظ بيه للتاريخ
// entry = {type, hours, excused, excuseReason}
function applyExcuse(entry, reason){
  return { ...entry, hours: 0, originalHours: entry.hours, excused: true, excuseReason: reason || 'بعذر' };
}

// ⏰ هل الشيفت محتاج قفل تلقائي؟ (نسي يسجّل انصراف)
function needsAutoClose(shift, nowTs){
  if(!shift || shift.clockOutTs) return false;
  const now = nowTs || Date.now();
  const start = new Date(shift.clockInTs);
  const endOfDay = new Date(start); endOfDay.setHours(23,59,59,999);
  return now > endOfDay.getTime();
}

// ☕ هل البريك محتاج قفل تلقائي؟
function breakNeedsAutoClose(brk, nowTs, cfg){
  cfg = cfg || timeCfgDefaults;
  if(!brk || brk.endTs) return false;
  const now = nowTs || Date.now();
  const limitMin = (Number(cfg.breakMin) || 30) * (Number(cfg.autoCloseBreakMult) || 2);
  return (now - brk.startTs) > limitMin * 60000;
}

// ===== 👥 تغطية الفرع: كام موظف متاح يوم معيّن =====
// بيحسب المتاحين بعد استبعاد: يوم إجازته + الأذونات الموافق عليها
function coverageOnDate(emps, approvedLeaves, dateKey){
  const d = new Date(dateKey + 'T00:00:00');
  const dow = d.getDay();
  const offIds = new Set();
  (approvedLeaves||[]).forEach(l=>{ if(l.dateKey === dateKey && l.status === 'approved') offIds.add(l.empId); });
  const available = (emps||[]).filter(e=>{
    if(e.active === false) return false;
    if(String(e.dayOff) === String(dow)) return false;   // يوم إجازته الأسبوعي
    if(offIds.has(e.id)) return false;                    // إذن موافق عليه
    return true;
  });
  return { available: available.length, names: available.map(e=> e.name) };
}

// هل الطلب ده هيكسر الحد الأدنى للتغطية؟
function checkLeaveRequest(emps, approvedLeaves, dateKey, minStaff){
  const before = coverageOnDate(emps, approvedLeaves, dateKey);
  const after = Math.max(0, before.available - 1);
  const min = Number(minStaff) || 0;
  return {
    availableBefore: before.available,
    availableAfter: after,
    minStaff: min,
    safe: after >= min,
    shortBy: Math.max(0, min - after)
  };
}
// <<< COMPLIANCE_END

// 🔗 تعريض أدوات الالتزام على window (لازم بعد تعريفها) عشان بلوكات السكريبت التانية تستخدمها
window.detectAttendanceIssues = detectAttendanceIssues;
window.pairSwaps = pairSwaps;
window.complianceCfg = complianceCfg;
window.timeCfgDefaults = timeCfgDefaults;
window.timeCfg = timeCfgDefaults;   // ⏳ إعدادات رصيد الوقت (الأدمن بيعدّلها)
window.checkLeaveRequest = checkLeaveRequest;
window.coverageOnDate = coverageOnDate;
window.todayStr = todayStr;

window.currentAnnouncement = '';
window.dailyTarget = 0;
let targetCelebrationShownFor = null; // date string, so we only celebrate once per day
let allCommissionPayments = [], commissionPayments = []; // monthly payment records
let allSalaryPayments = [], salaryPayments = [];
let allTerminations = [], terminations = [];
let allAdvances = [], advances = [];
let pendingTaskPhoto = null;                // File selected before upload
let taskSubmitEmpId = null;

// ---------- BRANCH SETUP (this device's own branch, for the kiosk grid) ----------
window.currentBranch = localStorage.getItem('sales_branch') || '';
function refreshBranchUI(){
  $('#branchTag').textContent = '📍 ' + (window.currentBranch || '—');
  // العنوان يتكيّف مع براند الفرع (Glow / echarpe)
  const _isGlow = /glow/i.test(window.currentBranch || '');
  const _brand = _isGlow ? 'Glow' : 'echarpe';
  const _bt = $('#brandTitle'); if(_bt) _bt.textContent = 'أهلاً فريق ' + _brand + ' 👋';
  const _be = $('#brandEyebrow'); if(_be) _be.textContent = _brand + ' ⭐';
  const u = _auth.currentUser;
  const staffIn = !!(u && !u.isAnonymous);
  if(!window.currentBranch || !staffIn){
    // مرحلتين واضحتين: (1) دخول حساب الفرع → (2) اختيار الفرع
    $('#branchEmail').style.display = staffIn ? 'none' : '';
    $('#branchPass').style.display  = staffIn ? 'none' : '';
    $('#branchSelect').style.display = staffIn ? '' : 'none';
    $('#branchSaveBtn').textContent = staffIn ? 'حفظ الفرع' : 'دخول';
    if(staffIn) populateBranchSetupSelect();
    $('#branchSetup').classList.add('show');
  } else if(!$('#branchSetup').classList.contains('manual-open')){
    $('#branchSetup').classList.remove('show');
  }
}
// قايمة الفروع في شاشة الإعداد — من الموظفين المسجّلين + كاش محلي (لو القراءة مقفولة قبل الدخول)
function populateBranchSetupSelect(){
  const sel = $('#branchSelect'); if(!sel) return;
  // 🏬 بنجمع الفروع من كل المصادر عشان الفرع اللي لسه مالوش موظفين يظهر برضه
  const set = new Set();
  (allEmployees||[]).forEach(e=> e.branch && set.add(e.branch));
  (allShifts||[]).forEach(x=> x.branch && set.add(x.branch));
  (allSettingsDocs||[]).forEach(id=> id && set.add(id));        // كل فرع ليه مستند إعدادات
  (allAdvances||[]).forEach(x=> x.branch && set.add(x.branch));
  if(window.currentBranch) set.add(window.currentBranch);
  // المحفوظ محليًا (آخر قايمة اتشافت) — عشان الأوفلاين
  try{ (JSON.parse(localStorage.getItem('sales_branch_list')||'[]')||[]).forEach(b=> b && set.add(b)); }catch(e){}
  let branches = [...set].filter(Boolean).sort();
  if(branches.length){ try{ localStorage.setItem('sales_branch_list', JSON.stringify(branches)); }catch(e){} }
  const saved = window.currentBranch || '';
  sel.innerHTML = '<option value="">— اختار الفرع —</option>'
    + branches.map(b=> `<option value="${b.replace(/"/g,'&quot;')}" ${b===saved?'selected':''}>${b}</option>`).join('')
    + '<option value="__new__">➕ فرع جديد (اكتب الاسم)...</option>';
  sel.onchange = ()=>{ $('#branchInput').style.display = (sel.value==='__new__') ? 'block' : 'none'; if(sel.value==='__new__') $('#branchInput').focus(); };
  $('#branchInput').style.display = 'none';
}
$('#branchSaveBtn').addEventListener('click', async ()=>{
  const email = ($('#branchEmail').value||'').trim();
  const pass = $('#branchPass').value||'';
  const err = $('#branchErr');
  const u = _auth.currentUser;

  // ===== المرحلة 1: تسجيل الدخول الأول (لو لسه مش داخل) =====
  // القايمة مش بتقدر تتملى قبل الدخول (القواعد بتمنع القراءة) — فالدخول الأول، وبعدها الفروع تظهر
  if(!u || u.isAnonymous){
    if(!email || !pass){ err.textContent='اكتب إيميل وباسورد حساب الفرع الأول'; return; }
    err.textContent = 'جارٍ الدخول...';
    try{
      await signInWithEmailAndPassword(_auth, email, pass);
      // 💾 نحفظ بيانات دخول الفرع محليًا — عشان لو المتصفح مسح الجلسة، نعيد الدخول تلقائي
      try{ localStorage.setItem('sales_dev_cred', btoa(unescape(encodeURIComponent(JSON.stringify({e:email,p:pass}))))); }catch(_e){}
      err.textContent = '✅ تم الدخول — اختار الفرع من القايمة';
      refreshBranchUI();
      setTimeout(populateBranchSetupSelect, 800);
    }catch(e){
      err.textContent = (e && (e.code==='auth/invalid-credential'||e.code==='auth/wrong-password'||e.code==='auth/user-not-found'))
        ? 'الإيميل أو الباسورد غلط' : 'تعذر الدخول: ' + (e.message||e);
    }
    return;
  }

  // ===== المرحلة 2: داخل خلاص — نحفظ الفرع المختار =====
  const selVal = $('#branchSelect') ? $('#branchSelect').value : '';
  const val = (selVal && selVal !== '__new__') ? selVal : $('#branchInput').value.trim();
  if(!val){ err.textContent='اختار الفرع من القايمة'; return; }
  window.currentBranch = val;
  localStorage.setItem('sales_branch', val);
  err.textContent = '';
  $('#branchSetup').classList.remove('manual-open');
  $('#branchSetup').classList.remove('show');
  refreshBranchUI();
  applyBranchFilter();
});
// لو الجلسة انتهت (اتمسحت من المتصفح)، نرجّع لشاشة الإعداد تلقائيًا
// 🔄 إعادة دخول تلقائي: لو المتصفح (زي Brave) مسح الجلسة بس عندنا بيانات محفوظة
let _autoReloginTried = false;
async function _tryAutoRelogin(){
  if(_autoReloginTried) return;
  _autoReloginTried = true;
  try{
    const raw = localStorage.getItem('sales_dev_cred');
    if(!raw) return;
    const { e, p } = JSON.parse(decodeURIComponent(escape(atob(raw))));
    if(e && p){ await signInWithEmailAndPassword(_auth, e, p); }
  }catch(err){ console.warn('auto relogin failed', err && err.code); }
}
onAuthStateChanged(_auth, (u)=>{
  // مش داخل + عندنا بيانات محفوظة → نجرّب نعيد الدخول لوحدنا قبل ما نزعّج الموظف
  if((!u || u.isAnonymous) && localStorage.getItem('sales_dev_cred') && !_autoReloginTried){
    _tryAutoRelogin().then(()=> refreshBranchUI());
  }else{
    refreshBranchUI();
  }
});
$('#changeBranchBtn').addEventListener('click', ()=>{
  $('#admin').classList.remove('show');
  $('#branchErr').textContent = '';
  $('#branchInput').value = '';
  const u = _auth.currentUser;
  const staffIn = !!(u && !u.isAnonymous);
  // لو داخل بحساب الفرع بالفعل → علطول لاختيار الفرع (نملّي القايمة).
  // لو مش داخل → الشاشة هتطلب الإيميل والباسورد الأول.
  $('#branchEmail').style.display = staffIn ? 'none' : '';
  $('#branchPass').style.display  = staffIn ? 'none' : '';
  $('#branchSelect').style.display = staffIn ? '' : 'none';
  $('#branchSaveBtn').textContent = staffIn ? 'حفظ الفرع' : 'دخول';
  if(staffIn) populateBranchSetupSelect();
  $('#branchSetup').classList.add('manual-open');
  $('#branchSetup').classList.add('show');
});
refreshBranchUI();

// ---------- VIEW BRANCH (for remote review — any device can pick any branch) ----------
let viewBranch = '__ALL__';
function reviewEmployeesFor(branch){
  if(branch === '__ALL__') return allEmployees;
  const norm = (x)=> String(x||'').trim();
  const target = norm(branch);
  return allEmployees.filter(e => norm(e.branch) === target);
}
function populateBranchSelect(sel){
  const branches = [...new Set(allEmployees.map(e=>String(e.branch||'').trim()).filter(Boolean))].sort();
  const prevValue = sel.value || viewBranch;
  sel.innerHTML = '<option value="__ALL__">كل الفروع</option>' +
    branches.map(b=>`<option value="${b}">${b}</option>`).join('');
  sel.value = branches.includes(prevValue) || prevValue === '__ALL__' ? prevValue : '__ALL__';
}
function populateBranchDropdowns(){
  populateBranchSelect($('#adminBranchSelect'));
}
$('#adminBranchSelect').addEventListener('change', (e)=>{
  viewBranch = e.target.value;
  renderAdminList();
  renderLog();
  renderPerformanceLink();
  renderStaffOverview();
  renderScheduleList();
  renderTaskAssignList();
  renderPendingSubmissions();
  renderConfirmedSubmissions();
  renderRewardsList();
  renderAttendanceHistory();
  renderWeeklyAggregate();
  renderPerfHistory();
  renderFullReport();
  renderCommissionPanel();
  renderCommissionPaymentLog();
  renderSalaryPanel();
  renderSalaryPaymentLog();
  renderTerminationPanel();
  renderTerminationLog();
  renderAdvancesLog();
});

function applyBranchFilter(){
  window.employees = allEmployees.filter(e => e.branch === window.currentBranch && e.active !== false);
  shifts = allShifts.filter(s => s.branch === window.currentBranch);
  tasks = allTasks.filter(t => t.branch === window.currentBranch);
  submissions = allSubmissions.filter(s => s.branch === window.currentBranch);
  rewards = allRewards.filter(r => r.branch === window.currentBranch);
  commissionPayments = allCommissionPayments.filter(p => p.branch === window.currentBranch);
  salaryPayments = allSalaryPayments.filter(p => p.branch === window.currentBranch);
  terminations = allTerminations.filter(t => t.branch === window.currentBranch);
  advances = allAdvances.filter(a => a.branch === window.currentBranch);
  deductions = allDeductions.filter(a => a.branch === window.currentBranch);
  window.deductions = deductions;
  renderEmpGrid();
  renderTodayAdvancesSummary();
  renderAnnouncementBanner();
  renderDailyTargetCard();
  updateGearBadge();
  populateBranchDropdowns();
  checkAndAwardRewards();
  if(!rewardToastLock){
    rewardToastLock = true;
    setTimeout(()=>{ showUnseenRewardsIfAny(); rewardToastLock = false; }, 800);
  }
  if(adminUnlocked){
    renderAdminList(); renderLog(); renderPerformanceLink();
    renderStaffOverview(); renderScheduleList(); renderTaskAssignList();
    renderPendingSubmissions(); renderConfirmedSubmissions(); renderRewardsList(); renderAttendanceHistory(); renderWeeklyAggregate(); renderPerfHistory(); renderFullReport();
    renderCommissionPanel(); renderCommissionPaymentLog(); renderSalaryPanel(); renderSalaryPaymentLog(); renderTerminationPanel(); renderTerminationLog(); renderAdvancesLog();
  }
  if($('#leaderboard').classList.contains('show')) renderLeaderboard();
  if($('#attendance').classList.contains('show')) renderAttendanceLists();
}
let rewardToastLock = false;

function initials(name){
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

// 🎭 نافذة اختيار الشكل — بتتبني في اللحظة (مفيش HTML إضافي)
function openAvatarPicker(empId){
  const emp = (window.employees||[]).find(e=> e.id === empId);
  if(!emp) return;
  document.getElementById('avPickOverlay')?.remove();
  const ov = document.createElement('div');
  ov.id = 'avPickOverlay';
  ov.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,.72);'
                   + 'display:flex; align-items:center; justify-content:center; padding:18px;';
  const cur = emp.avatarEmoji || '';
  ov.innerHTML = `
    <div style="background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:18px;
                max-width:360px; width:100%; max-height:82vh; overflow:auto;">
      <h3 style="margin:0 0 4px; font-size:16px;">🎭 اختار شكلك</h3>
      <p style="color:var(--sub); font-size:12px; margin:0 0 14px;">الشكل ده هيظهر لزمايلك في شاشة الحضور وشاشة دخول الكاشير.</p>
      <div id="avPickGrid" style="display:grid; grid-template-columns:repeat(6,1fr); gap:8px;">
        ${AVATAR_CHOICES.map(a=>`
          <button data-av="${a}" style="font-size:24px; padding:8px 0; cursor:pointer; border-radius:10px;
            background:${a===cur?'var(--gold-dim)':'var(--panel2)'}; border:1px solid ${a===cur?'var(--gold)':'var(--line)'};">${a}</button>`).join('')}
      </div>
      <div style="display:flex; gap:8px; margin-top:16px;">
        <button id="avPickClear" style="flex:1; padding:10px; border-radius:10px; background:var(--panel2);
          border:1px solid var(--line); color:var(--sub); font-family:'Cairo'; font-weight:700; cursor:pointer;">الحروف الأولى</button>
        <button id="avPickClose" style="flex:1; padding:10px; border-radius:10px; background:var(--panel2);
          border:1px solid var(--line); color:var(--ink); font-family:'Cairo'; font-weight:700; cursor:pointer;">إغلاق</button>
      </div>
      <div id="avPickErr" style="color:var(--bad); font-size:12px; margin-top:8px;"></div>
    </div>`;
  document.body.appendChild(ov);
  const close = ()=> ov.remove();
  ov.addEventListener('click', (ev)=>{ if(ev.target === ov) close(); });
  ov.querySelector('#avPickClose').addEventListener('click', close);
  async function save(val){
    try{
      await updateDoc(doc(db,'sales_employees', empId), { avatarEmoji: val });
      emp.avatarEmoji = val;                        // تحديث فوري قبل ما الـ snapshot يرجع
      const av = document.getElementById('dh_avatar');
      if(av) av.textContent = avatarOf(emp);
      try{ renderAttendanceLists(); }catch(e){}
      close();
    }catch(err){
      const box = ov.querySelector('#avPickErr');
      if(box) box.textContent = 'تعذر الحفظ: ' + (err && err.code ? err.code : 'خطأ غير معروف');
    }
  }
  ov.querySelectorAll('[data-av]').forEach(b=> b.addEventListener('click', ()=> save(b.dataset.av)));
  ov.querySelector('#avPickClear').addEventListener('click', ()=> save(''));
}
window.openAvatarPicker = openAvatarPicker;

// ===== 🎭 الأفاتارات: الموظف بيختار شكله بنفسه =====
// إيموجي بس — مفيش رفع صور (مفيش تكلفة تخزين ولا مراجعة محتوى)
const AVATAR_CHOICES = [
  '🌸','🌺','🌻','🌷','🦋','🐱','🐰','🦊',
  '🐼','🦄','⭐','🌙','☀️','🍓','🍒','🧁',
  '💎','👑','🎀','🪷','🕊️','🐬','🌈','✨'
];
// شكل الموظف: اختياره لو موجود، وإلا أول حرفين من اسمه
function avatarOf(emp){
  return (emp && emp.avatarEmoji) ? emp.avatarEmoji : initials((emp && emp.name) || '');
}
window.AVATAR_CHOICES = AVATAR_CHOICES;
window.avatarOf = avatarOf;

onSnapshot(empCol, (snap)=>{
  allEmployees = snap.docs.map(d=>({id:d.id, ...d.data()})).filter(e=> !e.isAdminAccount);
  window.allEmployeesAll = allEmployees;   // 👑 حساب الأدمن العام مش موظف HR
  applyBranchFilter();
  if($('#branchSetup').classList.contains('show')) populateBranchSetupSelect();   // الشاشة مفتوحة؟ حدّث القايمة
}, (err)=> console.error('window.employees sync error', err));

window.staffOrders = [];
onSnapshot(staffOrdersCol, (snap)=>{
  window.staffOrders = snap.docs.map(d=> ({id:d.id, ...d.data()}));
  if(typeof renderTodayStaffOrders==='function') renderTodayStaffOrders();
  if(typeof renderStaffOrdersPanel==='function') renderStaffOrdersPanel();
});
window.appReferrals = [];
onSnapshot(referralsCol, (snap)=>{
  window.appReferrals = snap.docs.map(d=> ({id:d.id, ...d.data()}));
  if(typeof renderCommissionPanel==='function') renderCommissionPanel();
  if(typeof renderReferralPanel==='function') renderReferralPanel();
});
onSnapshot(pointsCol, (snap)=>{
  window.points = snap.docs.map(d=>({id:d.id, ...d.data()}));
  renderEmpGrid();
  renderDailyTargetCard();
  if($('#leaderboard').classList.contains('show')) renderLeaderboard();
  if(adminUnlocked){ renderLog(); renderPerformanceLink(); }
}, (err)=> console.error('points sync error', err));

onSnapshot(entriesCol, (snap)=>{
  allFeedback = snap.docs.map(d=>({id:d.id, ...d.data()}));
  if(adminUnlocked) renderPerformanceLink();
}, (err)=> console.error('feedback sync error', err));

onSnapshot(shiftsCol, (snap)=>{
  allShifts = snap.docs.map(d=>({id:d.id, ...d.data()}));
  window.allShifts = allShifts;
  applyBranchFilter();
}, (err)=> console.error('shifts sync error', err));

onSnapshot(tasksCol, (snap)=>{
  allTasks = snap.docs.map(d=>({id:d.id, ...d.data()}));
  applyBranchFilter();
}, (err)=> console.error('tasks sync error', err));

onSnapshot(submissionsCol, (snap)=>{
  allSubmissions = snap.docs.map(d=>({id:d.id, ...d.data()}));
  applyBranchFilter();
}, (err)=> console.error('submissions sync error', err));

onSnapshot(rewardsCol, (snap)=>{
  allRewards = snap.docs.map(d=>({id:d.id, ...d.data()}));
  applyBranchFilter();
}, (err)=> console.error('rewards sync error', err));

onSnapshot(settingsCol, (snap)=>{
  allSettingsDocs = snap.docs.map(d=> d.id);   // 🏬 كل مستند إعدادات = فرع موجود
  window.allSettingsDocs = allSettingsDocs;
  const branchDoc = snap.docs.find(d=> d.id === window.currentBranch);
  const data = branchDoc ? branchDoc.data() : {};
  commissionPerPoint = data.commissionPerPoint || 0;
  window.currentAnnouncement = data.announcement || '';
  window.dailyTarget = data.dailyTarget || 0;
  // 🧭 تحميل إعدادات الالتزام لو الأدمن عدّلها للفرع ده (مع الإبقاء على الافتراضي)
  // 🙋 حالة إظهار زر تسجيل موظف جديد (افتراضي: مخفي)
  window.regButtonOn = !!(data.regButtonOn);
  window.applyRegButtonVisibility();
  if(data.compliance){
    if(data.compliance.penalty != null) complianceCfg.penalty = data.compliance.penalty;
    if(data.compliance.lateGraceMin != null) complianceCfg.lateGraceMin = data.compliance.lateGraceMin;
    if(data.compliance.weights) complianceCfg.weights = { ...complianceCfg.weights, ...data.compliance.weights };
    if(data.compliance.shifts) complianceCfg.shifts = { ...complianceCfg.shifts, ...data.compliance.shifts };
  }
  // ⏳ تحميل إعدادات رصيد الوقت لو الأدمن عدّلها
  if(data.timeCfg){
    window.timeCfg = { ...timeCfgDefaults, ...data.timeCfg };
  }
  renderAnnouncementBanner();
  renderDailyTargetCard();
  if(adminUnlocked){ renderCommissionPanel(); renderAdminSettingsForm(); window.renderComplianceSettingsForm(); try{ window.renderTimeSettings(); }catch(e){} }
}, (err)=> console.error('settings sync error', err));

onSnapshot(vioReviewCol, (snap)=>{
  allVioReviews = snap.docs.map(d=>({id:d.id, ...d.data()}));
  if(adminUnlocked && typeof renderViolationsReview==='function') renderViolationsReview();
}, (e)=> console.warn('vio reviews sync', e && e.code));

onSnapshot(attDecisionsCol, (snap)=>{
  allAttDecisions = snap.docs.map(d=>({id:d.id, ...d.data()}));
  window.allAttDecisions = allAttDecisions;
  if(adminUnlocked && typeof renderAttIssues==='function') window.renderAttIssues();
}, (e)=> console.warn('att decisions sync', e && e.code));

onSnapshot(breaksCol, (snap)=>{
  allBreaks = snap.docs.map(d=>({id:d.id, ...d.data()}));
  window.allBreaks = allBreaks;
  autoCloseStaleBreaks();
  renderAttendanceLists();
}, (e)=> console.warn('breaks sync', e && e.code));

onSnapshot(leaveReqCol, (snap)=>{
  allLeaveReqs = snap.docs.map(d=>({id:d.id, ...d.data()}));
  window.allLeaveReqs = allLeaveReqs;
  if(adminUnlocked && typeof window.renderLeaveRequests==='function'){ try{ window.renderLeaveRequests(); }catch(e){} }
  if(typeof updateLeaveBadge==='function'){ try{ updateLeaveBadge(); }catch(e){} }
}, (e)=> console.warn('leave sync', e && e.code));

onSnapshot(timeCreditCol, (snap)=>{
  allTimeCredit = snap.docs.map(d=>({id:d.id, ...d.data()}));
  window.allTimeCredit = allTimeCredit;
  if(adminUnlocked && typeof window.renderTimeCreditLog==='function'){ try{ window.renderTimeCreditLog(); }catch(e){} }
}, (e)=> console.warn('time credit sync', e && e.code));

onSnapshot(deductionsCol, (snap)=>{
  allDeductions = snap.docs.map(d=>({id:d.id, ...d.data()}));
  deductions = allDeductions.filter(x=> x.branch === window.currentBranch);
  window.deductions = deductions;
  if(adminUnlocked && typeof renderDeductionsLog==='function') window.renderDeductionsLog();
}, (e)=> console.warn('deductions sync', e && e.code));

onSnapshot(commissionPaymentsCol, (snap)=>{
  allCommissionPayments = snap.docs.map(d=>({id:d.id, ...d.data()}));
  commissionPayments = allCommissionPayments.filter(p=> p.branch === window.currentBranch);
  if(adminUnlocked) renderCommissionPanel();
}, (err)=> console.error('commission payments sync error', err));

onSnapshot(salaryPaymentsCol, (snap)=>{
  allSalaryPayments = snap.docs.map(d=>({id:d.id, ...d.data()}));
  salaryPayments = allSalaryPayments.filter(p=> p.branch === window.currentBranch);
  if(adminUnlocked){ renderSalaryPanel(); renderSalaryPaymentLog(); }
}, (err)=> console.error('salary payments sync error', err));

onSnapshot(terminationsCol, (snap)=>{
  allTerminations = snap.docs.map(d=>({id:d.id, ...d.data()}));
  terminations = allTerminations.filter(t=> t.branch === window.currentBranch);
  if(adminUnlocked){ renderTerminationPanel(); renderTerminationLog(); }
}, (err)=> console.error('terminations sync error', err));

onSnapshot(advancesCol, (snap)=>{
  allAdvances = snap.docs.map(d=>({id:d.id, ...d.data()}));
  window.allAdvancesAll = allAdvances;
  advances = allAdvances.filter(a=> a.branch === window.currentBranch);
  renderTodayAdvancesSummary();
  if(adminUnlocked){ renderSalaryPanel(); renderAdvancesLog(); }
}, (err)=> console.error('advances sync error', err));

function renderLog(){
  const wrap = $('#logList');
  const branchEmps = reviewEmployeesFor(viewBranch);
  const branchEmpIds = new Set(branchEmps.map(e=>e.id));
  const branchPoints = window.points.filter(p=> branchEmpIds.has(p.employeeId)).sort((a,b)=> b.ts - a.ts);
  if(branchPoints.length === 0){
    wrap.innerHTML = '<div class="empty">لسه مفيش عمليات مسجلة</div>';
    return;
  }

  // Group by calendar day (local time), newest first.
  const byDay = new Map();
  branchPoints.forEach(p=>{
    const d = new Date(p.ts);
    const key = d.toLocaleDateString('ar-EG', {day:'2-digit', month:'2-digit', year:'numeric'});
    if(!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(p);
  });
  const dayKeys = Array.from(byDay.keys()).slice(0, 60); // cap rendered history to the last 60 days

  wrap.innerHTML = dayKeys.map(dayKey=>{
    const dayPoints = byDay.get(dayKey);
    const rows = dayPoints.map(p=>{
      const time = new Date(p.ts).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'});
      const emp = allEmployees.find(e=>e.id===p.employeeId);
      return `<tr>
        <td>${time}</td>
        <td>${p.employeeName || ''}</td>
        <td>${emp?.branch || '—'}</td>
        <td>${p.invoiceNumber || '—'}</td>
        <td><button data-id="${p.id}">حذف</button></td>
      </tr>`;
    }).join('');
    return `
    <div class="dayLogGroup">
      <div class="dayLogHead" data-day="${dayKey}">
        <span>${dayKey}</span>
        <span style="color:var(--gold);">${dayPoints.length} عملية <span class="chev">▾</span></span>
      </div>
      <div class="dayLogBody">
        <table class="logTable"><thead><tr><th>الوقت</th><th>الموظف</th><th>الفرع</th><th>رقم الفاتورة</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('.dayLogHead').forEach(head=>{
    head.addEventListener('click', ()=>{
      const body = head.nextElementSibling;
      const isOpen = body.classList.contains('open');
      body.classList.toggle('open', !isOpen);
      head.classList.toggle('open', !isOpen);
    });
  });
  wrap.querySelectorAll('button[data-id]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('متأكد إنك عايز تحذف العملية دي؟')) return;
      try{ await deleteDoc(doc(db,'sales_points', btn.dataset.id)); }
      catch(err){ console.error('تعذر الحذف', err); }
    });
  });
}

$('#exportPointsCsvBtn')?.addEventListener('click', ()=>{
  const branchEmps = reviewEmployeesFor(viewBranch);
  const branchEmpIds = new Set(branchEmps.map(e=>e.id));
  const branchPoints = window.points.filter(p=> branchEmpIds.has(p.employeeId)).sort((a,b)=> b.ts - a.ts);
  if(branchPoints.length === 0){ alert('لا توجد بيانات للتصدير'); return; }
  let csv = 'التاريخ,الوقت,الموظف,الفرع,رقم الفاتورة\n';
  branchPoints.forEach(p=>{
    const d = new Date(p.ts);
    const emp = allEmployees.find(e=>e.id===p.employeeId);
    csv += `"${d.toLocaleDateString('ar-EG')}","${d.toLocaleTimeString('ar-EG')}","${p.employeeName||''}","${emp?.branch||'—'}","${p.invoiceNumber||'—'}"\n`;
  });
  const blob = new Blob(["\ufeff"+csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'points-log-' + (viewBranch==='__ALL__'?'all-branches':viewBranch) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
});

const RATING_LABELS = {
  1:{label:'مضايقني جدًا', emoji:'😠'},
  2:{label:'مش عاجبني', emoji:'🙁'},
  3:{label:'كويس', emoji:'🙂'},
  4:{label:'عجبني جدًا', emoji:'😄'},
};
const MATCH_WINDOW_MS = 2 * 60 * 1000; // only match feedback within 2 minutes before/after the sale

function renderPerformanceLink(){
  const wrap = $('#perfList');
  const branchEmps = reviewEmployeesFor(viewBranch);
  const branchEmpIds = new Set(branchEmps.map(e=>e.id));
  const branchPoints = window.points.filter(p=> branchEmpIds.has(p.employeeId)).sort((a,b)=> a.ts - b.ts);

  const branchNames = viewBranch === '__ALL__'
    ? new Set(branchEmps.map(e=> e.branch))
    : new Set([viewBranch]);
  const branchFeedback = allFeedback.filter(f=> branchNames.has(f.branch)).sort((a,b)=> a.ts - b.ts);

  if(branchPoints.length === 0){
    wrap.innerHTML = '<div class="empty">لسه مفيش عمليات بيع مسجلة</div>';
    return;
  }

  // Greedy nearest-match: each feedback entry can only be matched once,
  // to the closest-in-time sale — whether the feedback came shortly before
  // or shortly after the sale — within the allowed window.
  const usedFeedback = new Set();
  const matched = branchPoints.slice().sort((a,b)=> b.ts - a.ts).map(p=>{
    let bestIdx = -1, bestAbsDelta = Infinity, bestDelta = 0;
    for(let i=0;i<branchFeedback.length;i++){
      if(usedFeedback.has(i)) continue;
      const delta = branchFeedback[i].ts - p.ts; // positive = feedback after sale, negative = before
      const absDelta = Math.abs(delta);
      if(absDelta <= MATCH_WINDOW_MS && absDelta < bestAbsDelta){
        bestAbsDelta = absDelta; bestDelta = delta; bestIdx = i;
      }
    }
    let fb = null, minutesDiff = null, direction = null;
    if(bestIdx >= 0){
      fb = branchFeedback[bestIdx];
      usedFeedback.add(bestIdx);
      minutesDiff = Math.round(bestAbsDelta/60000);
      direction = bestDelta >= 0 ? 'بعد' : 'قبل';
    }
    return { point: p, feedback: fb, minutesDiff, direction };
  }).slice(0, 100);

  const rows = matched.map(({point, feedback, minutesDiff, direction})=>{
    const d = new Date(point.ts);
    const time = d.toLocaleString('ar-EG', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    let ratingCell = '<span class="ratingBadge none">مفيش تقييم قريب</span>';
    if(feedback){
      const r = RATING_LABELS[feedback.r];
      ratingCell = `<span class="ratingBadge r${feedback.r}">${r.emoji} ${r.label}</span> <span style="color:var(--sub); font-size:10px;">(${direction} ${minutesDiff} د)</span>`;
    }
    return `<tr>
      <td>${time}</td>
      <td>${point.employeeName || ''}</td>
      <td>${point.invoiceNumber || '—'}</td>
      <td>${ratingCell}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table class="logTable"><thead><tr><th>وقت البيع</th><th>الموظف</th><th>الفاتورة</th><th>تقييم العميل (تقريبي)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ==================== ATTENDANCE / TASKS / REWARDS ====================
function todayStr(d){
  const dt = d ? new Date(d) : new Date();
  return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
}
function getOpenShift(empId){
  return allShifts.find(s=> s.employeeId === empId && !s.clockOutTs);
}
function isClockedIn(empId){
  return !!getOpenShift(empId);
}
function getTodaysSubmission(empId){
  const today = todayStr();
  return allSubmissions.find(s=> s.employeeId === empId && s.date === today);
}
function getCurrentTask(empId){
  return allTasks.find(t=> t.employeeId === empId);
}
function formatDuration(ms){
  const totalMin = Math.floor(ms/60000);
  const h = Math.floor(totalMin/60), m = totalMin%60;
  return h > 0 ? `${h} س ${m} د` : `${m} دقيقة`;
}

// ---------- ATTENDANCE SCREEN ----------
$('#openAttendance').addEventListener('click', ()=>{
  requestFullscreenOnce();
  $('#attendance').classList.add('show');
  renderAttendanceLists();
});
$('#closeAttendance').addEventListener('click', ()=> $('#attendance').classList.remove('show'));

function isDayOffToday(emp){
  if(emp.dayOff === undefined || emp.dayOff === null || emp.dayOff === '') return false;
  return new Date().getDay() === Number(emp.dayOff);
}
function isDayOffTomorrow(emp){
  if(emp.dayOff === undefined || emp.dayOff === null || emp.dayOff === '') return false;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  return tomorrow.getDay() === Number(emp.dayOff);
}

// 📅 ملخّص يوم الموظف (من شاشة الحضور) — حضوره، نقاطه، وزر الانصراف
window.openDaySummary = function(empId){
  const emp = window.employees.find(e=> e.id === empId); if(!emp) return;
  const shift = getOpenShift(empId);
  const body = document.querySelector('#dsBody'); if(!body) return;
  window._dsEmpId = empId;

  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  const pts = countsFor(empId, dayStart.getTime());
  const inTs = shift ? shift.clockInTs : null;
  const inTxt = inTs ? new Date(inTs).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}) : '—';
  const lateMin = shift ? (shift.lateMinutes||0) : 0;
  const penalized = shift ? !!shift.latePenalized : false;
  const dur = inTs ? formatDuration(Date.now() - inTs) : '—';

  // حالة الحضور: في الميعاد / تأخير بسيط / تأخير عليه خصم
  let attCard;
  if(!inTs){
    attCard = `<div class="dhRow"><span class="lbl">الحضور</span><span>لسه</span></div>`;
  } else if(lateMin === 0){
    attCard = `<div style="background:linear-gradient(180deg,#16241c,var(--panel)); border:1px solid #2e5a42; border-radius:13px; padding:13px; text-align:center;">
      <div style="font-size:15px; font-weight:800; color:#5ec88a;">جيت في ميعادك ✅</div>
      <div style="font-size:12px; color:var(--sub); margin-top:3px;">سجّلت حضور ${inTxt}</div></div>`;
  } else if(!penalized){
    attCard = `<div style="background:var(--panel2); border:1px solid var(--line); border-radius:13px; padding:13px; text-align:center;">
      <div style="font-size:15px; font-weight:800;">اتأخرت ${lateMin} دقيقة</div>
      <div style="font-size:12px; color:var(--sub); margin-top:3px;">لسه في حدود السماح (${complianceCfg.lateGraceMin} دقيقة) — مفيش خصم</div></div>`;
  } else {
    attCard = `<div style="background:linear-gradient(180deg,#2a1a18,var(--panel)); border:1px solid #5a3a3a; border-radius:13px; padding:13px; text-align:center;">
      <div style="font-size:15px; font-weight:800; color:#e0796b;">اتأخرت ${lateMin} دقيقة</div>
      <div style="font-size:12px; color:var(--sub); margin-top:3px;">اتسجّل خصم ${complianceCfg.penalty} ج.م — حاول تعوّضها بكرة</div></div>`;
  }

  // رسالة عن النقاط
  let ptsMsg;
  if(pts === 0) ptsMsg = 'لسه مسجّلتش نقط النهاردة.';
  else if(pts < 5) ptsMsg = 'بداية كويسة، كمّل.';
  else if(pts < 10) ptsMsg = 'شغل محترم النهاردة.';
  else ptsMsg = 'يوم قوي — أداء ممتاز.';

  body.innerHTML = `
    <div style="text-align:center; margin-bottom:16px;">
      <div class="dhAvatar" style="margin:0 auto 8px;">${initials(emp.name)}</div>
      <h3 style="margin:0;">${emp.name}</h3>
      <p class="sub" style="margin:3px 0 0; font-size:12px;">ملخّص يومك</p>
    </div>

    ${attCard}

    <div style="display:flex; gap:9px; margin-top:12px;">
      <div style="flex:1; background:var(--panel2); border:1px solid var(--line); border-radius:13px; padding:13px; text-align:center;">
        <div style="font-size:22px; font-weight:900; color:var(--gold);">${pts}</div>
        <div style="font-size:11px; color:var(--sub); margin-top:2px;">نقط النهاردة</div>
      </div>
      <div style="flex:1; background:var(--panel2); border:1px solid var(--line); border-radius:13px; padding:13px; text-align:center;">
        <div style="font-size:16px; font-weight:900;">${dur}</div>
        <div style="font-size:11px; color:var(--sub); margin-top:2px;">مدة الشيفت</div>
      </div>
    </div>

    <p style="text-align:center; color:var(--sub); font-size:12.5px; margin:14px 0 0;">${ptsMsg}</p>
    <p style="text-align:center; color:var(--sub); font-size:11.5px; margin:6px 0 0;">النقط بتتجمّع على طول الشهر وبتدخل في حساب مكافأتك.</p>

    <button onclick="daySummaryClockOut()" style="width:100%; margin-top:18px; display:flex; align-items:center; justify-content:center; gap:10px; padding:15px; border:none; border-radius:14px; background:linear-gradient(135deg,#ff6b6b,#e0484d); color:#fff; font-family:'Cairo'; font-weight:800; font-size:15.5px; cursor:pointer; box-shadow:0 6px 18px rgba(224,72,77,.35); transition:transform .12s;" onmousedown="this.style.transform='translateY(2px)'" onmouseup="this.style.transform='translateY(0)'">
      <span style="display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; background:rgba(255,255,255,.22); border-radius:9px; font-size:16px;">🏃</span>
      <span>تسجيل الانصراف</span>
      <span style="font-size:18px; opacity:.85;">←</span>
    </button>
    <button class="cancelBtn" onclick="closeDaySummary()" style="width:100%; margin-top:10px; padding:13px; border-radius:12px;">رجوع</button>
  `;
  document.querySelector('#daySummaryOverlay').classList.add('show');
};
window.closeDaySummary = function(){
  const ov = document.querySelector('#daySummaryOverlay'); if(ov) ov.classList.remove('show');
};
window.daySummaryClockOut = function(){
  const id = window._dsEmpId; if(!id) return;
  window.closeDaySummary();
  promptAttPin('out', id);
};

function renderBreakBanner(){
  const host = document.querySelector('#breakBanner');
  if(!host) return;
  const active = (typeof activeBreaks==='function') ? activeBreaks() : [];
  if(!active.length){ host.style.display='none'; host.innerHTML=''; return; }
  const cfg = window.timeCfg || (typeof timeCfgDefaults!=='undefined'?timeCfgDefaults:{breakMin:30});
  host.style.display='block';
  host.innerHTML = active.map(b=>{
    const el = Math.round((Date.now()-b.startTs)/60000);
    const left = Math.max(0, (cfg.breakMin||30) - el);
    return `<div style="display:flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(180deg,#2a2410,var(--panel2)); border:1px solid var(--gold-dim); border-radius:11px; padding:9px 14px; font-size:12.5px; font-weight:700;">
      <span>☕ ${b.employeeName} في بريك</span>
      <span style="color:var(--gold);">${left>0?('باقي '+left+' د'):'المدة خلصت'}</span>
    </div>`;
  }).join('');
}

setInterval(()=>{ try{ renderBreakBanner(); }catch(e){} }, 30000);
function renderAttendanceLists(){
  renderBreakBanner();
  const notIn = window.employees.filter(e=> !isClockedIn(e.id));
  const clockedIn = window.employees.filter(e=> isClockedIn(e.id));

  const notInWrap = $('#notInGrid');
  notInWrap.innerHTML = notIn.length ? notIn.map(e=>{
    let subText = e.scheduledStartTime ? 'ميعادك '+e.scheduledStartTime : 'دوس للحضور';
    let reminderBadge = '';
    if(isDayOffToday(e)){ subText = '🏖️ النهاردة إجازتك'; }
    else if(isDayOffTomorrow(e)){ reminderBadge = '<div class="dayOffReminder">🔔 بكرة إجازتك</div>'; }
    return `
    <div class="attCard" data-act="in" data-id="${e.id}">
      ${reminderBadge}
      <div class="av">${avatarOf(e)}</div>
      <div class="n">${e.name}</div>
      <div class="t">${subText}</div>
    </div>`;
  }).join('') : '<div class="empty">كل الموظفين حاضرين</div>';

  const inWrap = $('#clockedInGrid');
  inWrap.innerHTML = clockedIn.length ? clockedIn.map(e=>{
    const shift = getOpenShift(e.id);
    const late = shift && shift.lateMinutes > 0;

    // Anything that still needs the employee's (or admin's) action shows as a
    // small badge on their tile until it's resolved: task not yet submitted
    // today, submitted but rejected (needs a reshoot), or an unseen reward
    // waiting to be celebrated.
    const sub = getTodaysSubmission(e.id);
    const hasTask = !!getCurrentTask(e.id);
    const hasUnseenReward = rewards.some(r=> r.employeeId===e.id && !r.seen);
    let badge = '';
    if(hasUnseenReward) badge = '🎁';
    else if(sub && sub.rejected) badge = '❗';
    else if(!sub && hasTask) badge = '📸';

    return `
    <div class="attCard present${late?' late':''}" data-act="hub" data-id="${e.id}">
      ${badge ? `<div class="pendingBadge">${badge}</div>` : ''}
      ${late ? `<div class="lateTag">متأخر ${shift.lateMinutes}د</div>` : ''}
      <div class="av">${avatarOf(e)}</div>
      <div class="n">${e.name}</div>
      <div class="t">${formatDuration(Date.now() - shift.clockInTs)}</div>
    </div>`;
  }).join('') : '<div class="empty">محدش حاضر دلوقتي</div>';

  notInWrap.querySelectorAll('.attCard').forEach(card=>{
    card.addEventListener('click', ()=> promptAttPin('in', card.dataset.id));
  });
  inWrap.querySelectorAll('.attCard').forEach(card=>{
    card.addEventListener('click', ()=> openDaySummary(card.dataset.id));
  });
}

const LATE_GRACE_MINUTES = 10; // no penalty within this window around the scheduled time
const SEVERE_LATE_MINUTES = 20; // being later than this even once disqualifies the reward for that period
// ===== ☕ نظام البريك =====
// بريك النهاردة لموظف
function todaysBreak(empId){
  const ds = todayStr();
  return (allBreaks||[]).find(b=> b.employeeId===empId && b.dateKey===ds && b.branch===window.currentBranch);
}
// مين في بريك دلوقتي (مفتوح)
function activeBreaks(){
  return (allBreaks||[]).filter(b=> !b.endTs && b.branch===window.currentBranch && b.dateKey===todayStr());
}
// هل الوقت مسموح فيه بريك؟ (الأدمن بيحدد فترات الحظر)
function breakTimeAllowed(cfg){
  cfg = cfg || (window.timeCfg||timeCfgDefaults);
  const blocked = cfg.breakBlockedRanges || [];   // [{from:'18:00', to:'21:00'}]
  const now = new Date(); const nowMin = now.getHours()*60 + now.getMinutes();
  for(const r of blocked){
    const f = _hm2min(r.from), t = _hm2min(r.to);
    if(nowMin >= f && nowMin < t) return { allowed:false, until:r.to };
  }
  return { allowed:true };
}

// بداية البريك — بعد الـPIN والصورة
async function startBreak(empId, photoDataUri){
  const emp = window.employees.find(e=> e.id===empId); if(!emp) return;
  const cfg = window.timeCfg || timeCfgDefaults;
  // لازم يكون مسجّل حضور
  if(!isClockedIn(empId)){ alert('لازم تسجّل حضور الأول قبل ما تطلع بريك'); return; }
  // أخد بريك النهاردة قبل كده؟
  const prev = todaysBreak(empId);
  if(prev){ alert('انت خدت بريك النهاردة خلاص'); return; }
  // فيه حد بره دلوقتي؟ (منع التزامن)
  const active = activeBreaks();
  const maxOnBreak = Number(cfg.maxOnBreak) || 1;
  if(active.length >= maxOnBreak){
    const names = active.map(b=> b.employeeName).join('، ');
    alert('مينفعش دلوقتي — ' + names + ' لسه في بريك. استنى لما يرجع.');
    return;
  }
  // الوقت مسموح؟
  const timeChk = breakTimeAllowed(cfg);
  if(!timeChk.allowed){ alert('البريك مش مسموح دلوقتي (وقت الزحمة). حاول بعد ' + timeChk.until); return; }
  try{
    await window.fbAddDoc(breaksCol, {
      employeeId: empId, employeeName: emp.name, branch: window.currentBranch,
      dateKey: todayStr(), startTs: Date.now(), endTs: null,
      startPhoto: photoDataUri || null
    });
  }catch(e){ alert('تعذر بدء البريك: ' + e.message); }
}

// نهاية البريك
async function endBreak(empId, photoDataUri){
  const brk = todaysBreak(empId);
  if(!brk || brk.endTs){ alert('مفيش بريك مفتوح'); return; }
  const cfg = window.timeCfg || timeCfgDefaults;
  const durMin = Math.round((Date.now() - brk.startTs) / 60000);
  const overHours = breakHoursFrom(durMin, cfg.breakMin, cfg);
  try{
    await window.fbUpdateDoc(window.fbDoc(window.db,'sales_breaks', brk.id), {
      endTs: Date.now(), durationMin: durMin, overHours, endPhoto: photoDataUri || null
    });
    // لو فيه ساعات زيادة، تتسجّل في رصيد الوقت
    if(overHours > 0){
      await window.fbAddDoc(window.fbCollection(window.db,'sales_time_credit'), {
        employeeId: empId, employeeName: brk.employeeName, branch: window.currentBranch,
        type: 'break', hours: overHours, date: todayStr(), note: `بريك ${durMin} دقيقة`, ts: Date.now()
      });
    }
  }catch(e){ alert('تعذر إنهاء البريك: ' + e.message); }
}

// قفل تلقائي للبريكات المنسية
async function autoCloseStaleBreaks(){
  const cfg = window.timeCfg || timeCfgDefaults;
  for(const b of (allBreaks||[])){
    if(breakNeedsAutoClose(b, Date.now(), cfg)){
      const durMin = Math.round((Date.now() - b.startTs)/60000);
      const overHours = breakHoursFrom(durMin, cfg.breakMin, cfg);
      try{
        await window.fbUpdateDoc(window.fbDoc(window.db,'sales_breaks', b.id), {
          endTs: b.startTs + (cfg.breakMin*(cfg.autoCloseBreakMult||2))*60000,
          durationMin: durMin, overHours, autoClosed: true
        });
        if(overHours>0){
          await window.fbAddDoc(window.fbCollection(window.db,'sales_time_credit'), {
            employeeId: b.employeeId, employeeName: b.employeeName, branch: b.branch,
            type:'break', hours: overHours, date: b.dateKey, note:'بريك مقفول تلقائي', ts: Date.now()
          });
        }
      }catch(e){}
    }
  }
}
window.startBreak = startBreak; window.endBreak = endBreak;

async function clockIn(empId, photoDataUri){
  const emp = window.employees.find(e=> e.id === empId);
  if(!emp) return;
  // 🕒 التأخير من بداية شيفت الموظف (complianceCfg) + سماح الأدمن
  let lateMinutes = 0, latePenalized = false;
  const lateInfo = computeLate(new Date(), emp.shift, complianceCfg);
  lateMinutes = lateInfo.lateMin;
  latePenalized = lateInfo.penalized;
  // فولباك لو الموظف مالوش شيفت مسجّل (توافق قديم)
  if(!complianceCfg.shifts[emp.shift] && emp.scheduledStartTime){
    const [h,m] = emp.scheduledStartTime.split(':').map(Number);
    const scheduled = new Date(); scheduled.setHours(h, m, 0, 0);
    const diffMin = Math.round((Date.now() - scheduled.getTime())/60000);
    lateMinutes = diffMin > 0 ? diffMin : 0;
    latePenalized = diffMin > (complianceCfg.lateGraceMin||20);
  }
  try{
    await addDoc(shiftsCol, {
      employeeId: empId, employeeName: emp.name, branch: window.currentBranch,
      clockInTs: Date.now(), clockOutTs: null,
      scheduledStartTime: emp.scheduledStartTime || null, lateMinutes, latePenalized,
      clockInPhoto: photoDataUri || null
    });
    // 💰 خصم تلقائي لو التأخير عدّى السماح
    if(latePenalized){
      try{
        await addDoc(collection(db,'sales_deductions'), {
          employeeId: empId, employeeName: emp.name, branch: window.currentBranch,
          type: 'late', amount: complianceCfg.penalty, lateMin: lateMinutes,
          date: todayStr(), ts: Date.now()
        });
      }catch(_e){}
    }
  }catch(err){
    console.error('تعذر تسجيل الحضور', err);
    alert('تعذر تسجيل الحضور: ' + (err && err.code ? err.code : 'غير معروف') + '\n\nتأكد إنك ضايف Firestore Rules الخاصة بـ sales_shifts.');
  }
  renderAttendanceLists();
}

async function clockOut(empId, photoDataUri){
  const shift = getOpenShift(empId);
  if(!shift) return;
  const emp = window.employees.find(e=> e.id === empId);
  const now = Date.now();

  // Overtime is based on actual shift duration exceeding the standard 8h15m
  // (495 minutes) — not on a fixed clock-out time. This naturally accounts
  // for lateness: if the employee arrived late, they simply need to work
  // past 8h15m of ACTUAL time before it counts as overtime, regardless of
  // what time of day their shift started or ends.
  const STANDARD_SHIFT_MINUTES = 8*60 + 15; // 495
  const totalMin = Math.round((now - shift.clockInTs)/60000);
  const overtimeMinutes = Math.max(0, totalMin - STANDARD_SHIFT_MINUTES);

  // 🚪 انصراف بدري: نقارن وقت الخروج بنهاية شيفت الموظف
  const cfg = window.timeCfg || timeCfgDefaults;
  let earlyInfo = { earlyMin: 0, hours: 0 };
  const shiftDef = complianceCfg.shifts[emp && emp.shift];
  const shiftEnd = (emp && emp.scheduledEndTime) || (shiftDef && shiftDef.end);
  if(shiftEnd) earlyInfo = earlyLeaveHours(new Date(now), shiftEnd, cfg);

  try{
    await updateDoc(doc(db,'sales_shifts', shift.id), {
      clockOutTs: now, overtimeMinutes, clockOutPhoto: photoDataUri || null,
      earlyMin: earlyInfo.earlyMin, earlyHours: earlyInfo.hours
    });
    // نسجّل ساعات الانصراف بدري في رصيد الوقت
    if(earlyInfo.hours > 0){
      try{
        await window.fbAddDoc(window.fbCollection(window.db,'sales_time_credit'), {
          employeeId: empId, employeeName: (emp&&emp.name)||'', branch: window.currentBranch,
          type: 'early', hours: earlyInfo.hours, date: todayStr(),
          note: `مشي ${earlyInfo.earlyMin} دقيقة بدري`, ts: Date.now()
        });
      }catch(_e){}
    }
    const h = Math.floor(totalMin/60), m = totalMin%60;
    let msg = `تم تسجيل الانصراف ✅\nمدة الشيفت: ${h} س ${m} د`;
    if(earlyInfo.hours > 0) msg += `\n🚪 مشيت ${earlyInfo.earlyMin} دقيقة بدري → ${earlyInfo.hours} ساعة رصيد`;
    if(overtimeMinutes > 0) msg += `\n⏱️ وقت إضافي: ${overtimeMinutes} دقيقة`;
    alert(msg);
  }catch(err){
    console.error('تعذر تسجيل الانصراف', err);
    alert('تعذر تسجيل الانصراف: ' + (err && err.code ? err.code : 'غير معروف'));
  }
}

// ---------- ATTENDANCE PIN GATE ----------
let pendingAttAction = null; // {type:'in'|'out', empId}
let attPinBuffer = '';

function attActionLabel(type){
  if(type==='break-start') return 'اكتب كودك عشان تطلع بريك';
  if(type==='break-end')   return 'اكتب كودك عشان ترجع من البريك';
  if(type==='out')         return 'اكتب كودك عشان تسجل انصراف';
  return 'اكتب كودك عشان تسجل حضور';
}
function promptAttPin(type, empId){
  const emp = window.employees.find(e=> e.id === empId);
  if(!emp) return;
  pendingAttAction = { type, empId };

  if(!emp.pin){
    // First time this employee is clocking in/out — let them set their own PIN.
    newPinBuffer = '';
    $('#attPinName').textContent = emp.name;
    $('#attPinAction').textContent = attActionLabel(type);
    $('#attNewPinErrText').textContent = '';
    updateNewPinDots(false);
    $('#attPinKeypadArea').style.display = 'none';
    $('#attNoPinArea').style.display = 'block';
    $('#attPinOverlay').classList.add('show');
    return;
  }

  attPinBuffer = '';
  $('#attPinName').textContent = emp.name;
  $('#attPinAction').textContent = attActionLabel(type);
  $('#attPinErrText').textContent = '';
  updateAttPinDots(false);
  $('#attPinKeypadArea').style.display = 'block';
  $('#attNoPinArea').style.display = 'none';
  $('#attPinOverlay').classList.add('show');
}

let newPinBuffer = '';
function updateNewPinDots(isErr){
  document.querySelectorAll('#attNewPinDots .pin-dot').forEach((d,i)=>{
    d.className = 'pin-dot' + (i < newPinBuffer.length ? (isErr?' err':' filled') : '');
  });
}
$('#attNewPinKeypad').addEventListener('click', async (e)=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  if(btn.id === 'attNewPinCancel'){ closeAttPin(); return; }
  if(btn.id === 'attNewPinDel'){ newPinBuffer = newPinBuffer.slice(0,-1); updateNewPinDots(false); return; }
  const k = btn.dataset.k;
  if(k === undefined || newPinBuffer.length >= 4) return;
  newPinBuffer += k;
  updateNewPinDots(false);
  if(newPinBuffer.length === 4){
    const action = pendingAttAction;
    const empId = action.empId;
    try{
      await updateDoc(doc(db,'sales_employees', empId), { pin: newPinBuffer });
      closeAttPin();
      openAttPhoto(action);
    }catch(err){
      console.error('تعذر حفظ الكود', err);
      updateNewPinDots(true);
      $('#attNewPinErrText').textContent = 'حصل خطأ، حاول تاني';
      setTimeout(()=>{ newPinBuffer=''; updateNewPinDots(false); }, 800);
    }
  }
});

function updateAttPinDots(isErr){
  document.querySelectorAll('#attPinDots .pin-dot').forEach((d,i)=>{
    d.className = 'pin-dot' + (i < attPinBuffer.length ? (isErr?' err':' filled') : '');
  });
}
$('#attKeypad').addEventListener('click', (e)=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  if(btn.id === 'attPinCancel'){ closeAttPin(); return; }
  if(btn.id === 'attPinDel'){ attPinBuffer = attPinBuffer.slice(0,-1); updateAttPinDots(false); return; }
  const k = btn.dataset.k;
  if(k === undefined || attPinBuffer.length >= 4) return;
  attPinBuffer += k;
  updateAttPinDots(false);
  if(attPinBuffer.length === 4) checkAttPin();
});

function closeAttPin(){
  $('#attPinOverlay').classList.remove('show');
  pendingAttAction = null;
  attPinBuffer = '';
  newPinBuffer = '';
}

async function checkAttPin(){
  const emp = window.employees.find(e=> e.id === pendingAttAction.empId);
  if(!emp) return;
  if(attPinBuffer === String(emp.pin)){
    const action = pendingAttAction;
    closeAttPin();
    openAttPhoto(action);
  } else {
    updateAttPinDots(true);
    $('#attPinErrText').textContent = 'الكود غلط';
    setTimeout(()=>{ attPinBuffer=''; updateAttPinDots(false); }, 500);
  }
}

// ---------- PERSONAL DAY HUB ----------
function openDayHub(empId){
  taskSubmitEmpId = empId;
  renderDayHub(empId);
  $('#dayHubOverlay').classList.add('show');
}
function closeDayHub(){
  $('#dayHubOverlay').classList.remove('show');
  pendingTaskPhoto = null;
  taskSubmitEmpId = null;
}
$('#dh_closeBtn').addEventListener('click', closeDayHub);
$('#dh_xBtn').addEventListener('click', closeDayHub);
// (زر الانصراف اتشال من صفحة الموظف — الانصراف بقى من زر الحضور بس)
{ const _co = $('#dh_clockOutBtn'); if(_co) _co.addEventListener('click', ()=>{
  $('#dayHubOverlay').classList.remove('show');
  promptAttPin('out', taskSubmitEmpId);
}); }

function renderDayHub(empId){
  const emp = window.employees.find(e=> e.id === empId);
  if(!emp) return;   // بس لو الموظف نفسه مش موجود
  const shift = getOpenShift(empId);

  $('#dh_avatar').textContent = avatarOf(emp);
  $('#dh_avatar').style.cursor = 'pointer';
  $('#dh_avatar').title = 'دوس عشان تغيّر شكلك';
  $('#dh_avatar').onclick = ()=> openAvatarPicker(emp.id);
  $('#dh_name').textContent = emp.name;
  // جزء الشيفت بيظهر بس لو الموظف مسجّل حضور دلوقتي
  if(shift){
    const lateTxt = shift.lateMinutes > 0 ? ` — متأخر ${shift.lateMinutes} دقيقة` : ' — في الميعاد ✅';
    $('#dh_shiftInfo').textContent = 'دخل الشيفت الساعة ' + new Date(shift.clockInTs).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}) + lateTxt;
    const elapsedMs = Date.now() - shift.clockInTs;
    $('#dh_shiftDuration').textContent = formatDuration(elapsedMs) + ' من 8 ساعات';
  }else{
    $('#dh_shiftInfo').textContent = 'مش مسجّل حضور دلوقتي';
    $('#dh_shiftDuration').textContent = '—';
  }

  // Task
  const task = getCurrentTask(empId);
  const sub = getTodaysSubmission(empId);
  $('#dh_taskDesc').textContent = task ? task.taskDescription : 'مفيش تاسك متحدد للأسبوع ده';
  $('#dh_photoInput').value = '';
  $('#dh_photoPreview').style.display = 'none';
  $('#dh_submitTaskBtn').style.display = 'none';
  pendingTaskPhoto = null;

  if(sub && sub.rejected){
    $('#dh_taskStatus').innerHTML = '<span class="taskStatusPill rejected">❌ اتعمل رفض — صور تاني</span>';
    $('#dh_fileBtnLabel').style.display = 'block';
    if(sub.photoURL){
      $('#dh_photoPreview').src = sub.photoURL;
      $('#dh_photoPreview').style.display = 'block';
    }
  } else if(sub){
    const pill = sub.confirmed
      ? '<span class="taskStatusPill confirmed">✅ اتأكد التنفيذ</span>'
      : '<span class="taskStatusPill pending">⏳ في انتظار تأكيد الأدمن</span>';
    $('#dh_taskStatus').innerHTML = pill;
    $('#dh_fileBtnLabel').style.display = 'none';
    if(sub.photoURL){
      $('#dh_photoPreview').src = sub.photoURL;
      $('#dh_photoPreview').style.display = 'block';
    }
  } else if(task){
    $('#dh_taskStatus').innerHTML = '<span class="taskStatusPill none">لسه متنفذش النهاردة</span>';
    $('#dh_fileBtnLabel').style.display = 'block';
  } else {
    $('#dh_taskStatus').innerHTML = '';
    $('#dh_fileBtnLabel').style.display = 'none';
  }

  // Points today
  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  $('#dh_pointsToday').textContent = countsFor(empId, dayStart.getTime());

  // Average customer rating linked to this employee (reusing the same
  // approximate time-based matching used in the performance-link report).
  $('#dh_avgRating').innerHTML = computeAvgRatingFor(empId);

  // Weekly / monthly progress
  // كل جزء محمي عشان لو واحد ضرب، الصفحة تفضل تفتح والباقي يشتغل
  try{ $('#dh_weeklyProgress').innerHTML = getPeriodProgressLabel(empId, 'week'); }catch(e){ console.warn('weekly', e); }
  try{ $('#dh_monthlyProgress').innerHTML = getPeriodProgressLabel(empId, 'month'); }catch(e){ console.warn('monthly', e); }
  try{ renderRewardScoreCard(empId); }catch(e){ console.warn('rewardCard', e); }
  try{ renderDayHubBreak(empId); }catch(e){ console.warn('break', e); }
  try{ renderDayHubLeave(empId); }catch(e){ console.warn('leave', e); }
  try{ renderRaceStatus(empId); }catch(e){ console.warn('race', e); }
}

// ☕ زر البريك في صفحة الموظف
function renderDayHubBreak(empId){
  const area = document.querySelector('#dh_breakArea'); if(!area) return;
  if(!isClockedIn(empId)){ area.innerHTML=''; return; }   // لازم يكون حاضر
  const brk = todaysBreak(empId);
  if(brk && !brk.endTs){
    // في بريك دلوقتي — عداد + زر رجوع
    const cfg = window.timeCfg || timeCfgDefaults;
    const elapsed = Math.round((Date.now()-brk.startTs)/60000);
    const left = Math.max(0, (cfg.breakMin||30) - elapsed);
    area.innerHTML = `<div style="background:linear-gradient(180deg,#2a2410,var(--panel)); border:1px solid var(--gold-dim); border-radius:13px; padding:14px; text-align:center;">
      <div style="font-size:14px; font-weight:800; color:var(--gold);">☕ في بريك دلوقتي</div>
      <div style="font-size:12px; color:var(--sub); margin:4px 0 12px;">${left>0 ? ('باقي '+left+' دقيقة تقريبًا') : 'المدة خلصت — ارجع بسرعة'}</div>
      <button class="btnPrimary" style="width:100%;" onclick="window.reqBreakEnd('${empId}')">🔙 رجعت من البريك</button>
    </div>`;
  } else if(brk && brk.endTs){
    // خلّص بريكه النهاردة
    area.innerHTML = `<div style="text-align:center; color:var(--sub); font-size:12px; padding:8px;">☕ خدت بريك النهاردة (${brk.durationMin||0} دقيقة)</div>`;
  } else {
    // متاح ياخد بريك
    area.innerHTML = `<button class="btnPrimary" style="width:100%; background:linear-gradient(180deg,#c9a227,#a5851c);" onclick="window.reqBreakStart('${empId}')">☕ أطلع بريك</button>`;
  }
}
// 📩 زر طلب إذن في صفحة الموظف
function renderDayHubLeave(empId){
  const area = document.querySelector('#dh_leaveArea'); if(!area) return;
  const mine = (window.allLeaveReqs||[]).filter(l=> l.empId===empId && l.status==='pending');
  const pendingTxt = mine.length ? `<div style="text-align:center; color:var(--sub); font-size:11.5px; margin-top:6px;">⏳ عندك ${mine.length} طلب مستني الموافقة</div>` : '';
  area.innerHTML = `<button class="cancelBtn" style="width:100%;" onclick="window.reqLeave('${empId}')">📩 طلب إذن / تغيير إجازة</button>${pendingTxt}`;
}
// 📩 حالة طلب الإذن (شاشة أنيقة بخريطة الإجازات)
let _lrState = { empId:'', type:'', dateKey:'', reason:'' };
window.reqLeave = function(empId){
  const emp = (window.employees||[]).find(e=> e.id===empId); if(!emp) return;
  _lrState = { empId, empName: emp.name, type:'', dateKey:'', reason:'' };
  $('#dayHubOverlay').classList.remove('show');
  renderLeaveReq();
  $('#leaveReqOverlay').classList.add('show');
};
window.closeLeaveReq = function(){ $('#leaveReqOverlay').classList.remove('show'); };

function _dayName(dow){ return ['الأحد','الاتنين','التلات','الأربع','الخميس','الجمعة','السبت'][dow]; }

// خريطة تغطية الأيام الجاية (14 يوم) — مين متاح وكام واحد
function _coverageMap(){
  const emps = (window.employees||[]).filter(e=> e.branch===window.currentBranch && e.active!==false);
  const approved = (window.allLeaveReqs||[]).filter(l=> l.status==='approved' && l.branch===window.currentBranch);
  const cfg = window.timeCfg || timeCfgDefaults;
  const minStaff = Number(cfg.minStaffPerDay) || 2;
  const days = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for(let i=0;i<14;i++){
    const d = new Date(today.getTime() + i*86400000);
    const dateKey = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const cov = window.coverageOnDate(emps, approved, dateKey);
    // مين آخد إجازة اليوم ده
    const offNames = [];
    emps.forEach(e=>{ if(String(e.dayOff)===String(d.getDay())) offNames.push(e.name+' (إجازته)'); });
    approved.forEach(l=>{ if(l.dateKey===dateKey){ const em=emps.find(x=>x.id===l.empId); if(em) offNames.push(em.name+' (إذن)'); } });
    days.push({ dateKey, dow:d.getDay(), dayNum:d.getDate(), available:cov.available, minStaff, offNames, isToday:i===0 });
  }
  return days;
}

function renderLeaveReq(){
  const body = document.querySelector('#leaveReqBody'); if(!body) return;
  const st = _lrState;
  const types = [
    { id:'dayoff', icon:'🌴', label:'إجازة يوم', desc:'عايز تاخد يوم أجازة' },
    { id:'changeDayoff', icon:'📅', label:'تغيير يوم الإجازة', desc:'تنقل إجازتك الأسبوعية' },
    { id:'shiftSwap', icon:'🔄', label:'تبديل شيفت', desc:'تغيّر شيفتك مؤقتًا' }
  ];

  // الخطوة 1: نوع الطلب
  if(!st.type){
    body.innerHTML = `
      <div style="text-align:center; margin-bottom:18px;">
        <div style="font-size:34px;">📩</div>
        <h3 style="margin:6px 0 2px;">طلب إذن</h3>
        <p class="sub" style="font-size:12px;">اختار نوع طلبك</p>
      </div>
      ${types.map(t=>`
        <button onclick="window.lrPickType('${t.id}')" style="width:100%; display:flex; align-items:center; gap:12px; text-align:right; background:var(--panel2); border:1px solid var(--line); border-radius:13px; padding:14px; margin-bottom:10px; cursor:pointer; font-family:'Cairo';">
          <span style="font-size:24px;">${t.icon}</span>
          <span style="flex:1;"><b style="font-size:14px; color:var(--ink); display:block;">${t.label}</b><small style="color:var(--sub); font-size:11.5px;">${t.desc}</small></span>
          <span style="color:var(--sub);">◀</span>
        </button>`).join('')}
      <button class="cancelBtn" style="width:100%; margin-top:6px;" onclick="closeLeaveReq()">إلغاء</button>`;
    return;
  }

  // الخطوة 2: اختيار اليوم من خريطة التغطية
  const tObj = types.find(t=> t.id===st.type);
  const map = _coverageMap();
  body.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <button onclick="window.lrBack()" style="border:1px solid var(--line); background:var(--panel2); color:var(--sub); border-radius:9px; width:34px; height:34px; cursor:pointer; font-family:'Cairo';">◀</button>
      <h3 style="margin:0;">${tObj.icon} ${tObj.label}</h3>
    </div>
    <p class="sub" style="font-size:12px; margin:0 0 12px;">اختار اليوm — الأخضر متاح، الأحمر الفرع محتاجك فيه</p>
    <div style="max-height:320px; overflow-y:auto; margin-bottom:12px;">
      ${map.map(d=>{
        const safe = d.available > d.minStaff;
        const tight = d.available === d.minStaff;
        const color = safe ? '#5ec88a' : (tight ? '#e0a020' : '#e0796b');
        const bg = st.dateKey===d.dateKey ? 'var(--gold-dim)' : 'var(--panel2)';
        const bar = d.offNames.length ? `<div style="font-size:10.5px; color:var(--sub); margin-top:3px;">${d.offNames.join(' · ')}</div>` : '';
        return `<button onclick="window.lrPickDate('${d.dateKey}')" style="width:100%; text-align:right; background:${bg}; border:1px solid ${st.dateKey===d.dateKey?'var(--gold)':'var(--line)'}; border-radius:11px; padding:11px 13px; margin-bottom:7px; cursor:pointer; font-family:'Cairo';">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:800; font-size:13.5px; color:var(--ink);">${_dayName(d.dow)} ${d.dayNum} ${d.isToday?'<span style=\'color:var(--gold); font-size:10px;\'>(النهاردة)</span>':''}</span>
            <span style="display:flex; align-items:center; gap:5px; font-size:12px; font-weight:700; color:${color};">
              <span style="width:8px; height:8px; border-radius:99px; background:${color}; display:inline-block;"></span>
              ${d.available} في الفرع
            </span>
          </div>
          ${bar}
        </button>`;
      }).join('')}
    </div>
    ${st.dateKey ? `
      <input id="lrReason" placeholder="السبب (اختياري)" value="${st.reason||''}" oninput="_lrState.reason=this.value"
        style="width:100%; padding:12px; border-radius:11px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Cairo'; margin-bottom:10px;">
      <button onclick="window.lrSubmit()" style="width:100%; padding:14px; border:none; border-radius:12px; background:linear-gradient(180deg,var(--gold),#d9a838); color:#1b1400; font-family:'Cairo'; font-weight:800; font-size:14px; cursor:pointer;">📩 ابعت الطلب للإدارة</button>
    ` : '<p style="text-align:center; color:var(--sub); font-size:12px;">اختار يوم عشان تكمّل</p>'}`;
}

window.lrPickType = function(t){ _lrState.type = t; renderLeaveReq(); };
window.lrBack = function(){ _lrState.type=''; _lrState.dateKey=''; renderLeaveReq(); };
window.lrPickDate = function(dk){ _lrState.dateKey = dk; renderLeaveReq(); };
window.lrSubmit = function(){
  const st = _lrState;
  if(!st.type || !st.dateKey) return;
  window.fbAddDoc(window.fbCollection(window.db,'sales_leave_requests'), {
    empId: st.empId, empName: st.empName, branch: window.currentBranch,
    type: st.type, dateKey: st.dateKey, reason: st.reason||'', status:'pending', ts: Date.now()
  }).then(()=>{
    closeLeaveReq();
    alert('اتبعت طلبك للإدارة ✅ — هيتراجع قريب');
  }).catch(e=> alert('تعذر إرسال الطلب: '+e.message));
};

window.reqBreakStart = function(empId){
  $('#dayHubOverlay').classList.remove('show');
  promptAttPin('break-start', empId);
};
window.reqBreakEnd = function(empId){
  $('#dayHubOverlay').classList.remove('show');
  promptAttPin('break-end', empId);
};

// 🏆 كارت نتيجة المكافأة بـ3 عوامل (الشهر الحالي) — للموظف في صفحته
function renderRewardScoreCard(empId){
  const el = document.querySelector('#dh_rewardScore'); if(!el) return;
  const now = new Date();
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  // مبيعات الشهر (نقاط البيع كبديل عن قيمة المبيعات) — نطبّعها على أعلى موظف
  const myPts = countsFor(empId, mStart);
  let maxPts = 1;
  (window.employees||[]).forEach(e=>{ const v = countsFor(e.id, mStart); if(v>maxPts) maxPts=v; });
  // التقييم (0..4 → 0..100)
  const avgR = computeAvgRatingInRange(empId, mStart, Date.now());
  const ratingPct = avgR!=null ? (avgR/4*100) : 0;
  // الالتزام: من رصيد الوقت الشهري (النظام الجديد)
  const mk = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const cfg = window.timeCfg || timeCfgDefaults;
  const myHours = (window.allTimeCredit||[]).filter(x=> x.employeeId===empId && !x.excused && String(x.date||'').startsWith(mk)).reduce((a,x)=> a+(Number(x.hours)||0),0);
  const commit = window.rewardEligibility(myHours, 'month', cfg).commitPct;
  const res = computeRewardScore({ commitmentPct: commit, salesValue: myPts, maxSalesValue: maxPts, ratingPct });
  const bar = (val, color)=>`<div style="flex:1; height:7px; background:var(--panel2); border-radius:99px; overflow:hidden;"><div style="width:${Math.max(2,val)}%; height:100%; background:${color};"></div></div>`;
  el.innerHTML = `
    <div style="background:linear-gradient(180deg,#2a2410,var(--panel)); border:1px solid var(--gold-dim); border-radius:14px; padding:14px;">
      <div style="text-align:center; font-size:30px; font-weight:900; color:var(--gold); line-height:1;">${res.score}<span style="font-size:14px; color:var(--sub);"> / 100</span></div>
      <div style="display:flex; align-items:center; gap:8px; margin-top:12px; font-size:11.5px;"><span style="width:58px;">🎯 التزام</span>${bar(commit,'#5ec88a')}<span style="width:34px; text-align:left;">${Math.round(commit)}%</span></div>
      <div style="display:flex; align-items:center; gap:8px; margin-top:7px; font-size:11.5px;"><span style="width:58px;">🛒 مبيعات</span>${bar(maxPts>0?myPts/maxPts*100:0,'#6aa9f0')}<span style="width:34px; text-align:left;">${myPts}</span></div>
      <div style="display:flex; align-items:center; gap:8px; margin-top:7px; font-size:11.5px;"><span style="width:58px;">⭐ تقييم</span>${bar(ratingPct,'#f2c14e')}<span style="width:34px; text-align:left;">${avgR!=null?avgR.toFixed(1):'—'}</span></div>
      ${vioCount?`<div style="margin-top:10px; font-size:11px; color:#e0796b; text-align:center;">⚠️ ${vioCount} مخالفة الشهر ده أثّرت على التزامك</div>`:'<div style="margin-top:10px; font-size:11px; color:#5ec88a; text-align:center;">✅ التزام كامل الشهر ده</div>'}
    </div>`;
}

function computeAvgRatingFor(empId){
  const empPoints = window.points.filter(p=> p.employeeId === empId);
  const branchFeedback = allFeedback.filter(f=> f.branch === window.currentBranch);
  const usedFeedback = new Set();
  let sum = 0, count = 0;
  empPoints.forEach(p=>{
    let bestIdx=-1, bestAbsDelta=Infinity;
    for(let i=0;i<branchFeedback.length;i++){
      if(usedFeedback.has(i)) continue;
      const absDelta = Math.abs(branchFeedback[i].ts - p.ts);
      if(absDelta <= MATCH_WINDOW_MS && absDelta < bestAbsDelta){ bestAbsDelta=absDelta; bestIdx=i; }
    }
    if(bestIdx>=0){ usedFeedback.add(bestIdx); sum += branchFeedback[bestIdx].r; count++; }
  });
  if(count===0) return '<span style="color:var(--sub);">مفيش بيانات كفاية</span>';
  const avg = (sum/count).toFixed(1);
  return `${avg} / 4 (${count} تقييم مرتبط)`;
}

function computeAvgRatingInRange(empId, startTs, endTs){
  const empPointsInRange = window.points.filter(p=> p.employeeId === empId && p.ts >= startTs && p.ts <= endTs);
  const branchFeedbackInRange = allFeedback.filter(f=> f.branch === window.currentBranch && f.ts >= startTs && f.ts <= endTs);
  const usedFeedback = new Set();
  let sum = 0, count = 0;
  empPointsInRange.forEach(p=>{
    let bestIdx=-1, bestAbsDelta=Infinity;
    for(let i=0;i<branchFeedbackInRange.length;i++){
      if(usedFeedback.has(i)) continue;
      const absDelta = Math.abs(branchFeedbackInRange[i].ts - p.ts);
      if(absDelta <= MATCH_WINDOW_MS && absDelta < bestAbsDelta){ bestAbsDelta=absDelta; bestIdx=i; }
    }
    if(bestIdx>=0){ usedFeedback.add(bestIdx); sum += branchFeedbackInRange[bestIdx].r; count++; }
  });
  return count === 0 ? null : sum/count;
}
function computeAvgRatingToday(empId){
  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  return computeAvgRatingInRange(empId, dayStart.getTime(), Date.now());
}

// ---------- UNIFIED STAFF OVERVIEW (admin) ----------
function renderStaffOverview(){
  const wrap = $('#staffOverviewList');
  if(!wrap) return;
  if(reviewEmployeesFor(viewBranch).length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش موظفين</div>'; return; }
  const dayStart = new Date(); dayStart.setHours(0,0,0,0);

  const rows = reviewEmployeesFor(viewBranch).map(e=>{
    const shift = getOpenShift(e.id);
    let statusColor = 'gray', statusText = 'لسه محضرش';
    if(shift){
      const lm = shift.lateMinutes || 0;
      if(lm === 0){ statusColor='green'; statusText='في الميعاد'; }
      else if(lm <= SEVERE_LATE_MINUTES){ statusColor='yellow'; statusText='متأخر '+lm+' د'; }
      else { statusColor='red'; statusText='متأخر '+lm+' د'; }
    } else if(e.scheduledStartTime){
      const [h,m] = e.scheduledStartTime.split(':').map(Number);
      const scheduled = new Date(); scheduled.setHours(h,m,0,0);
      if(Date.now() > scheduled.getTime()){ statusColor = 'red'; statusText = 'لسه محضرش (فات ميعاده)'; }
    }

    const sub = getTodaysSubmission(e.id);
    const hasTask = !!getCurrentTask(e.id);
    let taskText = '➖ مفيش تاسك';
    let needsAttention = false;
    if(sub && sub.rejected){ taskText = '🔴 اترفض - محتاج يصور تاني'; }
    else if(sub){
      if(sub.confirmed){ taskText = '✅ اتأكد'; }
      else { taskText = '⏳ محتاج تأكيد'; needsAttention = true; }
    }
    else if(hasTask){ taskText = '❌ لسه متنفذش'; }

    const pointsToday = countsFor(e.id, dayStart.getTime());
    const avgToday = computeAvgRatingToday(e.id);
    const ratingText = avgToday === null ? '—' : avgToday.toFixed(1)+'/4';

    return `
    <div class="overviewRow" style="${needsAttention ? 'background:rgba(229,72,77,.1); border-radius:10px;' : ''}">
      <div class="statusDot ${statusColor}"></div>
      <div>
        <div class="n">${e.name}${needsAttention ? ' <span class="panelBadge" style="animation:none;">!</span>' : ''}</div>
        <div class="m">${statusText}</div>
      </div>
      <div>${taskText}</div>
      <div>${pointsToday} نقطة</div>
      <div>${ratingText}</div>
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="overviewHead"><div></div><div>الموظف</div><div>التاسك</div><div>النقط</div><div>التقييم</div></div>
    ${rows}
  `;
}

$('#dh_photoInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  pendingTaskPhoto = file;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    $('#dh_photoPreview').src = ev.target.result;
    $('#dh_photoPreview').style.display = 'block';
  };
  reader.readAsDataURL(file);
  $('#dh_submitTaskBtn').style.display = 'block';
});

function compressImage(file, maxWidth, quality){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > maxWidth){ h = Math.round(h*(maxWidth/w)); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = ()=> reject(new Error('تعذرت قراءة الصورة'));
      img.src = e.target.result;
    };
    reader.onerror = ()=> reject(new Error('تعذرت قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

$('#dh_submitTaskBtn').addEventListener('click', async ()=>{
  if(!pendingTaskPhoto || !taskSubmitEmpId) return;
  const emp = window.employees.find(e=> e.id === taskSubmitEmpId);
  const task = getCurrentTask(taskSubmitEmpId);
  const existingSub = getTodaysSubmission(taskSubmitEmpId); // present only if previously rejected
  const btn = $('#dh_submitTaskBtn');
  btn.disabled = true; btn.textContent = 'بيضغط الصورة...';
  try{
    // Photos are compressed and stored directly in Firestore (small, low-res JPEG)
    // instead of Firebase Storage, so this works on the free Spark plan with no billing account needed.
    const dataUri = await compressImage(pendingTaskPhoto, 480, 0.5);
    if(existingSub){
      // Resubmitting after a rejection — update the same doc instead of duplicating it.
      await updateDoc(doc(db,'sales_task_submissions', existingSub.id), {
        photoURL: dataUri, submittedAt: Date.now(), confirmed: false, confirmedAt: null,
        rejected: false, rejectedAt: null
      });
    } else {
      await addDoc(submissionsCol, {
        employeeId: taskSubmitEmpId, employeeName: emp.name, branch: window.currentBranch,
        date: todayStr(), taskDescription: task ? task.taskDescription : '',
        photoURL: dataUri, submittedAt: Date.now(), confirmed: false, confirmedAt: null,
        rejected: false, rejectedAt: null
      });
    }
    renderDayHub(taskSubmitEmpId);
  }catch(err){
    console.error('تعذر حفظ صورة التاسك', err);
    alert('حصل خطأ في حفظ الصورة: ' + (err && err.message ? err.message : 'غير معروف'));
  }
  btn.disabled = false; btn.textContent = 'تأكيد تنفيذ التاسك ✅';
});

// ---------- WEEK/MONTH HELPERS ----------
function getWeekRange(d){
  const dt = new Date(d);
  const day = dt.getDay(); // 0=Sun
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(dt); monday.setDate(dt.getDate()+diffToMonday); monday.setHours(0,0,0,0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate()+6); sunday.setHours(23,59,59,999);
  return { start: monday, end: sunday };
}
function getMonthRange(d){
  const dt = new Date(d);
  const start = new Date(dt.getFullYear(), dt.getMonth(), 1, 0,0,0,0);
  const end = new Date(dt.getFullYear(), dt.getMonth()+1, 0, 23,59,59,999);
  return { start, end };
}
function countConfirmedDaysInRange(empId, start, end){
  const days = new Set();
  allSubmissions.forEach(s=>{
    if(s.employeeId !== empId || !s.confirmed) return;
    const d = new Date(s.date+'T00:00:00');
    if(d >= start && d <= end) days.add(s.date);
  });
  return days.size;
}
// Counts calendar days in the range EXCLUDING the employee's weekly day off,
// since they're not expected to work (or submit a task) on that day.
function countRequiredWorkDaysInRange(emp, start, end){
  let count = 0;
  const cur = new Date(start);
  while(cur <= end){
    const isDayOff = (emp.dayOff !== undefined && emp.dayOff !== null && emp.dayOff !== '') && cur.getDay() === Number(emp.dayOff);
    if(!isDayOff) count++;
    cur.setDate(cur.getDate()+1);
  }
  return count;
}
function countElapsedWorkDaysInRange(emp, start, end){
  const now = new Date();
  const effectiveEnd = now < end ? now : end;
  if(effectiveEnd < start) return 0;
  return countRequiredWorkDaysInRange(emp, start, effectiveEnd);
}

function getPeriodProgressLabel(empId, periodType){
  const emp = window.employees.find(e=> e.id === empId);
  if(!emp) return '—';
  const range = periodType === 'week' ? getWeekRange(new Date()) : getMonthRange(new Date());
  const confirmedDays = countConfirmedDaysInRange(empId, range.start, range.end);
  const elapsedDays = countElapsedWorkDaysInRange(emp, range.start, range.end);
  if(confirmedDays >= elapsedDays && elapsedDays > 0){
    return `<span style="color:var(--good);">${confirmedDays}/${elapsedDays} ✅ ماشي تمام</span>`;
  }
  const missed = elapsedDays - confirmedDays;
  return `<span style="color:var(--bad);">${confirmedDays}/${elapsedDays} — فايتك ${missed} يوم</span>`;
}

// ---------- REWARD AUTO-GENERATION ----------
function randomReward(){ return Math.floor(Math.random()*(1000-200+1))+200; }

async function checkAndAwardRewards(){
  if(!window.currentBranch || window.employees.length === 0) return;
  const now = new Date();
  const thisWeek = getWeekRange(now);
  const thisMonth = getMonthRange(now);

  for(const emp of window.employees){
    // Previous (fully completed) week
    const prevWeekEnd = new Date(thisWeek.start.getTime() - 1);
    const prevWeek = getWeekRange(prevWeekEnd);
    await maybeAwardPeriod(emp, prevWeek, 'weekly', 'أسبوع ' + todayStr(prevWeek.start));

    // Previous (fully completed) month
    if(now.getDate() <= 3){ // only need to check right after month changes; cheap enough to always check anyway
      const prevMonthEnd = new Date(thisMonth.start.getTime() - 1);
      const prevMonth = getMonthRange(prevMonthEnd);
      await maybeAwardPeriod(emp, prevMonth, 'monthly', prevMonth.start.toLocaleDateString('ar-EG',{month:'long', year:'numeric'}));
    }
  }
}

const MIN_RATING_FOR_REWARD = 2.5; // out of 4 — skipped if no rating data exists for the period
function totalCalendarDaysInRange(start, end){
  return Math.floor((end - start)/(24*60*60*1000)) + 1;
}

// Live, employee-facing view of "am I still on track for the weekly/monthly
// reward?" — uses the exact same rules as the real award check below, but
// evaluated against the period SO FAR (not waiting for the period to fully end).
function computeRaceStatus(emp, periodType){
  const range = periodType === 'week' ? getWeekRange(new Date()) : getMonthRange(new Date());
  const cfg = window.timeCfg || timeCfgDefaults;

  // 🕒 رصيد الوقت في الفترة (تأخير/بريك/انصراف بدري/تبديل/غياب) — النظام الجديد
  const mk = periodType === 'month'
    ? (new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0'))
    : null;
  const credit = (window.allTimeCredit||[]).filter(x=>{
    if(x.employeeId!==emp.id || x.excused) return false;
    const t = new Date((x.date||'')+'T00:00:00').getTime();
    return t >= range.start.getTime() && t <= range.end.getTime();
  });
  const hours = credit.reduce((a,x)=> a + (Number(x.hours)||0), 0);

  // الأهلية حسب الفترة (نفس محرك الالتزام)
  const elig = window.rewardEligibility(hours, periodType, cfg);

  // التقييم (لو فيه بيانات)
  const avgRating = computeAvgRatingInRange(emp.id, range.start.getTime(), range.end.getTime());

  // مبيعات الفترة (نقاط)
  const pts = window.points.filter(pp=> pp.employeeId===emp.id && pp.ts>=range.start.getTime() && pp.ts<=Math.min(Date.now(),range.end.getTime())).length;

  // تفصيل الساعات حسب النوع (للعرض)
  const byType = {};
  credit.forEach(x=>{ byType[x.type] = (byType[x.type]||0) + (Number(x.hours)||0); });

  const stillInRace = elig.eligible;
  const reasons = [];
  if(!stillInRace){
    reasons.push(`رصيد وقتك ${hours} ساعة (المسموح ${elig.allowedHours})`);
  }

  return {
    hours, allowedHours: elig.allowedHours, commitPct: elig.commitPct,
    hoursLeft: elig.hoursLeft, byType, avgRating, points: pts,
    stillInRace, reasons
  };
}

function renderRaceStatus(empId){
  const wrap = document.querySelector('#dh_raceStatus');
  if(!wrap) return;
  const emp = window.employees.find(e=> e.id === empId);
  if(!emp){ wrap.innerHTML = ''; return; }

  const typeLabel = { late:'⏰ تأخير', break:'☕ بريك', early:'🚪 انصراف بدري', swap:'🔄 تبديل', absence:'🚫 غياب' };

  const blocks = ['week','month'].map(periodType=>{
    const st = computeRaceStatus(emp, periodType);
    const title = periodType === 'week' ? '📅 الأسبوع ده' : '🗓️ الشهر ده';
    const ratingTxt = st.avgRating === null ? 'لسه مفيش تقييم' : st.avgRating.toFixed(1) + '/4';

    // تفصيل رصيد الوقت
    const parts = Object.entries(st.byType).map(([k,v])=> `${typeLabel[k]||k} ${v}س`).join(' · ');
    const commitColor = st.commitPct >= 90 ? 'var(--good)' : (st.commitPct >= 80 ? '#e0a020' : 'var(--bad)');

    // شريط تقدّم الالتزام
    const bar = `<div style="height:8px; background:var(--panel2); border-radius:99px; overflow:hidden; margin-top:6px;">
      <div style="width:${Math.max(3,st.commitPct)}%; height:100%; background:${commitColor};"></div></div>`;

    let verdict;
    if(st.stillInRace){
      const leftTxt = st.hoursLeft > 0
        ? `عندك مساحة ${st.hoursLeft} ساعة كمان قبل ما تخرج`
        : 'انت عند الحد بالظبط — خلّي بالك';
      verdict = `<div class="raceVerdict ok">🏁 لسه في السباق — ${leftTxt}</div>`;
    } else {
      verdict = `<div class="raceVerdict out">⛔ خرجت من ${periodType==='week'?'سباق الأسبوع':'سباق الشهر'} — رصيد وقتك ${st.hours} ساعة (المسموح ${st.allowedHours})<br><small style="opacity:.85; font-weight:400;">تقدر ترجع الشهر الجاي — ابدأ صفحة جديدة</small></div>`;
    }

    return `
    <div class="raceBlock">
      <div class="raceBlockTitle"><span>${title}</span></div>
      <div class="raceItem"><span>🎯 التزامك بالمواعيد</span><span style="color:${commitColor}; font-weight:800;">${st.commitPct}%</span></div>
      ${bar}
      ${parts ? `<div style="font-size:11px; color:var(--sub); margin-top:6px;">رصيدك: ${parts}</div>` : '<div style="font-size:11px; color:var(--good); margin-top:6px;">✅ مفيش أي رصيد وقت — التزام كامل</div>'}
      <div class="raceItem" style="margin-top:8px;"><span>🛒 مبيعاتك</span><span>${st.points} نقطة</span></div>
      <div class="raceItem"><span>⭐ تقييم العميل</span><span style="color:var(--sub);">${ratingTxt}</span></div>
      ${verdict}
    </div>`;
  }).join('');

  wrap.innerHTML = blocks;
}

async function maybeAwardPeriod(emp, range, type, label){
  const already = allRewards.some(r=> r.employeeId===emp.id && r.type===type && r.periodLabel===label);
  if(already) return;

  if(type === 'monthly'){
    // Monthly reward: split the month into ~4 weekly chunks and average their
    // composite scores (attendance% + punctuality% + task% + rating%). Reaching
    // 80% overall qualifies — no need for a flawless month, just solid consistency.
    const MONTHLY_THRESHOLD_PCT = 80;
    const chunks = [];
    let chunkStart = new Date(range.start);
    while(chunkStart < range.end){
      let chunkEnd = new Date(chunkStart.getTime() + 6*24*60*60*1000);
      if(chunkEnd > range.end) chunkEnd = new Date(range.end);
      chunks.push({ start: chunkStart, end: chunkEnd });
      chunkStart = new Date(chunkEnd.getTime() + 24*60*60*1000);
    }
    if(chunks.length === 0) return;
    const composites = chunks.map(c=> computeWeekComposite(emp, c.start, c.end));
    const avgComposite = Math.round(composites.reduce((a,b)=>a+b,0)/composites.length);
    if(avgComposite < MONTHLY_THRESHOLD_PCT) return;

    try{
      await addDoc(rewardsCol, {
        employeeId: emp.id, employeeName: emp.name, branch: window.currentBranch,
        type, periodLabel: label, amount: randomReward(), earnedAt: Date.now(), seen: false
      });
    }catch(err){ console.error('تعذر إنشاء المكافأة', err); }
    return;
  }

  // Weekly reward: strict criteria — every single requirement must hold for the week.
  const requiredDays = countRequiredWorkDaysInRange(emp, range.start, range.end);
  const confirmedDays = countConfirmedDaysInRange(emp.id, range.start, range.end);
  if(confirmedDays < requiredDays || requiredDays === 0) return;

  // 🚪 بوابة الالتزام الجديدة: رصيد الوقت في الفترة لازم مايعدّيش المسموح (90% التزام)
  const cfg = window.timeCfg || timeCfgDefaults;
  const credit = (window.allTimeCredit||[]).filter(x=>{
    if(x.employeeId!==emp.id || x.excused) return false;
    const t = new Date((x.date||'')+'T00:00:00').getTime();
    return t >= range.start.getTime() && t <= range.end.getTime();
  });
  const creditHours = credit.reduce((a,x)=> a + (Number(x.hours)||0), 0);
  const elig = window.rewardEligibility(creditHours, type === 'monthly' ? 'month' : 'week', cfg);
  if(!elig.eligible) return;   // خرج من المكافأة — رصيد وقته عدّى المسموح

  // Customer rating requirement — only enforced if there's actual rating data
  // for the period (an employee shouldn't be penalized for a lack of feedback).
  const avgRating = computeAvgRatingInRange(emp.id, range.start.getTime(), range.end.getTime());
  if(avgRating !== null && avgRating < MIN_RATING_FOR_REWARD) return;

  // Minimum sales points requirement — only enforced if the admin set a
  // per-employee weekly threshold.
  if(emp.minWeeklyPoints){
    const periodDays = totalCalendarDaysInRange(range.start, range.end);
    const minPointsForPeriod = Math.round(emp.minWeeklyPoints * periodDays / 7);
    const pointsInRange = window.points.filter(p=> p.employeeId===emp.id && p.ts >= range.start.getTime() && p.ts <= range.end.getTime()).length;
    if(pointsInRange < minPointsForPeriod) return;
  }

  try{
    await addDoc(rewardsCol, {
      employeeId: emp.id, employeeName: emp.name, branch: window.currentBranch,
      type, periodLabel: label, amount: randomReward(), earnedAt: Date.now(), seen: false
    });
  }catch(err){ console.error('تعذر إنشاء المكافأة', err); }
}

// Show a celebratory gift-box toast for any unseen reward, once per app load per reward.
function showUnseenRewardsIfAny(){
  const unseen = rewards.filter(r=> !r.seen);
  if(unseen.length === 0) return;
  const r = unseen[0];
  $('#giftBoxName').textContent = '🎉 مبروك يا ' + r.employeeName + '!';
  $('#giftBoxAmount').textContent = r.amount + ' ج.م';
  $('#giftBoxSub').textContent = (r.type==='weekly' ? 'مكافأة الالتزام الأسبوعية' : 'مكافأة الالتزام الشهرية') + ' — ' + r.periodLabel;
  $('#giftBoxToast').classList.add('show');
  updateDoc(doc(db,'sales_rewards', r.id), { seen: true }).catch(()=>{});
  setTimeout(()=> $('#giftBoxToast').classList.remove('show'), 4000);
}

function countsFor(empId, sinceTs){
  return window.points.filter(p=> p.employeeId === empId && (!sinceTs || p.ts >= sinceTs)).length;
}

let highlightEmpId = null;
let highlightTimer = null;

function renderEmpGrid(){
  const grid = $('#empGrid');
  const hint = $('#emptyHint');
  const clockedIn = window.employees.filter(e=> isClockedIn(e.id));
  if(clockedIn.length === 0){
    grid.innerHTML = '';
    hint.style.display = 'block';
    hint.textContent = 'محدش سجّل حضوره لسه. دوس على "⏰ الحضور" فوق الأول عشان تسجّل حضورك، وبعدين هتلاقي اسمك هنا تدوس عليه.';
    return;
  }
  hint.style.display = 'none';
  grid.innerHTML = clockedIn.map(e=>{
    const sub = getTodaysSubmission(e.id);
    const hasTask = !!getCurrentTask(e.id);
    let taskIcon = '';
    if(sub){
      if(sub.rejected) taskIcon = '❌';
      else taskIcon = sub.confirmed ? '✅' : '⏳';
    } else if(hasTask){
      taskIcon = '📸'; // task assigned, nothing submitted yet today
    }
    const hasUnseenReward = rewards.some(r=> r.employeeId===e.id && !r.seen);
    return `
    <div class="emp-tile attTile${e.id===highlightEmpId?' just-scored':''}" data-id="${e.id}">
      ${taskIcon ? `<div class="taskBadge${sub && sub.rejected ? ' rejected' : ''}">${taskIcon}</div>` : ''}
      ${hasUnseenReward ? `<div class="giftBadge">🎁</div>` : ''}
      <div class="emp-avatar">${initials(e.name)}</div>
      <div class="emp-name">${e.name}</div>
      <div class="emp-count">${countsFor(e.id)} نقطة</div>
    </div>
  `;}).join('');
  grid.querySelectorAll('.emp-tile').forEach(tile=>{
    // دوسة الاسم بتفتح صفحة الموظف الكاملة: التاسك + أدائه + مكافآته + انصراف
    tile.addEventListener('click', ()=> openDayHub(tile.dataset.id));
  });
}

function glowEmployee(empId){
  highlightEmpId = empId;
  renderEmpGrid();
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(()=>{
    highlightEmpId = null;
    renderEmpGrid();
  }, 5000);
}

function showToast(empName){
  $('#toastMsg').textContent = '🎉 +1 نقطة يا ' + empName + '!';
  $('#toast').classList.add('show');
  setTimeout(()=> $('#toast').classList.remove('show'), 1000);
}

function startForEmployee(empId){
  // ⭐ النقط بقت أوتوماتيك من الكاشير — الضغطة بتعرض ملخص نقاطها بس (مفيش سكان)
  selectedEmp = window.employees.find(e=> e.id === empId);
  if(!selectedEmp) return;
  const mr = getMonthRange(new Date());
  const monthPts = allPoints.filter(p=> p.employeeId===empId && p.ts>=mr.start.getTime() && p.ts<=mr.end.getTime()).length;
  const todayPts = allPoints.filter(p=> p.employeeId===empId && p.ts>= new Date().setHours(0,0,0,0)).length;
  $('#toastMsg').textContent = '⭐ ' + selectedEmp.name + ': النهاردة ' + todayPts + ' · الشهر ' + monthPts + ' نقطة — بتتسجل أوتوماتيك من الكاشير';
  $('#toast').classList.add('show');
  setTimeout(()=> $('#toast').classList.remove('show'), 2600);
}

function openInvoiceModal(){
  if(!selectedEmp) return;
  $('#invoiceEmpName').textContent = selectedEmp.name;
  $('#invoiceInput').value = '';
  $('#invoiceErr').textContent = '';
  $('#invoiceOverlay').classList.add('show');
  setTimeout(()=> $('#invoiceInput').focus(), 100);
}

async function confirmInvoice(){
  const invoiceNumber = $('#invoiceInput').value.trim();
  if(!invoiceNumber){ $('#invoiceErr').textContent = 'اكتب رقم الفاتورة أو اعمل سكان للباركود'; return; }
  const emp = selectedEmp;
  if(!emp) return;

  // Prevent the same invoice number being registered twice within the same branch.
  const branchEmpIds = new Set(allEmployees.filter(x=> x.branch === emp.branch).map(x=> x.id));
  const isDuplicate = window.points.some(p=> branchEmpIds.has(p.employeeId) && String(p.invoiceNumber||'').trim() === invoiceNumber);
  if(isDuplicate){
    $('#invoiceEmpName').textContent = emp.name;
    $('#invoiceInput').value = invoiceNumber;
    $('#invoiceErr').textContent = 'رقم الفاتورة ده اتسجل قبل كده. تأكد من الرقم أو اكتب رقم صح.';
    $('#invoiceOverlay').classList.add('show');
    return;
  }

  try{
    await addDoc(pointsCol, { employeeId: emp.id, employeeName: emp.name, invoiceNumber, ts: Date.now() });
  }catch(err){ console.error('تعذر تسجيل النقطة', err); }
  $('#invoiceOverlay').classList.remove('show');
  selectedEmp = null;
  glowEmployee(emp.id);
  showToast(emp.name);
}

$('#invoiceConfirmBtn').addEventListener('click', confirmInvoice);
$('#invoiceInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') confirmInvoice(); });
$('#invoiceCancelBtn').addEventListener('click', ()=>{
  $('#invoiceOverlay').classList.remove('show');
  selectedEmp = null;
});

// ---------- BARCODE SCANNER ----------
let scanStream = null;
let scanLoopId = null;

function playBeep(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 1800;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = ()=> ctx.close();
  }catch(e){ /* audio not available, ignore */ }
}

$('#scanBtn').addEventListener('click', openScanner);
$('#scannerCancelBtn').addEventListener('click', closeScanner);
$('#scannerManualBtn').addEventListener('click', ()=>{
  closeScanner();
  openInvoiceModal();
});

async function openScanner(){
  // Show the overlay immediately so any error message is actually visible —
  // previously errors were written before the overlay existed on screen.
  $('#scannerEmpName').textContent = selectedEmp ? selectedEmp.name : '—';
  $('#scannerErr').textContent = '';
  $('#scannerStatus').textContent = 'بيفتح الكاميرا...';
  $('#scannerOverlay').classList.add('show');

  if(!('BarcodeDetector' in window)){
    $('#scannerStatus').textContent = '';
    $('#scannerErr').textContent = 'المتصفح ده مش بيدعم سكان الباركود. اكتب رقم الفاتورة بإيدك بدل كده.';
    return;
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    $('#scannerStatus').textContent = '';
    $('#scannerErr').textContent = 'الكاميرا متاحة بس لو الملف اتفتح من رابط ويب آمن (https). لو بتفتح الملف من جهازك مباشرة، الكاميرا مش هتشتغل — لازم ترفع الملف Online عشان السكان يشتغل.';
    return;
  }
  try{
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    const video = $('#scannerVideo');
    video.srcObject = scanStream;
    await video.play();
    $('#scannerStatus').textContent = '';
    let detector;
    try{
      detector = new BarcodeDetector({ formats: ['code_128','code_39','code_93','ean_13','ean_8','upc_a','upc_e','itf','codabar'] });
    }catch(e){
      detector = new BarcodeDetector(); // fallback if formats hint unsupported
    }
    let busy = false;
    const scanFrame = async ()=>{
      if(!busy){
        busy = true;
        try{
          const codes = await detector.detect(video);
          if(codes.length > 0){
            playBeep();
            $('#invoiceInput').value = codes[0].rawValue;
            closeScanner();
            confirmInvoice();
            return;
          }
        }catch(e){ /* keep trying */ }
        busy = false;
      }
      scanLoopId = requestAnimationFrame(scanFrame);
    };
    scanLoopId = requestAnimationFrame(scanFrame);
  }catch(err){
    $('#scannerStatus').textContent = '';
    if(err && err.name === 'NotAllowedError'){
      $('#scannerErr').textContent = 'تم رفض إذن الكاميرا. فعّل إذن الكاميرا للمتصفح من إعدادات الجهاز وحاول تاني.';
    } else if(err && err.name === 'NotFoundError'){
      $('#scannerErr').textContent = 'مفيش كاميرا متاحة على الجهاز ده.';
    } else {
      $('#scannerErr').textContent = 'مقدرش أوصل للكاميرا. اكتب رقم الفاتورة بإيدك بدل كده.';
    }
    console.error(err);
  }
}

function closeScanner(){
  if(scanLoopId) cancelAnimationFrame(scanLoopId);
  scanLoopId = null;
  if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); scanStream = null; }
  $('#scannerOverlay').classList.remove('show');
}

// ---------- LEADERBOARD ----------
$('#openLeaderboard').addEventListener('click', ()=>{
  $('#leaderboard').classList.add('show');
  renderLeaderboard();
});
$('#closeLeaderboard').addEventListener('click', ()=> $('#leaderboard').classList.remove('show'));

function medalOrRank(i){
  return i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : String(i+1);
}

function buildRows(list, key){
  if(list.length === 0) return '<div class="lb-empty">لسه مفيش نقط مسجلة</div>';
  return list.map((e,i)=>`
    <div class="lb-row ${i===0?'rank1':''}">
      <div class="lb-rank">${medalOrRank(i)}</div>
      <div class="lb-avatar">${initials(e.name)}</div>
      <div class="lb-name">${e.name} ${i===0 && key==='w' ? '<span class="crown">👑</span>' : ''}</div>
      <div class="lb-points">${e.count} نقطة</div>
    </div>
  `).join('');
}

function renderLeaderboard(){
  // The kiosk-facing leaderboard always shows this device's own branch only.
  const lbEmployees = window.employees;
  const weekAgo = Date.now() - 7*24*60*60*1000;
  const weekly = lbEmployees.map(e=>({name:e.name, count: countsFor(e.id, weekAgo)}))
    .filter(e=>e.count>0).sort((a,b)=>b.count-a.count);
  const allTime = lbEmployees.map(e=>({name:e.name, count: countsFor(e.id)}))
    .filter(e=>e.count>0).sort((a,b)=>b.count-a.count);
  $('#weeklyList').innerHTML = buildRows(weekly, 'w');
  $('#allTimeList').innerHTML = buildRows(allTime, 'a');
}

// ---------- ADMIN GATE ----------
const gear = $('#gear');
let gearTimer = null;
gear.addEventListener('pointerdown', ()=>{ gearTimer = setTimeout(openAdmin, 1200); });
['pointerup','pointerleave'].forEach(ev=> gear.addEventListener(ev, ()=> clearTimeout(gearTimer)));

// Fullscreen kiosk mode
function toggleFullscreen(){
  if(!document.fullscreenElement){
    document.documentElement.requestFullscreen?.().catch(()=>{});
  } else {
    document.exitFullscreen?.().catch(()=>{});
  }
}
$('#fsBtn').addEventListener('click', toggleFullscreen);
let firstTapDone = false;
function requestFullscreenOnce(){
  if(firstTapDone) return;
  firstTapDone = true;
  if(!document.fullscreenElement){ document.documentElement.requestFullscreen?.().catch(()=>{}); }
}

let panelsCollapsibleInit = false;
function initCollapsiblePanels(){
  if(panelsCollapsibleInit) return;
  panelsCollapsibleInit = true;
  document.querySelectorAll('#admin .panel').forEach(panel=>{
    // Whatever the FIRST child of the panel is (a plain <h3>, or a wrapper div
    // containing the h3 + an export button) becomes the clickable header row.
    // No DOM nodes are ever moved — only a CSS class is toggled — so this can
    // never interfere with any button's own click listener inside the panel.
    const headerRow = panel.firstElementChild;
    if(!headerRow) return;
    const heading = headerRow.tagName === 'H3' ? headerRow : headerRow.querySelector('h3');
    if(heading){
      const chev = document.createElement('span');
      chev.className = 'chev';
      chev.textContent = '▾';
      heading.appendChild(chev);
    }
    panel.classList.add('collapsed');
    headerRow.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return; // don't toggle when tapping an export/action button in the header
      const willCollapse = !panel.classList.contains('collapsed');
      panel.classList.toggle('collapsed', willCollapse);
      if(heading) heading.classList.toggle('open', !willCollapse);
    });
  });
}

function openAdmin(){
  $('#admin').classList.add('show');
  initAdminTabs();
  $('#targetCelebration').classList.remove('show'); // safety: never let this linger over the admin panel
  initCollapsiblePanels();
  if(adminUnlocked){
    renderAdminList(); renderLog(); renderPerformanceLink();
    renderStaffOverview(); renderScheduleList(); renderTaskAssignList();
    renderPendingSubmissions(); renderConfirmedSubmissions(); renderRewardsList(); renderAttendanceHistory(); renderWeeklyAggregate(); renderPerfHistory(); renderFullReport(); renderCommissionPanel(); renderCommissionPaymentLog(); renderSalaryPanel(); renderSalaryPaymentLog(); renderTerminationPanel(); renderTerminationLog(); renderAdvancesLog(); renderAdminSettingsForm();
    // اللوحات الجديدة (الالتزام والمكافآت) — محميّة عشان أي خطأ فيها مايوقفش اللوحة كلها
    try{ renderPendingRegs(); }catch(e){ console.warn('regs', e); }
    try{ window.renderComplianceSettingsForm(); }catch(e){ console.warn('compliance form', e); }
    try{ updateRegBadge(); }catch(e){ console.warn('reg badge', e); }
    try{ window.renderDeductionsLog(); }catch(e){ console.warn('deductions', e); }
    try{ window.renderAttIssues(); }catch(e){ console.warn('att issues', e); }
    try{ window.renderBranchManage(); }catch(e){ console.warn('branch manage', e); }
    try{ window.renderTimeSettings(); }catch(e){ console.warn('time settings', e); }
  }
  else { $('#adminLoginGate').classList.add('show'); }
}
$('#adminLoginBtn').addEventListener('click', doAdminLogin);
$('#adminPass').addEventListener('keydown', (e)=>{ if(e.key==='Enter') doAdminLogin(); });
function doAdminLogin(){
  const pass = $('#adminPass').value;
  $('#adminLoginErr').textContent = '';
  if(pass === ADMIN_CODE){
    adminUnlocked = true;
    $('#adminPass').value = '';
    $('#adminLoginGate').classList.remove('show');
    renderAdminList();
    renderLog();
    renderPerformanceLink();
    renderStaffOverview(); renderScheduleList(); renderTaskAssignList();
    renderPendingSubmissions(); renderConfirmedSubmissions(); renderRewardsList(); renderAttendanceHistory(); renderWeeklyAggregate(); renderPerfHistory(); renderFullReport(); renderCommissionPanel(); renderCommissionPaymentLog(); renderSalaryPanel(); renderSalaryPaymentLog(); renderTerminationPanel(); renderTerminationLog(); renderAdvancesLog(); renderAdminSettingsForm();
    try{ renderPendingRegs(); }catch(e){ console.warn('regs', e); }
    try{ window.renderComplianceSettingsForm(); }catch(e){ console.warn('compliance form', e); }
    try{ updateRegBadge(); }catch(e){ console.warn('reg badge', e); }
    try{ window.renderDeductionsLog(); }catch(e){ console.warn('deductions', e); }
    try{ window.renderAttIssues(); }catch(e){ console.warn('att issues', e); }
    try{ window.renderBranchManage(); }catch(e){ console.warn('branch manage', e); }
    try{ window.renderTimeSettings(); }catch(e){ console.warn('time settings', e); }
    renderViolationsReview();
  } else {
    $('#adminLoginErr').textContent = 'كود غلط، حاول تاني';
  }
}
$('#adminLoginCancel').addEventListener('click', ()=>{
  $('#adminLoginGate').classList.remove('show');
  $('#admin').classList.remove('show');
});
$('#backFromAdmin').addEventListener('click', ()=> $('#admin').classList.remove('show'));
$('#adminLogout').addEventListener('click', ()=>{
  adminUnlocked = false;
  $('#admin').classList.remove('show');
});

function renderAdminList(){
  const wrap = $('#empList');
  const listed = reviewEmployeesFor(viewBranch);
  if(listed.length === 0){
    wrap.innerHTML = '<div class="empty">لسه مفيش موظفين</div>';
    return;
  }
  wrap.innerHTML = listed.map(e=>`
    <div class="emp-row" style="flex-wrap:wrap;">
      <div class="n">${e.name}${e.cardCode ? ' <span title="ليه كارت مطبوع — كود ' + e.cardCode + '" style="font-size:12px; background:var(--gold-dim); color:#0b0c0f; padding:1px 7px; border-radius:8px; font-weight:800;">🪪 كارت</span>' : ''}${viewBranch==='__ALL__' ? ' <span style="color:var(--sub); font-weight:400; font-size:12px;">— '+(e.branch||'—')+'</span>' : ''}</div>
      <select data-shift-id="${e.id}" title="الشيفت — لازم يتحدد عشان إطارات تارجت الشيفت تشتغل"
        style="padding:8px; border-radius:8px; border:1px solid ${e.shift ? 'var(--line)' : 'var(--bad)'}; background:var(--panel2); color:var(--ink); font-family:'Cairo'; font-size:12px;">
        <option value=""        ${!e.shift ? 'selected' : ''}>⚠️ بدون شيفت</option>
        <option value="morning" ${e.shift==='morning' ? 'selected' : ''}>🌅 صباحي</option>
        <option value="evening" ${e.shift==='evening' ? 'selected' : ''}>🌆 مسائي</option>
      </select>
      <input type="text" inputmode="numeric" maxlength="4" placeholder="كود PIN" data-pin-id="${e.id}" value="${e.pin || ''}"
        style="width:80px; padding:8px; border-radius:8px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Space Grotesk'; text-align:center;">
      <button data-act="savePin" data-id="${e.id}" style="border:none; background:var(--good); color:#fff; padding:8px 12px; border-radius:8px; font-family:'Cairo'; font-weight:700; font-size:11px; cursor:pointer;">حفظ الكود</button>
      <button data-act="resetPin" data-id="${e.id}" style="border:none; background:var(--gold-dim); color:#0b0c0f; padding:8px 12px; border-radius:8px; font-family:'Cairo'; font-weight:700; font-size:11px; cursor:pointer;">🔄 إعادة تعيين</button>
      <button data-act="del" data-id="${e.id}">حذف</button>
    </div>
  `).join('');
  wrap.querySelectorAll('[data-act="del"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      // 🪪 لو الموظف ده ليه كارت مطبوع (cardCode) — تحذير أقوى قبل الحذف:
      // الحذف بيبطّل الكارت الورقي فورًا (دخول POS + شراء الموظفين + QR الإحالة)
      const emp = (window.allEmployeesAll||[]).find(x=> x.id === btn.dataset.id);
      if(emp && emp.cardCode){
        const ok = confirm(
          '⚠️ الموظف ده ليه كارت مطبوع!\n\n' +
          'كود الكارت: ' + emp.cardCode + '\n' +
          (emp.cardIssuedAt ? 'اتطبع بتاريخ: ' + new Date(emp.cardIssuedAt).toLocaleDateString('ar-EG') + '\n' : '') +
          '\nلو حذفته، الكارت الورقي اللي معاه هيبطل يشتغل نهائيًا:\n' +
          '• سكان الدخول على الكاشير\n' +
          '• خصم شراء الموظفين\n' +
          '• QR الإحالة اللي على ضهر الكارت\n\n' +
          'لو ده تكرار — اتأكد إنك بتحذف النسخة اللي *من غير* كارت.\n\n' +
          'متأكد إنك عايز تحذف الموظف اللي ليه الكارت؟');
        if(!ok) return;
      } else {
        if(!confirm('متأكد إنك عايز تحذف الموظف ده؟')) return;
      }
      try{ await deleteDoc(doc(db,'sales_employees', btn.dataset.id)); }
      catch(err){ console.error('تعذر الحذف', err); }
    });
  });
  // 🌅🌆 حفظ الشيفت فورًا عند الاختيار (زي يوم الإجازة — مفيش زرار حفظ)
  wrap.querySelectorAll('[data-shift-id]').forEach(sel=>{
    sel.addEventListener('change', async ()=>{
      const id = sel.dataset.shiftId, val = sel.value || '';
      const prev = sel.style.borderColor;
      sel.style.borderColor = 'var(--gold)';
      const patch = { shift: val };
      // نضبط ميعاد الحضور من إعدادات الشيفت لو متسجّلة (زي ما بيحصل في wizard التسجيل)
      const sh = (window.complianceCfg && window.complianceCfg.shifts && window.complianceCfg.shifts[val]) || null;
      if(sh && sh.start) patch.scheduledStartTime = sh.start;
      if(sh && sh.end)   patch.scheduledEndTime   = sh.end;
      try{
        await updateDoc(doc(db,'sales_employees', id), patch);
        sel.style.borderColor = val ? 'var(--good)' : 'var(--bad)';
      }catch(err){
        console.error('تعذر حفظ الشيفت', err);
        sel.style.borderColor = 'var(--bad)';
        alert('تعذر حفظ الشيفت: ' + (err && err.code ? err.code : 'خطأ غير معروف'));
      }
      setTimeout(()=>{ sel.style.borderColor = val ? 'var(--line)' : 'var(--bad)'; }, 1500);
    });
  });
  wrap.querySelectorAll('[data-act="resetPin"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const emp = allEmployees.find(e=> e.id === btn.dataset.id);
      if(!confirm(`متأكد إنك عايز تصفّر كود ${emp?emp.name:''}؟ هيحتاج يختار كود جديد لنفسه أول ما يسجل حضور تاني.`)) return;
      try{
        await updateDoc(doc(db,'sales_employees', btn.dataset.id), { pin: '' });
        btn.textContent = 'اتصفّر ✅';
        setTimeout(()=> btn.textContent = '🔄 إعادة تعيين', 1500);
      }catch(err){ console.error('تعذر تصفير الكود', err); alert('حصل خطأ: ' + (err && err.code ? err.code : 'غير معروف')); }
    });
  });
  wrap.querySelectorAll('[data-act="savePin"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const input = wrap.querySelector(`input[data-pin-id="${btn.dataset.id}"]`);
      const pin = input.value.trim();
      if(!/^\d{4}$/.test(pin)){ alert('الكود لازم يكون 4 أرقام'); return; }
      try{
        await updateDoc(doc(db,'sales_employees', btn.dataset.id), { pin });
        btn.textContent = 'اتحفظ ✅';
        setTimeout(()=> btn.textContent = 'حفظ الكود', 1500);
      }catch(err){ console.error('تعذر حفظ الكود', err); alert('حصل خطأ: ' + (err && err.code ? err.code : 'غير معروف')); }
    });
  });
}

$('#addEmpBtn').addEventListener('click', async ()=>{
  const name = $('#newEmpName').value.trim();
  const errEl = $('#addEmpErr');
  errEl.textContent = '';
  if(!name){ errEl.textContent = 'اكتب اسم الموظف'; return; }
  try{
    // Attendance tracking starts from the moment they're added (used only to
    // put a floor on absence detection), completely separate from hireDate
    // (which the admin sets manually and only affects salary proration).
    const trackingStart = todayStr();
    await addDoc(empCol, { name, branch: (viewBranch==='__ALL__' ? window.currentBranch : viewBranch), attendanceTrackingStart: trackingStart, createdAt: Date.now() });
    $('#newEmpName').value = '';
  }catch(err){ errEl.textContent = 'حصل خطأ، حاول تاني'; console.error(err); }
});

// ---------- SCHEDULE (admin) ----------
const DAY_NAMES = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

function renderScheduleList(){
  const wrap = $('#scheduleList');
  if(reviewEmployeesFor(viewBranch).length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش موظفين</div>'; return; }
  wrap.innerHTML = reviewEmployeesFor(viewBranch).map(e=> `
    <div class="emp-row" style="flex-wrap:wrap; gap:8px;">
      <div class="n">${e.name}</div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-size:11px; color:var(--sub);">حضور</span>
        <input type="time" data-act="start" data-id="${e.id}" value="${e.scheduledStartTime || ''}"
          style="padding:8px; border-radius:8px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Cairo';">
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-size:11px; color:var(--sub);">انصراف</span>
        <input type="time" data-act="end" data-id="${e.id}" value="${e.scheduledEndTime || ''}"
          style="padding:8px; border-radius:8px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Cairo';">
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-size:11px; color:var(--sub);">يوم الإجازة</span>
        <select data-act="dayoff" data-id="${e.id}" style="padding:8px; border-radius:8px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Cairo';">
          <option value="">بدون</option>
          ${DAY_NAMES.map((d,i)=> `<option value="${i}" ${String(e.dayOff)===String(i)?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-size:11px; color:var(--sub);">حد أدنى نقط/أسبوع لاستحقاق المكافأة</span>
        <input type="number" min="0" data-act="minpoints" data-id="${e.id}" value="${e.minWeeklyPoints || ''}" placeholder="بدون حد"
          style="width:80px; padding:8px; border-radius:8px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Space Grotesk';">
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-size:11px; color:var(--sub);">المرتب الأساسي/شهر</span>
        <input type="number" min="0" data-act="salary" data-id="${e.id}" value="${e.baseSalary || ''}" placeholder="بالجنيه"
          style="width:90px; padding:8px; border-radius:8px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Space Grotesk';">
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-size:11px; color:var(--sub);">تاريخ التعيين</span>
        <input type="date" data-act="hiredate" data-id="${e.id}" value="${e.hireDate || ''}"
          style="padding:8px; border-radius:8px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Cairo';">
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-size:11px; color:var(--gold);">📅 تتبع الحضور من</span>
        <input type="date" data-act="trackingstart" data-id="${e.id}" value="${e.attendanceTrackingStart || ''}"
          style="padding:8px; border-radius:8px; border:1px solid var(--gold-dim); background:var(--panel2); color:var(--ink); font-family:'Cairo';">
      </div>
    </div>
  `).join('');
  wrap.querySelectorAll('input[data-act="start"]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      try{ await updateDoc(doc(db,'sales_employees', inp.dataset.id), { scheduledStartTime: inp.value }); }
      catch(err){ console.error('تعذر حفظ ميعاد الحضور', err); }
    });
  });
  wrap.querySelectorAll('input[data-act="end"]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      try{ await updateDoc(doc(db,'sales_employees', inp.dataset.id), { scheduledEndTime: inp.value }); }
      catch(err){ console.error('تعذر حفظ ميعاد الانصراف', err); }
    });
  });
  wrap.querySelectorAll('input[data-act="minpoints"]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      const val = inp.value.trim() === '' ? null : parseInt(inp.value.trim());
      try{ await updateDoc(doc(db,'sales_employees', inp.dataset.id), { minWeeklyPoints: val }); }
      catch(err){ console.error('تعذر حفظ الحد الأدنى للنقط', err); }
    });
  });
  wrap.querySelectorAll('input[data-act="salary"]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      const val = inp.value.trim() === '' ? null : parseFloat(inp.value.trim());
      try{ await updateDoc(doc(db,'sales_employees', inp.dataset.id), { baseSalary: val }); }
      catch(err){ console.error('تعذر حفظ المرتب', err); }
    });
  });
  wrap.querySelectorAll('input[data-act="hiredate"]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      try{ await updateDoc(doc(db,'sales_employees', inp.dataset.id), { hireDate: inp.value || null }); }
      catch(err){ console.error('تعذر حفظ تاريخ التعيين', err); }
    });
  });
  wrap.querySelectorAll('input[data-act="trackingstart"]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      try{ await updateDoc(doc(db,'sales_employees', inp.dataset.id), { attendanceTrackingStart: inp.value || null }); }
      catch(err){ console.error('تعذر حفظ تاريخ تتبع الحضور', err); }
    });
  });
  wrap.querySelectorAll('select[data-act="dayoff"]').forEach(sel=>{
    sel.addEventListener('change', async ()=>{
      const val = sel.value === '' ? null : parseInt(sel.value);
      try{ await updateDoc(doc(db,'sales_employees', sel.dataset.id), { dayOff: val }); }
      catch(err){ console.error('تعذر حفظ يوم الإجازة', err); }
    });
  });
}

// ---------- TASK ASSIGNMENT (admin) ----------
function renderTaskAssignList(){
  const wrap = $('#taskAssignList');
  if(reviewEmployeesFor(viewBranch).length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش موظفين</div>'; return; }
  wrap.innerHTML = reviewEmployeesFor(viewBranch).map(e=>{
    const task = getCurrentTask(e.id);
    return `
    <div class="emp-row" style="flex-wrap:wrap;">
      <div class="n">${e.name}</div>
      <input type="text" data-id="${e.id}" placeholder="مثلاً: سكشن A" value="${task ? task.taskDescription.replace(/"/g,'&quot;') : ''}"
        style="flex:1; min-width:140px; padding:8px; border-radius:8px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-family:'Cairo';">
      <button data-id="${e.id}" class="saveTaskBtn" style="border:none; background:var(--good); color:#fff; padding:8px 14px; border-radius:8px; font-family:'Cairo'; font-weight:700; font-size:12px; cursor:pointer;">حفظ</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.saveTaskBtn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const input = wrap.querySelector(`input[data-id="${btn.dataset.id}"]`);
      const desc = input.value.trim();
      const emp = allEmployees.find(e=> e.id === btn.dataset.id);
      if(!desc || !emp) return;
      try{
        await setDoc(doc(db,'sales_tasks', btn.dataset.id), {
          employeeId: btn.dataset.id, employeeName: emp.name, branch: emp.branch,
          taskDescription: desc, assignedAt: Date.now()
        });
        btn.textContent = 'اتحفظت ✅';
        setTimeout(()=> btn.textContent = 'حفظ', 1500);
      }catch(err){ console.error('تعذر حفظ التاسك', err); }
    });
  });
}

// ---------- SUBMISSION REVIEW (admin) ----------
// Shows a small red dot on the settings gear whenever there's something
// awaiting admin action (currently: unconfirmed task submissions), so it's
// never missed even before opening the admin panel.
function updateGearBadge(){
  const badge = document.querySelector('#gearBadge');
  if(!badge) return;
  const branchEmpIds = new Set(window.employees.map(e=>e.id));
  const hasPending = submissions.some(s=> branchEmpIds.has(s.employeeId) && !s.confirmed && !s.rejected);
  badge.style.display = hasPending ? 'block' : 'none';
}

function renderPendingSubmissions(){
  const wrap = $('#pendingSubmissionsList');
  const branchEmpIds = new Set(reviewEmployeesFor(viewBranch).map(e=>e.id));
  const pending = allSubmissions.filter(s=> branchEmpIds.has(s.employeeId) && !s.confirmed && !s.rejected).sort((a,b)=> b.submittedAt-a.submittedAt);

  const badge = document.querySelector('#pendingBadge');
  if(badge){
    if(pending.length > 0){ badge.textContent = pending.length; badge.style.display = 'inline-flex'; }
    else{ badge.style.display = 'none'; }
  }

  if(pending.length === 0){ wrap.innerHTML = '<div class="empty">مفيش تنفيذات محتاجة تأكيد دلوقتي</div>'; return; }
  wrap.innerHTML = pending.map(s=>{
    const d = new Date(s.submittedAt);
    const time = d.toLocaleString('ar-EG',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    return `
    <div class="subRow" data-id="${s.id}">
      <img src="${s.photoURL}" alt="task photo" class="lightboxable" style="cursor:pointer;">
      <div class="info">
        <div class="n">${s.employeeName} — ${s.taskDescription||'—'}</div>
        <div class="m">${time}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="confirmBtnSmall" data-act="confirm" data-id="${s.id}">✅ تأكيد</button>
        <button class="confirmBtnSmall" data-act="reject" data-id="${s.id}" style="background:var(--bad);">❌ رفض</button>
      </div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-act="confirm"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      try{ await updateDoc(doc(db,'sales_task_submissions', btn.dataset.id), { confirmed:true, confirmedAt: Date.now() }); }
      catch(err){ console.error('تعذر التأكيد', err); }
    });
  });
  wrap.querySelectorAll('[data-act="reject"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('متأكد إنك عايز ترفض التنفيذ ده؟ الموظف هيشوف علامة رفض وهيقدر يصور تاني.')) return;
      try{ await updateDoc(doc(db,'sales_task_submissions', btn.dataset.id), { rejected:true, rejectedAt: Date.now(), confirmed:false }); }
      catch(err){ console.error('تعذر الرفض', err); }
    });
  });
  wrap.querySelectorAll('.lightboxable').forEach(img=>{
    img.addEventListener('click', ()=> openLightbox(img.src));
  });
}

function renderConfirmedSubmissions(){
  const wrap = $('#confirmedSubmissionsList');
  const branchEmpIds = new Set(reviewEmployeesFor(viewBranch).map(e=>e.id));
  const confirmed = allSubmissions.filter(s=> branchEmpIds.has(s.employeeId) && s.confirmed)
    .sort((a,b)=> b.submittedAt-a.submittedAt).slice(0,30);
  if(confirmed.length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش تنفيذات مؤكدة</div>'; return; }
  wrap.innerHTML = confirmed.map(s=>{
    const d = new Date(s.submittedAt);
    const time = d.toLocaleString('ar-EG',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    return `
    <div class="subRow">
      <img src="${s.photoURL}" alt="task photo" class="lightboxable" style="cursor:pointer;">
      <div class="info">
        <div class="n">${s.employeeName} — ${s.taskDescription||'—'}</div>
        <div class="m">${time}</div>
      </div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.lightboxable').forEach(img=>{
    img.addEventListener('click', ()=> openLightbox(img.src));
  });
}

function openLightbox(src){
  $('#lightboxImg').src = src;
  $('#photoLightbox').classList.add('show');
}
$('#lightboxCloseBtn').addEventListener('click', ()=> $('#photoLightbox').classList.remove('show'));
$('#photoLightbox').addEventListener('click', (e)=>{
  if(e.target.id === 'photoLightbox') $('#photoLightbox').classList.remove('show');
});

// ---------- REWARDS LOG (admin) ----------
function renderRewardsList(){
  const wrap = $('#rewardsList');
  const branchEmpIds = new Set(reviewEmployeesFor(viewBranch).map(e=>e.id));
  const list = allRewards.filter(r=> branchEmpIds.has(r.employeeId)).sort((a,b)=> b.earnedAt-a.earnedAt);
  if(list.length === 0){ wrap.innerHTML = '<div class="empty">لسه محدش كسب مكافأة</div>'; return; }

  const byMonth = new Map();
  list.forEach(r=>{
    const key = new Date(r.earnedAt).toLocaleDateString('ar-EG', {month:'long', year:'numeric'});
    if(!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(r);
  });

  wrap.innerHTML = Array.from(byMonth.entries()).map(([monthKey, items])=>{
    const rows = items.map(r=>{
      const time = new Date(r.earnedAt).toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit'});
      return `<tr>
        <td>${time}</td><td>${r.employeeName}</td>
        <td>${r.type==='weekly'?'أسبوعية':'شهرية'}</td>
        <td>${r.periodLabel}</td>
        <td style="color:var(--gold); font-weight:700;">${r.amount} ج.م</td>
      </tr>`;
    }).join('');
    return `
    <div class="dayLogGroup">
      <div class="dayLogHead" data-group="${monthKey}">
        <span>${monthKey}</span>
        <span style="color:var(--gold);">${items.length} مكافأة <span class="chev">▾</span></span>
      </div>
      <div class="dayLogBody">
        <table class="logTable"><thead><tr><th>التاريخ</th><th>الموظف</th><th>النوع</th><th>الفترة</th><th>المبلغ</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>`;
  }).join('');
  wireDayLogToggles(wrap);
}

// Shared toggle wiring for any collapsible day/month log group.
function wireDayLogToggles(wrap){
  wrap.querySelectorAll('.dayLogHead').forEach(head=>{
    head.addEventListener('click', ()=>{
      const body = head.nextElementSibling;
      const isOpen = body.classList.contains('open');
      body.classList.toggle('open', !isOpen);
      head.classList.toggle('open', !isOpen);
    });
  });
}

// ---------- FULL ATTENDANCE HISTORY (admin) ----------
function populateAttendanceEmpFilter(){
  const sel = $('#attendanceEmpFilter');
  if(!sel) return;
  const prev = sel.value || '__ALL__';
  const branchEmps = reviewEmployeesFor(viewBranch);
  sel.innerHTML = '<option value="__ALL__">كل الموظفين</option>' +
    branchEmps.map(e=> `<option value="${e.id}">${e.name}${viewBranch==='__ALL__' ? ' — '+(e.branch||'—') : ''}</option>`).join('');
  sel.value = branchEmps.some(e=>e.id===prev) || prev==='__ALL__' ? prev : '__ALL__';
}
$('#attendanceEmpFilter')?.addEventListener('change', renderAttendanceHistory);

function getAttendanceHistoryList(){
  const branchEmpIds = new Set(reviewEmployeesFor(viewBranch).map(e=>e.id));
  const filterEmp = $('#attendanceEmpFilter') ? $('#attendanceEmpFilter').value : '__ALL__';
  return allShifts.filter(s=> branchEmpIds.has(s.employeeId) && (filterEmp==='__ALL__' || s.employeeId===filterEmp))
    .sort((a,b)=> b.clockInTs - a.clockInTs);
}

function renderAttendanceHistory(){
  const wrap = $('#attendanceHistoryList');
  if(!wrap) return;
  populateAttendanceEmpFilter();
  const list = getAttendanceHistoryList().slice(0, 500);
  if(list.length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش سجل حضور</div>'; return; }

  const byDay = new Map();
  list.forEach(s=>{
    const key = new Date(s.clockInTs).toLocaleDateString('ar-EG', {day:'2-digit', month:'2-digit', year:'numeric'});
    if(!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(s);
  });
  const dayKeys = Array.from(byDay.keys()).slice(0, 90);

  wrap.innerHTML = dayKeys.map(dayKey=>{
    const items = byDay.get(dayKey);
    const rows = items.map(s=>{
      const inTime = new Date(s.clockInTs).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
      const outTime = s.clockOutTs ? new Date(s.clockOutTs).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}) : '—';
      const duration = s.clockOutTs ? formatDuration(s.clockOutTs - s.clockInTs) : 'لسه شغال';
      const lateTxt = s.lateMinutes > 0 ? `${s.lateMinutes}د` : '—';
      const otTxt = s.overtimeMinutes > 0 ? `${s.overtimeMinutes}د` : '—';
      const inPhoto = s.clockInPhoto ? `<img src="${s.clockInPhoto}" class="lightboxable" style="width:32px; height:32px; border-radius:6px; object-fit:cover; cursor:pointer;">` : '—';
      const outPhoto = s.clockOutPhoto ? `<img src="${s.clockOutPhoto}" class="lightboxable" style="width:32px; height:32px; border-radius:6px; object-fit:cover; cursor:pointer;">` : '—';
      return `<tr>
        <td>${s.employeeName}</td><td>${inTime}</td><td>${outTime}</td>
        <td>${duration}</td>
        <td style="color:${s.lateMinutes>0?'var(--bad)':'var(--sub)'}">${lateTxt}</td>
        <td style="color:${s.overtimeMinutes>0?'var(--gold)':'var(--sub)'}">${otTxt}</td>
        <td>${inPhoto}</td>
        <td>${outPhoto}</td>
      </tr>`;
    }).join('');
    return `
    <div class="dayLogGroup">
      <div class="dayLogHead" data-group="${dayKey}">
        <span>${dayKey}</span>
        <span style="color:var(--gold);">${items.length} سجل <span class="chev">▾</span></span>
      </div>
      <div class="dayLogBody">
        <div style="overflow-x:auto;"><table class="logTable"><thead><tr><th>الموظف</th><th>حضور</th><th>انصراف</th><th>المدة</th><th>تأخير</th><th>إضافي</th><th>صورة حضور</th><th>صورة انصراف</th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>
    </div>`;
  }).join('');

  wireDayLogToggles(wrap);
  wrap.querySelectorAll('.lightboxable').forEach(img=>{
    img.addEventListener('click', ()=> openLightbox(img.src));
  });
}

$('#exportAttendanceCsvBtn')?.addEventListener('click', ()=>{
  const list = getAttendanceHistoryList();
  if(list.length === 0){ alert('لا توجد بيانات للتصدير'); return; }
  let csv = 'التاريخ,الموظف,وقت الحضور,وقت الانصراف,المدة بالدقايق,التأخير بالدقايق,الوقت الإضافي بالدقايق\n';
  list.forEach(s=>{
    const inD = new Date(s.clockInTs);
    const dateStr = inD.toLocaleDateString('ar-EG');
    const inTime = inD.toLocaleTimeString('ar-EG');
    const outTime = s.clockOutTs ? new Date(s.clockOutTs).toLocaleTimeString('ar-EG') : 'لسه شغال';
    const durationMin = s.clockOutTs ? Math.round((s.clockOutTs - s.clockInTs)/60000) : '';
    csv += `"${dateStr}","${s.employeeName}","${inTime}","${outTime}","${durationMin}","${s.lateMinutes||0}","${s.overtimeMinutes||0}"\n`;
  });
  const blob = new Blob(["\ufeff"+csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'attendance-' + window.currentBranch + '.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- COMPREHENSIVE REPORT (admin) ----------
// ---------- WEEKLY AGGREGATE PERFORMANCE (admin) ----------
function computeWeekComposite(emp, weekStart, weekEnd){
  const elapsedRequiredDays = countElapsedWorkDaysInRange(emp, weekStart, weekEnd);
  const daysPresent = allShifts.filter(s=> s.employeeId===emp.id && s.clockInTs >= weekStart.getTime() && s.clockInTs <= weekEnd.getTime()).length;
  const weekShifts = allShifts.filter(s=> s.employeeId===emp.id && s.clockInTs >= weekStart.getTime() && s.clockInTs <= weekEnd.getTime());
  const lateCount = weekShifts.filter(s=> (s.lateMinutes||0) > 0).length;
  const confirmedTasks = countConfirmedDaysInRange(emp.id, weekStart, weekEnd);
  const avgRating = computeAvgRatingInRange(emp.id, weekStart.getTime(), weekEnd.getTime());

  const attendancePct = elapsedRequiredDays > 0 ? Math.min(100, Math.round(daysPresent/elapsedRequiredDays*100)) : 100;
  const punctualityPct = daysPresent > 0 ? Math.round((daysPresent-lateCount)/daysPresent*100) : 100;
  const taskPct = elapsedRequiredDays > 0 ? Math.min(100, Math.round(confirmedTasks/elapsedRequiredDays*100)) : 100;
  const ratingPct = avgRating === null ? null : Math.round((avgRating-1)/3*100); // maps 1..4 scale to 0..100%
  const parts = [attendancePct, punctualityPct, taskPct];
  if(ratingPct !== null) parts.push(ratingPct);
  return Math.round(parts.reduce((a,b)=>a+b,0)/parts.length);
}

function buildWeeklyAggregateData(){
  const week = getWeekRange(new Date());
  return reviewEmployeesFor(viewBranch).map(e=>{
    const requiredDays = countRequiredWorkDaysInRange(e, week.start, week.end);
    const elapsedRequiredDays = countElapsedWorkDaysInRange(e, week.start, week.end);
    const daysPresent = allShifts.filter(s=> s.employeeId===e.id && s.clockInTs >= week.start.getTime() && s.clockInTs <= week.end.getTime()).length;
    const weekShifts = allShifts.filter(s=> s.employeeId===e.id && s.clockInTs >= week.start.getTime() && s.clockInTs <= week.end.getTime());
    const lateCount = weekShifts.filter(s=> (s.lateMinutes||0) > 0).length;
    const confirmedTasks = countConfirmedDaysInRange(e.id, week.start, week.end);
    const avgRating = computeAvgRatingInRange(e.id, week.start.getTime(), week.end.getTime());
    const composite = computeWeekComposite(e, week.start, week.end);

    return {
      name: e.name, requiredDays, elapsedRequiredDays, daysPresent, lateCount,
      confirmedTasks, avgRating, composite
    };
  });
}

function renderWeeklyAggregate(){
  const wrap = $('#weeklyAggregateList');
  if(!wrap) return;
  if(reviewEmployeesFor(viewBranch).length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش موظفين</div>'; return; }
  const data = buildWeeklyAggregateData();
  const rows = data.map(d=>{
    const color = d.composite >= 85 ? 'var(--good)' : d.composite >= 60 ? '#f2a93c' : 'var(--bad)';
    const ratingTxt = d.avgRating === null ? '—' : d.avgRating.toFixed(1)+'/4';
    return `
    <div class="overviewRow" style="grid-template-columns:1.3fr 0.7fr 0.7fr 0.7fr 0.8fr;">
      <div class="n">${d.name}</div>
      <div>حضور ${d.daysPresent}/${d.elapsedRequiredDays}</div>
      <div style="color:${d.lateCount>0?'var(--bad)':'var(--sub)'}">تأخير ${d.lateCount}</div>
      <div>تاسك ${d.confirmedTasks}/${d.elapsedRequiredDays}</div>
      <div style="font-weight:800; color:${color};">${d.composite}% (⭐${ratingTxt})</div>
    </div>`;
  }).join('');
  wrap.innerHTML = rows;
}

// ---------- MONTHLY PERFORMANCE TREND (admin) ----------
function populatePerfHistoryEmpSelect(){
  const sel = $('#perfHistoryEmpSelect');
  if(!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— اختار موظف —</option>' +
    reviewEmployeesFor(viewBranch).map(e=> `<option value="${e.id}">${e.name}</option>`).join('');
  if(reviewEmployeesFor(viewBranch).some(e=> e.id === prev)) sel.value = prev;
}
$('#perfHistoryEmpSelect')?.addEventListener('change', renderPerfHistory);

function buildMonthlyPerformanceData(empId, monthsBack){
  const emp = allEmployees.find(e=> e.id === empId);
  if(!emp) return [];
  const now = new Date();
  const results = [];
  for(let i=0; i<monthsBack; i++){
    const refDate = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const range = getMonthRange(refDate);
    const monthLabel = refDate.toLocaleDateString('ar-EG', {month:'long', year:'numeric'});

    const monthPoints = window.points.filter(p=> p.employeeId===empId && p.ts >= range.start.getTime() && p.ts <= range.end.getTime()).length;
    const avgRating = computeAvgRatingInRange(empId, range.start.getTime(), range.end.getTime());
    const confirmedTasks = countConfirmedDaysInRange(empId, range.start, range.end);
    const requiredDays = countRequiredWorkDaysInRange(emp, range.start, range.end);
    const monthShifts = allShifts.filter(s=> s.employeeId===empId && s.clockInTs >= range.start.getTime() && s.clockInTs <= range.end.getTime());
    const daysPresent = monthShifts.length;
    const lateCount = monthShifts.filter(s=> (s.lateMinutes||0) > 0).length;
    const monthRewards = allRewards.filter(r=> r.employeeId===empId && r.earnedAt >= range.start.getTime() && r.earnedAt <= range.end.getTime());
    const rewardTotal = monthRewards.reduce((s,r)=> s+r.amount, 0);
    const hasAnyActivity = monthPoints > 0 || daysPresent > 0;

    results.push({ monthLabel, monthPoints, avgRating, confirmedTasks, requiredDays, daysPresent, lateCount, rewardTotal, hasAnyActivity });
  }
  return results;
}

function renderPerfHistory(){
  populatePerfHistoryEmpSelect();
  const wrap = $('#perfHistoryList');
  if(!wrap) return;
  const empId = $('#perfHistoryEmpSelect').value;
  if(!empId){ wrap.innerHTML = '<div class="empty">اختار موظف من فوق عشان تشوف سجل أداءه</div>'; return; }

  const data = buildMonthlyPerformanceData(empId, 12).filter(d=> d.hasAnyActivity);
  if(data.length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش نشاط مسجل لهذا الموظف</div>'; return; }

  const rows = data.map((d,i)=>{
    const ratingTxt = d.avgRating === null ? '—' : d.avgRating.toFixed(1);
    const ratingColor = d.avgRating === null ? 'var(--sub)' : d.avgRating >= 3 ? 'var(--good)' : d.avgRating >= 2 ? '#f2a93c' : 'var(--bad)';
    // Simple trend arrow comparing this month's points to the previous (older) month shown.
    let trend = '';
    if(i < data.length - 1){
      if(d.monthPoints > data[i+1].monthPoints) trend = '<span style="color:var(--good);">▲</span>';
      else if(d.monthPoints < data[i+1].monthPoints) trend = '<span style="color:var(--bad);">▼</span>';
      else trend = '<span style="color:var(--sub);">—</span>';
    }
    return `<tr>
      <td>${d.monthLabel}</td>
      <td>${d.monthPoints} ${trend}</td>
      <td style="color:${ratingColor};">${ratingTxt}</td>
      <td>${d.confirmedTasks}/${d.requiredDays}</td>
      <td>${d.daysPresent}</td>
      <td style="color:${d.lateCount>0?'var(--bad)':'var(--sub)'}">${d.lateCount}</td>
      <td style="color:var(--gold); font-weight:700;">${d.rewardTotal} ج.م</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<div style="overflow-x:auto;"><table class="logTable">
    <thead><tr><th>الشهر</th><th>النقط</th><th>متوسط التقييم</th><th>مهام مؤكدة</th><th>أيام حضور</th><th>تأخير</th><th>مكافآت</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function buildFullReportData(){
  return reviewEmployeesFor(viewBranch).map(e=>{
    const empPoints = window.points.filter(p=> p.employeeId === e.id);
    const empSubs = allSubmissions.filter(s=> s.employeeId === e.id);
    const confirmedTasks = empSubs.filter(s=> s.confirmed).length;
    const rejectedTasks = empSubs.filter(s=> s.rejected).length;
    const empShifts = allShifts.filter(s=> s.employeeId === e.id);
    const daysPresent = empShifts.length;
    const lateCount = empShifts.filter(s=> (s.lateMinutes||0) > 0).length;
    const totalLateMin = empShifts.reduce((sum,s)=> sum + (s.lateMinutes||0), 0);
    const totalOvertimeMin = empShifts.reduce((sum,s)=> sum + (s.overtimeMinutes||0), 0);
    const empRewards = allRewards.filter(r=> r.employeeId === e.id);
    const totalRewardAmount = empRewards.reduce((sum,r)=> sum + r.amount, 0);
    const avgRatingHtml = computeAvgRatingFor(e.id);
    const avgRatingPlain = avgRatingHtml.replace(/<[^>]*>/g,'');
    return {
      name: e.name, totalPoints: empPoints.length, confirmedTasks, rejectedTasks,
      daysPresent, lateCount, totalLateMin, totalOvertimeMin,
      rewardsCount: empRewards.length, totalRewardAmount, avgRatingPlain
    };
  });
}

function renderFullReport(){
  const wrap = $('#fullReportList');
  if(!wrap) return;
  if(reviewEmployeesFor(viewBranch).length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش موظفين</div>'; return; }
  const data = buildFullReportData();
  const rows = data.map(d=> `<tr>
    <td>${d.name}</td>
    <td>${d.totalPoints}</td>
    <td>${d.confirmedTasks}</td>
    <td style="color:${d.rejectedTasks>0?'var(--bad)':'var(--sub)'}">${d.rejectedTasks}</td>
    <td>${d.daysPresent}</td>
    <td style="color:${d.lateCount>0?'var(--bad)':'var(--sub)'}">${d.lateCount} (${d.totalLateMin}د)</td>
    <td style="color:${d.totalOvertimeMin>0?'var(--gold)':'var(--sub)'}">${d.totalOvertimeMin}د</td>
    <td>${d.avgRatingPlain}</td>
    <td style="color:var(--gold); font-weight:700;">${d.rewardsCount} (${d.totalRewardAmount} ج.م)</td>
  </tr>`).join('');
  wrap.innerHTML = `<div style="overflow-x:auto;"><table class="logTable">
    <thead><tr>
      <th>الموظف</th><th>النقط</th><th>مهام مؤكدة</th><th>مهام مرفوضة</th>
      <th>أيام حضور</th><th>مرات تأخير</th><th>وقت إضافي</th><th>متوسط تقييم</th><th>المكافآت</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

$('#exportFullReportCsvBtn')?.addEventListener('click', ()=>{
  const data = buildFullReportData();
  if(data.length === 0){ alert('لا توجد بيانات للتصدير'); return; }
  let csv = 'الموظف,إجمالي النقط,مهام مؤكدة,مهام مرفوضة,أيام حضور,مرات تأخير,إجمالي دقايق التأخير,إجمالي دقايق الوقت الإضافي,متوسط التقييم,عدد المكافآت,إجمالي مبلغ المكافآت\n';
  data.forEach(d=>{
    csv += `"${d.name}","${d.totalPoints}","${d.confirmedTasks}","${d.rejectedTasks}","${d.daysPresent}","${d.lateCount}","${d.totalLateMin}","${d.totalOvertimeMin}","${d.avgRatingPlain}","${d.rewardsCount}","${d.totalRewardAmount}"\n`;
  });
  const blob = new Blob(["\ufeff"+csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'full-report-' + window.currentBranch + '.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- COMMISSION PER POINT (admin) ----------
function getMonthLabel(d){
  const dt = d || new Date();
  return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0');
}

// ---------- 🛒 أوردرات الموظفين ----------
function _staffOrderAdvanceOnApprove(o){ return o.payMethod==='salary' ? (o.total||0) : 0; }
function _staffOrderAdvanceOnReject(o){ return o.payMethod==='salary' ? (o.fullTotal||0) : (o.discountAmount||0); }
window.renderTodayStaffOrders = function(){
  const tag = $('#todayStaffOrdersTag'); if(!tag) return;
  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  const today = (window.staffOrders||[]).filter(o=> o.ts >= dayStart.getTime() && o.branch === window.currentBranch && o.status !== 'rejected');
  const total = today.reduce((s,o)=> s + (o.total||0), 0);
  if(!today.length){ tag.style.display = 'none'; return; }
  tag.style.display = '';
  tag.textContent = '🛒 أوردرات الموظفين النهاردة: ' + total.toFixed(0) + ' ج.م (' + today.length + ')';
};
window.renderStaffOrdersPanel = function(){
  const pendWrap = $('#staffOrdersPending'), logWrap = $('#staffOrdersLog'), badge = $('#staffOrdersBadge');
  if(!pendWrap) return;
  const all = (window.staffOrders||[]).slice().sort((a,b)=> b.ts - a.ts);
  const scope = viewBranch==='__ALL__' ? all : all.filter(o=> o.branch === viewBranch);
  const pending = scope.filter(o=> o.status === 'pending');
  if(badge){ badge.style.display = pending.length ? '' : 'none'; badge.textContent = pending.length; }

  const payLbl = (o)=> o.payMethod==='salary' ? '📄 خصم من الراتب' : '💵 كاش';
  const dstr = (ts)=> new Date(ts).toLocaleDateString('ar-EG', {day:'2-digit', month:'short'}) + ' ' + new Date(ts).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'});

  pendWrap.innerHTML = pending.length ? pending.map(o=>`
    <div class="emp-row" style="flex-wrap:wrap; border:1px solid rgba(192,132,252,.4); border-radius:12px; padding:10px; margin-bottom:8px;">
      <div style="flex:1; min-width:170px;">
        <div class="n">${o.employeeName||'؟'} <span style="color:var(--sub); font-size:10px;">· ${o.branch||''}</span></div>
        <div class="meta">🧾 ${o.invoiceNo||''} · ${dstr(o.ts)}</div>
        <div class="meta">${(o.fullTotal||0).toFixed(0)} ← <b style="color:var(--gold);">${(o.total||0).toFixed(0)} ج.م</b> (خصم ${o.discountPct||0}%) · ${payLbl(o)}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="confirmBtnSmall" data-soact="approve" data-id="${o.id}">✅ اعتماد</button>
        <button class="confirmBtnSmall" style="background:var(--bad);" data-soact="reject" data-id="${o.id}">❌ رفض</button>
      </div>
    </div>`).join('') : '<div class="empty">مفيش أوردرات مستنية 👌</div>';

  logWrap.innerHTML = scope.filter(o=> o.status !== 'pending').slice(0,30).map(o=>`
    <div class="emp-row" style="flex-wrap:wrap; opacity:.85;">
      <div class="n">${o.status==='approved'?'✅':'❌'} ${o.employeeName||'؟'}</div>
      <div class="meta">🧾 ${o.invoiceNo||''} · ${(o.total||0).toFixed(0)} ج.م · ${payLbl(o)} · ${dstr(o.decidedAt||o.ts)}${o.note?' · 📝 '+o.note:''}</div>
    </div>`).join('') || '<div class="empty">لسه مفيش سجل</div>';

  pendWrap.querySelectorAll('[data-soact]').forEach(btn=> btn.addEventListener('click', ()=> staffOrderDecide(btn.dataset.id, btn.dataset.soact)));
};
window.staffOrderDecide = async function(id, act){
  const o = (window.staffOrders||[]).find(x=> x.id === id); if(!o) return;
  if(act === 'approve'){
    const adv = _staffOrderAdvanceOnApprove(o);
    const msg = o.payMethod==='salary'
      ? 'اعتماد أوردر ' + o.employeeName + '؟\nهيتسجل خصم راتب (سلفة): ' + adv.toFixed(0) + ' ج.م'
      : 'اعتماد أوردر ' + o.employeeName + '؟ (مدفوع كاش — مفيش خصم راتب)';
    if(!confirm(msg)) return;
    try{
      if(adv > 0) await addDoc(advancesCol, { employeeId:o.employeeId, employeeName:o.employeeName, branch:o.branch, amount:adv, date:todayStr(), ts:Date.now(), source:'staff_order', invoiceNo:o.invoiceNo||'' });
      await updateDoc(doc(db,'sales_staff_orders', id), { status:'approved', decidedAt: Date.now() });
    }catch(e){ alert('حصل خطأ: ' + (e.code||e.message)); }
  }else{
    const note = prompt('سبب الرفض (اختياري):') || '';
    const adv = _staffOrderAdvanceOnReject(o);
    const msg = 'رفض أوردر ' + o.employeeName + '؟\nهتتحاسب بالسعر الكامل — هيتسجل عليها سلفة: ' + adv.toFixed(0) + ' ج.م' + (o.payMethod==='salary' ? ' (قيمة الفاتورة كاملة)' : ' (فرق الخصم)');
    if(!confirm(msg)) return;
    try{
      if(adv > 0) await addDoc(advancesCol, { employeeId:o.employeeId, employeeName:o.employeeName, branch:o.branch, amount:adv, date:todayStr(), ts:Date.now(), source:'staff_order_reject', invoiceNo:o.invoiceNo||'', note });
      await updateDoc(doc(db,'sales_staff_orders', id), { status:'rejected', decidedAt: Date.now(), note });
    }catch(e){ alert('حصل خطأ: ' + (e.code||e.message)); }
  }
};

// ---------- 🗂️ تبويبات لوحة الإدارة (بدل السكرول اللانهائي) ----------
const ADMIN_TAB_GROUPS = [
  { id:'emps',  label:'👥 الموظفين',        keys:['إضافة موظف','الموظفين الحاليين','إنهاء خدمة','سجل المغادرين'] },
  { id:'day',   label:'📊 اليوم والأداء',    keys:['رسالة للموظفين','أداء الموظف','نظرة عامة','مواعيد الحضور'] },
  { id:'tasks', label:'📋 المهام',           keys:['المهام الأسبوعية','مراجعة تنفيذ','المهام المؤكدة','سجل المكافآت'] },
  { id:'orders',label:'🛒 أوردرات ودعوات',   keys:['أوردرات الموظفين','أكواد دعوة'] },
  { id:'money', label:'💵 الفلوس',           keys:['عمولة النقط','سجل دفع العمولات','الرواتب الشهرية','سجل صرف الرواتب','سجل السلف'] }
];
let _adminTabsInited = false;
function initAdminTabs(){
  if(_adminTabsInited){ _refreshAdminTabDots(); return; }
  const admin = $('#admin'); if(!admin) return;
  const panels = [...admin.querySelectorAll(':scope > .panel')];
  panels.forEach(p=>{
    const t = (p.querySelector('h3')||{}).textContent || '';
    const g = ADMIN_TAB_GROUPS.find(gr=> gr.keys.some(k=> t.includes(k)));
    p.dataset.tabGroup = g ? g.id : 'emps';
  });
  const bar = document.createElement('div');
  bar.id = 'adminTabBar';
  bar.style.cssText = 'position:sticky; top:0; z-index:60; display:flex; gap:6px; flex-wrap:wrap; background:var(--bg,#12121a); padding:10px 0 12px; margin-bottom:6px; border-bottom:1px solid var(--line,#2a2a38);';
  bar.innerHTML = ADMIN_TAB_GROUPS.map(g=>
    `<button data-tab="${g.id}" style="position:relative; padding:10px 16px; border-radius:12px; border:1px solid var(--line,#2a2a38); background:var(--panel2,#1b1b26); color:var(--ink,#eee); font-family:'Cairo'; font-weight:800; font-size:12.5px; cursor:pointer;">${g.label}<span class="tabDot" style="display:none; position:absolute; top:-3px; left:-3px; width:10px; height:10px; border-radius:50%; background:var(--bad,#e5484d);"></span></button>`
  ).join('');
  const top = admin.querySelector('.admin-top');
  top.insertAdjacentElement('afterend', bar);
  bar.querySelectorAll('button[data-tab]').forEach(b=> b.addEventListener('click', ()=> showAdminTab(b.dataset.tab)));
  _adminTabsInited = true;
  showAdminTab(localStorage.getItem('admin_tab') || 'emps');
  setInterval(_refreshAdminTabDots, 3000);
}
function showAdminTab(id){
  localStorage.setItem('admin_tab', id);
  $('#admin').querySelectorAll(':scope > .panel').forEach(p=>{
    p.style.display = (p.dataset.tabGroup === id) ? '' : 'none';
  });
  const bar = $('#adminTabBar');
  if(bar) bar.querySelectorAll('button[data-tab]').forEach(b=>{
    const on = b.dataset.tab === id;
    b.style.background = on ? 'var(--gold,#d4af37)' : 'var(--panel2,#1b1b26)';
    b.style.color = on ? '#1a1200' : 'var(--ink,#eee)';
  });
  _refreshAdminTabDots();
}
function _refreshAdminTabDots(){
  const bar = $('#adminTabBar'); if(!bar) return;
  const dotFor = (tab, on)=>{ const b = bar.querySelector('button[data-tab="'+tab+'"] .tabDot'); if(b) b.style.display = on ? '' : 'none'; };
  const pend = $('#pendingBadge'); dotFor('tasks', pend && pend.style.display !== 'none' && +pend.textContent > 0);
  const so = $('#staffOrdersBadge'); dotFor('orders', so && so.style.display !== 'none' && +so.textContent > 0);
}

function _refAppFor(branch){
  return /glow/i.test(branch||'') ? 'glow' : 'loyalty';
}
function _refUrl(emp, app){
  return 'https://www.echarpe.store/' + app + '/?src=emp-' + emp.id;
}
function _refIsActive(r){ return !r.status || r.status === 'active'; }
window.renderReferralPanel = function(){
  const wrap = $('#referralList'); if(!wrap) return;
  const emps = reviewEmployeesFor(viewBranch);
  if(!emps.length){ wrap.innerHTML = '<div class="empty">لسه مفيش موظفين</div>'; return; }
  const mr = getMonthRange(new Date());
  wrap.innerHTML = emps.map(e=>{
    const mine = (window.appReferrals||[]).filter(r=> r.employeeId===e.id);
    const month = mine.filter(r=> r.ts>=mr.start.getTime() && r.ts<=mr.end.getTime());
    const monthActive = month.filter(_refIsActive);
    const monthPending = month.length - monthActive.length;
    const monthAmt = monthActive.reduce((s,r)=> s+(r.amount||0), 0);
    return `<div class="emp-row" style="flex-wrap:wrap;">
      <div class="n">${e.name}</div>
      <div class="meta">📱 الشهر ده: ✅ ${monthActive.length} مفعّلة (${monthAmt} ج.م)${monthPending?` · ⏳ ${monthPending} مستنية أول شراء`:''} · الإجمالي: ${mine.filter(_refIsActive).length}</div>
      <button class="confirmBtnSmall" data-refqr="${e.id}">🎫 كود الدعوة</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-refqr]').forEach(btn=> btn.addEventListener('click', ()=>{
    const emp = allEmployees.find(x=> x.id===btn.dataset.refqr); if(emp) showEmpReferralQR(emp);
  }));
};
window.showEmpReferralQR = function(emp){
  const old = document.getElementById('empQrOverlay'); if(old) old.remove();
  const app = _refAppFor(emp.branch || window.currentBranch);
  const ov = document.createElement('div');
  ov.id = 'empQrOverlay';
  ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;';
  const build = (appId)=>{
    const url = _refUrl(emp, appId);
    const img = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=2&data=' + encodeURIComponent(url);
    ov.querySelector('#empQrImg').src = img;
    ov.querySelector('#empQrApp').textContent = appId==='glow' ? 'Glow' : 'echarpe';
    ov._img = img; ov._app = appId;
  };
  ov.innerHTML = `<div style="background:#fff; color:#111; border-radius:16px; padding:20px; text-align:center; max-width:340px; width:100%;">
    <div style="font-weight:800; font-size:16px;">🎫 كود دعوة: ${emp.name}</div>
    <div style="color:#666; font-size:12px; margin:4px 0 10px;">تطبيق <span id="empQrApp"></span> — العميلة تمسحه بكاميرا موبايلها</div>
    <img id="empQrImg" style="width:230px; height:230px;">
    <div style="display:flex; gap:8px; margin-top:12px;">
      <button id="empQrPrint" style="flex:1; padding:11px; border-radius:9px; border:none; background:#1a7f37; color:#fff; font-weight:800; cursor:pointer;">🖨️ اطبع الكارت</button>
      <button id="empQrClose" style="flex:1; padding:11px; border-radius:9px; border:1px solid #ccc; background:#f5f5f5; color:#333; font-weight:700; cursor:pointer;">إغلاق</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  build(app);
  ov.querySelector('#empQrClose').onclick = ()=> ov.remove();
  ov.querySelector('#empQrPrint').onclick = ()=>{
    const w = window.open('', '_blank', 'width=420,height=560');
    w.document.write('<html dir="rtl"><head><meta charset="UTF-8"><style>body{font-family:Tahoma; text-align:center; padding:22px;} h2{margin:4px 0;} .n{font-size:15px; color:#444; margin-bottom:12px;} img{width:270px;} .g{margin-top:10px; font-weight:800; font-size:14px;}</style></head><body>'
      + '<h2>حمّلي تطبيق ' + (ov._app==='glow'?'Glow':'echarpe') + ' 📱</h2>'
      + '<div class="n">دعوة من: ' + emp.name + ' 💕</div>'
      + '<img src="' + ov._img + '">'
      + '<div class="g">🎁 فعّلي الإشعارات ومستنياكي مكافأة ترحيب!</div>'
      + '<script>var i=document.querySelector("img"); i.complete?print():i.onload=function(){print(); setTimeout(close,400);};<\/script></body></html>');
    w.document.close();
  };
};

// ---------- 🎯 عمولة التارجت (نسبة من المبيعات عند تحقيق تارجت الموظف/الفرع) ----------
let staffPointsCfg = null;
let _tgtCache = { month: null, rows: [], loading: false };
async function loadTargetData(){
  const mr = getMonthRange(new Date());
  const mKey = getMonthLabel();
  if(_tgtCache.loading || _tgtCache.month === mKey) return;
  _tgtCache.loading = true;
  try{
    const cfgSnap = await getDoc(doc(db, 'pos_test_settings', 'staff_points'));
    staffPointsCfg = cfgSnap.exists() ? cfgSnap.data() : null;
    if(staffPointsCfg && staffPointsCfg.targetEnabled && (staffPointsCfg.commissionPct||0) > 0){
      const qs = await getDocs(query(collection(db, 'pos_test_sales'),
        where('createdAt', '>=', Timestamp.fromMillis(mr.start.getTime()))));
      _tgtCache.rows = qs.docs.map(d=>{ const s=d.data(); return {
        branch: s.branch||'', total: +s.total||0,
        sellerId: s.sellerEmployeeId || '', reversed: !!s.reversed
      };}).filter(r=> !r.reversed);
    } else { _tgtCache.rows = []; }
    _tgtCache.month = mKey;
  }catch(e){ console.warn('target data', e); }
  _tgtCache.loading = false;
  renderCommissionPanel();
}
function _targetInfoFor(emp){
  const cfg = staffPointsCfg;
  if(!cfg || !cfg.targetEnabled || !(cfg.commissionPct>0) || !(cfg.targetAmount>0)) return null;
  const empSales = _tgtCache.rows.filter(r=> r.sellerId===emp.id).reduce((s,r)=> s+r.total, 0);
  const branchSales = _tgtCache.rows.filter(r=> r.branch===emp.branch).reduce((s,r)=> s+r.total, 0);
  const basis = cfg.targetScope==='branch' ? branchSales : empSales;
  const achieved = basis >= cfg.targetAmount;
  const amount = achieved ? Math.round(empSales * cfg.commissionPct) / 100 : 0;  // pct% من مبيعات الموظفة نفسها
  return { empSales, branchSales, basis, achieved, amount,
    scopeLabel: cfg.targetScope==='branch' ? 'الفرع' : 'الموظفة',
    targetAmount: cfg.targetAmount, pct: cfg.commissionPct };
}
function renderCommissionPanel(){
  const input = $('#commissionPerPointInput');
  if(!input) return;
  if(document.activeElement !== input) input.value = commissionPerPoint || '';
  $('#commissionCurrentRate').textContent = commissionPerPoint > 0
    ? `العمولة الحالية: ${commissionPerPoint} ج.م لكل نقطة`
    : 'لسه معملتش عمولة لهذا الفرع';

  const wrap = $('#commissionList');
  loadTargetData();
  if(reviewEmployeesFor(viewBranch).length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش موظفين</div>'; return; }
  const monthLabel = getMonthLabel();
  const monthRange = getMonthRange(new Date());

  wrap.innerHTML = reviewEmployeesFor(viewBranch).map(e=>{
    const pointsThisMonth = window.points.filter(p=> p.employeeId===e.id && p.ts >= monthRange.start.getTime() && p.ts <= monthRange.end.getTime()).length;
    const paidThisMonth = allCommissionPayments.filter(p=> p.employeeId===e.id && p.monthLabel===monthLabel);
    const pointsAlreadyPaid = paidThisMonth.filter(p=> p.type!=='referrals').reduce((sum,p)=> sum + (p.pointsCount||0), 0);
    const amountAlreadyPaid = paidThisMonth.filter(p=> p.type!=='referrals').reduce((sum,p)=> sum + (p.commissionAmount||0), 0);
    const newPoints = Math.max(0, pointsThisMonth - pointsAlreadyPaid);
    const newAmount = Math.round(newPoints * commissionPerPoint * 100)/100;

    // 📱 عمولة التنزيلات (منفصلة عن النقط — بسعرها المسجل في كل تنزيل)
    const refsMonth = (window.appReferrals||[]).filter(r=> r.employeeId===e.id && r.ts>=monthRange.start.getTime() && r.ts<=monthRange.end.getTime() && _refIsActive(r));
    const refAmtMonth = refsMonth.reduce((s,r)=> s+(r.amount||0), 0);
    const refPaid = paidThisMonth.filter(p=> p.type==='referrals');
    const refCountPaid = refPaid.reduce((s,p)=> s+(p.pointsCount||0), 0);
    const refAmtPaid = refPaid.reduce((s,p)=> s+(p.commissionAmount||0), 0);
    const refNewCount = Math.max(0, refsMonth.length - refCountPaid);
    const refNewAmt = Math.round(Math.max(0, refAmtMonth - refAmtPaid)*100)/100;
    const refHtml = refsMonth.length ? `<div class="meta">📱 تنزيلات: ${refsMonth.length} (${refAmtMonth} ج.م)</div>` : '';
    const refPayBtn = refNewCount>0 ? `<button class="confirmBtnSmall" data-act="payref" data-id="${e.id}" data-count="${refNewCount}" data-amount="${refNewAmt}">📱 ادفع ${refNewAmt} ج.م (${refNewCount} تنزيل)</button>` : '';
    const paidNote = amountAlreadyPaid > 0
      ? `<div class="meta" style="color:var(--sub); font-size:10px;">اتدفع قبل كده: ${amountAlreadyPaid} ج.م (${pointsAlreadyPaid} نقطة)</div>` : '';
    const actionHtml = newPoints <= 0
      ? `<span style="color:var(--good); font-size:11px;">✅ كل النقط لحد دلوقتي مدفوعة</span>`
      : `<button class="confirmBtnSmall" data-act="pay" data-id="${e.id}" data-points="${newPoints}" data-amount="${newAmount}">✅ ادفع ${newAmount} ج.م (${newPoints} نقطة جديدة)</button>`;
    // 🎯 التارجت
    const tgt = _targetInfoFor(e);
    let tgtHtml = '', tgtPayBtn = '';
    if(tgt){
      const tgtPaid = paidThisMonth.filter(p=> p.type==='target').reduce((s,p)=> s+(p.commissionAmount||0), 0);
      const tgtNew = Math.round(Math.max(0, tgt.amount - tgtPaid)*100)/100;
      if(tgt.achieved){
        tgtHtml = `<div class="meta" style="color:var(--good);">🎯 حقق تارجت ${tgt.scopeLabel} (${tgt.basis.toFixed(0)} من ${tgt.targetAmount}) → ${tgt.pct}% من مبيعاته ${tgt.empSales.toFixed(0)} = ${tgt.amount} ج.م${tgtPaid?` · اتدفع ${tgtPaid}`:''}</div>`;
        if(tgtNew > 0) tgtPayBtn = `<button class="confirmBtnSmall" style="background:#7c3aed; color:#fff;" data-act="paytarget" data-id="${e.id}" data-amount="${tgtNew}" data-base="${tgt.empSales.toFixed(0)}">🎯 ادفع عمولة التارجت ${tgtNew} ج.م</button>`;
      }else{
        tgtHtml = `<div class="meta" style="color:var(--sub); font-size:10.5px;">🎯 تارجت ${tgt.scopeLabel}: ${tgt.basis.toFixed(0)} من ${tgt.targetAmount} — فاضل ${(tgt.targetAmount - tgt.basis).toFixed(0)} ج.م</div>`;
      }
    }
    return `
    <div class="emp-row" style="flex-wrap:wrap;">
      <div class="n">${e.name}</div>
      <div class="meta">${pointsThisMonth} نقطة إجمالي الشهر</div>
      ${refHtml}
      ${tgtHtml}
      ${paidNote}
      ${actionHtml}
      ${refPayBtn}
      ${tgtPayBtn}
    </div>`;
  }).join('');

  wrap.querySelectorAll('[data-act="payref"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const emp = allEmployees.find(e=> e.id === btn.dataset.id);
      if(!emp) return;
      if(!confirm(`تأكيد دفع ${btn.dataset.amount} ج.م لـ ${emp.name} عمولة ${btn.dataset.count} تنزيل تطبيق (شهر ${monthLabel})؟`)) return;
      try{
        await addDoc(commissionPaymentsCol, {
          employeeId: emp.id, employeeName: emp.name, branch: emp.branch, type: 'referrals',
          monthLabel, pointsCount: parseInt(btn.dataset.count), commissionAmount: parseFloat(btn.dataset.amount),
          paidAt: Date.now()
        });
      }catch(err){ alert('حصل خطأ: ' + (err && err.code ? err.code : '')); }
    });
  });
  wrap.querySelectorAll('[data-act="paytarget"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const emp = allEmployees.find(e=> e.id === btn.dataset.id);
      if(!emp) return;
      if(!confirm(`تأكيد دفع ${btn.dataset.amount} ج.م لـ ${emp.name} عمولة تحقيق التارجت (${btn.dataset.base} ج.م مبيعات — شهر ${monthLabel})؟`)) return;
      try{
        await addDoc(commissionPaymentsCol, {
          employeeId: emp.id, employeeName: emp.name, branch: emp.branch, type: 'target',
          monthLabel, commissionAmount: parseFloat(btn.dataset.amount), salesBase: parseFloat(btn.dataset.base),
          paidAt: Date.now()
        });
      }catch(err){ alert('حصل خطأ: ' + (err && err.code ? err.code : '')); }
    });
  });
  wrap.querySelectorAll('[data-act="pay"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const emp = allEmployees.find(e=> e.id === btn.dataset.id);
      if(!emp) return;
      if(!confirm(`تأكيد دفع ${btn.dataset.amount} ج.م لـ ${emp.name} عن ${btn.dataset.points} نقطة جديدة (شهر ${monthLabel})؟`)) return;
      try{
        await addDoc(commissionPaymentsCol, {
          employeeId: emp.id, employeeName: emp.name, branch: emp.branch,
          monthLabel, pointsCount: parseInt(btn.dataset.points), commissionAmount: parseFloat(btn.dataset.amount),
          paidAt: Date.now()
        });
      }catch(err){ console.error('تعذر تسجيل الدفع', err); alert('حصل خطأ: ' + (err && err.code ? err.code : 'غير معروف')); }
    });
  });
}

window._callRefPanel = setInterval(()=>{ if(typeof renderReferralPanel==='function' && $('#referralList')) { renderReferralPanel(); clearInterval(window._callRefPanel);} }, 800);
function renderCommissionPaymentLog(){
  const wrap = $('#commissionPaymentLogList');
  if(!wrap) return;
  const branchEmpIds = new Set(reviewEmployeesFor(viewBranch).map(e=>e.id));
  const branchPayments = allCommissionPayments.filter(p=> branchEmpIds.has(p.employeeId));
  if(branchPayments.length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش عمولات اتدفعت</div>'; return; }
  const sorted = [...branchPayments].sort((a,b)=> b.paidAt - a.paidAt);

  const byMonth = new Map();
  sorted.forEach(p=>{
    const key = p.monthLabel || 'غير معروف';
    if(!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(p);
  });

  wrap.innerHTML = Array.from(byMonth.entries()).map(([monthKey, items])=>{
    const monthTotal = items.reduce((sum,p)=> sum + p.commissionAmount, 0);
    const rows = items.map(p=>{
      const dateStr = new Date(p.paidAt).toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit'});
      return `<tr><td>${p.employeeName}</td><td>${p.pointsCount} نقطة</td><td style="color:var(--gold); font-weight:700;">${p.commissionAmount} ج.م</td><td>${dateStr}</td></tr>`;
    }).join('');
    return `
    <div class="dayLogGroup">
      <div class="dayLogHead" data-group="${monthKey}">
        <span>${monthKey}</span>
        <span style="color:var(--gold);">${monthTotal} ج.م (${items.length}) <span class="chev">▾</span></span>
      </div>
      <div class="dayLogBody">
        <table class="logTable"><thead><tr><th>الموظف</th><th>النقط</th><th>المبلغ</th><th>تاريخ الدفع</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>`;
  }).join('');
  wireDayLogToggles(wrap);
}

$('#saveCommissionBtn')?.addEventListener('click', async ()=>{
  const val = parseFloat($('#commissionPerPointInput').value);
  if(isNaN(val) || val < 0){ alert('اكتب رقم صحيح'); return; }
  try{
    await setDoc(doc(db,'sales_settings', window.currentBranch), { commissionPerPoint: val }, { merge:true });
  }catch(err){ console.error('تعذر حفظ العمولة', err); alert('حصل خطأ: ' + (err && err.code ? err.code : 'غير معروف')); }
});

document.querySelector('#saveAnnouncementBtn')?.addEventListener('click', async ()=>{
  const btn = document.querySelector('#saveAnnouncementBtn');
  const text = document.querySelector('#announcementInput').value.trim();
  const originalLabel = btn.textContent;
  btn.disabled = true;
  try{
    await setDoc(doc(db,'sales_settings', window.currentBranch), { announcement: text }, { merge:true });
    // Update locally right away instead of waiting on the snapshot round-trip.
    window.currentAnnouncement = text;
    renderAnnouncementBanner();
    document.querySelector('#announcementErr').textContent = '';
    btn.textContent = text ? 'اتنشرت ✅' : 'اتشالت الرسالة ✅';
  }catch(err){
    console.error('تعذر حفظ الرسالة', err);
    document.querySelector('#announcementErr').textContent = 'خطأ: ' + (err && err.message ? err.message : String(err)) + (err && err.code ? (' [كود: '+err.code+']') : '');
  }
  setTimeout(()=>{ btn.textContent = originalLabel; btn.disabled = false; }, 1800);
});

document.querySelector('#saveDailyTargetBtn')?.addEventListener('click', async ()=>{
  const btn = document.querySelector('#saveDailyTargetBtn');
  const val = parseInt(document.querySelector('#dailyTargetInput').value);
  const target = isNaN(val) || val < 0 ? 0 : val;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  try{
    await setDoc(doc(db,'sales_settings', window.currentBranch), { dailyTarget: target }, { merge:true });
    // Update locally right away instead of waiting on the snapshot round-trip.
    window.dailyTarget = target;
    renderDailyTargetCard();
    btn.textContent = target > 0 ? `اتحفظ (${target}) ✅` : 'اتلغى التارجت ✅';
  }catch(err){
    console.error('تعذر حفظ التارجت', err);
    btn.textContent = 'خطأ: ' + (err && err.message ? err.message.slice(0,40) : String(err).slice(0,40));
  }
  setTimeout(()=>{ btn.textContent = originalLabel; btn.disabled = false; }, 1800);
});

// ---------- SALARY (admin) ----------
const FREE_DAYOFF_PER_MONTH = 4;

function getMonthDateRange(d){
  // Salary period is always day 1 to day 30 of the calendar month, per the
  // simplified pay-cycle rule (day 31, if any, isn't counted separately).
  const dt = d || new Date();
  const start = new Date(dt.getFullYear(), dt.getMonth(), 1, 0,0,0,0);
  const end = new Date(dt.getFullYear(), dt.getMonth(), 30, 23,59,59,999);
  return { start, end };
}

function countDayOffOccurrencesInRange(emp, start, end){
  if(emp.dayOff === undefined || emp.dayOff === null || emp.dayOff === '') return 0;
  let count = 0;
  const cur = new Date(start);
  while(cur <= end){
    if(cur.getDay() === Number(emp.dayOff)) count++;
    cur.setDate(cur.getDate()+1);
  }
  return count;
}

// Distinct CALENDAR DAYS the employee actually clocked in during the range —
// used to detect real unauthorized absences (a required work day with no
// attendance record at all), not just to count their scheduled day off.
function countAttendedDaysInRange(empId, start, end){
  const daySet = new Set();
  allShifts.filter(s=> s.employeeId===empId && s.clockInTs >= start.getTime() && s.clockInTs <= end.getTime())
    .forEach(s=>{
      const d = new Date(s.clockInTs);
      daySet.add(d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate());
    });
  return daySet.size;
}

// Computes pay for any date range within a salary cycle — used both for the
// regular full-month calculation and for a prorated final settlement.
function computeSalary(emp, periodStart, end){
  const baseSalary = emp.baseSalary || 0;
  // Daily/hourly rate always uses a FIXED 30-day divisor, regardless of
  // whether the actual calendar month has 28, 30, or 31 days. This only
  // matters for partial periods (mid-month hire/termination) and for
  // deductions/bonuses/overtime — a FULL month worked always pays the exact
  // base salary as-is (handled further below), untouched by this divisor.
  const dailyRate = baseSalary / 30;
  const hourlyRate = dailyRate / 8;
  const naturalMonthEnd = getMonthDateRange(periodStart).end;

  // If the employee was hired partway through this period, only pay them
  // from their hire date onward — not the full period. Likewise, if `end` is
  // truncated before the natural month end (e.g. termination settlement),
  // this is also a partial period that must be prorated by days, not paid
  // the full base salary. hireDate ONLY affects pay proration — it does NOT
  // affect absence detection (see attendanceTrackingStart below for that).
  let start = periodStart;
  let notYetHired = false;
  let isPartialPeriod = end < naturalMonthEnd;
  if(emp.hireDate){
    const hireDate = new Date(emp.hireDate + 'T00:00:00');
    if(hireDate > end){ notYetHired = true; }
    else if(hireDate > start){ start = hireDate; isPartialPeriod = true; }
  }

  if(notYetHired){
    return { proratedBase:0, overtimeMinutes:0, overtimePay:0, dayOffOccurrences:0, extraOffDays:0, deductionAmount:0, dayOffBonusDays:0, dayOffBonusAmount:0, advancesTotal:0, advCash:0, advOrders:0, netSalary:0, daysInCalc:0, notYetHired:true };
  }

  const daysInCalc = Math.max(1, Math.round((end - start)/(24*60*60*1000)) + 1);
  // A full month worked (no mid-month hire, not a truncated/early settlement)
  // always pays the exact base salary, regardless of whether the calendar
  // month has 28, 30, or 31 days. Any partial period gets prorated by daily rate.
  const proratedBase = isPartialPeriod
    ? Math.round(dailyRate * daysInCalc * 100)/100
    : baseSalary;

  const rangeShifts = allShifts.filter(s=> s.employeeId===emp.id && s.clockInTs >= start.getTime() && s.clockInTs <= end.getTime());
  const overtimeMinutes = rangeShifts.reduce((sum,s)=> sum + (s.overtimeMinutes||0), 0);
  const overtimePay = Math.round((overtimeMinutes/60) * hourlyRate * 100)/100;

  // Real unauthorized-absence detection: compare how many work days (excluding
  // the employee's scheduled day off) have actually ELAPSED so far in the
  // period against how many distinct days they genuinely clocked in. Any gap
  // is an unexcused absence.
  //
  // absenceRangeStart is a SEPARATE, admin-controlled floor (attendanceTrackingStart)
  // — distinct from hireDate. This lets the admin set an old hireDate (for full
  // salary continuity) while telling the system "don't judge absence before
  // this date", e.g. when first rolling the system out for existing staff.
  let absenceRangeStart = start;
  if(emp.attendanceTrackingStart){
    const trackStart = new Date(emp.attendanceTrackingStart + 'T00:00:00');
    if(trackStart > absenceRangeStart) absenceRangeStart = trackStart;
  }

  const now = new Date();
  const elapsedEnd = now < end ? now : end;
  const elapsedWorkDays = elapsedEnd < absenceRangeStart ? 0 : countRequiredWorkDaysInRange(emp, absenceRangeStart, elapsedEnd);
  const attendedDays = elapsedEnd < absenceRangeStart ? 0 : countAttendedDaysInRange(emp.id, absenceRangeStart, elapsedEnd);
  const absenceDays = Math.max(0, elapsedWorkDays - attendedDays);

  // Free/excused absence days are now PROPORTIONAL to the actual number of
  // times the employee's weekly day off falls within the tracked period —
  // not a fixed number — so a partial month or a 5-week month are both
  // handled correctly and consistently (someone tracked for half a month
  // gets roughly half the allowance; a month with 5 Fridays gives 5, not 4).
  const dayOffOccurrences = elapsedEnd < absenceRangeStart ? 0 : countDayOffOccurrencesInRange(emp, absenceRangeStart, elapsedEnd);
  const extraOffDays = Math.max(0, absenceDays - dayOffOccurrences);
  const deductionAmount = Math.round(extraOffDays * dailyRate * 100)/100;

  // Bonus for working ON the scheduled day off instead of resting: for every
  // occurrence of the employee's weekly day off within the period where they
  // actually clocked in anyway, they earn an extra day's pay.
  let dayOffBonusDays = 0;
  if(emp.dayOff !== undefined && emp.dayOff !== null && emp.dayOff !== ''){
    const cur = new Date(start);
    while(cur <= end){
      if(cur.getDay() === Number(emp.dayOff)){
        const dayKey = cur.getFullYear()+'-'+cur.getMonth()+'-'+cur.getDate();
        const workedThatDay = rangeShifts.some(s=>{
          const d = new Date(s.clockInTs);
          return (d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()) === dayKey;
        });
        if(workedThatDay) dayOffBonusDays++;
      }
      cur.setDate(cur.getDate()+1);
    }
  }
  const dayOffBonusAmount = Math.round(dayOffBonusDays * dailyRate * 100)/100;

  const periodAdvances = allAdvances.filter(a=> a.employeeId===emp.id && a.ts >= start.getTime() && a.ts <= end.getTime());
  const advancesTotal = periodAdvances.reduce((sum,a)=> sum + a.amount, 0);
  // تفصيلة: سلف كاش عادية vs أوردرات شراء الموظفة (source بيبدأ بـ staff_order)
  const advCash = periodAdvances.filter(a=> String(a.source||'').indexOf('staff_order') !== 0).reduce((s,a)=> s + a.amount, 0);
  const advOrders = Math.round((advancesTotal - advCash) * 100)/100;

  const netSalary = Math.round((proratedBase - deductionAmount + overtimePay + dayOffBonusAmount - advancesTotal) * 100)/100;
  return { proratedBase, overtimeMinutes, overtimePay, dayOffOccurrences, extraOffDays, deductionAmount, dayOffBonusDays, dayOffBonusAmount, advancesTotal, advCash, advOrders, netSalary, daysInCalc, notYetHired:false };
}

function renderSalaryPanel(){
  const wrap = $('#salaryList');
  if(!wrap) return;
  if(reviewEmployeesFor(viewBranch).length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش موظفين</div>'; return; }
  const range = getMonthDateRange(new Date());
  const periodLabel = getMonthLabel(range.start);
  const monthEnded = new Date() > range.end;

  wrap.innerHTML = reviewEmployeesFor(viewBranch).map(e=>{
    if(!e.baseSalary){
      return `<div class="emp-row"><div class="n">${e.name}</div><div class="meta" style="color:var(--sub);">لسه مفيش مرتب أساسي متحدد (حطه في بانل المواعيد)</div></div>`;
    }
    const calc = computeSalary(e, range.start, range.end);
    if(calc.notYetHired){
      return `<div class="emp-row"><div class="n">${e.name}</div><div class="meta" style="color:var(--sub);">لسه معينش في الفترة دي (تاريخ التعيين ${e.hireDate})</div></div>`;
    }
    const proratedNote = calc.daysInCalc < 30 ? `<div class="meta" style="color:var(--sub); font-size:10px;">(${calc.daysInCalc} يوم بس — من تاريخ التعيين ${e.hireDate})</div>` : '';
    const paidRecord = allSalaryPayments.find(p=> p.employeeId===e.id && p.periodLabel===periodLabel);
    let actionHtml;
    if(paidRecord){
      actionHtml = `<span style="color:var(--good); font-size:11px;">✅ مدفوع (${new Date(paidRecord.paidAt).toLocaleDateString('ar-EG')})</span>`;
    } else if(!monthEnded){
      actionHtml = `<span style="color:var(--sub); font-size:10px;">🔒 هيتفعل بعد ما الشهر يخلص (يوم 30)</span>`;
    } else {
      actionHtml = `<button class="confirmBtnSmall" data-act="paysalary" data-id="${e.id}" data-amount="${calc.netSalary}">✅ تم الدفع</button>`;
    }
    return `
    <div class="emp-row" style="flex-wrap:wrap;">
      <div class="n">${e.name}</div>
      <div class="meta">أساسي ${calc.proratedBase}</div>
      ${proratedNote}
      <div class="meta" style="color:var(--gold);">إضافي +${calc.overtimePay}</div>
      <div class="meta" style="color:${calc.dayOffBonusAmount>0?'var(--good)':'var(--sub)'}">مكافأة اشتغال إجازة +${calc.dayOffBonusAmount} (${calc.dayOffBonusDays} يوم)</div>
      <div class="meta" style="color:${calc.deductionAmount>0?'var(--bad)':'var(--sub)'}">خصم غياب -${calc.deductionAmount} (${calc.extraOffDays} يوم غياب غير مبرر، من أصل ${calc.dayOffOccurrences} إجازة مسموحة)</div>
      <div class="meta" style="color:${calc.advancesTotal>0?'var(--bad)':'var(--sub)'}">سلف -${calc.advancesTotal}${calc.advOrders>0?` <span style="font-size:9.5px; color:var(--sub);">(💰 كاش ${calc.advCash} · 🛒 أوردرات ${calc.advOrders})</span>`:''}</div>
      <div class="meta" style="color:var(--good); font-weight:800;">صافي ${calc.netSalary} ج.م</div>
      ${actionHtml}
      <button class="confirmBtnSmall" style="background:#3b3b52;" onclick="openSalaryPrintDialog('${e.id}', '${periodLabel}')">🖨️ إيصال</button>
    </div>`;
  }).join('');

  wrap.querySelectorAll('[data-act="paysalary"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const emp = allEmployees.find(e=> e.id === btn.dataset.id);
      if(!emp) return;
      if(!confirm(`تأكيد صرف ${btn.dataset.amount} ج.م لـ ${emp.name} عن شهر ${periodLabel}؟`)) return;
      try{
        await addDoc(salaryPaymentsCol, {
          employeeId: emp.id, employeeName: emp.name, branch: emp.branch,
          periodLabel, amount: parseFloat(btn.dataset.amount), paidAt: Date.now()
        });
        openSalaryPrintDialog(emp.id, periodLabel);   // 🖨️ نطبع الإيصال على طول؟
      }catch(err){ console.error('تعذر تسجيل صرف الراتب', err); alert('حصل خطأ: ' + (err && err.code ? err.code : 'غير معروف')); }
    });
  });
}

// ---------- 🧾 إيصال الراتب (80mm) — بيتطبع من برنتر الفرع عبر الكاشير ----------
function buildSalaryReceiptPayload(emp, calc, periodLabel){
  const mr = getMonthRange(new Date());
  const myPoints = allPoints.filter(p=> p.employeeId===emp.id && p.ts>=mr.start.getTime() && p.ts<=mr.end.getTime()).length;
  const ptsAmt = Math.round(myPoints * (commissionPerPoint||0) * 100)/100;
  const myRefs = (window.appReferrals||[]).filter(r=> r.employeeId===emp.id && r.ts>=mr.start.getTime() && r.ts<=mr.end.getTime() && (!r.status || r.status==='active'));
  const refAmt = myRefs.reduce((s,r)=> s+(r.amount||0), 0);
  const lines = [
    ['الراتب الأساسي (' + calc.daysInCalc + ' يوم)', '+' + calc.proratedBase],
  ];
  if(calc.overtimePay > 0) lines.push(['أوفرتايم (' + Math.round(calc.overtimeMinutes/60*10)/10 + ' ساعة)', '+' + calc.overtimePay]);
  if(calc.dayOffBonusAmount > 0) lines.push(['مكافأة اشتغال إجازة', '+' + calc.dayOffBonusAmount]);
  if(calc.deductionAmount > 0) lines.push(['خصم غياب (' + calc.extraOffDays + ' يوم)', '-' + calc.deductionAmount]);
  if(calc.advCash > 0) lines.push(['سلف كاش', '-' + calc.advCash]);
  if(calc.advOrders > 0) lines.push(['🛒 مشتريات (أوردرات)', '-' + calc.advOrders]);
  const extra = [];
  if(myPoints > 0) extra.push(['⭐ عمولة النقاط (' + myPoints + ' نقطة)', ptsAmt + ' ج.م']);
  if(myRefs.length > 0) extra.push(['📱 بونص تنزيلات (' + myRefs.length + ')', refAmt + ' ج.م']);
  return {
    title: 'إيصال راتب 🧾',
    empName: emp.name || '', branch: emp.branch || '',
    period: periodLabel,
    lines,
    net: { label: 'صافي الراتب', value: calc.netSalary + ' ج.م' },
    extra,
    extraNote: extra.length ? 'العمولات دي بتتصرف من شاشة العمولات — مذكورة هنا للعلم' : '',
    footer: 'استلمت المبلغ المذكور — التوقيع: ______________'
  };
}
async function queueSalaryPrint(emp, calc, periodLabel, targetBranch){
  await addDoc(printJobsCol, {
    type: 'salary_receipt',
    branch: targetBranch,
    payload: buildSalaryReceiptPayload(emp, calc, periodLabel),
    status: 'pending', ts: Date.now(),
    requestedBy: 'admin'
  });
}
window.openSalaryPrintDialog = function(empId, periodLabel){
  const emp = allEmployees.find(e=> e.id === empId); if(!emp) return;
  const mr = getMonthRange(new Date());
  const calc = computeSalary(emp, mr.start, mr.end);
  const branches = [...new Set(allEmployees.map(e=> (e.branch||'').trim()).filter(Boolean))].sort();
  const old = document.getElementById('salPrintOv'); if(old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'salPrintOv';
  ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.72); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;';
  ov.innerHTML = `<div style="background:var(--card,#1d1d27); border:1px solid rgba(255,255,255,.12); border-radius:16px; padding:18px; max-width:340px; width:100%; text-align:center;">
    <div style="font-weight:800; font-size:15px;">🖨️ طباعة إيصال راتب ${emp.name}</div>
    <div style="color:var(--sub); font-size:12px; margin:6px 0 12px;">هيطلع من برنتر الفرع اللي تختاره (لازم برنامج الكاشير مفتوح هناك)</div>
    <select id="salPrintBranch" style="width:100%; padding:11px; border-radius:10px; font-family:inherit; font-size:13px; text-align:center;">
      ${branches.map(b=>`<option ${b===emp.branch?'selected':''}>${b}</option>`).join('')}
    </select>
    <div style="display:flex; gap:8px; margin-top:12px;">
      <button id="salPrintGo" class="confirmBtn" style="flex:2;">🖨️ اطبع</button>
      <button onclick="document.getElementById('salPrintOv').remove()" class="backBtn" style="flex:1;">إغلاق</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.querySelector('#salPrintGo').addEventListener('click', async ()=>{
    const b = ov.querySelector('#salPrintBranch').value;
    try{
      await queueSalaryPrint(emp, calc, periodLabel, b);
      ov.remove();
      alert('🖨️ اتبعت للطباعة على برنتر ' + b + ' — هيطلع خلال ثواني لو الكاشير مفتوح هناك');
    }catch(e){ alert('حصل خطأ: ' + (e.code||e.message)); }
  });
};

function renderSalaryPaymentLog(){
  const wrap = $('#salaryPaymentLogList');
  if(!wrap) return;
  const branchEmpIds = new Set(reviewEmployeesFor(viewBranch).map(e=>e.id));
  const branchPayments = allSalaryPayments.filter(p=> branchEmpIds.has(p.employeeId));
  if(branchPayments.length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش رواتب اتصرفت</div>'; return; }
  const sorted = [...branchPayments].sort((a,b)=> b.paidAt - a.paidAt);

  const byMonth = new Map();
  sorted.forEach(p=>{
    const key = p.periodLabel || 'غير معروف';
    if(!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(p);
  });

  wrap.innerHTML = Array.from(byMonth.entries()).map(([monthKey, items])=>{
    const monthTotal = items.reduce((sum,p)=> sum + p.amount, 0);
    const rows = items.map(p=>{
      const dateStr = new Date(p.paidAt).toLocaleDateString('ar-EG');
      return `<tr><td>${p.employeeName}</td><td style="color:var(--good); font-weight:700;">${p.amount} ج.م</td><td>${dateStr}</td></tr>`;
    }).join('');
    return `
    <div class="dayLogGroup">
      <div class="dayLogHead" data-group="${monthKey}">
        <span>${monthKey}</span>
        <span style="color:var(--good);">${monthTotal} ج.م (${items.length}) <span class="chev">▾</span></span>
      </div>
      <div class="dayLogBody">
        <table class="logTable"><thead><tr><th>الموظف</th><th>المبلغ</th><th>تاريخ الصرف</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>`;
  }).join('');
  wireDayLogToggles(wrap);
}

// ---------- EMPLOYEE TERMINATION (admin) ----------
let pendingTerminateEmpId = null;

function renderTerminationPanel(){
  const wrap = $('#terminateEmpList');
  if(!wrap) return;
  if(reviewEmployeesFor(viewBranch).length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش موظفين</div>'; return; }
  wrap.innerHTML = reviewEmployeesFor(viewBranch).map(e=> `
    <div class="emp-row">
      <div class="n">${e.name}</div>
      <button data-id="${e.id}" style="border:none; background:var(--bad); color:#fff; padding:8px 14px; border-radius:8px; font-family:'Cairo'; font-weight:700; font-size:12px; cursor:pointer;">🚪 إنهاء الخدمة</button>
    </div>
  `).join('');
  wrap.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      pendingTerminateEmpId = btn.dataset.id;
      const emp = allEmployees.find(e=> e.id === pendingTerminateEmpId);
      $('#terminateConfirmName').textContent = emp ? 'إنهاء خدمة: ' + emp.name : '—';
      $('#terminateConfirmPass').value = '';
      $('#terminateConfirmErr').textContent = '';
      $('#terminateConfirmOverlay').classList.add('show');
    });
  });
}

$('#terminateConfirmCancel')?.addEventListener('click', ()=>{
  $('#terminateConfirmOverlay').classList.remove('show');
  pendingTerminateEmpId = null;
});

$('#terminateConfirmBtn')?.addEventListener('click', async ()=>{
  const pass = $('#terminateConfirmPass').value;
  if(pass !== ADMIN_CODE){ $('#terminateConfirmErr').textContent = 'كود غلط'; return; }
  const emp = allEmployees.find(e=> e.id === pendingTerminateEmpId);
  if(!emp){ $('#terminateConfirmOverlay').classList.remove('show'); return; }

  const now = new Date();
  const range = getMonthDateRange(now);
  const periodLabel = getMonthLabel(range.start);
  // Prorate the settlement from the start of the current salary period up to today only.
  const calc = computeSalary(emp, range.start, now);

  try{
    await addDoc(terminationsCol, {
      employeeId: emp.id, employeeName: emp.name, branch: emp.branch,
      terminatedAt: Date.now(), periodLabel, settlementAmount: calc.netSalary, paidAt: null
    });
    await updateDoc(doc(db,'sales_employees', emp.id), { active: false });
  }catch(err){
    console.error('تعذر إنهاء الخدمة', err);
    alert('حصل خطأ: ' + (err && err.code ? err.code : 'غير معروف'));
  }
  $('#terminateConfirmOverlay').classList.remove('show');
  pendingTerminateEmpId = null;
});

function renderTerminationLog(){
  const wrap = $('#terminationLogList');
  if(!wrap) return;
  const branchTerminations = viewBranch === '__ALL__' ? allTerminations : allTerminations.filter(t=> t.branch === viewBranch);
  if(branchTerminations.length === 0){ wrap.innerHTML = '<div class="empty">لسه محدش خرج من الشغل</div>'; return; }
  const sorted = [...branchTerminations].sort((a,b)=> b.terminatedAt - a.terminatedAt);
  wrap.innerHTML = sorted.map(t=>{
    const dateStr = new Date(t.terminatedAt).toLocaleDateString('ar-EG');
    const actionHtml = t.paidAt
      ? `<span style="color:var(--good); font-size:11px;">✅ مدفوع (${new Date(t.paidAt).toLocaleDateString('ar-EG')})</span>`
      : `<button data-id="${t.id}" class="confirmBtnSmall">✅ تم الدفع</button>`;
    return `
    <div class="emp-row" style="flex-wrap:wrap;">
      <div class="n">${t.employeeName}</div>
      <div class="meta">خرج بتاريخ ${dateStr}</div>
      <div class="meta" style="color:var(--gold); font-weight:700;">مستحقاته: ${t.settlementAmount} ج.م</div>
      ${actionHtml}
    </div>`;
  }).join('');
  wrap.querySelectorAll('button[data-id]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('تأكيد صرف مستحقات الموظف؟')) return;
      try{ await updateDoc(doc(db,'sales_terminations', btn.dataset.id), { paidAt: Date.now() }); }
      catch(err){ console.error('تعذر تسجيل الدفع', err); }
    });
  });
}

// ==================== ATTENDANCE PHOTO (simple audit snapshot, no AI matching) ====================
let attPhotoStream = null;
let pendingPhotoAction = null;

async function openAttPhoto(action){
  pendingPhotoAction = action;
  const emp = window.employees.find(e=> e.id === action.empId);
  $('#attPhotoName').textContent = emp ? emp.name : '—';
  $('#attPhotoErr').textContent = '';
  $('#attPhotoRetryBtn').style.display = 'none';
  $('#attPhotoStatus').textContent = 'بيفتح الكاميرا...';
  $('#attPhotoOverlay').classList.add('show');
  try{
    attPhotoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const video = $('#attPhotoVideo');
    video.srcObject = attPhotoStream;
    await video.play();
    $('#attPhotoStatus').textContent = 'بص للكاميرا...';
    waitForFaceThenCapture(video, Date.now());
  }catch(err){
    // The photo is mandatory — no camera means no clock in/out. Don't
    // proceed; let the person retry or cancel entirely.
    $('#attPhotoStatus').textContent = '';
    $('#attPhotoErr').textContent = 'مقدرش أوصل للكاميرا (' + (err && err.name ? err.name : 'غير معروف') + '). الصورة إجبارية — مينفعش تسجل حضور/انصراف من غيرها. اتأكد من إذن الكاميرا وحاول تاني.';
    $('#attPhotoRetryBtn').style.display = 'block';
  }
}
$('#attPhotoRetryBtn')?.addEventListener('click', ()=>{
  if(pendingPhotoAction) openAttPhoto(pendingPhotoAction);
});

let faceDetectModelReady = false;
(async function loadTinyFaceDetectorModel(){
  // Only used as a fallback when the native FaceDetector API isn't available.
  // We load ONLY the tiny detector model (no landmarks, no recognition net) —
  // skipping those heavier steps is what keeps this fast.
  if('FaceDetector' in window) return; // native API available, no need for this at all
  try{
    const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    faceDetectModelReady = true;
  }catch(err){
    console.error('تعذر تحميل نموذج كشف الوجه الاحتياطي', err);
    faceDetectModelReady = false;
  }
})();

async function waitForFaceThenCapture(video, startTime){
  if(!pendingPhotoAction) return; // cancelled

  // Uses the browser's built-in face detector (no external library, fast and
  // free) when available, so we only snap once an actual face is genuinely
  // in frame instead of blindly capturing after a fixed delay. The photo is
  // mandatory, so this keeps scanning indefinitely — the person can only
  // exit without a photo by cancelling the whole action.
  if('FaceDetector' in window){
    try{
      if(!attFaceDetector) attFaceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await attFaceDetector.detect(video);
      if(faces && faces.length > 0){
        $('#attPhotoErr').textContent = '';
        $('#attPhotoStatus').textContent = 'لقيت وشك، بيصور...';
        setTimeout(()=> captureAttPhoto(video), 200);
        return;
      }
      const waitedSec = Math.round((Date.now()-startTime)/1000);
      $('#attPhotoStatus').textContent = waitedSec > 4 ? 'لسه بدور على وشك... قرّب من الكاميرا' : 'بدور على وشك...';
      setTimeout(()=> waitForFaceThenCapture(video, startTime), 350);
    }catch(err){
      // Detector hiccupped — retry rather than silently skipping the photo.
      setTimeout(()=> waitForFaceThenCapture(video, startTime), 500);
    }
    return;
  }

  // Fallback for browsers without the native API: lightweight face-api.js
  // detection-only check (no landmarks/descriptor — that's what keeps it fast).
  if(faceDetectModelReady){
    try{
      const result = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }));
      if(result){
        $('#attPhotoErr').textContent = '';
        $('#attPhotoStatus').textContent = 'لقيت وشك، بيصور...';
        setTimeout(()=> captureAttPhoto(video), 200);
        return;
      }
      const waitedSec = Math.round((Date.now()-startTime)/1000);
      $('#attPhotoStatus').textContent = waitedSec > 4 ? 'لسه بدور على وشك... قرّب من الكاميرا' : 'بدور على وشك...';
      setTimeout(()=> waitForFaceThenCapture(video, startTime), 400);
    }catch(err){
      setTimeout(()=> waitForFaceThenCapture(video, startTime), 500);
    }
    return;
  }

  // Model still loading (first moments after opening) — wait briefly rather than skipping the check.
  if(Date.now() - startTime < 4000){
    $('#attPhotoStatus').textContent = 'بيجهّز كشف الوجه...';
    setTimeout(()=> waitForFaceThenCapture(video, startTime), 300);
    return;
  }

  // Last resort: neither detection method available after waiting — still
  // take a photo (mandatory either way), just without the "wait for a face" smarts.
  setTimeout(()=> captureAttPhoto(video), 500);
}
let attFaceDetector = null;

function captureAttPhoto(video, retriesLeft){
  retriesLeft = retriesLeft === undefined ? 10 : retriesLeft;
  if(!video.videoWidth || !video.videoHeight){
    // Video metadata not ready yet — wait a bit and try again rather than
    // capturing a blank/broken frame.
    if(retriesLeft > 0){ setTimeout(()=> captureAttPhoto(video, retriesLeft-1), 300); return; }
    $('#attPhotoStatus').textContent = '';
    $('#attPhotoErr').textContent = 'الكاميرا مش راجعة صورة واضحة. الصورة إجبارية — حاول تاني.';
    $('#attPhotoRetryBtn').style.display = 'block';
    return;
  }
  try{
    const canvas = document.createElement('canvas');
    const w = 320, h = Math.round(w * video.videoHeight/video.videoWidth);
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    const dataUri = canvas.toDataURL('image/jpeg', 0.5);
    $('#attPhotoStatus').textContent = 'تم ✅';
    finishAttPhoto(dataUri);
  }catch(err){
    console.error('تعذر التقاط الصورة', err);
    $('#attPhotoStatus').textContent = '';
    $('#attPhotoErr').textContent = 'حصل خطأ في التقاط الصورة. الصورة إجبارية — حاول تاني.';
    $('#attPhotoRetryBtn').style.display = 'block';
  }
}

async function finishAttPhoto(photoDataUri){
  const action = pendingPhotoAction;
  closeAttPhoto();
  if(!action) return;
  if(action.type === 'in'){ await clockIn(action.empId, photoDataUri); }
  else if(action.type === 'break-start'){ await startBreak(action.empId, photoDataUri); }
  else if(action.type === 'break-end'){ await endBreak(action.empId, photoDataUri); }
  else{ await clockOut(action.empId, photoDataUri); renderAttendanceLists(); }
}

function closeAttPhoto(){
  if(attPhotoStream){ attPhotoStream.getTracks().forEach(t=>t.stop()); attPhotoStream=null; }
  $('#attPhotoOverlay').classList.remove('show');
  pendingPhotoAction = null;
}
$('#attPhotoCancel')?.addEventListener('click', closeAttPhoto);

// ==================== SALARY ADVANCES ====================
function todayAdvancesTotal(){
  const today = todayStr();
  return advances.filter(a=> a.date === today).reduce((sum,a)=> sum + a.amount, 0);
}
function renderTodayAdvancesSummary(){
  const tag = $('#todayAdvancesTag');
  if(!tag) return;
  tag.textContent = '💰 سلف النهاردة: ' + todayAdvancesTotal() + ' ج.م';
  if(typeof renderTodayStaffOrders==='function') renderTodayStaffOrders();
}

let advSelectedEmp = null;
let advPinBuffer = '';

$('#openAdvance')?.addEventListener('click', ()=>{
  requestFullscreenOnce();
  showAdvStep(1);
  const wrap = $('#advanceEmpGrid');
  if(window.employees.length === 0){ wrap.innerHTML = '<div class="empty">لسه مفيش موظفين</div>'; }
  else{
    wrap.innerHTML = window.employees.map(e=> `
      <div class="attCard" data-id="${e.id}">
        <div class="av">${initials(e.name)}</div>
        <div class="n">${e.name}</div>
      </div>
    `).join('');
    wrap.querySelectorAll('.attCard').forEach(tile=>{
      tile.addEventListener('click', ()=> selectAdvEmp(tile.dataset.id));
    });
  }
  $('#advanceOverlay').classList.add('show');
});

function showAdvStep(n){
  $('#advStep1').style.display = n===1 ? 'block' : 'none';
  $('#advStep2').style.display = n===2 ? 'block' : 'none';
  $('#advStep3').style.display = n===3 ? 'block' : 'none';
}
$('#advStep1Cancel')?.addEventListener('click', ()=> $('#advanceOverlay').classList.remove('show'));
$('#advStep3Cancel')?.addEventListener('click', ()=> $('#advanceOverlay').classList.remove('show'));

function selectAdvEmp(empId){
  advSelectedEmp = window.employees.find(e=> e.id === empId);
  if(!advSelectedEmp) return;
  advPinBuffer = '';
  $('#advStep2Name').textContent = advSelectedEmp.name;
  $('#advPinErrText').textContent = '';
  updateAdvPinDots(false);
  showAdvStep(2);
}

function updateAdvPinDots(isErr){
  document.querySelectorAll('#advPinDots .pin-dot').forEach((d,i)=>{
    d.className = 'pin-dot' + (i < advPinBuffer.length ? (isErr?' err':' filled') : '');
  });
}
$('#advKeypad')?.addEventListener('click', (e)=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  if(btn.id === 'advPinBack'){ showAdvStep(1); return; }
  if(btn.id === 'advPinDel'){ advPinBuffer = advPinBuffer.slice(0,-1); updateAdvPinDots(false); return; }
  const k = btn.dataset.k;
  if(k === undefined || advPinBuffer.length >= 4) return;
  advPinBuffer += k;
  updateAdvPinDots(false);
  if(advPinBuffer.length === 4) checkAdvPin();
});

function checkAdvPin(){
  if(!advSelectedEmp.pin){
    // No PIN configured for this employee yet — don't block them, just proceed.
    goToAdvAmountStep();
    return;
  }
  if(advPinBuffer === String(advSelectedEmp.pin)){
    goToAdvAmountStep();
  } else {
    updateAdvPinDots(true);
    $('#advPinErrText').textContent = 'الكود غلط';
    setTimeout(()=>{ advPinBuffer=''; updateAdvPinDots(false); }, 500);
  }
}

function goToAdvAmountStep(){
  $('#advStep3Name').textContent = advSelectedEmp.name;
  $('#advAmountInput').value = '';
  $('#advAmountErr').textContent = '';
  showAdvStep(3);
}

let advSubmitting = false;
$('#advConfirmBtn')?.addEventListener('click', async ()=>{
  if(advSubmitting) return;
  const amount = parseFloat($('#advAmountInput').value);
  if(isNaN(amount) || amount <= 0){ $('#advAmountErr').textContent = 'اكتب مبلغ صحيح'; return; }
  advSubmitting = true;
  const btn = $('#advConfirmBtn');
  btn.disabled = true;
  try{
    await addDoc(advancesCol, {
      employeeId: advSelectedEmp.id, employeeName: advSelectedEmp.name, branch: window.currentBranch,
      amount, date: todayStr(), ts: Date.now()
    });
    $('#advanceOverlay').classList.remove('show');
    alert(`تم تسجيل سلفة ${amount} ج.م لـ ${advSelectedEmp.name} ✅`);
  }catch(err){
    console.error('تعذر تسجيل السلفة', err);
    $('#advAmountErr').textContent = 'حصل خطأ: ' + (err && err.code ? err.code : 'غير معروف');
  }
  advSubmitting = false;
  btn.disabled = false;
});

// ---------- ADMIN: advances log ----------
function renderAdvancesLog(){
  const wrap = $('#advancesLogList');
  if(!wrap) return;
  const branchEmpIds = new Set(reviewEmployeesFor(viewBranch).map(e=>e.id));
  const branchAdvances = allAdvances.filter(a=> branchEmpIds.has(a.employeeId));
  if(branchAdvances.length === 0){ wrap.innerHTML = '<div class="empty">لسه محدش أخد سلفة</div>'; return; }
  const sorted = [...branchAdvances].sort((a,b)=> b.ts - a.ts);

  const byDay = new Map();
  sorted.forEach(a=>{
    const key = new Date(a.ts).toLocaleDateString('ar-EG', {day:'2-digit', month:'2-digit', year:'numeric'});
    if(!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(a);
  });
  const dayKeys = Array.from(byDay.keys()).slice(0, 90);

  wrap.innerHTML = dayKeys.map(dayKey=>{
    const items = byDay.get(dayKey);
    const dayTotal = items.reduce((sum,a)=> sum + a.amount, 0);
    const rows = items.map(a=>{
      const time = new Date(a.ts).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
      return `<tr><td>${time}</td><td>${a.employeeName}</td><td style="color:var(--gold); font-weight:700;">${a.amount} ج.م</td><td><button data-id="${a.id}" style="border:none; background:var(--bad); color:#fff; padding:6px 10px; border-radius:7px; font-family:'Cairo'; font-weight:700; font-size:11px; cursor:pointer;">حذف</button></td></tr>`;
    }).join('');
    return `
    <div class="dayLogGroup">
      <div class="dayLogHead" data-group="${dayKey}">
        <span>${dayKey}</span>
        <span style="color:var(--gold);">${dayTotal} ج.م (${items.length}) <span class="chev">▾</span></span>
      </div>
      <div class="dayLogBody">
        <table class="logTable"><thead><tr><th>الوقت</th><th>الموظف</th><th>المبلغ</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>`;
  }).join('');

  wireDayLogToggles(wrap);
  wrap.querySelectorAll('button[data-id]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('متأكد إنك عايز تحذف السلفة دي؟')) return;
      try{ await deleteDoc(doc(db,'sales_advances', btn.dataset.id)); }
      catch(err){ console.error('تعذر حذف السلفة', err); alert('حصل خطأ: ' + (err && err.code ? err.code : 'غير معروف')); }
    });
  });
}

// ============================================================
// 🖼️ نظام الإطارات — المزامنة والعرض والاحتفال
// ------------------------------------------------------------
// • يومي (حي): بيتحسب كل شوية من البيانات المحمّلة وبيتكتب على
//   مستند الموظف (frames.daily) عشان POS يعرضه في شاشة الدخول.
// • أسبوعي + سلسلة + جماعي: بيتحسب مرة لكل أسبوع مكتمل (idempotent
//   بمفتاح الأسبوع — لو جهازين حسبوه هيكتبوا نفس النتيجة).
// • تارجت الشيفت: POS هو اللي بيحسب الصافي وبيكتب مستند الحالة
//   pos_test_settings/shift_status_<branch> — هنا بنسمعه ونحوّل الشاشة.
// ============================================================
(function initFramesSystem(){

  // ---------- CSS محقون (مفيش تعديل ستايلات في index.html) ----------
  const st = document.createElement('style');
  st.textContent = `
    .attCard .av{ position:relative; }
    .attCard.fr-daily .av{ box-shadow:0 0 0 3px #22c55e, 0 0 12px #22c55e88; }
    .attCard.fr-weekly .av{ box-shadow:0 0 0 3px #22c55e, 0 0 0 6px #22c55e44, 0 0 16px #22c55eaa; }
    .attCard.fr-silver .av{ box-shadow:0 0 0 3px #cbd5e1, 0 0 0 6px #cbd5e155, 0 0 16px #cbd5e1aa; }
    .attCard.fr-gold .av{ box-shadow:0 0 0 3px #f59e0b, 0 0 0 6px #f59e0b44, 0 0 18px #f59e0bcc; }
    .attCard.fr-shift .av{ box-shadow:0 0 0 3px #f59e0b, 0 0 18px #f59e0bee; animation:frPulse 1.6s ease-in-out infinite; }
    .attCard .frSpark{ position:absolute; top:-6px; right:-6px; font-size:13px; filter:drop-shadow(0 0 4px #22c55e); }
    .attCard .frBranch{ position:absolute; top:-6px; left:-6px; font-size:12px; }
    @keyframes frPulse{ 0%,100%{ filter:brightness(1);} 50%{ filter:brightness(1.35);} }
    /* 🎯 تحوّل الشاشة كلها لما الشيفت يضرب التارجت */
    body.tgt-hit{ --panel:#221a0d; --panel2:#2a2110; --panel3:#332813; --line:#584312; }
    body.tgt-hit::after{ content:''; position:fixed; inset:0; pointer-events:none; z-index:9998;
      background:radial-gradient(1200px 300px at 50% -50px, #f59e0b33, transparent 70%);
      animation:tgtGlow 3s ease-in-out infinite; }
    @keyframes tgtGlow{ 0%,100%{opacity:.65;} 50%{opacity:1;} }
    /* بانر هادي: لون ثابت من غير حركة، وزرار إغلاق */
    #tgtBanner{ position:fixed; top:8px; left:50%; transform:translateX(-50%); z-index:9999;
      background:#3b2c0e; border:1px solid #f59e0b66; color:#f5c451; font-weight:700; font-family:'Cairo';
      padding:7px 10px 7px 14px; border-radius:99px; font-size:13px; box-shadow:0 3px 14px #00000066;
      display:none; align-items:center; gap:10px; max-width:92vw; }
    body.tgt-hit #tgtBanner{ display:flex; }
    body.tgt-banner-off #tgtBanner{ display:none !important; }
    #tgtBannerX{ background:transparent; border:none; color:#f5c45199; font-size:16px; line-height:1;
      cursor:pointer; padding:2px 4px; font-family:'Cairo'; }
    #tgtBannerX:hover{ color:#f5c451; }
  `;
  document.head.appendChild(st);
  const banner = document.createElement('div');
  banner.id = 'tgtBanner';
  const bannerTxt = document.createElement('span');
  const bannerX = document.createElement('button');
  bannerX.id = 'tgtBannerX'; bannerX.textContent = '✕'; bannerX.title = 'إخفاء';
  banner.appendChild(bannerTxt); banner.appendChild(bannerX);
  document.body.appendChild(banner);
  // الإغلاق بيتفضل متذكّر لنفس الاحتفال (نفس اليوم/الشيفت) — ميرجعش تاني
  const DISMISS_KEY = 'tgt_banner_dismissed';
  function dismissSig(){
    const st2 = window.shiftStatus;
    return st2 ? (st2.dateKey + '|' + activeShiftCelebrations(st2, new Date()).join(',')) : '';
  }
  bannerX.addEventListener('click', ()=>{
    try{ localStorage.setItem(DISMISS_KEY, dismissSig()); }catch(e){}
    document.body.classList.add('tgt-banner-off');
  });

  // ---------- 🎯 الاستماع لحالة تارجت الشيفت (POS بيكتبها) ----------
  let _stUnsub = null, _stBranch = null;
  window.shiftStatus = null;
  function hm(now){ const d = now || new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
  // الاحتفال شغال "طول الشيفت ليهم هما": التارجت متضروب + إحنا لسه جوه نافذة الشيفت ده
  function activeShiftCelebrations(stat, now){
    if(!stat || stat.dateKey !== todayStr()) return [];
    const t = hm(now);
    return ['morning','evening'].filter(k=>{
      const s = stat[k];
      return s && s.hit && s.start && s.end && t >= s.start && t < s.end;
    });
  }
  window.activeShiftCelebrations = activeShiftCelebrations;
  function applyShiftStatus(stat){
    window.shiftStatus = stat;
    const act = activeShiftCelebrations(stat, new Date());
    document.body.classList.toggle('tgt-hit', act.length > 0);
    if(act.length){
      const names = act.map(k=> k==='morning' ? 'الصباحي 🌅' : 'المسائي 🌆').join(' + ');
      bannerTxt.textContent = `🎯 شيفت ${names} ضرب التارجت`;
      // لو المستخدم قفله لنفس الاحتفال ده قبل كده، يفضل مقفول
      let saved = ''; try{ saved = localStorage.getItem(DISMISS_KEY) || ''; }catch(e){}
      document.body.classList.toggle('tgt-banner-off', saved === dismissSig());
    } else {
      document.body.classList.remove('tgt-banner-off');
    }
    try{ renderAttendanceLists && renderAttendanceLists(); }catch(e){}
  }
  function watchShiftStatus(){
    if(!window.currentBranch || window.currentBranch === _stBranch) return;
    if(_stUnsub) _stUnsub();
    _stBranch = window.currentBranch;
    _stUnsub = onSnapshot(doc(db, 'pos_test_settings', 'shift_status_' + _stBranch),
      (snap)=> applyShiftStatus(snap.exists() ? snap.data() : null),
      (err)=> console.warn('shift status listen', err));
  }
  setInterval(watchShiftStatus, 3000);        // بيتوصّل أول ما الفرع يبقى معروف وبيتبدّل معاه
  setInterval(()=> applyShiftStatus(window.shiftStatus), 60000);  // نهاية نافذة الشيفت بتطفّي الاحتفال حتى من غير كتابة جديدة

  // ---------- 🖼️ زينة كروت الحضور (بيتنده من renderEmployeeCards بعد الرسم) ----------
  // بيرجع {cls, spark, branchIcon} للموظف — الأعلى بيغطي الأقل: شيفت > دهبي > فضي > أسبوعي، واليومي شرارة جنبه
  function frameDecorFor(e){
    const f = (e && e.frames) || {};
    const wk = frameWeekLabel(new Date(new Date().getTime() - 7*86400000));   // مفتاح آخر أسبوع مكتمل
    const act = activeShiftCelebrations(window.shiftStatus, new Date());
    const inShiftParty = act.some(k=> (window.shiftStatus[k].team || []).includes(e.id));
    let cls = '';
    if(inShiftParty) cls = 'fr-shift';
    else if(f.streak && f.streak.week === wk && streakLevel(f.streak.count) === 2) cls = 'fr-gold';
    else if(f.streak && f.streak.week === wk && streakLevel(f.streak.count) === 1) cls = 'fr-silver';
    else if(f.weekly && f.weekly.week === wk && f.weekly.clean) cls = 'fr-weekly';
    const daily = f.daily && f.daily.date === todayStr() && f.daily.clean;
    if(daily && !cls) cls = 'fr-daily';
    return {
      cls,
      spark: daily && cls !== 'fr-daily' ? '<div class="frSpark">⚡</div>' : '',
      branchIcon: (f.branchWeek && f.branchWeek.week === wk && f.branchWeek.on) ? '<div class="frBranch" title="الفرع كله عمل أسبوع نضيف">🏆</div>' : ''
    };
  }
  window.frameDecorFor = frameDecorFor;
  function decorateAttCards(){
    document.querySelectorAll('.attCard[data-id]').forEach(card=>{
      const e = (window.allEmployeesAll || (window.employees||[])).find(x=> x.id === card.dataset.id)
             || (window.employees||[]).find(x=> x.id === card.dataset.id);
      if(!e) return;
      const d = frameDecorFor(e);
      card.classList.remove('fr-daily','fr-weekly','fr-silver','fr-gold','fr-shift');
      if(d.cls) card.classList.add(d.cls);
      if(d.spark && !card.querySelector('.frSpark')) card.insertAdjacentHTML('beforeend', d.spark);
      if(d.branchIcon && !card.querySelector('.frBranch')) card.insertAdjacentHTML('beforeend', d.branchIcon);
    });
  }
  // نلف على رسم الكروت من غير ما نعدّل جواه: نزيّن بعد كل رسم
  // الرسم بيحصل من renderAttendanceLists (module-scope) — بنزيّن بعده بشبكة أمان دورية
  setInterval(decorateAttCards, 3000);

  // ---------- 🟢 مزامنة الإطار اليومي (حي) → sales_employees.frames.daily ----------
  let _lastDailySig = '';
  async function syncDailyFrames(){
    try{
      const branch = window.currentBranch; if(!branch) return;
      const emps = (window.employees || []).filter(e=> e.active !== false);
      if(!emps.length) return;
      const dk = todayStr();
      const credit = window.allTimeCredit || [], shiftsArr = window.allShifts || [];
      const sig = dk + '|' + emps.map(e=>{
        return e.id + ':' + (dailyCleanFrame(e.id, dk, credit, shiftsArr) ? 1 : 0);
      }).join(',');
      if(sig === _lastDailySig) return;
      _lastDailySig = sig;
      for(const e of emps){
        const clean = dailyCleanFrame(e.id, dk, credit, shiftsArr);
        const cur = (e.frames && e.frames.daily) || {};
        if(cur.date === dk && !!cur.clean === clean) continue;   // مفيش تغيير → مفيش كتابة
        await updateDoc(doc(db,'sales_employees', e.id), { 'frames.daily': { clean, date: dk } })
          .catch(err=> console.warn('daily frame write', e.id, err));
      }
    }catch(e){ console.warn('syncDailyFrames', e); }
  }
  setInterval(syncDailyFrames, 30000);
  setTimeout(syncDailyFrames, 8000);

  // ---------- 🏅 مزامنة الأسبوعي + السلسلة + الجماعي (آخر أسبوع مكتمل) ----------
  async function syncWeeklyFrames(){
    try{
      const branch = window.currentBranch; if(!branch) return;
      const emps = (window.employees || []).filter(e=> e.active !== false);
      if(!emps.length) return;
      const lastWeekStart = frameWeekStart(new Date(Date.now() - 7*86400000));
      const wk = 'W' + todayStr(lastWeekStart);
      const prevWk = 'W' + todayStr(new Date(lastWeekStart.getTime() - 7*86400000));
      const pending = emps.filter(e=> !(e.frames && e.frames.weekly && e.frames.weekly.week === wk));
      if(!pending.length) return;
      const credit = window.allTimeCredit || [], shiftsArr = window.allShifts || [];
      const results = {};
      for(const e of emps) results[e.id] = weeklyCleanFrame(e.id, lastWeekStart, credit, shiftsArr);
      const branchClean = emps.length > 0 && emps.every(e=> results[e.id]);
      for(const e of pending){
        const clean = results[e.id];
        const prev = (e.frames && e.frames.streak) || {};
        const count = clean ? ((prev.week === prevWk ? (Number(prev.count)||0) : 0) + 1) : 0;
        await updateDoc(doc(db,'sales_employees', e.id), {
          'frames.weekly': { clean, week: wk },
          'frames.streak': { count, week: wk },
          'frames.branchWeek': { on: branchClean, week: wk }
        }).catch(err=> console.warn('weekly frame write', e.id, err));
      }
    }catch(e){ console.warn('syncWeeklyFrames', e); }
  }
  setTimeout(syncWeeklyFrames, 12000);
  setInterval(syncWeeklyFrames, 10*60000);

  // ---------- ⚙️ حفظ تارجت الشيفتات (أدمن) → pos_test_settings/shift_targets ----------
  const btn = document.getElementById('saveShiftTargetsBtn');
  if(btn) btn.addEventListener('click', async ()=>{
    const err = document.getElementById('shiftTargetsErr');
    const mv = parseInt(document.getElementById('shiftTargetMorning').value) || 0;
    const ev = parseInt(document.getElementById('shiftTargetEvening').value) || 0;
    const sh = (window.complianceCfg && window.complianceCfg.shifts) || {};
    const cfg = {
      morning: { target: Math.max(0, mv), start: (sh.morning||{}).start || '10:00', end: (sh.morning||{}).end || '18:00' },
      evening: { target: Math.max(0, ev), start: (sh.evening||{}).start || '14:00', end: (sh.evening||{}).end || '22:00' }
    };
    const orig = btn.textContent; btn.disabled = true;
    try{
      await setDoc(doc(db,'pos_test_settings','shift_targets'),
        { byBranch: { [window.currentBranch]: cfg } }, { merge:true });
      err.textContent = '';
      btn.textContent = 'اتحفظ ✅';
    }catch(e2){
      err.textContent = 'خطأ: ' + (e2 && e2.message ? e2.message : e2);
      btn.textContent = 'خطأ';
    }
    setTimeout(()=>{ btn.textContent = orig; btn.disabled = false; }, 1800);
  });
  // ---------- 🖥️ وضع تحوّل شاشة البيع (خفيف / كامل / مقفول) ----------
  const mBtn = document.getElementById('saveFramesModeBtn');
  if(mBtn) mBtn.addEventListener('click', async ()=>{
    const errB = document.getElementById('framesModeErr');
    const val = (document.getElementById('framesSaleMode')||{}).value || 'light';
    const orig = mBtn.textContent; mBtn.disabled = true;
    try{
      await setDoc(doc(db,'pos_test_settings','frames_cfg'), { posSaleMode: val }, { merge:true });
      errB.textContent = ''; mBtn.textContent = 'اتحفظ ✅';
    }catch(e2){
      errB.textContent = 'خطأ: ' + (e2 && e2.message ? e2.message : e2);
      mBtn.textContent = 'خطأ';
    }
    setTimeout(()=>{ mBtn.textContent = orig; mBtn.disabled = false; }, 1800);
  });
  (async ()=>{
    try{
      const fs2 = await getDoc(doc(db,'pos_test_settings','frames_cfg'));
      const sel = document.getElementById('framesSaleMode');
      if(sel && fs2.exists() && fs2.data().posSaleMode) sel.value = fs2.data().posSaleMode;
    }catch(e){}
  })();

  // نملى القيم المحفوظة عند الفتح
  (async ()=>{
    try{
      const s = await getDoc(doc(db,'pos_test_settings','shift_targets'));
      const cfg = s.exists() ? ((s.data().byBranch||{})[window.currentBranch]) : null;
      if(cfg){
        const m = document.getElementById('shiftTargetMorning'), v = document.getElementById('shiftTargetEvening');
        if(m && cfg.morning && cfg.morning.target) m.value = cfg.morning.target;
        if(v && cfg.evening && cfg.evening.target) v.value = cfg.evening.target;
      }
    }catch(e){}
  })();
})();
