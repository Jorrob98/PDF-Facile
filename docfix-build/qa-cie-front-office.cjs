'use strict';
// Synthetic scene reproduces the geometry and colours of the failing 1.9.43
// CIE FRONT photograph: warm office worktop, dark scanner edge above, blue
// material with portrait and yellow emblem. No identity details or real photo.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'app/docfix-visual-card.js'),'utf8');
const W=420,H=314;
function image({card=true,logo=false,portraitOnly=false}={}){
 const data=new Uint8ClampedArray(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let rgb=[215,201,185];
  if(y>=58&&y<74)rgb=[73,67,66];
  if(y>=74&&y<90)rgb=[165,149,134];
  if(card&&x>=36&&x<346&&y>=94&&y<288){
   rgb=[178,212,218]; // actual CIE plastic, not the office desk
   if((x*19+y*17)%31<4)rgb=[175,203,206];
   if(y>117&&y<269&&x>100&&x<330&&y%14<4&&x%13<9)rgb=[67,87,102]; // text
   if(x>252&&x<309&&y>125&&y<177)rgb=[224,191,123]; // yellow emblem, interior
   if(x>57&&x<145&&y>162&&y<265)
    rgb=[94+(x*3+y*5)%40,105+(x*11+y*7)%45,114+(x*7+y*9)%48]; // portrait
  }
  if(logo&&x>=5&&x<57&&y>=10&&y<45)rgb=[74,145,197];
  if(portraitOnly&&x>=110&&x<210&&y>=94&&y<236)
   rgb=[98+(x*7+y*9)%38,110+(x*11+y*5)%43,116+(x*13+y*3)%44];
  const k=(y*W+x)*4;data[k]=rgb[0];data[k+1]=rgb[1];data[k+2]=rgb[2];data[k+3]=255;
 }
 return {width:W,height:H,data,getContext:()=>({getImageData:()=>({data})})};
}
const source=image({logo:true}),backup=source.data.slice();
const win={DocFixScanner:{
 resize:c=>c,validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>
 Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>.001&&p.x<.999&&p.y>.001&&p.y<.999)
}};
vm.runInNewContext(src,{window:win,Math,console,Uint8Array,Uint8ClampedArray,Uint32Array,Int32Array,Float32Array});
const cardModule=win.DocFixVisualCard;
assert.equal(typeof cardModule.cyanSilhouetteRGBA,'function','new cyan material fallback is exported');
const found=cardModule.cyanSilhouetteRGBA(source.data,W,H);
assert.ok(found?.quad,'blue plastic needs a proposed outline even with scanner shadows');
assert.equal(found.physicallyVerified,false,'photographic colour cannot certify four physical borders');
assert.equal(found.needsReview,true,'operator must confirm four corners');
const x0=found.quad[0].x*W,y0=found.quad[0].y*H;
const x1=found.quad[2].x*W,y1=found.quad[2].y*H;
assert.ok(x0<=42&&x0>=20&&x1>=340&&x1<=358,'both external card edges and portrait preserved');
assert.ok(y0<=100&&y0>=78&&y1>=285&&y1<=304,'desk edge above must not be card upper border');
assert.ok((x1-x0)/(y1-y0)>1.43&& (x1-x0)/(y1-y0)<1.82);
assert.deepEqual(source.data,backup,'source never modified');
const endToEnd=cardModule.detect(source);
assert.ok(endToEnd?.quad,'visual detector must actually present a card preview');
assert.ok(endToEnd.quad[0].y>.20,'must exclude horizontal scanner edge at 58px');
assert.ok(endToEnd.quad[0].x<.18,'must not crop off portrait');
assert.equal(endToEnd.physicallyVerified,false);
assert.equal(cardModule.cyanSilhouetteRGBA(image({card:false,logo:true}).data,W,H),null,
 'desk edge and blue logo are not a card');
assert.equal(cardModule.cyanSilhouetteRGBA(image({card:false,portraitOnly:true}).data,W,H),null,
 'a face-sized interior photograph is not a whole card');
console.log('PASS: CIE front on warm desk with dark scanner line, 4 plastic sides included, portrait preserved, false panel/logo rejected, review-only');
