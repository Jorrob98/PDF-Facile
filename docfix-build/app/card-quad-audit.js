/* DocFix Quad Audit 1.9.29 — lightweight, offline OpenCV-like border scoring.
 * Accepts candidates from existing detectors. Checks real exterior edge
 * continuity, far-side colour separation and four-corner geometry.
 * No new dependencies, OCR, uploads, or manipulation of original pixels.
 */
(()=>{'use strict';
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const length=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
const area=q=>Math.abs(q.reduce((n,p,i)=>n+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
function crossing(a,b,c,d){
 const u={x:b.x-a.x,y:b.y-a.y},v={x:d.x-c.x,y:d.y-c.y};
 const det=u.x*v.y-u.y*v.x;if(Math.abs(det)<1e-5)return null;
 const w={x:c.x-a.x,y:c.y-a.y},t=(w.x*v.y-w.y*v.x)/det;
 return {x:a.x+u.x*t,y:a.y+u.y*t};
}
function geometry(q,w,h,{format='card'}={}){
 if(!Array.isArray(q)||q.length!==4||q.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 if(q.some(p=>p.x<.006||p.x>.994||p.y<.006||p.y>.994))return null;
 const p=q.map(v=>({x:v.x*w,y:v.y*h}));
 const ds=p.map((v,i)=>length(v,p[(i+1)%4]));
 if(ds.some(d=>d<38))return null;
 const cross=p.map((v,i)=>{
  const u=p[(i+1)%4],t=p[(i+2)%4];
  return (u.x-v.x)*(t.y-u.y)-(u.y-v.y)*(t.x-u.x);
 });
 if(cross.some(v=>v<80))return null;
 const width=(ds[0]+ds[2])/2,height=(ds[1]+ds[3])/2;
 const ratio=width/height,shape=Math.max(ratio,1/ratio),coverage=area(q);
 const bounds=format==='card'?[1.37,1.92]:[1,2.5];
 if(shape<bounds[0]||shape>bounds[1]||coverage<.095||coverage>.94)return null;
 if(Math.max(ds[0],ds[2])/Math.min(ds[0],ds[2])>1.42||
    Math.max(ds[1],ds[3])/Math.min(ds[1],ds[3])>1.42)return null;
 for(let i=0;i<4;i++){
  const prev=p[(i+3)%4],here=p[i],next=p[(i+1)%4];
  const a={x:prev.x-here.x,y:prev.y-here.y},b={x:next.x-here.x,y:next.y-here.y};
  const cos=(a.x*b.x+a.y*b.y)/(Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y));
  if(Math.abs(cos)>.58)return null; // implausible camera perspective
 }
 return {p,ratio,shape,coverage,width,height,ds};
}
function inspectRGBA(rgba,w,h,quad,opts={}){
 const source=geometry(quad,w,h,opts);
 if(!rgba||rgba.length<w*h*4||!source)return {verified:false,reason:'quad geometry'};
 const d=rgba,gap=clamp(Math.min(w,h)*.009,2.5,5.5);
 function rgb(x,y){
  const ix=Math.round(x),iy=Math.round(y);
  if(ix<1||ix>=w-1||iy<1||iy>=h-1)return null;
  const k=(iy*w+ix)*4;return [d[k],d[k+1],d[k+2]];
 }
 const delta=(a,b)=>a&&b?Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]):0;
 function lineScore(a,b,offset,tilt){
  const L=length(a,b),nx=(b.y-a.y)/L,ny=-(b.x-a.x)/L;
  let good=0;const values=[],outers=[];
  for(let i=0;i<23;i++){
   const t=.13+.74*i/22,shift=offset+tilt*L*(t-.5);
   const x=a.x+(b.x-a.x)*t+nx*shift,y=a.y+(b.y-a.y)*t+ny*shift;
   const near=delta(rgb(x-nx*gap,y-ny*gap),rgb(x+nx*gap,y+ny*gap));
   const far=delta(rgb(x-nx*gap*2.3,y-ny*gap*2.3),rgb(x+nx*gap*2.3,y+ny*gap*2.3));
   const value=.35*near+.65*far;
   values.push(value);outers.push(far);if(near>13&&far>17&&value>19)good++;
  }
  values.sort((x,y)=>x-y);outers.sort((x,y)=>x-y);
  const strength=values[11],p25=values[5],persistent=outers[11],coverage=good/23;
  const score=strength*.75+p25*.25+coverage*22-Math.abs(offset)*.45-Math.abs(tilt)*95;
  return {score,strength,coverage,persistent,p25,offset,tilt};
 }
 const sides=[];
 for(let i=0;i<4;i++){
  const a=source.p[i],b=source.p[(i+1)%4],base=lineScore(a,b,0,0);
  let best=base;
  const range=clamp(Math.min(w,h)*.028,4,16),stride=range>8?2:1;
  for(let off=-range;off<=range;off+=stride){
   for(const tilt of [-.027,-.0135,0,.0135,.027]){
    if(Math.abs(off)<.01&&tilt===0)continue;
    const v=lineScore(a,b,off,tilt);
    if(v.score>best.score+2)best=v;
   }
  }
  // Do not move a decent existing edge based on tiny texture differences.
  const chosen=base.coverage>=.70&&base.persistent>=22&&
   best.score<base.score+5?base:best;
  if(chosen.coverage<.61||chosen.strength<21||chosen.persistent<21||chosen.p25<13)
   return {verified:false,reason:'edge continuity',side:i,coverage:chosen.coverage,strength:chosen.strength};
  const L=length(a,b),nx=(b.y-a.y)/L,ny=-(b.x-a.x)/L;
  const start=chosen.offset-chosen.tilt*L*.5,end=chosen.offset+chosen.tilt*L*.5;
  sides.push({a:{x:a.x+nx*start,y:a.y+ny*start},
   b:{x:b.x+nx*end,y:b.y+ny*end},
   ...chosen});
 }
 const q=sides.map((_,i)=>{
  const prev=sides[(i+3)%4],curr=sides[i];
  return crossing(prev.a,prev.b,curr.a,curr.b);
 });
 if(q.some(p=>!p||p.x<3||p.y<3||p.x>w-4||p.y>h-4))
  return {verified:false,reason:'corners outside image'};
 const nq=q.map(p=>({x:p.x/w,y:p.y/h}));
 const result=geometry(nq,w,h,opts);
 if(!result)return {verified:false,reason:'refined quad geometry'};
 const gain=result.coverage/source.coverage;
 if(gain<.82||gain>1.20)return {verified:false,reason:'unexpected area change'};
 const support=Math.min(...sides.map(x=>x.coverage));
 const score= support*35+sides.reduce((n,x)=>n+x.strength,0)/4*.6+
    result.coverage*12-Math.abs(result.shape-1.585)*15;
 return {verified:true,quad:nq,score,confidence:clamp(.77+support*.16,0,.95),
  reason:'four physical continuous edges',support:{sidesOk:4,
   strength:sides.reduce((n,x)=>n+x.strength,0)/4,
   coverage:sides.map(x=>+x.coverage.toFixed(3)),
   offsets:sides.map(x=>+x.offset.toFixed(2)),
   geometryRatio:+result.ratio.toFixed(3),areaChange:+gain.toFixed(3)}};
}
function inspectCanvas(canvas,quad,opts={}){
 if(!canvas||!canvas.width||!canvas.height)return {verified:false,reason:'no source'};
 try{
  const d=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
  return inspectRGBA(d,canvas.width,canvas.height,quad,opts);
 }catch(e){return {verified:false,reason:'pixel inspection error'};}
}
window.DocFixQuadAudit=Object.freeze({inspectRGBA,inspectCanvas,geometry,version:'1.9.29'});
})();