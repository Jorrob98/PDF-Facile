'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=__dirname;
const source=fs.readFileSync(path.join(root,'app/group5-export.js'),'utf8');
const quality=fs.readFileSync(path.join(root,'app/group3-quality.js'),'utf8');
const win={};
vm.runInNewContext(source,{window:win,console,Math,Uint8Array,TextEncoder,Blob});
vm.runInNewContext(quality,{window:win,console,Math});
const pdf=win.DocFixGroup5,group3=win.DocFixGroup3;
const jpg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAAwAEgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAIRAxEAPwCswFUQAAAAAAAAAAAAAAAAAAAAAAAAAAAH/9k=','base64');
assert.deepEqual(Array.from([pdf.jpegInfo(jpg).width,pdf.jpegInfo(jpg).height]),[72,48]);
assert.equal(group3.inputScale(1200,1600),1,'no downsampling for real source photographs');
assert.equal(group3.inputScale(4000,6000)<1,true,'large photos receive bounded scaling');
const landscape=pdf.layout(1200,1600,'document'),portrait=pdf.layout(1600,1200,'document');
assert.ok(landscape.pageH>landscape.pageW&&portrait.pageW>portrait.pageH,'physical page orientation matches source image');
assert.ok(Math.abs(landscape.pageW/landscape.pageH-.75)<.0001,'photo proportions remain unchanged');
assert.equal(landscape.x,0);assert.equal(landscape.y,0);
const same=pdf.layout(1600,1200,'a4');
assert.ok(same.w<=same.pageW&&same.h<=same.pageH&&same.x>=0&&same.y>=0,'A4 mode does not clip');
(async()=>{
 let progress=0;
 const entries=[{processed:{width:72,height:48},source:'fronte.jpg'},{processed:{width:72,height:48},source:'retro.jpg'}];
 const result=await pdf.create(entries,{encodeJPEG:async()=>jpg,mode:'document',onProgress:()=>progress++});
 pdf.validate(result,2);
 const bytes=Buffer.from(await result.arrayBuffer());
 assert.ok(bytes.subarray(0,8).toString('latin1').startsWith('%PDF-1.4'));
 assert.ok(bytes.toString('latin1').includes('/Count 2'),'PDF has exactly two pages');
 assert.equal(progress,2);
 const exact=new Uint8Array(jpg);
 let occurrences=0,index=0;
 while((index=bytes.indexOf(exact,index))>=0){occurrences++;index+=jpg.length;}
 assert.equal(occurrences,2,'each embedded JPEG survives BYTE-FOR-BYTE unchanged');
 assert.ok(bytes.toString('latin1').includes('/Width 72 /Height 48'),'PDF images retain original dimensions');
 assert.equal(pdf.jpegInfo(Uint8Array.from([255,216,255,217])),null,'invalid tiny JPEG rejected');
 await assert.rejects(()=>pdf.create([{processed:{width:72,height:48}}],{
  encodeJPEG:async()=>Uint8Array.from([255,216,255,217])}),/JPEG incompleto/);
 await assert.rejects(()=>pdf.create(Array.from({length:41},()=>entries[0]),{encodeJPEG:async()=>jpg}),/Numero di pagine/);
 console.log('PASS: two-page PDF, byte-perfect JPEG embedding, no clipping, orientation and invalid-JPEG rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
