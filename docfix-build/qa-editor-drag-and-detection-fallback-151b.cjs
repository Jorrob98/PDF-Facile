'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');

// Execute the actual editor event handler. A nudge or snap replaces the
// quad array: dragging must operate on the replacement, not stale points.
const start=html.indexOf('  handle.onpointermove=ev=>{');
const end=html.indexOf('  handles.append(handle);',start);
assert.ok(start>0&&end>start,'pointer handler exists');
const source=html.slice(start,end);
const context={};
vm.runInNewContext([
'let editQuad=[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}];',
'const i=0;',
'const handle={style:{},hasPointerCapture:()=>true};',
'const handles={getBoundingClientRect:()=>({left:10,top:20,width:100,height:100})};',
'const window={DocFixScanner:{validQuad:q=>q.length===4&&q.every(p=>p.x>.005&&p.x<.995&&p.y>.005&&p.y<.995)&&q[0].x<q[1].x&&q[0].y<q[3].y}};',
'const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));',
'let redraws=0;function drawFrame(){redraws++;}',
source,
'editQuad=editQuad.map(p=>({...p}));',
'editQuad[0].x=.25;',
'handle.onpointermove({clientX:45,clientY:55,pointerId:1});',
'globalResult={quad:editQuad,style:handle.style,redraws};'
].join('\n'),context);
const result=context.globalResult;
assert.ok(Math.abs(result.quad[0].x-.35)<.001,'drag updates current quad x');
assert.ok(Math.abs(result.quad[0].y-.35)<.001,'drag updates current quad y');
assert.equal(result.quad[1].x,.8,'other corners remain intact');
assert.equal(result.redraws,1,'preview redrawn');
assert.equal(result.style.left,'35%','handle moved to updated position');

// A failed/invalid primary detector must not suppress a working secondary.
const probeStart=html.indexOf('   let candidate=null;',html.indexOf('function photoNormalize('));
const probeEnd=html.indexOf("   if(candidate?.status==='found'&&scan.validQuad(candidate.quad)){",probeStart);
assert.ok(probeStart>0&&probeEnd>probeStart,'fallback detector block exists');
const retry=html.slice(probeStart,probeEnd);
function test(primary,secondary){
 const env={original:{},errors:[],scan:{validQuad:q=>Array.isArray(q)&&q.length===4},
  window:{DocFixTextureCard:{detect:primary},DocFixVisualCard:{detect:secondary}}};
 vm.runInNewContext(retry+';resultCandidate=candidate;',env);
 return env.resultCandidate;
}
const ok={status:'found',quad:[{},{},{},{}],method:'valid-visual'};
assert.equal(test(()=>null,()=>ok).method,'valid-visual','missing primary => secondary');
assert.equal(test(()=>({status:'found',quad:null}),()=>ok).method,'valid-visual','bad primary => secondary');
assert.equal(test(()=>{throw Error('primary decoder failed')},()=>ok).method,'valid-visual','primary throws => secondary');
assert.equal(test(()=>ok,()=>{throw Error('should not run')}).method,'valid-visual','valid primary retained');
assert.ok(html.includes("entries.some(e=>e.manualPending===true)"),'PDF export lock intact');
assert.ok(html.includes('review=true;previewOnly=true;'),'uncertain crops require review');
console.log('PASS: stale-corner drag after snap/nudge, secondary detector recovery, PDF review lock');
