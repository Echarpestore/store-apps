/* «راضي؟» — إعداد السحابة.
 * سيبه null → التطبيق يشتغل وضع عرض (كل حاجة على الجهاز).
 * عشان تشغّله لعملاء حقيقيين: اعمل مشروع Firebase منفصل للمنتج ده
 * (متستخدمش مشروع إيشارب)، فعّل Email/Password و Anonymous في Auth،
 * انشر rady/firestore.rules، وحط الإعداد هنا:
 *   window.RADY_FIREBASE = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." };
 */
window.RADY_FIREBASE = null;
