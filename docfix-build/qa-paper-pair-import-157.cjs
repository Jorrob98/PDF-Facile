'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const from=code.indexOf('async function makeImageEntries(');
const until=code.indexOf('window.DocFixDesktopDiagnostics=',from);
assert.ok(from>0&&until>from);
const original={width:1600,height:1200};
const quads=[
 [{x:.04,y:.20},{x:.47,y:.20},{x:.47,y:.52},{x:.04,y:.52}],
 [{x:.51,y:.20},{x:.95,y:.20},{x:.95,y:.53},{x:.51,y:.53}]
];
const ctx={window:{DocFixPaperPair:{detect:()=>({cards:quads.map(quad=>({quad,confidence:.73}))})},
 DocFixScanner:{validQuad:q=>Array.isArray(q)&&q.length===4},
 DocFixPairProof:{geometry:()=>({ok:true})}},
 imageCanvas:async()=>original,documentMode:()=> 'auto',
 preserveFullA4Page:()=>null,cropMode:()=> 'smart',
 normalizeKnownCard:async(_,quad)=>({processed:{width:680,height:430},how:'ritaglio provvisorio',
  sourceQuad:quad,cropped:false,cropVerified:false})};
vm.runInNewContext(code.slice(from,until)+';this.runImage=makeImageEntries;',ctx);
(async()=>{
 const a=await ctx.runImage({name:'front.jpeg'},0,2,{batchId:1,batchPos:0,batchSize:2});
 const b=await ctx.runImage({name:'rear.jpeg'},1,2,{batchId:1,batchPos:1,batchSize:2});
 const all=[...a,...b];
 assert.equal(a.length,2,'first source must produce 2, not one');
 assert.equal(b.length,2,'second source must produce 2, not one');
 assert.equal(all.length,4,'two photos with 2 cards each => exactly four pages');
 assert.deepEqual(Array.from(all.map(x=>x.sourceIndex)),[0,0,1,1]);
 assert.deepEqual(Array.from(all.map(x=>x.splitSlot)),[0,1,0,1]);
 assert.ok(all.every(x=>x.original===original&&x.twoUp===true));
 assert.ok(all.every(x=>x.manualPending===true&&x.cropVerified===false&&x.cropped===false));
 assert.ok(all.every(x=>x.geometryReview===true&&x.review===true));
 console.log('PASS: real makeImageEntries source code produces four reviewed pages (2+2) without phantom pages');
})().catch(e=>{console.error(e);process.exitCode=1});
