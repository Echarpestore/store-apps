const fs=require('fs'),assert=require('assert');
const sale=fs.readFileSync('pos/pos-sale.js','utf8');
const prod=fs.readFileSync('pos/products.js','utf8');
const core=fs.readFileSync('pos/pos-core.js','utf8');
const app=fs.readFileSync('pos/app.js','utf8');
const sw=fs.readFileSync('pos/sw.js','utf8');

assert(sale.includes("pos_sale_draft_v1_"),'sale draft key missing');
assert(sale.includes("items:cart"),'sale items are not persisted');
assert(sale.includes("try{ _saleDraftSave(); }catch(e){}"),'cart mutations do not auto-save');
assert(sale.includes("try{ _saleDraftClear(); }catch(e){}   // ✅ الفاتورة اتحفظت"),'saved invoice must clear draft');
assert(sale.includes("clearCardSaleCompleteState") && sale.includes("paymobReset"),'sale restore/logout must not persist payment state');
assert(core.includes("prepareSaleDraftForLogout") && core.includes("saveReceiveDraft"),'logout must persist both drafts');
assert(core.includes("restoreSaleDraft"),'login/dashboard must restore sale draft');
assert(core.includes("beforeunload") && core.includes("saveSaleDraft"),'close/reload safety missing');

assert(prod.includes("pos_receive_draft_v1_"),'receive draft key missing');
assert(prod.includes("_recvDraftLoadForCurrentBranch"),'receive draft loader missing');
assert(prod.includes("saveReceiveDraft();") && prod.includes("renderReceiveCart"),'receive cart does not auto-save');
assert(prod.includes("try{ _recvDraftClear(); }catch(e){}"),'confirmed receive must clear draft');
assert(prod.includes("_recvDraftBranch !== br"),'receive drafts must be isolated by branch');

assert(app.includes("togglePayMethod('visa1')"),'F3 card 1 behavior regressed');
assert(app.includes("if(e.key === 'F9')"),'F9 drawer shortcut regressed');
assert(/store-apps-shell-v(36[5-9]|3[7-9]\d|[4-9]\d{2,})/.test(sw),'SW must track v365 or newer');
console.log('PASS draft persistence v365');
