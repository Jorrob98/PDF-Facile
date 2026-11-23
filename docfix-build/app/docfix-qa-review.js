/* DocFix 1.9.62 — export a diagnostic PDF without approving uncertain crops.
 * It does NOT change, unlock or call the official PDF export.
 * Originals and processed previews never leave the device except through
 * the explicit local download initiated by the user. */
(()=>{'use strict';
 const PAGE_W=2800,PAGE_H=1800;
 let saving=false,reportURL=null;
 const $=id=>document.getElementById(id);
 const trim=(s,n=70)=>{s=String(s||'').replace(/[\x00-\x1f]/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s;};
 const usable=c=>!!c&&Number(c.width)>8&&Number(c.height)>8;
 function snapshot(){
  const bridge=window.DocFixQAData;
  return typeof bridge?.snapshot==='function'?bridge.snapshot().filter(e=>usable(e.processed)):[];
 }
 function drawImageFit(ctx,img,box){
  if(!usable(img))return;
  const scale=Math.min(box.w/img.width,box.h/img.height);
  const w=Math.max(1,img.width*scale),h=Math.max(1,img.height*scale);
  const x=box.x+(box.w-w)/2,y=box.y+(box.h-h)/2;
  ctx.drawImage(img,x,y,w,h);
  ctx.lineWidth=3;ctx.strokeStyle='#cbd9e4';ctx.strokeRect(x,y,w,h);
 }
 function makePage(item,index,total){
  const c=document.createElement('canvas');c.width=PAGE_W;c.height=PAGE_H;
  const g=c.getContext('2d',{alpha:false});
  if(!g)throw Error('Impossibile preparare il confronto delle immagini');
  g.fillStyle='#f2f6fa';g.fillRect(0,0,PAGE_W,PAGE_H);
  g.fillStyle='#092d50';g.fillRect(0,0,PAGE_W,170);
  g.fillStyle='#fff';g.font='bold 65px system-ui, Arial';g.fillText('DocFix  |  Collaudo ritagli',80,104);
  g.font='34px system-ui, Arial';g.fillStyle='#c9e7f5';g.fillText('Pagina '+(index+1)+' / '+total+'  ·  Non usare come PDF definitivo',PAGE_W-1170,104);
  g.fillStyle='#203c55';g.font='bold 45px system-ui, Arial';
  g.fillText(trim(item.pairLabel||item.title||item.source||'Documento '+(index+1),95),88,250);
  const uncertain=item.manualPending===true||item.cropVerified===false||item.geometryReview===true;
  g.fillStyle=uncertain?'#fff0d4':'#dff3ed';g.fillRect(85,282,Math.min(PAGE_W-170,uncertain?800:740),66);
  g.fillStyle=uncertain?'#925b14':'#116d59';g.font='bold 35px system-ui, Arial';
  g.fillText(uncertain?'BORDI DA CONFERMARE':'ANTEPRIMA DA CONTROLLARE',105,327);
  const margin=88,gap=45,leftW=(PAGE_W-2*margin-gap)/2;
  const y=386,headerH=74,imH=1130;
  for(const [i,label] of ['FOTO ORIGINALE','ANTEPRIMA DOCFIX'].entries()){
   const x=margin+i*(leftW+gap);
   g.fillStyle='#fff';g.fillRect(x,y,leftW,headerH+imH+28);
   g.strokeStyle='#d7e4ec';g.lineWidth=3;g.strokeRect(x,y,leftW,headerH+imH+28);
   g.fillStyle=i===0?'#0b6c92':'#087f8e';g.fillRect(x,y,leftW,headerH);
   g.fillStyle='#fff';g.font='bold 35px system-ui, Arial';g.fillText(label,x+25,y+49);
   g.fillStyle='#e8eef3';g.fillRect(x+20,y+headerH+20,leftW-40,imH-10);
   drawImageFit(g,i===0?(usable(item.original)?item.original:item.processed):item.processed,
     {x:x+36,y:y+headerH+32,w:leftW-72,h:imH-34});
  }
  g.fillStyle='#526c82';g.font='30px system-ui, Arial';
  g.fillText('Rilevamento: '+trim(item.how||'dati non disponibili',125),94,1695);
  g.fillText('Contiene immagini originali e anteprime. Verifica i dati personali prima di condividere.',94,1746);
  return c;
 }
 async function buildReport(items,onProgress=()=>{}){
  if(!Array.isArray(items)||!items.length||items.length>40)throw Error('Numero di documenti non valido');
  if(!window.DocFixGroup5?.create||!window.DocFixGroup3?.encodeJPEG)throw Error('Motore PDF locale non disponibile');
  // Lazy pages: build one comparison canvas at a time to avoid retaining
  // 40 images of ~20 MB each in memory.
  const virtual=items.map((item,i)=>({processed:{width:PAGE_W,height:PAGE_H,item,i},source:item.source||''}));
  const blob=await window.DocFixGroup5.create(virtual,{
   mode:'document',
   encodeJPEG:async proxy=>{
    const canvas=makePage(proxy.item,proxy.i,items.length);
    try{return await window.DocFixGroup3.encodeJPEG(canvas,'compact');}
    finally{canvas.width=1;canvas.height=1;}
   },
   onProgress,
   yieldFn:()=>new Promise(resolve=>setTimeout(resolve,0))
  });
  return window.DocFixGroup5.validate(blob,items.length);
 }
 function downloadReport(blob){
  if(reportURL)URL.revokeObjectURL(reportURL);
  reportURL=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=reportURL;
  a.download='DocFix-COLLAUDO-ritagli-'+new Date().toISOString().slice(0,10)+'.pdf';
  document.body.appendChild(a);a.click();a.remove();
 }
 function update(){
  const panel=$('qa-review-panel'),button=$('qa-review-download'),hint=$('qa-review-hint');
  if(!panel||!button||!hint)return;
  const items=snapshot();
  panel.hidden=items.length===0;
  button.disabled=saving||items.length===0;
  if(!saving){
   button.textContent='↓ Scarica PDF per collaudo';
   const n=items.filter(x=>x.manualPending===true).length;
   hint.textContent=n
    ?n+' '+(n===1?'ritaglio da confermare':'ritagli da confermare')+'. Puoi comunque scaricare il confronto tra foto originale e anteprima.'
    :'Confronta le foto originali con i ritagli. Il PDF di prova non sostituisce il PDF definitivo.';
  }
 }
 async function save(){
  if(saving)return false;
  const items=snapshot();if(!items.length)return false;
  const button=$('qa-review-download'),hint=$('qa-review-hint');
  saving=true;update();
  try{
   if(hint)hint.textContent='Creo il confronto delle '+items.length+' pagine sul tuo PC…';
   const blob=await buildReport(items,(n,total)=>{
    if(button)button.textContent='Preparo '+n+' / '+total+'…';
   });
   downloadReport(blob);
   if(hint)hint.textContent='Collaudo salvato nei Download. Il PDF contiene originali e anteprime: verifica i dati prima di inviarlo.';
   return true;
  }catch(error){
   const msg=String(error?.message||error);
   if(hint)hint.textContent='Impossibile creare il collaudo: '+msg;
   console.error('DocFix: salvataggio collaudo non riuscito',error);
   return false;
  }finally{
   saving=false;
   if(button){button.disabled=false;button.textContent='↓ Scarica PDF per collaudo';}
  }
 }
 function init(){
  // The optional diagnostic tool belongs inside collapsed 'Opzioni PDF',
  // NOT above the document thumbnails or in the main toolbar.
  const host=document.querySelector('#workspace .advanced-options');
  if(!host||$('qa-review-panel'))return;
  const panel=document.createElement('div');panel.id='qa-review-panel';panel.className='qa-review-panel';panel.hidden=true;
  const info=document.createElement('div');info.className='qa-review-info';
  const title=document.createElement('strong');title.textContent='Condividi il collaudo dei ritagli';
  const hint=document.createElement('small');hint.id='qa-review-hint';hint.textContent='Originali e anteprime, senza confermare ritagli sbagliati.';
  info.append(title,hint);
  const button=document.createElement('button');button.type='button';button.id='qa-review-download';button.textContent='↓ Scarica PDF per collaudo';
  button.addEventListener('click',save);
  panel.append(info,button);host.appendChild(panel);
  document.addEventListener('docfix:repaint',update);
  document.addEventListener('docfix:reset',()=>{panel.hidden=true;});
  update();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 window.DocFixQAReport=Object.freeze({buildReport,makePage,save,update,version:'1.9.62-collaudo'});
})();
