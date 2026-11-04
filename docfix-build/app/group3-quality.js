/* DocFix Gruppo 3 — fedeltà fotografica. Nessuna rete, nessun filtro distruttivo.
 * La prima decodifica avviene una volta; la compressione JPEG avviene
 * soltanto durante la generazione del PDF, mai nelle anteprime.
 * Limiti imposti per evitare di saturare la RAM su telefono/tablet.
 */
(()=>{'use strict';
 const MAX_EDGE=4800,MAX_PIXELS=18_000_000;
 const PROFILES=Object.freeze({high:0.96,compact:0.85});
 function inputScale(w,h,usedPixels=MAX_PIXELS){
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1)throw Error('Dimensioni immagine non valide');
  return Math.min(1,MAX_EDGE/Math.max(w,h),Math.sqrt(Math.min(MAX_PIXELS,Math.max(1,usedPixels))/(w*h)));
 }
 async function encodeJPEG(canvas,profile='high'){
  const quality=PROFILES[profile]??PROFILES.high;
  if(!canvas?.width||!canvas?.height)throw Error('Immagine PDF vuota');
  return await new Promise((resolve,reject)=>{
   canvas.toBlob(async blob=>{
    if(!blob){reject(Error('Impossibile convertire la pagina in JPEG'));return;}
    try{resolve(await blob.arrayBuffer());}catch(e){reject(e)}
   },'image/jpeg',quality)
  });
 }
 function pixelBudget(pages){const count=Math.max(1,Math.round(Number(pages)||1));return Math.min(MAX_PIXELS,48_000_000/count);}
 window.DocFixGroup3=Object.freeze({inputScale,pixelBudget,encodeJPEG,profiles:PROFILES,limits:Object.freeze({maxEdge:MAX_EDGE,maxPixels:MAX_PIXELS,batchPixels:48_000_000})});
})();