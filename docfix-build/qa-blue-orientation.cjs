'use strict';
// No personal information: synthetic blue and neutral cards only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const js=fs.readFileSync(path.join(__dirname,'app/card-blue-orientation.js'),'utf8');
let input=null;
const scan={resize:c=>c};
const win={DocFixScanner:scan};vm.runInNewContext(js,{window:win,Math,Uint8Array,Array});
const api=win.DocFixBlueCardOrientation;
function card({blue=true,darkAt='top'}={}){
 const w=360,h=210,d=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let rgb=blue?[73,154,211]:[220,213,206]; // RGB
  if(darkAt==='top'&&y<h*.15||darkAt==='bottom'&&y>=h*.85)rgb=[43,46,63];
  const k=(y*w+x)*4;d[k]=rgb[0];d[k+1]=rgb[1];d[k+2]=rgb[2];d[k+3]=255;
 }
 return {width:w,height:h,getContext:()=>({getImageData:()=>({data:d})})};
}
const a=card({darkAt:'top'}),b=card({darkAt:'bottom'}),c=card({blue:false,darkAt:'bottom'});
assert.equal(api.decide(a).angle,0);
assert.equal(api.decide(a).trustworthy,true,'upright printed strip can be verified');
assert.equal(api.decide(b).angle,180,'upside-down health card gets flipped');
assert.equal(api.decide(b).trustworthy,true);
assert.equal(api.decide(c).trustworthy,false,'neutral identity card cannot be flipped by health-card cue');
assert.equal(b.width,360,'orientation probe may not mutate the source');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
assert.ok(html.includes('card-blue-orientation.js'),'load order');
assert.ok(html.includes('conservativeSegment?window.DocFixBlueCardOrientation?.decide?.(processed)'),
 'this method MUST NOT change already proven cards');
console.log('DocFix blue orientation PASS: upright, upside down, neutral, read-only and limited fallback');
