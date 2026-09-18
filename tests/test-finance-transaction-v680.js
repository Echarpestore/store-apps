'use strict';
// Harness wrapper: execute asynchronous mock suite as a separate process so tests/run.js
// cannot call process.exit before its asynchronous assertions finish.
const {spawnSync}=require('child_process');
const path=require('path');
const result=spawnSync(process.execPath,[path.join(__dirname,'spec-finance-transaction-mock-v680.js')],{encoding:'utf8',timeout:30000});
if(result.stdout)process.stdout.write(result.stdout);
if(result.stderr)process.stderr.write(result.stderr);
const ok=result.status===0&&/FINANCE TRANSACTION MOCK 17\/17 PASS/.test(result.stdout||'');
if(global.assert)global.assert(ok,'finance v680 async transaction mock completed 9/9');
else if(!ok)throw Error('finance transaction mock failed: '+result.status);
