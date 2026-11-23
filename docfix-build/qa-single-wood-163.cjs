'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=__dirname,mod=fs.readFileSync(path.join(root,'app/docfix-wood-single.js'),'utf8');
const html=fs.readFileSync(path.join(root,'app/index.html'),'utf8');
const review=fs.readFileSync(path.join(root,'app/docfix-qa-review.js'),'utf8');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
const document={createElement(tag){
 assert.equal(tag,'canvas');
 const canvas={width:1,height:1,source:null,getContext(){
  return {drawImage(source){canvas.source=source;},getImageData(){
   const d=new Uint8ClampedArray(canvas.width*canvas.height*4),o=canvas.source;
   for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const sx=Math.min(o.width-1,Math.floor(x*o.width/canvas.width));
    const sy=Math.min(o.height-1,Math.floor(y*o.height/canvas.height));
    const from=(sy*o.width+sx)*4,to=(y*canvas.width+x)*4;
    d[to]=o.rgba[from];d[to+1]=o.rgba[from+1];d[to+2]=o.rgba[from+2];d[to+3]=255;
   }return {data:d};
  }};
 }};
 return canvas;
}};
const win={};vm.runInNewContext(mod,{window:win,document,console,Math,Uint32Array,Uint8Array});
const detect=win.DocFixWoodSingle.detect;
function photo(w,h,wood=true){
 const bg=wood?[151,58,9]:[143,143,143],rgba=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<rgba.length;i+=4){rgba[i]=bg[0];rgba[i+1]=bg[1];rgba[i+2]=bg[2];rgba[i+3]=255;}
 return {width:w,height:h,rgba};
}
function card(im,x0,y0,x1,y1){
 const [w,p]=[im.width,im.rgba];
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const k=(y*w+x)*4;
  p[k]=222;p[k+1]=218;p[k+2]=204;
 }
 return im;
}
const front=card(photo(300,400),22,116,283,276);
const back=card(photo(300,400),16,110,290,281);
for(const [name,im] of [['front',front],['back',back]]){
 const out=detect(im);assert.ok(out?.strongSingle,name+' must be ONE ID1 document');
 assert.equal(out.cardCount,1);assert.equal(out.physicallyVerified,false);
 assert.equal(out.quad.length,4);
 assert.ok(out.diagnostic.ratio>1.35&&out.diagnostic.ratio<1.90);
 assert.ok(out.quad[0].x<out.quad[1].x&&out.quad[0].y<out.quad[3].y);
}
const stacked=photo(360,690);
card(stacked,50,95,306,252);card(stacked,50,365,306,522);
assert.equal(detect(stacked),null,'2 stacked physical documents must NOT be declared one');
const side=photo(800,430);card(side,70,125,368,316);card(side,432,125,730,316);
assert.equal(detect(side),null,'2 adjacent documents must NOT be declared one');
assert.equal(detect(card(photo(300,400,false),20,110,280,272)),null,'gray desk needs another detector');
assert.ok(html.indexOf('window.DocFixWoodSingle?.detect?.(original)')<html.indexOf('window.DocFixThreeUp?.detect?.(original)'),'single-card guard must run BEFORE splitters');
assert.ok(html.includes("splitCount:1,\n      twoUp:false,threeUp:false,visualProvisional:true"),'single candidate creates one page');
assert.ok(!review.includes("document.querySelector('#workspace .review-row')"),'incorrect top download control removed');
assert.ok(review.includes("document.querySelector('#workspace .advanced-options')"),'optional diagnostic download stays in PDF options');
assert.ok(main.includes('out.singleCardWood='),'real Electron self-test includes detector');
console.log('PASS: 2 distinct single CIE photographs -> 2 one-card proposals; reject double/gray; PDF diagnostic no longer above previews');
