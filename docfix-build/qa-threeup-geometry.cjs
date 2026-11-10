'use strict';
// The 3-card detector's classification must never be mistaken for a crop proof.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const index=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const a=index.indexOf('async function normalizeKnownCard(');
const b=index.indexOf('// Never let an earlier 2-up success',a);
assert.ok(a>=0&&b>a,'normalizer must be present');
const snippet=index.slice(a,b);
assert.ok(snippet.includes('rotatedLeft:threeUp&&orientationKnown'),
 '3-up portrait images must use the rotated ROI border detector');
const vm=require('node:vm');
const onepass=fs.readFileSync(path.join(__dirname,'app/card-onepass.js'),'utf8'),onepassWindow={};
vm.runInNewContext(onepass,{window:onepassWindow,Math,Uint8Array,Uint32Array,Int32Array});
const p=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
const mapped=onepassWindow.DocFixOnePass.mapFromLeftTurn(p);
const xy=mapped.map(v=>[v.x,v.y].join(',')).join(';');
assert.equal(xy,'1,0;1,1;0,1;0,0',
 'restore rotated card corners to original portrait-photo coordinates');

const area=q=>Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
const validQuad=q=>Array.isArray(q)&&q.length===4&&q.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
const rough=[{x:.10,y:.12},{x:.90,y:.12},{x:.90,y:.88},{x:.10,y:.88}];
const complete=[{x:.09,y:.11},{x:.91,y:.11},{x:.91,y:.89},{x:.09,y:.89}];
const portrait=[{x:.38,y:.35},{x:.62,y:.35},{x:.62,y:.62},{x:.38,y:.62}];
const original={width:1200,height:1800},warps=[];
const state={candidate:null,throws:false,onepassCount:0};
const win={
 DocFixScanner:{area,validQuad,process:(source,options)=>{
  assert.strictEqual(source,original,'all output must derive from original');
  warps.push(options.quad);
  return {width:850,height:520};
 }},
 DocFixOnePass:{detect:()=>{state.onepassCount++;if(state.throws)throw Error('synthetic detector failure');return state.candidate;}},
 DocFixGroup2:{recognizeMRZOrientation:()=>({angle:0,trustworthy:false})}
};
const expandQuadSafe=(q,pad=.025)=>{
 const cx=q.reduce((s,p)=>s+p.x,0)/4,cy=q.reduce((s,p)=>s+p.y,0)/4;
 return q.map(p=>({x:Math.max(0,Math.min(1,cx+(p.x-cx)*(1+pad*2))),
 y:Math.max(0,Math.min(1,cy+(p.y-cy)*(1+pad*2)))}));
};
const factory=new Function('window','expandQuadSafe','qualityAudit','textLines',
 'inferTextOrientation','rotate','fineDeskewCard',
 snippet+';return normalizeKnownCard');
const normal=factory(win,expandQuadSafe,()=>({review:false,issues:[],metrics:{}}),
 ()=>({vertical:false}),async()=>({angle:0,trustworthy:false}),c=>c,
 ()=>({applied:false,verified:true,residual:0,canvas:null}));
const call=(args={})=>normal(original,rough,'tre tessere',.91,{
 multiSafe:true,cardKind:'cf',orientationKnown:true,threeUp:true,sourceVerified:false,...args
});
(async()=>{
 // Wrong internal contour with plausible colour is not a physical outline.
 state.candidate={quad:portrait,verified:true,confidence:.94,support:{sidesOk:4}};
 let r=await call();
 assert.equal(r.cropVerified,false,'internal portrait cannot become a verified crop');
 assert.ok(area(warps.at(-1))>area(rough),'protect margins instead of shrinking to portrait');
 // Three physical sides do not justify an irreversible warp.
 state.candidate={quad:complete,verified:true,confidence:.92,support:{sidesOk:3}};
 r=await call();
 assert.equal(r.cropVerified,false,'3-side detection is uncertain even with high confidence');
 // Four side support and sufficiently complete area permits a single warp.
 state.candidate={quad:complete,verified:true,confidence:.92,support:{sidesOk:4}};
 const before=warps.length;r=await call();
 assert.equal(r.cropVerified,true,'4 supported external sides can be accepted');
 assert.equal(warps.length,before+1,'never warp the same card twice');
 // The proven two-up engine is left as it was.
 state.throws=true;const callsBefore=state.onepassCount;
 r=await normal(original,rough,'due tessere',.93,{multiSafe:true,cardKind:'cf',
  sourceVerified:true,orientationKnown:true,threeUp:false});
 assert.equal(r.cropVerified,true,'previously verified 2-up result is preserved');
 assert.equal(state.onepassCount,callsBefore,'2-up verified path bypasses new detector');
 // A failed optional detector must not discard the entire 3-up upload.
 r=await call();assert.equal(r.cropVerified,false);
 assert.ok(r.processed?.width>0,'safe preview remains after detector exception');
 assert.equal(original.width,1200,'original image never destroyed');
 assert.ok(index.includes("sourceVerified:c.physicalEdgesVerified===true"),
  'material classification must never be used as physical geometry proof');
 assert.ok(index.includes('threeUp:true'),'three-card path must be explicitly gated');
 console.log('DocFix 3-up geometry PASS: no portrait, no 3-side success, 4 edges, intact 2-up, detector exception');
})().catch(e=>{console.error(e);process.exitCode=1});
