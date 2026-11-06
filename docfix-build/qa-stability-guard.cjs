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
const cards2=read('app/card-texture-crop.js');
const pdfCode=read('app/group5-export.js');
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
 assert.equal(exportAPI.filename(source),'DocFix-1.9.12-6-tessere.pdf',
   'versioned PDF should not collide with previous Downloads');
 await assert.rejects(()=>exportAPI.create([{processed:{width:0,height:0}}],{encodeJPEG:async()=>fakeJPEG}),
   /non valida/,'invalid canvas must never produce a PDF');
 console.log('DocFix stability guard PASS: canvas ownership, manual sort, 2x2/3x2 order, output integrity, failed checks');
})().catch(e=>{console.error('DocFix stability guard FAILED:',e);process.exitCode=1});
