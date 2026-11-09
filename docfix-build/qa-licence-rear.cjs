'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'app/card-licence-rear.js'),'utf8');
const win={};
vm.runInNewContext(src,{window:win,Math,Uint8Array,Int32Array,Number,Array});
const api=win.DocFixLicenceRear;
function photo(w,h,type='licence'){
 const d=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const inside=x>=120&&x<=510&&y>=120&&y<=366;
  let r=211,g=209,b=206;
  if(y%49===0&&x>19&&x<w-22){r=88;g=90;b=91;}
  if(inside){
   if(type==='licence'){r=188;g=128;b=147;}
   else if(type==='cie'){r=160;g=197;b=216;}
   else if(type==='neutral'){r=205;g=204;b=199;}
   if(type==='licence'&&x>=150&&x<=470&&y%39===0){r=59;g=53;b=57;}
  }
  const k=(y*w+x)*4;d[k]=r;d[k+1]=g;d[k+2]=b;d[k+3]=255;
 }
 return d;
}
const w=700,h=500,source=photo(w,h),before=source.slice();
const result=api.analyzeRGBA(source,w,h);
assert.equal(result?.status,'found','the pale rose licence on a printed paper sheet must be found');
assert.equal(result.physicallyVerified,false,'colour evidence alone must not certify four physical borders');
assert.equal(result.needsReview,true,'automatically warn that edges require review');
assert.ok(result.quad[0].x<.17&&result.quad[1].x>.73,'licence long edges retained');
assert.ok(result.quad[0].y<.24&&result.quad[2].y>.72,'licence short edges retained');
assert.deepEqual(source,before,'never modify original pixels');
assert.equal(api.analyzeRGBA(photo(w,h,'cie'),w,h),null,'CIE must remain on the proven blue detector');
// Regression: a skin-coloured portrait can be a complete ISO-shaped pink island
// within the cyan plastic of an upright CIE. It must NOT become a driving licence.
const face=photo(w,h,'neutral');
for(let y=34;y<466;y++)for(let x=200;x<479;x++){
 const k=(y*w+x)*4;face[k]=153;face[k+1]=187;face[k+2]=211;
}
for(let y=95;y<410;y++)for(let x=241;x<431;x++){
 const k=(y*w+x)*4;face[k]=191;face[k+1]=139;face[k+2]=122;
}
assert.equal(api.analyzeRGBA(face,w,h),null,'skin island inside larger cyan identity card must never be cropped');
assert.equal(api.analyzeRGBA(photo(w,h,'neutral'),w,h),null,'do not crop plain A4 paper');
assert.equal(api.analyzeRGBA(new Uint8ClampedArray(60*80*4),60,80),null,'reject undersized photos');
const original={width:w,height:h,getContext:()=>({getImageData:()=>({data:source})})};
win.DocFixScanner={resize:()=>original,validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)};
const normal=api.detect(original);
assert.equal(normal?.status,'found');
win.DocFixLicenceGuard={polishQuad:q=>({verified:true,quad:q.map(p=>({x:.5+(p.x-.5)*.91,y:.5+(p.y-.5)*.91}))})};
const rejected=api.detect(original);
assert.equal(rejected.physicallyVerified,false,'inner licence print must not certify an inward crop');
assert.equal(rejected.needsReview,true,'unverified inner border still requires inspection');
win.DocFixLicenceGuard={polishQuad:q=>({verified:true,quad:q.map(p=>({x:.5+(p.x-.5)*1.02,y:.5+(p.y-.5)*1.02}))})};
const accepted=api.detect(original);
assert.equal(accepted.physicallyVerified,true,'verified enclosing four edges can be accepted');
win.DocFixLicenceGuard=null;
assert.equal(original.width,w,'original must not be released');
const scratch={width:w,height:h,getContext:original.getContext};
win.DocFixScanner.resize=()=>scratch;
api.detect(original);
assert.equal(scratch.width,1,'temporary canvas must be freed');
assert.equal(original.width,w,'original must survive scratch cleanup');
const broken={width:w,height:h,getContext:()=>({getImageData:()=>{throw Error('synthetic canvas readback fault')}})};
win.DocFixScanner.resize=()=>broken;
assert.throws(()=>api.detect(original),/synthetic canvas readback fault/);
assert.equal(broken.width,1,'scratch must be freed after pixel readback throws');
const index=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
assert.ok(index.includes('card-licence-rear.js'),'licence module must be loaded');
assert.ok(index.includes("singleCropGate(original,onPaper,'blue')")&&index.includes("singleCropGate(original,licenceRear,'licence')"),'whole blue CIE must take precedence over rose skin detector');
assert.ok(index.includes("if(cardLikely&&kind==='generic')"),'no second blue-card trim on licence');
assert.ok(index.includes('if(tightCard&&area<.86)'),'card-shaped original cannot be recropped at a portrait');
assert.ok(index.includes("return fail('inner','Area colorata troppo piccola")&&index.includes("return fail('inner','Possibile cornice interna"),'small unverified portrait crops must be rejected');
assert.ok(index.includes('let mrz=cardEvidence&&!norm.licenceRear?'),'licence reverse must not claim a CIE MRZ');
assert.ok(index.includes("cropVerified:norm.overPaper?norm.physicallyVerified:undefined"),'unverified licence must be flagged in preview');
console.log('DocFix licence reverse PASS: paper background, CIE regression, canvas cleanup and integration');