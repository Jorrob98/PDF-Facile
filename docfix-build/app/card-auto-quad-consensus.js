/* DocFix 1.9.51 candidate — independent source-pixel border consensus.
 * A detected coloured rectangle is ONLY a coarse locator. Three nearby,
 * independently fitted edge searches must agree before replacing the
 * proposed quadrilateral. No geometry is ever auto-confirmed for PDF.
 */
(()=>{'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const polygonArea=q=>Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
 function scale(q,factor){
  const center={x:q.reduce((s,p)=>s+p.x,0)/4,y:q.reduce((s,p)=>s+p.y,0)/4};
  return q.map(p=>({x:center.x+(p.x-center.x)*factor,y:center.y+(p.y-center.y)*factor}));
 }
 function shape(q,w,h){
  const p=q.map(z=>({x:z.x*w,y:z.y*h}));
  const horizontal=(length(p[0],p[1])+length(p[2],p[3]))/2;
  const vertical=(length(p[0],p[3])+length(p[1],p[2]))/2;
  return {ratio:horizontal/Math.max(1,vertical),short:Math.min(horizontal,vertical),long:Math.max(horizontal,vertical)};
 }
 function refine(original,rough){
  const scanner=window.DocFixScanner,precision=window.DocFixPrecisionEditor;
  if(!original||!scanner?.validQuad?.(rough)||!precision?.snap||!original.width||!original.height)return null;
  const w=original.width,h=original.height,baseline=shape(rough,w,h);
  const roughArea=polygonArea(rough);
  if(baseline.ratio<1.36||baseline.ratio>1.91||baseline.short<90||roughArea<.055||roughArea>.84)return null;
  // Inward and outward perturbations of the candidate must converge on
  // the SAME physical plastic border. Stable text lines cannot masquerade
  // as an outer card edge across all four sides and all three searches.
  const scales=[.988,1,1.012],candidates=[];
  for(const f of scales){
   const input=scale(rough,f);
   if(!scanner.validQuad(input))continue;
   let result=null;
   try{result=precision.snap(original,input);}catch(e){console.warn('DocFix consensus candidate',e);}
   if(!result||result.matchedSides!==4||!scanner.validQuad(result.quad))continue;
   const next=shape(result.quad,w,h),area=polygonArea(result.quad);
   if(next.ratio<1.43||next.ratio>1.85||area/roughArea<.90||area/roughArea>1.13)continue;
   const maxMove=Math.max(...result.quad.map((p,i)=>Math.hypot(
    (p.x-rough[i].x)*w,(p.y-rough[i].y)*h)));
   if(maxMove>baseline.short*.065)continue;
   candidates.push(result.quad);
  }
  if(candidates.length<2)return null;
  const threshold=clamp(baseline.short*.011,4,13);
  let best=null;
  for(let i=0;i<candidates.length;i++){
   const matches=[];
   for(let j=0;j<candidates.length;j++){
    const d=Math.max(...candidates[i].map((p,k)=>Math.hypot(
     (p.x-candidates[j][k].x)*w,(p.y-candidates[j][k].y)*h)));
    if(d<=threshold)matches.push(j);
   }
   if(!best||matches.length>best.matches.length)best={i,matches};
  }
  if(best.matches.length<2)return null;
  const agreed=best.matches.map(i=>candidates[i]);
  const quad=Array.from({length:4},(_,j)=>{
   const x=agreed.map(q=>q[j].x).sort((a,b)=>a-b),y=agreed.map(q=>q[j].y).sort((a,b)=>a-b);
   return {x:x[Math.floor(x.length/2)],y:y[Math.floor(y.length/2)]};
  });
  if(!scanner.validQuad(quad))return null;
  if(quad.some(p=>p.x<.003||p.x>.997||p.y<.003||p.y>.997))return null;
  const next=shape(quad,w,h);
  if(next.ratio<1.43||next.ratio>1.85)return null;
  const area=polygonArea(quad),relativeArea=area/roughArea;
  if(relativeArea<.90||relativeArea>1.13)return null;
  return {quad,method:'four-edge-source-pixel-consensus',matchedSides:4,
   agreement:best.matches.length,confidence:.74,physicallyVerified:false,
   needsReview:true,relativeArea,cornerDeviationPx:threshold};
 }
 window.DocFixAutoQuadConsensus=Object.freeze({refine,shape,scale,version:'1.9.51-candidate'});
})();