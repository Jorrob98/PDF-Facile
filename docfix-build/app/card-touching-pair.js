/* Two vertical cards touching or almost touching, photographed side by side.
 * Scratch-only edge/foreground evidence, no OCR, no identity data persisted.
 * Produces provisional CARD-sized crops; physical verification is separate.
 */
(()=>{'use strict';
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const median=a=>{a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]||0;};
function detect(original){
 const scanner=window.DocFixScanner;
 if(!scanner?.resize||!original?.width||!original?.height)return null;
 // This complements (does not replace) the existing stacked/portrait detector.
 const ratio=original.width/original.height;
 if(ratio<1.12||ratio>2.15)return null;
 let scratch=null;
 try{
  scratch=scanner.resize(original,440);
  const w=scratch.width,h=scratch.height;
  if(w<140||h<95)return null;
  const data=scratch.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  if(!data||data.length<w*h*4)return null;
  // Sample the desk/background from the external frame. Use the median,
  // not a single corner (camera glare can make one corner very bright).
  const rs=[],gs=[],bs=[],lum=[];
  const edge=Math.max(3,Math.round(Math.min(w,h)*.045));
  for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){
   if(x>=edge&&x<w-edge&&y>=edge&&y<h-edge)continue;
   const k=(y*w+x)*4;rs.push(data[k]);gs.push(data[k+1]);bs.push(data[k+2]);
  }
  const bg=[median(rs),median(gs),median(bs)];
  const bgLum=.2126*bg[0]+.7152*bg[1]+.0722*bg[2];
  // Only the dark-desktop case is handled here, not white A4 scans.
  if(bgLum>98)return null;
  const minLum=Math.max(90,bgLum+45);
  const mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const idx=y*w+x,k=idx*4;
   const red=data[k],green=data[k+1],blue=data[k+2];
   const brightness=.2126*red+.7152*green+.0722*blue;
   const contrast=Math.hypot(red-bg[0],green-bg[1],blue-bg[2]);
   if(brightness>=minLum&&contrast>=60)mask[idx]=1;
  }
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),components=[];
  for(let i=0;i<mask.length;i++){
   if(!mask[i]||seen[i])continue;
   let head=0,tail=1,count=0,x0=w,y0=h,x1=0,y1=0;
   queue[0]=i;seen[i]=1;
   while(head<tail){
    const p=queue[head++],px=p%w,py=(p/w)|0;
    count++;x0=Math.min(x0,px);x1=Math.max(x1,px);
    y0=Math.min(y0,py);y1=Math.max(y1,py);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     if(!dx&&!dy)continue;
     const xx=px+dx,yy=py+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;
     const z=yy*w+xx;if(mask[z]&&!seen[z]){seen[z]=1;queue[tail++]=z;}
    }
   }
   if(count>=w*h*.025){
    const bw=x1-x0+1,bh=y1-y0+1;
    components.push({x0,y0,x1:x1+1,y1:y1+1,area:count,bw,bh});
   }
  }
  components.sort((a,b)=>b.area-a.area);
  const cardLike=c=>{
   const shape=c.bh/Math.max(1,c.bw),fraction=c.area/(w*h);
   return shape>=1.30&&shape<=2.15&&fraction>=.028&&fraction<=.43&&
    c.x0>=w*.035&&c.x1<=w*.965&&c.y0>=h*.025&&c.y1<=h*.975;
  };
  const plausible=components.filter(cardLike).slice(0,6);
  let chosen=null;
  for(let i=0;i<plausible.length;i++)for(let j=i+1;j<plausible.length;j++){
   const a=plausible[i],b=plausible[j],left=a.x0<b.x0?a:b,right=a.x0<b.x0?b:a;
   const verticalOverlap=Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0))/
    Math.min(a.bh,b.bh);
   const gap=right.x0-left.x1,areaRatio=Math.max(a.area,b.area)/Math.min(a.area,b.area);
   if(verticalOverlap<.72||gap<-.035*w||gap>.18*w||areaRatio>2.05)continue;
   const score=a.area+b.area-Math.max(0,gap)*15;
   if(!chosen||score>chosen.score)chosen={pair:[left,right],score};
  }
  // When material is visually connected at the seam, distinguish two cards
  // from a single A4/page by a persistent INTERIOR vertical border.
  if(!chosen){
   const joined=components.find(c=>{
    const shape=c.bw/Math.max(1,c.bh);
    return c.area/(w*h)>.13&&shape>=1.07&&shape<=1.43&&
     c.x0>w*.06&&c.x1<w*.94&&c.y0>h*.035&&c.y1<h*.965;
   });
   if(!joined)return null;
   let best=null;
   for(let x=Math.round(joined.x0+joined.bw*.41);
       x<=Math.round(joined.x0+joined.bw*.59);x++){
    let strong=0,total=0,intensity=0;
    for(let y=Math.round(joined.y0+joined.bh*.12);
        y<Math.round(joined.y1-joined.bh*.12);y+=2){
     const xl=clamp(x-3,0,w-1),xr=clamp(x+3,0,w-1);
     const a=(y*w+xl)*4,b=(y*w+xr)*4;
     const delta=Math.hypot(data[a]-data[b],data[a+1]-data[b+1],data[a+2]-data[b+2]);
     intensity+=delta;if(delta>24)strong++;total++;
    }
    const continuity=strong/Math.max(1,total),mean=intensity/Math.max(1,total);
    if(continuity>=.55&&mean>=25&&(!best||mean>best.mean))
      best={x,mean};
   }
   if(!best){
    // Both cards can form one bright connected component. Never guess
    // an internal seam from a single colour blob; at least remove the
    // dark desk around the JOINT outline, leaving manual separation.
    const top=Math.max(2,joined.y0-h*.014),bottom=Math.min(h-2,joined.y1+h*.014);
    const x0=Math.max(2,joined.x0-w*.012),x1=Math.min(w-2,joined.x1+w*.012);
    const half=Math.round((joined.x0+joined.x1)/2);
    const sums=[0,0,0],leftSum=[0,0,0],rightSum=[0,0,0];
    let count=0,matchingRows=0,rowCount=0;
    for(let y=Math.round(joined.y0+joined.bh*.19);
        y<Math.round(joined.y1-joined.bh*.19);y+=3){
     let ls=[0,0,0],rs=[0,0,0],n=0;
     for(let x=Math.round(joined.x0+joined.bw*.10);
         x<Math.round(joined.x0+joined.bw*.40);x+=3){
      const a=(y*w+x)*4,b=(y*w+x+Math.round(joined.bw*.50))*4;
      for(let c=0;c<3;c++){ls[c]+=data[a+c];rs[c]+=data[b+c]}
      n++;
     }
     if(!n)continue;
     const delta=Math.hypot(...ls.map((v,i)=>(v-rs[i])/n));
     if(delta>12)matchingRows++;
     rowCount++;sums[0]+=delta;count++;
    }
    const difference=sums[0]/Math.max(1,count);
    // A blank A4 or a one-colour object is not evidence for a card pair.
    if(difference<13||matchingRows/Math.max(1,rowCount)<.55)return null;
    const q=[{x:x0/w,y:top/h},{x:x1/w,y:top/h},
      {x:x1/w,y:bottom/h},{x:x0/w,y:bottom/h}];
    return {group:{quad:q,confidence:.58,physicallyVerified:false,
      method:'joined-two-card-outer-material',contactGroup:true},
      cards:null,verified:false,provisional:true,
      reason:'tessere a contatto: soltanto il contorno esterno è individuato'};
   }
   const left={x0:joined.x0,x1:best.x,y0:joined.y0,y1:joined.y1,
    bw:best.x-joined.x0,bh:joined.bh,area:joined.area/2};
   const right={x0:best.x,x1:joined.x1,y0:joined.y0,y1:joined.y1,
    bw:joined.x1-best.x,bh:joined.bh,area:joined.area/2};
   if(!cardLike(left)||!cardLike(right))return null;
   chosen={pair:[left,right],score:joined.area};
  }
  const pair=chosen.pair,mid=(pair[0].x1+pair[1].x0)/2;
  const cards=pair.map((c,i)=>{
   const padX=Math.max(1,w*.009),padY=Math.max(1,h*.012);
   let left=clamp(c.x0-padX,2,w-2),right=clamp(c.x1+padX,2,w-2);
   if(i===0)right=Math.min(right,mid);
   else left=Math.max(left,mid);
   const top=clamp(c.y0-padY,2,h-2),bottom=clamp(c.y1+padY,2,h-2);
   const q=[{x:left/w,y:top/h},{x:right/w,y:top/h},
    {x:right/w,y:bottom/h},{x:left/w,y:bottom/h}];
   return {status:'found',quad:q,confidence:.71,physicallyVerified:false,
    method:'touching-portrait-cards-source-contrast',splitSlot:i,
    box:{x:left/w,y:top/h,width:(right-left)/w,height:(bottom-top)/h}};
  });
  const shape=window.DocFixPairProof?.geometry?.(original,cards);
  if(shape?.ok!==true)return null;
  return {cards,verified:false,provisional:true,reason:'due tessere affiancate: bordi da verificare'};
 }catch(e){
  console.warn('DocFix: coppia di tessere a contatto non riconoscibile',e);
  return null;
 }finally{
  if(scratch&&scratch!==original)scratch.width=scratch.height=1;
 }
}
window.DocFixTouchingCards=Object.freeze({detect,version:'1.9.41'});
})();