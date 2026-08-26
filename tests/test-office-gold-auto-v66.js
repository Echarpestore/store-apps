'use strict';
const fs=require('fs'),assert=require('assert');
const s=fs.readFileSync('Office/office.js','utf8');
const h=fs.readFileSync('Office/index.html','utf8');

assert(s.includes("https://api.gold-api.com/price/XAU"),'gold source no-key endpoint');
assert(s.includes("@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json"),'USD/EGP source');
assert(s.includes("OF_TROY_OZ_GRAMS = 31.1034768"),'correct troy ounce conversion');
assert(s.includes("xauUsd * usdEgp / OF_TROY_OZ_GRAMS"),'EGP/gram calculation');
assert(s.includes("OF_GOLD_AUTO_REFRESH_MS = 6 * 3600 * 1000"),'6h refresh');
assert(s.includes("OF_GOLD_MANUAL_LOCK_MS = 24 * 3600 * 1000"),'manual override 24h');
assert(s.includes("manualUntil > now"),'auto respects manual lock');
assert(s.includes("goldSource:'تلقائي · Gold API + USD/EGP'"),'auto source stored');
assert(s.includes("goldManualUntil:Date.now()+OF_GOLD_MANUAL_LOCK_MS"),'manual lock stored');
assert(s.includes("تعذر تحديث السعر الآن. هيفضل آخر سعر محفوظ شغال"),'failure keeps last saved value');
assert(s.includes("document.addEventListener('visibilitychange'"),'refresh on app resume');
assert(h.includes('office.js?v=73'),'cache bust v73');
console.log('Office gold auto v66: PASS');
