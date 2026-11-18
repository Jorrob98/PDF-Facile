'use strict';
// DocFix 1.9.45: synthetic office ID-1 tilt test, no real identity photos.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const js=fs.readFileSync(path.join(__dirname,'app/docfix-card-deskew.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const W=680,H=480,CX=340,CY=240,CW=420,CH=265;
const scan={resize:c=>c,validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>
 Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>.001&&p.x<.999&&p.y>.001&&p.y<.999)};
const win={DocFixScanner:scan};
vm.runInNewContext(js,{window:win,Math,console,Float32Array,Uint8ClampedArray});
assert.equal(typeof win.DocFixCardDeskew.inspectRGBA,'function');
function fixture(angleDeg=3.3,side='front'){
 const theta=angleDeg*Math.PI/180,cos=Math.cos(theta),sin=Math.sin(theta);
 const locals=[[-CW/2,-CH/2],[CW/2,-CH/2],[CW/2,CH/2],[-CW/2,CH/2]];
 const corners=locals.map(([x,y])=>({x:CX+x*cos-y*sin,y:CY+x*sin+y*cos}));
 const box={L:Math.min(...corners.map(p=>p.x))-5,R:Math.max(...corners.map(p=>p.x))+5,
 T:Math.min(...corners.map(p=>p.y))-5,B:Math.max(...corners.map(p=>p.y))+5};
 const rough=[{x:box.L/W,y:box.T/H},{x:box.R/W,y:box.T/H},{x:box.R/W,y:box.B/H},{x:box.L/W,y:box.B/H}];
 const data=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const dx=x-CX,dy=y-CY,u=dx*cos+dy*sin,v=-dx*sin+dy*cos;
  let rgb=[218,207,194]; // a warm office worktop
  if(y>=58&&y<70)rgb=[44,42,46]; // distracting scanner frame
  if(Math.abs(u)<CW/2&&Math.abs(v)<CH/2){
   rgb=side==='front'?[175,214,222]:[183,216,218];
   // Decorative photo, printed signature and text must not win the perimeter.
   if(side==='front'&&u<-CW*.25&&v>CH*-.21&&v<CH*.37)
    rgb=[95+(x+y)%40,107+(x*3+y)%47,118+(x+y*7)%42];
   if(side==='front'&&u>CW*.20&&v<-CH*.22)
    rgb=[227,191,100]; // security emblem
   if(u>-CW*.18&&u<CW*.40&&v<CH*.20&&v>-CH*.32&&Math.floor(v+CH/2)%18<4)
    rgb=[54,70,81]; // letters, barcodes and fine lines
   if(side==='back'&&v>CH*.29&&v<CH*.43&&Math.floor(v+CH/2)%11<5)
    rgb=[34,42,52]; // two/three MRZ rows near bottom
  }
  const k=(y*W+x)*4;data[k]=rgb[0];data[k+1]=rgb[1];data[k+2]=rgb[2];data[k+3]=255;
 }
 return {corners,rough,data,width:W,height:H,getContext:()=>({getImageData:()=>({data})})};
}
function px(q){return q.map(p=>({x:p.x*W,y:p.y*H}))}
function error(a,b){return Math.sqrt(a.reduce((s,p,i)=>s+(p.x-b[i].x)**2+(p.y-b[i].y)**2,0)/4);}
for(const angle of [-3.1,2.8,4.2]){
 for(const side of ['front','back']){
  const image=fixture(angle,side),before=image.data.slice();
  const refined=win.DocFixCardDeskew.inspectRGBA(image.data,W,H,image.rough);
  assert.ok(refined?.quad,'four physical coloured sides must be available: '+angle+' '+side);
  assert.equal(refined.physicallyVerified,false);
  assert.equal(refined.needsReview,true);
  const originalError=error(px(image.rough),image.corners);
  const refinedError=error(px(refined.quad),image.corners);
  assert.ok(refinedError<originalError*.57,'raster tilt must improve substantially: '+refinedError+' vs '+originalError);
  assert.ok(refinedError<7,'four corners must stay near real outer plastic: '+refinedError);
  assert.ok(Math.abs(refined.angleDeg-angle)<.9,'angle is the plastic perimeter, not MRZ/barcode');
  assert.equal(refined.targetAspect,1.586,'only known four-side ID-1 candidates may target physical aspect');
  assert.deepEqual(image.data,before,'source pixels never altered');
 }
}
const clean=fixture(0,'front');
const straight=win.DocFixCardDeskew.inspectRGBA(clean.data,W,H,clean.rough);
assert.ok(!straight||Math.abs(straight.angleDeg)<.50,
 'a near-straight card must never receive an invented rotation');
const noCard=fixture(2.1);
for(let i=0;i<noCard.data.length;i+=4){noCard.data[i]=218;noCard.data[i+1]=207;noCard.data[i+2]=194;}
assert.equal(win.DocFixCardDeskew.inspectRGBA(noCard.data,W,H,noCard.rough),null,'plain worktop cannot be forced to ID-1 shape');
const onlyPhoto=fixture(2.1);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const k=(y*W+x)*4;
 if(onlyPhoto.data[k]>165&&onlyPhoto.data[k+1]>180&&onlyPhoto.data[k+2]>190)
  {onlyPhoto.data[k]=218;onlyPhoto.data[k+1]=207;onlyPhoto.data[k+2]=194;}
}
assert.equal(win.DocFixCardDeskew.inspectRGBA(onlyPhoto.data,W,H,onlyPhoto.rough),null,
 'portrait and internal printed elements without coloured plastic are not enough');
assert.ok(html.includes('./docfix-card-deskew.js'));
assert.ok(html.includes('window.DocFixCardDeskew?.refine?.(original,candidate.quad)'));
assert.ok(html.includes('targetAspect:finalFit?.targetAspect||null'),'four-side physical aspect preserved through final fit');
assert.ok(html.includes('manualPending:true,visualProvisional:true'));
assert.ok(html.includes("entries.some(e=>e.manualPending===true)"));
assert.ok(html.includes("const finalFit=fitted?.quad?fitted:consensus?.quad?consensus:null;"),
 'existing four-sided result always wins over new fallback');
assert.ok(html.includes('const quad=finalFit?.quad&&scan.validQuad(finalFit.quad)?finalFit.quad:candidate.quad;'),
 'original safe preview fallback retained when all refiners fail');
console.log('PASS: CIE tilted front/back -3°/+4° corrected on original; portrait, MRZ and scanner-line protection; manual confirmation and fallback');
