'use strict';
// Offline geometry and import checks; never use uploaded identity photographs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'app/card-pair-proof.js'),'utf8');
const b=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const original={width:1200,height:1600},scratch={width:900,height:1200};
const cards=[{quad:b(.06,.20,.38,.59),confidence:.89},
 {quad:b(.56,.20,.89,.59),confidence:.88}];
let inspected=0;
const host={DocFixScanner:{
 validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=1&&p.y<=1),
 resize:()=>scratch
},DocFixQuadAudit:{
 inspectCanvas:(canvas,quad)=>{
  assert.strictEqual(canvas,scratch);inspected++;
  return {verified:true,quad,confidence:.95,support:{sidesOk:4}};
 }
}};
vm.runInNewContext(src,{window:host,Math,Number,Array,console});
const api=host.DocFixPairProof;
assert.equal(api.geometry(original,cards).ok,true,'two separate physical card rectangles');
const proof=api.verify(original,cards);
assert.equal(proof.verified,true,'two candidate cards are both independently verified');
assert.equal(proof.cards.length,2);
assert.ok(proof.cards.every(c=>c.physicallyVerified===true));
assert.equal(inspected,2,'both cards must pass separately');
assert.equal(scratch.width,1,'temporary geometry image is disposed');
assert.equal(original.width,1200,'untouched original is preserved');
const invalid=[
 {quad:b(.06,.20,.38,.59),confidence:.89},
 {quad:b(.19,.23,.48,.56),confidence:.89}
];
assert.equal(api.verify(original,invalid).verified,false,'overlapping face-like boxes are rejected');
const tiny=[cards[0],{quad:b(.60,.31,.68,.41)}];
assert.equal(api.verify(original,tiny).verified,false,'printed rectangle does not count as second document');
const unbalanced=[cards[0],{quad:b(.51,.2,.99,.81)}];
assert.equal(api.verify(original,unbalanced).verified,false,'inconsistent card sizes do not count as pair');
host.DocFixQuadAudit.inspectCanvas=(canvas,quad)=>{
 if(quad===cards[1].quad)return {verified:false,reason:'missing edge'};
 return {verified:true,quad,confidence:.95,support:{sidesOk:4}};
};
assert.equal(api.verify(original,cards).verified,false,'one uncertain card prevents proof of both');
host.DocFixQuadAudit.inspectCanvas=()=>{throw Error('synthetic interrupted detector')};
assert.equal(api.verify(original,cards).verified,false,'detector error keeps safe fallback');
assert.equal(original.width,1200,'failure never damages original');
const index=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
assert.ok(index.includes('card-pair-proof.js'),'pair verifier loaded');
assert.ok(index.includes("if(multi?.length===2&&cropMode()==='smart'&&!projection)"),'legacy precise pair proof still excludes independently verified projections');
assert.ok(index.includes('const proof=window.DocFixPairProof?.verify?.(original,multi)'),'original source is verified');
assert.ok(index.includes('sourceVerified:cropMode()===\'smart\'?multi[i].physicallyVerified===true'),'two-up label alone is never physical proof');
assert.ok(index.includes('const fixed=uncertainPair?{'),'uncertain pair keeps whole source');
assert.ok(index.includes('processed:original,rotation:0,review:true,cropVerified:false'),'source must remain editable');
console.log('DocFix independent 2-up proof PASS: both edges, overlap, internal face, size, failure, rollback');
