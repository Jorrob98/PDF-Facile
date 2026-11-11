/* DocFix lab — independent projection document splitter.
 * Scope: fallback only when existing full-outline detectors fail.
 * The result is provisional: source pixels are retained and every card
 * remains marked for review. No OCR, network, storage, or uploaded data.
 */
(()=>{'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function lab(r,g,b){
 let x=r/255,y=g/255,z=b/255;
 x=x>.04045?Math.pow((x+.055)/1.055,2.4):x/12.92;
 y=y>.04045?Math.pow((y+.055)/1.055,2.4):y/12.92;
 z=z>.04045?Math.pow((z+.055)/1.055,2.4):z/12.92;
 const X=(.4124564*x+.3575761*y+.1804375*z)/.95047;
 const Y=(.2126729*x+.7151522*y+.0721750*z);
 const Z=(.0193339*x+.1191920*y+.9503041*z)/1.08883;
 const f=t=>t>.008856?Math.cbrt(t):(7.787*t+16/116);
 const fx=f(X),fy=f(Y),fz=f(Z);
 return [255*(116*fy-16)/100,128+500*(fx-fy),128+200*(fy-fz)];
}
function median(a){a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]||0;}
function signal(d,w,h){
 const p=Math.max(2,Math.round(Math.min(w,h)*.03)),bs=[[],[],[]];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(!(y<p||y>=h-p||x<p||x>=w-p))continue;
  const i=(y*w+x)*4,L=lab(d[i],d[i+1],d[i+2]);
  for(let k=0;k<3;k++)bs[k].push(L[k]);
 }
 const bg=bs.map(median),color=new Uint8Array(w*h),diff=new Uint8Array(w*h),gray=new Uint8Array(w*h);
 for(let i=0;i<w*h;i++){
  const k=i*4,r=d[k],g=d[k+1],b=d[k+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  const sat=mx===0?0:255*(mx-mn)/mx,L=lab(r,g,b);
  const D=Math.hypot(L[0]-bg[0],L[1]-bg[1],L[2]-bg[2]);
  diff[i]=D>25?1:0;color[i]=(sat>50||D>24)?1:0;
  gray[i]=Math.round(.299*r+.587*g+.114*b);
 }
 return {color,diff,gray};
}
function smooth(p,r){
 const n=p.length,out=new Float64Array(n),sum=new Float64Array(n+1);
 for(let i=0;i<n;i++)sum[i+1]=sum[i]+p[i];
 for(let i=0;i<n;i++){const a=Math.max(0,i-r),b=Math.min(n,i+r+1);out[i]=(sum[b]-sum[a])/(b-a);}
 return out;
}
function subregions(mask,w,h,region,axis,thr,gap){
 const [x0,y0,x1,y1]=region,bw=x1-x0,bh=y1-y0,n=axis===0?bw:bh;
 if(n<24)return [];
 const p=new Float64Array(n),cross=axis===0?bh:bw;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)p[axis===0?x-x0:y-y0]+=mask[y*w+x];
 for(let i=0;i<n;i++)p[i]/=cross;
 const b=smooth(p,Math.max(1,Math.round(n*.014))),top=Math.max(...b);
 if(top<.01)return [];
 const on=new Uint8Array(n),threshold=Math.max(.007,thr*top);
 for(let i=0;i<n;i++)on[i]=b[i]>threshold?1:0;
 const close=Math.max(2,Math.round(n*gap));let prev=-1;
 for(let i=0;i<n;i++)if(on[i]){
  if(prev>=0&&i-prev<=close+1)for(let j=prev;j<i;j++)on[j]=1;
  prev=i;
 }
 const out=[];let a=-1;
 for(let i=0;i<=n;i++){
  if(i<n&&on[i]){if(a<0)a=i;}
  else if(a>=0){
   if(i-a>=n*.12){
    const p0=a+(axis===0?x0:y0),p1=i+(axis===0?x0:y0);
    out.push(axis===0?[p0,y0,p1,y1]:[x0,p0,x1,p1]);
   }
   a=-1;
  }
 }
 return out;
}
function bounds(mask,w,h,reg){
 const [x0,y0,x1,y1]=reg,xc=new Int32Array(w),yc=new Int32Array(h);let n=0;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(mask[y*w+x]){xc[x]++;yc[y]++;n++;}
 if(n<30)return null;
 const quant=(a,target)=>{let sum=0;
  for(let i=0;i<a.length;i++){sum+=a[i];if(sum>=target*n)return i;}
  return a.length-1;
 };
 return [quant(xc,.06),quant(yc,.06),quant(xc,.94),quant(yc,.94)];
}
function valid(box,w,h){
 if(!box)return false;
 const bw=box[2]-box[0],bh=box[3]-box[1];
 if(Math.min(bw,bh)<12)return false;
 const ratio=Math.max(bw,bh)/Math.min(bw,bh),a=bw*bh/(w*h);
 return ratio>1.30&&ratio<2.22&&a>.018&&a<.65;
}
function validate(boxes){
 const areas=boxes.map(b=>(b[2]-b[0])*(b[3]-b[1]));
 if(Math.max(...areas)/Math.min(...areas)>2.8)return false;
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const b=boxes[i],c=boxes[j];
  const overlap=Math.max(0,Math.min(b[2],c[2])-Math.max(b[0],c[0]))
   *Math.max(0,Math.min(b[3],c[3])-Math.max(b[1],c[1]));
  if(overlap/Math.min(areas[i],areas[j])>.12)return false;
 }
 return true;
}
function proposals(mask,w,h){
 const root=[0,0,w,h],out=[];
 for(const axis of [0,1])for(const thr of [.13,.19,.26])for(const gap of [.03,.05]){
  const regions=subregions(mask,w,h,root,axis,thr,gap);
  if(regions.length<2||regions.length>3)continue;
  const variants=[regions];
  if(regions.length===2)for(let i=0;i<2;i++){
   const kids=subregions(mask,w,h,regions[i],1-axis,thr,gap);
   if(kids.length===2)variants.push([...regions.slice(0,i),...kids,...regions.slice(i+1)]);
  }
  for(const rs of variants){
   const boxes=rs.map(r=>bounds(mask,w,h,r));
   if(boxes.every(b=>valid(b,w,h))&&validate(boxes))out.push(boxes);
  }
 }
 return out;
}
function edgeFraction(gray,w,h,box){
 const [x0,y0,x1,y1]=box.map(Math.round);
 let pixels=0,edges=0;
 for(let y=Math.max(2,y0);y<Math.min(h-2,y1);y+=2)
  for(let x=Math.max(2,x0);x<Math.min(w-2,x1);x+=2){
   const i=y*w+x;
   const gx=Math.abs(gray[i+1]-gray[i-1])+Math.abs(gray[i+w+1]-gray[i+w-1]);
   const gy=Math.abs(gray[i+w]-gray[i-w])+Math.abs(gray[i+w+1]-gray[i-w-1]);
   edges+=Number(gx+gy>65);pixels++;
  }
 return edges/Math.max(1,pixels);
}
function iou(a,b){
 const intersection=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))
  *Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
 const areaA=(a[2]-a[0])*(a[3]-a[1]),areaB=(b[2]-b[0])*(b[3]-b[1]);
 return intersection/Math.max(1,areaA+areaB-intersection);
}
function agree(a,b){
 if(a.length!==b.length)return false;
 const x=[...a].sort((u,v)=>u[1]-v[1]||u[0]-v[0]);
 const y=[...b].sort((u,v)=>u[1]-v[1]||u[0]-v[0]);
 return x.every((box,i)=>iou(box,y[i])>.55);
}
function analyzeRGBA(data,w,h){
 if(!data||w<90||h<110||data.length<w*h*4)return null;
 const {color,diff,gray}=signal(data,w,h),a=proposals(color,w,h),b=proposals(diff,w,h);
 for(const x of a)for(const y of b){
  if(!agree(x,y)||x.some(box=>edgeFraction(gray,w,h,box)<.065))continue;
  const sorted=[...x].sort((p,q)=>p[1]-q[1]||p[0]-q[0]);
  return {cards:sorted.map(box=>{
   const [x0,y0,x1,y1]=box,px=Math.max(3,(x1-x0)*.055),py=Math.max(3,(y1-y0)*.055);
   const left=clamp(x0-px,1,w-2)/w,right=clamp(x1+px,1,w-2)/w;
   const top=clamp(y0-py,1,h-2)/h,bottom=clamp(y1+py,1,h-2)/h;
   return {quad:[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}],
    confidence:.75,physicallyVerified:false,needsReview:true};
  }),method:'two-independent-projections',needsReview:true,verifiedSplit:true};
 }
 return null;
}
function detect(original){
 const scan=window.DocFixScanner;
 if(!original?.width||!original?.height||!scan?.resize)return null;
 let sample=null;
 try{
  sample=scan.resize(original,520);
  const w=sample.width,h=sample.height;
  const g=sample.getContext('2d',{willReadFrequently:true});
  return analyzeRGBA(g.getImageData(0,0,w,h).data,w,h);
 }catch(e){console.warn('DocFix: projection fallback unavailable',e);return null;}
 finally{if(sample&&sample!==original)sample.width=sample.height=1;}
}
window.DocFixIndependentProjection=Object.freeze({analyzeRGBA,detect,version:'lab-1'});
})();