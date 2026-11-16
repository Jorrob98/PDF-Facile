'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const colored=fs.readFileSync(path.join(__dirname,'app/card-over-paper.js'),'utf8');
const W=680,H=960;
function imageCard(card=true){
 const data=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const k=(y*W+x)*4;
  const colored=card&&x>=224&&x<510&&y>=278&&y<458;
  const logo=!card&&x>=220&&x<250&&y>=280&&y<302;
  let rgb=colored||logo?[120,165,215]:[242,243,242];
  // A real ID card contains multiple printed text lines, unlike a
  // plain cyan portrait panel inside an otherwise unrelated document.
  if(colored&&((y>=317&&y<=320)||(y>=352&&y<=355)||(y>=387&&y<=390))&&
      x>=245&&x<333)rgb=[49,57,65];
  data[k]=rgb[0];data[k+1]=rgb[1];data[k+2]=rgb[2];data[k+3]=255;
 }
 return {width:W,height:H,data,getContext:()=>({getImageData:()=>({data})})};
}
const source=imageCard(),originalBytes=source.data.slice();
const scanner={resize:c=>c},win={DocFixScanner:scanner};
vm.runInNewContext(colored,{window:win,Math,console,Uint8Array,Int32Array});
const candidate=win.DocFixOverPaper.analyzeRGBA(source.data,W,H);
assert.ok(candidate,'small ISO-size card on A4 should be proposed');
assert.ok(candidate.confidence>=.79);
assert.equal(win.DocFixOverPaper.analyzeRGBA(imageCard(false).data,W,H),null,'decorative blue logo is not a card');
const quad=candidate.quad;
const area=q=>Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-q[(i+1)%4].x*p.y,0))/2;
const ratio=(q,w,h)=>{
 const p=q.map(x=>({x:x.x*w,y:x.y*h})),d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const ww=(d(p[0],p[1])+d(p[2],p[3]))/2,hh=(d(p[1],p[2])+d(p[3],p[0]))/2;
 return Math.max(ww,hh)/Math.max(1,Math.min(ww,hh));
};
assert.ok(area(quad)>.055&&area(quad)<.12,'fixture card occupies ~8% of A4');
let smart=true,sides=4,warps=0;
Object.assign(scanner,{validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>
 Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=1&&p.y<=1)&&area(q)>.002,
 area,defaultQuad:()=>[{x:.02,y:.02},{x:.98,y:.02},{x:.98,y:.98},{x:.02,y:.98}],
 detectDocument:()=>({status:'uncertain'}),
 process:()=>{warps++;return {width:640,height:405}}});
const start=html.indexOf('function singleCropGate(original,candidate,kind=');
const end=html.indexOf('// The same normalization path is used by photos and scanned PDF pages.',start);
assert.ok(start>=0&&end>start);
win.DocFixOverPaper={detect:()=>candidate};
win.DocFixLicenceRear={detect:()=>null};
win.DocFixQuadAudit={inspectCanvas:()=>({verified:sides===4,quad,confidence:.95,support:{sidesOk:sides}})};
win.DocFixOnePass={detect:()=>null};
const make=new Function('window','cropMode','quadCardRatio','expandQuadSafe','trimCardBackground','console',
 html.slice(start,end)+';return {singleCropGate,photoNormalize};');
const {singleCropGate,photoNormalize}=make(win,()=>smart?'smart':'legacy',ratio,q=>q,c=>c,{warn(){}});
assert.equal(singleCropGate(source,candidate,'blue').ok,true,'smart mode sends small card to geometry audit');
smart=false;
assert.equal(singleCropGate(source,candidate,'blue').ok,false,'legacy threshold is not relaxed');
smart=true;
assert.equal(singleCropGate(source,{...candidate,physicallyVerified:false},'generic').ok,false,'unverified generic frame blocked');
assert.equal(singleCropGate(source,{...candidate,physicallyVerified:true},'generic').ok,true,'verified small generic allowed');
assert.equal(singleCropGate(source,{...candidate,quad:[{x:.39,y:.39},{x:.51,y:.39},{x:.51,y:.46},{x:.39,y:.46}]},'blue').ok,false,'face-sized box blocked');
sides=3;warps=0;
assert.equal(photoNormalize(source).processed,source,'three edges preserve source');
assert.equal(warps,0,'no warp from three edges');
sides=4;warps=0;
assert.notEqual(photoNormalize(source).processed,source,'four edges allow crop');
assert.equal(warps,1,'single perspective warp');
assert.deepEqual(source.data,originalBytes,'source pixels unchanged');
console.log('PASS: small A4 card, four-edge proof, legacy safety, no face/logo crop, unchanged original');
