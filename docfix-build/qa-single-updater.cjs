'use strict';
// One in-app update channel for DocFix. Existing 1.9.37 must discover
// the next latest complete Windows release without a beta/stable selector.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'main.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'app/stability.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'preload.js'),'utf8');
const a=code.indexOf('function versionParts('),b=code.indexOf('function httpsBuffer(',a);
const c=code.indexOf('async function getLatestUpdate('),d=code.indexOf('function sendUpdateProgress(',c);
assert.ok(a>=0&&b>a&&c>b&&d>c);
const url='https://api.github.com/repos/Jorrob98/PDF-Facile/releases/latest';
const data={
 tag_name:'v1.9.40',prerelease:false,draft:false,body:'Verifica aggiornamento',
 assets:[
  {name:'DocFix_Aggiornamento_1.9.exe',size:200,browser_download_url:'https://github.com/example/update.exe'},
  {name:'DocFix_Aggiornamento_1.9.sha256',size:90,browser_download_url:'https://github.com/example/update.sha256'}
 ]
};
const requests=[];
const factory=new Function('httpsBuffer','app','UPDATE_API',code.slice(a,b)+
 code.slice(c,d)+';return {getLatestUpdate,checkForUpdates};');
const mock=async u=>{requests.push(u);return Buffer.from(JSON.stringify(data))};
(async()=>{
 const installed=factory(mock,{getVersion:()=> '1.9.37'},url);
 const check=await installed.checkForUpdates();
 assert.equal(check.current,'1.9.37');
 assert.equal(check.latest,'1.9.40');
 assert.equal(check.available,true,'one latest release must be offered to 1.9.37');
 const latest=await installed.getLatestUpdate();
 assert.equal(latest.exeName,'DocFix_Aggiornamento_1.9.exe');
 assert.equal(latest.shaName,'DocFix_Aggiornamento_1.9.sha256');
 assert.ok(requests.every(x=>x===url),'must only read GitHub latest');
 assert.equal((await factory(mock,{getVersion:()=> '1.9.40'},url).checkForUpdates()).available,false);
 assert.equal((await factory(mock,{getVersion:()=> '1.9.38'},url).checkForUpdates()).available,true);
 assert.ok(!ui.includes('docfix-update-channel'),'no stable/beta dropdown');
 assert.ok(!ui.includes('Versioni di prova')&&!ui.includes('Aggiornamenti stabili'));
 assert.ok(!ui.includes('updateChannel('));
 assert.ok(ui.includes('window.DocFixUpdater.check()')&&ui.includes('window.DocFixUpdater.install()'));
 assert.ok(preload.includes("check:()=>ipcRenderer.invoke('docfix:update:check')"));
 assert.ok(preload.includes("install:()=>ipcRenderer.invoke('docfix:update:install')"));
 assert.ok(!code.includes('UPDATE_TEST_API')&&!code.includes('updateChannel('));
 assert.ok(code.includes("crypto.createHash('sha256').update(exe)"),
  'update payload SHA-256 must still be verified');
 assert.ok(code.includes('writeUpdateReceipt(r.latest)'),'installed version must be checked after restart');
 console.log('DocFix single updater PASS: 1.9.37 offers 1.9.40, SHA retained, no selector, no extra feed');
})().catch(e=>{console.error(e);process.exitCode=1});
