'use strict';
// Synthetic paper/card layouts only. No customer documents are stored in CI.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'app/document-page-guard.js'),'utf8');
const win={};vm.runInNewContext(code,{window:win,Math,Number,Uint16Array,Array,console});
const detector=win.DocFixPageGuard.analyzeRGBA,w=600,h=840;
function draw(kind){
 const p=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let color=[250,250,248];
  if(kind==='photo-page'&&(x<40||x>w-40||y<35||y>h-35))color=[43,46,44];
  if(kind==='dark-copy')color=[165,165,165];
  if(kind==='yellow-copy')color=[237,220,161];
  if(kind==='light-card-on-white'&&x>155&&x<460&&y>310&&y<535)color=[224,226,230];
  // Printed cards must not be confused with a document simply because
  // the pair has several ink/text bands on a pale background.
  if(kind==='two-text-cards'&&((y>=90&&y<290)||(y>=520&&y<720))&&x>=140&&x<455){
   color=[220,230,238];
   if(x>195&&x<380&&y%26<3)color=[43,49,55];
  }
  if(kind==='side-by-side-text-cards'&&y>=350&&y<490&&
     ((x>=45&&x<270)||(x>=325&&x<550))){
   color=[220,230,238];
   if(y%24<3)color=[43,49,55];
  }
  if(kind==='two-cards'){
   color=[51,52,49];
   if((y>90&&y<330||y>450&&y<705)&&x>70&&x<530)color=[228,229,223];
  }
  if((kind==='declaration'||kind==='photo-page'||kind==='dark-copy'||kind==='yellow-copy')&&y>105&&y<650&&y%34<3&&x>75&&x<475)
   color=[49,52,50];
  const k=(y*w+x)*4;
  p[k]=color[0];p[k+1]=color[1];p[k+2]=color[2];p[k+3]=255;
 }
 return p;
}
assert.equal(detector(draw('declaration'),w,h).page,true,'scanned A4 declaration remains one page');
assert.equal(detector(draw('photo-page'),w,h).page,true,'photographed A4 declaration remains one page');
assert.equal(detector(draw('two-cards'),w,h).page,false,'two ID cards on a dark desk are not declared A4');
assert.equal(detector(draw('two-text-cards'),w,h).page,false,
 'two printed cards stacked on a white desk are NOT a full A4 declaration');
assert.equal(detector(draw('side-by-side-text-cards'),w,h).page,false,
 'two printed cards side by side are NOT a full A4 declaration');
assert.equal(detector(draw('dark-copy'),w,h).page,true,'dark photocopy with ink bands is a complete page');
assert.equal(detector(draw('yellow-copy'),w,h).page,true,'warm-coloured printed A4 stays intact');
assert.equal(detector(draw('light-card-on-white'),w,h).page,false,'light ID on white must not be mistaken for A4');
assert.equal(detector(draw('blank'),w,h).page,false,'a featureless white surface is ambiguous in automatic mode');
assert.equal(detector(new Uint8ClampedArray(150*150*4),150,150).page,false,'tiny scans fail safely');
const index=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const start=index.indexOf('function twoByTwoCandidateMeta('),end=index.indexOf('function threeByTwoState(){',start);
assert.ok(start>0&&end>start,'candidate metadata check is present');
const types=new Function(index.slice(start,end)+';return twoByTwoCandidateMeta;')();
assert.equal(types([1,1],true,true),false,'two A4 photos in same portrait batch are NOT a four-card set');
assert.equal(types([2,1],true,true),true,'a positively detected two-card source remains eligible for safe recovery');
assert.equal(types([2,2],true,true),true,'already verified two by two set is unchanged');
const a=index.indexOf('function preserveFullA4Page('),b=index.indexOf('async function normalizeRaster(',a);
assert.ok(a>=0&&b>a);
const winPage={DocFixPageGuard:{detect:()=>({page:true})}};
const preserve=new Function('window','console',index.slice(a,b)+';return preserveFullA4Page;')(winPage,console);
const original={width:1200,height:1680};const kept=preserve(original);
assert.strictEqual(kept.processed,original);
assert.equal(kept.cropped,false);
assert.equal(kept.review,false);
assert.equal(kept.pageProtected,true);
assert.ok(index.includes('const completePage=skipPageGuard?null:preserveFullA4Page(original);'),
 'scanned PDF pages still use automatic A4 guard');
assert.ok(index.includes("mode==='cards'?null:preserveFullA4Page(original,mode==='page')"),
 'image uploads support automatic, explicit complete A4 page and card modes');
assert.ok(index.includes('documentMode:documentMode()'),'the selected mode is captured for each incoming batch');
assert.ok(index.includes('id="document-mode"'),'full-page override is available before adding files');
assert.ok(index.includes('if(oldIndex<0||!old?.original||old.pageProtected===true)return false;'),'no recovery split on declaration');
assert.ok(index.includes('const proof=window.DocFixPairProof?.verify?.(old.original,candidates);'),'previous gap-only split must require both external perimeters');
assert.ok(index.includes('if(proof?.verified!==true||proof.cards?.length!==2)return false;'),'unverified split is forbidden');
assert.ok(index.includes('document-page-guard.js'),'page guard must load before scanner processes images');
console.log('DocFix A4 regression PASS: declaration intact, two cards distinguishable, batch split prevented, both physical borders required');
