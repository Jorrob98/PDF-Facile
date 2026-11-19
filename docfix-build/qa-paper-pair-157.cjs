'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'app/docfix-paper-pair.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const win={DocFixScanner:{validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>
 Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>.005&&p.x<.995&&p.y>.005&&p.y<.995),
 resize:c=>c},DocFixPairProof:{geometry:(c,cards)=>({ok:cards.length===2})}};
vm.runInNewContext(code,{window:win,Math,Float32Array,Int32Array,Uint8Array,console});
const solver=win.DocFixPaperPair;assert.ok(solver?.analyzeRGBA&&solver?.detect);
const W=560,H=420,quads=[[42,109,250,248],[313,95,522,236]];
function fixture(opts={}){
 const out=new Uint8ClampedArray(W*H*4);
 const cards=opts.cards??quads;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let rgb=opts.background==='gray'?[204,204,204]:
   opts.background==='dark'?[70,70,70]:[220,210,196];
  for(const [left,top,right,bottom] of cards){
   if(x<left||x>right||y<top||y>bottom)continue;
   rgb=opts.white?[240,240,240]:[172,213,227];
   if(x>left+20&&x<right-20&&y>top+25&&y<bottom-20&&y%14<3)
    rgb=[42,44,55];
  }
  const k=(y*W+x)*4;out[k]=rgb[0];out[k+1]=rgb[1];out[k+2]=rgb[2];out[k+3]=255;
 }
 return out;
}
const input=fixture(),before=input.slice();
const detected=solver.analyzeRGBA(input,W,H);
assert.equal(detected?.cards?.length,2,'one photo with two cards must produce exactly 2 previews');
for(let i=0;i<2;i++){
 const card=detected.cards[i],q=card.quad;
 assert.equal(card.physicallyVerified,false,'color cannot prove physical edge');
 assert.equal(card.needsReview,true,'never bypass manual corner approval');
 assert.ok(card.confidence<.80);
 assert.ok(Math.abs(q[0].x*W-quads[i][0])<14);
 assert.ok(Math.abs(q[0].y*H-quads[i][1])<14);
 assert.ok(Math.abs(q[2].x*W-quads[i][2])<14);
 assert.ok(Math.abs(q[2].y*H-quads[i][3])<14);
}
assert.deepEqual(input,before,'source must stay untouched');
assert.equal(solver.analyzeRGBA(fixture({cards:[quads[0]]}),W,H),null,'one card must never split into two');
assert.equal(solver.analyzeRGBA(fixture({cards:[]}),W,H),null,'blank desk not a card');
assert.equal(solver.analyzeRGBA(fixture({background:'gray',white:true}),W,H),null,'white paper on gray desk rejected');
assert.equal(solver.analyzeRGBA(fixture({background:'dark'}),W,H),null,'dark desk should use previous detectors');
const source={width:W,height:H,getContext:()=>({getImageData:()=>({data:input})})};
assert.equal(solver.detect(source)?.cards?.length,2,'canvas bridge + geometry');
assert.ok(ui.includes('<script src="./docfix-paper-pair.js"></script>'));
const start=ui.indexOf("async function makeImageEntries(");
const first=ui.indexOf("paperPair=window.DocFixPaperPair?.detect?.(original)",start);
const oldSingle=ui.indexOf("singleton=window.DocFixSingleCardEvidence?.detect?.(original)",start);
assert.ok(start>=0&&first>start&&first<oldSingle,'pair MUST precede single-card color guards');
assert.ok(ui.includes('splitSlot:i,splitCount:2,'),'one source creates two reviewed entries');
assert.ok(ui.includes('fixed.manualPending=true;fixed.cropVerified=false;fixed.cropped=false;'),
 'never export a guessed crop before operator approval');
assert.ok(!ui.includes('await recoverIncompleteTwoByTwo()'),'never invent the fourth page');
console.log('PASS: two distinct ID-1 cards, four provisional corners, all negative controls, source immutable, PDF review lock');
