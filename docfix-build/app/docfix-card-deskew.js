/* DocFix 1.9.45 — source-first CIE visual four-corner deskew.
 * Locates colour-to-desk transitions close to an existing provisional ID-1
 * outline. It does NOT authenticate edges. NEVER marks a document verified.
 * Original pixels are read only; the caller performs ONE perspective warp.
 */
(()=>{'use strict';
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const area=q=>Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function isMaterial(data,w,h,x,y){
  const xx=Math.round(x),yy=Math.round(y);
  if(xx<1||yy<1||xx>=w-1||yy>=h-1)return 0;
  const k=(yy*w+xx)*4,r=data[k],g=data[k+1],b=data[k+2];
  const lum=.299*r+.587*g+.114*b;
  return Number(b-r>4&&g-r>2&&b-g>-15&&lum>76&&lum<252);
 }
 function averageMaterial(data,w,h,axis,along,at){
  let n=0,sum=0;
  // A 3-pixel average along the perimeter suppresses character noise.
  for(const t of [-1.5,0,1.5]){
   const x=axis==='y'?along+t:at,y=axis==='y'?at:along+t;
   sum+=isMaterial(data,w,h,x,y);n++;
  }
  return sum/n;
 }
 function boundary(data,w,h,type,along,approx,searchRadius,delta){
  const horizontal=type==='top'||type==='bottom',axis=horizontal?'y':'x';
  const inside=type==='top'||type==='left'?1:-1;
  let best=null;
  for(let offset=-searchRadius;offset<=searchRadius;offset++){
   const p=approx+offset;
   const inward=[3,5,7].map(k=>averageMaterial(data,w,h,axis,along,p+inside*k));
   const outward=[3,5,7].map(k=>averageMaterial(data,w,h,axis,along,p-inside*k));
   const a=inward.reduce((s,x)=>s+x,0)/3,b=outward.reduce((s,x)=>s+x,0)/3;
   const evidence=a-b;
   if(a<.53||b>.40||evidence<.40)continue;
   const score=evidence-Math.abs(offset)*.0035-(Math.abs(offset)>delta?.10:0);
   if(!best||score>best.score)best={at:p,along,score,evidence};
  }
  return best;
 }
 function fitLine(points,limit,expectedSpan){
  if(points.length<12)return null;
  function regress(a){
   const meanT=a.reduce((s,p)=>s+p.along,0)/a.length;
   const meanP=a.reduce((s,p)=>s+p.at,0)/a.length;
   let num=0,den=0;
   for(const p of a){num+=(p.along-meanT)*(p.at-meanP);den+=(p.along-meanT)**2;}
   const slope=num/Math.max(1,den);
   return {a:slope,b:meanP-slope*meanT};
  }
  let fit=regress(points);
  const residual=p=>Math.abs(p.at-(fit.a*p.along+fit.b));
  const inliers=points.filter(p=>residual(p)<=limit);
  if(inliers.length<12||inliers.length<points.length*.64)return null;
  fit=regress(inliers);
  const coverage=(Math.max(...inliers.map(p=>p.along))-Math.min(...inliers.map(p=>p.along)))/expectedSpan;
  const rms=Math.sqrt(inliers.reduce((s,p)=>s+(p.at-(fit.a*p.along+fit.b))**2,0)/inliers.length);
  if(coverage<.52||rms>limit*.79||Math.abs(fit.a)>.13)return null;
  return {...fit,points:inliers.length,rms,coverage};
 }
 function inspectRGBA(data,w,h,rough){
  if(!data||data.length<w*h*4||w<220||h<145||!Array.isArray(rough)||rough.length!==4)return null;
  const p=rough.map(v=>({x:v.x*w,y:v.y*h}));
  if(p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y)))return null;
  const L=Math.min(...p.map(v=>v.x)),R=Math.max(...p.map(v=>v.x));
  const T=Math.min(...p.map(v=>v.y)),B=Math.max(...p.map(v=>v.y));
  const bw=R-L,bh=B-T,minor=Math.min(bw,bh);
  if(bw<w*.48||bh<h*.27||bw/bh<1.33||bw/bh>1.96||minor<100)return null;
  const range=Math.max(6,Math.min(23,Math.round(minor*.075)));
  const delta=Math.max(5,Math.round(minor*.045));
  function track(type){
   const horizontal=type==='top'||type==='bottom';
   const lo=horizontal?L:T,hi=horizontal?R:B;
   const edge=type==='top'?T:type==='bottom'?B:type==='left'?L:R;
   const points=[];
   for(let i=0;i<37;i++){
    const along=lo+(hi-lo)*(.11+.78*i/36);
    const hit=boundary(data,w,h,type,along,edge,range,delta);
    if(hit)points.push(hit);
   }
   const fitted=fitLine(points,Math.max(2.8,minor*.014),hi-lo);
   if(!fitted||points.length<19||fitted.points<17)return null;
   // A single printed strip near the approximate outside contour must not
   // snap the entire side far inward/outward.
   const midpoint=(lo+hi)/2;
   if(Math.abs((fitted.a*midpoint+fitted.b)-edge)>range*.87)return null;
   return fitted;
  }
  const top=track('top'),bottom=track('bottom'),left=track('left'),right=track('right');
  if(!top||!bottom||!left||!right)return null;
  // Both opposite plastic sides should agree on small camera rotation.
  if(Math.abs(top.a-bottom.a)>.085||Math.abs(left.a-right.a)>.085)return null;
  const meet=(v,horiz)=>{
   const den=1-v.a*horiz.a;
   if(Math.abs(den)<.83)return null;
   const x=(v.a*horiz.b+v.b)/den;
   return {x,y:horiz.a*x+horiz.b};
  };
  const corners=[meet(left,top),meet(right,top),meet(right,bottom),meet(left,bottom)];
  if(corners.some(pt=>!pt||!Number.isFinite(pt.x)||!Number.isFinite(pt.y)))return null;
  const cw=(length(corners[0],corners[1])+length(corners[3],corners[2]))/2;
  const ch=(length(corners[0],corners[3])+length(corners[1],corners[2]))/2;
  const ratio=cw/ch,cardArea=area(corners),boxArea=bw*bh;
  if(ratio<1.42||ratio>1.82||cardArea/boxArea<.80||cardArea/boxArea>1.16)return null;
  const cross=corners.map((a,i)=>{
   const b=corners[(i+1)%4],c=corners[(i+2)%4];
   return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
  });
  if(cross.some(x=>x<150))return null;
  if(corners.some(pt=>pt.x<3||pt.x>w-4||pt.y<3||pt.y>h-4))return null;
  const pad=Math.max(1.2,Math.min(2.2,minor*.006));
  // Move each detected physical side OUTWARD by only 1–2 source pixels so
  // rounded plastic corners, MRZ and the full portrait are retained.
  const t={...top,b:top.b-pad},b={...bottom,b:bottom.b+pad};
  const l={...left,b:left.b-pad},r={...right,b:right.b+pad};
  const padded=[meet(l,t),meet(r,t),meet(r,b),meet(l,b)];
  if(padded.some(pt=>!pt||pt.x<2||pt.y<2||pt.x>w-3||pt.y>h-3))return null;
  const quad=padded.map(pt=>({x:pt.x/w,y:pt.y/h}));
  const finalRatio=(length(padded[0],padded[1])+length(padded[3],padded[2]))/
    Math.max(1,length(padded[0],padded[3])+length(padded[1],padded[2]));
  if(finalRatio<1.42||finalRatio>1.82)return null;
  // Normalize output dimensions to ID-1 only for a geometrically plausible
  // near-ID-1 source; otherwise retain native detected proportions.
  const targetAspect=finalRatio>=1.49&&finalRatio<=1.69?1.586:null;
  const angleDeg=Math.atan((top.a+bottom.a)/2)*180/Math.PI;
  return {quad,angleDeg:Number(angleDeg.toFixed(2)),targetAspect,
   originalRatio:Number(finalRatio.toFixed(3)),method:'cie-4-colour-side-lines',
   needsReview:true,physicallyVerified:false,confidence:.73,
   supports:[top,bottom,left,right].map(v=>({points:v.points,rms:+v.rms.toFixed(2)}))};
 }
 function refine(original,rough){
  const scan=window.DocFixScanner;
  if(!original||!scan?.resize||!scan.validQuad?.(rough))return null;
  let sample=null;
  try{
   sample=scan.resize(original,820);
   const {width:w,height:h}=sample;
   const d=sample.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
   const out=inspectRGBA(d,w,h,rough);
   if(!out||!scan.validQuad(out.quad))return null;
   return out;
  }catch(err){console.warn('DocFix ID-1 alignment skipped',err);return null;}
  finally{if(sample&&sample!==original)sample.width=sample.height=1;}
 }
 window.DocFixCardDeskew=Object.freeze({inspectRGBA,refine,version:'1.9.45'});
})();
