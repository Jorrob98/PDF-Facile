'use strict';
// DocFix stability regression guard: deterministic offline checks, no personal documents.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
require('./qa-over-paper.cjs');
require('./qa-licence-rear.cjs');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('app/index.html');
const physical=read('app/card-physical-edges.js');
const cards3=read('app/card-threeup.js');
const cards3Polish=read('app/card-threeup-polish.js');
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
 // Manual page order is binding. Late recognition must not reorder the operator's work.
 const chunk=between(index,'function regroupTwoFileFourCards(batchId){','function twoByTwoCandidateMeta(');
 const sample=[
  {id:'a',sourceIndex:10,loadBatch:4,twoUp:true,splitSlot:0,pairGroup:null},
  {id:'b',sourceIndex:20,loadBatch:4,twoUp:true,splitSlot:0,pairGroup:null},
  {id:'c',sourceIndex:10,loadBatch:4,twoUp:true,splitSlot:1,pairGroup:null},
  {id:'d',sourceIndex:20,loadBatch:4,twoUp:true,splitSlot:1,pairGroup:null}
 ];
 const paired=group=>group.slice().reverse();
 const apply=(ordered,slots)=>ordered.forEach((e,i)=>{sample[slots[i]]=e});
 const build=new Function('entries','manuallyOrdered','pairedFourCards','applyFourCardLabels',
  chunk+';return {regroupTwoFileFourCards,regroupLatestTwoUpSources};');
 const funcs=build(sample,true,paired,apply);
 assert.equal(funcs.regroupTwoFileFourCards(4),false,'late batch must respect manual page ordering');
 assert.equal(funcs.regroupLatestTwoUpSources(),false,'late 2-up auto pairing must respect manual page ordering');
 assert.equal(sample.map(x=>x.id).join(','),'a,b,c,d','manual order must not be mutated');
 assert.equal(funcs.regroupLatestTwoUpSources(true),true,'explicit reverse button may force a re-pair');
 assert.equal(sample.map(x=>x.id).join(','),'d,c,b,a','explicit operator reverse must still work');
 assert.ok(index.includes('regroupLatestTwoUpSources(true);'),'reverse-files must use explicit operator override');
}
{
 const editor=between(index,'function openCorrection(index){','function addFiles(files){');
 assert.ok(editor.includes('e.cropped=true;e.cropVerified=true;'),'manual four-corner crop must clear false crop warning');
 assert.ok(editor.includes('e.cropped=false;e.cropVerified=undefined;'),'use entire page must clear stale crop verdict');
 assert.ok(editor.includes("$('editor-image').removeAttribute('src')"),'closing the editor must release its preview data');
 assert.ok(editor.includes('editQuad=null;editSource=null;'),'closing the editor must release scratch image references');
}
{
 // Regression tests for repeated input, source restoration and clipboard status.
 const matcher=between(index,'function sameSelectedFile(a,b){','function addFiles(files){');
 const sameSelectedFile=new Function('function sameSelectedFile(a,b){'+matcher+'return sameSelectedFile;')();
 const uploaded={name:'WhatsApp-2026-11-09.jpg',type:'image/jpeg',size:45681,lastModified:1700000123456};
 const identical={...uploaded},different={...uploaded,lastModified:uploaded.lastModified+1};
 assert.equal(sameSelectedFile(uploaded,identical),true,'same WhatsApp file reselected must be recognized');
 assert.equal(sameSelectedFile(uploaded,different),false,'distinct photos sharing name and size must not be rejected');
 assert.equal(sameSelectedFile(uploaded,{...uploaded,name:'altro.jpg'}),false,'same size does not imply same image');
 assert.equal(sameSelectedFile({...uploaded,lastModified:0},{...uploaded,lastModified:0}),false,
  'unknown modification timestamps cannot establish an accidental duplicate');
 const upload=between(index,'function addFiles(files){','// Pure, testable ordering decision.');
 assert.ok(upload.includes('sourceFiles.some(s=>sameSelectedFile(s.file,f))'),
  'file validation must reject duplicate metadata before enqueuing');
 assert.ok(!index.includes("addFiles(files);status(files.length===1?"),
  'clipboard success text must not overwrite an addFiles rejection');
 assert.ok(index.includes('nextSourceId=1;nextLoadBatch=1;dragSource=-1;'),
  'a new practice must reset all loading and drag counters');
 const undo='function undoRemove(){'+between(index,'function undoRemove(){',"$('undo-remove').onclick=undoRemove;");
 const testUndo=(count,src=[],position=0)=>{
  const warnings=[],history=[],source={id:8,file:{size:512,name:'test.jpg'}},entry={id:'removed',sourceIndex:8};
  const context={busy:false,lastRemoved:{entry,index:position,source,sourcePosition:0},
   entries:Array.from({length:count},(_,i)=>({id:'p'+i})),sourceFiles:src.slice(),
   MAX_PAGES:40,MAX_FILES:12,MAX_TOTAL:100*1048576,
   note:s=>warnings.push(s),repaint:()=>history.push('repaint'),status:s=>history.push(s)};
  vm.runInNewContext(undo+'undoRemove();',context);
  return {...context,warnings,history};
 };
 const atLimit=testUndo(40);
 assert.equal(atLimit.sourceFiles.length,0,'40-page undo failure must not leave orphan source files');
 assert.equal(atLimit.entries.length,40,'40-page undo must not add a 41st page');
 assert.ok(atLimit.lastRemoved,'failed undo remains recoverable');
 const atFileLimit=testUndo(0,Array.from({length:12},(_,i)=>({id:i+30,file:{size:1}})));
 assert.equal(atFileLimit.sourceFiles.length,12,'12-file undo failure cannot add an orphan');
 assert.equal(atFileLimit.entries.length,0,'file-limit failure cannot restore page without its source');
 const restored=testUndo(1,[{id:1,file:{size:200}}],0);
 assert.equal(restored.entries[0].id,'removed','successful undo restores removed page at its index');
 assert.equal(restored.sourceFiles[0].id,8,'undo restores its source in original source order');
 assert.equal(restored.lastRemoved,null,'successful undo clears lastRemoved record');
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
 const tripleOrientation=between(index,'async function normalizeKnownCard(','// Never let an earlier 2-up success hide a third independently confirmed card.');
 assert.ok(index.includes("sourceVerified:c.materialVerified===true&&(c.kind!=='licence'||c.licenceGuard?.verified===true)"),
   'three-up unclassified cards cannot claim physically verified borders');
 assert.ok(index.includes('materialVerified:false,physicalReview:true'),
   'three-card material failure must preserve the page with an explicit review warning');
 assert.ok(tripleOrientation.includes("orientationKnown&&cardKind!=='identity'?"),
   'inconclusive MRZ on 3-up identity must fall back to text orientation, not layout');
 assert.ok(tripleOrientation.includes("(cardKind==='identity'||textLines(processed).vertical)"),
   'unknown identity orientation must be marked for review even when horizontal');
 assert.ok(tripleOrientation.includes("mrz.trustworthy?'Verso verificato dalla zona MRZ':osd.trustworthy?"),
   'actual MRZ/text proof must take precedence over camera layout in the UI');

}
{
 // A failed image readback must release both scratch and rotated analysis canvases.
 const original={width:350,height:600};
 const sample={width:600,height:300,getContext:()=>({getImageData:()=>{throw Error('synthetic readback failure')}})};
 let rotated=null;
 const win={DocFixScanner:{resize:()=>sample}};
 const document={createElement:()=>rotated={width:0,height:0,getContext:()=>({translate(){},rotate(){},drawImage(){}})}};
 vm.runInNewContext(cards3Polish,{window:win,document,Math,Float32Array});
 const detected={verified:true,orientation:'left',cards:[{},{},{}]};
 assert.throws(()=>win.DocFixThreeUpPolish.refine(original,detected),/synthetic readback failure/);
 assert.equal(sample.width,1,'three-up scratch canvas must be freed after readback failure');
 assert.equal(rotated.width,1,'rotated analysis canvas must be freed after readback failure');
 assert.equal(original.width,350,'failed analysis must not destroy the original photograph');
 win.DocFixScanner.resize=()=>{throw Error('synthetic resize failure')};
 assert.throws(()=>win.DocFixThreeUpPolish.refine(original,detected),/synthetic resize failure/);
 assert.equal(rotated.width,1,'rotated analysis canvas must be freed after resize failure');
}
(async()=>{
 const w={};
 vm.runInNewContext(pdfCode,{window:w,TextEncoder,Blob,Uint8Array,Math,Number});
 const exportAPI=w.DocFixGroup5;
 // Authentic 32×32 JPEG created specifically for offline regression testing.
 // The former fixture was 256 arbitrary bytes bracketed by JPEG SOI/EOI!
 const realJPEG=Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAgACADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AAAAAAAD/2Q==','base64'));
 const fakeJPEG=new Uint8Array(256);fakeJPEG[0]=255;fakeJPEG[1]=216;fakeJPEG[254]=255;fakeJPEG[255]=217;
 const source=cards.map(e=>({...e,processed:{width:32,height:32}}));
 assert.equal(exportAPI.jpegInfo(realJPEG)?.width,32,'real JPEG header is valid');
 assert.equal(exportAPI.jpegInfo(realJPEG)?.height,32,'real JPEG dimensions are correct');
 assert.equal(exportAPI.jpegInfo(fakeJPEG),null,'fake SOI/EOI-only JPEG must be rejected');
 const blob=await exportAPI.create(source,{encodeJPEG:async()=>realJPEG});
 const bytes=await blob.arrayBuffer(),head=new TextDecoder().decode(new Uint8Array(bytes).slice(0,900));
 assert.ok(head.includes('/Count 6'),'PDF must declare all 6 pages');
 assert.equal(exportAPI.validate(blob,6),blob);
 assert.equal(exportAPI.filename(source),'DocFix-1.9.22-6-tessere.pdf',
   'versioned PDF should not collide with previous Downloads');
 await assert.rejects(()=>exportAPI.create([{processed:{width:0,height:0}}],{encodeJPEG:async()=>realJPEG}),
   /non valida/,'invalid canvas must never produce a PDF');
 await assert.rejects(()=>exportAPI.create(source,{encodeJPEG:async()=>fakeJPEG}),
   /JPEG incompleto/,'a fake JPEG must never be embedded in an apparently valid PDF');
 await assert.rejects(()=>exportAPI.create([{processed:{width:40,height:32}}],{encodeJPEG:async()=>realJPEG}),
   /dimensioni non corrispondenti/,'JPEG dimensions must match PDF page dimensions');


 // Regression: reset during OCR busy wait must not access a removed entry.
 {
  const body=between(ocrCode,'async function drain(){','function decorate(entries){');
  const make=new Function('console',
    "let running=false,queue=[{entry:{id:1}}],queuedEntries=new Set(),busy=true,jobs=0,releases=0;"+
    "const host=()=>({isBusy:()=>busy,indexOf:()=>0});"+
    "const sleep=async()=>{queue.length=0;busy=false;};"+
    "const analyzeEntry=async()=>{jobs++};const scheduleWorkerRelease=()=>{releases++},repaint=()=>{};"+
    body+"return {run:drain,state:()=>({running,queue:queue.length,jobs,releases})};");
  const instance=make(console);
  await instance.run();
  assert.deepEqual(instance.state(),{running:false,queue:0,jobs:0,releases:1},
    'reset during OCR busy wait must not throw or process a missing page');
 }
 // If OCR fails for one card, the next card must still run.
 {
  const body=between(ocrCode,'async function drain(){','function decorate(entries){');
  const make=new Function('console',
    "let running=false,queue=[{entry:{id:1}},{entry:{id:2}}],queuedEntries=new Set(),done=[];"+
    "const host=()=>({isBusy:()=>false,indexOf:()=>0}),sleep=async()=>{};"+
    "const analyzeEntry=async(e)=>{if(e.id===1)throw Error('bad page');done.push(e.id)};"+
    "const scheduleWorkerRelease=()=>{},repaint=()=>{};"+
    body+"return {run:drain,done:()=>done};");
  const instance=make({error(){}});
  await instance.run();
  assert.deepEqual(instance.done(),[2],'one bad OCR page must not interrupt later pages');
 }
 // Image analysis must release resized canvases without ever touching source.
 {
  const helper=between(index,'function withResizedCanvas(','function whiteMarginCrop(');
  let temporary;
  const make=same=>new Function('window',helper+'return withResizedCanvas;')({
   DocFixScanner:{resize(src){temporary=same?src:{width:200,height:120};return temporary;}}
  });
  const original={width:800,height:500};
  assert.equal(make(false)(original,520,c=>c.width),200);
  assert.equal(temporary.width,1,'temporary preview canvas must be released');
  assert.equal(original.width,800,'source canvas modified during resize');
  assert.throws(()=>make(false)(original,520,()=>{throw Error('synthetic failure')}),/synthetic failure/);
  assert.equal(temporary.width,1,'temporary canvas not freed after error');
  make(true)(original,520,()=>null);
  assert.equal(original.width,800,'source returned from resize must remain untouched');
 }
 // MRZ checks rotate and sample multiple scratch canvases; all must be freed.
 {
  const module=read('app/group2-orientation.js'),created=[];
  function mockCanvas(){
   const c={width:1,height:1,getContext(){return {
    drawImage(){},translate(){},rotate(){},
    getImageData(){return {data:new Uint8ClampedArray(c.width*c.height*4)}}
   }}};
   created.push(c);return c;
  }
  const win={DocFixScanner:{resize(){const c=mockCanvas();c.width=480;c.height=300;return c;}}};
  vm.runInNewContext(module,{window:win,document:{createElement:mockCanvas},
    Float32Array,Uint8ClampedArray,Math});
  const original={width:1200,height:750};
  const result=win.DocFixGroup2.recognizeMRZOrientation(original);
  assert.equal(result.trustworthy,false,'blank scan cannot verify orientation');
  assert.ok(created.length>=5,'must exercise multiple MRZ candidate canvases');
  assert.ok(created.every(c=>c.width===1&&c.height===1),'MRZ scratch canvases not freed');
  assert.equal(original.width,1200,'MRZ detection modified source');
 }


 // Contour detection historically leaked scratch canvases on early returns.
 {
  const module=read('app/group1-safe-crop.js');
  const created=[];
  const scan={
   resize(){const c={width:50,height:50,getContext(){return {
    getImageData(){return {data:new Uint8ClampedArray(c.width*c.height*4)}}
   }}};created.push(c);return c;},
   validQuad:()=>true,area:()=>.2,
   detectDocument:()=>({status:'uncertain'}),
   defaultQuad:()=>[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}]
  };
  const win={DocFixScanner:scan};
  vm.runInNewContext(module,{window:win,Math,Uint8Array,Uint32Array,Int32Array,Float32Array});
  const original={width:500,height:300};
  const quad=[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}];
  assert.equal(win.DocFixGroup1.candidateFromBackground(original),null);
  win.DocFixGroup1.refineQuad(original,quad);
  win.DocFixGroup1.validateLegacy(original,{status:'found',quad});
  assert.equal(created.length,3,'test must exercise three different edge-analysis paths');
  assert.ok(created.every(c=>c.width===1&&c.height===1),
    'all physical-edge scratch canvases must be freed');
  assert.equal(original.width,500,'physical-edge analysis destroyed original input');
 }

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



 // An incomplete 2/4 or 5/6 set must NOT lock away already processed pages.
 // A second emergency save stays clickable even when the async crop is busy.
 {
  const portion=between(index,'function availablePages(){','function reset(){');
  const make=new Function('incomplete','busyAtStart',`
   let entries=[{sourceIndex:1,processed:{width:500,height:320}},
       {sourceIndex:2,processed:{width:500,height:320}}];
   let sourceFiles=[{id:1,file:{size:100}},{id:2,file:{size:100}}],pending=[],
       processing=false,exporting=false,emergencyExporting=false,
       busy=busyAtStart,sourceBytes=0,lastRemoved=null,lastPdfSize=null;
   const dl={disabled:true,textContent:''},ui={};
   const $=id=>(ui[id]??={hidden:false,disabled:false,textContent:''});
   const twoByTwoState=()=>({incomplete}),threeByTwoState=()=>({incomplete:false});
   const fmt=n=>String(n);
   ${portion}
   return {syncActions,dl,ui,setBusy:v=>{busy=v},
     setPending:n=>{pending=Array(n).fill({})},setEntries:e=>{entries=e}};
  `);
  const partial=make(true,false);partial.syncActions();
  assert.equal(partial.dl.disabled,false,'2/4 set cannot disable finished PDF');
  assert.match(partial.dl.textContent,/set incompleto/);
  assert.equal(partial.ui['download-ready'].hidden,false,'partial save must be visible');
  assert.equal(partial.ui['download-ready'].disabled,false);
  partial.setBusy(true);partial.setPending(1);partial.syncActions();
  assert.equal(partial.dl.disabled,true,'main exporter waits for active processing');
  assert.equal(partial.ui['download-ready'].disabled,false,
    'emergency save must bypass stuck processing and queued files');
  const complete=make(false,false);complete.syncActions();
  assert.equal(complete.dl.disabled,false);
  assert.equal(complete.ui['download-ready'].hidden,true,'no emergency UI on healthy set');
 }
 // The normal PDF action must export incomplete results (clearly labeled),
 // and must never claim a partial 2/4 set is complete.
 {
  const body=between(index,'async function exportPdf(){','// Emergency save is deliberately independent');
  const fn=new Function(`
    let busy=false,exporting=false,emergencyExporting=false,pending=[],
        entries=[{processed:{width:400,height:250},kind:'raster'},
                 {processed:{width:400,height:250},kind:'raster'}],
        manuallyOrdered=false;
    let message='',download=null;
    const dl={disabled:false};
    const $=id=>({hidden:false,value:'document'});
    const partialSet=()=>true,threeByTwoState=()=>({complete:false}),
       twoByTwoState=()=>({incomplete:true});
    const status=x=>{message=x},note=()=>{},progress=()=>{},repaint=()=>{},fmt=x=>String(x);
    const exportLayout=()=> 'document',exportRasterOffline=async()=>new Blob([new Uint8Array(1024)],{type:'application/pdf'});
    const downloadBlob=(blob,pages,partial)=>{download={pages:pages.length,partial,size:blob.size}};
    ${body}
    return {run:exportPdf,get:()=>({message,download})};
   `)();
  await fn.run();
  assert.equal(fn.get().download.pages,2,'incomplete group still produces 2-page PDF');
  assert.equal(fn.get().download.partial,true,'PDF must be labeled incomplete');
  assert.match(fn.get().message,/parziale/);
 }
 // A stuck extraction must not prevent saving an immutable snapshot of the
 // already finished pages; late batch changes must not alter the saved file.
 {
  const part=between(index,'async function saveAvailablePages(){',"$('download-ready').onclick=saveAvailablePages;");
  let finish,seen=null,stateText='',statusUpdates=0;
  const gate=new Promise(resolve=>{finish=resolve});
  const run=new Function('gate','seenSetter','setMessage',`
   let entries=[{processed:{width:400,height:250},source:'A.jpg'},
                {processed:{width:400,height:250},source:'B.jpg'}],
       exporting=false,emergencyExporting=false,busy=true,pending=[{}];
   const availablePages=()=>entries.filter(e=>e.processed?.width>0&&e.processed?.height>0);
   const status=x=>setMessage(x),note=()=>{},syncActions=()=>{};
   const exportRasterOffline=async pages=>{await gate;return new Blob([new Uint8Array(1500)],{type:'application/pdf'})};
   const downloadBlob=(blob,pages,partial)=>seenSetter({pages:pages.map(p=>p.source),partial,size:blob.size});
   ${part}
   return {run:saveAvailablePages,setLive:e=>{entries=e},busyState:()=>busy};
  `)(gate,x=>{seen=x},x=>{stateText=x;statusUpdates++});
  const started=run.run();
  run.setLive([{processed:{width:400,height:250},source:'C.jpg'}]);
  finish();await started;
  assert.deepEqual(seen.pages,['A.jpg','B.jpg'],'in-flight PDF must use original snapshot');
  assert.equal(seen.partial,true);
  assert.equal(run.busyState(),true,'emergency export must not alter OCR busy lock');
  assert.match(stateText,/PDF parziale salvato/);
 }

 // Export and new-practice operations must never race.
 {
  const resetCode=between(index,'function reset(){',"'reset').onclick=reset;");
  assert.ok(resetCode.includes("if(exporting||emergencyExporting){status("),
    'reset must be gated while PDF export is running');
  assert.ok(resetCode.includes("if(!$('editor').hidden)closeCorrection();"),
    'reset must close manual correction editor to prevent stale image access');
  assert.ok(index.includes("$('reset').disabled=exporting||emergencyExporting;"),
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


 // 1.9.22: recover a pale driving-licence border from the rose plastic,
 // not from the printed text. Use synthetic raster only, never a client ID.
 {
  const source=read('app/card-licence-guard.js'),w=1000,h=600;
  const rgba=new Uint8ClampedArray(w*h*4);
  function fill(red){
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const k=(y*w+x)*4;
    const rose=red&&x>=240&&x<=670&&y>=145&&y<=414;
    rgba[k]=rose?187:170;rgba[k+1]=rose?124:170;
    rgba[k+2]=rose?143:175;rgba[k+3]=255;
   }
  }
  const win={DocFixScanner:{
   resize:c=>c,
   validQuad:q=>Array.isArray(q)&&q.length===4
    &&q.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)
  }};
  const fakeDocument={createElement:()=>({
   width:1,height:1,getContext:()=>({
    translate(){},rotate(){},drawImage(){},getImageData:()=>({data:rgba})
   })
  })};
  vm.runInNewContext(source,{window:win,document:fakeDocument,Math,Uint8ClampedArray});
  const quad=[{x:.24,y:.245},{x:.633,y:.245},{x:.633,y:.692},{x:.24,y:.692}];
  fill(true);
  const found=win.DocFixLicenceGuard.pinkEnvelope(quad,rgba,w,h);
  assert.equal(found.verified,true,'pale rose physical plastic must be detected');
  assert.ok(found.quad[1].x>.668&&found.quad[2].x>.668,
   'right physical licence edge must be recovered, not cropped at x=.633');
  assert.ok(found.quad[2].y>.69,'bottom physical edge must be kept');
  const canvas={width:w,height:h,getContext:()=>({
   getImageData:()=>({data:rgba})
  })};
  const triple={verified:true,materialVerified:true,orientation:'none',cards:[
   {kind:'cf',quad},
   {kind:'licence',quad},
   {kind:'identity',quad}
  ]};
  const res=win.DocFixLicenceGuard.protect(canvas,triple);
  assert.equal(res.cards[0],triple.cards[0],
   'licence protection must leave CF detection unchanged');
  assert.equal(res.cards[2],triple.cards[2],
   'licence protection must leave identity detection unchanged');
  assert.equal(res.cards[1].licenceGuard.method,'pink-envelope');
  assert.ok(res.cards[1].quad[1].x>.668,
   'recovered licence geometry must reach the final crop');
  assert.equal(canvas.width,w,'original photo cannot be cleared');
  // Real WhatsApp three-up input is PORTRAIT: detection rotates 90 degrees
  // to inspect it, then returns quadrilaterals in original photo coordinates.
  const sourceQuad=quad.map(p=>({x:1-p.y,y:p.x}));
  const portraitTriple={...triple,orientation:'left',cards:[
   {kind:'cf',quad:sourceQuad},
   {kind:'licence',quad:sourceQuad},
   {kind:'identity',quad:sourceQuad}
  ]};
  const portraitOriginal={width:h,height:w};
  const portraitResult=win.DocFixLicenceGuard.protect(portraitOriginal,portraitTriple);
  const orientedResult=portraitResult.cards[1].quad.map(p=>({x:p.y,y:1-p.x}));
  assert.equal(portraitResult.cards[1].licenceGuard.method,'pink-envelope',
   'portrait three-up photographs must run the same physical-edge recovery');
  assert.ok(orientedResult[1].x>.668,
   'portrait coordinate transformation lost the recovered right edge');
  assert.equal(portraitOriginal.width,h,'portrait original may not be cleared');
  assert.equal(portraitResult.cards[0],portraitTriple.cards[0]);
  assert.equal(portraitResult.cards[2],portraitTriple.cards[2]);
  fill(false);
  const none=win.DocFixLicenceGuard.pinkEnvelope(quad,rgba,w,h);
  assert.equal(none.verified,false,
   'neutral paper may not masquerade as a driving licence');
  const resNone=win.DocFixLicenceGuard.protect(canvas,triple);
  assert.notEqual(resNone.cards[1].licenceGuard.method,'pink-envelope',
   'rose envelope must not be applied without colour proof');
 }


 // Regression from the real licence screenshot: 'three cards detected' cannot
 // be confused with 'four physical licence edges verified'.
 {
  const normalize=between(index,'async function normalizeKnownCard(','// Never let an earlier 2-up success');
  const three=between(index,"if(decision.mode==='three'){",'const multi=verified?sourceCards:');
  assert.ok(three.includes("sourceVerified:c.materialVerified===true&&(c.kind!=='licence'||c.licenceGuard?.verified===true)"),
   'unverified licence may not enter sourceVerified perspective branch');
  assert.ok(normalize.includes("else if(multiSafe&&cardKind==='licence')"),
   'unverified licence must use independent conservative fallback');
  assert.ok(normalize.includes("quad=expandQuadSafe(sourceQuad,.105)"),
   'unverified licence must keep a substantial safety margin');
  assert.ok(three.includes("fixed.cropVerified=false"),
   'unverified physical licence border must not display a crop success badge');
  assert.ok(three.includes("c.licenceGuard?.verified!==true"),
   'missing guard or failed guard must be treated as unverified');
  const raw=between(index,'function expandQuadSafe(','function safeRefineMultiQuad(');
  const expand=new Function(raw+'return expandQuadSafe;')();
  const q=[{x:.25,y:.30},{x:.55,y:.30},{x:.55,y:.50},{x:.25,y:.50}];
  const out=expand(q,.105);
  assert.ok(out[0].x<q[0].x&&out[0].y<q[0].y&&
   out[2].x>q[2].x&&out[2].y>q[2].y,'safety ROI must expand in all directions');
  assert.ok(q[0].x===.25&&q[0].y===.30,'fallback must not mutate original quad');
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
