'use strict';
// Synthetic tests: no customer scans or identifying data stored in repository.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'app/card-licence-finish.js'),'utf8');
const win={};
vm.runInNewContext(script,{window:win,Math,Uint8Array,Number,Array,console});
const api=win.DocFixLicenceFinish,w=689,h=452;
function make(kind='rotated'){
 const a=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const top=33-x*.049,bottom=452-x*.049,left=-2+y*.048,right=668+y*.049;
  const interior=kind==='rotated'&&y>=top&&y<=bottom&&x>=left&&x<=right;
  const noRim=kind==='tight',small=kind==='portrait'&&x>200&&x<480&&y>110&&y<330;
  const filled=interior||noRim||small,k=4*(y*w+x);
  a[k]=filled?180:255;a[k+1]=filled?128:255;a[k+2]=filled?145:255;a[k+3]=255;
 }
 return a;
}
const source=make(),snapshot=source.slice(),found=api.analyzeRGBA(source,w,h);
assert.equal(found?.status,'found','recover a rotated real exterior');
assert.ok(Math.abs(found.angle+2.8)<.6,'align physical boundary, not printed categories');
assert.ok(found.quad[0].x<.03&&found.quad[1].x>.94,'full card width');
assert.ok(found.quad[0].y<.10&&found.quad[2].y>.90,'full card height');
assert.deepEqual(source,snapshot,'never modify the original');
assert.equal(api.analyzeRGBA(make('portrait'),w,h),null,'face-like internal island rejected');
assert.equal(api.analyzeRGBA(make('tight'),w,h),null,'already tight crop is not cut again');
assert.equal(api.analyzeRGBA(new Uint8ClampedArray(100*100*4),100,100),null);
const mock={width:w,height:h,getContext:()=>({getImageData:()=>({data:source})})};
let passes=0;
win.DocFixScanner={resize:()=>mock,validQuad:q=>q.length===4&&q.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1),
 process:(src,state)=>{assert.strictEqual(src,mock);assert.equal(state.crop,true);passes++;return {width:675,height:420}}};
assert.equal(api.correct(mock).applied,true);assert.equal(passes,1,'only one perspective warp');
assert.equal(mock.width,w,'original canvas is never freed');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
assert.ok(html.includes('card-licence-finish.js'),'module included');
assert.ok(html.includes("cardKind==='licence'?window.DocFixLicenceFinish?.correct?.(processed)"),'multi-card integration');
assert.ok(html.includes("const licenceFinish=possibleLicence?window.DocFixLicenceFinish?.correct?.(processed)"),'already-cropped WhatsApp photo must reach the same physical engine');
assert.ok(html.includes("if(multiSafe&&sourceVerified&&cardKind!=='licence')"),'pink colour bounding boxes may not claim four physical licence corners');
assert.ok(html.includes("quad=expandQuadSafe(sourceQuad,.105)"),'source photo retains a safe margin until four actual edges are tested');
assert.ok(html.includes("const quad=kind==='licence'?expandQuadSafe(found.quad,.055)"),'standalone licence retains physical border for final alignment');
assert.ok(html.includes("const deskew=licenceFinish?.applied?"),'never rotate twice');
console.log('DocFix licence exterior PASS: 2.8-degree synthetic skew, 4 borders, no portrait, no source damage, one warp');
