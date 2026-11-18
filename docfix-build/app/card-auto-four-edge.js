/* DocFix 1.9.51 — an independent, four-side-only refinement gate
   for provisional SINGLE photographed cards. Candidate location and
   physical-edge refinement are distinct. Never export without approval.
   No OCR/text or reconstructed pixels. Only one final warp on source.
 */
(()=>{'use strict';
 const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const polygonArea=q=>Math.abs(q.reduce((acc,p,i)=>{
  const b=q[(i+1)%4];return acc+p.x*b.y-p.y*b.x;
 },0))/2;
 const geometry=(q,w,h)=>{
  if(!Array.isArray(q)||q.length!==4)return null;
  const p=q.map(a=>({x:a.x*w,y:a.y*h}));
  const width=(length(p[0],p[1])+length(p[2],p[3]))/2,
   height=(length(p[0],p[3])+length(p[1],p[2]))/2;
  return {width,height,ratio:width/Math.max(1,height),area:polygonArea(q)};
 };
 function assess(original,rough,result,validQuad){
  if(!original||!rough||!result||result.matchedSides!==4||
   result.physicallyVerified!==false||result.needsReview!==true||
   !validQuad?.(rough)||!validQuad?.(result.quad))return null;
  const w=original.width,h=original.height;
  const a=geometry(rough,w,h),b=geometry(result.quad,w,h);
  if(!a||!b||a.width<180||a.height<100||b.ratio<1.38||b.ratio>1.88||
   b.area<.065||b.area>.84||b.area/a.area<.935||b.area/a.area>1.085)return null;
  const diag=Math.hypot(a.width,a.height);
  // A border closer to an internal printed frame, barcode or portrait
  // can be geometrically plausible. Disallow a large displacement and
  // compare horizontal and vertical shifts independently.
  let max=0,total=0;
  for(let i=0;i<4;i++){
   const dx=(result.quad[i].x-rough[i].x)*w,
    dy=(result.quad[i].y-rough[i].y)*h;
   const distance=Math.hypot(dx,dy);
   max=Math.max(max,distance);total+=distance;
   if(Math.abs(dx)>a.width*.075||Math.abs(dy)>a.height*.10)return null;
  }
  if(max>diag*.075)return null;
  const edgeMove=total/4;
  if(edgeMove<.65)return null; // negligible change: do not claim correction
  return {quad:result.quad.map(p=>({x:p.x,y:p.y})),
   confidence:.75,physicallyVerified:false,needsReview:true,
   matchedSides:4,method:'provisional-original-four-side-auto-refinement',
   edgeMovePx:Number(edgeMove.toFixed(1)),
   requiresCornerConfirmation:true};
 }
 function refine(original,rough){
  const scan=window.DocFixScanner;
  const fitter=window.DocFixPrecisionEditor;
  if(!scan?.validQuad?.(rough)||!fitter?.snap||!original)return null;
  try{return assess(original,rough,fitter.snap(original,rough,{wideSearch:true}),scan.validQuad);}
  catch(error){console.warn('DocFix: refinement blocked, initial preview preserved',error);return null;}
 }
 window.DocFixAutoFourEdge=Object.freeze({assess,refine,version:'1.9.51-candidate'});
})();