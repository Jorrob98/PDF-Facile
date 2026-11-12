'use strict';
// Regression: one photographed pair must never collapse into one PDF page merely
// because physical edge verification is uncertain. The previews remain
// individually editable and excluded from export until manually confirmed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const from=source.indexOf('function decideTwoUpProof(');
const to=source.indexOf('async function makeImageEntries(',from);
assert.ok(from>0&&to>from,'pair decision must be extracted from application');
const q=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const pair=[{quad:q(.21,.12,.79,.32),confidence:.86},
            {quad:q(.21,.57,.79,.77),confidence:.86}];
const original={width:1200,height:1800};
const scanner={validQuad:a=>Array.isArray(a)&&a.length===4&&a.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)};
const extract=win=>new Function('window',source.slice(from,to)+';return decideTwoUpProof;')(win);
const verified=extract({DocFixScanner:scanner,DocFixPairProof:{
 verify:()=>({verified:true,cards:pair.map(c=>({...c,physicallyVerified:true}))}),
 geometry:()=>({ok:true})
}})(original,pair);
assert.equal(verified.cards.length,2);
assert.equal(verified.needsReview,false,'verified pair has no manual block');
assert.ok(verified.cards.every(c=>c.physicallyVerified===true));
const unsure=extract({DocFixScanner:scanner,DocFixPairProof:{
 verify:()=>({verified:false,reason:'one of the four edges is too pale'}),
 geometry:()=>({ok:true})
}})(original,pair);
assert.equal(unsure.cards.length,2,'two independently plausible cards must retain separate previews');
assert.equal(unsure.needsReview,true,'provisional previews must require manual confirmation');
assert.strictEqual(unsure.cards[0],pair[0],'provisional candidate retains original geometry and provenance');
const invalid=extract({DocFixScanner:scanner,DocFixPairProof:{
 verify:()=>({verified:false,reason:'overlap'}),
 geometry:()=>({ok:false,reason:'overlap'})
}})(original,pair);
assert.equal(invalid.cards,null,'implausible paired geometry cannot be split');
assert.equal(invalid.needsReview,true);
assert.ok(source.includes("conservativeSegment:!!projection||uncertainPair"),
 'unverified pair must use conservative, source-first preview path');
assert.ok(source.includes("fixed.manualPending=true;fixed.cropVerified=false;fixed.cropped=false;"),
 'uncertain pair cannot become export-ready automatically');
assert.ok(source.includes("if(entries.some(e=>e.manualPending===true))"),
 'PDF export must reject pending previews');
assert.ok(source.includes("e.manualPending=false;const q=qualityAudit(e.processed,null);"),
 'full photo recovery clears pending state');
assert.ok(source.includes("e.sourceQuad=rotatedQuad(editQuad,(360-editRotation)%360);e.manualPending=false;"),
 'manually accepted corner correction clears pending state');
console.log('DocFix paired screenshot recovery PASS: 2 previews on audit uncertainty, export blocked, verified pair unchanged');
