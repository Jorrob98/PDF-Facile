'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'app/docfix-projected-edges.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const W=900,H=650;
const validQuad=q=>Array.isArray(q)&&q.length===4&&q.every(p=>
 Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>.001&&p.y>.001&&p.x<.999&&p.y<.999);
const win={DocFixScanner:{validQuad,resize:c=>c}};
vm.runInNewContext(code,{window:win,Math,console,Uint8ClampedArray});
const solver=win.DocFixProjectedEdges;
assert.ok(solver?.inspectRGBA&&solver?.refine,'module loaded');
const actual=[[125,119],[751,148],[730,515],[109,494]];
const initial=[[102,106],[772,106],[772,531],[102,531]]
 .map(([x,y])=>({x:x/W,y:y/H}));
function inside(x,y,q=actual){
 const cross=q.map(([px,py],i)=>{const [qx,qy]=q[(i+1)%4];return (qx-px)*(y-py)-(qy-py)*(x-px);});
 return cross.every(v=>v>=0);
}
function photo(withCard=true){
 const pixels=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let rgb=[210,206,199];
  if(withCard&&inside(x,y)){
   rgb=[176,215,224];
   if(x>190&&x<650&&y>190&&y<450&&y%15<3)rgb=[55,65,73]; // print noise
   if(x>200&&x<680&&y>455&&y<494&&x%12<4)rgb=[30,39,48]; // MRZ
  }
  const k=(y*W+x)*4;
  pixels[k]=rgb[0];pixels[k+1]=rgb[1];pixels[k+2]=rgb[2];pixels[k+3]=255;
 }
 return pixels;
}
const data=photo();
const before=data.slice();
const refined=solver.inspectRGBA(data,W,H,initial);
assert.ok(refined?.quad,'perspective/printed bars should produce four physical boundaries');
assert.equal(refined.matchedSides,4);
assert.equal(refined.needsReview,true);
assert.equal(refined.physicallyVerified,false);
assert.ok(refined.confidence<.75,'never advertise an unverified automatic success');
const quad=refined.quad.map(p=>({x:p.x*W,y:p.y*H}));
for(let i=0;i<4;i++){
 const err=Math.hypot(quad[i].x-actual[i][0],quad[i].y-actual[i][1]);
 assert.ok(err<16,'corner '+i+' exceeds 16 source pixels: '+err.toFixed(2));
}
assert.deepEqual(data,before,'original pixels immutable');
assert.equal(solver.inspectRGBA(photo(false),W,H,initial),null,
 'uniform desk is NOT a card');
const threeSides=photo();
for(let y=140;y<520;y++)for(let x=700;x<W;x++){
 const k=(y*W+x)*4;threeSides[k]=210;threeSides[k+1]=206;threeSides[k+2]=199;
}
assert.equal(solver.inspectRGBA(threeSides,W,H,initial),null,
 'occluded right edge cannot be invented as the fourth side');
const original={width:W,height:H,getContext:()=>({getImageData:()=>({data})})};
const result=solver.refine(original,initial);
assert.ok(result?.quad&&result.needsReview,'source canvas integration');
assert.ok(html.includes('./docfix-projected-edges.js'));
assert.ok(html.includes('window.DocFixProjectedEdges?.refine?.(original,candidate.quad)'));
assert.ok(html.includes('const finalFit=fitted?.quad?fitted:consensus?.quad?consensus:null;'),
 'prior candidate priority unchanged');
assert.ok(html.includes('review=true;previewOnly=true;'));
assert.ok(html.includes("entries.some(e=>e.manualPending===true)"));
console.log('PASS: perspective candidate, all four physical edges, print avoidance, missing-side rejection, no source modification, manual PDF gate');
