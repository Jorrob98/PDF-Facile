'use strict';
// Source image pair detection tests. Synthetic cards only, never real IDs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'app/card-photo-pair.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const W=180,H=315;
const photo=(kind)=>{
 const data=new Uint8ClampedArray(W*H*4);
 const boxes=kind==='two'?[[34,67,120,68],[34,145,120,68]]
  :kind==='touching'?[[34,75,120,66],[34,143,120,66]]
  :kind==='single'?[[34,67,120,68]]
  :kind==='a4'?[[32,40,125,242]]
  :kind==='two-stripes'?[[34,68,120,26],[34,150,120,26]]:[];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let rgb=[38+x/W*11,39+x/W*10,40+x/W*9];
  for(const [bx,by,bw,bh] of boxes)if(x>=bx&&x<bx+bw&&y>=by&&y<by+bh){
   rgb=kind==='a4'?[230,231,232]:kind==='two-stripes'?[120,160,170]:[151,195,214];
   if(kind==='a4'&&y%21<3&&x>bx+10&&x<bx+bw-10)rgb=[47,47,47];
   if(kind==='single'&&y%13<2&&x>bx+15&&x<bx+bw-15)rgb=[32,34,38];
  }
  const k=(y*W+x)*4;
  data[k]=rgb[0];data[k+1]=rgb[1];data[k+2]=rgb[2];data[k+3]=255;
 }
 return {width:W,height:H,data,getContext:()=>({getImageData:()=>({data})})};
};
const geometry=(original,cards)=>{
 if(cards?.length!==2)return {ok:false};
 const b=cards.map(c=>{
  const q=c.quad;
  if(q.some(p=>p.x<0||p.x>1||p.y<0||p.y>1))return null;
  const width=(q[1].x-q[0].x)*original.width,height=(q[3].y-q[0].y)*original.height;
  if(width<28||height<28||width/height<1.32||width/height>2.05)return null;
  return {x0:q[0].x,y0:q[0].y,x1:q[2].x,y1:q[2].y};
 });
 if(b.some(x=>!x))return {ok:false};
 const overlap=Math.max(0,Math.min(b[0].x1,b[1].x1)-Math.max(b[0].x0,b[1].x0))*
  Math.max(0,Math.min(b[0].y1,b[1].y1)-Math.max(b[0].y0,b[1].y0));
 const area=x=>(x.x1-x.x0)*(x.y1-x.y0);
 return {ok:overlap/Math.min(...b.map(area))<.12};
};
const win={DocFixScanner:{resize:x=>x},DocFixPairProof:{geometry}};
vm.runInNewContext(src,{window:win,console,Math,Float32Array});
for(const kind of ['two','touching']){
 const p=photo(kind),saved=p.data.slice(),out=win.DocFixPhotoPair.detect(p);
 assert.equal(out?.cards?.length,2,'two separate document rectangles, '+kind);
 assert.equal(out?.verified,false,'these are unverified operator previews');
 assert.ok(out.cards.every(c=>c.physicallyVerified===false),'not authorized for PDF without confirmation');
 assert.deepEqual(p.data,saved,'do not touch original bytes');
 assert.ok(out.cards.every(c=>c.quad[0].x>.07&&c.quad[1].x<.96),
  'preview must crop the lateral photo background rather than preserve a full photo');
 assert.ok(out.cards.every(c=>c.quad[0].y>.10&&c.quad[2].y<.90),
  'preview must crop top and bottom photo background');
 assert.equal(geometry(p,out.cards).ok,true,'two rectangles must remain separate and card shaped');
}
for(const kind of ['single','a4','blank','two-stripes']){
 const image=photo(kind);
 assert.equal(win.DocFixPhotoPair.detect(image),null,'no invented two-card split on '+kind);
}
assert.ok(html.includes('<script src="./card-photo-pair.js"></script>'));
assert.ok(html.includes('const edgePair=window.DocFixPhotoPair?.detect?.(original)'));
assert.ok(html.includes('const photoPair=window.DocFixPhotoPair?.detect?.(old.original)'));
assert.ok(html.includes('else if(e.twoUp===true&&e.splitCount===2&&e.sourceQuad&&window.DocFixScanner.validQuad(e.sourceQuad))'),
 'two-card correction must start at its independently located corners');
assert.ok(html.includes('if(!e.geometryReview&&e.sourceQuad&&window.DocFixScanner.validQuad(e.sourceQuad))'),
 'A4 and single-ID editor must not preselect unverified geometry');
assert.ok(html.includes('fixed.manualPending=true;fixed.cropVerified=false;fixed.cropped=false;'));
assert.ok(html.includes('if(entries.some(e=>e.manualPending===true))'));
console.log('DocFix two cropped previews PASS: separated/touching pairs; A4/single/blank safe; original kept; editor and PDF gate');
