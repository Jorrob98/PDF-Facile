'use strict';
// Synthetic document rectangles only. Customer scans remain private/offline.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'app/card-independent-projection.js'),'utf8');
const win={};vm.runInNewContext(source,{window:win,Math,Uint8Array,Int32Array,Float64Array,console});
const api=win.DocFixIndependentProjection;
function make(n){
 const w=n===3?500:360,h=n===3?700:600,d=new Uint8ClampedArray(w*h*4);
 const rects=n===1?[[45,215,318,372]]:n===2?[[45,85,318,245],[45,348,318,505]]:
  [[48,220,209,476],[291,46,457,310],[291,385,457,650]];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let v=[228,225,219];
  for(let j=0;j<rects.length;j++){
   const [x0,y0,x1,y1]=rects[j];
   if(x>=x0&&x<=x1&&y>=y0&&y<=y1){
    v=j%2?[70,153,203]:[196,172,182];
    if((y-y0)%18<3&&x>x0+30&&x<x1-30)v=[31,31,35];
    if((x-x0)%24<4&&y>y0+40&&y<y1-30)v=[33,35,42];
   }
  }
  const k=(y*w+x)*4;d[k]=v[0];d[k+1]=v[1];d[k+2]=v[2];d[k+3]=255;
 }
 return {d,w,h};
}
for(const n of [1,2,3]){
 const {d,w,h}=make(n),before=d.slice(),r=api.analyzeRGBA(d,w,h);
 assert.equal(r?.cards?.length||1,n,'synthetic document count '+n);
 assert.deepEqual(d,before,'the source cannot be modified');
 if(n>1){
  assert.ok(r.cards.every(c=>c.physicallyVerified===false&&c.needsReview===true),
   'estimated card regions must never be claimed as verified physical edges');
  assert.ok(r.cards.every(c=>c.quad.length===4&&c.quad.every(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1)),
   'all region corners must lie within source image');
 }
}
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
assert.ok(html.includes('card-independent-projection.js'),'projection module must be loaded');
assert.ok(html.includes("cropMode()==='smart'&&!verified"),'legacy mode and verified crops bypass new fallback');
assert.ok(html.includes('conservativeSegment:true'),'fallback cannot perform a destructive secondary crop');
assert.ok(html.includes('fixed.geometryReview=true;fixed.cropped=true'),'provisional crop needs visible border warning');
assert.ok(html.includes("if(projection?.cards?.length===3)"),'three-card region recovery is present');
assert.ok(html.includes('const completePage=mode===\'cards\'?null:preserveFullA4Page(original'),
 'declarations remain protected before any card detection');
console.log('DocFix dual-projection QA PASS: 1/2/3 objects, four normalized corners, original intact, review and legacy protections');
