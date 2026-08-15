/* ============================================================
   🌐 i18n-core.js — محرك اللغتين (عربي / English) لتطبيقات العملاء
   ------------------------------------------------------------
   ملف **واحد مشترك** بين loyalty وglow — نفس قرار chat-core
   وorders-core: مصدر واحد، مفيش نسخة تتنسى.

   📌 القرار المعماري (مهم جدًا للجلسات الجاية):
     المفتاح هو **النص العربي نفسه**، مش كود زي `acct.name`.
     السبب: التطبيق فيه ٧٠٠+ نص عربي متكتوبين جوه `innerHTML`.
     تحويلهم لمفاتيح = إعادة كتابة الملف كله = خطر ضياع إصلاحات.
     بالمفتاح العربي:
       · النص الناقص من القاموس **بيفضل عربي** — مش بيختفي ومش
         بيطلع مفتاح خام قدام العميلة.
       · إضافة أي ميزة جديدة بالعربي بتشتغل من غير ما حد يفتكر i18n.

   📌 التطبيق على الشاشة بيحصل بـ**مسح للـDOM** مش بتعديل كل نداء:
     `i18nApply(root)` بيمشي على النصوص ويترجم اللي بيطابق القاموس
     بالظبط، و`i18nObserve(root)` بيعمل نفس الشيء لأي حاجة بتترسم
     بعدين (MutationObserver). يعني كل `renderX()` موجودة ولا اللي
     هتتكتب بكرة بتشتغل من غير أي تعديل فيها.

   ⚠️ الأمان: الترجمة **بالمطابقة التامة بس**. أسماء العملاء
      والمنتجات والأرقام مش في القاموس فمستحيل تتلمس.
   ⚠️ النص الأصلي بيتحفظ في WeakMap — الرجوع للعربي بيرجّع الأصل
      بالظبط من غير إعادة تحميل الصفحة.
   ============================================================ */
'use strict';

var I18N_KEY = 'app_lang';

var I18N_LANGS = {
  ar: { name: 'العربية', dir: 'rtl', locale: 'ar-EG', flag: '🇪🇬' },
  en: { name: 'English', dir: 'ltr', locale: 'en-GB', flag: '🌐' }
};

/* 🗝️ القاموس — عربي ← إنجليزي.
   ⚠️ المفتاح لازم يبقى **النص زي ما بيتعرض بالظبط** (بعد trim).
      لو النص في الكود فيه تاجات، المسح بيشوف الجزء النصي لوحده. */
var I18N_DICT = {
  en: {
    /* ---------- الدخول والتسجيل ---------- */
    'نادي عملاء إيشارب': 'echarpe Rewards Club',
    'إيشارب · نادي العملاء': 'echarpe · Rewards Club',
    'نادي إيشارب': 'echarpe Club',
    'إيشارب': 'echarpe',
    'أهلاً بيكِ 🌸': 'Welcome 🌸',
    'أهلاً تاني 👋': 'Welcome back 👋',
    'أول مرة معانا 🌷': 'First time here 🌷',
    'أهلاً': 'Hello',
    'اجمعي نقاط مع كل شراء، واستبدليها بخصومات. سجّلي برقم موبايلك عشان نعرفك عند الكاشير.':
      'Earn points on every purchase and turn them into discounts. Sign up with your mobile number so the cashier can find you.',
    'رقم الموبايل': 'Mobile number',
    'اسمك (عشان نرحّب بيكِ صح)': 'Your name (so we can greet you properly)',
    'الاسم': 'Name',
    'اكتبي اسمك عشان نرحّب بيكِ.': 'Tell us your name so we can welcome you.',
    'اكتبي اسمك عشان نكمّل': 'Please enter your name to continue',
    'اختاري رقم سري 🔐': 'Choose a PIN 🔐',
    'اختاري ٤ أرقام سهل تفتكريها — دي هتحمي حسابك، ومحدش هيقدر يفتحه من غيرها.':
      'Pick 4 digits you will remember — they keep your account safe, and no one can open it without them.',
    'اختاري رقم سري (٤ أرقام)': 'Choose a PIN (4 digits)',
    'أكّدي الرقم السري': 'Confirm your PIN',
    'الرقم السري': 'PIN',
    'اكتبي الرقم السري (٤ أرقام)': 'Enter your PIN (4 digits)',
    'اكتبي رقمك السري عشان تدخلي حسابك.': 'Enter your PIN to open your account.',
    'الرقم السري غلط': 'Wrong PIN',
    'الرقم السري لازم يكون ٤ أرقام': 'The PIN must be 4 digits',
    'الرقمين مش متطابقين': 'The two PINs do not match',
    'اكتبي رقم موبايل صح': 'Please enter a valid mobile number',
    'رقمك السري بيحمي نقاطك — محدش يقدر يفتح حسابك من غيره.':
      'Your PIN protects your points — no one can open your account without it.',
    'لو نسيتيه، الكاشير في المحل يقدر يمسحه لك.': 'If you forget it, the cashier in store can reset it for you.',
    'دخول': 'Sign in',
    'التالي': 'Next',
    'حفظ ودخول': 'Save & sign in',
    'لحظة...': 'One moment...',
    'بنجهّز...': 'Setting things up...',
    '‹ رجوع لرقم تاني': '‹ Use another number',
    'تسجيل الخروج': 'Sign out',
    'تسجيل الخروج من حسابك؟': 'Sign out of your account?',
    'اختاري لغة التطبيق': 'Choose your language',
    'تقدري تغيّريها بعدين من «حسابي»': 'You can change it later from “My account”',
    'لغة التطبيق': 'App language',

    /* ---------- التبويبات ---------- */
    'بطاقتي': 'My card',
    'عروضي': 'My offers',
    'فواتيري': 'My receipts',
    'حسابي': 'My account',
    'تواصل': 'Contact',

    /* ---------- البطاقة والنقاط ---------- */
    'نقاطك': 'Your points',
    'نقطة': 'points',
    'نقطة =': 'points =',
    'ج.م': 'EGP',
    'ج.م خصم': 'EGP off',
    'ج.م تشتريها = نقطة': 'EGP spent = 1 point',
    'ج.م أو أكتر': 'EGP or more',
    'ج.م — رصيدك دلوقتي': 'EGP — your balance now',
    'ج.م — هيتطبق عند الدفع': 'EGP — applied at checkout',
    'إزاي تكسبي نقاط': 'How to earn points',
    'إزاي تستبدلي': 'How to redeem',
    'كل': 'Every',
    'الوحدة الجاية': 'Next reward',
    'فاضل': 'Remaining',
    'جاهزة للاستبدال! 🎉': 'Ready to redeem! 🎉',
    'اجمعي نقاط أكتر عشان تبدأي تستبدلي': 'Collect a few more points to start redeeming',
    'تقدري تستبدليها بخصم ~': 'You can redeem them for about ',
    'لو اشتريتي بـ': 'Spend',
    'وتفتحي مكافأة': 'and unlock a reward of',
    '🎉 مكافأتك جاهزة — استبدليها في أي فرع': '🎉 Your reward is ready — redeem it at any branch',
    '🎯 ناقصك': '🎯 You need',
    '🎟️ اعرضي كودك للكاشير': '🎟️ Show your code to the cashier',
    '🎟️ كود عضويتك': '🎟️ Your membership code',
    'بنجهّز كودك...': 'Preparing your code...',
    'اضغطي لعرض الباركود ↻': 'Tap to show the barcode ↻',
    'اضغطي للرجوع ↩': 'Tap to go back ↩',
    'رصيدك:': 'Your points:',
    '🎁 استبدلي نقاطك': '🎁 Redeem your points',
    'اطلبي الاستبدال': 'Request redemption',
    'إلغاء الطلب': 'Cancel request',
    '= خصم': '= a discount of',
    '💡 الاستبدال بيحصل في المحل — قوليلهم عايزة تستبدلي نقاطك عند الدفع.':
      '💡 Redemption happens in store — just tell the cashier you want to use your points at checkout.',
    'تمام! ✅ لما تيجي تدفعي، الكاشير هيلاقي طلب الاستبدال جاهز':
      'Done! ✅ When you pay, the cashier will find your redemption request ready',
    '🎁 طلبتي استبدال': '🎁 You requested to redeem',
    '🎁 مكافأة خاصة ليكي': '🎁 A special reward for you',
    'مكافآتك': 'Your rewards',
    'الخاصة': 'rewards',
    'ساري لحد': 'Valid until',
    'صالحة': 'Valid for',
    'يوم': 'days',
    'يوم كمان — بتتطبق عند الدفع': 'more days — applied at checkout',
    'بتتطبق عند الدفع': 'Applied at checkout',
    'تم تفعيل العرض! 🎉 هيتطبق تلقائي عند الدفع في المحل':
      'Offer activated! 🎉 It will apply automatically when you pay in store',
    '🎁 فعّل العرض': '🎁 Activate offer',
    '✅ مفعّل': '✅ Active',

    /* ---------- العروض والكتالوج ---------- */
    'عروض': 'Offers',
    'النهاردة': 'today',
    'آخر عروض': 'Latest from',
    'عرض': 'Offer',
    'عرض مفتوح': 'Open offer',
    'خصم': 'Discount',
    'على أي فاتورة': 'on any purchase',
    '🏪 على المحل كله': '🏪 Storewide',
    'منتج': 'Product',
    'منتج مختار': 'Selected product',
    'صنف': 'Item',
    'مش متاح': 'Unavailable',
    'مفيش عروض دلوقتي.': 'No offers right now.',
    'تابعينا — قريب هيبقى فيه حاجات حلوة!': 'Stay tuned — good things are coming!',
    'لسه مفيش منتجات معروضة.': 'No products on display yet.',
    'بنجيب أحدث العروض...': 'Fetching the latest offers...',
    'ثانية واحدة...': 'One second...',
    '🧕 جرّبيها بنفسك': '🧕 Try it on',
    'مرة': 'time',
    'مرات)': 'times)',
    '· باقي': '· left',
    '· بحد أقصى': '· up to',

    /* ---------- الفواتير ---------- */
    '🧾 فواتيري': '🧾 My receipts',
    '🧾 فاتورة': '🧾 Receipt',
    '🛍️ فاتورة': '🛍️ Receipt',
    'الإجمالي': 'Total',
    'خدمك': 'Served by',
    'نقاط كسبتيها': 'Points earned',
    'قطعة ·': 'items ·',
    'كاش': 'Cash',
    'فيزا': 'Card',
    'انستاباي': 'InstaPay',
    'غير معروف': 'Unknown',
    'بنجيب فواتيرك...': 'Fetching your receipts...',
    'لسه مفيش فواتير مسجّلة باسمك.': 'No receipts saved under your name yet.',
    'قوّلي الكاشير يحط رقمك وقت الشراء عشان تتحفظ هنا.':
      'Ask the cashier to add your number at checkout so they show up here.',
    '📷 لو عايزة ترجّعي حاجة، ورّي الكود ده للكاشير':
      '📷 To return an item, show this code to the cashier',

    /* ---------- حسابي ---------- */
    'كود العضوية': 'Membership code',
    'رصيد النقاط': 'Points balance',
    'عضو من': 'Member since',
    'اتسجّل النهاردة': 'Joined today',
    '💰 رصيدي': '💰 My balance',
    'رصيدك دلوقتي': 'Your balance now',
    '📒 كشف حساب الرصيد': '📒 Balance statement',
    'لسه مفيش حركات': 'No transactions yet',
    'حركة': 'transaction',
    '🎁 عندي كود كارت هدية': '🎁 I have a gift card code',
    '🎁 كارت هدية': '🎁 Gift card',
    'اكتبي الكود': 'Enter the code',
    'اكتبي كود الكارت اللي وصلك. هيتحوّل رصيد في حسابك على طول،':
      'Enter the code you received. It turns into balance in your account right away,',
    'وتقدري تصرفيه في أي فرع.': 'and you can spend it at any branch.',
    'استلمي الرصيد': 'Claim balance',
    'الكود مش صحيح': 'Invalid code',
    '🎉 اتضاف': '🎉 Added',
    'محتاجة نت عشان تستلمي': 'You need an internet connection to claim',
    '🔖 طلباتي': '🔖 Things I asked for',
    'بندوّرلك': 'Looking for it',
    'لسه مفيش طلبات': 'No requests yet',
    'لو دوّرتي على حاجة ومالقيتيهاش في الفرع،': 'If you looked for something and did not find it in store,',
    'قولي للبياعة تسجّلها — ونكلّمك أول ما توصل.': 'ask the staff to log it — we will call you as soon as it arrives.',
    'الحاجات دي مسجّلة عندنا. أول ما توصل، هنكلّمك على رقمك 🌸':
      'These are logged with us. As soon as they arrive, we will call you 🌸',
    '📲 نزّلي التطبيق على الموبايل': '📲 Install the app on your phone',
    '📲 لتثبيت التطبيق على الآيفون: دوسي على زر المشاركة': '📲 To install on iPhone: tap the share button',
    'تحت، بعدين اختاري': 'below, then choose',
    'تحت، بعدين': 'below, then',
    '«إضافة إلى الشاشة الرئيسية»': '“Add to Home Screen”',
    'أسرع في الفتح، وأول مين يعرف العروض والمكافآت الجديدة 🎁':
      'Opens faster, and you hear about new offers and rewards first 🎁',
    'ثبّتيه وفعّلي الإشعارات — ومستنياكي مكافأة ترحيب 🎁':
      'Install it and turn on notifications — a welcome reward is waiting 🎁',

    /* ---------- التواصل والشات ---------- */
    'تواصلي معانا': 'Talk to us',
    '💬 تواصلي معانا على واتساب': '💬 Chat with us on WhatsApp',
    'تواصل واتساب': 'WhatsApp',
    'كلمينا هنا على طول': 'Message us right here',
    'اسألي عن مقاس، لون، توفّر — بنرد جوه التطبيق':
      'Ask about a size, a colour, availability — we reply inside the app',
    'أو اختاري الفرع الأقرب ليكي وكلّمينا على واتساب 🌸':
      'Or pick your nearest branch and message us on WhatsApp 🌸',
    'تابعينا على السوشيال ميديا': 'Follow us on social media',
    'هنضيف أرقام الفروع قريبًا 🌸': 'Branch numbers coming soon 🌸',
    'ابدأي الكلام — اسألي عن أي حاجة 🌸': 'Say hi — ask us anything 🌸',
    'اكتبي رسالتك…': 'Type your message…',
    'ابعتي صورة': 'Send a photo',
    '📷 صورة': '📷 Photo',
    'هتتبعت مع رسالتك': 'Will be sent with your message',
    'بيتبعت…': 'Sending…',
    'بنرد من ١٠ الصبح لـ١٠ بالليل': 'We reply from 10am to 10pm',
    'متواجدين دلوقتي — بنرد في دقايق 🌸': 'We are online now — we reply within minutes 🌸',
    'مقفولين دلوقتي — سيبي رسالتك وهنرد أول ما نفتح':
      'We are closed now — leave your message and we will reply when we open',
    'الرسالة موصلتش — جرّبي تاني': 'Message not sent — please try again',
    'الصورة كبيرة قوي': 'The photo is too large',
    'الصورة مش مقروءة': 'The photo could not be read',
    'السلام عليكم 🌸': 'Hello 🌸',
    'السلام عليكم 🌸 — فرع': 'Hello 🌸 — branch',
    'السلام عليكم، أنا': 'Hello, I am',
    'ومحتاجة مساعدة.': 'and I need some help.',
    '— فرع': '— branch',
    'فيسبوك': 'Facebook',
    'انستجرام': 'Instagram',
    'واتساب': 'WhatsApp',

    /* ---------- التقييم ---------- */
    'إزاي كانت زيارتك؟': 'How was your visit?',
    'رأيك بيوصل للإدارة مباشرة': 'Your feedback goes straight to management',
    'إرسال التقييم': 'Send feedback',
    'مش دلوقتي': 'Not now',
    'وحش': 'Bad',
    'عادي': 'Okay',
    'كويس': 'Good',
    'ممتاز': 'Excellent',
    'شكرًا لك': 'Thank you',
    'وصلنا رأيك': 'We got your feedback',
    'شكرًا — تحب تضيف حاجة؟': 'Thanks — anything you want to add?',
    'آسفين — قولنا إيه اللي حصل وهنتصرف': 'We are sorry — tell us what happened and we will fix it',
    'سعداء إن الزيارة عجبتك — نتشرف بزيارتك القادمة.':
      'So glad you enjoyed your visit — we look forward to the next one.',
    'الإدارة هتشوف رأيك وهنشتغل عليه. آسفين على أي إزعاج.':
      'Management will see your feedback and act on it. Sorry for any trouble.',
    'تعذّر الإرسال — جرّب تاني': 'Could not send — please try again',

    /* ---------- الفروع ---------- */
    'الرحاب': 'El Rehab',
    'مدينتي': 'Madinaty',
    'سيتي سنتر': 'City Centre',

    /* ---------- التحيات ---------- */
    'صباح الخير 🌷': 'Good morning 🌷',
    'نهارك سعيد ✨': 'Good afternoon ✨',
    'مساء الخير 🌙': 'Good evening 🌙',
    'من': 'from',
    'بدأنا': 'Started',
    'لسه مابدأناش': 'Not started yet',
    'تعديل': 'Edit',

    /* ---------- الأخطاء والحالات ---------- */
    '⚠️ التطبيق مقفلش صح': '⚠️ The app did not open properly',
    'اقفل الصفحة وافتحها تاني، ولو فضلت المشكلة امسح بيانات الموقع.':
      'Close the page and open it again. If the problem stays, clear the site data.',
    'النت ضعيف — حاولي تاني': 'Weak connection — please try again',
    'حصل خطأ، حاولي تاني': 'Something went wrong, please try again',
    'معرفناش نحفظ — حاولي تاني': 'We could not save — please try again',
    'معرفناش نحفظ الحساب — حاولي تاني': 'We could not save your account — please try again',
    '⚠️ حصل خطأ:': '⚠️ Error:',
    'مفيش عميلة مسجّلة دخول': 'No customer is signed in',
    'العميلة خرجت قبل الحفظ': 'The customer signed out before saving',
    'المتصفح ده مش بيدعم تخزين الأوفلاين': 'This browser does not support offline storage',
    'أكتر من تاب مفتوح — الأوفلاين هيشتغل بس مش بكامل قوته':
      'More than one tab is open — offline mode works, but not at full strength',
    'المتصفح/الجهاز مش بيدعم الإشعارات': 'This browser/device does not support notifications',
    'الإشعارات مرفوضة من إعدادات المتصفح': 'Notifications are blocked in the browser settings',
    'مسمحتش بالإشعارات': 'Notifications were not allowed',

    /* ---------- 🚚 الشحن والتسليم ---------- */
    '🚚 عايزاها إزاي؟': '🚚 How would you like it?',
    'استلام من الفرع': 'Pick up in store',
    'تعالي خديها بنفسك': 'Collect it yourself',
    'شحن للبيت': 'Home delivery',
    'توصلك لحد باب البيت': 'Delivered to your door',
    '📍 يتشحن منين': '📍 Ships from',
    '👤 بياناتك للتوصيل': '👤 Your delivery details',
    'اختاري المحافظة': 'Choose your governorate',
    'العنوان بالتفصيل — الشارع والعمارة والدور والشقة':
      'Full address — street, building, floor, apartment',
    'علامة مميزة أو ملاحظة (اختياري)': 'Landmark or note (optional)',
    'البضاعة': 'Items',
    'الشحن': 'Shipping',
    'مجاني 🎉': 'Free 🎉',
    'هنكلّمك على رقمك نأكّد الأوردر قبل ما يتشحن.':
      'We will call you to confirm your order before it ships.',
    '💵 كاش عند الاستلام': '💵 Cash on delivery',
    'اختاري الفرع اللي هيتشحن منه': 'Choose the branch it ships from',
    'اكتبي العنوان بالتفصيل (الشارع والعمارة والدور)':
      'Enter your full address (street, building, floor)',
    'وصلنا طلبك — بنراجعه ونجهّزه': 'We got your order — reviewing and preparing it',
    'بنجهّز طلبك — وهيتشحن أول ما يخلص': 'Preparing your order — it ships as soon as it is ready',
    'طلبك جاهز ومستني الشحن — هنكلّمك قبل ما يوصل':
      'Your order is ready and awaiting shipping — we will call before it arrives',
    'اتشحن ووصل — اتمنى يعجبك 🌸': 'Shipped and delivered — hope you love it 🌸',

    /* ---------- 🛍️ «اطلبي» + «أوردراتي» (التطبيقين والموقع) ---------- */
    'اطلبي': 'Shop',
    'أونلاين': 'online',
    'اطلبي دلوقتي': 'Place order',
    'اختاري اللي عايزاه، وحدّدي الفرع اللي هتستلمي منه. بنحجزلك ٢٤ ساعة.':
      'Pick what you like and choose the branch you will collect from. We hold it for 24 hours.',
    '🧺 سلتك': '🧺 Your basket',
    '➕ ضيفي': '➕ Add',
    '🏬 هستلم من فرع': '🏬 Collect from',
    '💳 هدفع في الفرع بـ': '💳 I will pay in store with',
    '💵 كاش': '💵 Cash',
    '💳 فيزا': '💳 Card',
    'بنحجزلك الحاجات ٢٤ ساعة — بعدها بترجع للبيع.':
      'We hold your items for 24 hours — after that they go back on sale.',
    '🛍️ أوردراتي': '🛍️ My orders',
    'لسه مفيش أوردرات': 'No orders yet',
    'اختاري من «اطلبي» واستلمي من أقرب فرع.': 'Pick from Shop and collect at your nearest branch.',
    'سجّلي دخولك الأول': 'Please sign in first',
    'السلة فاضية': 'Your basket is empty',
    'اختاري الفرع اللي هتستلمي منه': 'Choose the branch you will collect from',
    'معرفناش نبعت الأوردر — حاولي تاني': 'We could not send the order — please try again',
    '💵 هتدفعي كاش في الفرع': '💵 You will pay cash in store',
    '💳 هتدفعي فيزا في الفرع': '💳 You will pay by card in store',
    /* حالات الأوردر — نفس نصوص `orders-core` بالحرف */
    'اتسجّل': 'Placed',
    'بيتجهّز': 'Preparing',
    'جاهز': 'Ready',
    'اتسلّم': 'Collected',
    'اتلغى': 'Cancelled',
    'انتهى': 'Expired',
    'بنراجع طلبك — هنبدأ نجهّزه حالًا': 'We are reviewing your order — we will start preparing it shortly',
    'لسه بنجهّز — هنقولك أول ما يخلص': 'Still preparing — we will tell you the moment it is done',
    'روحي الفرع واستلمي — قولي رقم الأوردر أو امسحي كارتك':
      'Come to the branch and collect — give your order number or scan your card',
    'اتسلّم — اتمنى يعجبك 🌸': 'Collected — hope you love it 🌸',
    'عدّت المدة والحجز رجع — تقدري تطلبي تاني':
      'The hold expired and the items went back on sale — you can order again',

    /* ---------- 🖤 Glow — نصوص خاصة بالتطبيق التاني ----------
       ⚠️ القاموس مشترك عن قصد: نفس الجملة في التطبيقين ليها ترجمة
          واحدة، والاختلاف بس في اللي فعلًا مختلف (البراند والتبويبات
          وعلامة القلب 🖤 بدل الوردة 🌸). */
    'Glow · نادي العملاء': 'Glow · Rewards Club',
    'نادي عملاء Glow': 'Glow Rewards Club',
    'نقاطي': 'My points',
    'مشترياتي': 'My purchases',
    'بطاقة عضوية': 'Membership card',
    'ج.م رصيد مكافآت': 'EGP in rewards',
    'أو اختاري الفرع الأقرب ليكي وكلّمينا على واتساب 🖤':
      'Or pick your nearest branch and message us on WhatsApp 🖤',
    'اسألي عن توفّر، لون، مقاس — بنرد جوه التطبيق':
      'Ask about availability, a colour, a size — we reply inside the app',
    'هنضيف أرقام الفروع قريبًا 🖤': 'Branch numbers coming soon 🖤',
    'السلام عليكم 🖤 — فرع': 'Hello 🖤 — branch',
    '📷 اعرضي الكود ده للكاشير عند الدفع': '📷 Show this code to the cashier at checkout',
    'عشان توصلك العروض أول ما تنزل: دوسي مشاركة': 'To get offers the moment they drop: tap share',
    /* ⚠️ نسخة بفاصلة عادية — Glow مكتوب فيه ',' مش '،'.
       المطابقة تامة، فالنسختين لازم يبقوا في القاموس وإلا السطر
       ده بيفضل عربي جوه شاشة إنجليزي من غير أي سبب واضح. */
    'اكتبي كود الكارت اللي وصلك. هيتحوّل رصيد في حسابك على طول,':
      'Enter the code you received. It turns into balance in your account right away,',
    'لو دوّرتي على حاجة ومالقيتيهاش في الفرع,': 'If you looked for something and did not find it in store,'
  }
};

/* 🔢 أنماط النصوص اللي فيها أرقام — المطابقة التامة مبتنفعش معاها
   لأن الرقم بيتلزق في نفس العقدة النصية.
   ⚠️ الترتيب مهم: أول نمط بيطابق هو اللي بيتنفذ. */
var I18N_PATTERNS = {
  en: [
    { re: /^باقي (\d+) دقيقة$/,            to: '$1 min left' },
    { re: /^باقي (\d+) (?:ساعة|ساعتين|ساعات)$/, to: '$1 h left' },
    { re: /^فاضل (\d+) نقطة$/,             to: '$1 points to go' },
    { re: /^صالحة (\d+) يوم كمان — بتتطبق عند الدفع$/, to: 'Valid $1 more days — applied at checkout' },
    { re: /^عضو من (.+)$/,                 to: 'Member since $1' },
    { re: /^\+(\d+) نقطة$/,                to: '+$1 points' },
    { re: /^(\d[\d,\.]*) نقطة$/,           to: '$1 points' },
    { re: /^(\d[\d,\.]*) ج\.م$/,           to: 'EGP $1' },
    { re: /^خصم (\d[\d,\.]*) ج\.م — هيتطبق عند الدفع$/, to: 'EGP $1 off — applied at checkout' },
    { re: /^كل (\d[\d,\.]*) ج\.م تشتريها = نقطة$/, to: 'Every EGP $1 you spend = 1 point' },
    { re: /^كل (\d+) نقطة = (\d[\d,\.]*) ج\.م خصم$/, to: 'Every $1 points = EGP $2 off' },
    { re: /^≈ (\d[\d,\.]*) ج\.م رصيد مكافآت$/, to: '≈ EGP $1 in rewards' },
    { re: /^(\d+) حركة$/,                  to: '$1 transactions' },
    { re: /^(\d+) قطعة · (.+)$/,           to: '$1 items · $2' }
  ]
};

/* ============================================================
   المحرك
   ============================================================ */
var _i18nLang = 'ar';
var _i18nOrig = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
var _i18nObserver = null;
var _i18nOnChange = [];

function i18nNormalizeLang(l){
  l = String(l || '').toLowerCase().slice(0, 2);
  return I18N_LANGS[l] ? l : 'ar';
}

function i18nLang(){ return _i18nLang; }
function i18nDir(){ return I18N_LANGS[_i18nLang].dir; }
function i18nLocale(){ return I18N_LANGS[_i18nLang].locale; }

/* 🔤 ترجمة نص واحد.
   ⚠️ بيرجّع **النص الأصلي** لو مفيش ترجمة — ده اللي بيخلي أي ميزة
      جديدة تشتغل من غير ما حد يفتكر يضيفها للقاموس. */
function i18nT(s){
  if(_i18nLang === 'ar') return s;
  if(s === null || s === undefined) return s;
  var raw = String(s);
  var t = raw.trim();
  if(!t) return raw;
  var dict = I18N_DICT[_i18nLang] || {};
  var hit = dict[t];
  if(hit !== undefined) return raw.replace(t, hit);
  var pats = I18N_PATTERNS[_i18nLang] || [];
  for(var i = 0; i < pats.length; i++){
    if(pats[i].re.test(t)) return raw.replace(t, t.replace(pats[i].re, pats[i].to));
  }
  return raw;
}

/* 🧠 حفظ الأصل قبل أول ترجمة — من غيره الرجوع للعربي مستحيل
   (النص العربي بيبقى اتمسح خلاص من العقدة). */
function _i18nOriginal(node){
  if(!_i18nOrig) return node.nodeValue;
  if(!_i18nOrig.has(node)) _i18nOrig.set(node, node.nodeValue);
  return _i18nOrig.get(node);
}

var I18N_SKIP_TAGS = { SCRIPT:1, STYLE:1, TEXTAREA:1, SVG:1, CODE:1 };
var I18N_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

function _i18nSkip(el){
  while(el){
    if(el.nodeType === 1){
      if(I18N_SKIP_TAGS[el.tagName]) return true;
      if(el.hasAttribute && el.hasAttribute('data-noi18n')) return true;
    }
    el = el.parentNode;
  }
  return false;
}

function _i18nTextNode(node){
  if(!node || node.nodeType !== 3) return;
  if(_i18nSkip(node.parentNode)) return;
  var orig = _i18nOriginal(node);
  if(!orig || !orig.trim()) return;
  var next = i18nT(orig);
  if(next !== node.nodeValue) node.nodeValue = next;
}

function _i18nAttrs(el){
  if(!el || el.nodeType !== 1 || !el.getAttribute) return;
  if(_i18nSkip(el)) return;
  for(var i = 0; i < I18N_ATTRS.length; i++){
    var a = I18N_ATTRS[i];
    if(!el.hasAttribute(a)) continue;
    var key = 'i18nO' + a.replace(/-([a-z])/g, function(m, c){ return c.toUpperCase(); });
    var orig = el.dataset ? el.dataset[key] : null;
    if(orig === undefined || orig === null){
      orig = el.getAttribute(a);
      if(el.dataset) el.dataset[key] = orig;
    }
    if(!orig) continue;
    var next = i18nT(orig);
    if(next !== el.getAttribute(a)) el.setAttribute(a, next);
  }
}

function i18nApply(root){
  root = root || (typeof document !== 'undefined' ? document.body : null);
  if(!root) return;
  if(root.nodeType === 3){ _i18nTextNode(root); return; }
  if(root.nodeType !== 1 && root.nodeType !== 9) return;
  var doc = root.ownerDocument || root;
  if(root.nodeType === 1) _i18nAttrs(root);
  var walker = doc.createTreeWalker(root, 1 | 4, null, false);   // عناصر + نصوص
  var n;
  while((n = walker.nextNode())){
    if(n.nodeType === 3) _i18nTextNode(n);
    else _i18nAttrs(n);
  }
}

/* 👀 المراقب — أي حاجة بترتسم بعدين بتتترجم تلقائي.
   ⚠️ من غيره: أول `renderCard()` بعد تغيير اللغة بترجّع كل حاجة عربي
      من غير أي رسالة خطأ — والشكل بيبقى نص ونص. */
function i18nObserve(root){
  if(typeof MutationObserver === 'undefined') return null;
  root = root || document.body;
  if(_i18nObserver) _i18nObserver.disconnect();
  _i18nObserver = new MutationObserver(function(muts){
    if(_i18nLang === 'ar') return;
    for(var i = 0; i < muts.length; i++){
      var m = muts[i];
      if(m.type === 'characterData'){ _i18nTextNode(m.target); continue; }
      for(var j = 0; j < m.addedNodes.length; j++){
        var n = m.addedNodes[j];
        if(n.nodeType === 3) _i18nTextNode(n);
        else if(n.nodeType === 1) i18nApply(n);
      }
    }
  });
  _i18nObserver.observe(root, { childList: true, subtree: true, characterData: true });
  return _i18nObserver;
}

/* 🔄 تغيير اللغة — من غير إعادة تحميل.
   الرجوع للعربي بيعيد ضبط النصوص من الأصل المحفوظ. */
function i18nSetLang(lang, opts){
  opts = opts || {};
  var l = i18nNormalizeLang(lang);
  _i18nLang = l;
  try{ localStorage.setItem(I18N_KEY, l); }catch(e){}
  if(typeof document !== 'undefined' && document.documentElement){
    document.documentElement.lang = l;
    document.documentElement.dir = I18N_LANGS[l].dir;
  }
  if(opts.apply !== false && typeof document !== 'undefined'){
    if(_i18nLang === 'ar') _i18nRestoreAll(document.body);
    i18nApply(document.body);
  }
  for(var i = 0; i < _i18nOnChange.length; i++){
    try{ _i18nOnChange[i](l); }catch(e){}
  }
  return l;
}

function _i18nRestoreAll(root){
  if(!root || !_i18nOrig) return;
  var doc = root.ownerDocument || root;
  var walker = doc.createTreeWalker(root, 1 | 4, null, false);
  var n;
  while((n = walker.nextNode())){
    if(n.nodeType === 3){
      if(_i18nOrig.has(n)) n.nodeValue = _i18nOrig.get(n);
    }else if(n.dataset){
      for(var i = 0; i < I18N_ATTRS.length; i++){
        var a = I18N_ATTRS[i];
        var key = 'i18nO' + a.replace(/-([a-z])/g, function(m, c){ return c.toUpperCase(); });
        if(n.dataset[key] !== undefined) n.setAttribute(a, n.dataset[key]);
      }
    }
  }
}

function i18nOnChange(fn){ if(typeof fn === 'function') _i18nOnChange.push(fn); }

/* 🚀 التشغيل — بيقرا اللغة المحفوظة قبل أي رسم.
   ⚠️ لازم يتنادى **بدري** عشان الشاشة متبتدأش عربي وتقلب قدام
      العميلة (ومضة اللغة). */
function i18nInit(opts){
  opts = opts || {};
  var saved = null;
  try{ saved = localStorage.getItem(I18N_KEY); }catch(e){}
  var l = i18nNormalizeLang(saved || opts.fallback || 'ar');
  i18nSetLang(l, { apply: false });
  return l;
}

/* 🌍 اللغة المفضلة من المتصفح — بتتستعمل مرة واحدة بس لو العميلة
   عمرها ما اختارت. ⚠️ مش بتتحفظ: لو اختارت عربي صراحةً، مبنعملش
   override تاني في الزيارة الجاية. */
function i18nBrowserGuess(nav){
  var n = nav || (typeof navigator !== 'undefined' ? navigator : null);
  var list = (n && (n.languages || [n.language])) || [];
  for(var i = 0; i < list.length; i++){
    var code = String(list[i] || '').toLowerCase();
    if(code.indexOf('ar') === 0) return 'ar';
    if(code.indexOf('en') === 0) return 'en';
  }
  return 'ar';
}

function i18nHasSaved(){
  try{ return !!localStorage.getItem(I18N_KEY); }catch(e){ return false; }
}

/* 🧩 زرار اللغة — HTML جاهز، عشان التطبيقين يستعملوا نفس الشكل
   ونفس الأسماء. */
function i18nSwitchHTML(opts){
  opts = opts || {};
  var cur = i18nLang();
  var cls = opts.className || 'lang-switch';
  var h = '<div class="' + cls + '" data-noi18n role="group" aria-label="Language">';
  ['ar', 'en'].forEach(function(l){
    h += '<button type="button" class="lang-opt' + (l === cur ? ' on' : '') + '"'
      +  ' data-lang="' + l + '" onclick="appSetLang(\'' + l + '\')">'
      +  I18N_LANGS[l].name + '</button>';
  });
  return h + '</div>';
}

if(typeof window !== 'undefined'){
  window.I18N_KEY = I18N_KEY;
  window.I18N_LANGS = I18N_LANGS;
  window.I18N_DICT = I18N_DICT;
  window.I18N_PATTERNS = I18N_PATTERNS;
  window.i18nLang = i18nLang;
  window.i18nDir = i18nDir;
  window.i18nLocale = i18nLocale;
  window.i18nT = i18nT;
  window.t = window.t || i18nT;
  window.i18nApply = i18nApply;
  window.i18nObserve = i18nObserve;
  window.i18nSetLang = i18nSetLang;
  window.i18nInit = i18nInit;
  window.i18nOnChange = i18nOnChange;
  window.i18nBrowserGuess = i18nBrowserGuess;
  window.i18nHasSaved = i18nHasSaved;
  window.i18nSwitchHTML = i18nSwitchHTML;
  window.i18nNormalizeLang = i18nNormalizeLang;
}
if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    I18N_KEY, I18N_LANGS, I18N_DICT, I18N_PATTERNS,
    i18nLang, i18nDir, i18nLocale, i18nT, i18nApply, i18nObserve,
    i18nSetLang, i18nInit, i18nOnChange, i18nBrowserGuess, i18nHasSaved,
    i18nSwitchHTML, i18nNormalizeLang
  };
}
