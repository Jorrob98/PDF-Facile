'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const js=fs.readFileSync(path.join(__dirname,'app/card-guided-split.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const win={};
vm.runInNewContext(js,{window:win,Math});
const guided=win.DocFixGuidedSplit;
assert.equal(guided.version,'1.9.49-candidate');
const portrait={width:260,height:460},landscape={width:460,height:260};
const p=guided.propose(portrait),l=guided.propose(landscape);
assert.equal(p.quads.length,2);assert.equal(p.arrangement,'stacked');
assert.equal(l.quads.length,2);assert.equal(l.arrangement,'side-by-side');
assert.ok(p.quads[0][2].y>p.quads[1][0].y,'manual draft keeps overlap to avoid missing the seam');
assert.ok(l.quads[0][1].x>l.quads[1][0].x,'side-by-side draft keeps overlap');
assert.equal(p.verified,false);assert.equal(p.requiresConfirmation,2);
const good=[{quad:[{x:.03,y:.03},{x:.95,y:.03},{x:.95,y:.43},{x:.03,y:.43}]},
 {quad:[{x:.03,y:.56},{x:.95,y:.56},{x:.95,y:.96},{x:.03,y:.96}]}];
assert.ok(guided.usablePair(good,true));assert.equal(guided.propose(portrait,{cards:good}).reason.includes('rilevatore'),true);
const bad=good.map(c=>({quad:c.quad.map(t=>({...t}))}));bad[1].quad=bad[0].quad;
assert.equal(guided.usablePair(bad,true),false);
assert.equal(guided.propose(portrait,{cards:bad}).reason.includes('approssimativa'),true);
const first=html.indexOf('function canGuidedSplit(e){');
const last=html.indexOf('// Explicit safety fallback: clone the PAGE metadata',first);
assert.ok(first>0&&last>first,'guided split functions are integrated');
const operations=html.slice(first,last);
const validQuad=q=>Array.isArray(q)&&q.length===4&&q.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>0&&p.x<1&&p.y>0&&p.y<1);
let source={kind:'raster',original:portrait,processed:{width:260,height:460},source:'test-local-only.jpg',sourceIndex:7,title:'test',splitCount:1,splitSlot:0,review:true};
let entries=[source],busy=false,processing=false,exporting=false,emergencyExporting=false,MAX_PAGES=40,
 lastPdfSize=11,manuallyOrdered=false,log=[],repaintCount=0,opened=[],events=[],attempt=0,failAt=-1;
win.DocFixStackedBluePair={detect:()=>null};
win.DocFixScanner={validQuad,process:(original,opts,limit)=>{
 attempt++;if(attempt===failAt)throw Error('synthetic canvas exception');
 return {width:620,height:392,source:original,quad:opts.quad,limit};
}};
const doc={dispatchEvent:e=>events.push(e.type)};
class CustomEvent{constructor(type,opts){this.type=type;this.detail=opts.detail;}}
const ctx={window:win,document:doc,CustomEvent,entries,busy,processing,exporting,emergencyExporting,
 MAX_PAGES,lastPdfSize,manuallyOrdered,
 note:x=>log.push('NOTE '+x),status:x=>log.push('STATUS '+x),repaint:()=>{repaintCount++;},
 openCorrection:i=>opened.push(i),console};
vm.createContext(ctx);
vm.runInContext(operations,ctx);
assert.equal(ctx.canGuidedSplit(source),true);
assert.equal(ctx.guidedSplitSource(0),true);
assert.equal(ctx.entries.length,2);
assert.deepEqual(ctx.entries.map(e=>e.splitSlot),[0,1]);
assert.ok(ctx.entries.every(e=>e.manualPending&&e.cropVerified===false&&e.twoUp&&e.splitCount===2));
assert.ok(ctx.entries.every(e=>e.original===source.original));
assert.equal(ctx.entries.some(e=>e.manualPending===true),true,'PDF export cannot proceed');
assert.deepEqual(opened,[0],'first card opens immediately for four-corner editing');
assert.equal(ctx.lastPdfSize,null);
assert.equal(ctx.manuallyOrdered,true);
assert.equal(ctx.undoGuidedSplit(1),true);
assert.equal(ctx.entries.length,1);
assert.equal(ctx.entries[0],source,'undo restores IDENTICAL original metadata and source');
assert.equal(repaintCount,2);
assert.ok(events.every(e=>e==='docfix:entries-added'));
ctx.MAX_PAGES=1;
assert.equal(ctx.guidedSplitSource(0),false,'limit check stops split');
assert.equal(ctx.entries.length,1);
ctx.MAX_PAGES=40;failAt=attempt+2;
assert.equal(ctx.guidedSplitSource(0),false,'partial preview failure leaves original intact');
assert.equal(ctx.entries.length,1);assert.equal(ctx.entries[0],source);
failAt=-1;
assert.equal(ctx.guidedSplitSource(0),true);
assert.equal(ctx.undoGuidedSplit(0),true);
source.pageProtected=true;
assert.equal(ctx.canGuidedSplit(source),false,'paper page protected from guided ID split');
assert.ok(html.includes("if(e.manualSplitPair===true){\n  alert("),'full original cannot be accepted as one of two cropped pages');
assert.ok(html.includes('✂ Separa in 2'));
assert.ok(html.includes('↶ Annulla separazione'));
assert.ok(html.includes("Conferma '+pendingManual+' "),'button names pages requiring review');
assert.ok(html.includes("entries.some(e=>e.manualPending===true)"),'PDF save remains blocked on unapproved previews');
console.log('PASS: guided split portrait/landscape, optional detector fallback, 2 unverified pages, PDF gate, editor, safe undo, failure atomicity, A4 guard');
