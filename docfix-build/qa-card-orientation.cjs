'use strict';
// Offline regression fixtures are synthetic rectangles, not customer IDs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'app/card-texture-crop.js'),'utf8');
const window={};
vm.runInNewContext(source,{window,Math,Uint8Array,Uint32Array,Int32Array,
 Uint8ClampedArray,Float32Array,Float64Array});
const engine=window.DocFixRealCrop;
function fixture(kind='pair',w=420,h=650){
 const data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let r=48+x/w*9,g=47+x/w*12,b=45+x/w*13;
  const first=x>=145&&x<=265&&y>=60&&y<=250;
  const second=kind==='pair'&&x>=145&&x<=265&&y>=348&&y<=538;
  if(first){r=210;g=218;b=212;}
  if(second){r=102;g=176;b=212;}
  const i=(y*w+x)*4;data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=255;
 }return data;
}
const pair=fixture(),copy=pair.slice();
const two=engine.analyzeRGBA(pair,420,650);
assert.equal(two.cards.length,2,'two portrait-oriented Italian cards must be found');
assert.ok(two.cards.every(c=>c.rotated90===true),'portrait cards retain orientation metadata');
assert.ok(two.cards[0].quad[0].y<two.cards[1].quad[0].y,'stable top-to-bottom order');
assert.deepEqual(pair,copy,'candidate extraction never changes original pixels');
const single=engine.analyzeRGBA(fixture('single'),420,650);
assert.equal(single.cards.length,1,'one vertical ID must not be split into two');

function geometricFixture(boxes,w=400,h=600){
 const data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let rgb=[48+x/w*9,47+y/h*12,45+x/w*13];
  for(let j=0;j<boxes.length;j++){
   const [bx,by,bw,bh,deg]=boxes[j],rad=deg*Math.PI/180;
   const dx=x-bx-bw/2,dy=y-by-bh/2;
   const u=dx*Math.cos(rad)+dy*Math.sin(rad)+bw/2;
   const v=-dx*Math.sin(rad)+dy*Math.cos(rad)+bh/2;
   if(u>=0&&u<bw&&v>=0&&v<bh)rgb=j?[102,176,212]:[210,218,212];
  }
  const i=(y*w+x)*4;data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
 }
 return data;
}
const sideways=engine.analyzeRGBA(geometricFixture([[10,190,170,105,0],[220,190,170,105,0]]),400,600);
assert.equal(sideways.cards.length,2,'two side-by-side cards at image margins are recovered');
const tilted=engine.analyzeRGBA(geometricFixture([[100,170,200,126,30]]),400,600);
assert.equal(tilted.cards.length,1,'30-degree card is detected without forcing extra documents');
assert.ok(Math.abs(tilted.cards[0].angle-30)<=2,'large-angle deskew must estimate the true angle');
const originalPage=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
assert.ok(originalPage.includes("if(mode==='cards'||portrait>.67)"),'landscape and portrait photos both reach the existing physical detector');
assert.ok(originalPage.includes("cardKind:'generic'"),'unknown card type must not be inferred from the upload order');
assert.ok(!originalPage.includes("meta.batchSize===2?(i===0?'cf':'ci')"),'batch count must never identify a document');
assert.ok(originalPage.includes('Libretti / dichiarazioni / A4 · pagina intera'),'libretti can preserve the full sheet');
assert.ok(originalPage.includes("if(multi?.length===2&&cropMode()==='smart'&&!projection)"),
 'two candidates must still pass independent four-corner verification');
console.log('DocFix card orientation PASS: rotated two-card, no false split of one, original intact, pair-proof and libretti protection');
