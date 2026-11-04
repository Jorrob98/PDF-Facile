(()=>{'use strict';
 const VERSION='1.1.0';
 function toast(message,kind='error'){
   let box=document.getElementById('docfix-runtime-message');
   if(!box){box=document.createElement('div');box.id='docfix-runtime-message';box.setAttribute('role','alert');document.body.appendChild(box);}
   box.className='docfix-runtime-message '+kind;box.textContent=message;box.hidden=false;
   clearTimeout(box._timer);box._timer=setTimeout(()=>box.hidden=true,8000);
 }
 const css=document.createElement('style');
 css.textContent=`
 .docfix-runtime-message{position:fixed;right:22px;bottom:22px;z-index:10000;max-width:440px;padding:14px 18px;border-radius:14px;background:#fff;color:#17384b;border:1px solid #d3e1e6;box-shadow:0 18px 60px #0d31452d;font:700 14px/1.45 system-ui;animation:docfix-in .16s ease-out}
 .docfix-runtime-message.error{border-left:5px solid #c55145}.docfix-runtime-message.ok{border-left:5px solid #0b9789}
 .desktop-ready{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:#17675f;background:#e5f6f2;border:1px solid #c8e9e2;border-radius:999px;padding:8px 11px}
 .desktop-ready i{width:8px;height:8px;border-radius:50%;background:#0aa58e;box-shadow:0 0 0 4px #0aa58e1a}
 @keyframes docfix-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
 `;document.head.appendChild(css);
 window.addEventListener('error',e=>{console.error('DocFix runtime error',e.error||e.message);toast('DocFix ha rilevato un problema inatteso. La pratica resta aperta: prova di nuovo oppure avvia un nuovo documento.');});
 window.addEventListener('unhandledrejection',e=>{console.error('DocFix async error',e.reason);toast('Un’operazione non è riuscita. I file originali non sono stati modificati.');});
 window.addEventListener('dragover',e=>e.preventDefault(),true);
 window.addEventListener('drop',e=>e.preventDefault(),true);
 document.addEventListener('DOMContentLoaded',()=>{
   const top=document.querySelector('.top');
   if(top&&!document.querySelector('.desktop-ready')){const badge=document.createElement('span');badge.className='desktop-ready';badge.innerHTML='<i></i> Offline · pronto';top.appendChild(badge);}
 });
 window.DocFixStability=Object.freeze({version:VERSION,toast});
})();