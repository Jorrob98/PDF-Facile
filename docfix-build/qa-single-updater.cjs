'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'main.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'app/stability.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'preload.js'),'utf8');
const a=code.indexOf('function versionParts('),b=code.indexOf('function httpsBuffer(',a);
const c=code.indexOf('async function getLatestUpdate('),d=code.indexOf('function cloneSafeUpdateResult(',c);
assert.ok(a>=0&&b>a&&c>b&&d>c);
const api='https://api.github.com/repos/Jorrob98/PDF-Facile/releases/latest';
function release(version,complete=true){
 const short=version.split('.').slice(0,2).join('.');
 const p='DocFix_Aggiornamento_'+short;
 return {tag_name:'v'+version,prerelease:false,draft:false,
  assets:complete?[{name:p+'.exe',size:21000000,browser_download_url:'https://github.com/updates/'+p+'.exe'},
   {name:p+'.sha256',size:95,browser_download_url:'https://github.com/updates/'+p+'.sha256'}]:[]};
}
let currentRelease=release('1.9.58');
const requests=[];
const mock=async url=>{requests.push(url);return Buffer.from(JSON.stringify(currentRelease))};
const factory=new Function('httpsBuffer','app','UPDATE_API',code.slice(a,b)+code.slice(c,d)+';return {getLatestUpdate,checkForUpdates};');
function make(version){return factory(mock,{getVersion:()=>version},api);}
(async()=>{
 let check=await make('1.9.55').checkForUpdates();
 assert.equal(check.available,true);
 assert.equal(check.latest,'1.9.58');
 check=await make('1.9.57').checkForUpdates();
 assert.equal(check.available,true);
 check=await make('1.9.58').checkForUpdates();
 assert.equal(check.available,false);
 const pkg=await make('1.9.55').getLatestUpdate();
 assert.equal(pkg.exeName,'DocFix_Aggiornamento_1.9.exe');
 assert.equal(pkg.shaName,'DocFix_Aggiornamento_1.9.sha256');
 assert.ok(requests.every(url=>url===api),'only one latest-release API is allowed');
 currentRelease=release('1.9.59',false);
 await assert.rejects(make('1.9.58').checkForUpdates(),/incompleti/,'incomplete update cannot be installed');
 currentRelease={...release('1.9.59'),prerelease:true};
 await assert.rejects(make('1.9.58').checkForUpdates(),/non disponibile/,'no preview channel');
 currentRelease=release('1.9.58');
 assert.ok(!ui.includes("docfix-update-channel")&&!ui.includes('Versioni di prova'));
 assert.ok(!ui.includes('Aggiornamenti stabili')&&!ui.includes("channel==='beta'"));
 assert.ok(ui.includes('DocFixUpdater.install()')&&ui.includes('DocFixUpdater.check()'));
 assert.ok(preload.includes('check:async()=>')&&preload.includes('install:async()=>'));
 assert.ok(code.includes("crypto.createHash('sha256').update(exe)"),'SHA-256 integrity check preserved');
 assert.ok(code.includes("writeUpdateReceipt(r.latest)"),'post-restart version verification preserved');
 assert.ok(code.includes('downloadVerifiedUpdate(event.sender)'), 'single updater IPC path');
 assert.ok(!code.includes('UPDATE_TEST_API')&&!code.includes('updateChannel='));
 console.log('PASS: a single in-app updater path for any installed version, no stable/beta UI, SHA-256 and rollback preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
