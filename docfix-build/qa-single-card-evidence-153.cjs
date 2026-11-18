'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'app/docfix-single-card-evidence.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const W=520,H=693,N=W*H;
const win={DocFixScanner:{resize:c=>c,validQuad:q=>Array.isArray(q)&&q.length===4&&
 q.every(v=>v.x>.001&&v.x<.999&&v.y>.001&&v.y<.999)}};
vm.runInNewContext(code,{window:win,Math,console,Int32Array,Uint8Array,Uint8ClampedArray});
const guard=win.DocFixSingleCardEvidence;
assert.ok(guard?.analyzeRGBA&&guard?.detect);
const front=[[68,199],[431,202],[428,436],[59,425]];
const back=[[88,233],[445,251],[439,481],[86,460]];
function inside(x,y,q){
 return q.every((p,i)=>{
  const b=q[(i+1)%4];
  return (b[0]-p[0])*(y-p[1])-(b[1]-p[1])*(x-p[0])>=0;
 });
}
function fixture(quads=[],withText=true){
 const d=new Uint8ClampedArray(N*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const m=(x*13+y*19)%31;
  let r=201+m,g=194+m,b=180+m;
  for(const q of quads){
   if(!inside(x,y,q))continue;
   r=174+(y%11);g=210+(x%8);b=224+(y%6);
   if(withText&&x>175&&x<310&&y%19<3){r=37;g=46;b=55;}
   if(withText&&x>180&&x<400&&y>q[3][1]-55&&y<q[3][1]-15&&x%9<3){r=35;g=42;b=51;}
  }
  const k=(y*W+x)*4;d[k]=r;d[k+1]=g;d[k+2]=b;d[k+3]=255;
 }
 return d;
}
for(const q of [front,back]){
 const rgba=fixture([q]),before=rgba.slice();
 const found=guard.analyzeRGBA(rgba,W,H);
 assert.ok(found?.strongSingle,'a SINGLE blue CIE must be one page');
 assert.equal(found.needsReview,true,'no automatic approval');
 assert.equal(found.physicallyVerified,false,'colour cannot certify physical edges');
 assert.ok(found.confidence<.80,'confidence remains provisional');
 const px=found.quad.map(p=>({x:p.x*W,y:p.y*H}));
 for(let i=0;i<4;i++){
  const err=Math.hypot(px[i].x-q[i][0],px[i].y-q[i][1]);
  assert.ok(err<23,'corner '+i+' must be close to the material boundary: '+err);
 }
 assert.deepEqual(rgba,before,'never modify original source bytes');
 const canvas={width:W,height:H,getContext:()=>({getImageData:()=>({data:rgba})})};
 assert.ok(guard.detect(canvas)?.quad,'real canvas detection bridge');
}
assert.equal(guard.analyzeRGBA(fixture([]),W,H),null,'marble alone is NOT a card');
// TWO real source cards remain eligible for existing two-card detection.
const upper=[[78,100],[415,100],[415,304],[78,304]];
const lower=[[78,365],[415,365],[415,570],[78,570]];
assert.equal(guard.analyzeRGBA(fixture([upper,lower]),W,H),null,'do NOT suppress legitimate 2-up');
// A4 white paper cannot be classified by a single cyan plastic mask.
const white=fixture([]);
for(let y=80;y<610;y++)for(let x=75;x<445;x++){
 const i=(y*W+x)*4;white[i]=white[i+1]=white[i+2]=240;
}
assert.equal(guard.analyzeRGBA(white,W,H),null,'white document stays in A4 path');
assert.ok(html.includes('./docfix-single-card-evidence.js'),'module loaded');
assert.ok(html.includes('singleton=window.DocFixSingleCardEvidence?.detect?.(original)'),'original source inspected');
const guardPos=html.indexOf('singleton?.strongSingle===true'),pairPos=html.indexOf('window.DocFixRealCrop?.detect?.(original)');
assert.ok(guardPos>0&&guardPos<pairPos,'one-card evidence before any pair split');
assert.ok(html.includes('splitCount:1,twoUp:false,threeUp:false,')&&
 html.includes('fixed.manualPending=true;fixed.cropVerified=false;fixed.cropped=false;'),'ONE preview, export manual-confirmed');
assert.ok(html.includes("sidewaysOrientationBlocked=true"),'90-degree OCR cannot turn landscape ID-1 into portrait');
assert.ok(html.includes("entries.some(e=>e.manualPending===true)"),'PDF safety gate');
console.log('PASS: blue single CIE front/rear + one preview + marble suppression; two cards/A4 preserved; no personal photos in CI');
