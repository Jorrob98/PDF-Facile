'use strict';
// OnePass physical evidence propagation. No identity images, no network.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'app/card-onepass.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const quad=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const candidate=quad(.12,.14,.88,.86);
const rough=quad(.12,.18,.90,.75);
const scan={
 validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1),
 area:q=>Math.abs((q[1].x-q[0].x)*(q[3].y-q[0].y)),
 detectAll:()=>[]
};
let auditAccept=true,inspectCount=0;
const win={
 DocFixScanner:scan,
 DocFixGroup1:{
  candidateFromBackground:()=>({quad:candidate,method:'fixture'}),
  edgeSupport:()=>({sidesOk:4,strength:28})
 },
 DocFixPhysicalEdges:{detect:()=>null},
 DocFixQuadAudit:{inspectCanvas:()=>{
  inspectCount++;
  return auditAccept?{verified:true,quad:candidate,support:{sidesOk:4},score:23,confidence:.95}:{verified:false};
 }}
};
const document={createElement:()=>{
 const canvas={width:1,height:1};
 canvas.getContext=()=>({
  drawImage(){},translate(){},rotate(){},
  getImageData(){return {data:new Uint8ClampedArray(canvas.width*canvas.height*4)}}
 });
 return canvas;
}};
new Function('window','document','console',source)(win,document,console);
const engine=win.DocFixOnePass,original={width:1200,height:900};
const audited=engine.detect(original,rough,{auditEnabled:true});
assert.equal(audited?.verified,true);
assert.equal(audited?.physicallyVerified,true,'four-side audit proof must reach the caller');
assert.equal(audited?.support?.sidesOk,4);
const legacy=engine.detect(original,rough,{auditEnabled:false});
assert.equal(legacy?.verified,true,'legacy mode remains usable');
assert.equal(legacy?.physicallyVerified,false,'non-audited legacy result cannot claim physical proof');
auditAccept=false;
const failed=engine.detect(original,rough,{auditEnabled:true});
assert.equal(failed,null,'rejected physical audit cannot return a crop in precision mode');
assert.equal(inspectCount,2);
assert.ok(html.includes('if(probe?.physicallyVerified)'),
 'single-card fallback must require and consume the physical proof');
assert.ok(html.includes('auditEnabled:cropMode()===\'smart\''),
 'precision fallback must enable the independent audit');
assert.ok(html.includes("found.physicallyVerified===true&&found.support?.sidesOk===4"),
 'multi-card fallback must never accept 3-side candidates');
console.log('DocFix OnePass physical proof PASS: precise 4-side crop, legacy compatibility, rejected audit');
