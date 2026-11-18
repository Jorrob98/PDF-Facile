'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'app/card-auto-four-edge.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const valid=q=>Array.isArray(q)&&q.length===4&&q.every(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1);
const win={DocFixScanner:{validQuad:valid}};
vm.runInNewContext(code,{window:win,Math,console});
const guard=win.DocFixAutoFourEdge;
assert.ok(guard&&guard.version==='1.9.51-candidate');
const original={width:1600,height:1200};
const rough=rect(.17,.26,.83,.78);
const improved=rect(.174,.263,.829,.779);
const edges={quad:improved,matchedSides:4,physicallyVerified:false,needsReview:true};
const result=guard.assess(original,rough,edges,valid);
assert.ok(result&&result.method==='provisional-original-four-side-auto-refinement');
assert.equal(result.physicallyVerified,false);
assert.equal(result.requiresCornerConfirmation,true);
assert.equal(result.matchedSides,4);
assert.equal(guard.assess(original,rough,{...edges,matchedSides:3},valid),null,
 'three plausible borders cannot silently shift one corner');
assert.equal(guard.assess(original,rough,{...edges,physicallyVerified:true},valid),null,
 'auto refinement cannot upgrade an independent certified document');
assert.equal(guard.assess(original,rough,{...edges,quad:rect(.235,.263,.829,.779)},valid),null,
 'reject internal portrait or text stripe as left plastic border');
assert.equal(guard.assess(original,rough,{...edges,quad:rect(.174,.303,.829,.779)},valid),null,
 'reject a misplaced header as top plastic border');
assert.equal(guard.assess(original,rough,{...edges,quad:rect(.174,.263,.829,.722)},valid),null,
 'reject trimming third MRZ line from plastic');
assert.equal(guard.assess(original,rough,{...edges,quad:rect(.174,.263,.97,.779)},valid),null,
 'reject uncorroborated large right-edge expansion');
assert.equal(guard.assess(original,rough,{...edges,quad:rough},valid),null,
 'do not claim a refined crop when no edge changed');
assert.equal(guard.assess(original,rough,{...edges,quad:rect(.15,.26,.85,.80)},valid),null,
 'unsupported large geometry or area change must not be accepted');
assert.ok(html.includes('window.DocFixAutoFourEdge?.refine?.(original,candidate.quad)'));
assert.ok(html.indexOf('window.DocFixAutoFourEdge?.refine?.(original,candidate.quad)') <
 html.indexOf("candidate.method==='id1-light-background-provisional'"),
 'new physical-border gate must execute BEFORE old light-desk deskew skip');
assert.ok(html.includes('card-auto-four-edge.js'));
assert.ok(html.includes("review=true;previewOnly=true"),'refinement remains manual preview');
assert.ok(html.includes('manualPending:true,visualProvisional:true'), 'PDF must require manual confirmation');
assert.ok(html.includes("entries.some(e=>e.manualPending===true)"), 'PDF must be blocked');
assert.ok(html.includes('const preview=scan.process(original,{crop:true,quad,'), 'single original-source warp only');
console.log('PASS: 1.9.51 four-edge original-source refinement allowed only on coherent sides, no loss of MRZ/portrait, fallback and PDF review preserved');
