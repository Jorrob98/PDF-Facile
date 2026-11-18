/* DocFix 1.9.51b TEST ONLY: four physical edges from source pixels.
 * Perspective-tolerant line fitting is a proposal, NOT proof that a
 * document is correct. Never writes image pixels or confirms a PDF.
 */
(()=>{'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const area=q=>Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
const median=v=>{const s=v.slice().sort((a,b)=>a-b);return s[s.length>>1]||0;};
function intersect(a,b){
 const u={x:a.end.x-a.start.x,y:a.end.y-a.start.y};
 const v={x:b.end.x-b.start.x,y:b.end.y-b.start.y};
 const dx=b.start.x-a.start.x,dy=b.start.y-a.start.y;
 const den=u.x*v.y-u.y*v.x;
 if(Math.abs(den)<1e-4)return null;
 const t=(dx*v.y-dy*v.x)/den;
 return {x:a.start.x+t*u.x,y:a.start.y+t*u.y};
}
function inspectRGBA(data,w,h,rough){
 if(!data||data.length<w*h*4||w<220||h<170||
  !Array.isArray(rough)||rough.length!==4||
  rough.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
   p.x<=0||p.y<=0||p.x>=1||p.y>=1))return null;
 const q=rough.map(p=>({x:p.x*w,y:p.y*h}));
 const cw=(dist(q[0],q[1])+dist(q[2],q[3]))/2;
 const ch=(dist(q[1],q[2])+dist(q[3],q[0]))/2;
 const minor=Math.min(cw,ch);
 if(cw/ch<1.18||cw/ch>2.14||minor<90||area(rough)<.060)return null;
 const center={x:q.reduce((s,p)=>s+p.x,0)/4,y:q.reduce((s,p)=>s+p.y,0)/4};
 const radius=clamp(minor*.09,10,42),count=31;
 function rgb(x,y){
  const xx=Math.round(x),yy=Math.round(y);
  if(xx<2||yy<2||xx>=w-2||yy>=h-2)return null;
  const k=(yy*w+xx)*4;
  return [data[k],data[k+1],data[k+2]];
 }
 const colorDiff=(a,b)=>a&&b?Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]):null;
 const fitted=[];
 for(let i=0;i<4;i++){
  const a=q[i],b=q[(i+1)%4],vx=b.x-a.x,vy=b.y-a.y,L=Math.hypot(vx,vy);
  if(L<85)return null;
  let nx=-vy/L,ny=vx/L;
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  if((center.x-mid.x)*nx+(center.y-mid.y)*ny<0){nx=-nx;ny=-ny;}
  let best=null,nearBest=null;
  for(let offset=-radius;offset<=radius;offset+=2){
   for(const tilt of [-.10,-.075,-.05,-.025,0,.025,.05,.075,.10]){
    const near=[],micro=[],wide=[],outer=[];
    let n=0;const thirds=[0,0,0],totals=[0,0,0];
    for(let j=0;j<count;j++){
     const t=.10+.80*j/(count-1),s=offset+tilt*L*(t-.5);
     const x=a.x+vx*t+nx*s,y=a.y+vy*t+ny*s;
     const nearV=colorDiff(rgb(x+nx*3,y+ny*3),rgb(x-nx*3,y-ny*3));
     const microV=colorDiff(rgb(x+nx*1.1,y+ny*1.1),rgb(x-nx*1.1,y-ny*1.1));
     const wideV=colorDiff(rgb(x+nx*7,y+ny*7),rgb(x-nx*7,y-ny*7));
     const outerV=colorDiff(rgb(x-nx*9,y-ny*9),rgb(x-nx*18,y-ny*18));
     if(nearV===null||microV===null||wideV===null||outerV===null)continue;
     n++;near.push(nearV);micro.push(microV);wide.push(wideV);outer.push(outerV);
     const section=Math.min(2,Math.floor(j*3/count));
     totals[section]++;
     if(nearV>=15&&wideV>=16)thirds[section]++;
    }
    if(n<count*.86)continue;
    const support=thirds.reduce((s,v)=>s+v,0)/n;
    const coverage=thirds.map((v,k)=>v/Math.max(1,totals[k]));
    const medNear=median(near),medMicro=median(micro),medWide=median(wide),medOuter=median(outer);
    const score=medNear*.31+medMicro*.38+medWide*.31+
     13*support+4*Math.min(...coverage)-.04*Math.abs(offset)-
     3*Math.abs(tilt)-.12*medOuter;
    if(!nearBest||score>nearBest.score)nearBest={score,offset,tilt,support,coverage,medNear,medMicro,medWide,medOuter};
    if(support<.59||coverage.some(v=>v<.42)||medNear<15||
       medMicro<9||medWide<16||medOuter>57)continue;
    if(!best||score>best.score)best={score,offset,tilt,support,coverage,
     medNear,medOuter};
   }
  }
  if(!best){if(window.DOCFIX_DEBUG_EDGES)console.warn('No supported side',i,nearBest);return null;} // Never guess a missing side.
  const s0=best.offset-best.tilt*L*.5-1.5;
  const s1=best.offset+best.tilt*L*.5-1.5;
  fitted.push({start:{x:a.x+nx*s0,y:a.y+ny*s0},
   end:{x:b.x+nx*s1,y:b.y+ny*s1},support:best.support,
   coverage:best.coverage});
 }
 const corners=fitted.map((s,i)=>intersect(fitted[(i+3)%4],s));
 if(corners.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
    p.x<3||p.y<3||p.x>w-4||p.y>h-4)){if(window.DOCFIX_DEBUG_EDGES)console.warn('Corner out of frame',corners);return null;}
 const cross=corners.map((p,i)=>{
  const b=corners[(i+1)%4],c=corners[(i+2)%4];
  return (b.x-p.x)*(c.y-b.y)-(b.y-p.y)*(c.x-b.x);
 });
 if(cross.some(v=>v<150)){if(window.DOCFIX_DEBUG_EDGES)console.warn('Non convex',cross);return null;}
 const width=(dist(corners[0],corners[1])+dist(corners[2],corners[3]))/2;
 const height=(dist(corners[1],corners[2])+dist(corners[3],corners[0]))/2;
 const ratio=width/height;
 if(ratio<1.34||ratio>1.96||
  Math.max(dist(corners[0],corners[1]),dist(corners[2],corners[3]))/
   Math.min(dist(corners[0],corners[1]),dist(corners[2],corners[3]))>1.45||
  Math.max(dist(corners[1],corners[2]),dist(corners[3],corners[0]))/
   Math.min(dist(corners[1],corners[2]),dist(corners[3],corners[0]))>1.45){if(window.DOCFIX_DEBUG_EDGES)console.warn('Shape',ratio,corners);return null;}
 const normalized=corners.map(p=>({x:p.x/w,y:p.y/h}));
 const change=area(normalized)/area(rough);
 if(change<.75||change>1.25||area(normalized)>.90||
    corners.some((p,i)=>dist(p,q[i])>minor*.19)){if(window.DOCFIX_DEBUG_EDGES)console.warn('Change',change,area(normalized),corners);return null;}
 return {quad:normalized,matchedSides:4,needsReview:true,
  physicallyVerified:false,confidence:.69,
  method:'four-side-oriented-gradient-provisional',
  diagnostic:{support:fitted.map(v=>Number(v.support.toFixed(3))),
   areaChange:Number(change.toFixed(3))}};
}
function refine(original,rough){
 const scan=window.DocFixScanner;
 if(!original||!scan?.resize||!scan?.validQuad?.(rough))return null;
 let sampled=null;
 try{
  sampled=scan.resize(original,1400);
  const ctx=sampled?.getContext?.('2d',{willReadFrequently:true});
  if(!ctx)return null;
  const rgba=ctx.getImageData(0,0,sampled.width,sampled.height).data;
  const result=inspectRGBA(rgba,sampled.width,sampled.height,rough);
  return result&&scan.validQuad(result.quad)?result:null;
 }catch(error){console.warn('DocFix oriented edges unavailable',error);return null;}
 finally{if(sampled&&sampled!==original)sampled.width=sampled.height=1;}
}
window.DocFixProjectedEdges=Object.freeze({inspectRGBA,refine,version:'1.9.51b-unreleased'});
})();