'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=__dirname;
const code=fs.readFileSync(path.join(root,'app/docfix-wood-physical-edges.js'),'utf8');
const docfix=fs.readFileSync(path.join(root,'app/index.html'),'utf8');
const win={};
vm.runInNewContext(code,{window:win,document:{},console,Uint8Array,Math});
const detector=win.DocFixWoodPhysicalEdges;
const w=600,h=800;
const box={left:56,top:240,right:548,bottom:550};
const expected=[
 {x:box.left,y:box.top},{x:box.right,y:box.top},
 {x:box.right,y:box.bottom},{x:box.left,y:box.bottom}
];
const quad=()=>[
 {x:(box.left-8)/w,y:(box.top-8)/h},
 {x:(box.right+8)/w,y:(box.top-8)/h},
 {x:(box.right+8)/w,y:(box.bottom+8)/h},
 {x:(box.left-8)/w,y:(box.bottom+8)/h}
];
function photo({bg=[151,59,11],shadow=false,occlude=null,blur=false}={}){
 const d=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  let inCard=x>=box.left&&x<=box.right&&y>=box.top&&y<=box.bottom;
  const xx=x-box.left,yy=y-box.top;
  // Real-world partial occlusions: top-left / bottom-right physical corners
  // missing from photographed card. Full four-sided verification MUST fail.
  if(inCard&&occlude==='tl'&&xx+yy<70)inCard=false;
  if(inCard&&occlude==='br'&&(box.right-x)+(box.bottom-y)<70)inCard=false;
  if(inCard&&occlude==='topstripe'&&y<box.top+50&&x<box.left+120)inCard=false;
  const grain=Math.sin(x*.043+y*.023)*7+Math.sin(y*.017)*4;
  const dark=shadow&&x>box.right-60?-.5:1;
  const rgb=inCard?[216+grain*.17,218+grain*.15,205+grain*.15]:
    bg.map((v,j)=>v+grain*(j===0?1:.3));
  for(let z=0;z<3;z++)d[i+z]=Math.max(0,Math.min(255,rgb[z]*dark));
  d[i+3]=255;
 }
 return d;
}
win.DocFixQuadAudit={inspectCanvas:(_,q)=>({verified:true,quad:q,support:{sidesOk:4,coverage:[1,1,1,1]}})};
function result(options){return detector.inspectRGBA(photo(options),w,h,quad(),{source:{width:w,height:h}});}
const normal=result({});
assert.ok(normal,'one complete ID1 should produce an edge proposal');
assert.equal(normal.matchedSides,4);
assert.equal(normal.physicallyVerified,true,'complete four-sided photo may be automatically verified with agreeing audit');
for(let i=0;i<4;i++){
 const p=normal.quad[i],target=expected[i];
 assert.ok(Math.hypot(p.x*w-target.x,p.y*h-target.y)<6,'corner '+i+' within 6 sampled pixels');
}
const missingTL=result({occlude:'tl'});
assert.ok(!missingTL||missingTL.physicallyVerified!==true,'missing TOP LEFT corner must not be auto-approved');
const missingBR=result({occlude:'br'});
assert.ok(!missingBR||missingBR.physicallyVerified!==true,'missing BOTTOM RIGHT corner must not be auto-approved');
const shadow=result({shadow:true});
assert.ok(!shadow||shadow.physicallyVerified!==true,'side strongly shadowed needs manual review');
for(const mode of [
 {name:'white desktop',bg:[246,246,244]},
 {name:'dark gray desktop',bg:[35,35,35]},
 {name:'blue desktop',bg:[45,90,147]}
]){
 const r=result(mode);
 assert.ok(!r||r.physicallyVerified!==true,mode.name+' must not be automatically approved by wood-only logic');
}
assert.ok(docfix.includes('DocFixWoodPhysicalEdges?.refine?.(original,wood.quad)'));
assert.ok(docfix.includes('physical?.physicallyVerified===true&&physical?.matchedSides===4'));
console.log('PASS: complete plastic auto only with real 4 corners; missing corners, shadow and unfamiliar backgrounds stay manual');
