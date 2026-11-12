'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const index=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const a=index.indexOf('function duplicateSourcePage(index){');
const b=index.indexOf('function moveEntry(from,to){',a);
assert.ok(a>=0&&b>a,'safe manual additional-card workflow must exist');
const part=index.slice(a,b);
const original={width:1200,height:1600},source={kind:'raster',original,processed:{width:700,height:430},
 sourceIndex:17,source:'whatsapp-coppia.jpg',title:'Prima tessera',rotation:270,
 cropped:true,cropVerified:true,review:false,twoUp:true,splitSlot:0,splitCount:2};
const entries=[source],opened=[],messages=[],notices=[];
let repaintCount=0;
const mk=new Function('entries','note','repaint','openCorrection','status','MAX_PAGES',
 'let busy=false,processing=false,exporting=false,manuallyOrdered=false,lastPdfSize=null;'+part+
 ';return {duplicateSourcePage,manualOrder:()=>manuallyOrdered};');
const api=mk(entries,m=>notices.push(m),()=>{repaintCount++},i=>opened.push(i),m=>messages.push(m),40);
api.duplicateSourcePage(0);
assert.equal(entries.length,2,'add second card from same picture');
assert.strictEqual(entries[1].original,original,'the unchanged uploaded source is reused');
assert.strictEqual(entries[1].processed,original,'manual recovery begins at original, not first cropped card');
assert.equal(entries[1].sourceIndex,source.sourceIndex,'the photo is not uploaded a second time');
assert.equal(entries[1].manualPending,true,'a duplicate must not silently become export-ready');
assert.equal(entries[1].cropVerified,false,'extra photo crop needs human-confirmed four corners');
assert.equal(entries[0].cropVerified,true,'existing good first card stays untouched');
assert.deepEqual(opened,[1],'new page immediately enters four-corner editor');
assert.equal(repaintCount,1);
assert.equal(api.manualOrder(),true,'manual page insertion preserves operator ordering');
assert.ok(index.includes('entries.some(e=>e.manualPending===true)'),'normal PDF export blocks unconfirmed extra page');
assert.ok(index.includes('save.disabled=emergencyExporting||exporting||available.length===0||entries.some(e=>e.manualPending===true)'),
 'partial PDF export must also block unconfirmed extra page');
assert.ok(index.includes('e.manualPending=false;const q=qualityAudit(e.processed,e.sourceQuad)'),
 'manual four-corner apply clears pending status');
const limit=Array.from({length:40},()=>({...source}));
const max=mk(limit,m=>notices.push(m),()=>{},()=>{},()=>{},40);
max.duplicateSourcePage(0);
assert.equal(limit.length,40,'capacity limit prevents creating an orphan page');
console.log('DocFix manual duplicate PASS: original preserved, independent correction, 40-page limit, PDF safety lock');
