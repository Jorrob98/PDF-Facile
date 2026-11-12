'use strict';
// DocFix safety regression: final audited quad must never become a face-only crop.
// Synthetic quads and mocked canvas, no customer documents or OCR.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const begin=src.indexOf('function singleCropGate(');
const end=src.indexOf('// The same normalization path is used by photos and scanned PDF pages.',begin);
assert.ok(begin>0&&end>begin,'single card normalization source present');
const code=src.slice(begin,end);
assert.ok(code.includes('const finalGate=singleCropGate(original,audited,kind);'),
 'the audited quad must be independently checked again');
const original={width:1200,height:1200};
const quad=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const complete=quad(.10,.22,.90,.72),faceOnly=quad(.40,.37,.56,.53);
const nearEdge=quad(.001,.22,.83,.72);
function ratio(q,w,h){
 const a=q.map(p=>({x:p.x*w,y:p.y*h}));
 const dist=(p,t)=>Math.hypot(p.x-t.x,p.y-t.y);
 const ww=(dist(a[0],a[1])+dist(a[2],a[3]))/2;
 const hh=(dist(a[1],a[2])+dist(a[3],a[0]))/2;
 return Math.max(ww,hh)/Math.max(1,Math.min(ww,hh));
}
function run(auditedQuad,edgesOk=4){
 let calls=0;
 const scanner={
  validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1),
  area:q=>Math.abs((q[1].x-q[0].x)*(q[3].y-q[0].y)),
  detectDocument:()=>({status:'found',quad:complete,confidence:.92,cardLikely:true}),
  resize:()=>({width:900,height:900}),
  process:()=>{calls++;return {width:900,height:575}}
 };
 const win={
  DocFixScanner:scanner,
  DocFixOverPaper:{detect:()=>null},
  DocFixLicenceRear:{detect:()=>null},
  DocFixOnePass:{detect:()=>null},
  DocFixQuadAudit:{inspectCanvas:()=>({verified:true,quad:auditedQuad,confidence:.94,support:{sidesOk:edgesOk}})}
 };
 const api=new Function('window','console','cropMode','quadCardRatio','expandQuadSafe','trimCardBackground',
  code+';return {photoNormalize,singleCropGate};')(
  win,console,()=> 'smart',ratio,q=>q,processed=>processed);
 const output=api.photoNormalize(original);
 return {output,calls,gate:api.singleCropGate(original,{status:'found',quad:auditedQuad,confidence:.95,cardLikely:true},'generic')};
}
const invalid=run(faceOnly);
assert.strictEqual(invalid.output.processed,original,'face-only audited quad must preserve original');
assert.equal(invalid.calls,0,'never render a crop around the portrait');
assert.equal(invalid.output.review,true,'face-only detection must need review');
const badEdges=run(complete,3);
assert.strictEqual(badEdges.output.processed,original,'three edges are not enough');
assert.equal(badEdges.calls,0);
const edge=run(nearEdge);
assert.strictEqual(edge.output.processed,original,'audited quad touching image edge is rejected');
assert.equal(edge.calls,0);
const valid=run(complete);
assert.equal(valid.calls,1,'complete four-sided document remains crop-enabled');
assert.equal(valid.output.review,false,'complete audited document passes geometry');
assert.equal(valid.output.sourceQuad.length,4);
console.log('DocFix final single-card audit PASS: face-only, invalid edge, missing side rejected; complete quad accepted');
