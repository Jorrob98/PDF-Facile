'use strict';
// Offline photo-glare regression: synthetic material only, original RGBA untouched.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'app/card-texture-crop.js'),'utf8');
const window={};
vm.runInNewContext(code,{window,Math,Uint8Array,Uint16Array,Uint32Array,Int32Array,
 Uint8ClampedArray,Float32Array,Float64Array});
const engine=window.DocFixRealCrop,w=400,h=600;
function fixture(kind){
 const rgba=new Uint8ClampedArray(w*h*4);
 const card=kind!=='empty-glare'&&kind!=='empty'&&kind!=='horizontal-line';
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const bg=45+8*x/w+8*y/h;
  let rgb=[bg,bg+1,bg+2];
  if(card&&x>=105&&x<295&&y>=170&&y<290)rgb=[197,211,214];
  if(kind==='glare-bottom'&&y>h*.48&&y<h*.50)rgb=rgb.map(v=>Math.min(255,v+115));
  if(kind==='glare-middle'&&y>h*.37&&y<h*.39)rgb=rgb.map(v=>Math.min(255,v+115));
  if(kind==='empty-glare'&&y>h*.48&&y<h*.50)rgb=rgb.map(v=>Math.min(255,v+115));
  if(kind==='horizontal-line'&&y>h*.48&&y<h*.50)rgb=[230,231,235];
  const k=(y*w+x)*4;rgba[k]=rgb[0];rgba[k+1]=rgb[1];rgba[k+2]=rgb[2];rgba[k+3]=255;
 }
 return rgba;
}
for(const [kind,expected] of [
 ['normal',1],['glare-bottom',1],['glare-middle',1],
 ['empty',0],['empty-glare',0],['horizontal-line',0]
]){
 const src=fixture(kind),before=src.slice(),result=engine.analyzeRGBA(src,w,h);
 assert.deepEqual(src,before,'glare repair must never alter source pixels: '+kind);
 assert.equal(result.cards.length,expected,'wrong number of cards: '+kind);
 for(const c of result.cards){
  assert.ok(c.quad.length===4,'a crop requires four corners');
  assert.ok(c.quad.every(p=>p.x>=.008&&p.x<=.992&&p.y>=.008&&p.y<=.992),
   'glare must never create an out-of-frame crop');
 }
}
console.log('DocFix glare PASS: bottom/middle stripes recovered; empty/line no false crops; pixels unchanged');
