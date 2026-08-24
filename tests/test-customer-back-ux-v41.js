'use strict';
const fs=require('fs'),assert=require('assert');
for(const app of ['loyalty','glow']){
 const s=fs.readFileSync(`${app}/index.html`,'utf8');
 assert(s.includes('Customer Back UX v41'),`${app}: back manager`);
 assert(s.includes("switchTab('card')"),`${app}: stack ends at points/card home`);
 assert(s.includes("wrapOpen('openInvoiceDetail','invoice')"),`${app}: invoice participates`);
 assert(s.includes("wrapOpen('showSheet','sheet')"),`${app}: sheets participate`);
 assert(s.includes("wrapOpen('openQuickCheckout','checkout')"),`${app}: checkout participates`);
 assert(s.includes("wrapOpen('tryonOverlayOpen','tryon')"),`${app}: try-on participates`);
 assert(s.includes("push('chat')"),`${app}: chat participates`);
 assert(s.includes("window.addEventListener('popstate'"),`${app}: Android/browser Back handled`);
 assert(s.includes("history.replaceState(state('home',{tab:'card'})"),`${app}: stable home anchor`);
 assert(!/location\.(?:href|assign|replace)\s*=.*back/i.test(s),`${app}: no forced exit`);
}
console.log('customer back UX v41: PASS');
