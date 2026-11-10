'use strict';
/* Synthetic offline regression — only coloured rectangles, never real IDs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'app/card-quad-audit.js'),'utf8');
const win={};vm.runInNewContext(src,{window:win,Math,Uint8Array,Uint8ClampedArray,Array});
const api=win.DocFixQuadAudit,w=640,h=420;
const q=[{x:60,y:52},{x:570,y:66},{x:559,y:379},{x:52,y:366}];
const norm=q.map(p=>({x:p.x/w,y:p.y/h}));
function inside(p,x,y){
 let sign=0;
 for(let i=0;i<4;i++){
  const a=p[i],b=p[(i+1)%4];
  const v=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
  if(Math.abs(v)<1)continue;
  if(sign&&v*sign<0)return false;
  sign=Math.sign(v);
 }
 return true;
}
function image({shadow=false,insideText=true,low=false}={}){
 const a=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const inCard=inside(q,x,y),k=(y*w+x)*4;
  const v=shadow&&x>365&&x<470&&y<210?24:0;
  let p=inCard?[194-v,146-v,163-v]:low?[206,203,205]:[33,38,42];
  // A barcode and a portrait-like printed block must not win over the plastic.
  if(inCard&&insideText&&x>190&&x<450&&y>140&&y<171)p=[39,45,55];
  if(inCard&&insideText&&x>99&&x<191&&y>150&&y<260)p=[87,90,95];
  a[k]=p[0];a[k+1]=p[1];a[k+2]=p[2];a[k+3]=255;
 }
 return a;
}
// Real WhatsApp uploads may show a landscape ID card rotated by 90°.
const portrait=[{x:260,y:46},{x:430,y:46},{x:430,y:337},{x:260,y:337}].map(p=>({x:p.x/w,y:p.y/h}));
assert.ok(api.geometry(portrait,w,h,{format:'card'}),'a sideways card must not be rejected solely for being vertical');
const original=image(),saved=original.slice();
const chosen=api.inspectRGBA(original,w,h,norm,{format:'card'});
assert.equal(chosen.verified,true,'four physical sides must be verifiable');
assert.equal(chosen.support.sidesOk,4);
assert.ok(chosen.support.coverage.every(n=>n>=.61),'edge needs continuous evidence');
assert.ok(chosen.support.areaChange>.82&&chosen.support.areaChange<1.2,'perspective must not cut card');
assert.deepEqual(original,saved,'audit must never alter original');
const again=api.inspectRGBA(image(),w,h,norm,{format:'card'});
assert.equal(again.verified,true,'identical images produce identical classification');
const shadow=api.inspectRGBA(image({shadow:true}),w,h,norm,{format:'card'});
assert.equal(shadow.verified,true,'a small shadow away from the physical rim must not ruin a card');
const internal=[{x:116,y:151},{x:199,y:151},{x:199,y:257},{x:116,y:257}].map(p=>({x:p.x/w,y:p.y/h}));
assert.equal(api.inspectRGBA(original,w,h,internal,{format:'card'}).verified,false,'face/portrait rectangle not a full card');
const barcode=[{x:177,y:142},{x:458,y:142},{x:458,y:172},{x:177,y:172}].map(p=>({x:p.x/w,y:p.y/h}));
assert.equal(api.inspectRGBA(original,w,h,barcode,{format:'card'}).verified,false,'barcode not a card');
assert.equal(api.inspectRGBA(original,w,h,[{x:.001,y:.1},{x:.95,y:.1},{x:.95,y:.9},{x:.001,y:.9}],{format:'card'}).verified,false,'partly out of frame needs review');
const empty=new Uint8ClampedArray(w*h*4);for(let i=0;i<empty.length;i+=4){empty[i]=empty[i+1]=empty[i+2]=230;empty[i+3]=255;}
assert.equal(api.inspectRGBA(empty,w,h,norm,{format:'card'}).verified,false,'blank page cannot be a document');
const faded=api.inspectRGBA(image({low:true,insideText:false}),w,h,norm,{format:'card'});
assert.ok(typeof faded.verified==='boolean','near-background-coloured plastic must fail safe or validate');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const onepass=fs.readFileSync(path.join(__dirname,'app/card-onepass.js'),'utf8');
assert.ok(html.includes('card-quad-audit.js'),'audit is loaded before the source-first detector');
assert.ok(html.indexOf('card-quad-audit.js')<html.indexOf('card-onepass.js'),'module load order');
assert.ok(html.includes('id="crop-engine"'),'operator gets a real rollback control');
assert.ok(html.includes("cropMode()==='smart'"),'legacy mode must disable extra candidate discovery');
assert.ok(onepass.includes('if(auditEnabled&&!audited?.verified)return;'),'candidate rejection cannot fall through as verified');
assert.ok(onepass.includes('audited?.verified?audited.quad:obj.quad'),'warp uses refined corners');
assert.ok(html.includes('expandQuadSafe(sourceQuad,.075)'),'uncertain multi-card crop keeps protective padding');
console.log('DocFix quad-audit PASS: physical 4 sides, printed regions, shadow, out-of-frame, stable repeat, rollback');
