'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const a=src.indexOf('async function exportOriginalsSafely(){'),b=src.indexOf('// Emergency save is deliberately',a);
assert.ok(a>0&&b>a,'direct safe original PDF function exists');
assert.ok(src.includes("dl.onclick=()=>entries.some(e=>e.manualPending===true)?exportOriginalsSafely():exportPdf();"),
 'same BOTTOM download button handles both verified PDF and full originals');
assert.ok(src.includes("dl.textContent=pendingManual?'↓ Scarica originali (senza ritagli)'"),'visible warning: no automatic crops');
assert.ok(!src.includes('dl.disabled=busy||exporting||emergencyExporting||pending.length>0||available.length===0||available.length!==entries.length||entries.some(e=>e.manualPending===true)'),
 'unconfirmed borders must not permanently disable the bottom download');
assert.ok(src.includes("if(entries.some(e=>e.manualPending===true)){\n   status('Prima conferma i quattro bordi"),'official cropped-PDF gate remains closed');
function make(entries){
 const statusMessages=[],notes=[],calls=[],originals=entries.map(e=>e.original);
 const element={hidden:false};
 const exportOffline=async pages=>{
  calls.push(pages);
  return {size:43210,type:'application/pdf'};
 };
 const downloader=(blob,pages,partial,name)=>{assert.equal(blob.size,43210);calls.push({download:true,pages,partial,name});};
 const fn=new Function('entries','exportRasterOffline','downloadBlob','status','note','syncActions','repaint','$','fmt','pending','exportPdf','busy','exporting','emergencyExporting',
  src.slice(a,b)+';return exportOriginalsSafely;')(
  entries,exportOffline,downloader,m=>statusMessages.push(m),m=>notes.push(m),
  ()=>{},()=>{},()=>element,n=>String(n)+' B',[],async()=>{throw Error('normal PDF must not run');},
  false,false,false);
 return {fn,calls,statusMessages,notes,originals};
}
(async()=>{
 const front={width:1200,height:1600},back={width:1200,height:1600};
 const crop={width:840,height:540};
 const {fn,calls,statusMessages,notes,originals}=make([
  {kind:'raster',original:front,processed:crop,sourceIndex:1,manualPending:true,source:'front.jpg'},
  {kind:'raster',original:back,processed:crop,sourceIndex:2,manualPending:true,source:'back.jpg'},
  {kind:'raster',original:back,processed:crop,sourceIndex:2,manualPending:true,source:'back.jpg'}
 ]);
 await fn();
 assert.equal(calls.length,2);
 assert.equal(calls[0].length,2,'three wrong previews must produce two source originals');
 assert.strictEqual(calls[0][0].processed,front);
 assert.strictEqual(calls[0][1].processed,back);
 assert.equal(calls[1].name,'DocFix-ORIGINALI-bordi-da-verificare.pdf');
 assert.strictEqual(originals[0],front);
 assert.strictEqual(originals[1],back);
 assert.ok(notes.some(s=>s.includes('nessun bordo')));
 assert.ok(statusMessages.some(s=>s.includes('PDF salvato')));
 console.log('PASS: main bottom PDF button saves one untouched original per upload even for phantom duplicate previews');
})().catch(error=>{console.error(error);process.exitCode=1;});
