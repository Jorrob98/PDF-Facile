/* DocFix 1.9.50: original-pixel precision editor helpers.
 * The selected corner is moved in ORIGINAL SOURCE pixels, not CSS pixels
 * or the compressed 650 px thumbnail. No photos or coordinates leave
 * the computer. Manual confirmation remains mandatory.
 */
(()=>{'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function nudge(q,index,dx,dy,sourceWidth,sourceHeight,step=1,validate=null){
  if(!Array.isArray(q)||q.length!==4||index<0||index>3||
     !Number.isFinite(sourceWidth)||!Number.isFinite(sourceHeight)||
     sourceWidth<1||sourceHeight<1||!Number.isFinite(dx)||!Number.isFinite(dy))
   return null;
  const moved=q.map(p=>({...p}));
  const point=moved[index];
  point.x=clamp(point.x+dx*step/sourceWidth,.001,.999);
  point.y=clamp(point.y+dy*step/sourceHeight,.001,.999);
  if(validate&&validate(moved)!==true)return null;
  return moved;
 }
 function screenToImage(eventX,eventY,rect,sourceWidth,sourceHeight){
  if(!rect||!(rect.width>0&&rect.height>0))return null;
  return {x:clamp((eventX-rect.left)/rect.width,0,1)*sourceWidth,
   y:clamp((eventY-rect.top)/rect.height,0,1)*sourceHeight};
 }
 function drawZoom(canvas,source,point,{span=60}={}){
  if(!canvas||!source||!(source.width>0&&source.height>0)||!point)return false;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)return false;
  const w=canvas.width,h=canvas.height;
  if(!w||!h)return false;
  const cx=clamp(Math.round(point.x*source.width),0,source.width-1);
  const cy=clamp(Math.round(point.y*source.height),0,source.height-1);
  const radius=Math.max(10,Math.floor(span/2));
  const sx=Math.max(0,cx-radius),sy=Math.max(0,cy-radius);
  const ex=Math.min(source.width,cx+radius),ey=Math.min(source.height,cy+radius);
  const drawW=Math.max(1,ex-sx),drawH=Math.max(1,ey-sy);
  const srcScale=Math.max(w/span,h/span);
  const destX=w/2-(cx-sx)*srcScale;
  const destY=h/2-(cy-sy)*srcScale;
  ctx.save();
  ctx.fillStyle='#e7ebef';ctx.fillRect(0,0,w,h);
  ctx.imageSmoothingEnabled=false;
  // Physical pixels are enlarged, not interpolated away.
  ctx.drawImage(source,sx,sy,drawW,drawH,
    destX,destY,
    drawW*srcScale,drawH*srcScale);
  ctx.strokeStyle='#fff';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);
  ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
  ctx.strokeStyle='#06776d';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);
  ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
  ctx.restore();
  return true;
 }
 function median(a){
  const b=a.slice().sort((x,y)=>x-y);
  return b[Math.floor(b.length/2)]||0;
 }
 function px(d,w,h,x,y){
  const ix=clamp(Math.round(x),1,w-2),iy=clamp(Math.round(y),1,h-2),k=(iy*w+ix)*4;
  return [d[k],d[k+1],d[k+2]];
 }
 function delta(a,b){
  return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 }
 function intersection(a,b){
  const cross=(p,q)=>p.x*q.y-p.y*q.x;
  const ap={x:a.end.x-a.start.x,y:a.end.y-a.start.y};
  const bp={x:b.end.x-b.start.x,y:b.end.y-b.start.y};
  const den=cross(ap,bp);
  if(Math.abs(den)<.05)return null;
  const sep={x:b.start.x-a.start.x,y:b.start.y-a.start.y};
  const t=cross(sep,bp)/den;
  return {x:a.start.x+ap.x*t,y:a.start.y+ap.y*t};
 }
 // A suggested snap is conservative and NEVER a verified automatic crop.
 // It only searches within ~1.5% of the existing operator-selected edge,
 // and requires 3 coherent full-length material boundaries. Printed MRZ
 // stripes cannot become an outside edge far from the operator's placement.
 function snapRGBA(d,w,h,rough){
  if(!d||d.length<w*h*4||w<170||h<120||!Array.isArray(rough)||rough.length!==4)return null;
  const q=rough.map(p=>({x:p.x*w,y:p.y*h}));
  if(q.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  const center={x:q.reduce((a,p)=>a+p.x,0)/4,y:q.reduce((a,p)=>a+p.y,0)/4};
  const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const long=(length(q[0],q[1])+length(q[2],q[3]))/2;
  const minor=(length(q[1],q[2])+length(q[3],q[0]))/2;
  const originalRatio=long/Math.max(1,minor);
  if(originalRatio<1.29||originalRatio>1.97||minor<90)return null;
  const radius=clamp(minor*.017,5,21),samples=29;
  const sides=[],angleTrials=[-.03,-.015,0,.015,.03];
  for(let i=0;i<4;i++){
   const a=q[i],b=q[(i+1)%4],vx=b.x-a.x,vy=b.y-a.y,L=Math.hypot(vx,vy);
   if(L<65)return null;
   let nx=-vy/L,ny=vx/L;
   const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
   if(nx*(center.x-midpoint.x)+ny*(center.y-midpoint.y)<0){nx=-nx;ny=-ny;}
   const base=Array.from({length:samples},(_,j)=>{
    const t=.14+.72*j/(samples-1);
    return {x:a.x+vx*t,y:a.y+vy*t,t};
   });
   const bg=base.map(p=>px(d,w,h,p.x-nx*radius*2.5,p.y-ny*radius*2.5));
   const bgRef=[0,1,2].map(c=>median(bg.map(v=>v[c])));
   let best=null;
   for(let offset=-radius;offset<=radius;offset+=1.25){
    for(const tilt of angleTrials){
     const strengths=[],exterior=[];
     for(const p of base){
      const shift=offset+(p.t-.5)*L*tilt;
      const x=p.x+shift*nx,y=p.y+shift*ny;
      const inside=px(d,w,h,x+nx*3.6,y+ny*3.6);
      const outside=px(d,w,h,x-nx*3.6,y-ny*3.6);
      strengths.push(delta(inside,outside));
      exterior.push(delta(outside,bgRef));
     }
     const contrast=median(strengths);
     const support=strengths.filter(v=>v>=18).length/samples;
     const exteriorDistance=median(exterior);
     const distribution=[0,1,2].map(k=>strengths.slice(Math.floor(k*samples/3),Math.floor((k+1)*samples/3))
      .filter(v=>v>=16).length/Math.max(1,Math.floor((k+1)*samples/3)-Math.floor(k*samples/3)));
     const score=contrast*.58+
      median(strengths.slice().sort((x,y)=>x-y).slice(0,Math.ceil(samples*.50)))*.42+
      support*5-.14*Math.abs(offset)-Math.abs(tilt)*7-exteriorDistance*.14;
     if(!best||score>best.score)best={score,offset,tilt,contrast,support,exteriorDistance,distribution};
    }
   }
   const supported=best&&best.contrast>=22&&best.support>=.65&&
    best.score>=17&&best.exteriorDistance<74&&best.distribution.filter(x=>x>.43).length>=2;
   if(!supported){sides.push({start:a,end:b,supported:false});continue;}
   const edgeStart={x:a.x+(best.offset-L*best.tilt/2)*nx,
    y:a.y+(best.offset-L*best.tilt/2)*ny};
   const edgeEnd={x:b.x+(best.offset+L*best.tilt/2)*nx,
    y:b.y+(best.offset+L*best.tilt/2)*ny};
   // A 1.5 source-pixel outward margin preserves rounded plastic corners.
   sides.push({start:{x:edgeStart.x-nx*1.5,y:edgeStart.y-ny*1.5},
    end:{x:edgeEnd.x-nx*1.5,y:edgeEnd.y-ny*1.5},supported:true,score:best.score});
  }
  const supported=sides.filter(x=>x.supported).length;
  // Never move a quadrilateral if multiple physical boundaries are missing.
  if(supported<3)return null;
  const quad=[];
  for(let i=0;i<4;i++){
   const p=intersection(sides[(i+3)%4],sides[i]);
   if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
    p.x<2||p.x>w-3||p.y<2||p.y>h-3)return null;
   quad.push({x:p.x/w,y:p.y/h});
  }
  const area=q=>Math.abs(q.reduce((sum,p,i)=>sum+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
  const oldArea=area(q),newArea=area(quad.map(p=>({x:p.x*w,y:p.y*h})));
  const sourcePixels=quad.map(p=>({x:p.x*w,y:p.y*h}));
  const newLong=(length(sourcePixels[0],sourcePixels[1])+length(sourcePixels[2],sourcePixels[3]))/2;
  const newMinor=(length(sourcePixels[1],sourcePixels[2])+length(sourcePixels[3],sourcePixels[0]))/2;
  if(newArea/oldArea<.93||newArea/oldArea>1.09||
   newLong/Math.max(1,newMinor)<1.39||newLong/Math.max(1,newMinor)>1.89)return null;
  if(quad.some((p,i)=>Math.hypot(p.x*w-q[i].x,p.y*h-q[i].y)>radius*3.6))return null;
  return {quad,matchedSides:supported,needsReview:true,physicallyVerified:false,
   method:'bounded-source-edge-snap'};
 }
 function snap(source,rough){
  if(!source||!rough||!(source.width>0&&source.height>0))return null;
  try{
   const d=source.getContext('2d',{willReadFrequently:true})
    .getImageData(0,0,source.width,source.height).data;
   return snapRGBA(d,source.width,source.height,rough);
  }catch(e){console.warn('DocFix edge snap unavailable',e);return null;}
 }

 window.DocFixPrecisionEditor=Object.freeze({nudge,screenToImage,drawZoom,snapRGBA,snap,version:'1.9.50-candidate'});
})();