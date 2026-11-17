'use strict';
// Synthetic only: no personal identity images, identifiers or MRZ values.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const W=680,H=510;
const src=fs.readFileSync(path.join(__dirname,'app/docfix-texture-card.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const win={DocFixScanner:{resize:c=>c,validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1)}};
vm.runInNewContext(src,{window:win,Math,console,Float32Array,Int32Array,Uint8Array,Uint8ClampedArray});
function scene(type='front'){
 const data=new Uint8ClampedArray(W*H*4);let seed=917;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let r=222+7*random(),g=217+4*random(),b=206+3*random();
  const id=type==='front'||type==='back';
  const card=id&&x>=104&&x<=548&&y>=149&&y<=431;
  const txt=card&&x>133&&x<515&&y>164&&y<420;
  if(card){r=188+random()*14;g=204+random()*18;b=207+random()*19;}
  if(type==='front'&&txt&&x>146&&x<264&&y>241&&y<388){
   r=112+random()*36;g=121+random()*37;b=126+random()*35;
  }
  if(txt&&y%19<4&&x%15<10){r=66;g=78;b=88;}
  if(type==='back'&&txt&&y>310&&y<383&&x>142&&x<503&&x%7<4){r=36;g=45;b=51;}
  if(type==='back'&&txt&&y>393&&y<414&&x>146&&x<501&&x%16<11){r=53;g=58;b=65;}
  if(type==='paper'&&x>155&&x<525&&y>92&&y<455){
   r=243;g=243;b=241;
   if(x>192&&x<489&&y%36<3){r=80;g=80;b=80;}
  }
  const k=(y*W+x)*4;data[k]=r;data[k+1]=g;data[k+2]=b;data[k+3]=255;
 }
 return {data,width:W,height:H,getContext:()=>({getImageData:()=>({data})})};
}
for(const type of ['front','back']){
 const img=scene(type),before=img.data.slice(),found=win.DocFixTextureCard.detect(img);
 assert.ok(found?.quad,type+' ID-1 on light desk should produce provisional crop');
 const q=found.quad,box={left:q[0].x*W,top:q[0].y*H,right:q[2].x*W,bottom:q[2].y*H};
 assert.ok(box.left<104&&box.top<149&&box.right>548&&box.bottom>431,
  type+' all four external plastic borders remain intact');
 assert.ok(box.right-box.left<525&&box.bottom-box.top<375,'majority of desk is excluded');
 assert.equal(found.physicallyVerified,false);
 assert.equal(found.needsReview,true);
 assert.deepEqual(img.data,before,'source pixels remain unchanged');
}
assert.equal(win.DocFixTextureCard.detect(scene('empty')),null,'empty desk never becomes a card');
assert.equal(win.DocFixTextureCard.detect(scene('paper')),null,'A4 declarations are not classified as plastic cards');
assert.ok(html.includes('window.DocFixTextureCard?.detect?.(original)'));
assert.ok(html.includes('window.DocFixVisualCard?.detect?.(original)'));
assert.ok(html.includes('manualPending:true,visualProvisional:true'));
assert.ok(html.includes("entries.some(e=>e.manualPending===true)"),'PDF export remains blocked until border approval');
console.log('PASS: light-desk ID-1 front/back crops, all four edges retained, blank desk/A4 rejected, manual PDF guard and original preserved');