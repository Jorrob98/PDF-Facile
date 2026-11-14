'use strict';
// End-to-end import decision: two photographed IDs must be two cropped
// previews, not two full photographs. No customer images or OCR data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const a=source.indexOf('function decideTwoUpProof('),b=source.indexOf('window.DocFixDesktopDiagnostics=',a);
assert.ok(a>0&&b>a);
const quad=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const pair=[
 {quad:quad(.18,.20,.82,.42),confidence:.68,physicallyVerified:false},
 {quad:quad(.18,.48,.82,.70),confidence:.68,physicallyVerified:false}
];
const original={width:1200,height:2100,tag:'photographed originals'};
const scan={validQuad:q=>Array.isArray(q)&&q.length===4,area:q=>Math.abs((q[1].x-q[0].x)*(q[3].y-q[0].y))};
const host={
 DocFixScanner:scan,
 DocFixRealCrop:{detect:()=>({cards:[]})},
 DocFixThreeUp:{detect:()=>null},
 DocFixSidewaysPair:{detect:()=>null},
 DocFixIndependentProjection:{detect:()=>null},
 DocFixPhotoPair:{detect:()=>({cards:pair,verified:false,provisional:true})},
 DocFixPairProof:{geometry:()=>({ok:true}),verify:()=>({verified:false,reason:'four corners need inspection'})}
};
const calls=[];
const make=new Function('window','imageCanvas','chooseMultiCardMode',
 'multiCardCandidates','normalizeKnownCard','normalizeRaster','multiCropHealthy',
 'cropMode','preserveFullA4Page','documentMode','console',
 source.slice(a,b)+';return makeImageEntries;')(
 host,async()=>original,()=>({mode:'fallback',conflict:false}),
 ()=>[],
 async(src,q,label,confidence,options)=>{
  calls.push({src,q,options});
  const width=Math.round((q[1].x-q[0].x)*src.width),
   height=Math.round((q[3].y-q[0].y)*src.height);
  return {processed:{width,height},sourceQuad:q,review:true,
   manualPending:!!options.conservativeSegment,cropVerified:false,cropped:false,
   geometryReview:true,orientationReview:false,how:'anteprima da confermare'};
 },
 async()=>({processed:original,how:'full source'}),()=>true,()=>'smart',
 ()=>null,()=>'auto',{warn(){},log(){}}
);
(async()=>{
 const result=await make({name:'two-cards.jpg'},17,1,{batchId:3,batchSize:2});
 assert.equal(result.length,2,'one photograph must create two separate previews');
 assert.deepEqual(result.map(e=>e.splitSlot),[0,1]);
 assert.ok(result.every(e=>e.processed.width<original.width*.8&&
  e.processed.height<original.height*.4),'preview must be cropped, NOT full photograph');
 assert.ok(result.every(e=>e.original===original),'original remains recoverable');
 assert.ok(result.every(e=>e.manualPending===true&&e.cropVerified===false),
  'provisional crop cannot silently become ready for PDF');
 assert.ok(calls.every(c=>c.src===original&&c.options.conservativeSegment===true),
  'source-frame perspective correction receives individual rectangles');
 console.log('DocFix real import PASS: photographed pair yields two cropped editable previews and safe PDF lock');
})().catch(e=>{console.error(e);process.exitCode=1});
