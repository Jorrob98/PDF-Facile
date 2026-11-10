'use strict';
// Offline QA uses artificial coloured rectangles only; no customer images.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'app/card-sideways-pair.js'),'utf8');
const win={DocFixQuadAudit:{inspectRGBA:()=>({verified:false,reason:'unconfirmed external edge'})}};
vm.runInNewContext(code,{window:win,Math,Uint8Array,Float32Array,Number,Array,console});
const detect=win.DocFixSidewaysPair.analyzeRGBA,w=360,h=410;
function scene({pair=true,single=false,paper=false,touch=false}={}){
 const d=new Uint8ClampedArray(w*h*4);
 const c1={x0:32,x1:164,y0:102,y1:321};
 const c2={x0:touch?165:178,x1:touch?300:311,y0:99,y1:317};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const left=x>=c1.x0&&x<=c1.x1&&y>=c1.y0&&y<=c1.y1;
  const right=pair&&!single&&x>=c2.x0&&x<=c2.x1&&y>=c2.y0&&y<=c2.y1;
  const bg=paper?[220,220,220]:[38+Math.round(x/w*12),36+Math.round(x/w*13),35+Math.round(x/w*13)];
  let rgb=left?[206,219,199]:right?[61,148,216]:bg;
  // A dark stripe inside the blue health card must not become an external edge.
  if(right&&x>c2.x1-30&&x<c2.x1-3)rgb=[30,52,65];
  const k=(y*w+x)*4;d[k]=rgb[0];d[k+1]=rgb[1];d[k+2]=rgb[2];d[k+3]=255;
 }
 return d;
}
for(const opts of [{},{touch:true}]){
 const data=scene(opts),copy=data.slice(),r=detect(data,w,h);
 assert.equal(r?.verifiedSplit,true,'two vertical cards next to each other are detected');
 assert.equal(r.cards.length,2);
 assert.ok(r.cards[0].quad[1].x<r.cards[1].quad[1].x,'stable left-to-right ordering');
 assert.ok(r.cards.every(c=>{
  const q=c.quad;return (q[3].y-q[0].y)*h>(q[1].x-q[0].x)*w*1.2;
 }), 'each card remains a complete vertical shape before rotation');
 assert.ok(r.cards.every(c=>c.physicallyVerified===false),
  'not enough physical evidence must remain flagged for operator review');
 assert.deepEqual(data,copy,'the uploaded pixels must never be mutated');
}
assert.equal(detect(scene({single:true}),w,h),null,'one card cannot be invented as two');
assert.equal(detect(scene({paper:true}),w,h),null,'paper backgrounds do not trigger dark-mat recovery');
assert.equal(detect(new Uint8ClampedArray(80*80*4),80,80),null,'tiny images are rejected safely');
const index=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
assert.ok(index.includes('card-sideways-pair.js'),'new detection module must load');
assert.ok(index.includes('window.DocFixSidewaysPair?.detect?.(original)'),'fallback uses the untouched source');
assert.ok(index.includes('forceLandscapeLeft:isSideways'),'rotation only affects recovered sideways cards');
assert.ok(index.includes('processed=rotate(processed,270);rotation=270'),'separated vertical cards become landscape');
assert.ok(index.includes("cropMode()==='smart'"),'legacy mode preserves old behavior');
assert.ok(index.includes("splitCount:2,twoUp:true"),'two-source upload produces four separate previews');
console.log('DocFix sideways pair PASS: split, touching cards, safety warnings, no fake pairs, rotation, rollback');
// Integration: TWO separate WhatsApp files must produce FOUR real page entries,
// and legacy mode must still use the previous single-photo fallback.
(async()=>{
 const start=index.indexOf('async function makeImageEntries('),end=index.indexOf('window.DocFixDesktopDiagnostics=',start);
 assert.ok(start>=0&&end>start,'two-card import function is reachable');
 const code=index.slice(start,end);
 const fixture=detect(scene(),w,h);
 const document={width:900,height:1025},calls=[];
 let mode='smart';
 const host={
  DocFixRealCrop:{detect:()=>({cards:[]})},
  DocFixThreeUp:{detect:()=>null},
  DocFixSidewaysPair:{detect:()=>fixture}
 };
 const factory=new Function('window','imageCanvas','chooseMultiCardMode','multiCardCandidates',
  'normalizeKnownCard','normalizeRaster','multiCropHealthy','cropMode','console',
  code+';return makeImageEntries;');
 const load=factory(host,async()=>document,()=>({mode:'fallback',conflict:false}),
  ()=>[],async(src,q,label,confidence,options)=>{
   calls.push(options);return {processed:{width:800,height:510},how:'',review:true,
    cropVerified:false,geometryReview:true,confidence};
  },
  async()=>({processed:document,how:'foto conservata',review:true}),()=>true,()=>mode,console);
 // A colour-only hypothesis must never invent a second page from one card.
 const uncertain=await load({name:'unverified-side-by-side.jpg'},11,1,{batchId:7,batchSize:1});
 assert.equal(uncertain.length,1,'unverified pair must not create false extra documents');
 assert.ok(uncertain[0].how.includes('possibili due tessere'),'operator receives a manual split warning');
 const verified={...fixture,physicallyVerified:true,cards:fixture.cards.map(c=>({...c,physicallyVerified:true}))};
 host.DocFixSidewaysPair.detect=()=>verified;
 const a=await load({name:'whatsapp-retro.jpg'},12,2,{batchId:8,batchSize:2});
 const b=await load({name:'whatsapp-fronte.jpg'},13,2,{batchId:8,batchSize:2});
 assert.equal(a.length+b.length,4,'two WhatsApp double-card images must result in FOUR previews');
 assert.deepEqual([...a,...b].map(x=>x.splitSlot),[0,1,0,1],'two independent pages are retained from each source');
 assert.ok(calls.every(x=>x.forceLandscapeLeft===true),'each extracted sideways card is rotated before OCR');
 assert.ok(calls.every(x=>x.sourceVerified===true),'only verified four-edge splits may be accepted automatically');
 mode='legacy';const fallback=await load({name:'legacy.jpg'},14,1,{batchId:9,batchSize:1});
 assert.equal(fallback.length,1,'rollback must bypass the new sideways detector');
 console.log('DocFix 2x2 WhatsApp integration PASS: four pages, original order, rotation, safe review, rollback');
})().catch(err=>{console.error(err);process.exitCode=1});

