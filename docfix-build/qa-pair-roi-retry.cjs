'use strict';
// Tiny paired documents: source-first, per-card ROI fallback, four real sides.
// Synthetic candidate geometry; no personal pictures or documents.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'app/card-pair-proof.js'),'utf8');
const quad=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const original={width:1200,height:1600},scratch={width:800,height:1067};
const candidates=[
 {quad:quad(.25,.10,.75,.35),confidence:.82},
 {quad:quad(.25,.55,.75,.80),confidence:.82}
];
const scanner={
 validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=1&&p.y<=1),
 resize:()=>scratch
};
let calls=0,mode='verified';
const host={
 DocFixScanner:scanner,
 DocFixQuadAudit:{inspectCanvas:()=>({verified:false,reason:'too little resolution'})},
 DocFixOnePass:{detect:(photo,rough,options)=>{
  assert.strictEqual(photo,original,'ROI must use untouched original');
  assert.equal(options.auditEnabled,true,'a high-resolution ROI must prove physical edges');
  calls++;
  if(mode==='missing-side'&&rough===candidates[1].quad)return {quad:rough,physicallyVerified:false,support:{sidesOk:3}};
  if(mode==='displaced')return {quad:quad(.01,.01,.15,.20),physicallyVerified:true,support:{sidesOk:4}};
  return {quad:rough,physicallyVerified:true,support:{sidesOk:4},confidence:.91};
 }}
};
vm.runInNewContext(source,{window:host,Math,Number,Array,console});
const api=host.DocFixPairProof;
assert.equal(api.geometry(original,candidates).ok,true);
const passed=api.verify(original,candidates);
assert.equal(passed.verified,true,'two independently four-sided ROIs should allow automatic split');
assert.ok(passed.cards.every(c=>c.physicallyVerified===true));
assert.ok(passed.cards.every(c=>c.method.includes('ROI with 4 physical edges')));
assert.equal(calls,2,'each of two cards must be audited independently');
mode='missing-side';
assert.equal(api.verify(original,candidates).verified,false,
 'one weak edge rejects the entire automatically verified pair');
mode='displaced';
assert.equal(api.verify(original,candidates).verified,false,
 'a four-sided rectangle in the wrong part of the photo is not the requested card');
host.DocFixOnePass.detect=()=>null;
assert.equal(api.verify(original,candidates).verified,false,
 'without a successful ROI retry, the original photo remains available for review');
assert.equal(original.width,1200,'source dimensions remain unchanged');
console.log('DocFix tiny-pair ROI audit PASS: 2 verified physical outlines, failed/mislocated retries rejected');
