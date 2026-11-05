/* DocFix Group 1 candidate: conservative outer-boundary recovery.
 * No image network calls. Never fabricates identity information. */
(()=>{'use strict';
 const debug=window.__docfixDebug||null;
 const scan=window.DocFixScanner;if(!scan)throw new Error('DocFix scanner non disponibile');
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const median=(a)=>{a.sort((x,y)=>x-y);return a[(a.length/2)|0]||0};
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 const norm=(q,w,h)=>q.map(p=>({x:p.x/w,y:p.y/h}));
 const pixel=(d,w,x,y)=>{const h=Math.max(1,Math.floor(d.length/(Math.max(1,w)*4))),p=(clamp(Math.round(y),0,h-1)*w+clamp(Math.round(x),0,w-1))*4;return [d[p],d[p+1],d[p+2]]};
 const quadRatio=(q,w,h)=>{const p=q.map(z=>({x:z.x*w,y:z.y*h})),side=(i,j)=>Math.hypot(p[i].x-p[j].x,p[i].y-p[j].y),ww=(side(0,1)+side(2,3))/2,hh=(side(1,2)+side(3,0))/2;return Math.max(ww,hh)/Math.max(1,Math.min(ww,hh))};
 function morph(bits,w,h,rx,ry,isDilation){
  const stride=w+1,I=new Uint32Array((w+1)*(h+1));
  for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=bits[y*w+x];I[(y+1)*stride+x+1]=row+I[y*stride+x+1]}}
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const x0=Math.max(0,x-rx),x1=Math.min(w-1,x+rx),y0=Math.max(0,y-ry),y1=Math.min(h-1,y+ry);
   const n=I[(y1+1)*stride+x1+1]-I[y0*stride+x1+1]-I[(y1+1)*stride+x0]+I[y0*stride+x0];
   const area=(x1-x0+1)*(y1-y0+1);out[y*w+x]=isDilation?Number(n>0):Number(n===area);
  }return out;
 }
 function edgeSupport(q,data,w,h){
  const sample=[];let sidesOk=0;const eps=clamp(Math.min(w,h)*.018,3,8);
  for(let i=0;i<4;i++){
   const a=q[i],b=q[(i+1)%4],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy),nx=dy/L,ny=-dx/L;let good=0,sum=0;
   for(let j=0;j<13;j++){
    const t=.15+.7*j/12,x=a.x+dx*t,y=a.y+dy*t;
    const inside=pixel(data,w,x-nx*eps,y-ny*eps),outside=pixel(data,w,x+nx*eps,y+ny*eps);
    const d=dist(inside,outside);sum+=d;if(d>16)good++;
   }
   const mean=sum/13;sample.push({mean,coverage:good/13});if(mean>18&&good>=6)sidesOk++;
  }
  return {sidesOk,sample,strength:sample.reduce((s,p)=>s+p.mean,0)/4};
 }

 function lineIntersection(a,b,c,d){
  const x1=a.x,y1=a.y,x2=b.x,y2=b.y,x3=c.x,y3=c.y,x4=d.x,y4=d.y;
  const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);if(Math.abs(den)<1e-6)return null;
  const px=((x1*y2-y1*x2)*(x3-x4)-(x1-x2)*(x3*y4-y3*x4))/den;
  const py=((x1*y2-y1*x2)*(y3-y4)-(y1-y2)*(x3*y4-y3*x4))/den;
  return {x:px,y:py};
 }
 function sideContrast(data,w,h,a,b,nx,ny,off,gap){
  const vals=[];let supported=0;
  for(let j=0;j<17;j++){
   const t=.08+.84*j/16,x=a.x+(b.x-a.x)*t+nx*off,y=a.y+(b.y-a.y)*t+ny*off;
   const p1=pixel(data,w,x-nx*gap,y-ny*gap),p2=pixel(data,w,x+nx*gap,y+ny*gap),v=dist(p1,p2);
   vals.push(v);if(v>14)supported++;
  }
  vals.sort((a,b)=>a-b);
  const trimmed=vals.slice(3,14),mean=trimmed.reduce((s,v)=>s+v,0)/Math.max(1,trimmed.length);
  return {mean,supported};
 }
 function refineQuad(source,q){
  if(!q||!scan.validQuad(q))return {quad:q,refined:false,gain:0};
  const samp=scan.resize(source,700),w=samp.width,h=samp.height,d=samp.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const px=q.map(p=>({x:p.x*w,y:p.y*h})),range=Math.round(clamp(Math.min(w,h)*.018,4,12)),gap=clamp(Math.min(w,h)*.005,2,4);
  const shifted=[],offsets=[];let baseTotal=0,bestTotal=0;
  for(let i=0;i<4;i++){
   const a=px[i],b=px[(i+1)%4],dx=b.x-a.x,dy=b.y-a.y,L=Math.max(1,Math.hypot(dx,dy)),nx=dy/L,ny=-dx/L;
   const base=sideContrast(d,w,h,a,b,nx,ny,0,gap);baseTotal+=base.mean;
   let best={off:0,score:base.mean,raw:base.mean,supported:base.supported};
   for(let off=-range;off<=range;off++){
    const r=sideContrast(d,w,h,a,b,nx,ny,off,gap);
    const score=r.mean-Math.abs(off)*.32+(r.supported>=9?2:0);
    if(r.supported>=7&&score>best.score){best={off,score,raw:r.mean,supported:r.supported};}
   }
   const use=Math.abs(best.off)<=range&&best.raw>=base.mean+1.2&&best.supported>=7?best.off:0;
   offsets.push(use);bestTotal+=use===0?base.mean:best.raw;
   shifted.push([{x:a.x+nx*use,y:a.y+ny*use},{x:b.x+nx*use,y:b.y+ny*use}]);
  }
  const corners=[
   lineIntersection(...shifted[3],...shifted[0]),
   lineIntersection(...shifted[0],...shifted[1]),
   lineIntersection(...shifted[1],...shifted[2]),
   lineIntersection(...shifted[2],...shifted[3])
  ];
  if(corners.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return {quad:q,refined:false,gain:0};
  const nq=corners.map(p=>({x:p.x/w,y:p.y/h})),oldArea=scan.area(q),newArea=scan.area(nq),ratio=quadRatio(nq,w,h);
  if(!scan.validQuad(nq)||newArea<oldArea*.84||newArea>oldArea*1.17||ratio<1.34||ratio>1.97||nq.some(p=>p.x<.004||p.x>.996||p.y<.004||p.y>.996))return {quad:q,refined:false,gain:0};
  const before=edgeSupport(px,d,w,h),after=edgeSupport(corners,d,w,h),gain=after.strength-before.strength;
  const changed=offsets.some(v=>v!==0)&&after.sidesOk>=before.sidesOk&&gain>=.8;
  return changed?{quad:nq,refined:true,gain,offsets,before,after}:{quad:q,refined:false,gain:0,offsets,before,after};
 }
 function candidateFromBackground(source){
  const samp=scan.resize(source,480),w=samp.width,h=samp.height;
  if(w<120||h<120)return null;
  const d=samp.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const bg=[],border=Math.max(5,Math.floor(Math.min(w,h)*.075));
  for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){if(x<border||x>w-border||y<border||y>h-border)bg.push(pixel(d,w,x,y));}
  const ref=[0,1,2].map(j=>median(bg.map(p=>p[j])));
  const noise=bg.map(p=>dist(p,ref)),noise80=noise.sort((a,b)=>a-b)[Math.floor(noise.length*.80)]||0;
  if(noise80>51){debug?.push({why:'noise-border',noise80});return null;}
  const threshold=Math.max(11,noise80*1.6+7);
  let bits=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];bits[y*w+x]=Number(Math.hypot(r-ref[0],g-ref[1],b-ref[2])>threshold);
  }
  const radius=clamp(Math.round(Math.min(w,h)*.018),3,9);
  bits=morph(morph(bits,w,h,radius,radius,true),w,h,radius,radius,false);
  bits=morph(morph(bits,w,h,2,2,false),w,h,2,2,true);
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let candidates=[];
  for(let i=0;i<bits.length;i++){
   if(!bits[i]||seen[i])continue;let head=0,tail=1;
   queue[0]=i;seen[i]=1;let minX=w,minY=h,maxX=0,maxY=0,borderHits=0;const pts=[];
   while(head<tail){const k=queue[head++],x=k%w,y=(k/w)|0;
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    if(x<=2||y<=2||x>=w-3||y>=h-3)borderHits++;
    if((head%3)===0)pts.push({x,y});
    for(const n of [k-1,k+1,k-w,k+w]){
     if(n<0||n>=bits.length||seen[n]||!bits[n]||(Math.abs(n-k)===1&&Math.floor(n/w)!==y))continue;
     seen[n]=1;queue[tail++]=n;
    }
   }
   const relative=tail/(w*h),boxArea=(maxX-minX+1)*(maxY-minY+1),fill=tail/boxArea;
   if(relative<.085||relative>.82||fill<.36||borderHits>tail*.013){if(relative>.06)debug?.push({why:'component',relative,fill,borderHits,tail});continue;}
   if(minX<w*.018||maxX>w*.982||minY<h*.018||maxY>h*.982){debug?.push({why:'box-edge',minX,maxX,minY,maxY,w,h});continue;}
   const sums=[p=>p.x+p.y,p=>p.x-p.y,p=>p.x+p.y,p=>p.x-p.y];
   const q=[null,null,null,null],ext=[Infinity,-Infinity,-Infinity,Infinity];
   for(const p of pts){for(let j=0;j<4;j++){const val=sums[j](p);if((j===0||j===3)?val<ext[j]:val>ext[j]){ext[j]=val;q[j]=p;}}}
   if(q.some(p=>!p)||new Set(q).size<4){debug?.push({why:'missing-corners'});continue;}
   const cx=q.reduce((s,p)=>s+p.x,0)/4,cy=q.reduce((s,p)=>s+p.y,0)/4;
   const pad=clamp(Math.min(maxX-minX,maxY-minY)*.018,2,6);
   const expanded=q.map(p=>({x:p.x+(p.x-cx)/Math.max(1,Math.hypot(p.x-cx,p.y-cy))*pad,y:p.y+(p.y-cy)/Math.max(1,Math.hypot(p.x-cx,p.y-cy))*pad}));
   const preliminary=norm(expanded,w,h),fine=refineQuad(source,preliminary),normalized=fine.quad,ratio=quadRatio(normalized,w,h),area=scan.area(normalized);
   if(!scan.validQuad(normalized)||area<.08||area>.86||ratio<1.36||ratio>1.94){debug?.push({why:'quad-shape',ratio,area,q:normalized});continue;}
   if(normalized.some(p=>p.x<.008||p.x>.992||p.y<.008||p.y>.992)){debug?.push({why:'quad-near-boundary'});continue;}
   const edgePixels=normalized.map(p=>({x:p.x*w,y:p.y*h})),edges=edgeSupport(edgePixels,d,w,h);
   if(edges.sidesOk<3||edges.strength<20){debug?.push({why:'edge-support',edges});continue;}
   const rank=edges.strength*.3+fill*35+(edges.sidesOk===4?12:0)+(fine.refined?Math.min(6,fine.gain):0);
   candidates.push({quad:normalized,confidence:clamp(.81+(edges.sidesOk-3)*.065+(fill-.40)*.05+(fine.refined?.015:0),.81,.95),status:'found',cardLikely:ratio>1.43&&ratio<1.84,method:fine.refined?'physical-outer-boundaries-fine':'physical-outer-boundaries',reason:fine.refined?'Bordi fisici agganciati e rifiniti con precisione':'Bordi fisici esterni riconosciuti con margine di sicurezza',rank,edges,fine});
  }
  return candidates.sort((a,b)=>b.rank-a.rank)[0]||null;
 }
 function validateLegacy(source,found){
  if(!found||found.status!=='found'||!scan.validQuad(found.quad))return false;
  const q=found.quad,w=source.width,h=source.height,coverage=scan.area(q);
  if(coverage<.10||coverage>.81||q.some(p=>p.x<.012||p.x>.988||p.y<.012||p.y>.988))return false;
  const ratio=quadRatio(q,w,h);if(ratio<1.35||ratio>1.95)return false;
  const s=scan.resize(source,480),d=s.getContext('2d',{willReadFrequently:true}).getImageData(0,0,s.width,s.height).data;
  const edges=edgeSupport(q.map(p=>({x:p.x*s.width,y:p.y*s.height})),d,s.width,s.height);
  return edges.sidesOk>=3&&edges.strength>=23;
 }
 const oldDetect=scan.detectDocument;
 scan.detectDocument=(source)=>{
  const physical=candidateFromBackground(source);
  if(physical)return physical;
  const old=oldDetect(source),fine=old?.status==='found'&&scan.validQuad(old.quad)?refineQuad(source,old.quad):null,safe=fine?.refined?{...old,quad:fine.quad}:old;
  if(validateLegacy(source,safe))return {...safe,confidence:Math.min((safe.confidence||.8)+(fine?.refined?.02:0),.88),reason:fine?.refined?'Bordi confermati e rifiniti, controllo di sicurezza attivo':'Bordi confermati, controllo di sicurezza attivo'};
  return {quad:scan.defaultQuad(),confidence:0,status:'uncertain',reason:'Non riconosco con certezza tutti i bordi: mantengo la foto intera. Premi Correggi per impostare i quattro angoli.'};
 };
 window.DocFixGroup1={candidateFromBackground,validateLegacy,edgeSupport,refineQuad,version:'group1-superrun-20261105'};
})();