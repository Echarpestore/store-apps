# apply-loyalty-auth.py — يطبّق تعديل «الدخول على السيرفر» على loyalty/index.html و glow/index.html
# كل استبدال لازم يطابق مرة واحدة بالظبط وإلا يوقف (عشان مايتطبّقش على ملف مختلف).
import sys, io
def once(s, old, new, name):
    if s.count(old) != 1: raise SystemExit(f"✗ {name}: expected exactly one match, found {s.count(old)}")
    return s.replace(old, new)
def block(s, start):
    i = s.index(start); j = s.index("\n}\n", i); return s[i:j+3]

def patch(path, brand):
    s = io.open(path, encoding="utf-8").read()
    if "LOYALTY-AUTH-v1" in s: raise SystemExit(f"✗ {path}: already patched")
    APP = "loyalty" if brand == "echarpe" else "glow"
    CODE = "loyaltyCode" if brand == "echarpe" else "loyaltyCode_glow"

    # 1) الدخول المجهول: مايبدأش قبل ما Firebase يرجّع الجلسة المحفوظة (وإلا كان بيدوس على جلسة العميلة)
    s = once(s, "\nensureAnonAuth();\ntry{ fbAuth.onAuthStateChanged(function(u){ if(!u) ensureAnonAuth(); }); }catch(e){}",
"""
/* LOYALTY-AUTH-v1 — الدخول المجهول يستنى استعادة الجلسة الأول: signInAnonymously
   وهي شغّالة فورًا كانت هتستبدل جلسة العميلة (Custom Token) المحفوظة على الجهاز. */
var _authRestored = false;
try{ fbAuth.onAuthStateChanged(function(u){ _authRestored = true; if(!u) ensureAnonAuth(); }); }catch(e){ _authRestored = true; ensureAnonAuth(); }""", "anon restore")
    s = once(s, "    if(fbAuth.currentUser || _anonPending) return;   // داخل بالفعل أو الطلب في السكة",
                "    if(!_authRestored || fbAuth.currentUser || _anonPending) return;   // داخل بالفعل أو الطلب في السكة أو الجلسة لسه بتترجّع", "anon guard")

    # 2) مساعدات النداء على السيرفر + الدخول بالتوكن
    s = once(s, "function waitForCustomerAuth(){",
"""/* LOYALTY-AUTH-v1 — الرقم السري بيتقارن على السيرفر (functions/loyaltyAuth.js)
   والدخول بـCustom Token بمطالبة phone — قواعد الأمان بتقفل المستند على صاحبته. */
var LOYALTY_BRAND = '%s';
function loyaltyAuthCall(payload){
  payload = Object.assign({ brand: LOYALTY_BRAND }, payload || {});
  return fbApp.functions('us-central1').httpsCallable('loyaltyAuth')(payload).then(function(r){ return r.data || {}; });
}
function loyaltyAuthMsg(e, fallback){
  var code = e && e.details && e.details.code;
  if(code === 'locked') return 'محاولات كتير غلط — استني ربع ساعة وجرّبي تاني';
  if(e && e.message && e.code && e.code !== 'internal' && e.code !== 'unavailable' && e.code !== 'deadline-exceeded') return e.message;
  return fallback || 'النت ضعيف — حاولي تاني';
}
function loyaltySignIn(token){ return fbAuth.signInWithCustomToken(token); }
/* الجلسة المحفوظة على الجهاز تبقى بتاعة نفس الرقم ونفس البراند؟ */
function loyaltySessionFor(phone){
  return new Promise(function(res){
    var done = false, off = null;
    function settle(u){
      if(done) return; done = true; try{ if(off) off(); }catch(_){}
      if(!u || u.isAnonymous) return res(false);
      u.getIdTokenResult().then(function(t){ var c = t && t.claims || {}; res(!!(c.loyalty && c.brand === LOYALTY_BRAND && String(c.phone) === String(phone))); }).catch(function(){ res(false); });
    }
    try{ off = fbAuth.onAuthStateChanged(settle); }catch(e){ settle(fbAuth.currentUser); }
    setTimeout(function(){ settle(fbAuth.currentUser); }, 6000);
  });
}
window.loyaltyAuthCall = loyaltyAuthCall; window.loyaltyAuthMsg = loyaltyAuthMsg;
function waitForCustomerAuth(){""" % brand, "helpers")

    # 3) stepPhone → lookup على السيرفر (مفيش قراية لمستند العميلة قبل الدخول)
    s = once(s, block(s, "function stepPhone(){"),
"""function stepPhone(){
  var phone = digits($('phoneInput').value);
  if(phone.length < 8){ $('loginErr').textContent='اكتبي رقم موبايل صح'; return; }
  $('loginBtn').disabled=true; $('loginBtn').textContent='لحظة...';
  loyaltyAuthCall({ action:'lookup', phone: phone }).then(function(r){
    $('loginBtn').disabled=false; pendingPhone = phone;
    if(!r.exists){ pendingIsNew=true; setLoginStep('name'); }
    else{
      pendingIsNew=false; pinToMatch='';
      if(r.hasPin){ setLoginStep('enterpin'); }
      else{ setLoginStep('setpin'); }   // حساب موجود من غير رقم سري (اتعمل من الكاشير أو اتعمله reset)
    }
  }).catch(function(e){
    $('loginBtn').disabled=false; $('loginBtn').textContent='دخول';
    $('loginErr').textContent=loyaltyAuthMsg(e); console.warn(e);
  });
}
""", "stepPhone")

    s = once(s, block(s, "function stepSetPin(){"),
"""function stepSetPin(){
  var pin = digits($('pinInput').value), c = digits($('pinConfirmInput').value);
  if(pin.length !== 4){ $('loginErr').textContent='الرقم السري لازم يكون ٤ أرقام'; return; }
  if(pin !== c){ $('loginErr').textContent='الرقمين مش متطابقين'; $('pinConfirmInput').value=''; return; }
  $('loginBtn').disabled=true; $('loginBtn').textContent='بنجهّز...';
  try{ if(window.crStashPin) crStashPin(pin); }catch(e){}   // 🔐
  if(pendingIsNew){
    createCustomer(pendingPhone, pendingName, pin);
  }else{
    loyaltyAuthCall({ action:'set_pin', phone: pendingPhone, pin: pin }).then(function(r){
      return loyaltySignIn(r.token);
    }).then(function(){
      localStorage.setItem(LS_PHONE, pendingPhone);
      $('loginBtn').disabled=false; enterApp(pendingPhone);
    }).catch(function(e){
      $('loginBtn').disabled=false; $('loginBtn').textContent='حفظ ودخول';
      $('loginErr').textContent=loyaltyAuthMsg(e, 'معرفناش نحفظ — حاولي تاني'); console.warn(e);
    });
  }
}
""", "stepSetPin")

    s = once(s, block(s, "function stepEnterPin(){"),
"""function stepEnterPin(){
  var pin = digits($('pinInput').value);
  if(pin.length !== 4){ $('loginErr').textContent='اكتبي الرقم السري (٤ أرقام)'; return; }
  $('loginBtn').disabled=true; $('loginBtn').textContent='لحظة...';
  loyaltyAuthCall({ action:'login', phone: pendingPhone, pin: pin }).then(function(r){
    return loyaltySignIn(r.token);
  }).then(function(){
    try{ if(window.crStashPin) crStashPin(pin); }catch(e){}   // 🔐 لتسجيل الجهاز على السيرفر (في الذاكرة بس)
    localStorage.setItem(LS_PHONE, pendingPhone);
    $('loginBtn').disabled=false; enterApp(pendingPhone);
  }).catch(function(e){
    $('loginBtn').disabled=false; $('loginBtn').textContent='دخول'; $('pinInput').value='';
    $('loginErr').textContent=loyaltyAuthMsg(e); console.warn(e);
  });
}
""", "stepEnterPin")

    s = once(s, block(s, "function createCustomer(phone, name, pin){"),
"""function createCustomer(phone, name, pin){
  /* التسجيل والكود الفريد على السيرفر — التطبيق مبيكتبش مستند العميلة قبل الدخول */
  loyaltyAuthCall({ action:'register', phone: phone, name: name, pin: pin,
    source: visitSrc ? ('%s_app:'+visitSrc) : '%s_app',
    lang: (window.i18nLang ? i18nLang() : 'ar') }).then(function(r){
    return loyaltySignIn(r.token);
  }).then(function(){
    localStorage.setItem(LS_PHONE, phone);
    $('loginBtn').disabled=false; enterApp(phone);
  }).catch(function(e){
    $('loginBtn').disabled=false; $('loginBtn').textContent='حفظ ودخول';
    $('loginErr').textContent = loyaltyAuthMsg(e, 'معرفناش نحفظ الحساب — حاولي تاني');
    console.warn('customer registration failed', e && (e.code || e.message), e);
  });
}
""" % (APP, APP), "createCustomer")

    s = once(s, block(s, "function ensureLoyaltyCode(phone){"),
"""function ensureLoyaltyCode(phone){
  if(currentCustomer && currentCustomer.%s) return;
  loyaltyAuthCall({ action:'ensure_code' }).catch(function(e){ console.warn('تعذر توليد كود العضوية', e); });
}
""" % CODE, "ensureLoyaltyCode")

    # 4) استعادة الجلسة: الرقم المحفوظ لوحده مبيكفيش — لازم جلسة Firebase بنفس الرقم
    s = once(s, "  var saved = localStorage.getItem(LS_PHONE);\n  if(saved){ showScreen('screen-app'); enterApp(saved); }\n  else { showScreen('screen-login'); setLoginStep('phone'); }",
"""  var saved = localStorage.getItem(LS_PHONE);
  if(!saved){ showScreen('screen-login'); setLoginStep('phone'); return; }
  loyaltySessionFor(saved).then(function(ok){
    if(ok){ showScreen('screen-app'); enterApp(saved); return; }
    /* جلسة قديمة (قبل التحديث) أو انتهت: رقم سري مرة واحدة وخلاص */
    localStorage.removeItem(LS_PHONE);
    showScreen('screen-login'); setLoginStep('phone'); $('phoneInput').value = saved;
  });""", "session restore")

    # 5) الخروج يقفل جلسة Firebase (بعدها الدخول المجهول بيرجع لوحده للقراءات العامة)
    s = once(s, "  currentCustomer = null;\n  localStorage.removeItem(LS_PHONE);",
                "  currentCustomer = null;\n  localStorage.removeItem(LS_PHONE);\n  try{ if(fbAuth.currentUser && !fbAuth.currentUser.isAnonymous) fbAuth.signOut(); }catch(e){}", "logout signOut")

    # 6) حسابي: تغيير الرقم السري + حذف الحساب (مطلوب من Apple/Google كمسار داخل التطبيق)
    s = once(s, "    '<button class=\"btn-outline logout\" onclick=\"logout()\">تسجيل الخروج</button>';",
"""    '<button class="btn-outline" onclick="openChangePin()">🔑 تغيير الرقم السري</button>'+
    '<button class="btn-outline logout" onclick="logout()">تسجيل الخروج</button>'+
    '<button class="btn-outline logout" onclick="openDeleteAccount()" style="opacity:.75;">🗑️ حذف حسابي وبياناتي</button>';""", "account buttons")

    s = once(s, "function showSheet(title, bodyHtml){",
"""/* LOYALTY-AUTH-v1 — تغيير الرقم السري وحذف الحساب (من التطبيق نفسه) */
function _pinSheet(title, intro, btnLabel, fields, onSubmit){
  showSheet(title,
    '<div class="acct-card" style="text-align:center;">'
    + '<div style="font-size:13.5px; line-height:1.9; margin-bottom:12px;">' + intro + '</div>'
    + fields.map(function(f){ return '<input id="' + f.id + '" type="password" inputmode="numeric" maxlength="4" placeholder="' + f.ph + '" style="width:60%; padding:12px; border-radius:14px; border:2px solid var(--line); font-size:20px; text-align:center; letter-spacing:.4em; font-family:inherit; margin:4px 0;">'; }).join('')
    + '<div id="lyPinErr" style="min-height:20px; color:#c0392b; font-weight:800; font-size:12.5px; margin-top:8px;"></div>'
    + '<button class="btn-primary" id="lyPinBtn" style="width:100%; margin-top:6px;">' + btnLabel + '</button></div>');
  setTimeout(function(){ var i = document.getElementById(fields[0].id); if(i) i.focus(); }, 120);
  var b = document.getElementById('lyPinBtn'); if(b) b.onclick = onSubmit;
}
function openChangePin(){
  _pinSheet('🔑 تغيير الرقم السري', 'اكتبي الرقم القديم وبعدين الجديد (٤ أرقام).', 'حفظ',
    [{id:'lyOldPin', ph:'القديم'}, {id:'lyNewPin', ph:'الجديد'}, {id:'lyNewPin2', ph:'تأكيد'}], function(){
    var o = digits(document.getElementById('lyOldPin').value), n1 = digits(document.getElementById('lyNewPin').value), n2 = digits(document.getElementById('lyNewPin2').value), er = document.getElementById('lyPinErr');
    if(o.length !== 4 || n1.length !== 4){ er.textContent = 'الرقم السري ٤ أرقام'; return; }
    if(n1 !== n2){ er.textContent = 'الرقمين الجداد مش متطابقين'; return; }
    er.textContent = 'لحظة…';
    loyaltyAuthCall({ action:'change_pin', oldPin: o, newPin: n1 }).then(function(){ closeSheet(); alert('تم تغيير الرقم السري ✅'); })
      .catch(function(e){ er.textContent = loyaltyAuthMsg(e); });
  });
}
function openDeleteAccount(){
  _pinSheet('🗑️ حذف الحساب', '<b>ده بيمسح اسمك وبياناتك ونقاطك نهائيًا</b> ومش هتقدري ترجعيهم.<br>الفواتير القديمة بتفضل كسجلات بس من غير اسمك.<br>لو عندك رصيد فلوس، كلمينا الأول عشان نرجّعه.<br><br>اكتبي رقمك السري للتأكيد:', 'احذفي حسابي نهائيًا',
    [{id:'lyDelPin', ph:'••••'}], function(){
    var p = digits(document.getElementById('lyDelPin').value), er = document.getElementById('lyPinErr');
    if(p.length !== 4){ er.textContent = 'الرقم السري ٤ أرقام'; return; }
    if(!confirm('متأكدة؟ الحذف نهائي.')) return;
    er.textContent = 'لحظة…';
    loyaltyAuthCall({ action:'delete_account', pin: p }).then(function(){ closeSheet(); alert('اتحذف حسابك. نتمنى نشوفك تاني 🌷'); logout(true); })
      .catch(function(e){ er.textContent = loyaltyAuthMsg(e); });
  });
}
window.openChangePin = openChangePin; window.openDeleteAccount = openDeleteAccount;
function showSheet(title, bodyHtml){""", "pin sheets")
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    print("✓", path)

if __name__ == "__main__":
    patch(sys.argv[1], sys.argv[2])
