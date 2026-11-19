'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'main.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'app/stability.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'preload.js'),'utf8');
const a=code.indexOf('function versionParts('),b=code.indexOf('function httpsBuffer(',a);
const c=code.indexOf('async function getLatestUpdate('),d=code.indexOf('function sendUpdateProgress(',c);
assert.ok(a>=0&&b>a&&c>b&&d>c);
const stableUrl='https://api.github.com/repos/Jorrob98/PDF-Facile/releases/latest';
const betaUrl='https://api.github.com/repos/Jorrob98/PDF-Facile/releases?per_page=50';
function rel(version,type='stable',complete=true,rc='rc1'){
 const short=version.split('.').slice(0,2).join('.');
 const p='DocFix_Aggiornamento_'+short;
 return {tag_name:'v'+version+(type==='beta'?'-'+rc:''),prerelease:type==='beta',draft:false,
  assets:complete?[{name:p+'.exe',size:21000000,browser_download_url:'https://github.com/updates/'+p+'.exe'},
   {name:p+'.sha256',size:95,browser_download_url:'https://github.com/updates/'+p+'.sha256'}]:[]};
}
const stable=rel('1.9.55'),releases=[rel('1.9.56','beta'),rel('1.9.59','beta',false),rel('1.9.54','beta'),rel('1.9.57','stable')];
const calls=[];
const mock=async url=>{calls.push(url);return Buffer.from(JSON.stringify(url===stableUrl?stable:releases))};
const factory=new Function('httpsBuffer','app','UPDATE_API','UPDATE_TEST_API','updateChannel',
  code.slice(a,b)+code.slice(c,d)+';return {getLatestUpdate,checkForUpdates};');
const channel=c=>c==='beta'?'beta':'stable';
function make(current){return factory(mock,{getVersion:()=>current},stableUrl,betaUrl,channel);}
(async()=>{
 const engine=make('1.9.54');
 let check=await engine.checkForUpdates();
 assert.equal(check.available,true,'stable 1.9.55 must reach 1.9.54 in-app');
 assert.equal(check.latest,'1.9.55');
 assert.equal(check.channel,'stable','stable is default and cannot opt in by accident');
 const stablePkg=await engine.getLatestUpdate();
 assert.equal(stablePkg.exeName,'DocFix_Aggiornamento_1.9.exe');
 check=await make('1.9.55').checkForUpdates();
 assert.equal(check.available,false);
 const preview=await make('1.9.55').checkForUpdates('beta');
 assert.equal(preview.available,true);
 assert.equal(preview.latest,'1.9.56','latest COMPLETE prerelease, not incomplete 1.9.59');
 const pkg=await make('1.9.55').getLatestUpdate('beta');
 assert.equal(pkg.exeName,'DocFix_Aggiornamento_1.9.exe','compatible with release-candidate updater names');
 assert.equal(pkg.channel,'beta');
 assert.ok(calls.includes(stableUrl)&&calls.includes(betaUrl));
 assert.ok(ui.includes("id='docfix-update-channel'")&&ui.includes('Versioni di prova'));
 assert.ok(ui.includes("channel.value='stable'"),'each startup defaults to stable');
 assert.ok(ui.includes("window.confirm(")&&ui.includes('DocFixUpdater.install(channel)'));
 assert.ok(preload.includes("check:(channel='stable')")&&preload.includes("install:(channel='stable')"));
 assert.ok(code.includes("crypto.createHash('sha256').update(exe)"),'download SHA-256 validation preserved');
 assert.ok(code.includes("writeUpdateReceipt(r.latest)"),'verify installed version after restart');
 assert.ok(code.includes('downloadVerifiedUpdate(event.sender,channel)'), 'IPC beta pass-through');
 console.log('PASS DocFix in-app stable 1.9.55 and opt-in beta 1.9.56, SHA and rollback preserved');
})().catch(e=>{console.error(e);process.exitCode=1});
