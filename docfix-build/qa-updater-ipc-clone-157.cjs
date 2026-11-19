'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'main.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'preload.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'app/stability.js'),'utf8');
const a=source.indexOf('function cloneSafeUpdateResult(');
const b=source.indexOf('async function downloadVerifiedUpdate(',a);
assert.ok(a>0&&b>a,'clone safe IPC boundary must exist');
const ctx={Number,String,Math,log:()=>{},capture:null};
const test=[
"const data=cloneSafeUpdateResult({ok:true,available:true,current:'1.9.55',",
" latest:'1.9.58',notes:{fn:()=>42},",
" error:new Error('native failure'),updater:()=>false,launching:true});",
"const sender={isDestroyed:()=>false,send:(name,value)=>{capture={name,value};}};",
"sendUpdateProgress(sender,{phase:'download',percent:39,message:'Downloading',",
" downloaded:309,etaSeconds:{native:()=>false},unexpected:()=>false});",
"testResult={data,capture};"
].join('\n');
vm.runInNewContext(source.slice(a,b)+test,ctx);
assert.doesNotThrow(()=>structuredClone(ctx.testResult));
assert.equal(ctx.testResult.data.current,'1.9.55');
assert.equal(ctx.testResult.data.latest,'1.9.58');
assert.equal(ctx.testResult.data.launching,true);
assert.equal(ctx.testResult.data.updater,undefined,'platform file paths are not exposed to UI');
assert.equal(ctx.testResult.capture.name,'docfix:update:progress');
assert.equal(ctx.testResult.capture.value.phase,'download');
assert.equal(ctx.testResult.capture.value.etaSeconds,null);
assert.ok(preload.includes("check:async()=>")&&preload.includes("install:async()=>"),'no update-channel arguments');
assert.ok(preload.includes('IPC install:'),'clone errors are displayed, not silently hidden');
assert.ok(preload.includes('callback(plain)'),'native IPC event never forwarded');
assert.ok(source.includes('downloadVerifiedUpdate(event.sender,channel)'),'operator choice is preserved');
assert.ok(!ui.includes("id='docfix-update-channel'"),'one button, no channel picker');
assert.ok(ui.includes("DocFixUpdater.install()"),'update is available from the one button');
console.log('PASS: cloned updater replies, progress payload, single updater, visible IPC errors');
