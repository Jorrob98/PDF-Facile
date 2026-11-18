'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const code=fs.readFileSync(path.join(__dirname,'app/docfix-neutral-single.js'),'utf8');
const W=390,H=520,N=W*H;
const win={DocFixScanner:{resize:c=>c,validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>.004&&p.x<.996&&p.y>.004&&p.y<.996)}};
vm.runInNewContext(code,{window:win,Int32Array,Uint8Array,Math,console});
const engine=win.DocFixNeutralCardEvidence;
assert.ok(engine?.analyzeRGBA&&engine?.detect,'neutral permit detector loaded');
function polygon(x,y,quad){return quad.every((p,i)=>{const n=quad[(i+1)%4];return (n[0]-p[0])*(y-p[1])-(n[1]-p[1])*(x-p[0])>=0;});}
function fixture(cases=[],bg='warm'){
 const rgba=new Uint8ClampedArray(N*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const m=(x*17+y*31)%35;
  let rgb=bg==='warm'?[168+m,126+m,85+m]:[210+m/2,210+m/2,210+m/2];
  for(const quad of cases){
   if(!polygon(x,y,quad))continue;
   rgb=[235,235,237];
   if(x>=83&&x<190&&y>260&&y<366)rgb=[56,60,63]; // dark portrait
   if(x>210&&x<338&&y>260&&y<390&&y%12<2)rgb=[48,53,57]; // printed text
  }
  const k=(y*W+x)*4;rgba[k]=rgb[0];rgba[k+1]=rgb[1];rgba[k+2]=rgb[2];rgba[k+3]=255;
 }
 return rgba;
}
const q=[[35,166],[349,158],[360,375],[30,377]],data=fixture([q]),before=data.slice();
const result=engine.analyzeRGBA(data,W,H);
assert.ok(result?.strongSingle,'one pale identity card should be recognized on warm marble');
assert.equal(result.physicallyVerified,false,'never claim four independently verified edges from colour');
assert.equal(result.needsReview,true,'cropping requires explicit review');
assert.ok(result.confidence<.80,'provisional evidence cannot be treated as proof');
for(let i=0;i<4;i++){
 const p=result.quad[i],error=Math.hypot(p.x*W-q[i][0],p.y*H-q[i][1]);
 assert.ok(error<25,'corner '+i+' should stay near material silhouette: '+error);
}
assert.deepEqual(data,before,'no customer pixels may be modified');
const canvas={width:W,height:H,getContext:()=>({getImageData:()=>({data})})};
assert.ok(engine.detect(canvas)?.quad,'canvas integration detects exactly one card');
assert.equal(engine.analyzeRGBA(fixture([]),W,H),null,'marble alone is NOT a card');
assert.equal(engine.analyzeRGBA(fixture([q],'neutral'),W,H),null,'neutral desk is NOT a warm desk');
const left=[[30,180],[179,180],[179,281],[30,281]];
const right=[[213,180],[362,180],[362,281],[213,281]];
assert.equal(engine.analyzeRGBA(fixture([left,right]),W,H),null,'two real cards must remain in multi-card pipeline');
const page=[[12,36],[375,36],[375,488],[12,488]];
assert.equal(engine.analyzeRGBA(fixture([page]),W,H),null,'full white A4 must not be called a small ID-1');
assert.ok(html.includes('<script src="./docfix-neutral-single.js"></script>'),'app loads detector');
const pos=html.indexOf('neutral=window.DocFixNeutralCardEvidence?.detect?.(original)'),multi=html.indexOf('window.DocFixRealCrop?.detect?.(original)');
assert.ok(pos>0&&pos<multi,'neutral original photo tested BEFORE 2-up detection');
assert.ok(html.includes("fixed.manualPending=true;fixed.cropVerified=false;fixed.cropped=false;"),'must not auto-export an unverified card');
assert.ok(html.includes('splitCount:1,twoUp:false,threeUp:false,'),'one input with one card yields ONE preview');
assert.ok(!html.includes('await recoverIncompleteTwoByTwo()'),'automatic 3 to 4 page invention remains disabled');
console.log('PASS: one pale residence permit front, 4 provisional corners, marble/white desk/two cards/A4 negatives, original and PDF lock');
