'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'pos', 'chat-staff-ui.js'), 'utf8');
const posHtml = fs.readFileSync(path.join(root, 'pos', 'index.html'), 'utf8');
const salesHtml = fs.readFileSync(path.join(root, 'sales', 'index.html'), 'utf8');
const officeHtml = fs.readFileSync(path.join(root, 'Office', 'index.html'), 'utf8');
const posSw = fs.readFileSync(path.join(root, 'pos', 'sw.js'), 'utf8');
const salesSw = fs.readFileSync(path.join(root, 'sales', 'sw.js'), 'utf8');
const officeSw = fs.readFileSync(path.join(root, 'Office', 'sw.js'), 'utf8');

let passed = 0;
function ok(value, message){ assert(value, message); passed++; }
function fn(name, next){
  const start = chat.indexOf('function ' + name + '(');
  const end = chat.indexOf('\n  function ' + next + '(', start + 1);
  return start >= 0 && end > start ? chat.slice(start, end) : '';
}

ok(/#ccImgPrev\{[^}]*flex-wrap:wrap/.test(chat), 'image controls wrap instead of leaving the mobile viewport');
ok(/#ccCompose\{[^}]*overflow-y:auto/.test(chat), 'the complete image/bandana composer has one vertical scroll');
const bandCss = (chat.match(/#ccBandRow\{[^}]*\}/) || [''])[0];
ok(bandCss && !/overflow-y\s*:\s*auto|max-height/.test(bandCss), 'bandana row does not trap touch inside a nested vertical scroll');
ok(chat.includes('id="ccSendBtn"') && /has-image/.test(chat), 'photo state exposes a clear send button');
ok(chat.includes('function ccRevealImageControls()'), 'image controls have an explicit reveal helper');

const pick = fn('onPickImage', 'ccImgClear');
ok(pick.includes("document.getElementById('ccImgPrev').style.display = 'flex'"), 'photo preview is shown after camera returns');
ok(pick.includes('ccSyncSendButton();') && pick.includes('ccRevealImageControls();'), 'photo state updates send affordance and resets composer position');
ok(!/ccTryBc[^\n]*value\s*=|bandSelected\s*=\s*\[\]|ccBandBc[^\n]*value\s*=/.test(pick), 'changing the photo preserves hijab code and bandana choices');

const clear = fn('ccImgClear', 'ccBandToggle');
ok(clear.includes("_bc.value = ''") && clear.includes('CST.bandSelected = []') && clear.includes("_bcb.value = ''"), 'explicit cancel still clears hijab and bandana selections');

[
  [posHtml, 'pos'], [salesHtml, 'sales'], [officeHtml, 'office']
].forEach(([html, name])=> ok(/chat-staff-ui\.js\?v=545/.test(html), name + ' loads shared chat v545'));
ok(/store-apps-shell-v545/.test(posSw), 'POS cache is v545');
ok(/store-apps-shell-v545/.test(salesSw), 'Sales cache is v545');
ok(/echarpe-office-v545/.test(officeSw), 'Office cache is v545');

console.log(`chat compose mobile v545: ${passed}/${passed} PASS`);
