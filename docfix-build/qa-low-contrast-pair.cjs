'use strict';
// DocFix low-contrast two-card consensus, synthetic images only.
// Confirm two separate stable contours at two thresholds; never manufacture
// an extra card from an empty frame or a single document.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'app/card-texture-crop.js'),'utf8');
const window={};
vm.runInNewContext(src,{window,Math,Uint8Array,Uint16Array,Uint32Array,Int32Array,
 Uint8ClampedArray,Float32Array,Float64Array});
const engine=window.DocFixRealCrop,w=300,h=450;
function fixture(seed,count){
 const data=new Uint8ClampedArray(w*h*4),boxes=[
  [75,60,150,95,16],[75,275,150,95,-16]];
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const noise=(random()-.5)*5,b=80+8*x/w+8*y/h+noise;
  let rgb=[b,b+1,b+2];
  for(let z=0;z<count;z++){
   const [bx,by,bw,bh,ang]=boxes[z],a=ang*Math.PI/180;
   const dx=x-bx-bw/2,dy=y-by-bh/2;
   const u=dx*Math.cos(a)+dy*Math.sin(a)+bw/2;
   const v=-dx*Math.sin(a)+dy*Math.cos(a)+bh/2;
   if(u>=0&&u<bw&&v>=0&&v<bh)rgb=[74,77,83];
  }
  const k=(y*w+x)*4;
  data[k]=rgb[0];data[k+1]=rgb[1];data[k+2]=rgb[2];data[k+3]=255;
 }
 return data;
}
for(const seed of [140217,123456,777,42]){
 const input=fixture(seed,2),before=input.slice();
 const answer=engine.analyzeRGBA(input,w,h);
 assert.equal(answer.cards.length,2,'two weak 16-degree outlines must survive, seed '+seed);
 assert.deepEqual(input,before,'never edit source pixels, seed '+seed);
 assert.ok(answer.cards.every(c=>c.method==='low-contrast-two-threshold-provisional'),
  'weak contours must be labelled provisional for downstream physical verification');
 assert.ok(answer.cards.every(c=>c.confidence<=.82),
  'weak contours cannot claim high confidence without independent edge audit');
 const empty=engine.analyzeRGBA(fixture(seed,0),w,h);
 assert.equal(empty.cards.length,0,'weak gradient/noise must not generate cards');
 const single=engine.analyzeRGBA(fixture(seed,1),w,h);
 assert.ok(single.cards.length<=1,'single card must not become an artificial pair');
}
console.log('DocFix low contrast PASS: 4 seeds, weak rotated pairs, blank and single safe, source pixels unchanged');
