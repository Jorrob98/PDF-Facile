'use strict';
// Regression for November 14: touching side-by-side cards must lose the
// dark photographic backdrop, and a CF/MRZ bottom line gets an outer guard.
// All fixtures are synthetic: no real IDs or user photos in the repository.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const detectorSource=fs.readFileSync(path.join(__dirname,'app/card-touching-pair.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const W=240,H=180;
const canvas=(kind)=>{
 const data=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let c=[33+x/W*7,31+y/H*6,30+x/W*5];
  const left=x>=26&&x<116&&y>=24&&y<159;
  const right=x>=(kind==='gap'?120:116)&&x<(kind==='gap'?210:206)&&y>=24&&y<159;
  if((kind==='touching'||kind==='gap')&&(left||right))
   c=left?[183,195,214]:[193,191,200];
  if(kind==='single'&&left)c=[183,195,214];
  if(kind==='a4'&&x>30&&x<210&&y>17&&y<163)c=[235,235,235];
  if(kind==='white')c=[246,246,246];
  const k=(y*W+x)*4;data[k]=c[0];data[k+1]=c[1];data[k+2]=c[2];data[k+3]=255;
 }
 return {width:W,height:H,data,getContext:()=>({getImageData:()=>({data})})};
};
const quad=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const area=q=>Math.abs((q[1].x-q[0].x)*(q[3].y-q[0].y));
const validQuad=q=>Array.isArray(q)&&q.length===4&&q.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
const host={DocFixScanner:{resize:o=>o,validQuad,area},DocFixPairProof:{
 geometry:(source,cards)=>{
  if(!Array.isArray(cards)||cards.length!==2)return {ok:false};
  return {ok:cards.every(c=>{
   const q=c.quad,w=(q[1].x-q[0].x)*source.width,h=(q[3].y-q[0].y)*source.height;
   const ratio=Math.max(w,h)/Math.min(w,h);
   return validQuad(q)&&ratio>=1.32&&ratio<=2.05&&w>=28&&h>=28;
  })};
 }
}};
vm.runInNewContext(detectorSource,{window:host,Math,Float32Array,Int32Array,Uint8Array,console});
const touching=canvas('touching'),snapshot=touching.data.slice();
const joined=host.DocFixTouchingCards.detect(touching);
assert.equal(joined?.cards,null,'unproved inner seam must never create two invented documents');
assert.equal(joined?.group?.contactGroup,true,'outer joined shape must be retained');
assert.equal(joined?.group?.physicallyVerified,false);
assert.ok(joined.group.quad[0].x>.07&&joined.group.quad[1].x<.92,
 'joined preview must remove left/right photographic background');
assert.ok(joined.group.quad[0].y>.08&&joined.group.quad[2].y<.94,
 'joined preview must remove top/bottom photographic background');
assert.deepEqual(touching.data,snapshot,'source bytes cannot be changed');
const separate=host.DocFixTouchingCards.detect(canvas('gap'));
assert.equal(separate?.cards?.length,2,'two distinct touching-nearby cards are separated');
assert.ok(separate.cards.every(c=>c.physicallyVerified===false));
for(const kind of ['single','a4','white','empty'])
 assert.equal(host.DocFixTouchingCards.detect(canvas(kind)),null,
  'do not create false grouped/card output for '+kind);
const start=html.indexOf('function padTwoCardQuad(');
const end=html.indexOf('function safeRefineMultiQuad(',start);
assert.ok(start>0&&end>start,'bottom-preservation guard must exist');
const pad=new Function('window',html.slice(start,end)+';return padTwoCardQuad;')(host);
const front=quad(.25,.15,.75,.40),otherLower=quad(.25,.47,.75,.72);
const preserved=pad(front,otherLower,{width:1200,height:1800});
assert.ok(preserved[2].y>front[2].y+.005,
 'bottom edge must expand from the original to protect CF/MRZ characters');
assert.ok(preserved[0].y<front[0].y,'top outer material must also be protected');
const touchingBelow=pad(front,quad(.25,.40,.75,.65),{width:1200,height:1800});
assert.ok(touchingBelow[2].y<=front[2].y+.001,
 'no expansion into an immediately touching second card');
const bySide=pad(front,quad(.75,.15,.99,.40),{width:1200,height:1800});
assert.ok(bySide[1].x<=.7501,'no expansion across a shared vertical seam');
assert.ok(html.includes('<script src="./card-touching-pair.js"></script>'));
assert.ok(html.includes('if(touchingGroup?.quad&&cropMode()===\'smart\')'));
assert.ok(html.includes('processed=window.DocFixScanner.process(original,'));
assert.ok(html.includes('manualPending:true,'));
assert.ok(html.includes('if(entries.some(e=>e.manualPending===true))'),
 'unconfirmed joined preview must be blocked from PDF export');
assert.ok(html.includes('let b=Math.min(h,bottom+Math.max(4,Math.round(h*.032)));'),
 'remaining blue card trim needs a lower safety margin');
console.log('DocFix touching cards PASS: 2 near cards split; joined pair backdrop removed; A4/single safe; CF bottom safe; source untouched');
