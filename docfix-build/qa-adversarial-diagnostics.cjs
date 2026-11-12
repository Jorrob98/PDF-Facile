'use strict';
// DocFix adversarial offline regression: synthetic shapes only, no customer files.
// Run: node qa-adversarial-diagnostics.cjs
// Optional release gate: node qa-adversarial-diagnostics.cjs --strict
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
function load(file,key) {
 const window={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'app',file),'utf8'),
  {window,Math,Number,Array,Uint8Array,Uint16Array,Uint32Array,Int32Array,Uint8ClampedArray,
   Float32Array,Float64Array,console});
 return window[key];
}
const cards=load('card-texture-crop.js','DocFixRealCrop');
const pages=load('document-page-guard.js','DocFixPageGuard');
let seed=140217;
function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function cardPixels(w,h,boxes,opts={}){
 const out=new Uint8ClampedArray(w*h*4);
 const bg=opts.bg??45,noise=opts.noise??0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=(random()-.5)*noise,b=bg+8*x/w+8*y/h+n;
  let rgb=[b,b+1,b+2];
  for(let j=0;j<boxes.length;j++){
   const [bx,by,bw,bh,deg]=boxes[j],a=deg*Math.PI/180;
   const xx=x-bx-bw/2,yy=y-by-bh/2;
   const u=xx*Math.cos(a)+yy*Math.sin(a)+bw/2;
   const v=-xx*Math.sin(a)+yy*Math.cos(a)+bh/2;
   if(u>=0&&u<bw&&v>=0&&v<bh)rgb=opts.low?[74,77,83]:j%2?[102,169,201]:[197,211,214];
  }
  if(opts.glare&&y>h*.48&&y<h*.5)rgb=rgb.map(v=>Math.min(255,v+115));
  if(opts.shadow&&x>w*.48&&y>h*.40)rgb=rgb.map(v=>v*.51);
  const p=(y*w+x)*4;
  out[p]=rgb[0];out[p+1]=rgb[1];out[p+2]=rgb[2];out[p+3]=255;
 }
 return out;
}
const cases=[
 ['single-landscape',[[105,115,195,125,0]]],
 ['single-portrait',[[140,120,120,190,0]]],
 ['pair-stacked',[[105,60,190,120,0],[105,370,190,120,0]]],
 ['pair-sideways',[[10,190,170,105,0],[220,190,170,105,0]]],
 ['single-angle-5',[[105,140,195,125,5]]],
 ['pair-angle-8',[[95,65,205,130,-8],[100,360,200,130,8]]],
 ['single-angle-13',[[100,160,200,126,13]]],
 ['single-angle-30',[[100,170,200,126,30]]],
 ['touch-left-edge',[[0,160,200,126,0]]],
 ['touch-top-edge',[[105,0,200,126,0]]],
 ['pair-one-touch-edge',[[105,0,190,120,0],[105,330,190,120,0]]],
 ['pair-near-touch',[[105,170,190,120,0],[105,295,190,120,0]]],
 ['pair-overlap',[[100,160,190,120,0],[120,230,190,120,0]]],
 ['empty',[]],['empty-noisy',[],{noise:16}],
 ['low-contrast',[[105,170,190,120,0]],{low:true}],
 ['hard-shadow',[[105,170,190,120,0]],{shadow:true}],
 ['glare',[[105,170,190,120,0]],{glare:true}]
];
for(let k=0;k<32;k++){
 const n=k%8===0?0:k%3===0?2:1,angle=[0,2,5,8,12,16,22,-7][k%8];
 const near=k%11===0;
 const boxes=Array.from({length:n},(_,j)=>[near?0:75,j===0?(n===2?60:170):275,150,95,j===0?angle:-angle]);
 cases.push(['fuzz-'+k,boxes,{w:300,h:450,bg:[45,80,145,225][k%4],noise:[0,5,17,28][k%4],low:k%7===0,glare:k%9===0}]);
}
let correct=0,missed=0,excess=0,invalid=0;
const failures=[];
for(const [label,boxes,opt={}] of cases){
 const w=opt.w||400,h=opt.h||600,p=cardPixels(w,h,boxes,opt),before=p.slice();
 const answer=cards.analyzeRGBA(p,w,h),found=answer.cards.length;
 if(found===boxes.length)correct++;
 else if(found<boxes.length)missed++;else excess++;
 if(found!==boxes.length)failures.push({case:label,expected:boxes.length,found});
 if(answer.cards.some(c=>!Array.isArray(c.quad)||c.quad.length!==4||
    c.quad.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y)||q.x<0||q.x>1||q.y<0||q.y>1)))invalid++;
 assert.deepEqual(p,before,'source pixels modified for '+label);
}
function pagePixels(bg,rects=[],lines=false,cardText=false){
 const w=400,h=560,d=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let v=[bg,bg,bg],card=null;
  for(const [bx,by,bw,bh,rgb] of rects){
   if(x>=bx&&x<bx+bw&&y>=by&&y<by+bh){v=rgb;card={bx,bw};}
  }
  if(cardText&&card&&y%24<3&&x>card.bx+card.bw*.16&&x<card.bx+card.bw*.78)
   v=[43,49,55];
  if(lines&&y>=70&&y<=490&&(y%28)<2&&x>45&&x<345)v=[35,35,35];
  let k=(y*w+x)*4;d[k]=v[0];d[k+1]=v[1];d[k+2]=v[2];d[k+3]=255;
 }return d;
}
const a4Cases=[
 ['printed-page',250,[],true,true],
 // Blank paper is visually indistinguishable from an empty white surface.
 // Report as ambiguous; explicit page mode preserves it without guessing.
 ['blank-page',250,[],false,null],
 ['gray-page',193,[],true,true],
 ['dark-photocopy',165,[],true,true],
 ['two-cards-bright',250,[[95,60,195,125,[180,210,211]],[95,330,195,125,[118,160,202]]],false,false],
 ['two-cards-gray',150,[[95,60,195,125,[180,210,211]],[95,330,195,125,[118,160,202]]],false,false],
 ['light-card-on-white',252,[[90,180,195,126,[224,226,230]]],false,false],
 ['dark-card-on-white',252,[[90,180,195,126,[100,130,169]]],false,false],
 ['small-pair-on-white',252,[[100,100,140,80,[180,210,211]],[100,270,140,80,[115,150,210]]],false,false],
 ['empty-white-surface',255,[],false,false],
 ['empty-gray-surface',170,[],false,false],
 ['two-printed-cards-stacked',252,
  [[95,60,195,125,[220,230,238]],[95,330,195,125,[220,230,238]]],false,false,true],
 ['two-printed-cards-sideways',252,
  [[10,210,170,105,[220,230,238]],[220,210,170,105,[220,230,238]]],false,false,true]
];
let pageCorrect=0;
const pageFailures=[],pageAmbiguous=[];
for(const [label,bg,rects,lines,expected,cardText] of a4Cases){
 const outcome=pages.analyzeRGBA(pagePixels(bg,rects,lines,cardText),400,560).page;
 if(expected===null){pageAmbiguous.push({case:label,detected:outcome});continue;}
 if(outcome===expected)pageCorrect++;
 else pageFailures.push({case:label,expected,detected:outcome});
}
console.log(JSON.stringify({detector:{correct,total:cases.length,missed,excess,invalid,failures},pageGuard:{correct:pageCorrect,total:a4Cases.length-pageAmbiguous.length,ambiguous:pageAmbiguous,failures:pageFailures}},null,2));
assert.equal(excess,0,'the detector invented extra documents');
assert.equal(invalid,0,'an unsafe crop quadrilateral was produced');
assert.equal(pageAmbiguous.length,1,'exactly one indeterminate blank-page fixture');
assert.equal(pageAmbiguous[0].detected,false,'featureless white surface must not be labelled confirmed A4');
if(process.argv.includes('--strict')){
 assert.ok(correct/cases.length>=.90,'card detection below 90% release gate');
 assert.equal(pageFailures.length,0,'A4 false classification blocks release');
}
