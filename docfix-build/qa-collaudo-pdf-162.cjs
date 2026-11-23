'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const moduleSource=fs.readFileSync(path.join(__dirname,'app/docfix-qa-review.js'),'utf8');
const appMain=fs.readFileSync(path.join(__dirname,'main.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'app/docfix-pwa-refresh.css'),'utf8');
assert.ok(html.includes('window.DocFixQAData=Object.freeze({snapshot:'),'original/preview snapshot exists');
assert.ok(html.includes('docfix-qa-review.js'),'diagnostic module actually loaded');
assert.ok(html.includes('entries.some(e=>e.manualPending===true)'),'official crop export still blocked');
assert.ok(html.includes('dl.disabled=busy||exporting||emergencyExporting'),'official UI lock intact');
assert.ok(appMain.includes("'docfix-qa-review.js'"),'new QA module in startup integrity checks');
assert.ok(appMain.includes('out.qaDownload='),'real Electron UI bridge tested');
assert.ok(css.includes('.qa-review-panel'),'visible PWA-style export affordance');
assert.ok(!/https?:\/\//.test(moduleSource),'diagnostic PDF does not use remote resources');
let pagesSeen=0,imagesDrawn=0,encoded=0;
const ctx={
 fillRect(){},strokeRect(){},fillText(){},drawImage(){imagesDrawn++;},
 set fillStyle(x){},set strokeStyle(x){},set font(x){},set lineWidth(x){}
};
const doc={readyState:'loading',addEventListener(){},
 createElement(tag){
  assert.equal(tag,'canvas');
  return {width:1,height:1,getContext:()=>ctx};
 }};
const win={
 DocFixGroup3:{encodeJPEG:async(c,quality)=>{assert.equal(quality,'compact');assert.equal(c.width,2800);assert.equal(c.height,1800);encoded++;return new Uint8Array([255,216,255,217]);}},
 DocFixGroup5:{create:async(pages,args)=>{
  pagesSeen=pages.length;
  for(const [i,p] of pages.entries()){
   assert.equal(p.processed.width,2800);
   assert.equal(p.processed.height,1800);
   await args.encodeJPEG(p.processed);
   args.onProgress(i+1,pages.length);
  }
  return {size:12345,type:'application/pdf'};
 },validate:(blob,len)=>{assert.equal(len,pagesSeen);return blob;}}
};
const api=new Function('window','document','console','setTimeout','URL',moduleSource+';return window.DocFixQAReport;')(
 win,doc,console,()=>{}, {revokeObjectURL(){}});
assert.ok(api&&typeof api.buildReport==='function');
const a={width:1800,height:2200},b={width:1200,height:760};
const original1=a,preview1=b;
const data=[
 {original:original1,processed:preview1,source:'fronte.jpg',how:'bordi incerti',manualPending:true,cropVerified:false},
 {original:a,processed:b,source:'retro.jpg',how:'prova',manualPending:false,cropVerified:true}
];
(async()=>{
 let progress=0;const blob=await api.buildReport(data,()=>progress++);
 assert.equal(blob.size,12345);
 assert.equal(pagesSeen,2);
 assert.equal(encoded,2);
 assert.equal(progress,2);
 assert.equal(imagesDrawn,4,'original and processed are both rendered for every page');
 assert.strictEqual(data[0].original,original1,'original unmodified');
 assert.strictEqual(data[0].processed,preview1,'preview unmodified');
 assert.equal(data[0].manualPending,true,'official PDF approval never changed');
 console.log('PASS: 2-page collaudo PDF generation while crop is unapproved; both original/preview rendered, normal PDF gate intact');
})().catch(e=>{console.error(e);process.exitCode=1;});
