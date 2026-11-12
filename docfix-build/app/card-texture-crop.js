/* DocFix 1.9.8 - background-texture card detection.
 * Only analyzes a temporary scaled canvas. All final crops originate from
 * the untouched, full-resolution source (one perspective transformation).
 * Offline, no personal data upload, no document text generation. */
(()=>{'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const linear=new Float32Array(256);
for(let i=0;i<256;i++){const a=i/255;linear[i]=a<=.04045?a/12.92:Math.pow((a+.055)/1.055,2.4)}
function medianSmall(a){a.sort((x,y)=>x-y);return a[(a.length/2)|0]||0}
function toLab(data,w,h){
 const v=new Float32Array(w*h*3);
 for(let i=0,j=0;i<data.length;i+=4,j+=3){
  const r=linear[data[i]],g=linear[data[i+1]],b=linear[data[i+2]];
  const x=(.4124564*r+.3575761*g+.1804375*b)/.95047;
  const y=(.2126729*r+.7151522*g+.0721750*b);
  const z=(.0193339*r+.1191920*g+.9503041*b)/1.08883;
  const f=t=>t>.008856451679?Math.cbrt(t):(7.787037*t+16/116);
  const X=f(x),Y=f(y),Z=f(z);
  v[j]=(116*Y-16)*2.55;
  v[j+1]=500*(X-Y)+128;
  v[j+2]=200*(Y-Z)+128;
 }return v;
}
function predictBackground(lab,w,h){
 const left=new Float32Array(h*3),right=new Float32Array(h*3),
 x1=Math.max(2,Math.round(w*.020)),x2=Math.max(x1+3,Math.round(w*.067));
 for(let y=0;y<h;y++)for(let c=0;c<3;c++){
  const a=[],b=[];for(let x=x1;x<x2;x++){a.push(lab[(y*w+x)*3+c]);b.push(lab[(y*w+(w-1-x))*3+c]);}
  left[y*3+c]=medianSmall(a);right[y*3+c]=medianSmall(b);
 }
 function smooth(input){
  const result=new Float32Array(h*3),radius=Math.round(h*.016);
  for(let c=0;c<3;c++){
   const prefix=new Float64Array(h+1);
   for(let y=0;y<h;y++)prefix[y+1]=prefix[y]+input[y*3+c];
   for(let y=0;y<h;y++){
    const a=Math.max(0,y-radius),b=Math.min(h-1,y+radius);
    result[y*3+c]=(prefix[b+1]-prefix[a])/(b-a+1);
   }
  }return result;
 }
 const l=smooth(left),r=smooth(right);
 // Cards near the left/right photograph edges must not become background
 // training pixels. Use top-to-bottom continuity when an edge is occluded.
 function fixOccludedEdge(arr){
  const margin=Math.max(4,Math.round(h*.065)),end=h-margin;
  const top=[0,0,0],bottom=[0,0,0];
  for(let y=1;y<margin;y++)for(let c=0;c<3;c++){
   top[c]+=arr[y*3+c];bottom[c]+=arr[(h-1-y)*3+c];
  }
  for(let c=0;c<3;c++){top[c]/=(margin-1);bottom[c]/=(margin-1)}
  for(let y=margin;y<end;y++){
   const t=(y-margin)/Math.max(1,end-margin),k=y*3;
   const e0=top[0]+(bottom[0]-top[0])*t;
   const e1=top[1]+(bottom[1]-top[1])*t;
   const e2=top[2]+(bottom[2]-top[2])*t;
   const d0=arr[k]-e0,d1=arr[k+1]-e1,d2=arr[k+2]-e2;
   if(d0*d0+d1*d1+d2*d2>46*46){arr[k]=e0;arr[k+1]=e1;arr[k+2]=e2}
  }
 }
 fixOccludedEdge(l);fixOccludedEdge(r);
 return {left:l,right:r};
}
function maskFromColor(lab,w,h,bg,threshold){
 const mask=new Uint8Array(w*h);
 for(let y=0;y<h;y++){
  let j=y*w*3,k=y*3;
  const l0=bg.left[k],l1=bg.left[k+1],l2=bg.left[k+2];
  const dr0=bg.right[k]-l0,dr1=bg.right[k+1]-l1,dr2=bg.right[k+2]-l2;
  for(let x=0;x<w;x++,j+=3){
   const t=x/Math.max(1,w-1),a=lab[j]-l0-dr0*t,b=lab[j+1]-l1-dr1*t,c=lab[j+2]-l2-dr2*t;
   mask[y*w+x]=(a*a+b*b+c*c)>threshold*threshold?1:0;
  }
 }return mask;
}
function morph(binary,w,h,rx,ry,isDilate){
 const stride=w+1,integral=new Uint32Array((w+1)*(h+1));
 for(let y=0;y<h;y++){
  let row=0,from=y*w,to=(y+1)*stride,prev=y*stride;
  for(let x=0;x<w;x++){row+=binary[from+x];integral[to+x+1]=integral[prev+x+1]+row;}
 }
 const out=new Uint8Array(w*h);
 for(let y=0;y<h;y++){
  const top=Math.max(0,y-ry),bottom=Math.min(h-1,y+ry),nrows=bottom-top+1;
  for(let x=0;x<w;x++){
   const left=Math.max(0,x-rx),right=Math.min(w-1,x+rx),p=(bottom+1)*stride,q=top*stride;
   const sum=integral[p+right+1]-integral[q+right+1]-integral[p+left]+integral[q+left];
   out[y*w+x]=isDilate?(sum>0?1:0):(sum===nrows*(right-left+1)?1:0);
  }
 }return out;
}

// Mends only a narrow, near-full-width highlight in the temporary mask.
// A reflected stripe must not connect a card to both photo margins.
// Restore support from adjacent rows; never alter the source RGBA image.
function mendHorizontalGlare(mask,w,h){
 const occupancy=new Uint32Array(h);
 for(let y=0;y<h;y++){
  let count=0,base=y*w;
  for(let x=0;x<w;x++)count+=mask[base+x];
  occupancy[y]=count;
 }
 const minWidth=Math.round(w*.80),maxLength=Math.max(3,Math.round(h*.042));
 for(let y=2;y<h-2;){
  if(occupancy[y]<minWidth){y++;continue}
  const start=y;
  while(y<h-2&&occupancy[y]>=minWidth)y++;
  const end=y-1,len=end-start+1;
  if(len>maxLength||occupancy[start-1]>w*.62||occupancy[end+1]>w*.62)continue;
  for(let k=0;k<len;k++){
   const dst=(start+k)*w,above=(start-1)*w,below=(end+1)*w;
   for(let x=0;x<w;x++){
    const before=mask[above+x],after=mask[below+x];
    mask[dst+x]=before&&after?1:before?(k<len/2?1:0):after?(k>=len/2?1:0):0;
   }
  }
 }
 return mask;
}
function connectedCards(mask,w,h){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),cards=[];
 for(let p=0;p<mask.length;p++){
  if(!mask[p]||seen[p])continue;
  seen[p]=1;queue[0]=p;let head=0,tail=1,xmin=w,ymin=h,xmax=0,ymax=0;
  const border=[];let sx=0,sy=0;
  while(head<tail){
   const pos=queue[head++],x=pos%w,y=(pos/w)|0;
   if(x<xmin)xmin=x;if(x>xmax)xmax=x;if(y<ymin)ymin=y;if(y>ymax)ymax=y;sx+=x;sy+=y;
   const n=[pos-1,pos+1,pos-w,pos+w];let edge=false;
   for(let k=0;k<4;k++){
    const t=n[k];if(t<0||t>=mask.length||((k<2)&&Math.floor(t/w)!==y)){edge=true;continue}
    if(!mask[t]){edge=true;continue}
    if(!seen[t]){seen[t]=1;queue[tail++]=t;}
   }
   if(edge&&head%2===0)border.push([x,y]);
  }
  const bw=xmax-xmin+1,bh=ymax-ymin+1,area=tail;
  // Match both horizontal and vertical Italian ID cards. The older code
  // discarded portrait-shaped (90-degree WhatsApp) cards before measuring
  // their physical corners.
  const shape=Math.max(bw/bh,bh/bw);
  if(area<.023*w*h||bw<.15*w||bh<.10*h||shape>2.25)continue;
  const fill=area/(bw*bh);if(fill<.42)continue;
  cards.push({xmin,ymin,xmax,ymax,area,fill,border,cx:sx/area,cy:sy/area});
 }
 return cards.sort((a,b)=>b.area-a.area).slice(0,8);
}
function rectifyBox(component,w,h){
 const points=component.border;if(points.length<90)return null;
 let best=null;
 const scanAngles=(from,to,step)=>{
 for(let ang=from;ang<=to+.00001;ang+=step){
  const a=ang*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),xvec=[],yvec=[];
  for(let j=0;j<points.length;j++){
   const [x,y]=points[j],dx=x-component.cx,dy=y-component.cy;
   xvec.push(dx*cs+dy*sn);yvec.push(dy*cs-dx*sn);
  }
  xvec.sort((a,b)=>a-b);yvec.sort((a,b)=>a-b);
  const lo=Math.max(0,Math.floor(points.length*.002)),hi=Math.min(points.length-1,Math.ceil(points.length*.998));
  const x0=xvec[lo],x1=xvec[hi],y0=yvec[lo],y1=yvec[hi],ww=x1-x0,hh=y1-y0,ratio=ww/hh,shape=Math.max(ratio,1/Math.max(.0001,ratio));
  if(shape<1.35||shape>1.93)continue;
  const score=(ww*hh)*(1+Math.abs(ratio-1.586)*.09)+Math.abs(ang)*3;
  if(!best||score<best.score)best={ang,cs,sn,x0,x1,y0,y1,ww,hh,ratio,score};
 }
 };
 scanAngles(-9,9,.5);
 // Wider deskew is costly: only search beyond 9° if the initial solution
 // was absent or pinned to the edge of the normal search interval.
 if(!best||Math.abs(best.ang)>=8.5){
  scanAngles(-32,-9.5,1.5);scanAngles(9.5,32,1.5);
 }
 if(!best)return null;
 // Require extensive straight-line support on all four sides. An oval
 // can have a plausible bounding rectangle but is not a physical ID card.
 const bins=[new Uint8Array(12),new Uint8Array(12),new Uint8Array(12),new Uint8Array(12)];
 const tol=Math.max(2,Math.min(best.ww,best.hh)*.035);
 for(const point of points){
  const dx=point[0]-component.cx,dy=point[1]-component.cy;
  const u=dx*best.cs+dy*best.sn,v=dy*best.cs-dx*best.sn;
  const xx=clamp(Math.floor((u-best.x0)/best.ww*12),0,11);
  const yy=clamp(Math.floor((v-best.y0)/best.hh*12),0,11);
  if(Math.abs(u-best.x0)<=tol)bins[0][yy]=1;
  if(Math.abs(u-best.x1)<=tol)bins[1][yy]=1;
  if(Math.abs(v-best.y0)<=tol)bins[2][xx]=1;
  if(Math.abs(v-best.y1)<=tol)bins[3][xx]=1;
 }
 const sideBins=bins.map(b=>b.reduce((n,v)=>n+v,0));
 if(sideBins.some(n=>n<6))return null;
 const p=Math.max(1,Math.min(w,h)*.0025),{cs,sn}=best;
 const box=[[best.x0-p,best.y0-p],[best.x1+p,best.y0-p],[best.x1+p,best.y1+p],[best.x0-p,best.y1+p]];
 const quad=box.map(([x,y])=>({x:clamp((component.cx+x*cs-y*sn)/w,0,1),y:clamp((component.cy+x*sn+y*cs)/h,0,1)}));
 return {...best,quad};
}
function analyzeRGBA(pixels,w,h){
 if(!pixels||w<200||h<250)return {cards:[],reason:'immagine piccola'};
 const lab=toLab(pixels,w,h),bg=predictBackground(lab,w,h);
 let best=null;
 // Include low-contrast cards without adding an expensive extra scan:
 // four thresholds remain, with two calibrated to muted scanner photos.
 for(const threshold of [30,26,20,16]){
  let bits=mendHorizontalGlare(maskFromColor(lab,w,h,bg,threshold),w,h);
  let k=Math.max(2,Math.round(Math.min(w,h)*.007));
  bits=morph(morph(bits,w,h,k,k,false),w,h,k,k,true);
  // The old 1.9% closing radius merged adjacent cards separated by
  // only 4-5px at thumbnail scale, so independent perimeters disappeared.
  // A one-pixel closing radius preserves four-pixel gaps while cleaning noise.
  k=1;
  bits=morph(morph(bits,w,h,k,k,true),w,h,k,k,false);
  const comps=connectedCards(bits,w,h),cards=[];
  for(const c of comps){
   const result=rectifyBox(c,w,h);
   if(!result)continue;
   const coverage=c.area/(w*h);
   const physicalRatio=Math.max(result.ratio,1/result.ratio);
   if(physicalRatio<1.38||physicalRatio>1.85||coverage<.035||coverage>.44)continue;
   if(result.quad.some(p=>p.x<.008||p.x>.992||p.y<.008||p.y>.992))continue;
   const confidence=Math.min(.97,.76+(.18*Math.min(1,c.fill))+.025*(physicalRatio>1.46&&physicalRatio<1.74));
   cards.push({quad:result.quad,confidence,method:'source-background-texture',angle:result.ang,coverage,ratio:physicalRatio,rotated90:result.ratio<1,maskFill:c.fill});
  }
  // Consistent reading order for both stacked and side-by-side cards.
  if(cards.length>1){
   const center=c=>({x:c.quad.reduce((v,p)=>v+p.x,0)/4,y:c.quad.reduce((v,p)=>v+p.y,0)/4});
   const xspread=Math.max(...cards.map(c=>center(c).x))-Math.min(...cards.map(c=>center(c).x));
   const yspread=Math.max(...cards.map(c=>center(c).y))-Math.min(...cards.map(c=>center(c).y));
   cards.sort((a,b)=>xspread>yspread?center(a).x-center(b).x:center(a).y-center(b).y);
  }
  if(!best||Math.abs(cards.length-2)<Math.abs(best.cards.length-2))best={cards,threshold};
  if(cards.length===2)break;
 }

 // Optional last-resort recovery for TWO extremely low-contrast documents.
 // Never replace an already recognized card, and never trust one faint mask.
 // The 8 and 6 thresholds must independently confirm two nearly identical,
 // non-overlapping four-sided rectangles; pair proof will still audit originals.
 if(best?.cards?.length===0){
  const atLowThreshold=(threshold)=>{
   let bits=mendHorizontalGlare(maskFromColor(lab,w,h,bg,threshold),w,h);
   const k=Math.max(2,Math.round(Math.min(w,h)*.007));
   bits=morph(morph(bits,w,h,k,k,false),w,h,k,k,true);
   bits=morph(morph(bits,w,h,1,1,true),w,h,1,1,false);
   const cards=[];
   for(const c of connectedCards(bits,w,h)){
    const result=rectifyBox(c,w,h);if(!result)continue;
    const coverage=c.area/(w*h),shape=Math.max(result.ratio,1/result.ratio);
    if(shape<1.38||shape>1.85||coverage<.035||coverage>.44)continue;
    if(result.quad.some(p=>p.x<.008||p.x>.992||p.y<.008||p.y>.992))continue;
    cards.push({quad:result.quad,confidence:.82,method:'low-contrast-two-threshold-provisional',
     angle:result.ang,coverage,ratio:shape,rotated90:result.ratio<1,maskFill:c.fill});
   }
   return cards.length===2?cards:null;
  };
  const a=atLowThreshold(8),b=a?atLowThreshold(6):null;
  if(a&&b){
   const bounds=c=>{
    const xs=c.quad.map(p=>p.x),ys=c.quad.map(p=>p.y);
    return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};
   };
   const iou=(c,d)=>{
    const p=bounds(c),q=bounds(d);
    const intersection=Math.max(0,Math.min(p.x1,q.x1)-Math.max(p.x0,q.x0))*
     Math.max(0,Math.min(p.y1,q.y1)-Math.max(p.y0,q.y0));
    const a=(p.x1-p.x0)*(p.y1-p.y0),b=(q.x1-q.x0)*(q.y1-q.y0);
    return intersection/Math.max(1e-8,a+b-intersection);
   };
   const stable=a.every(c=>b.some(other=>iou(c,other)>=.87));
   const separate=iou(a[0],a[1])<.12;
   if(stable&&separate){
    const mid=c=>({x:c.quad.reduce((s,p)=>s+p.x,0)/4,
     y:c.quad.reduce((s,p)=>s+p.y,0)/4});
    const va=mid(a[0]),vb=mid(a[1]),leftToRight=Math.abs(va.x-vb.x)>Math.abs(va.y-vb.y);
    a.sort((c,d)=>leftToRight?mid(c).x-mid(d).x:mid(c).y-mid(d).y);
    return {cards:a,threshold:8,reason:'doppio contorno debole da verificare'};
   }
  }
 }
 return best||{cards:[],reason:'bordi non confermati'};
}
function detect(original){
 const scan=window.DocFixScanner;if(!scan||!original)return {cards:[],reason:'scanner non disponibile'};
 const sample=scan.resize(original,600),ctx=sample.getContext('2d',{willReadFrequently:true});
 let output;
 try{output=analyzeRGBA(ctx.getImageData(0,0,sample.width,sample.height).data,sample.width,sample.height)}
 finally{if(sample!==original)sample.width=sample.height=1;}
 return output;
}
window.DocFixRealCrop=Object.freeze({detect,analyzeRGBA,version:'1.9.34'});
})();
