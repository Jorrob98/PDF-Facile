(()=>{'use strict';
 const VERSION='1.4.1';
 function toast(message,kind='error'){
   let box=document.getElementById('docfix-runtime-message');
   if(!box){box=document.createElement('div');box.id='docfix-runtime-message';box.setAttribute('role','alert');document.body.appendChild(box);}
   box.className='docfix-runtime-message '+kind;box.textContent=message;box.hidden=false;
   clearTimeout(box._timer);box._timer=setTimeout(()=>box.hidden=true,9000);
 }
 const css=document.createElement('style');
 css.textContent=`
 .docfix-runtime-message{position:fixed;right:22px;bottom:22px;z-index:10000;max-width:440px;padding:14px 18px;border-radius:14px;background:#fff;color:#17384b;border:1px solid #d3e1e6;box-shadow:0 18px 60px #0d31452d;font:700 14px/1.45 system-ui;animation:docfix-in .16s ease-out}
 .docfix-runtime-message.error{border-left:5px solid #c55145}.docfix-runtime-message.ok{border-left:5px solid #0b9789}
 .desktop-tools{display:flex;align-items:center;gap:9px;margin-left:auto}
 .desktop-ready{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:#17675f;background:#e5f6f2;border:1px solid #c8e9e2;border-radius:999px;padding:8px 11px;white-space:nowrap}
 .desktop-ready i{width:8px;height:8px;border-radius:50%;background:#0aa58e;box-shadow:0 0 0 4px #0aa58e1a}
 .docfix-update-button{appearance:none;border:1px solid #cddde4;background:#fff;color:#17384b;border-radius:12px;padding:9px 13px;font:800 12px/1 system-ui;box-shadow:0 5px 16px #173b4b0d;transition:.16s}
 .docfix-update-button:hover{transform:translateY(-1px);border-color:#87bbb8;background:#f7fffd}.docfix-update-button:disabled{opacity:.55;transform:none}
 .docfix-update-button.available{border-color:#77cabb;background:#e8faf6;color:#0b6b62}
 .docfix-update-modal{position:fixed;inset:0;z-index:11000;display:grid;place-items:center;padding:24px;background:#102f434f;backdrop-filter:blur(7px)}
 .docfix-update-card{width:min(460px,100%);background:#fff;border-radius:22px;padding:26px;box-shadow:0 28px 90px #0d2f4340;border:1px solid #dce7eb}
 .docfix-update-card h3{margin:0 0 9px;font-size:24px;color:#12384e}.docfix-update-card p{margin:0 0 20px;color:#607887;line-height:1.55}
 .docfix-update-actions{display:flex;gap:10px;justify-content:flex-end}.docfix-update-actions button{border:0;border-radius:12px;padding:11px 15px;font-weight:850}
 .docfix-update-actions .later{background:#edf2f4;color:#496370}.docfix-update-actions .now{background:linear-gradient(135deg,#0b9b8c,#087f79);color:#fff}
 @keyframes docfix-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

 .desktop-version{font-size:11px;font-weight:850;color:#78909d;padding:7px 2px;white-space:nowrap}
 .docfix-flow{max-width:780px;margin:4px auto 8px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px;background:#ffffffb8;border:1px solid #dce7eb;border-radius:18px;box-shadow:0 12px 40px #14394a0b;backdrop-filter:blur(12px)}
 .docfix-flow-step{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;color:#65808f;font-size:12px;font-weight:760}
 .docfix-flow-step b{display:grid;place-items:center;flex:0 0 27px;height:27px;border-radius:9px;background:#e8f4f2;color:#0a7f75;font-size:12px}
 .docfix-flow-step strong{display:block;color:#294b5c;font-size:12px}.docfix-flow-step span{display:block;margin-top:2px;font-weight:600;font-size:10px;color:#8aa0ab}
 .dropzone{border-width:1px!important;position:relative;overflow:hidden;background:linear-gradient(180deg,#ffffff 0%,#fbfdfd 100%)!important}
 .dropzone:after{content:"";position:absolute;inset:8px;border:2px dashed #bfd6dd;border-radius:18px;pointer-events:none;transition:.18s}
 .dropzone:is(:hover,:focus-visible,.dragging):after{border-color:#67b9ad}
 .upload-icon{box-shadow:inset 0 0 0 1px #cfeae4,0 8px 24px #0d7f7514}
 .choose,.download,.reset,.card-controls button{transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease,background .14s ease}
 .choose:hover,.download:hover,.reset:hover,.card-controls button:hover{transform:translateY(-1px)}
 .workspace{padding-top:8px}
 .result-header{padding:8px 2px 3px}.result-header h2{color:#17384b}
 .pages{gap:18px}
 .page-card{border-color:#dbe7eb!important;border-radius:20px!important;box-shadow:0 10px 30px #143b4d0d!important;transition:transform .15s ease,box-shadow .15s ease}
 .page-card:hover{transform:translateY(-2px);box-shadow:0 16px 38px #143b4d16!important}
 .page-card.needs-check{border-color:#e9bb68!important;box-shadow:0 10px 30px #b66f1712!important}
 .preview{background:linear-gradient(135deg,#edf3f5,#f8fafb)!important;border-bottom:1px solid #e3ecef!important}
 .preview img{border-radius:5px;box-shadow:0 8px 26px #173c4d24!important}
 .card-info{padding:16px!important}.card-info strong{font-size:13px!important;color:#23495c}
 .card-controls button{background:#fff!important;border-color:#cddde3!important}.card-controls button:hover{border-color:#83bbb7!important;background:#f6fffd!important}
 .warnings{border:1px solid #f0d496}
 .action-bar{position:sticky;bottom:16px;z-index:15;width:max-content;max-width:100%;margin:30px auto 16px!important;padding:9px!important;border:1px solid #d5e2e7;background:#ffffffed;backdrop-filter:blur(16px);border-radius:18px;box-shadow:0 18px 48px #15394a20}
 .download{min-width:250px!important;background:linear-gradient(135deg,#0c9a8d,#087c78)!important;box-shadow:0 9px 24px #0a817a2b}
 .reset{background:#f9fbfc!important}
 .sizes{margin-top:6px}
 footer{opacity:.82}
  @media(max-width:760px){.top{height:auto!important;gap:10px;flex-wrap:wrap}.desktop-tools{width:100%;justify-content:flex-end}.desktop-ready{display:none}}
 @media(max-width:760px){.docfix-flow{grid-template-columns:1fr;margin-inline:4px}.docfix-flow-step span{display:none}.desktop-version{display:none}.action-bar{width:100%!important}.download{min-width:0!important;flex:1}}

 `;document.head.appendChild(css);

 function updateModal(latest,notes){
   return new Promise(resolve=>{
     const wrap=document.createElement('div');wrap.className='docfix-update-modal';
     const shortNotes=String(notes||'').trim().split('\n').filter(Boolean).slice(0,3).join(' · ');
     wrap.innerHTML=`<div class="docfix-update-card" role="dialog" aria-modal="true" aria-label="Aggiornamento DocFix">
       <h3>DocFix ${latest} è disponibile</h3>
       <p>${shortNotes?shortNotes.replace(/[<>&]/g,''): 'Scarico solo il piccolo aggiornamento e riavvio DocFix automaticamente.'}</p>
       <div class="docfix-update-actions"><button class="later" type="button">Più tardi</button><button class="now" type="button">Aggiorna ora</button></div>
     </div>`;
     const done=v=>{wrap.remove();resolve(v)};
     wrap.querySelector('.later').onclick=()=>done(false);wrap.querySelector('.now').onclick=()=>done(true);
     wrap.addEventListener('click',e=>{if(e.target===wrap)done(false)});
     document.body.appendChild(wrap);wrap.querySelector('.now').focus();
   });
 }
 async function handleUpdate(button){
   if(!window.DocFixUpdater){toast('Aggiornamenti automatici non disponibili in questa versione.','error');return}
   const old=button.textContent;button.disabled=true;button.textContent='Controllo…';
   try{
     const r=await window.DocFixUpdater.check();
     if(!r?.ok)throw Error(r?.error||'Controllo aggiornamenti non riuscito');
     if(!r.available){button.classList.remove('available');toast('DocFix è già aggiornato alla versione '+r.current+'.','ok');return}
     button.classList.add('available');button.textContent='Aggiorna alla '+r.latest;
     const yes=await updateModal(r.latest,r.notes);
     if(!yes)return;
     button.disabled=true;button.textContent='Scarico aggiornamento…';toast('Sto scaricando e verificando DocFix '+r.latest+'…','ok');
     const install=await window.DocFixUpdater.install();
     if(!install?.ok)throw Error(install?.error||'Installazione aggiornamento non riuscita');
     if(!install.available){toast('DocFix è già aggiornato.','ok');return}
     button.textContent='Applico aggiornamento…';
   }catch(e){console.error(e);toast('Aggiornamento non riuscito: '+(e?.message||e),'error')}
   finally{if(document.body.isConnected&&button.textContent!=='Applico aggiornamento…'){button.disabled=false;if(!button.classList.contains('available'))button.textContent=old;}}
 }
 window.addEventListener('error',e=>{console.error('DocFix runtime error',e.error||e.message);toast('DocFix ha rilevato un problema inatteso. La pratica resta aperta: prova di nuovo oppure avvia un nuovo documento.');});
 window.addEventListener('unhandledrejection',e=>{console.error('DocFix async error',e.reason);toast('Un’operazione non è riuscita. I file originali non sono stati modificati.');});
 window.addEventListener('dragover',e=>e.preventDefault(),true);
 window.addEventListener('drop',e=>e.preventDefault(),true);
 document.addEventListener('DOMContentLoaded',()=>{
   const top=document.querySelector('.top');
   if(top&&!document.querySelector('.desktop-tools')){
     const tools=document.createElement('div');tools.className='desktop-tools';
     const version=document.createElement('span');version.className='desktop-version';version.textContent='v'+VERSION;
     const badge=document.createElement('span');badge.className='desktop-ready';badge.innerHTML='<i></i> Offline · pronto';
     const update=document.createElement('button');update.id='docfix-update-button';update.className='docfix-update-button';update.type='button';update.textContent='↻ Aggiorna DocFix';
     update.addEventListener('click',()=>handleUpdate(update));
     tools.append(version,badge,update);top.appendChild(tools);
   }
   const intro=document.querySelector('.intro');
   if(intro&&!document.querySelector('.docfix-flow')){
     const flow=document.createElement('div');flow.className='docfix-flow';flow.setAttribute('aria-label','Flusso DocFix');
     flow.innerHTML='<div class="docfix-flow-step"><b>1</b><div><strong>Carica</strong><span>Foto o PDF</span></div></div><div class="docfix-flow-step"><b>2</b><div><strong>Controlla</strong><span>DocFix sistema bordi e verso</span></div></div><div class="docfix-flow-step"><b>3</b><div><strong>Scarica</strong><span>PDF pronto</span></div></div>';
     intro.insertAdjacentElement('afterend',flow);
   }
 });
 window.DocFixStability=Object.freeze({version:VERSION,toast});
})();