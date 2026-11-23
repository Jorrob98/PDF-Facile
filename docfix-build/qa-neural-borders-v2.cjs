'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'app','docfix-neural-edges.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app','index.html'),'utf8');
const win={};vm.runInNewContext(code,{window:win,Math,Float32Array,Set,console});
const ai=win.DocFixNeuralEdges;
assert.equal(ai.version,'bordi-v2-offline-1.9.60');
const card=[{x:.1,y:.2},{x:.9,y:.2},{x:.9,y:.71},{x:.1,y:.71}];
assert.ok(ai.validQuad(card));
const portraitCard=[{x:.2,y:.25},{x:.8,y:.25},{x:.8,y:.54},{x:.2,y:.54}];
assert.equal(ai.validQuad(portraitCard,'card'),false,'normalized aspect ratio is misleading in portrait photos');
assert.equal(ai.validQuad(portraitCard,'card',900,1200),true,'real pixel dimensions recover ID1 ratio');
assert.equal(ai.acceptProposal(portraitCard,portraitCard,{sourceWidth:900,sourceHeight:1200}),true,
 'portrait 2-up / 3-up photos must allow the physical ID1 perimeter');
assert.ok(ai.acceptProposal(null,card));
assert.ok(ai.acceptProposal(card,card));
assert.equal(ai.validQuad([{x:.1,y:.2},{x:.9,y:.71},{x:.9,y:.2},{x:.1,y:.71}]),false);
assert.equal(ai.acceptProposal(card,[{x:.22,y:.3},{x:.50,y:.3},{x:.50,y:.45},{x:.22,y:.45}]),false,
 'a printed face or small inner box cannot replace physical border');
const adjacent=[{x:.51,y:.2},{x:.96,y:.2},{x:.96,y:.49},{x:.51,y:.49}];
assert.equal(ai.acceptProposal(card,adjacent),false,'adjacent document must not steal the quad');
const crop=ai.roiOf({width:1200,height:900},card);
assert.ok(crop.w>900&&crop.h>459,'ROI expands beyond rough quad');
const points=[[14,20],[113,20],[113,91],[14,91]];
const heatmap=new Float32Array(4*128*128);
for(let c=0;c<4;c++){const [x,y]=points[c];heatmap[c*128*128+y*128+x]=.91;}
const found=ai.decodeHeatmap(heatmap,1280,720);
assert.ok(found&&found.quad.length===4,'heatmap yields four corners');
assert.ok(found.confidence>=.90);
assert.ok(found.quad[0].x<found.quad[1].x&&found.quad[0].y<found.quad[3].y);
heatmap[3*128*128+91*128+14]=.05;
assert.equal(ai.decodeHeatmap(heatmap,1280,720),null,'missing fourth corner rejected');
assert.ok(html.includes('await window.DocFixNeuralEdges?.propose?.(original,'),'AI must be invoked by renderer');
assert.ok(html.includes('const norm=await photoNormalize(original)'),'single photo must await inference');
assert.ok(html.includes('manualPending=multiSafe&&!physicalVerified'),'uncertain pair cannot export');
assert.ok(html.includes('review=true;previewOnly=true;'),'uncertain single photo is review only');
assert.ok(code.includes('physicallyVerified:false'),'ML never self-certifies physical outline');
assert.ok(code.includes("BASE='./vendor/docfix-ml/'"),'all runtime files are local');
assert.ok(code.includes('new URL(BASE,window.location.href).href'),
 'WASM import path must be absolute; relative path duplicates vendor directory');
assert.ok(!/https?:\/\//i.test(code.replace(/^\/\*[\s\S]*?\*\//,'').replace(/\/\/[^\n]*/g,'')),
 'no public URL in runtime');
console.log('PASS: local ONNX heatmap, 4-corner safety, 2-card ROI, no CDN and manual confirmation');
