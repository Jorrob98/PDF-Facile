/* DocFix 1.9.64 — four physical plastic edges on warm wooden backgrounds.
 * The *original* is sampled; all final pixels are warped once from the
 * untouched full-resolution photo. No external model, network or uploads.
 * A four-side matte yields precise corners; only a SECOND independent
 * gradient audit can allow the automatic PDF path. Otherwise review. */
(()=>{'use strict';
 const MAX_SIDE=1100;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const median=values=>{
  if(!values?.length)return NaN;
  const sorted=values.slice().sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
 };
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function neutral(r,g,b){
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
  return hi>55&&(hi-lo)/Math.max(1,hi)<.53;
 }
 function fitSide(points,extent,axis){
  if(points.length<18)return null;
  let inliers=points.slice();
  let a=0,b=median(points.map(p=>p.pos));
  for(let k=0;k<4;k++){
   const n=inliers.length;
   if(n<18)return null;
   const mx=inliers.reduce((s,p)=>s+p.t,0)/n;
   const my=inliers.reduce((s,p)=>s+p.pos,0)/n;
   let cov=0,variance=0;
   for(const p of inliers){cov+=(p.t-mx)*(p.pos-my);variance+=(p.t-mx)**2;}
   a=variance?cov/variance:0;b=my-a*mx;
   const residual=points.map(p=>p.pos-a*p.t-b);
   const centre=median(residual);
   const mad=median(residual.map(v=>Math.abs(v-centre)));
   const tol=clamp(2.5*Math.max(.7,mad),2.4,5.5);
   inliers=points.filter((p,i)=>Math.abs(residual[i]-centre)<=tol);
  }
  if(inliers.length<Math.max(18,points.length*.68))return null;
  const residuals=inliers.map(p=>Math.abs(p.pos-a*p.t-b));
  const error=median(residuals);
  const minT=Math.min(...inliers.map(p=>p.t)),maxT=Math.max(...inliers.map(p=>p.t));
  const span=maxT-minT;
  if(error>2.1||span<extent*.49||Math.abs(a)>0.17)return null;
  const min=axis.start+.14*axis.length,max=axis.start+.86*axis.length;
  const groups=[0,0,0];
  for(const p of inliers){
   const k=clamp(Math.floor((p.t-min)/Math.max(1,max-min)*3),0,2);
   groups[k]++;
  }
  if(groups.some(count=>count<Math.max(3,inliers.length*.12)))return null;
  return {a,b,count:inliers.length,total:points.length,error,span,groups,
   offsetError:Math.abs(b+a*(axis.start+axis.length*.5)-axis.rough)};
 }
 // x(y) on vertical sides and y(x) on horizontal sides.
 function intersect(v,h){
  const denominator=1-v.a*h.a;
  if(Math.abs(denominator)<.70)return null;
  const x=(v.a*h.b+v.b)/denominator;
  return {x,y:h.a*x+h.b};
 }
 function inspectRGBA(rgba,w,h,rough,{allowAuto=true,source=null}={}){
  if(!rgba||rgba.length<w*h*4||w<220||h<220||!Array.isArray(rough)||
    rough.length!==4||rough.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  const rx=rough.map(p=>p.x*w),ry=rough.map(p=>p.y*h);
  const x0=Math.min(...rx),x1=Math.max(...rx),y0=Math.min(...ry),y1=Math.max(...ry);
  const bw=x1-x0,bh=y1-y0;
  if(bw<140||bh<90||x0<1||y0<1||x1>w-1||y1>h-1)return null;
  const mask=new Uint8Array(w*h);
  for(let k=0,p=0;p<mask.length;p++,k+=4)
   mask[p]=neutral(rgba[k],rgba[k+1],rgba[k+2])?1:0;
  function colorAverage(vertical,x,y,side,near){
   let score=0,n=0;
   const s=near?1:3,e=near?2:9;
   for(let depth=s;depth<=e;depth+=near?1:2){
    for(let t=-1;t<=1;t++){
     const xx=vertical?x+side*depth:x+t;
     const yy=vertical?y+t:y+side*depth;
     if(xx<0||yy<0||xx>=w||yy>=h)continue;
     score+=mask[yy*w+xx];n++;
    }
   }
   return n?score/n:0;
  }
  const sided=[
   {name:'top',vertical:false,rough:y0,start:x0,length:bw,search:clamp(bh*.065,9,43),out:-1,in:1},
   {name:'right',vertical:true,rough:x1,start:y0,length:bh,search:clamp(bw*.060,9,43),out:1,in:-1},
   {name:'bottom',vertical:false,rough:y1,start:x0,length:bw,search:clamp(bh*.065,9,43),out:1,in:-1},
   {name:'left',vertical:true,rough:x0,start:y0,length:bh,search:clamp(bw*.060,9,43),out:-1,in:1}
  ];
  const fitted={};
  for(const side of sided){
   const samples=[];
   const begin=side.start+side.length*.14,end=side.start+side.length*.86;
   const stride=clamp(Math.round(side.length/105),2,7);
   for(let t=Math.round(begin);t<=end;t+=stride){
    let best=null;
    const start=Math.max(12,Math.floor(side.rough-side.search));
    const stop=Math.min((side.vertical?w:h)-13,Math.ceil(side.rough+side.search));
    for(let p=start;p<=stop;p++){
     const x=side.vertical?p:t,y=side.vertical?t:p;
     const outside=colorAverage(side.vertical,x,y,side.out,false);
     const inside=colorAverage(side.vertical,x,y,side.in,false);
     if(outside>.28||inside<.72)continue;
     const outerNear=colorAverage(side.vertical,x,y,side.out,true);
     const innerNear=colorAverage(side.vertical,x,y,side.in,true);
     const nearGradient=innerNear-outerNear;
     if(nearGradient<.30)continue;
     const score=nearGradient*.72+(inside-outside)*.28-
      Math.abs(p-side.rough)*.004;
     if(!best||score>best.score)
      best={pos:p,t,score,contrast:inside-outside,nearGradient};
    }
    if(best)samples.push(best);
   }
   const fit=fitSide(samples,side.length,{start:side.start,length:side.length,rough:side.rough});
   if(!fit||samples.length<Math.max(18,(end-begin)/stride*.58))return null;
   fitted[side.name]=fit;
  }
  const intersections=[
   intersect(fitted.left,fitted.top),
   intersect(fitted.right,fitted.top),
   intersect(fitted.right,fitted.bottom),
   intersect(fitted.left,fitted.bottom)
  ];
  if(intersections.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
    p.x<6||p.y<6||p.x>w-7||p.y>h-7))return null;
  // Subpixel outward safety bias keeps the rounded plastic rim while
  // avoiding a visible 1px strip of desk around a small document.
  const outwardBias=1.0;
  const corners=intersections.map((p,i)=>({
   x:p.x+(i===0||i===3?-outwardBias:outwardBias),
   y:p.y+(i<2?-outwardBias:outwardBias)
  }));
  const distances=corners.map((p,i)=>Math.hypot(p.x-rx[i],p.y-ry[i]));
  if(Math.max(...distances)>Math.min(bw,bh)*.105)return null;
  const width=(dist(corners[0],corners[1])+dist(corners[2],corners[3]))/2;
  const height=(dist(corners[0],corners[3])+dist(corners[1],corners[2]))/2;
  const ratio=width/Math.max(1,height);
  if(ratio<1.40||ratio>1.84)return null;
  const cross=corners.map((p,i)=>{
   const a=corners[(i+1)%4],b=corners[(i+2)%4];
   return (a.x-p.x)*(b.y-a.y)-(a.y-p.y)*(b.x-a.x);
  });
  if(cross.some(n=>n<600))return null;
  const originalArea=bw*bh;
  const newArea=width*height;
  if(newArea/originalArea<.78||newArea/originalArea>1.12)return null;
  const quad=corners.map(p=>({x:p.x/w,y:p.y/h}));
  // Check the short arms of EVERY physical corner. Side fitting samples
  // 14–86% of each side; without this guard an occluded/missing corner
  // can be extrapolated into a plausible rectangle and auto-approved.
  // Plastic ID cards have small rounded corners, so evaluate points at
  // 6.5/11.5/18% along each arm instead of the extreme corner pixel.
  const endpointVotes=[];
  function aroundNeutral(x,y){
   let count=0,total=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const ix=Math.round(x)+dx,iy=Math.round(y)+dy;
    if(ix<0||iy<0||ix>=w||iy>=h)continue;
    count+=mask[iy*w+ix];total++;
   }
   return total?count/total:0;
  }
  for(let i=0;i<4;i++){
   const a=corners[i],b=corners[(i+1)%4];
   const vx=b.x-a.x,vy=b.y-a.y,L=Math.hypot(vx,vy);
   const nx=-vy/L,ny=vx/L;
   for(const end of [0,1]){
    let good=0;
    for(const p of [.065,.115,.18]){
     const t=end===0?p:1-p,x=a.x+vx*t,y=a.y+vy*t;
     const inside=aroundNeutral(x+nx*10,y+ny*10);
     const outside=aroundNeutral(x-nx*8,y-ny*8);
     if(inside>=.70&&outside<=.30)good++;
    }
    endpointVotes.push(good);
   }
  }
  const cornersSupported=endpointVotes.every(v=>v>=2);
  // Independent near-corner MATERIAL check. Side-line extrapolation can
  // reconstruct all 4 geometric corners even when the plastic itself is
  // missing in the corner. Test 3 diagonal positions inside each actual
  // corner; allow naturally rounded plastic but not a circular bite.
  // This is only an AUTO-approval gate, never a restriction on manual edit.
  const cornerMaterial=[];
  for(let i=0;i<4;i++){
   const current=corners[i],before=corners[(i+3)%4],after=corners[(i+1)%4];
   const lenA=Math.max(1,dist(current,before)),
         lenB=Math.max(1,dist(current,after));
   const unitA={x:(before.x-current.x)/lenA,y:(before.y-current.y)/lenA};
   const unitB={x:(after.x-current.x)/lenB,y:(after.y-current.y)/lenB};
   const diagonal=[];
   for(const d of [6,10,14]){
    const cx=current.x+(unitA.x+unitB.x)*d,
          cy=current.y+(unitA.y+unitB.y)*d;
    diagonal.push(aroundNeutral(cx,cy)>=.72);
   }
   cornerMaterial.push({supported:diagonal.filter(Boolean).length,
    first:diagonal[0],second:diagonal[1],third:diagonal[2]});
  }
  const visibleMaterialAtCorners=cornerMaterial.every(v=>v.supported>=2);
  // A four-line fit can hide large MISSING stretches: with 68% inliers
  // and an independent audit looking mostly at average edge contrast,
  // 45/50 simulated side occlusions had been AUTO-approved. Require
  // continuous physical edge evidence in 13 distributed checkpoints on
  // EVERY side, including its middle. A failed point permits a preview,
  // but it must never auto-approve the final PDF.
  const sideCoverage={};
  for(const side of sided){
   const model=fitted[side.name],votes=[];
   for(let j=0;j<13;j++){
    const t=side.start+side.length*(.07+.86*j/12);
    const p=model.a*t+model.b;
    // Uint8Array pixel masks must be accessed at INTEGER coordinates.
    // Subpixel indices would otherwise always read undefined.
    const x=Math.round(side.vertical?p:t),y=Math.round(side.vertical?t:p);
    const inside=colorAverage(side.vertical,x,y,side.in,false);
    const outside=colorAverage(side.vertical,x,y,side.out,false);
    // A fitted edge can be 3-4px away from the actual plastic while its
    // far-away colour samples still look correct. Check the IMMEDIATE
    // 1-2px neighbourhood of the proposed physical border, too.
    const nearInside=colorAverage(side.vertical,x,y,side.in,true);
    const nearOutside=colorAverage(side.vertical,x,y,side.out,true);
    votes.push(inside>=.69&&outside<=.30&&inside-outside>=.49&&
      nearInside>=.58&&nearOutside<=.42&&nearInside-nearOutside>=.28);
   }
   let misses=0,longestMiss=0;
   for(const good of votes){
    misses=good?0:misses+1;
    longestMiss=Math.max(longestMiss,misses);
   }
   const accepted=votes.filter(Boolean).length;
   sideCoverage[side.name]={supported:accepted,samples:votes.length,
    maxMissingRun:longestMiss,continuous:accepted>=11&&longestMiss<=1};
  }
  const continuousSides=Object.values(sideCoverage).every(s=>s.continuous);
  // Independently estimate physical card orientation using the pale
  // material mask's second moments. The short side-fit can occasionally
  // return a plausible but too-large AXIS-ALIGNED rectangle around a
  // tilted card. This must remain a manual proposal, not an auto export.
  let mN=0,mX=0,mY=0,mXX=0,mYY=0,mXY=0;
  for(let y=Math.max(0,Math.floor(y0));y<=Math.min(h-1,Math.ceil(y1));y+=3){
   for(let x=Math.max(0,Math.floor(x0));x<=Math.min(w-1,Math.ceil(x1));x+=3){
    if(!mask[y*w+x])continue;
    mN++;mX+=x;mY+=y;mXX+=x*x;mYY+=y*y;mXY+=x*y;
   }
  }
  let orientationAgreement=false,maskAngle=NaN,fitAngle=NaN,angleDelta=NaN;
  if(mN>=300){
   const vx=mXX/mN-(mX/mN)**2,
         vy=mYY/mN-(mY/mN)**2,
         cov=mXY/mN-mX*mY/(mN*mN);
   const spread=Math.hypot(vx-vy,2*cov);
   maskAngle=.5*Math.atan2(2*cov,vx-vy);
   const thetaTop=Math.atan2(corners[1].y-corners[0].y,
     corners[1].x-corners[0].x);
   const thetaBottom=Math.atan2(corners[2].y-corners[3].y,
     corners[2].x-corners[3].x);
   fitAngle=(thetaTop+thetaBottom)/2;
   angleDelta=Math.abs(Math.atan2(Math.sin(maskAngle-fitAngle),
     Math.cos(maskAngle-fitAngle)));
   orientationAgreement=spread/Math.max(1,vx+vy)>=.24&&angleDelta<=.022;
  }
  const minSupport=Math.min(...Object.values(fitted).map(s=>s.count/s.total));
  const maxError=Math.max(...Object.values(fitted).map(s=>s.error));
  const strong=minSupport>=.78&&maxError<=1.5&&cornersSupported&&continuousSides&&visibleMaterialAtCorners&&orientationAgreement;
  let independentlyVerified=false,auditSupport=null;
  // Strong photographic colour contrast locates edges but MUST NOT
  // auto-approve a PDF by itself. Use an independent gradient-based
  // four-edge audit on the untouched original pixels.
  if(strong&&allowAuto&&source&&window.DocFixQuadAudit?.inspectCanvas){
   try{
    const audit=window.DocFixQuadAudit.inspectCanvas(source,quad,{format:'card'});
    if(audit?.verified===true&&audit?.support?.sidesOk===4&&
       Array.isArray(audit.quad)&&audit.quad.length===4){
     const difference=Math.max(...audit.quad.map((p,i)=>Math.hypot(
      (p.x-quad[i].x)*w,(p.y-quad[i].y)*h)));
     independentlyVerified=difference<=Math.min(bw,bh)*.012;
     auditSupport=audit.support;
    }
   }catch(error){console.warn('DocFix: confronto fisico indipendente non conclusivo',error);}
  }
  return {quad,matchedSides:4,physicallyVerified:independentlyVerified,
   verified:independentlyVerified,needsReview:!independentlyVerified,
   confidence:independentlyVerified?.94:.77,
   method:independentlyVerified?'4 bordi legno + gradiente indipendente':
    '4 bordi plastica sul legno, attesa verifica indipendente',
   diagnostic:{sides:Object.fromEntries(Object.entries(fitted).map(([key,value])=>[key,{
    support:+(value.count/value.total).toFixed(3),error:+value.error.toFixed(2)}])),
    maxShiftPx:+Math.max(...distances).toFixed(2),ratio:+ratio.toFixed(3),
    minSupport:+minSupport.toFixed(3),maxError:+maxError.toFixed(2),
    cornerArms:endpointVotes,cornersSupported,cornerMaterial,visibleMaterialAtCorners,
    sideCoverage,continuousSides,
    orientationAgreement,maskAngle:Number.isFinite(maskAngle)?+maskAngle.toFixed(4):null,
    fitAngle:Number.isFinite(fitAngle)?+fitAngle.toFixed(4):null,
    angleDelta:Number.isFinite(angleDelta)?+angleDelta.toFixed(4):null,
    independentAudit:independentlyVerified,auditSupport}};
 }
 function refine(source,rough){
  if(!source||!Array.isArray(rough)||rough.length!==4||
    source.width<280||source.height<280)return null;
  const scale=Math.min(1,MAX_SIDE/Math.max(source.width,source.height));
  const w=Math.max(1,Math.round(source.width*scale)),
        h=Math.max(1,Math.round(source.height*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;
  try{
   const g=c.getContext('2d',{alpha:false,willReadFrequently:true});
   if(!g)return null;
   g.drawImage(source,0,0,source.width,source.height,0,0,w,h);
   const rgba=g.getImageData(0,0,w,h).data;
   return inspectRGBA(rgba,w,h,rough,{source});
  }catch(error){console.warn('DocFix: rifinitura quattro bordi sul legno non disponibile',error);return null;}
  finally{c.width=1;c.height=1;}
 }
 window.DocFixWoodPhysicalEdges=Object.freeze({refine,inspectRGBA,version:'1.9.64-original-four-sided'});
})();
