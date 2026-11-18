'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const s=fs.readFileSync(path.join(__dirname,'app/card-ml-offline.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'app/vendor/quadscan/manifest.json'),'utf8'));
assert.equal(manifest.runtime,'offline');
assert.equal(manifest.package,'quadscan@1.0.0');
assert.ok(manifest.assets.some(a=>a.file.endsWith('/model.onnx')&&a.bytes>4_000_000));
assert.ok(manifest.assets.some(a=>a.file.endsWith('.wasm')));
assert.ok(manifest.assets.filter(a=>a.file.includes('LICENSE')).length>=3);
for(const item of manifest.assets)assert.ok(fs.existsSync(path.join(__dirname,'app',item.file)));
const win={},location={href:'http://127.0.0.1:18654/index.html',hostname:'127.0.0.1',origin:'http://127.0.0.1:18654'};
vm.runInNewContext(s,{window:win,location,Math,URL,console});
const ml=win.DocFixLocalML;assert.ok(ml?.offlineOnly&&typeof ml.candidate==='function');
const W=2040,H=1530;
const corners=[[238,320],[1750,327],[1750,1225],[215,1220]];
const result={success:true,confidence:.68,corners:Object.fromEntries(
 ['topLeft','topRight','bottomRight','bottomLeft'].map((key,i)=>[key,{x:corners[i][0],y:corners[i][1],confidence:.7}]))};
const proposed=ml.candidate(result,W,H);
assert.ok(proposed,'whole CIE should be retained');
assert.equal(proposed.manualPending,true);
assert.equal(proposed.physicallyVerified,false);
assert.equal(proposed.needsReview,true);
assert.equal(proposed.quad.length,4);
assert.ok(proposed.quad[0].x<corners[0][0]/W&&proposed.quad[2].x>corners[2][0]/W,'rounded corners protected');
const wrongRatio={...result,corners:{...result.corners,
 bottomLeft:{x:100,y:1450,confidence:.7},bottomRight:{x:1800,y:1450,confidence:.7}}};
assert.equal(ml.candidate(wrongRatio,W,H),null,'A4 ratio rejected');
assert.equal(ml.candidate({...result,confidence:.1},W,H),null,'uncertain ML predictions rejected');
assert.equal(ml.candidate(result,W,H,[
 {x:.02,y:.03},{x:.43,y:.03},{x:.43,y:.38},{x:.02,y:.38}]),null,'independent candidate disagreement rejected');
assert.ok(html.includes('await window.DocFixLocalML?.detect?.('));
assert.ok(html.includes('manualPending:true,visualProvisional:true'),'model cannot approve a PDF');
assert.ok(html.includes("entries.some(e=>e.manualPending===true)"),'PDF gating must remain');
assert.ok(html.includes("!uncertainPair&&mode!=='page'"),'model never replaces a possible double-card photo');
assert.ok(!s.includes('cdn.jsdelivr')&&!s.includes('raw.githubusercontent')&&!s.includes('https://'),
 'model loader must contain no external origin');
console.log('PASS: local DocAligner 4-corner candidate, proportion/area/overlap bounds, no remote assets, PDF review gate');
