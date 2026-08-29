const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/../pos/import.js','utf8');
function take(a,b){ const s=src.indexOf(a), e=src.indexOf(b,s); if(s<0||e<0) throw new Error('missing '+a); return src.slice(s,e); }
const helper = take('function pickImportHeaderRow','// بيقرا أول شيت');
const parse = take('function parseExcel','// قارئ CSV بسيط');
const ctx = { window:{}, importTab:'customers', importHeaders:[], importParsedRows:[] };
vm.createContext(ctx);
vm.runInContext(helper + '\n' + parse, ctx);
const pick = ctx.pickImportHeaderRow;
function eq(a,b,msg){ if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error(msg + ': got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

eq(pick([
  ['Customer List'], ['ECHARPE Store'], [],
  ['Customer Name','Phone 1','EMail','Notes'], ['Mona','01012345678','m@example.com','']
], 'customers'), 3, 'QB customer preamble header');

eq(pick([['Inventory Report'],['Item Name','Item Number','Regular Price']], 'inventory'), 0, 'inventory behavior stays first non-empty');

eq(pick([['Report title'],['First Name','Last Name','Mobile Phone']], 'customers'), 1, 'customer aliases');

const rows = [
  ['QuickBooks POS Customer List'],
  ['Generated 28/08/2026'],
  [],
  ['Customer Name','Phone 1','EMail'],
  ['Mona Ali','01012345678','m@example.com'],
  ['Sara','01099998888','']
];
const XLSX = {
  read(){ return {SheetNames:['Customers'],Sheets:{Customers:{}}}; },
  utils:{sheet_to_json(){ return rows; }}
};
ctx.parseExcel(XLSX, new ArrayBuffer(1));
eq(ctx.importHeaders, ['Customer Name','Phone 1','EMail'], 'parseExcel uses real customer header row');
eq(ctx.importParsedRows.length, 2, 'parseExcel keeps customer data rows');
eq(ctx.importParsedRows[0]['Phone 1'], '01012345678', 'phone preserved');

if(!src.includes("if(note) note.textContent = '⏳ تم اختيار '")) throw new Error('immediate selected-file feedback missing');
if(!src.includes("'Mobile Phone','Cell','Cell Phone'")) throw new Error('customer phone aliases missing');
console.log('PASS customer import QB header v378');
