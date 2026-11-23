'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=__dirname;
const code=fs.readFileSync(path.join(root,'app/docfix-wood-physical-edges.js'),'utf8');
const index=fs.readFileSync(path.join(root,'app/index.html'),'utf8');
const startup=fs.readFileSync(path.join(root,'main.js'),'utf8');
const win={};vm.runInNewContext(code,{window:win,document:{},console,Uint8Array,Math});
const detector=win.DocFixWoodPhysicalEdges;
assert.ok(detector&&typeof detector.inspectRGBA==='function');
const w=750,h=1000;
function createCard(box={x0:65,y0:280,x1:692,y1:677},bg=[147,60,12]){
 const d=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,plastic=x>=box.x0&&x<=box.x1&&y>=box.y0&&y<=box.y1;
  // A little wood texture, plus pale ID-1 plastic with cyan/tan printing.
  const woodRipple=Math.sin((x+y*.2)*.075)*8;
  if(plastic){
   const mid=(y-box.y0)/(box.y1-box.y0);
   d[i]=mid<.15?218:218;d[i+1]=mid<.15?213:220;d[i+2]=mid<.15?195:208;
  }else{
   d[i]=bg[0]+woodRipple;d[i+1]=bg[1]+woodRipple*.42;d[i+2]=bg[2]+woodRipple*.2;
  }
  d[i+3]=255;
 }
 return d;
}
function rough(box){
 return [{x:(box.x0-9)/w,y:(box.y0-9)/h},
  {x:(box.x1+9)/w,y:(box.y0-9)/h},
  {x:(box.x1+9)/w,y:(box.y1+9)/h},
  {x:(box.x0-9)/w,y:(box.y1+9)/h}];
}
const box={x0:65,y0:280,x1:692,y1:677};
const proposed=detector.inspectRGBA(createCard(box),w,h,rough(box));
assert.ok(proposed?.quad,'four full plastic edges should be proposed');
assert.equal(proposed.matchedSides,4);
assert.equal(proposed.physicallyVerified,false,'a colour mask alone MUST NEVER auto certify PDF');
for(const [i,p] of proposed.quad.entries()){
 const target=[{x:65,y:280},{x:692,y:280},{x:692,y:677},{x:65,y:677}][i];
 assert.ok(Math.hypot(p.x*w-target.x,p.y*h-target.y)<5,
  'corner '+i+' should match plastic, not protective wooden margin');
}
const stats=proposed.diagnostic;
assert.ok(stats.minSupport>=.78&&stats.maxError<=1.5,'independent gradient check is now eligible');
win.DocFixQuadAudit={inspectCanvas:(_source,q)=>({
 verified:true,quad:q,support:{sidesOk:4,coverage:[1,1,1,1]}})};
const verified=detector.inspectRGBA(createCard(box),w,h,rough(box),{
 source:{width:w,height:h}
});
assert.equal(verified?.physicallyVerified,true,'two independent physical edge checks agree');
assert.equal(verified.needsReview,false);
win.DocFixQuadAudit={inspectCanvas:(_source,q)=>({
 verified:true,quad:q.map(p=>({x:p.x+.06,y:p.y})),support:{sidesOk:4}})};
const contradictory=detector.inspectRGBA(createCard(box),w,h,rough(box),{
 source:{width:w,height:h}
});
assert.equal(contradictory?.physicallyVerified,false,'divergent independent detector cannot auto certify');
const noWood=createCard(box,[155,155,155]);
const gray=detector.inspectRGBA(noWood,w,h,rough(box));
assert.ok(!gray||gray.physicallyVerified===false,'non-warm backgrounds cannot be auto certified from a wood mask');
assert.ok(index.includes('DocFixWoodPhysicalEdges?.refine?.(original,wood.quad)'),'new fitting is used before preview');
assert.ok(index.includes('physical?.physicallyVerified===true&&physical?.matchedSides===4'),'only real four-side audit can auto unlock');
assert.ok(index.includes('visualProvisional:!audited,cropVerified:audited'),'uncertain crops remain provisional');
assert.ok(index.includes('docfix-wood-physical-edges.js'),'new module loaded by renderer');
assert.ok(startup.includes('out.woodFourEdges='),'app self-test includes module');
console.log('PASS: four fitted original source edges, no wood margins, independent proof required before auto PDF');
