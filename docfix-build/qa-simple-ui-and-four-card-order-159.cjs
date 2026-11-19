'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ui=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const logic=fs.readFileSync(path.join(__dirname,'app/docfix-four-card-order.js'),'utf8');
const window={};
vm.runInNewContext(logic,{window,console,Math});
const order=window.DocFixFourCardOrder;
assert.ok(order?.plan&&order?.inspectRGBA,'source-backed four-card classifier loaded');
const cards=[
 {sourceIndex:20,splitSlot:0,processed:{}}, // CIE front, pale
 {sourceIndex:21,splitSlot:0,processed:{}}, // health card back, magnetic stripe
 {sourceIndex:20,splitSlot:1,processed:{}}, // health card front, blue
 {sourceIndex:21,splitSlot:1,processed:{}}  // CIE back, MRZ, pale
];
const samples=[
 {blue:.286,darkBand:.30},{blue:.261,darkBand:.995},
 {blue:.631,darkBand:.30},{blue:.222,darkBand:.399}
];
let found=order.plan(cards,samples);
assert.ok(found,'confident source-pair and physical-band evidence');
assert.deepEqual(Array.from(found.indices),[0,3,2,1],'identity front/rear first, health front/rear second');
assert.deepEqual(Array.from(found.labels),[
 'Carta identità · fronte','Carta identità · retro',
 'Tessera sanitaria · fronte','Tessera sanitaria · retro']);
const ambiguous=samples.map(x=>({...x}));
ambiguous[1].darkBand=.42;
assert.equal(order.plan(cards,ambiguous),null,'no magnetic stripe => no invented labels');
const ambiguousFront=samples.map(x=>({...x}));
ambiguousFront[2].blue=.34;
assert.equal(order.plan(cards,ambiguousFront),null,'no differentiable fronts => no invented labels');
const badSource=cards.map(x=>({...x,sourceIndex:20}));
assert.equal(order.plan(badSource,samples),null,'not exactly two original photographs');
assert.ok(ui.includes('<script src="./docfix-four-card-order.js"></script>'));
assert.ok(ui.includes('window.DocFixFourCardOrder?.plan?.(ordered)'), 'no source-slot-driven document labels');
assert.ok(!ui.includes("const labels=['Codice fiscale · fronte'"),'old false labels eliminated');
assert.ok(ui.includes("e.docIdentityVerified=Boolean(found)"),'confidence represented explicitly');
assert.ok(ui.includes("const extra=document.createElement('details')"),'advanced card controls collapsed');
assert.ok(ui.includes("more.textContent='Altre azioni'"),'simple primary action');
assert.ok(ui.includes("controls.append(fix)"),'one primary correction button');
assert.ok(ui.includes("moreBody.append(order)"),'reorder preserved under more');
assert.ok(ui.includes("moreBody.append(addCard)"),'manual second card preserved');
assert.ok(ui.includes("moreBody.append(guided)"),'guided split preserved');
assert.ok(ui.includes('class="editor-advanced"'), 'pixel-level tools collapsed, not removed');
assert.ok(ui.includes('class="editor-more-tools"'), 'rotations collapsed, not removed');
assert.ok(ui.includes('DocFixProjectedEdges?.refine?.(original,card.quad)'), 'edge refinement operates on source');
assert.ok(ui.includes("refined?.matchedSides===4"),'physical corners require four independently supported sides');
assert.ok(ui.includes('fixed.manualPending=true;fixed.cropVerified=false;fixed.cropped=false'),
 'unverified auto crop must never enter PDF');
assert.ok(ui.includes("entries.some(e=>e.manualPending===true)"),'PDF confirmation gate remains');
assert.ok(!ui.includes("await recoverIncompleteTwoByTwo()"),'no false extra pages');
console.log('PASS: correct CIE + health-card order, no false source-slot labels, simple UI, four-edge source refinement, PDF safety');
