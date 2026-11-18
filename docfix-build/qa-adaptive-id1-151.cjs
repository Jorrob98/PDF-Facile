'use strict';
// Only synthetic fixtures. Real office CIE photos remain LOCAL and PRIVATE.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'app/docfix-adaptive-id1.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const win={DocFixScanner:{
 resize:c=>c,
 validQuad:q=>Array.isArray(q)&&q.length===4&&
  q.every(p=>p.x>.001&&p.x<.999&&p.y>.001&&p.y<.999)
}};
vm.runInNewContext(src,{window:win,Math,console,Uint8Array,Uint32Array,Int32Array,Float32Array});
const W=800,H=600;
function photo(mode='card'){
 const d=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const k=(y*W+x)*4,gradient=Math.floor(230-y*.14+x*.012);
  let r=gradient,g=gradient-6,b=gradient-12;
  const card=mode==='card'&&x>=99&&x<=655&&y>=146&&y<=496;
  const paper=mode==='paper'&&x>=146&&x<=648&&y>=53&&y<=553;
  if(card){
   r=166+y*.027;g=191+y*.017;b=198+y*.016;
   if(y>300&&y<365&&x>145&&x<600&&x%8<5){r=30;g=42;b=45;}
   if(y>400&&y<468&&x>145&&x<615&&(y%17<4||x%26<5)){r=55;g=57;b=62;}
  }
  if(paper){r=247;g=246;b=245;if(x>190&&x<608&&y%28<3){r=70;g=70;b=70;}}
  d[k]=r;d[k+1]=g;d[k+2]=b;d[k+3]=255;
 }
 return {data:d,width:W,height:H,getContext:()=>({getImageData:()=>({data:d})})};
}
const image=photo();
const original=image.data.slice();
const detected=win.DocFixAdaptiveID1.detect(image);
assert.ok(detected?.quad,'light desk ID-1 should be found by local background');
const q=detected.quad.map(p=>({x:p.x*W,y:p.y*H}));
assert.ok(q[0].x<=99&&q[0].x>=60,'left plastic cannot be clipped');
assert.ok(q[1].x>=655&&q[1].x<730,'right plastic cannot be clipped');
assert.ok(q[0].y<=146&&q[0].y>95,'top plastic cannot be clipped');
assert.ok(q[2].y>=496&&q[2].y<560,'bottom / MRZ cannot be clipped');
assert.ok((q[1].x-q[0].x)*(q[2].y-q[1].y)/(W*H)<.67,'must exclude substantial desk');
assert.ok(detected.needsReview&&detected.physicallyVerified===false,
 'three direct edges plus geometric inference can NEVER auto-certify a crop');
assert.deepEqual(image.data,original,'uploaded original is unchanged');
assert.equal(win.DocFixAdaptiveID1.detect(photo('empty')),null,'plain desk is not a document');
assert.equal(win.DocFixAdaptiveID1.detect(photo('paper')),null,'A4 declaration cannot become CIE');
assert.ok(html.includes("window.DocFixAdaptiveID1?.detect?.(original)"));
assert.ok(html.includes("candidate.method==='adaptive-background-id1-3-edge-provisional'"));
assert.ok(html.includes("manualPending:true,visualProvisional:true"));
assert.ok(html.includes("entries.some(e=>e.manualPending===true)"),
 'no PDF export for an uncertain photographed card');
console.log('PASS: background-adaptive ID1 automatic proposal retains all plastic and MRZ, rejects desk/A4, keeps original and manual PDF safety');
