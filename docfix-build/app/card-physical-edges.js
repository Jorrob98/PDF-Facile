/* DocFix 1.9.6: recover real outer card borders locally.
 * Continuous border evidence + physical aspect ratio guard; no text rewriting.
 */
(()=>{'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const med=a=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(b.length/2)]||0};
 function detectPixels(data,w,h){
  if(w<170||h<95||w/h<1.15||w/h>2.5)return null;
  const at=(x,y)=>{const k=(clamp(Math.round(y),0,h-1)*w+clamp(Math.round(x),0,w-1))*4;return [data[k],data[k+1],data[k+2]]};
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const N=25;
  function side(side){
   const horizontal=side==='top'||side==='bottom',size=horizontal?h:w,long=horizontal?w:h;
   const low=(side==='top'||side==='left')?3:Math.round(size*.72);
   const high=(side==='top'||side==='left')?Math.round(size*.28):size-4;
   const along=Array.from({length:N},(_,i)=>long*(.12+.76*i/(N-1)));
   const edgeRefs=along.map(u=>horizontal?at(u,side==='top'?1:h-2):at(side==='left'?1:w-2,u));
   const ref=[0,1,2].map(c=>med(edgeRefs.map(p=>p[c])));
   const list=[];
   for(let p=low;p<=high;p+=2){
    for(let deg=-6;deg<=6.01;deg+=.75){
     const slope=Math.tan(deg*Math.PI/180),contrasts=[],background=[];let invalid=0;
     for(let i=0;i<N;i++){
      const u=along[i],v=p+slope*(u-long/2);
      if(v<3||v>size-4){invalid++;continue}
      const minus=horizontal?at(u,v-2):at(v-2,u),plus=horizontal?at(u,v+2):at(v+2,u);
      contrasts.push(distance(minus,plus));
      background.push(distance((side==='top'||side==='left')?minus:plus,ref));
     }
     if(invalid>2||contrasts.length<N-2)continue;
     const values=contrasts.sort((a,b)=>a-b);
     const strength=values[Math.floor(values.length*.42)];
     const support=values.filter(x=>x>17).length/values.length;
     if(strength<14||support<.56)continue;
     const distanceToFrame=(side==='top'||side==='left')?p:size-1-p;
     const bgDist=med(background);
     // Reject internal text/header lines: their exterior is not page background.
     if(distanceToFrame>=3&&bgDist>64)continue;
     const bgBonus=distanceToFrame>size*.055?clamp((52-bgDist)/9,-3,4):1;
     const score=strength*.26+support*9+bgBonus-Math.abs(deg)*.13-distanceToFrame/size*9;
     list.push({side,p,deg,slope,strength,support,bgDist,score});
    }
   }
   list.sort((a,b)=>b.score-a.score);
   const distinct=[];
   for(const item of list){
    if(distinct.every(x=>Math.abs(x.p-item.p)>Math.max(3,size*.017)))distinct.push(item);
    if(distinct.length>=6)break;
   }
   // One card side may touch the source crop.
   distinct.push({side,p:(side==='top'||side==='left')?0:size-1,deg:0,slope:0,strength:0,support:0,bgDist:0,score:-6,missing:true});
   return distinct;
  }
  const sides={top:side('top'),bottom:side('bottom'),left:side('left'),right:side('right')};
  const cross=(vertical,horizontal)=>{
   const v0=vertical.p,h0=horizontal.p,sv=vertical.slope,sh=horizontal.slope,cx=w/2,cy=h/2;
   const denom=1-sv*sh;if(Math.abs(denom)<.8)return null;
   const x=(v0+sv*(h0-cy-sh*cx))/denom;
   return {x,y:h0+sh*(x-cx)};
  };
  let best=null;
  for(const t of sides.top)for(const b of sides.bottom){
   if(b.p-t.p<h*.67)continue;
   for(const l of sides.left)for(const r of sides.right){
    if(r.p-l.p<w*.70)continue;
    const used=[t,b,l,r],missing=used.filter(s=>s.missing).length;
    if(missing>1)continue;
    const q=[cross(l,t),cross(r,t),cross(r,b),cross(l,b)];
    if(q.some(p=>!p||p.x<-.1||p.x>w+.1||p.y<-.1||p.y>h+.1))continue;
    const len=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    const bw=(len(q[0],q[1])+len(q[2],q[3]))/2,bh=(len(q[0],q[3])+len(q[1],q[2]))/2;
    const ratio=bw/bh;
    if(ratio<1.40||ratio>1.89)continue;
    const area=(bw*bh)/(w*h);
    if(area<.46||area>.993)continue;
    const score=used.reduce((acc,x)=>acc+x.score,0)-Math.abs(ratio-1.586)*19-missing*5;
    if(!best||score>best.score)best={quad:q.map(p=>({x:clamp(p.x/w,0,1),y:clamp(p.y/h,0,1)})),score,ratio,area,missing,edges:used,angle:((t.deg+b.deg)/2)};
   }
  }
  if(!best||best.score<11)return null;
  // Do not blur a card that is already tight and straight.
  if(best.area>.975&&Math.abs(best.angle)<.45)return null;
  return best;
 }
 function detect(source){
  const scanner=window.DocFixScanner;
  if(!scanner||!source)return null;
  const s=scanner.resize(source,650),ctx=s.getContext('2d',{willReadFrequently:true});
  const raw=ctx.getImageData(0,0,s.width,s.height),found=detectPixels(raw.data,s.width,s.height);
  if(s!==source)s.width=s.height=1;
  if(!found||!scanner.validQuad(found.quad))return null;
  return {status:'found',quad:found.quad,confidence:clamp(.80+(4-found.missing)*.027,.80,.92),
   method:'physical-outer-boundaries-lines',cardLikely:true,physicalLines:true,score:found.score,angle:found.angle,area:found.area};
 }
 window.DocFixPhysicalEdges=Object.freeze({detect,detectPixels,version:'1.9.6'});
})();
