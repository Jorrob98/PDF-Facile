/* DocFix Gruppo 5: photographic PDF generator, offline and without page clipping.
   Bounded image sizes come from Group 3. Binary output uses exact byte offsets.
   Does not modify canvas pixels; only JPEG encoding is lossy. */
(()=>{'use strict';
 const MAX_PAGES=40, MAX_PDF_BYTES=180*1024*1024;
 const encoder=new TextEncoder();
 const number=n=>Number.isFinite(n)?Number(n.toFixed(4)):0;
 function layout(width,height,mode='document'){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Dimensioni della pagina non valide');
  if(mode==='a4'){
   const landscape=width>height;
   const pw=landscape?841.89:595.28,ph=landscape?595.28:841.89;
   const m=34.02,s=Math.min((pw-2*m)/width,(ph-2*m)/height);
   const w=number(width*s),h=number(height*s);
   return {pageW:pw,pageH:ph,x:number((pw-w)/2),y:number((ph-h)/2),w,h};
  }
  const s=Math.min(1,841.89/Math.max(width,height));
  const w=number(width*s),h=number(height*s);
  return {pageW:w,pageH:h,x:0,y:0,w,h};
 }
 function validJpeg(data){return data.length>128&&data[0]===255&&data[1]===216&&data[data.length-2]===255&&data[data.length-1]===217}
 async function create(entries,{encodeJPEG,mode='document',onProgress=()=>{},yieldFn=async()=>{}}={}){
  if(!Array.isArray(entries)||!entries.length||entries.length>MAX_PAGES)throw Error('Numero di pagine PDF non valido');
  if(typeof encodeJPEG!=='function')throw Error('Codificatore JPEG mancante');
  const parts=[],offsets=[],ids=entries.map((_,i)=>3+i*3);let cursor=0;
  const push=data=>{parts.push(data);cursor+=data.length;if(cursor>MAX_PDF_BYTES)throw Error('PDF troppo grande per questo dispositivo. Seleziona «PDF più leggero» oppure dividi la pratica.');};
  const str=s=>push(encoder.encode(s));
  const obj=(n,body)=>{offsets[n]=cursor;str(`${n} 0 obj\n${body}\nendobj\n`)};
  const stream=(n,head,data)=>{offsets[n]=cursor;str(`${n} 0 obj\n${head}\nstream\n`);push(data);str('\nendstream\nendobj\n')};
  str('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,`<< /Type /Pages /Kids [${ids.map(n=>`${n} 0 R`).join(' ')}] /Count ${ids.length} >>`);
  for(let i=0;i<entries.length;i++){
   const c=entries[i]?.processed;
   if(!c?.width||!c?.height||c.width<32||c.height<32)throw Error(`Pagina ${i+1} non valida: ricontrolla la foto originale.`);
   const data=new Uint8Array(await encodeJPEG(c));
   if(!validJpeg(data))throw Error(`La pagina ${i+1} non è stata esportata come JPEG valido.`);
   const n=ids[i],b=layout(c.width,c.height,mode);
   obj(n,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${b.pageW} ${b.pageH}] /Resources << /XObject << /Im${i} ${n+1} 0 R >> >> /Contents ${n+2} 0 R >>`);
   stream(n+1,`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>`,data);
   const cmd=encoder.encode(`q ${b.w} 0 0 ${b.h} ${b.x} ${b.y} cm /Im${i} Do Q`);
   stream(n+2,`<< /Length ${cmd.length} >>`,cmd);
   onProgress(i+1,entries.length);
   if(i%2===0)await yieldFn();
  }
  const xref=cursor,total=3+entries.length*3;
  str(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for(let i=1;i<total;i++)str(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  str(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts,{type:'application/pdf'});
 }
 function validate(blob,pages){if(!(blob instanceof Blob)||blob.size<250||blob.type!=='application/pdf'||!Number.isInteger(pages)||pages<1)throw Error('PDF non valido: esportazione interrotta');return blob}
 function filename(entries){
  if(entries.length!==1)return 'documenti-docfix.pdf';
  const raw=String(entries[0].source||'documento').replace(/\.[^.]+$/,'').normalize('NFKC').replace(/[\\/:*?"<>|\x00-\x1F\x7F]/g,' ').replace(/\s+/g,' ').trim().replace(/^[.\s-]+/,'').slice(0,72)||'documento';
  return `${raw}-docfix.pdf`;
 }
 window.DocFixGroup5=Object.freeze({create,layout,validate,filename,version:'5.0-candidate'});
})();