'use strict';
// Synthetic equivalent of the Nov-17 photo: two blue ID-1 cards stacked
// above each other on grey fabric. No real ID photos or OCR text in repo.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'app/card-stacked-blue-pair.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const W=240,H=370;
const box=q=>({x0:q[0].x*W,y0:q[0].y*H,x1:q[2].x*W,y1:q[2].y*H});
const validQuad=q=>Array.isArray(q)&&q.length===4&&q.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>0&&p.x<1&&p.y>0&&p.y<1);
const geometry=(o,cs)=>{
 if(cs.length!==2||cs.some(c=>!validQuad(c.quad)))return {ok:false};
 const [a,b]=cs.map(c=>box(c.quad)),ratio=(b)=>(b.x1-b.x0)/(b.y1-b.y0);
 return {ok:a.y1<b.y0&&[ratio(a),ratio(b)].every(r=>r>=1.32&&r<=2.05)};
};
const win={DocFixScanner:{validQuad,resize:c=>c},DocFixPairProof:{geometry}};
vm.runInNewContext(source,{window:win,Math,console,Float32Array,Uint8Array,Uint8ClampedArray});
function sourceImage({type='pair',paper=false}={}){
 const data=new Uint8ClampedArray(W*H*4),top=type==='pair'||type==='single',bottom=type==='pair';
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let rgb=[120+(x*5+y*7)%10,117+(x*7+y*3)%11,113+(x*3+y*11)%12]; // grey textile
  const first=top&&x>=20&&x<=218&&y>=18&&y<=142;
  const second=bottom&&x>=12&&x<=227&&y>=158&&y<=294;
  if(first){
   rgb=[80,126,175];
   // Thin blue header followed by black stripe and blue/white TS rows.
   if(y>31&&y<46)rgb=[36,38,42];
   if(y>=46&&y<133){rgb=[67,122,171];if(y%20>=11&&y%20<=16)rgb=[203,215,223];}
   if(y>76&&y<92&&x>54&&x<201&&x%6<3)rgb=[35,40,48]; // barcode
  }
  if(second){
   rgb=[167,208,215];
   if(y>223){rgb=[241,239,239];if(x>39&&x<207&&y%17<7)rgb=[43,48,58];} // MRZ lines
   if(y>196&&y<223&&x>34&&x<207&&x%5<3)rgb=[37,46,55];
   if(x>173&&x<215&&y>176&&y<214)rgb=[113,119,126]; // portrait zone
  }
  if(paper&&x>=35&&x<=209&&y>=20&&y<=346){
   rgb=[247,247,246];if(x>50&&x<198&&y%25<3)rgb=[75,82,90];
  }
  const i=(y*W+x)*4;data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
 }
 return {width:W,height:H,data,getContext:()=>({getImageData:()=>({data})})};
}
const src=sourceImage(),backup=src.data.slice(),detected=win.DocFixStackedBluePair.detect(src);
assert.equal(detected?.cards?.length,2,'two stacked blue cards must yield TWO separate previews');
assert.equal(detected.provisional,true,'candidate split is not a verified physical contour');
assert.ok(detected.cards.every(c=>c.physicallyVerified===false&&c.needsReview===true));
const [a,b]=detected.cards.map(c=>box(c.quad));
assert.ok(a.x0<=20&&a.x1>=218&&a.y0<=18&&a.y1>=142,'full top TS/CF must be inside');
assert.ok(b.x0<=12&&b.x1>=227&&b.y0<=158&&b.y1>=294,'CIE back full MRZ and rounded corners inside');
assert.ok(a.y1<b.y0,'individual previews cannot consume each other across seam');
assert.deepEqual(src.data,backup,'original photograph pixels never modified');
for(const sample of ['single','empty']){
 const out=win.DocFixStackedBluePair.detect(sourceImage({type:sample}));
 assert.equal(out,null,'single card and empty textile cannot be split: '+sample);
}
assert.equal(win.DocFixStackedBluePair.detect(sourceImage({type:'single',paper:true})),null,
 'A4 paper with print cannot become two ID-1 cards');
assert.ok(html.includes('window.DocFixStackedBluePair?.detect?.(original)'));
assert.ok(html.includes('if(uncertainPair){'));
assert.ok(html.includes('fixed.manualPending=true;fixed.cropVerified=false;'));
assert.ok(html.includes('manualPending:true,cropVerified:false')||html.includes('manualPending:true,visualProvisional:true'));
assert.ok(html.includes('entries.some(e=>e.manualPending===true)'),'PDF export must be locked on unconfirmed source crops');
console.log('PASS: 2 blue TS/CIE cards on dark textile, independent safe previews, MRZ preserved, single/A4 unchanged, review-only export');