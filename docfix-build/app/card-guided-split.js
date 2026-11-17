/* DocFix 1.9.49: user-initiated two-card recovery.
   Never verifies physical contours or exports an unconfirmed crop.
   This is a fallback when automatic discovery misses one photographed card.
*/
(()=>{'use strict';
 function boxQuad(x0,y0,x1,y1){
  return [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
 }
 function area(q){
  return Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
 }
 function validCandidate(q){
  return Array.isArray(q)&&q.length===4&&q.every(p=>Number.isFinite(p.x)&&
   Number.isFinite(p.y)&&p.x>=.002&&p.x<=.998&&p.y>=.002&&p.y<=.998)&&
   area(q)>.055&&area(q)<.80;
 }
 function bounds(q){
  const xs=q.map(p=>p.x),ys=q.map(p=>p.y);
  return {l:Math.min(...xs),r:Math.max(...xs),t:Math.min(...ys),b:Math.max(...ys)};
 }
 function usablePair(cards,portrait){
  if(!Array.isArray(cards)||cards.length!==2||cards.some(c=>!validCandidate(c?.quad)))return false;
  const [a,b]=cards.map(c=>bounds(c.quad));
  // An optional detector may prefill, but can never bypass manual confirmation.
  if(portrait){
   if(a.t>=b.t||a.b>=b.t+.06||a.r-a.l<.32||b.r-b.l<.32)return false;
  }else if(a.l>=b.l||a.r>=b.l+.06||a.b-a.t<.32||b.b-b.t<.32)return false;
  const ar=a.r-a.l,br=b.r-b.l,at=a.b-a.t,bt=b.b-b.t;
  if(Math.max(ar,br)/Math.max(.001,Math.min(ar,br))>1.8||
     Math.max(at,bt)/Math.max(.001,Math.min(at,bt))>1.8)return false;
  return true;
 }
 function propose(original,detected){
  if(!original||!(original.width>0&&original.height>0))return null;
  const portrait=original.height>=original.width*1.12;
  const landscape=original.width>=original.height*1.12;
  if(!portrait&&!landscape)return null;
  // Keep an overlap of 8% of the source along the separating axis.
  // This overlap is intentional: the operator moves corners to the
  // *physical* card perimeter, and no cropped preview is exportable yet.
  const fallback=portrait?[
   boxQuad(.02,.015,.98,.545),boxQuad(.02,.455,.98,.985)
  ]:[
   boxQuad(.015,.02,.545,.98),boxQuad(.455,.02,.985,.98)
  ];
  const suggested=usablePair(detected?.cards,portrait)?
   detected.cards.map(c=>c.quad.map(p=>({x:p.x,y:p.y}))):fallback;
  return {quads:suggested,arrangement:portrait?'stacked':'side-by-side',
   provisional:true,verified:false,requiresConfirmation:2,
   reason:detected&&usablePair(detected.cards,portrait)?
    'angoli proposti dal rilevatore, da controllare':
    'suddivisione approssimativa da correggere sui documenti originali'};
 }
 window.DocFixGuidedSplit=Object.freeze({propose,validCandidate,usablePair,version:'1.9.49-candidate'});
})();