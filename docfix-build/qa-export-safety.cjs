'use strict';
// DocFix offline workflow regression. Synthetic canvases; no user data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const begin=src.indexOf('async function normalizeKnownCard('),end=src.indexOf('// Never let an earlier 2-up success hide',begin);
assert.ok(begin>0&&end>begin,'multi-card normalization source is present');
const mock={
 DocFixScanner:{
  validQuad:q=>Array.isArray(q)&&q.length===4,
  area:q=>.24,
  process:()=>({width:840,height:540})
 },
 DocFixOnePass:{detect:()=>null},
 DocFixBlueCardOrientation:{decide:()=>null},
 DocFixGroup2:{recognizeMRZOrientation:()=>({trustworthy:false,angle:0})}
};
const quad=[{x:.12,y:.18},{x:.82,y:.18},{x:.82,y:.65},{x:.12,y:.65}];
const factory=new Function('window','cropMode','rotate','expandQuadSafe','fineDeskewCard','qualityAudit',
 'textLines','inferTextOrientation','console',src.slice(begin,end)+';return normalizeKnownCard;');
const normalize=factory(mock,()=> 'smart',c=>c,q=>q,()=>({applied:false,verified:true}),
 ()=>({review:false,issues:[],metrics:{}}),()=>({vertical:false}),
 async()=>({trustworthy:false,angle:0}),console);
module.exports=(async()=>{
 const original={width:1200,height:1600};
 const unverified=await normalize(original,quad,'prova',.89,{multiSafe:true,cardKind:'generic',sourceVerified:false});
 assert.equal(unverified.cropVerified,false,'unverified synthetic crop is not physically proven');
 assert.equal(unverified.manualPending,true,'unverified synthetic crop requires review before PDF export');
 const verified=await normalize(original,quad,'prova',.89,{multiSafe:true,cardKind:'generic',sourceVerified:true});
 assert.equal(verified.cropVerified,true,'validated quad retains auto-crop');
 assert.equal(verified.manualPending,false,'physically verified crop must not require manual work');
 assert.ok(src.includes('e.manualPending=false;const q=qualityAudit(e.processed,null);'),
  'full-page recovery clears manual pending');
 assert.ok(src.includes('e.sourceQuad=rotatedQuad(editQuad,(360-editRotation)%360);e.manualPending=false;'),
  'confirmed manual crop clears manual pending');
 const eStart=src.indexOf('async function exportPdf(){'),eEnd=src.indexOf('// Emergency save is deliberately independent',eStart);
 const emergencyStart=src.indexOf('async function saveAvailablePages(){');
 const emergencyEnd=src.indexOf("$('download-ready').onclick",emergencyStart);
 assert.ok(eStart>=0&&eEnd>eStart&&emergencyEnd>emergencyStart);
 const statusMessages=[];
 const exportPdf=new Function('busy','exporting','emergencyExporting','pending','entries','status',
  src.slice(eStart,eEnd)+';return exportPdf;')(
   false,false,false,[],[{manualPending:true}],m=>statusMessages.push(m));
 await exportPdf();
 const saveAvailablePages=new Function('exporting','emergencyExporting','entries','status',
  src.slice(emergencyStart,emergencyEnd)+';return saveAvailablePages;')(
  false,false,[{manualPending:true}],m=>statusMessages.push(m));
 await saveAvailablePages();
 assert.equal(statusMessages.length,2,'both PDF export routes must fail closed on unconfirmed crop');
 assert.ok(statusMessages.every(m=>m.includes('bordi')),'user gets actionable correction instruction');
 console.log('DocFix export safety PASS: provisional pairs blocked, verified pairs free, both export routes fail closed');
})();
