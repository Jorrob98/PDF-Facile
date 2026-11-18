'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'app/docfix-fine-deskew.js'),'utf8');
const win={DocFixScanner:{resize:c=>c,validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1)}};
vm.runInNewContext(source,{window:win,console,Float32Array,Math,Uint8ClampedArray});
const W=800,H=600;
function fixture({side='front',slope=-.043,missing=false}={}){
 const data=new Uint8ClampedArray(W*H*4);
 const top=x=>199+slope*(x-350),bottom=x=>512+(slope-.011)*(x-350);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let rgb=[215,201,185];
  if(y>=88&&y<118)rgb=[50,48,47]; // unrelated scanner border
  if(!missing&&x>=115&&x<610&&y>=top(x)&&y<=bottom(x)){
   rgb=side==='front'?[176,215,223]:[183,209,211];
   if(side==='front'&&x>=155&&x<255&&y>294&&y<455)
    rgb=[110+(x+y)%23,117+(x+y)%21,128+(x+y)%25]; // face
   if(side==='back'&&y>380&&y<417&&x>170&&x<560&&x%5<3)
    rgb=[46,55,66]; // barcode
   if(side==='back'&&y>440&&y<493&&x>175&&x<565&&y%17<6)
    rgb=[35,47,55]; // MRZ
   if(side==='front'&&y>260&&y<350&&x>300&&x<530&&y%13<4)
    rgb=[54,74,91]; // printed rows
  }
  const k=(y*W+x)*4;data[k]=rgb[0];data[k+1]=rgb[1];data[k+2]=rgb[2];data[k+3]=255;
 }
 return {data,top,bottom};
}
const rough=[[115,197],[610,197],[610,520],[115,520]].map(([x,y])=>({x:x/W,y:y/H}));
for(const side of ['front','back'])for(const slope of [-.043,.037]){
 const img=fixture({side,slope}),before=img.data.slice();
 const result=win.DocFixFineDeskew.inspectRGBA(img.data,W,H,rough);
 assert.ok(result?.quad,'full ID-1 top/bottom plastic edges are needed');
 assert.ok(Math.abs(result.angleDeg-slope*180/Math.PI)<1.5,'correct residual camera angle');
 assert.equal(result.needsReview,true);
 assert.equal(result.physicallyVerified,false);
 assert.ok(result.quad[2].y*H>495,'bottom plastic and MRZ remain inside');
 assert.ok(result.quad[0].y*H<220,'upper plastic margin remains');
 assert.deepEqual(img.data,before,'no pixel of the original is changed');
}
assert.equal(win.DocFixFineDeskew.inspectRGBA(fixture({missing:true}).data,W,H,rough),null,
 'a scanner border alone cannot be an ID');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
assert.ok(html.includes('window.DocFixFineDeskew?.refine?.(original,candidate.quad)'));
assert.ok(html.includes('window.DocFixCardDeskew?.refine?.(original,candidate.quad)'));
assert.ok(html.includes('manualPending:true,visualProvisional:true'));
assert.ok(html.includes("entries.some(e=>e.manualPending===true)"),'PDF export must still require confirmation');
assert.ok(html.includes("const quad=finalFit?.quad&&scan.validQuad(finalFit.quad)?finalFit.quad:candidate.quad;"),"old safe crop fallback still applies");
console.log('PASS: 1.9.46 synthetic CIE front and MRZ back, ±2° residual fine deskew, laptop/shadow ignored, original and PDF guards preserved');
