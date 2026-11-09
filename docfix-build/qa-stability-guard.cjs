'use strict';
// DocFix stability regression guard: deterministic offline checks, no personal documents.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('app/index.html');
const physical=read('app/card-physical-edges.js');
const cards3=read('app/card-threeup.js');
const licenceGuardCode=read('app/card-licence-guard.js');
const cards2=read('app/card-texture-crop.js');
const pdfCode=read('app/group5-export.js');
const ocrCode=read('app/ocr-max.js');
const desktopMain=read('main.js');
const preload=read('preload.js');
const updateUI=read('app/stability.js');
const between=(text,start,end)=>{
 const a=text.indexOf(start);const b=text.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing regression anchor '+start);
 return text.slice(a,b);
};
function fixture(id,sourceIndex,docType,photoSide,cfDarkness,splitCount=3){
 return {id,sourceIndex,docType,photoSide,cfDarkness,materialVerified:true,threeUp:splitCount===3,splitCount,
  source:'synthetic-'+sourceIndex+'.jpg',title:'Synthetic '+id};
}
const cards=[
 fixture(1,11,'identity','retro',.66),fixture(2,11,'licence','retro',.66),fixture(3,11,'cf','retro',.66),
 fixture(4,22,'cf','fronte',.42),fixture(5,22,'licence','fronte',.42),fixture(6,22,'identity','fronte',.42)
];
const orderPart=between(index,'function planSixCardOrder(group){','function pairedFourCards(group){');
const orderFunctions=new Function('entries','manuallyOrdered',orderPart+';return {planSixCardOrder,regroupSixCards};');
const ids=x=>x.map(e=>e.id).join(',');
{
 const entries=cards.slice();
 const {planSixCardOrder,regroupSixCards}=orderFunctions(entries,false);
 assert.equal(ids(planSixCardOrder(entries).ordered),'4,3,5,2,6,1','correct 6-page order');
 assert.equal(regroupSixCards(),true,'automatic reordering happens when permitted');
 assert.equal(ids(entries),'4,3,5,2,6,1','entry list matches PDF order');
 assert.equal(regroupSixCards(),false,'idempotent reordering');
}
{
 const entries=cards.slice();
 const {regroupSixCards}=orderFunctions(entries,true);
 assert.equal(regroupSixCards(),false,'manual order must never be overwritten');
 assert.equal(ids(entries),'1,2,3,4,5,6','manual sequence preserved');
}
{
 const {planSixCardOrder}=orderFunctions(cards.slice(),false);
 const dark=cards.map(e=>({...e,photoSide:'fronte'}));
 assert.equal(ids(planSixCardOrder(dark).ordered),'4,3,5,2,6,1','CF band fallback');
 assert.equal(planSixCardOrder(cards.map(e=>({...e,photoSide:e.photoSide==='fronte'?'retro':'fronte'}))).ok,false,
   'conflicting front/back indicators must not be silently accepted');
 assert.equal(planSixCardOrder(cards.map(e=>({...e,cfDarkness:.51,photoSide:'indefinito'}))).ok,false,
   'unverifiable orientation must be disclosed');
}
{
 const fourPart=between(index,'function pairedFourCards(group){','function twoByTwoCandidateMeta(');
 const four=new Function('entries',fourPart+';return pairedFourCards;')([]);
 const input=[
 {id:'CF_front',sourceIndex:10,twoUp:true,splitCount:2,splitSlot:0},
 {id:'CI_front',sourceIndex:10,twoUp:true,splitCount:2,splitSlot:1},
 {id:'CF_back',sourceIndex:20,twoUp:true,splitCount:2,splitSlot:0},
 {id:'CI_back',sourceIndex:20,twoUp:true,splitCount:2,splitSlot:1}
 ];
 assert.equal(four(input).map(x=>x.id).join(','),'CF_front,CF_back,CI_front,CI_back',
   '2-up workflow must remain unchanged');
}
{
 // Never clear a resized reference if resize() returned the original.
 const deskew=between(index,'function estimateFineDeskew(','function rotateFineCanvas(');
 assert.equal(deskew.split('s.width=s.height=1').length-1,3);
 assert.equal(deskew.split('if(s!==source)s.width=s.height=1').length-1,3,
   'every deskew cleanup must protect the input');
 const quality=between(index,'function multiCropHealthy(','async function normalizeKnownCard(');
 assert.ok(quality.includes('if(s!==canvas)s.width=s.height=1'),'quality guard must protect input');
 assert.ok(quality.includes('}catch{return false}'),'analysis failures cannot be healthy');
 assert.ok(physical.includes('if(s!==source)s.width=s.height=1'),'physical edge cleanup must protect input');
 assert.ok(cards3.includes('if(sample!==original&&sample!==oriented)'),'three-card detector must protect original');
 assert.ok(cards2.includes('if(sample!==original)'),'two-card detector must protect original');
}
{
 assert.ok(index.includes('if(manuallyOrdered)return false'),'manual order must block auto-sorting');
 assert.ok(index.includes('if(threeByTwoState().complete&&!manuallyOrdered)'),
   'export must preserve operator order');
 assert.ok(index.includes('manuallyOrdered=false;'),'new practice must reset manual mode');
 assert.ok(!index.includes('orientationKnown?{angle:0,trustworthy:true}'),
   'photo layout must never claim verified text orientation');
 assert.ok(index.includes("cardKind:c.kind||'generic'"),
   'three-up identity card must use the MRZ orientation verifier');

}
(async()=>{
 const w={};
 vm.runInNewContext(pdfCode,{window:w,TextEncoder,Blob,Uint8Array,Math,Number});
 const exportAPI=w.DocFixGroup5;
 const fakeJPEG=new Uint8Array(256);fakeJPEG[0]=255;fakeJPEG[1]=216;fakeJPEG[254]=255;fakeJPEG[255]=217;
 const source=cards.map(e=>({...e,processed:{width:520,height:320}}));
 const blob=await exportAPI.create(source,{encodeJPEG:async()=>fakeJPEG});
 const bytes=await blob.arrayBuffer(),head=new TextDecoder().decode(new Uint8Array(bytes).slice(0,900));
 assert.ok(head.includes('/Count 6'),'PDF must declare all 6 pages');
 assert.equal(exportAPI.validate(blob,6),blob);
 assert.equal(exportAPI.filename(source),'DocFix-1.9.14-6-tessere.pdf',
   'versioned PDF should not collide with previous Downloads');
 await assert.rejects(()=>exportAPI.create([{processed:{width:0,height:0}}],{encodeJPEG:async()=>fakeJPEG}),
   /non valida/,'invalid canvas must never produce a PDF');

 // One JPEG thumbnail per unchanged processed canvas; no double compression.
 {
  const thumbCode=between(index,'const thumbsCache=new WeakMap();','function repaint(){');
  let calls=0;
  const original={width:500,height:300,toDataURL(){calls++;return 'data:image/jpeg;base64,static';}};
  const make=new Function('window',thumbCode+'return thumb;');
  const thumb=make({DocFixScanner:{resize:c=>c}});
  assert.equal(thumb(original),thumb(original),'same image cached');
  assert.equal(calls,1,'unchanged pages must not be re-encoded on each repaint');
  const changed={width:500,height:300,toDataURL(){calls++;return 'data:image/jpeg;base64,changed';}};
  assert.equal(thumb(changed),'data:image/jpeg;base64,changed');
  assert.equal(calls,2,'changed pages must produce fresh JPEG');
  let small;
  const thumbOther=make({DocFixScanner:{resize:c=>{
    small={width:180,height:100,toDataURL(){return 'data:image/jpeg;base64,small';}};
    return small;
  }}});
  const before={width:900,height:600};
  thumbOther(before);
  assert.equal(small.width,1,'temporary thumbnail resize must be freed');
  assert.equal(before.width,900,'thumbnail conversion must not destroy source');
 }


 // Export and new-practice operations must never race.
 {
  const resetCode=between(index,'function reset(){',"'reset').onclick=reset;");
  assert.ok(resetCode.includes("if(exporting){status("),
    'reset must be gated while PDF export is running');
  assert.ok(resetCode.includes("if(!$('editor').hidden)closeCorrection();"),
    'reset must close manual correction editor to prevent stale image access');
  assert.ok(index.includes("$('reset').disabled=exporting;"),
    'reset UI must reflect active export lock');
 }
 // Real regression: a licence quad excludes a pale 37px right-hand strip.
 // The physical guard must recover the full outer edge before perspective crop.
 {
  const window={DocFixScanner:{
   resize:c=>c,
   validQuad:q=>Array.isArray(q)&&q.length===4
     &&q.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)
  }};
  vm.runInNewContext(licenceGuardCode,{window,Math,Uint8Array,Float32Array});
  const api=window.DocFixLicenceGuard,w=1000,h=600;
  const d=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const k=(y*w+x)*4,pink=x>=240&&x<=670&&y>=145&&y<=414;
   d[k]=pink?187:170;d[k+1]=pink?124:170;
   d[k+2]=pink?143:175;d[k+3]=255;
  }
  const base=[{x:.240,y:.245},{x:.633,y:.245},
   {x:.633,y:.692},{x:.240,y:.692}];
  const fixed=api.polishQuad(base,d,w,h);
  assert.ok(fixed.verified,'licence border must be physically verified');
  assert.ok(fixed.quad[1].x>.665&&fixed.quad[2].x>.665,
    'right hand plastic edge must be recovered before crop');
  assert.ok(fixed.quad[0].x<base[0].x&&fixed.quad[3].x<base[3].x,
    'recovered licence must preserve left edge');
  const canvas={width:w,height:h,
   getContext:()=>({getImageData:()=>({data:d})})};
  const detected={verified:true,materialVerified:true,orientation:'none',cards:[
   {kind:'cf',quad:base},
   {kind:'licence',quad:base},
   {kind:'identity',quad:base}
  ]};
  const after=api.protect(canvas,detected);
  assert.equal(after.cards[0],detected.cards[0],
    'CF geometry must remain completely unchanged');
  assert.equal(after.cards[2],detected.cards[2],
    'identity geometry must remain completely unchanged');
  assert.ok(after.cards[1].quad[1].x>.665,
    'licence guard must be integrated in final card geometry');
  assert.equal(canvas.width,w,'original image must not be cleared');
  assert.equal(canvas.height,h,'original image must retain its height');
  const unknown={...detected,materialVerified:false};
  assert.equal(api.protect(canvas,unknown),unknown,
    'unsupported document must never be altered by licence guard');
 }

 // The verified two-card engine must not hide a third independent document.
 {
  const geometry=between(index,'function quadBounds(q){','function crossOverlap(');
  const choice=between(index,'function chooseMultiCardMode(sourceCards,triple){','async function makeImageEntries(');
  const pick=new Function('window',geometry+choice+'return chooseMultiCardMode;')(
    {DocFixScanner:{validQuad:q=>q?.length===4}});
  const box=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
  const two=[
    {quad:box(.12,.12,.3,.2),confidence:.96},
    {quad:box(.12,.7,.3,.2),confidence:.94}
  ];
  const three={verified:true,materialVerified:true,cards:[
    {...two[0],kind:'cf'},
    {quad:box(.12,.41,.3,.20),confidence:.91,kind:'licence'},
    {...two[1],kind:'identity'}
  ]};
  assert.equal(pick(two,null).mode,'two','2-card case stays 2-up');
  assert.equal(pick(two,three).mode,'three','3rd independent card must not be lost');
  assert.equal(pick([],three).mode,'three','3-up works without 2-up evidence');
  const uncertain={...three,materialVerified:false};
  assert.equal(pick(two,uncertain).mode,'two','unverified third must not change tested 2-up');
  assert.equal(pick(two,uncertain).conflict,true,'ambiguous third must be reported');
  const falseExtra={...three,cards:three.cards.map(x=>({...x}))};
  falseExtra.cards[1]={quad:box(.14,.14,.27,.18),confidence:.95,kind:'licence'};
  assert.equal(pick(two,falseExtra).mode,'two','overlapping false third must be rejected');
 }

 // Simulate OCR worker startup failure: no temporary canvas may leak.
 {
  const localCode=between(ocrCode,'async function localMultiPass(source){','async function canvasBase64(');
  const temp=[{width:1400,height:850},{width:1400,height:850},{width:1400,height:850}];
  let releases=0;
  const local=new Function('variants','worker','releaseWorkerNow',localCode+';return localMultiPass;')(
    ()=>({natural:temp[0],contrast:temp[1],bw:temp[2]}),
    async()=>{throw Error('synthetic worker startup failure')},()=>{releases++;});
  await assert.rejects(()=>local({}),/synthetic worker startup failure/);
  assert.ok(temp.every(x=>x.width===1&&x.height===1),'OCR canvas leak on worker failure');
  assert.equal(releases,1,'failed worker must be reset');
 }
 // Conversion for OCR cloud: temporary downscale freed, input untouched.
 {
  const base64Code=between(ocrCode,'async function canvasBase64(canvas,quality=.94){','function providerLabel(');
  let copy;
  const convert=new Function('makeCanvas','btoa',base64Code+';return canvasBase64;')(
    (src,w,h)=>{
      copy={width:Math.round(w),height:Math.round(h),toBlob(cb){cb(new Blob([new Uint8Array(180)]));}};
      return copy;
    },text=>Buffer.from(text,'binary').toString('base64'));
  const original={width:3400,height:2200};
  assert.ok((await convert(original,.93)).length>0);
  assert.equal(original.width,3400,'original OCR image changed');
  assert.equal(copy.width,1,'scaled OCR image leaked');
 }
 // Simulate a user editing a document before slow OCR finishes.
 {
  const asyncCode=between(ocrCode,'async function analyzeEntry(entry,force=false){','function enqueue(entry,force=false){');
  let resume;
  const pendingOCR=new Promise(resolve=>{resume=resolve});
  const entry={processed:{width:880,height:520},ocrRevision:0};
  const analyze=new Function('host','repaint','localMultiPass','cloudStatus',
    'getCloudStatus','signals','clamp','console',asyncCode+';return analyzeEntry;')(
    ()=>({indexOf:()=>0}),()=>{},()=>pendingOCR,
    {google:{configured:false},azure:{configured:false}},async()=>({}),()=>({}),
    (x,low,high)=>Math.max(low,Math.min(high,x)),console);
  const running=analyze(entry,false);
  entry.ocrRevision=1;
  resume({best:{text:'OLD',score:.91,confidence:91},results:[],
    variants:{natural:{width:900,height:550}}});
  await running;
  assert.equal(entry.ocrResult,undefined,'outdated OCR saved over edited document');
  assert.equal(entry.ocrState,'queued','fresh OCR request was skipped');
 }
 // Cleanup must remain active even when recovery fails.
 {
  const flow=between(index,'async function drainPending(){','async function jpegBytes(');
  assert.ok(flow.includes("try{await recoverIncompleteTwoByTwo();}"),
    'recovery exception must be caught before resetting busy state');
  assert.ok(flow.includes('processing=false;busy=false;'),
    'busy flag must clear on error');
 }

 // Update installer launch is not installation success: verify version on next startup.
 {
  const receiptSource=between(desktopMain,'function updateReceiptPath(){','function versionParts(v){');
  const disk=new Map();
  const fakeFs={existsSync:p=>disk.has(p),mkdirSync(){},
    writeFileSync:(p,s)=>disk.set(p,String(s)),
    readFileSync:p=>disk.get(p),unlinkSync:p=>disk.delete(p)};
  const latest=JSON.parse(read('package.json')).version;
  const parts=latest.split('.').map(Number);
  assert.ok(parts[2]>0,'update regression requires a patch version newer than zero');
  const previous=parts.slice(0,2).concat(parts[2]-1).join('.');
  let version=previous;
  const app={getPath:()=>'/tmp/docfix-test',getVersion:()=>version};
  const api=new Function('fs','path','app','log','isNewerVersion','SELF_TEST',
    receiptSource+'return {writeUpdateReceipt,inspectUpdateReceipt,updateReceiptPath};')(
    fakeFs,path,app,()=>{},
    (target,current)=>target.split('.').map(Number).join(',')>current.split('.').map(Number).join(','),false);
  api.writeUpdateReceipt(latest);
  assert.equal(api.inspectUpdateReceipt().status,'pending','new update remains pending');
  version=latest;
  assert.equal(api.inspectUpdateReceipt().status,'confirmed','installed version must be confirmed');
  assert.equal(disk.size,0,'confirmed receipt removed');
  version=previous;
  api.writeUpdateReceipt(latest);
  disk.set(api.updateReceiptPath(),JSON.stringify({target:latest,created:Date.now()-150000}));
  assert.equal(api.inspectUpdateReceipt().status,'unconfirmed','failed silent install detected');
  assert.equal(disk.size,0,'failed receipt cleared to avoid repeated alerts');
  assert.ok(preload.includes('docfix:update:last-result'),'update receipt exposed to UI');
  assert.ok(updateUI.includes("r?.status==='unconfirmed'"),'UI warns about uninstalled update');
  assert.ok(!updateUI.includes("percent:100,message:'Aggiornamento applicato'"),
    'UI must not report 100% before actual installation');
 }
 console.log('DocFix stability guard PASS: canvas ownership, manual sort, 2x2/3x2 order, output integrity, failed checks');
})().catch(e=>{console.error('DocFix stability guard FAILED:',e);process.exitCode=1});
