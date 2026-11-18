'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const autoSrc=fs.readFileSync(path.join(__dirname,'app/card-auto-quad-consensus.js'),'utf8');
const precisionSrc=fs.readFileSync(path.join(__dirname,'app/card-precision-editor.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const W=900,H=650,area=q=>Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
const validQuad=q=>Array.isArray(q)&&q.length===4&&q.every(p=>p.x>.001&&p.x<.999&&p.y>.001&&p.y<.999)&&area(q)>.01;
const win={DocFixScanner:{validQuad}};
const env={window:win,Math,console,Float32Array,Uint8ClampedArray,Uint8Array};
vm.runInNewContext(precisionSrc,env);
vm.runInNewContext(autoSrc,env);
const robust=win.DocFixAutoQuadConsensus;
const rough=[[94,99],[801,99],[801,547],[94,547]].map(([x,y])=>({x:x/W,y:y/H}));
const pixels=new Uint8ClampedArray(W*H*4);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 let rgb=[142,138,136];
 if(x>=100&&x<=794&&y>=105&&y<=540){
  rgb=[180,214,221];
  if(y>440&&y<485&&x>175&&x<715&&x%8<4)rgb=[29,44,53];
  if(y>496&&y<525&&x>180&&x<720&&x%16<11)rgb=[52,64,73];
 }
 const k=(y*W+x)*4;for(let c=0;c<3;c++)pixels[k+c]=rgb[c];pixels[k+3]=255;
}
const original={width:W,height:H,getContext:()=>({getImageData:()=>({data:pixels})})};
const before=pixels.slice();
const actual=robust.refine(original,rough);
assert.ok(actual?.quad,'four real edges should converge to one consensus');
assert.equal(actual.physicallyVerified,false);
assert.equal(actual.needsReview,true);
assert.ok(actual.agreement>=2&&actual.matchedSides===4);
const pts=actual.quad.map(p=>({x:p.x*W,y:p.y*H}));
const expected=[[100,105],[795,105],[795,540],[100,540]];
for(let i=0;i<4;i++){
 const error=Math.hypot(pts[i].x-expected[i][0],pts[i].y-expected[i][1]);
 assert.ok(error<9,'precision must be within nine source pixels on synthetic border: '+i+' error '+error.toFixed(1));
}
assert.deepEqual(pixels,before,'automatic consensus is read-only');
// Suppress one of the physical sides: cannot claim four-edge agreement.
const ink=win.DocFixPrecisionEditor.snap;
win.DocFixPrecisionEditor={snap:()=>({quad:rough,matchedSides:3})};
assert.equal(robust.refine(original,rough),null,'three sides cannot establish automatic consensus');
// Independent hypotheses with incompatible corners must be rejected.
let count=0;
win.DocFixPrecisionEditor={snap:()=>{
 count++;const q=rough.map(p=>({...p}));
 const offset=count%2?.026:-.026;
 for(const p of q)p.x+=offset;
 return {quad:q,matchedSides:4};
}};
assert.equal(robust.refine(original,rough),null,'inconsistent fits are never applied');
win.DocFixPrecisionEditor={snap:ink};
assert.equal(robust.refine(original,[{x:.1,y:.1},{x:.3,y:.1},{x:.3,y:.3},{x:.1,y:.3}]),null,
 'wrong aspect ratio / insufficient card extent rejected');
assert.ok(html.includes('window.DocFixAutoQuadConsensus?.refine?.(original,candidate.quad)'));
assert.ok(html.includes('const finalFit=fitted?.quad?fitted:consensus?.quad?consensus:null;'),
 'prior confirmed deskew has precedence');
assert.ok(html.includes('sourceQuad=quad.map(p=>({...p}))'),'source geometry remains editable');
assert.ok(html.includes('review=true;previewOnly=true;'),'automated proposal remains review-only');
assert.ok(html.includes("entries.some(e=>e.manualPending===true)"),'unconfirmed PDF cannot export');
console.log('PASS: four-border automatic consensus on realistic MRZ/barcode synthetic source, pixel error <9, no mutation, conflicting fits rejected, PDF guarded');
