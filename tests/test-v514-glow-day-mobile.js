const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('Office/index.html','utf8');
const sw=fs.readFileSync('Office/sw.js','utf8');
const agent=fs.readFileSync('branch-tools/glow/cctv-gateway/GLOW-CCTV-AGENT.ps1','utf8');
const updater=fs.readFileSync('branch-tools/glow/cctv-gateway/UPDATE-GLOW-v514.ps1','utf8');

assert(html.includes('id="ofCctvDayReview"'),'day review has a scoped mobile layout');
assert(/#ofCctvDayReview \.of-cctv-day-controls\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(html),'mobile controls use a non-overflowing two-column grid');
assert(html.includes('#ofCctvDayDate,#ofCctvDayTime{direction:ltr}'),'date/time remain readable on RTL mobile');
assert(sw.includes("echarpe-office-v514"),'Office cache bumped for the layout fix');
assert(agent.includes("$p -eq '/echarpe-playback/range'")&&agent.includes("rangeBasis='nvr_retention_window'"),'Glow exposes full-day playback coverage');
assert(agent.includes('version=514'),'Glow runtime reports v514');
assert(updater.includes('V514_DAY_RANGE_FAILED')&&updater.includes('ROLLBACK=OK'),'updater verifies range and rolls back safely');
console.log('Glow day review + Office mobile v514: PASS');

