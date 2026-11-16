'use strict';
// Entirely synthetic regression: no real client documents are committed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const mod=fs.readFileSync(path.join(__dirname,'app/docfix-visual-card.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const W=420,H=314;
function scene({card=true,retro=false,face=true}={}){
 const data=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const k=(y*W+x)*4;let rgb=[202,198,192];
  if(y>=60&&y<70)rgb=[72,70,70];
  if(y>=70&&y<82)rgb=[151,150,147];
  if(card&&x>=50&&x<365&&y>=84&&y<281){
   rgb=retro?[183,210,207]:[184,214,227];
   if((x*17+y*11)%23<3)rgb=retro?[174,198,197]:[174,205,216];
   if(y>112&&y<260&&x>85&&x<350&&((y-112)%14<11)&&((x*17+y*7)%13<7))rgb=[70,78,87];
   if(face&&!retro&&x>=68&&x<132&&y>115&&y<236)
    rgb=[90+(x*13+y*7)%57,110+(x*11+y*9)%54,124+(x*7+y*17)%48];
  }
  data[k]=rgb[0];data[k+1]=rgb[1];data[k+2]=rgb[2];data[k+3]=255;
 }
 return {width:W,height:H,data,getContext:()=>({getImageData:()=>({data})})};
}
const source=scene(),sourcePixels=source.data.slice();
const win={DocFixScanner:{
 resize:c=>c,validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>0&&p.x<1&&p.y>0&&p.y<1),
 process:(c,opts)=>{win.__last=c;win.__quad=opts.quad;return {width:875,height:545};},
 detectDocument:()=>({status:'uncertain'}),defaultQuad:()=>[{x:.01,y:.01},{x:.99,y:.01},{x:.99,y:.99},{x:.01,y:.99}]
}};
vm.runInNewContext(mod,{window:win,console,Math,Float32Array,Uint8ClampedArray});
const vis=win.DocFixVisualCard.analyzeRGBA(source.data,W,H);
assert.ok(vis&&vis.status==='found','typical office photo with CIE front must have candidate');
assert.ok(vis.quad[0].x<.22&&vis.quad[2].x>.77,'left portrait and right edge both included');
assert.ok(vis.quad[0].y<.36&&vis.quad[2].y>.80,'top and bottom material included');
assert.equal(vis.physicallyVerified,false);
assert.ok(win.DocFixVisualCard.analyzeRGBA(scene({card:true,retro:true}).data,W,H),'CIE MRZ reverse must be detected');
assert.equal(win.DocFixVisualCard.analyzeRGBA(scene({card:false}).data,W,H),null,'desk stripes alone are not an ID');
assert.equal(win.DocFixVisualCard.analyzeRGBA(scene({card:true,face:false}).data,W,H),null,'risk of cropping face panel: refuse partial');
const open=html.indexOf('function photoNormalize(original){'),close=html.indexOf('// The same normalization path is used by photos and scanned PDF pages.',open);
assert.ok(open>=0&&close>open);
let smart=true;
win.DocFixOverPaper={detect:()=>null};
win.DocFixLicenceRear={detect:()=>null};
win.DocFixOnePass={detect:()=>null};
const photoNormalize=new Function('window','cropMode','singleCropGate','quadCardRatio','trimCardBackground','expandQuadSafe','console',
 html.slice(open,close)+';return photoNormalize;')
 (win,()=>smart?'smart':'legacy',()=>({ok:false}),()=>1.586,c=>c,q=>q,console);
const fixed=photoNormalize(source);
assert.notEqual(fixed.processed,source,'visual candidate makes useful preview instead of full photo');
assert.equal(fixed.previewOnly,true);
assert.ok(Array.isArray(fixed.sourceQuad)&&fixed.sourceQuad.length===4);
assert.deepEqual(win.__quad.map(p=>[p.x,p.y]),vis.quad.map(p=>[p.x,p.y]));
assert.deepEqual(source.data,sourcePixels,'untouched original pixels');
assert.ok(fixed.how.includes('conferma i 4 angoli'));
smart=false;const old=photoNormalize(source);
assert.equal(old.processed,source,'compatibility engine unchanged');
assert.equal(old.previewOnly,false);
const n1=html.indexOf('async function normalizeRaster(original,');
const n2=html.indexOf('function quadBounds(',n1);
const normalizeRaster=new Function('photoNormalize','preserveFullA4Page','qualityAudit',html.slice(n1,n2)+';return normalizeRaster;')
 (photoNormalize,()=>null,()=>({review:false,issues:[],metrics:{}}));
smart=true;
(async()=>{
 const result=await normalizeRaster(source);
 assert.equal(result.manualPending,true);
 assert.equal(result.visualProvisional,true);
 assert.equal(result.cropVerified,false);
 assert.equal(result.cropped,false);
 assert.equal(result.geometryReview,true);
 assert.equal(result.review,true);
 assert.equal(result.processed.width,875);
 assert.ok(html.includes("entries.some(e=>e.manualPending===true)"),'PDF export remains locked until confirmation');
 assert.ok(html.includes("e.visualProvisional===true"),'editor prefills provisional corners in original source');
 console.log('PASS: photographed CIE front/back proposed, internal panel rejected, original preserved, manual PDF safety gate, compatibility engine');
})().catch(err=>{console.error(err);process.exitCode=1;});
