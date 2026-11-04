(()=>{'use strict';
 const VERSION='1.3.0';
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
 @media(max-width:760px){.top{height:auto!important;gap:10px;flex-wrap:wrap}.desktop-tools{width:100%;justify-content:flex-end}.desktop-ready{display:none}}
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
     button.textContent='Riavvio DocFix…';
   }catch(e){console.error(e);toast('Aggiornamento non riuscito: '+(e?.message||e),'error')}
   finally{if(document.body.isConnected&&button.textContent!=='Riavvio DocFix…'){button.disabled=false;if(!button.classList.contains('available'))button.textContent=old;}}
 }
 window.addEventListener('error',e=>{console.error('DocFix runtime error',e.error||e.message);toast('DocFix ha rilevato un problema inatteso. La pratica resta aperta: prova di nuovo oppure avvia un nuovo documento.');});
 window.addEventListener('unhandledrejection',e=>{console.error('DocFix async error',e.reason);toast('Un’operazione non è riuscita. I file originali non sono stati modificati.');});
 window.addEventListener('dragover',e=>e.preventDefault(),true);
 window.addEventListener('drop',e=>e.preventDefault(),true);
 document.addEventListener('DOMContentLoaded',()=>{
   const top=document.querySelector('.top');
   if(top&&!document.querySelector('.desktop-tools')){
     const tools=document.createElement('div');tools.className='desktop-tools';
     const badge=document.createElement('span');badge.className='desktop-ready';badge.innerHTML='<i></i> Offline · pronto';
     const update=document.createElement('button');update.id='docfix-update-button';update.className='docfix-update-button';update.type='button';update.textContent='↻ Aggiorna DocFix';
     update.addEventListener('click',()=>handleUpdate(update));
     tools.append(badge,update);top.appendChild(tools);
   }
 });
 window.DocFixStability=Object.freeze({version:VERSION,toast});
})();