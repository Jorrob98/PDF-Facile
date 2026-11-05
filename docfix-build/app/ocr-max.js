(()=>{'use strict';
const VERSION='1.8.1';
let workerPromise=null,workerIdleTimer=null,queue=[],queuedEntries=new Set(),running=false,cloudStatus=null,settingsOpen=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function ensureStyle(){
 if(document.getElementById('docfix-ocr-max-style'))return;
 const s=document.createElement('style');s.id='docfix-ocr-max-style';s.textContent=`
 .ocr-max-button{appearance:none;border:1px solid #b8d9d2;background:#e8faf6;color:#086b61;border-radius:12px;padding:9px 13px;font:900 12px/1 system-ui;box-shadow:0 5px 16px #173b4b0d}
 .ocr-max-button.active{background:#087f79;color:#fff;border-color:#087f79}.ocr-max-button:disabled{opacity:.55}
 .ocr-page-status{width:100%;margin-top:9px;border:1px solid #d3e5e4;border-radius:10px;background:#f5fbfa;color:#235868;padding:8px 10px;text-align:left;font:800 11px/1.35 system-ui}
 .ocr-page-status.working{color:#775315;background:#fff8e7;border-color:#efd8a0}.ocr-page-status.bad{color:#9a3f35;background:#fff5f3;border-color:#efc6c2}
 .ocr-modal{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:24px;background:#102f4360;backdrop-filter:blur(8px)}
 .ocr-card{width:min(760px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #dce8eb;border-radius:22px;padding:24px;box-shadow:0 30px 100px #0c2f4444}
 .ocr-card h3{margin:0 0 7px;color:#12384e;font-size:24px}.ocr-card p{color:#607887;line-height:1.5}
 .ocr-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.ocr-grid .wide{grid-column:1/-1}
 .ocr-field label{display:block;font-size:12px;font-weight:850;color:#365a6c;margin:0 0 6px}.ocr-field input{width:100%;border:1px solid #c8dce2;border-radius:10px;padding:11px 12px;color:#17384b;background:#fbfdfd}
 .ocr-provider{border:1px solid #dde8eb;border-radius:14px;padding:14px;margin:14px 0;background:#fbfdfd}.ocr-provider strong{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#23495c}
 .ocr-ok{color:#087c70}.ocr-off{color:#8b6d3c}.ocr-actions{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap;margin-top:18px}.ocr-actions button{border:0;border-radius:11px;padding:11px 14px;font-weight:850}
 .ocr-actions .primary{background:#0b8f84;color:#fff}.ocr-actions .secondary{background:#edf2f4;color:#405f70}.ocr-actions .danger{background:#fff0ef;color:#9b3d35}
 .ocr-result-meta{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.ocr-chip{padding:6px 9px;border-radius:999px;background:#e9f6f3;color:#146d64;font-size:11px;font-weight:850}
 .ocr-text{width:100%;min-height:280px;resize:vertical;border:1px solid #cbdde2;border-radius:12px;padding:13px;font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;color:#17384b;background:#fbfdfd}
 .ocr-fields{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}.ocr-field-chip{padding:6px 9px;border-radius:9px;background:#f0f5f7;color:#36596a;font:750 11px system-ui}
 @media(max-width:700px){.ocr-grid{grid-template-columns:1fr}.ocr-grid .wide{grid-column:auto}.ocr-card{padding:18px}}
 `;document.head.appendChild(s);
}
function abs(p){return new URL(p,location.href).toString()}
async function loadTesseract(){
 if(window.Tesseract)return window.Tesseract;
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/tesseract/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(Error('Motore OCR locale non disponibile'));document.head.appendChild(s)});
 return window.Tesseract;
}
async function worker(){
 if(workerIdleTimer){clearTimeout(workerIdleTimer);workerIdleTimer=null}
 if(!workerPromise)workerPromise=(async()=>{
  const T=await loadTesseract();
  return T.createWorker(['ita','eng'],1,{
   legacyCore:true,legacyLang:true,
   workerPath:abs('./vendor/tesseract/worker.min.js'),
   corePath:abs('./vendor/tesseract-core/'),
   langPath:abs('./vendor/tessdata/'),gzip:true
  });
 })().catch(e=>{workerPromise=null;throw e});
 return workerPromise;
}
async function releaseWorkerNow(){
 if(workerIdleTimer){clearTimeout(workerIdleTimer);workerIdleTimer=null}
 const w=workerPromise;workerPromise=null;
 try{const resolved=await w;await resolved?.terminate?.()}catch{}
}
function scheduleWorkerRelease(){
 if(workerIdleTimer)clearTimeout(workerIdleTimer);
 workerIdleTimer=setTimeout(()=>{void releaseWorkerNow()},90000);
}
function makeCanvas(source,w,h,filter='none'){
 const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));
 const g=c.getContext('2d',{alpha:false});g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.filter=filter;g.drawImage(source,0,0,c.width,c.height);g.filter='none';return c;
}
function upscale(source){
 const minSide=Math.min(source.width,source.height),maxSide=Math.max(source.width,source.height);
 let scale=Math.max(1,1450/Math.max(1,minSide));scale=Math.min(scale,2.4,3200/Math.max(1,maxSide));
 if(maxSide*scale<1800)scale=Math.min(2.4,1800/maxSide);
 return makeCanvas(source,source.width*scale,source.height*scale);
}
function variants(source){
 const natural=upscale(source);
 const contrast=makeCanvas(natural,natural.width,natural.height,'grayscale(1) contrast(1.34) brightness(1.05)');
 let bw=null;
 try{bw=window.DocFixScanner?.process?.(natural,{crop:false,rotation:0,filter:'bw',strength:78},3000)||null}catch{}
 if(!bw)bw=makeCanvas(natural,natural.width,natural.height,'grayscale(1) contrast(1.8)');
 return {natural,contrast,bw};
}
function normalizeTokens(text){return String(text||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[A-Z0-9]{2,}/g)||[]}
function cfValid(cf){
 cf=String(cf||'').toUpperCase();if(!/^[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]$/.test(cf))return false;
 const odd={0:1,1:0,2:5,3:7,4:9,5:13,6:15,7:17,8:19,9:21,A:1,B:0,C:5,D:7,E:9,F:13,G:15,H:17,I:19,J:21,K:2,L:4,M:18,N:20,O:11,P:3,Q:6,R:8,S:12,T:14,U:16,V:10,W:22,X:25,Y:24,Z:23};
 const even={0:0,1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,A:0,B:1,C:2,D:3,E:4,F:5,G:6,H:7,I:8,J:9,K:10,L:11,M:12,N:13,O:14,P:15,Q:16,R:17,S:18,T:19,U:20,V:21,W:22,X:23,Y:24,Z:25};
 let sum=0;for(let i=0;i<15;i++)sum+=(i%2===0?odd:even)[cf[i]];return String.fromCharCode(65+(sum%26))===cf[15];
}
function signals(text){
 const up=String(text||'').toUpperCase().replace(/[\s.-]+/g,' ');
 const cfs=(up.match(/\b[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]\b/g)||[]).filter(cfValid);
 const vins=up.match(/\b[A-HJ-NPR-Z0-9]{17}\b/g)||[];
 const plates=up.match(/\b[A-Z]{2}\s?[0-9]{3}\s?[A-Z]{2}\b/g)||[];
 const dates=up.match(/\b(?:0?[1-9]|[12][0-9]|3[01])[\/. -](?:0?[1-9]|1[0-2])[\/. -](?:19|20)[0-9]{2}\b/g)||[];
 const mrz=String(text||'').toUpperCase().split(/\r?\n/).map(x=>x.replace(/\s/g,'')).filter(x=>/^[A-Z0-9<]{28,44}$/.test(x));
 return {cfs:[...new Set(cfs)],vins:[...new Set(vins)],plates:[...new Set(plates)],dates:[...new Set(dates)],mrz:[...new Set(mrz)]};
}
function localScore(r){
 const conf=clamp((Number(r.confidence)||0)/100,0,1),tokens=normalizeTokens(r.text),sig=signals(r.text);
 const validated=sig.cfs.length+sig.vins.length+sig.plates.length+sig.dates.length+sig.mrz.length;
 const chars=String(r.text||'').length,alnum=(String(r.text||'').match(/[A-Za-z0-9]/g)||[]).length/Math.max(1,chars);
 return conf*.68+Math.min(1,tokens.length/35)*.12+Math.min(1,validated/3)*.15+alnum*.05;
}
async function recognizeOne(w,canvas,psm){
 const T=await loadTesseract();
 await w.setParameters({
  tessedit_pageseg_mode:psm,
  preserve_interword_spaces:'1',
  user_defined_dpi:'300'
 });
 const r=await w.recognize(canvas);
 return {text:String(r?.data?.text||'').trim(),confidence:Number(r?.data?.confidence)||0};
}
async function localMultiPass(source){
 const v=variants(source),w=await worker(),T=await loadTesseract();
 const P=T.PSM||{};
 const passes=[
  ['natural',v.natural,P.SINGLE_BLOCK??'6'],
  ['contrast',v.contrast,P.SPARSE_TEXT??'11'],
  ['bw',v.bw,P.SINGLE_BLOCK??'6']
 ];
 const results=[];
 for(const [name,c,psm] of passes){
  try{const r=await recognizeOne(w,c,psm);results.push({...r,name,score:localScore(r)});}catch(e){console.warn('OCR pass failed',name,e);}
  await sleep(0);
 }
 results.sort((a,b)=>b.score-a.score);
 const first=results[0];
 if(!first||first.score<.79||first.confidence<80){
  const rescue=makeCanvas(v.natural,v.natural.width,v.natural.height,'grayscale(1) contrast(1.95) brightness(1.08)');
  try{const r=await recognizeOne(w,rescue,P.SPARSE_TEXT??'11');results.push({...r,name:'rescue',score:localScore(r)});}catch(e){console.warn('OCR rescue failed',e);}
  rescue.width=rescue.height=1;
  results.sort((a,b)=>b.score-a.score);
 }
 return {best:results[0]||{text:'',confidence:0,score:0,name:'none'},results,variants:v};
}
async function canvasBase64(canvas,quality=.94){
 let c=canvas;
 // Keep JSON payload below Google Vision's 10 MB request limit.
 if(Math.max(c.width,c.height)>2800){
  const scale=2800/Math.max(c.width,c.height);c=makeCanvas(c,c.width*scale,c.height*scale);
 }
 for(const q of [quality,.90,.84]){
  const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Immagine OCR non esportabile')),'image/jpeg',q));
  if(blob.size<=6.8*1024*1024){
   const bytes=new Uint8Array(await blob.arrayBuffer());let bin='';const step=0x8000;
   for(let i=0;i<bytes.length;i+=step)bin+=String.fromCharCode(...bytes.subarray(i,i+step));
   return btoa(bin);
  }
 }
 throw Error('Immagine OCR troppo grande');
}
function providerLabel(p){return p==='google'?'Google Vision':p==='azure'?'Azure Read':p==='azure-id'?'Azure ID Document':p==='tesseract'?'Tesseract IT+EN':p==='pdf-text'?'Testo PDF originale':String(p||'OCR')}
async function getCloudStatus(){
 if(!window.DocFixOCRCloud)return {google:{configured:false},azure:{configured:false},secureStorage:false};
 const r=await window.DocFixOCRCloud.status();cloudStatus=r;return r;
}
function host(){return window.DocFixOcrHost||null}
function repaint(){try{host()?.repaint?.()}catch{}}

async function analyzeEntry(entry,force=false){
 if(!entry?.processed||host()?.indexOf?.(entry)<0)return;
 if(entry.embeddedText&&entry.embeddedText.length>=20&&!force){
  entry.ocrResult={text:entry.embeddedText,confidence:.995,score:.995,provider:'pdf-text',signals:signals(entry.embeddedText),candidates:[{provider:'pdf-text',text:entry.embeddedText,confidence:.995}],errors:[],localPasses:[]};
  entry.ocrState='ready';repaint();return;
 }
 if(entry.ocrState==='working')return;
 if(entry.ocrResult&&!force)return;
 entry.ocrState='working';entry.ocrError='';repaint();
 let local=null;
 try{
  local=await localMultiPass(entry.processed);const st=cloudStatus||await getCloudStatus();
  if(host()?.indexOf?.(entry)<0)return;
  let final={provider:'tesseract',text:local.best.text,confidence:clamp(local.best.confidence/100,0,1),score:local.best.score,signals:signals(local.best.text)};
  let candidates=[final],errors=[];
  if((st.google?.configured||st.azure?.configured)&&window.DocFixOCRCloud){
   const imageBase64=await canvasBase64(local.variants.natural,.95);
   const altImageBase64=await canvasBase64(local.variants.bw,.93);
   const shape=Math.max(entry.processed.width,entry.processed.height)/Math.max(1,Math.min(entry.processed.width,entry.processed.height));
   const cloud=await window.DocFixOCRCloud.recognize({
    imageBase64,altImageBase64,identityLikely:shape>=1.45&&shape<=1.90,
    local:{text:local.best.text,confidence:clamp(local.best.confidence/100,0,1)}
   });
   if(cloud?.candidates?.length)candidates=cloud.candidates;
   if(cloud?.best)final=cloud.best;
   if(cloud?.rescuedSignals)final={...final,signals:cloud.rescuedSignals};
   final={...final,structuredFields:cloud?.structuredFields||[]};
   errors=cloud?.errors||[];
  }
  if(host()?.indexOf?.(entry)<0)return;
  entry.ocrResult={
   text:String(final.text||'').trim(),
   confidence:clamp(Number(final.confidence)||0,0,1),
   score:clamp(Number(final.score)||Number(final.confidence)||0,0,1),
   provider:final.provider||'tesseract',
   signals:final.signals||signals(final.text),
   structuredFields:final.structuredFields||[],
   candidates,errors,
   localPasses:local.results.map(x=>({name:x.name,confidence:x.confidence,score:x.score}))
  };
  entry.ocrState=entry.ocrResult.text?'ready':'bad';
 }catch(e){
  console.error('OCR MAX',e);entry.ocrState='bad';entry.ocrError=String(e?.message||e);
 }finally{
  for(const c of Object.values(local?.variants||{})){try{c.width=c.height=1}catch{}}
  repaint();
 }
}
function enqueue(entry,force=false){
 if(!entry)return;
 if(queuedEntries.has(entry)&&!force)return;
 if(force){queue=queue.filter(x=>x.entry!==entry);queuedEntries.delete(entry)}
 queuedEntries.add(entry);queue.push({entry,force});void drain();
}
async function drain(){
 if(running)return;running=true;
 try{
  while(queue.length){
   while(host()?.isBusy?.())await sleep(250);
   const x=queue.shift();queuedEntries.delete(x.entry);
   await analyzeEntry(x.entry,x.force);
  }
 }finally{running=false;scheduleWorkerRelease()}
}

function decorate(entries){
 const cards=Array.from(document.querySelectorAll('.page-card'));
 entries.forEach((e,i)=>{
  const card=cards[i];if(!card)return;
  let b=card.querySelector('.ocr-page-status');
  if(!b){b=document.createElement('button');b.type='button';b.className='ocr-page-status';card.querySelector('.card-info')?.appendChild(b);}
  b.classList.toggle('working',e.ocrState==='working');b.classList.toggle('bad',e.ocrState==='bad');
  if(e.ocrState==='working')b.textContent='OCR MAX · lettura approfondita in corso…';
  else if(e.ocrState==='ready'){
   const pct=Math.round((e.ocrResult?.confidence||0)*100),prov=providerLabel(e.ocrResult?.provider);
   b.textContent='OCR MAX · '+prov+(pct?' · '+pct+'%':'')+' · apri testo';
  }else if(e.ocrState==='bad')b.textContent='OCR MAX · da riprovare'+(e.ocrError?' · '+e.ocrError:'');
  else b.textContent='OCR MAX · in attesa';
  b.onclick=()=>e.ocrResult?openResult(e):enqueue(e,true);
 });
}
function fieldChips(s,structured=[]){
 const all=[...s.cfs.map(x=>'CF '+x),...s.vins.map(x=>'VIN '+x),...s.plates.map(x=>'Targa '+x),...s.dates.map(x=>'Data '+x),...s.mrz.map(x=>'MRZ '+x)];
 for(const f of structured||[]){
  const pct=Number.isFinite(Number(f.confidence))?' · '+Math.round(Number(f.confidence)*100)+'%':'';
  all.push(String(f.name||'Campo')+': '+String(f.value||'')+pct);
 }
 return [...new Set(all)].map(x=>'<span class="ocr-field-chip">'+escapeHtml(x)+'</span>').join('');
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function modal(html){
 const wrap=document.createElement('div');wrap.className='ocr-modal';wrap.innerHTML='<div class="ocr-card">'+html+'</div>';document.body.appendChild(wrap);wrap.addEventListener('click',e=>{if(e.target===wrap&&wrap.dataset.locked!=='1')wrap.remove()});return wrap;
}
function openResult(entry){
 const r=entry.ocrResult||{},s=r.signals||signals(r.text),providers=[...new Set((r.candidates||[]).map(x=>providerLabel(x.provider)))];
 const wrap=modal(`
  <h3>OCR MAX · testo recuperato</h3>
  <p>Il testo viene scelto confrontando più letture. Controlla sempre i campi evidenziati se il documento originale è molto rovinato.</p>
  <div class="ocr-result-meta">
   <span class="ocr-chip">Motore scelto: ${escapeHtml(providerLabel(r.provider))}</span>
   <span class="ocr-chip">Confidenza: ${Math.round((r.confidence||0)*100)}%</span>
   ${providers.map(x=>'<span class="ocr-chip">'+escapeHtml(x)+'</span>').join('')}
  </div>
  <div class="ocr-fields">${fieldChips(s,r.structuredFields)||'<span class="ocr-field-chip">Nessun campo strutturato validato</span>'}</div>
  <textarea class="ocr-text" spellcheck="false"></textarea>
  ${r.errors?.length?'<p>'+r.errors.map(escapeHtml).join(' · ')+'</p>':''}
  <div class="ocr-actions"><button class="secondary copy">Copia testo</button><button class="secondary retry">Rileggi al massimo</button><button class="primary close">Chiudi</button></div>
 `);
 const ta=wrap.querySelector('.ocr-text');ta.value=r.text||'';
 wrap.querySelector('.copy').onclick=async()=>{try{await navigator.clipboard.writeText(ta.value);wrap.querySelector('.copy').textContent='Copiato ✓'}catch{}};
 wrap.querySelector('.retry').onclick=()=>{wrap.remove();entry.ocrResult=null;enqueue(entry,true)};
 wrap.querySelector('.close').onclick=()=>wrap.remove();
}
async function openSettings(){
 if(settingsOpen)return;settingsOpen=true;
 try{
  const st=await getCloudStatus();
  const wrap=modal(`
   <h3>OCR MAX 1.8.1</h3>
   <p>Tesseract italiano+inglese lavora sempre. Google Vision EU è il motore cloud principale; Azure Read interviene automaticamente sui casi dubbi.</p>
   <div class="ocr-provider"><strong>Google Vision EU <span class="${st.google?.configured?'ocr-ok':'ocr-off'}">${st.google?.configured?'Configurato ✓':'Da configurare'}</span></strong>
    <div class="ocr-grid" style="margin-top:12px">
     <div class="ocr-field"><label>Project ID Google Cloud</label><input class="g-project" autocomplete="off" value="${escapeHtml(st.google?.projectId||'')}"></div>
     <div class="ocr-field"><label>API key Google Vision</label><input class="g-key" type="password" autocomplete="new-password" placeholder="${st.google?.configured?'Salvata · lascia vuoto per mantenerla':'Inserisci API key'}"></div>
    </div>
   </div>
   <div class="ocr-provider"><strong>Azure Document Intelligence <span class="${st.azure?.configured?'ocr-ok':'ocr-off'}">${st.azure?.configured?'Configurato ✓':'Facoltativo · fallback'}</span></strong>
    <div class="ocr-grid" style="margin-top:12px">
     <div class="ocr-field wide"><label>Endpoint Azure</label><input class="a-endpoint" autocomplete="off" value="${escapeHtml(st.azure?.endpoint||'')}" placeholder="https://...cognitiveservices.azure.com"></div>
     <div class="ocr-field wide"><label>Azure key</label><input class="a-key" type="password" autocomplete="new-password" placeholder="${st.azure?.configured?'Salvata · lascia vuoto per mantenerla':'Inserisci chiave'}"></div>
    </div>
   </div>
   <p>Le chiavi vengono cifrate da Windows sul PC. Quando OCR MAX Cloud è attivo, l’immagine della pagina viene inviata ai provider configurati esclusivamente per il riconoscimento OCR.</p>
   <div class="ocr-actions"><button class="danger clear-g">Rimuovi Google</button><button class="danger clear-a">Rimuovi Azure</button><button class="secondary close">Annulla</button><button class="primary save">Salva OCR MAX</button></div>
  `);
  wrap.dataset.locked='1';
  const close=()=>{wrap.remove();settingsOpen=false};
  wrap.querySelector('.close').onclick=close;
  wrap.querySelector('.save').onclick=async()=>{
   const r=await window.DocFixOCRCloud.saveConfig({
    googleProjectId:wrap.querySelector('.g-project').value,
    googleApiKey:wrap.querySelector('.g-key').value,
    azureEndpoint:wrap.querySelector('.a-endpoint').value,
    azureKey:wrap.querySelector('.a-key').value
   });
   if(!r?.ok){alert(r?.error||'Impossibile salvare OCR MAX');return}
   cloudStatus=r;close();refreshHeader();
  };
  wrap.querySelector('.clear-g').onclick=async()=>{const r=await window.DocFixOCRCloud.saveConfig({clearGoogle:true});if(r?.ok){cloudStatus=r;close();refreshHeader();}};
  wrap.querySelector('.clear-a').onclick=async()=>{const r=await window.DocFixOCRCloud.saveConfig({clearAzure:true});if(r?.ok){cloudStatus=r;close();refreshHeader();}};
 }catch(e){settingsOpen=false;alert(String(e?.message||e))}
}
async function refreshHeader(){
 ensureStyle();const tools=document.querySelector('.desktop-tools');if(!tools)return;
 let b=document.getElementById('docfix-ocr-max-button');
 if(!b){b=document.createElement('button');b.id='docfix-ocr-max-button';b.className='ocr-max-button';b.type='button';b.onclick=openSettings;tools.insertBefore(b,tools.firstChild);}
 const st=cloudStatus||await getCloudStatus().catch(()=>null);
 const cloud=st?.google?.configured||st?.azure?.configured;b.classList.toggle('active',Boolean(cloud));
 b.textContent=cloud?'OCR MAX · CLOUD':'OCR MAX · LOCALE';
 b.title='Configura OCR MAX';
}

document.addEventListener('docfix:entries-added',e=>{for(const entry of e.detail?.entries||[])enqueue(entry,false)});
document.addEventListener('docfix:entry-changed',e=>{const entry=e.detail?.entry;if(entry){entry.ocrResult=null;enqueue(entry,true)}});
document.addEventListener('docfix:reset',()=>{queue=[];queuedEntries.clear();if(!running)void releaseWorkerNow()});
document.addEventListener('docfix:repaint',e=>decorate(e.detail?.entries||[]));
document.addEventListener('DOMContentLoaded',()=>{ensureStyle();setTimeout(refreshHeader,0);const existing=host()?.entries?.()||[];for(const e of existing)if(!e.ocrResult)enqueue(e,false);});
window.DocFixOCRMax=Object.freeze({version:VERSION,analyzeEntry,openResult,openSettings,signals});
})();