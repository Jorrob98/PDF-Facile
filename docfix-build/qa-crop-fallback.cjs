'use strict';
// Source-aware single-card crop regression: no personal photos required.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const index=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const start=index.indexOf('function singleCropGate(original,candidate,kind=');
const end=index.indexOf('// The same normalization path is used by photos and scanned PDF pages.',start);
assert.ok(start>=0&&end>start,'single-image crop safety logic must be testable');
const code=index.slice(start,end);
const area=q=>Math.abs(q.reduce((sum,p,i)=>sum+p.x*q[(i+1)%4].y-q[(i+1)%4].x*p.y,0))/2;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function ratio(q,w,h){
 const p=q.map(x=>({x:x.x*w,y:x.y*h}));
 const ww=(dist(p[0],p[1])+dist(p[2],p[3]))/2;
 const hh=(dist(p[1],p[2])+dist(p[3],p[0]))/2;
 return Math.max(ww,hh)/Math.max(1,Math.min(ww,hh));
}
const q=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const box=q(.14,.24,.84,.55);
const face=q(.43,.37,.59,.47);
const original={width:1000,height:1414}; // A4-proportioned PHOTO of a CIE on paper
const scannedCard={status:'found',confidence:.88,cardLikely:true,quad:box,reason:'Materiale azzurro',physicallyVerified:true};
const pinkCard={...scannedCard,reason:'Materiale rosa',needsReview:true,physicallyVerified:false};
const defaultGeneric={status:'uncertain',quad:q(.03,.03,.97,.97),confidence:0};
const state={blue:null,pink:null,generic:defaultGeneric,warpFails:false,legacyFails:false,blueFails:false};
const win={
 DocFixOverPaper:{detect:()=>{if(state.blueFails)throw Error('synthetic blue error');return state.blue}},
 DocFixLicenceRear:{detect:()=>state.pink},
 DocFixScanner:{
  validQuad:x=>Array.isArray(x)&&x.length===4&&x.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))&&area(x)>.01,
  area,detectDocument:()=>{if(state.legacyFails)throw Error('synthetic old detector error');return state.generic},
  process:(src)=>{if(state.warpFails)throw Error('synthetic warp error');return {width:820,height:520}}
 }
};
const silent={warn(){}};
// Inject the same safety-margin helper used by the actual application.
const expandQuadSafe=(q,pad=.025)=>{
 const cx=q.reduce((v,p)=>v+p.x,0)/4,cy=q.reduce((v,p)=>v+p.y,0)/4;
 return q.map(p=>({x:Math.max(0,Math.min(1,cx+(p.x-cx)*(1+pad*2))),
  y:Math.max(0,Math.min(1,cy+(p.y-cy)*(1+pad*2)))}));
};
// Preserve all legacy acceptance expectations, then exercise the separate
// strict four-edge path with the SAME photo-normalization implementation.
let mode='legacy';
const run=new Function('window','quadCardRatio','trimCardBackground','expandQuadSafe','cropMode','console',
 code+'return {singleCropGate,photoNormalize};');
const {singleCropGate,photoNormalize}=run(win,ratio,c=>c,expandQuadSafe,()=>mode,silent);
const reset=()=>{state.blue=null;state.pink=null;state.generic=defaultGeneric;state.warpFails=false;state.legacyFails=false;state.blueFails=false};
reset();state.blue=scannedCard;
let result=photoNormalize(original);
assert.notEqual(result.processed,original,'blue CIE must be cropped on A4-shaped photo');
assert.equal(result.overPaper,true);
assert.equal(result.licenceRear,false);
assert.equal(result.cropVerified,undefined,'single-normalizer does not certify source directly');
assert.equal(result.physicallyVerified,true);
assert.equal(result.review,false);
assert.equal(singleCropGate(original,scannedCard,'blue').ok,true);
reset();state.pink=pinkCard;
result=photoNormalize(original);
assert.notEqual(result.processed,original,'rose licence can be cropped on A4-shaped photo');
assert.equal(result.licenceRear,true);
assert.equal(result.review,true,'unverified rose borders remain a warning');
assert.equal(result.physicallyVerified,false);
// A false blue island cannot prevent the real rose licence from being found.
reset();state.blue={...scannedCard,quad:face};state.pink=pinkCard;
result=photoNormalize(original);
assert.equal(result.licenceRear,true,'rejected cyan portrait must not suppress independent pink licence detection');
assert.equal(result.overPaper,true,'accepted pink licence is tracked as over-paper card');
reset();state.blue={...scannedCard,quad:face};
result=photoNormalize(original);
assert.equal(result.processed,original,'small portrait cannot become the entire identity document');
assert.equal(result.overPaper,false,'a rejected colour region is not a verified material crop');
assert.equal(result.review,true);
reset();state.blue=scannedCard;
const alreadyCard={width:1000,height:1586};
result=photoNormalize(alreadyCard);
assert.equal(result.processed,alreadyCard,'ISO-card-shaped original is not destructively recropped');
assert.equal(result.overPaper,false,'rejected blue candidate must not trigger sideways CIE logic');
reset();state.generic={...scannedCard,physicallyVerified:false,quad:q(.2,.2,.85,.75)};
result=photoNormalize(original);
assert.equal(result.processed,original,'an unverified generic text/frame contour must not crop inside A4');
assert.equal(singleCropGate(original,{...state.generic,physicallyVerified:true},'generic').ok,true,
 'only a separately verified four-edge generic contour may override A4 paper heuristics');
reset();state.blue={...scannedCard,quad:face};
state.generic={...scannedCard,quad:q(.20,.21,.80,.70)};
const landscape={width:1300,height:1000};
result=photoNormalize(landscape);
assert.notEqual(result.processed,landscape,'valid generic fallback must be tried after bad preferred candidate');
assert.equal(result.overPaper,false,'fallback must not claim rejected material evidence');
reset();state.blueFails=true;state.generic={...scannedCard,quad:q(.20,.21,.80,.70)};
result=photoNormalize(landscape);
assert.notEqual(result.processed,landscape,'failed optional blue detector cannot suppress generic crop');
reset();state.blue=scannedCard;state.warpFails=true;
result=photoNormalize(original);
assert.equal(result.processed,original,'failed perspective warp retains source');
assert.equal(result.sourceQuad,null,'failed warp must never expose stale crop');
assert.equal(result.overPaper,false,'failed warp must not claim success');
assert.equal(result.review,true);
reset();state.legacyFails=true;
result=photoNormalize(original);
assert.equal(result.processed,original,'failed fallback detector retains source');
assert.equal(result.review,true);
reset();
assert.equal(singleCropGate(original,{...scannedCard,quad:q(.001,.1,.70,.50)},'blue').ok,false,
 'a candidate on the photograph border must be rejected');
assert.equal(singleCropGate(original,{...scannedCard,confidence:.20},'blue').ok,false,
 'low-confidence material region cannot silently crop');
assert.ok(index.includes("try{sourceCards=window.DocFixRealCrop?.detect?.(original)"),
 '2-up detector must be isolated from import failures');
assert.ok(index.includes("try{tripleRaw=window.DocFixThreeUp?.detect?.(original)"),
 '3-up detector must be isolated from import failures');
assert.ok(index.includes("try{multi=multiCardCandidates(original)"),
 'multi-card fallback errors must not delete the uploaded source');
// Strict mode: an attractive colour box alone is NOT four physical corners.
reset();mode='smart';state.blue=scannedCard;
win.DocFixScanner.resize=c=>c;
win.DocFixScanner.defaultQuad=()=>q(.035,.035,.965,.965);
win.DocFixQuadAudit={inspectCanvas:()=>({verified:false,reason:'synthetic interrupted outer edge'})};
win.DocFixOnePass={detect:()=>null};
result=photoNormalize(original);
assert.strictEqual(result.processed,original,'uncertain four-edge geometry keeps the actual original');
assert.equal(result.review,true,'strict rejected crop is shown for manual verification');
// A passing audit may refine the existing colour candidate without a second crop.
// A geometry box without independent side evidence is never enough.
win.DocFixQuadAudit.inspectCanvas=()=>({verified:true,quad:box,confidence:.94,support:{sidesOk:3}});
result=photoNormalize(original);
assert.strictEqual(result.processed,original,'three supported edges cannot produce an automatic crop');
win.DocFixQuadAudit.inspectCanvas=()=>({verified:true,quad:box,confidence:.94,support:{sidesOk:4}});
result=photoNormalize(original);
assert.notStrictEqual(result.processed,original,'four real supported sides can produce a crop');
assert.ok(result.how.includes('Quattro bordi fisici'),'physical proof is visible in review text');
// Multi-detector recovery should work when the old single-image detector fails.
reset();win.DocFixOnePass.detect=()=>({quad:box,physicallyVerified:true,
 verified:true,confidence:.92,method:'quad-audit / synthetic'});
result=photoNormalize(original);
assert.notStrictEqual(result.processed,original,'strict alternative physical candidate can rescue rejected image');
mode='legacy';reset();
console.log('DocFix crop gate PASS: old behavior preserved, strict 4-edge rejection, verified upgrade and alternative candidate');
