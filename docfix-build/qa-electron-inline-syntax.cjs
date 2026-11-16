'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'main.js'),'utf8');
const marker='win.webContents.executeJavaScript(`';
const from=src.indexOf(marker),to=src.indexOf('`,true);',from);
assert.ok(from>0&&to>from,'Electron self-test renderer script must exist');
const script=src.slice(from+marker.length,to);
assert.doesNotThrow(()=>new Function(script),
 'embedded Electron self-test must compile (no duplicate const/let names)');
assert.ok(src.includes('SELF_TEST_FAIL')&&src.includes('SELF_TEST_RESULT'));
console.log('PASS: Electron inline self-test parser / duplicate declarations');
