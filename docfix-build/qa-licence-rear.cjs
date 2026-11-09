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
assert.equal(api.analyzeRGBA(photo(w,h,'neutral'),w,h),null,'do not crop plain A4 paper');
assert.equal(api.analyzeRGBA(new Uint8ClampedArray(60*80*4),60,80),null,'reject undersized photos');
const original={width:w,height:h,getContext:()=>({getImageData:()=>({data:source})})};
win.DocFixScanner={resize:()=>original,validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)};
const normal=api.detect(original);
assert.equal(normal?.status,'found');
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
assert.ok(index.includes('const found=licenceRear||onPaper||scan.detectDocument(original)'),'licence back must get priority over paper');
assert.ok(index.includes('if(cardLikely&&!onPaper&&!licenceRear)'),'no second blue-card trim on licence');
assert.ok(index.includes('let mrz=cardEvidence&&!norm.licenceRear?'),'licence reverse must not claim a CIE MRZ');
assert.ok(index.includes("cropVerified:norm.overPaper?norm.physicallyVerified:undefined"),'unverified licence must be flagged in preview');
console.log('DocFix licence reverse PASS: paper background, CIE regression, canvas cleanup and integration');