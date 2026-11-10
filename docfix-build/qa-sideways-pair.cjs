'use strict';
// Offline QA uses artificial coloured rectangles only; no customer images.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'app/card-sideways-pair.js'),'utf8');
const win={DocFixQuadAudit:{inspectRGBA:()=>({verified:false,reason:'unconfirmed external edge'})}};
vm.runInNewContext(code,{window:win,Math,Uint8Array,Float32Array,Number,Array,console});
const detect=win.DocFixSidewaysPair.analyzeRGBA,w=360,h=410;
function scene({pair=true,single=false,paper=false,touch=false}={}){
 const d=new Uint8ClampedArray(w*h*4);
 const c1={x0:32,x1:164,y0:102,y1:321};
 const c2={x0:touch?165:178,x1:touch?300:311,y0:99,y1:317};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const left=x>=c1.x0&&x<=c1.x1&&y>=c1.y0&&y<=c1.y1;
  const right=pair&&!single&&x>=c2.x0&&x<=c2.x1&&y>=c2.y0&&y<=c2.y1;
  const bg=paper?[220,220,220]:[38+Math.round(x/w*12),36+Math.round(x/w*13),35+Math.round(x/w*13)];
  let rgb=left?[206,219,199]:right?[61,148,216]:bg;
  // A dark stripe inside the blue health card must not become an external edge.
  if(right&&x>c2.x1-30&&x<c2.x1-3)rgb=[30,52,65];
  const k=(y*w+x)*4;d[k]=rgb[0];d[k+1]=rgb[1];d[k+2]=rgb[2];d[k+3]=255;
 }
 return d;
}
for(const opts of [{},{touch:true}]){
 const data=scene(opts),copy=data.slice(),r=detect(data,w,h);
 assert.equal(r?.verifiedSplit,true,'two vertical cards next to each other are detected');
 assert.equal(r.cards.length,2);
 assert.ok(r.cards[0].quad[1].x<r.cards[1].quad[1].x,'stable left-to-right ordering');
 assert.ok(r.cards.every(c=>{
  const q=c.quad;return (q[3].y-q[0].y)*h>(q[1].x-q[0].x)*w*1.2;
 }), 'each card remains a complete vertical shape before rotation');
 assert.ok(r.cards.every(c=>c.physicallyVerified===false),
  'not enough physical evidence must remain flagged for operator review');
 assert.deepEqual(data,copy,'the uploaded pixels must never be mutated');
}
assert.equal(detect(scene({single:true}),w,h),null,'one card cannot be invented as two');
assert.equal(detect(scene({paper:true}),w,h),null,'paper backgrounds do not trigger dark-mat recovery');
assert.equal(detect(new Uint8ClampedArray(80*80*4),80,80),null,'tiny images are rejected safely');
const index=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
assert.ok(index.includes('card-sideways-pair.js'),'new detection module must load');
assert.ok(index.includes('window.DocFixSidewaysPair?.detect?.(original)'),'fallback uses the untouched source');
assert.ok(index.includes('forceLandscapeLeft:isSideways'),'rotation only affects recovered sideways cards');
assert.ok(index.includes('processed=rotate(processed,270);rotation=270'),'separated vertical cards become landscape');
assert.ok(index.includes("cropMode()==='smart'"),'legacy mode preserves old behavior');
assert.ok(index.includes("splitCount:2,twoUp:true"),'two-source upload produces four separate previews');
console.log('DocFix sideways pair PASS: split, touching cards, safety warnings, no fake pairs, rotation, rollback');
