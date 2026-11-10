'use strict';
// Synthetic tests: no customer scans or identifying data stored in repository.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'app/card-licence-finish.js'),'utf8');
const win={};
let lastRoi=null;
const fakeDocument={createElement(){lastRoi={width:1,height:1,
 getContext:()=>({drawImage(){},translate(){},rotate(){},
  getImageData:()=>({data:source})})};return lastRoi;}};
vm.runInNewContext(script,{window:win,document:fakeDocument,Math,Uint8Array,Number,Array,console});
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
 process:(src,state)=>{passes++;assert.strictEqual(src,mock);assert.equal(state.crop,true);return {width:675,height:420}}};
assert.equal(api.isLicenceMaterial(mock),true,'rose licence must enter photo finishing path');
assert.equal(api.correct(mock).applied,true);assert.equal(passes,1,'only one perspective warp');
assert.equal(mock.width,w,'original canvas is never freed');
const rough=[{x:.02,y:.02},{x:.98,y:.02},{x:.98,y:.98},{x:.02,y:.98}];
const refined=api.refineOriginal(mock,rough);
assert.equal(refined?.verified,true,'four outer edges must be found on original image before any crop');
assert.equal(refined?.quad.length,4,'return four normalized ORIGINAL-image coordinates');
assert.equal(passes,1,'source refinement only estimates corners: no extra resampling');
assert.equal(lastRoi.width,1,'source-refinement temporary ROI must be freed');
assert.equal(mock.width,w,'the untouched source survives source-first refinement');

// An incomplete outer perimeter can resemble a safe rectangle; never
// silently crop it, even when the rose material occupies most of the image.
const threeSide=source.slice();
for(let y=0;y<h;y++)for(let x=w-14;x<w;x++){
 const k=(y*w+x)*4;threeSide[k]=183;threeSide[k+1]=132;threeSide[k+2]=146;
}
const partialSource={width:w,height:h,getContext:()=>({getImageData:()=>({data:threeSide})})};
win.DocFixScanner.resize=()=>partialSource;
const partial=api.correct(partialSource);
assert.equal(partial.applied,false,'a missing outer side must never launch a destructive crop');
assert.strictEqual(partial.canvas,partialSource,'the original must remain intact with incomplete edges');
assert.equal(partialSource.width,w,'never free a rejected input canvas');
assert.equal(passes,1,'a 3-side candidate must not request an extra perspective warp');
// A failed output must release its temporary canvas, not its original.
win.DocFixScanner.resize=()=>mock;
let rejected=null;
win.DocFixScanner.process=()=>{rejected={width:120,height:90};return rejected};
const invalid=api.correct(mock);
assert.equal(invalid.applied,false,'invalid corrected geometry is rejected');
assert.strictEqual(invalid.canvas,mock);
assert.equal(rejected.width,1,'invalid temporary canvas must be freed');
assert.equal(mock.width,w,'the uploaded source must survive failed correction');
win.DocFixScanner.process=()=>mock;
const accidentalSource=api.correct(mock);
assert.equal(accidentalSource.applied,false,'scanner must not accept returning the input as a correction');
assert.equal(mock.width,w,'rejecting alias result must not dispose uploaded image');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
assert.ok(html.includes('card-licence-finish.js'),'module included');
assert.ok(html.includes("cardKind==='licence'?window.DocFixLicenceFinish?.correct?.(processed)"),'multi-card integration');
assert.ok(html.includes("const licenceFinish=possibleLicence?window.DocFixLicenceFinish?.correct?.(processed)"),'already-cropped WhatsApp photo must reach the same physical engine');
assert.ok(html.includes("if(multiSafe&&sourceVerified&&cardKind!=='licence')"),'pink colour bounding boxes may not claim four physical licence corners');
assert.ok(html.includes("refineOriginal?.(original,sourceQuad"),'licence must locate physical corners on untouched source first');
assert.ok(html.includes("cardKind==='licence'&&!physicalVerified"),'verified source geometry may not be warped a second time');
assert.ok(html.includes("quad=expandQuadSafe(sourceQuad,.105)"),'source photo retains a safe margin until four actual edges are tested');
assert.ok(html.includes("const quad=kind==='licence'?expandQuadSafe(found.quad,.055)"),'standalone licence retains physical border for final alignment');
assert.ok(html.includes("const deskew=licenceFinish?.applied?"),'never rotate twice');
assert.ok(html.includes("sourceQuad:licenceFinish?.applied?null:quad"),'manual correction never reuses stale pre-deskew coordinates');
assert.ok(html.includes("if(c.geometryReview&&fixed.cropVerified!==true)"),'verified four-edge recovery must not retain obsolete geometry warning');
console.log('DocFix licence exterior PASS: 2.8-degree synthetic skew, 4 borders, no portrait, no source damage, one warp');
