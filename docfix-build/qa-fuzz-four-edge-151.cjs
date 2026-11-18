'use strict';
// Synthetic randomized corpus: pixel-ground-truth four corners. No private
// document photographs uploaded to CI. Measure corner error, not test count.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const editor=fs.readFileSync(path.join(__dirname,'app/card-precision-editor.js'),'utf8');
const gate=fs.readFileSync(path.join(__dirname,'app/card-auto-four-edge.js'),'utf8');
const valid=q=>Array.isArray(q)&&q.length===4&&q.every(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1);
const window={DocFixScanner:{validQuad:valid}};
const ctx={window,Math,console,Uint8ClampedArray,Float32Array};
vm.createContext(ctx);vm.runInContext(editor,ctx);vm.runInContext(gate,ctx);
const W=640,H=450,randomSeed=1795;let seed=randomSeed;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function corners(deg,skew){
 const a=deg*Math.PI/180,co=Math.cos(a),si=Math.sin(a),hw=224,hh=141,cx=318,cy=226;
 return [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([x,y],i)=>{
  const extra=i<2?-skew:skew;
  return {x:cx+x*co-y*si+extra,y:cy+x*si+y*co};
 });
}
function contains(q,x,y){
 let polarity=0;
 for(let i=0;i<4;i++){
  const a=q[i],b=q[(i+1)%4],cross=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
  if(i===0)polarity=Math.sign(cross);
  if(polarity*cross<0)return false;
 }
 return true;
}
function scene(deg,skew,contrast,hasText=true){
 const q=corners(deg,skew),data=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const k=(y*W+x)*4;
  const inside=contains(q,x+.5,y+.5);
  const noise=Math.round((rand()-.5)*5);
  const bg=[185,178,170],card=[bg[0]-contrast,bg[1]+Math.min(contrast,53),bg[2]+Math.min(contrast+3,62)];
  let rgb=inside?card:bg;
  if(inside&&hasText&&y>248&&y<335&&x>128&&x<517&&x%7<3)
   rgb=[54,63,71]; // MRZ or barcode must NOT be selected as outside
  for(let c=0;c<3;c++)data[k+c]=Math.min(255,Math.max(0,rgb[c]+noise));
  data[k+3]=255;
 }
 return {q,data};
}
const norm=p=>({x:p.x/W,y:p.y/H}),errors=[],examples=[];
let discovered=0,bad=0,skipped=0;
for(let n=0;n<36;n++){
 const angle=-5+rand()*10,skew=-9+rand()*18,contrast=18+rand()*35;
 const sample=scene(angle,skew,contrast,true),rough=sample.q.map(p=>({
  x:(p.x+(rand()-.5)*10)/W,y:(p.y+(rand()-.5)*10)/H
 }));
 const raw=window.DocFixPrecisionEditor.snapRGBA(sample.data,W,H,rough,{wideSearch:true});
 const out=window.DocFixAutoFourEdge.assess({width:W,height:H},rough,raw,valid);
 if(!out){skipped++;continue;}
 discovered++;
 const errs=out.quad.map((p,i)=>Math.hypot(p.x*W-sample.q[i].x,p.y*H-sample.q[i].y));
 const worst=Math.max(...errs);
 errors.push(worst);
 examples.push({angle:+angle.toFixed(1),contrast:+contrast.toFixed(1),worst:+worst.toFixed(1)});
 if(worst>12)bad++;
}
const sorted=errors.slice().sort((a,b)=>a-b);
const median=sorted[Math.floor(sorted.length/2)]||null;
const worst=sorted[sorted.length-1]||null;
console.log('FOUR_EDGE_METRICS',JSON.stringify({syntheticCases:36,accepted:discovered,skipped,unsafeProposals:bad,medianWorstPx:median,maxWorstPx:worst,examples:examples.slice(0,6)}));
assert.ok(discovered>0,'physical-edge algorithm never accepted a candidate');
assert.equal(bad,0,'no accepted automatic crop may be further than 12 px from ANY known plastic corner');
// Separate harder corpus: old colour/texture candidate may be 10-20px
// away from actual plastic. Accept no unsafe shifted internal rectangles.
let farAccepted=0,farBad=0,farFound=0;const farExamples=[];
for(let n=0;n<24;n++){
 const angle=-5+rand()*10,skew=-9+rand()*18;
 const sample=scene(angle,skew,28+rand()*26,true);
 const rough=sample.q.map(p=>({x:(p.x+(rand()-.5)*38)/W,
  y:(p.y+(rand()-.5)*38)/H}));
 const fitted=window.DocFixPrecisionEditor.snapRGBA(sample.data,W,H,rough,{wideSearch:true});
 if(fitted){farFound++;const pxerr=fitted.quad.map((p,i)=>Math.hypot(p.x*W-sample.q[i].x,p.y*H-sample.q[i].y));
   farExamples.push({matched:fitted.matchedSides,error:+Math.max(...pxerr).toFixed(1),roughError:+Math.max(...rough.map((p,i)=>Math.hypot(p.x*W-sample.q[i].x,p.y*H-sample.q[i].y))).toFixed(1)});
 }
 const out=window.DocFixAutoFourEdge.assess({width:W,height:H},rough,fitted,valid);
 if(!out)continue;
 farAccepted++;
 const pxError=out.quad.map((p,i)=>Math.hypot(p.x*W-sample.q[i].x,p.y*H-sample.q[i].y));
 if(Math.max(...pxError)>12)farBad++;
}
console.log('FOUR_EDGE_FAR_METRICS',JSON.stringify({cases:24,found:farFound,accepted:farAccepted,unsafeProposals:farBad,examples:farExamples.slice(0,15)}));
assert.equal(farBad,0,'imprecise initial crop must never become a wrong confirmed-looking geometry');
assert.ok(farAccepted>=8,'wider source-edge search must recover some clearly visible misplaced rectangles');
const blank=new Uint8ClampedArray(W*H*4);for(let i=0;i<blank.length;i+=4){
 blank[i]=185;blank[i+1]=178;blank[i+2]=170;blank[i+3]=255;
}
const plain=corners(0,0).map(norm);
assert.equal(window.DocFixAutoFourEdge.assess({width:W,height:H},plain,
 window.DocFixPrecisionEditor.snapRGBA(blank,W,H,plain),valid),null,
 'neutral blank desk cannot invent four physical plastic sides');
console.log('PASS: randomized source-image auto-four-edge synthetic corpus with per-corner pixel error, safe fallback and blank-background rejection');