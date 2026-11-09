'use strict';
// Synthetic, privacy-safe regression: no customer photos or identity data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict');
const win={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'app/card-over-paper.js'),'utf8'),
 {window:win,Math,Uint8Array,Int32Array,Number,Array});
const engine=win.DocFixOverPaper;
const make=(w,h,card)=>{
 const pixels=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=4*(y*w+x),line=(y%56===0&&x>20&&x<w-30);
  let rgb=line?[65,65,64]:[211,200,191];
  if(card&&x>=card.x0&&x<=card.x1&&y>=card.y0&&y<=card.y1){
   rgb=card.whiteStrip&&y>=card.whiteStrip?[190,184,178]:[123,147,164];
   if(card.whiteStrip&&y>card.whiteStrip&&(x-11)%8===0)rgb=[48,54,60];
  }
  pixels.set([...rgb,255],i);
 }
 return pixels;
};
const back=make(600,780,{x0:70,y0:365,x1:468,y1:616,whiteStrip:550});
const snapshot=back.slice(),found=engine.analyzeRGBA(back,600,780);
assert.equal(found?.status,'found','separate a pale identity reverse from printed paper');
assert.equal(found.needsReview,true,'unproven neutral MRZ bottom must remain flagged');
assert.ok(found.quad[0].x<.12&&found.quad[1].x>.76,'full physical card width retained');
assert.ok(found.quad[2].y>.78,'the white MRZ strip must not be clipped');
assert.deepEqual(back,snapshot,'never mutate uploaded pixels');
const front=engine.analyzeRGBA(make(750,520,{x0:375,y0:70,x1:603,y1:435}),750,520);
assert.equal(front?.status,'found','portrait cyan CIE on landscape A4 must be cropped');
assert.equal(front.physicallyVerified,true);
const portraitOnly=engine.analyzeRGBA(make(750,520,{x0:430,y0:140,x1:576,y1:375}),750,520);
assert.equal(portraitOnly,null,'small cyan portrait-panel island must not masquerade as a full CIE');
assert.ok(front.quad[0].x>.47&&front.quad[2].x<.84,'background page removed');
assert.equal(engine.analyzeRGBA(make(750,520),750,520),null,'paper and printed lines are not a card');
assert.equal(engine.analyzeRGBA(new Uint8ClampedArray(90*120*4),90,120),null,'tiny image rejected');
const mock={width:750,height:520,getContext:()=>({getImageData:()=>({data:make(750,520,{x0:375,y0:70,x1:603,y1:435})})})};
win.DocFixScanner={resize:()=>mock,validQuad:q=>q?.length===4&&q.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)};
assert.equal(engine.detect(mock)?.status,'found');
assert.equal(mock.width,750,'original canvas not disposed when resize returns original');
const scratch={width:750,height:520,getContext:mock.getContext};
win.DocFixScanner.resize=()=>scratch;
assert.equal(engine.detect(mock)?.status,'found');
assert.equal(scratch.width,1,'temporary resized canvas disposed');
assert.equal(mock.width,750,'original photo remains intact');
const index=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
assert.ok(index.includes('card-over-paper.js'),'module loaded before normalizer');
assert.ok(index.includes('window.DocFixOverPaper?.detect?.(original)||null'),'photo path checks over-paper first');
assert.ok(index.includes("catch(error){console.warn('DocFix: analisi tessera su foglio non riuscita'"),'failed detector must not block importing a photo');
assert.ok(index.includes('if(cardLikely&&!onPaper&&!licenceRear)'),'MRZ not trimmed again after crop');
assert.ok(index.includes('&&!norm.overPaper'),'false source MRZ never reverses proven over-paper crop');
assert.ok(index.includes('const cardEvidence=norm.cardLikely||'),'A4 printed paper cannot claim a trustworthy CIE MRZ');
assert.ok(index.includes("let mrz=cardEvidence&&!norm.licenceRear?window.DocFixGroup2.recognizeMRZOrientation(processed)"),'MRZ orientation not read from unisolated printed paper');
assert.ok(index.includes('function portraitCieTurn('),'sideways CIE orientation fallback present');
assert.ok(index.includes("let licenceRear=null,onPaper=null")&&index.includes("const found=onPaper||licenceRear||scan.detectDocument(original)"),
 'blue CIE candidate must be checked before pink licence material');
assert.ok(index.includes('if(!e.geometryReview&&e.sourceQuad&&window.DocFixScanner.validQuad(e.sourceQuad))'),
 'a disputed source quad must not preselect a portrait in manual editor');
assert.ok(index.includes("if(!e.geometryReview&&found.status==='found'"),
 'failed automatic crop must open manual correction at the full original');
console.log('DocFix over-paper regression PASS: portrait front, neutral MRZ, no-card rejection, pixel ownership and integration');