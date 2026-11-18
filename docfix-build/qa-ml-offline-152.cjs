'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'app/docfix-ml-corners.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
let initialized=0,inferred=0,modelOptions;
class LocalQuadscan{
 constructor(opts){modelOptions=opts}
 async initialize(){initialized++}
 async scan(){
  inferred++;
  return {success:true,corners:{
   topLeft:{x:110,y:120,confidence:.89},topRight:{x:700,y:120,confidence:.88},
   bottomRight:{x:700,y:495,confidence:.87},bottomLeft:{x:110,y:495,confidence:.89}
  }};
 }
}
const win={
 Quadscan:{Quadscan:LocalQuadscan},
 DocFixScanner:{validQuad:q=>Array.isArray(q)&&q.length===4&&
  q.every(p=>p.x>.001&&p.y>.001&&p.x<.999&&p.y<.999)}
};
const ctx={window:win,Math,console,location:{href:'http://127.0.0.1:24700/index.html'},URL};
vm.runInNewContext(src,ctx);
const ml=win.DocFixMLCorners;
const source={width:800,height:600};
(async()=>{
 const rough=[{x:.13,y:.18},{x:.90,y:.18},{x:.90,y:.85},{x:.13,y:.85}];
 const res=await ml.detect(source,rough);
 assert.ok(res?.quad,'high-confidence local model candidate accepted');
 assert.equal(res.physicallyVerified,false);
 assert.equal(res.needsReview,true);
 assert.equal(res.method,'local-onnx-four-corners-review-only');
 assert.ok(modelOptions.modelUrl.startsWith('http://127.0.0.1:24700/vendor/quadscan/'));
 assert.ok(modelOptions.wasmPaths.startsWith('http://127.0.0.1:24700/vendor/quadscan/'));
 assert.ok(!JSON.stringify(modelOptions).includes('cdn.'));
 assert.ok(!JSON.stringify(modelOptions).includes('https://'));
 assert.deepEqual(Array.from(modelOptions.executionProviders),['wasm']);
 assert.equal((await ml.detect(source,rough)).status,'found');
 assert.equal(initialized,1,'warm offline ML session reused');
 assert.equal(inferred,2);
 const badRough=[{x:.01,y:.01},{x:.35,y:.01},{x:.35,y:.32},{x:.01,y:.32}];
 assert.equal(await ml.detect(source,badRough),null,'neural/classical mismatch is rejected');
 assert.equal(await ml.detect({width:600,height:800},null),null,
  'portrait multi-card/A4 candidates must not enter a single-card ML pass');
 assert.ok(ml.state().offlineOnly);
 assert.ok(html.includes('await window.DocFixMLCorners?.detect?.(original,norm.sourceQuad)'));
 assert.ok(html.includes('norm.physicallyVerified!==true'));
 assert.ok(html.includes('const completePage=skipPageGuard?null:preserveFullA4Page(original);'));
 assert.ok(html.includes('previewOnly:true,cardLikely:true,review:true,physicallyVerified:false'));
 assert.ok(html.includes("entries.some(e=>e.manualPending===true)"));
 const model=path.join(__dirname,'app','vendor','quadscan','model.onnx');
 const wasm=path.join(__dirname,'app','vendor','quadscan','ort','ort-wasm-simd-threaded.wasm');
 const iife=path.join(__dirname,'app','vendor','quadscan','quadscan.iife.js');
 for(const p of [model,wasm,iife])assert.ok(fs.existsSync(p),'required offline runtime: '+p);
 assert.ok(fs.statSync(model).size>2_000_000,'model weights must be in installer');
 console.log('PASS: model/wasm bundled offline, neural-vs-legacy consensus, one-way source warp, no CDN and manual export guards');
})().catch(e=>{console.error(e);process.exitCode=1;});
