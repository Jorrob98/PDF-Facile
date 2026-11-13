'use strict';
// Reproduction of a lost 4th card: two source photos, 1+2 pages, uncertain
// edges. This test exercises the real import and recovery functions, not copies.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const a=html.indexOf('function decideTwoUpProof('),b=html.indexOf('window.DocFixDesktopDiagnostics=',a);
const c=html.indexOf('async function rebuildSourceAsTwoUp('),d=html.indexOf('async function drainPending(',c);
assert.ok(a>0&&b>a&&c>b&&d>c,'production import and recovery functions exist');
const createQuad=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const pair=[
 {quad:createQuad(.25,.10,.78,.29),confidence:.72,physicallyVerified:false},
 {quad:createQuad(.25,.54,.78,.73),confidence:.73,physicallyVerified:false}
];
const original={width:1200,height:1800,tag:'original-photo'};
const pairs={verify:()=>({verified:false,reason:'pale fourth border'}),geometry:()=>({ok:true})};
const scanner={validQuad:q=>Array.isArray(q)&&q.length===4&&q.every(p=>
 Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)};
const win={DocFixScanner:scanner,DocFixPairProof:pairs,
 DocFixRealCrop:{detect:()=>({cards:pair})},DocFixThreeUp:{detect:()=>null},
 DocFixSidewaysPair:{detect:()=>null},DocFixIndependentProjection:{detect:()=>null}};
const sourcePieces=html.slice(a,b);
const factory=new Function('window','imageCanvas','chooseMultiCardMode','multiCardCandidates',
 'normalizeKnownCard','normalizeRaster','multiCropHealthy','cropMode',
 'preserveFullA4Page','documentMode','console',sourcePieces+';return makeImageEntries;');
let called=[];
const render=(o,q,label,confidence,options)=>{
 called.push(options);
 return Promise.resolve({processed:{width:850,height:545},how:'',
  cropVerified:!!options.sourceVerified,manualPending:!!options.conservativeSegment,
  review:!!options.conservativeSegment});
};
const normalized=async()=>({processed:original,how:'original',review:false});
let forcedPage=false;
const imported=factory(win,async()=>original,()=>({mode:'fallback',conflict:false}),
 ()=>[],render,normalized,()=>true,()=> 'smart',
 (o,force)=>force?{processed:o,pageProtected:true,how:'pagina intera'}:null,
 ()=> 'auto',console);
async function run(){
 const low=await imported({name:'photo-two-weak.jpg'},10,1,{batchId:7,batchSize:2});
 assert.equal(low.length,2,'low confidence 2-up candidates must not be thrown away');
 assert.deepEqual(low.map(e=>e.splitSlot),[0,1]);
 assert.ok(low.every(e=>e.manualPending===true&&e.original===original),
  'unverified regions remain separate, blocked from PDF and from original');
 win.DocFixRealCrop.detect=()=>({cards:[pair[0]]});
 const single=await imported({name:'single.jpg'},11,1,{batchId:8,batchSize:1});
 assert.equal(single.length,1,'a single card must not generate fake extras');
 const page=await imported({name:'A4.jpg'},12,1,{documentMode:'page'});
 assert.equal(page.length,1,'forced A4 remains one complete page');
 assert.equal(page[0].pageProtected,true);
 const entries=[
  {sourceIndex:10,source:'first.jpg',original,loadBatch:7,batchPos:0},
  {sourceIndex:11,source:'second.jpg',original,loadBatch:7,batchPos:1,splitSlot:0,twoUp:true},
  {sourceIndex:11,source:'second.jpg',original,loadBatch:7,batchPos:1,splitSlot:1,twoUp:true}
 ];
 const msgs=[];
 const ctx=new Function('window','entries','stackedCardCandidatesByGap',
  'stackedCardCandidatesRecovery','normalizeKnownCard','multiCropHealthy',
  'document','CustomEvent','twoByTwoState','regroupLatestTwoUpSources',
  'regroupTwoFileFourCards','status',html.slice(a,html.indexOf('async function makeImageEntries(',a))+
   '\n'+html.slice(c,d)+';return {recoverIncompleteTwoByTwo,rebuildSourceAsTwoUp};')(
    win,entries,()=>[],()=>[],render,()=>true,{dispatchEvent(){}},
    class CustomEvent{},()=>{const ids=[10,11],counts=ids.map(id=>entries.filter(x=>x.sourceIndex===id).length);
     return {ids,counts,incomplete:counts.includes(1)&&counts.includes(2)};},
    ()=>true,()=>true,m=>msgs.push(m));
 win.DocFixRealCrop.detect=()=>({cards:pair});
 assert.equal(await ctx.recoverIncompleteTwoByTwo(),true);
 assert.equal(entries.length,4,'a 3/4 set must retain all four source-backed pages');
 assert.deepEqual([10,11].map(i=>entries.filter(e=>e.sourceIndex===i).length),[2,2]);
 assert.ok(entries.filter(e=>e.sourceIndex===10).every(e=>e.manualPending&&e.original===original));
 assert.ok(msgs.some(m=>m.includes('conferma i bordi')),'the operator gets an actionable warning');
 // No evidence of a second card = no split, no invented fourth page.
 pairs.geometry=()=>({ok:false,reason:'overlap'});
 const singleOriginal={sourceIndex:21,source:'A4-protected.jpg',original,
  loadBatch:9,batchPos:0};
 entries.length=0;entries.push(singleOriginal);
 assert.equal(await ctx.rebuildSourceAsTwoUp(21,0),false,'geometry guard prevents hallucinated split');
 assert.strictEqual(entries[0],singleOriginal,'failed recovery does not delete source');
 console.log('DocFix lost-card recovery PASS: weak pair kept, 3-to-4, A4 protected, original untouched, invalid pair rejected');
}
module.exports=run();
if(require.main===module)module.exports.catch(e=>{console.error(e);process.exitCode=1});
