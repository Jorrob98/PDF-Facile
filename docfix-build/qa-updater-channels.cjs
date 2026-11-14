'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const main=fs.readFileSync(path.join(__dirname,'main.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'preload.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'app/stability.js'),'utf8');
const a=main.indexOf('function versionParts('),b=main.indexOf('function httpsBuffer(',a);
const c=main.indexOf('async function getLatestUpdate('),d=main.indexOf('function sendUpdateProgress(',c);
assert.ok(a>=0&&b>a&&c>b&&d>c,'updater discovery exists');
function fixture(version,releaseKind='beta'){
 const name=releaseKind==='beta'?'DocFix_Prova_'+version:'DocFix_Aggiornamento_'+version.split('.').slice(0,2).join('.');
 return {tag_name:'v'+version+(releaseKind==='beta'?'-prova':''),
  prerelease:releaseKind==='beta',draft:false,body:'Test '+version,
  assets:[{name:name+'.exe',size:100,browser_download_url:'https://github.com/test/'+name+'.exe'},
   {name:name+'.sha256',size:90,browser_download_url:'https://github.com/test/'+name+'.sha256'}]};
}
const releases=[fixture('1.9.36'),fixture('1.9.38'),
 {tag_name:'v1.9.45-prova',prerelease:true,draft:false,assets:[]},
 fixture('1.9.40','stable'),fixture('1.9.35')];
const stable=fixture('1.9.37','stable');
let urls=[];
const http=async url=>{
 urls.push(url);
 return {toString:()=>JSON.stringify(url.endsWith('/latest')?stable:releases)};
};
const build=new Function('httpsBuffer','app','UPDATE_API','UPDATE_TEST_API','updateChannel',
 main.slice(a,b)+main.slice(c,d)+';return {getLatestUpdate,checkForUpdates};');
function engine(current){
 return build(http,{getVersion:()=>current},
  'https://api.github.com/repos/Jorrob98/PDF-Facile/releases/latest',
  'https://api.github.com/repos/Jorrob98/PDF-Facile/releases?per_page=50',
  channel=>channel==='beta'?'beta':'stable');
}
(async()=>{
 const e=engine('1.9.37');
 const defaultResult=await e.checkForUpdates();
 assert.equal(defaultResult.available,false,'stable is default; beta must never auto-install');
 assert.equal(defaultResult.channel,'stable');
 const testResult=await e.checkForUpdates('beta');
 assert.equal(testResult.available,true);
 assert.equal(testResult.latest,'1.9.38','choose highest COMPLETE beta package, not highest tag');
 const file=await e.getLatestUpdate('beta');
 assert.equal(file.exeName,'DocFix_Prova_1.9.38.exe');
 assert.equal(file.shaName,'DocFix_Prova_1.9.38.sha256');
 assert.equal((await engine('1.9.34').checkForUpdates()).available,true,
  'existing 1.9.34 can discover stable bootstrap inside app');
 assert.ok(urls.some(url=>url.endsWith('/latest'))&&urls.some(url=>url.includes('per_page=50')));
 assert.ok(main.includes('downloadVerifiedUpdate(event.sender,channel)'));
 assert.ok(main.includes("crypto.createHash('sha256').update(exe)"));
 assert.ok(preload.includes("check:(channel='stable')")&&preload.includes("install:(channel='stable')"));
 assert.ok(ui.includes("id='docfix-update-channel'")&&ui.includes('Versioni di prova'));
 assert.ok(ui.includes('DocFixUpdater.check(channel)')&&ui.includes('DocFixUpdater.install(channel)'));
 assert.ok(ui.includes('window.confirm(')&&ui.includes('window.DocFixUpdater'));
 console.log('DocFix updater channel PASS: stable default, beta opt-in, signed installer, highest complete release, UI confirmation');
})().catch(e=>{console.error(e);process.exitCode=1});
