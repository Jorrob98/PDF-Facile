/* DocFix 1.9.57: two independent plastic ID-1 cards on warm paper.
 * Source-pixel analysis only, offline. Candidate corners are provisional and
 * must be manually approved before any PDF. No customer data or OCR is saved.
 */
(()=>{'use strict';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const linear=new Float32Array(256);
for(let i=0;i<256;i++){const v=i/255;linear[i]=v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}
const f=t=>t>.008856451679?Math.cbrt(t):7.787037*t+16/116;
function median(a){if(!a.length)return 0;a.sort((x,y)=>x-y);return a[a.length>>1];}
function closing(mask,w,h,r){
 const pass=(src,dilate)=>{
  const stride=w+1,ii=new Int32Array((w+1)*(h+1)),out=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0,row=0;x<w;x++){
   row+=src[y*w+x];ii[(y+1)*stride+x+1]=row+ii[y*stride+x+1];
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const x0=Math.max(0,x-r),x1=Math.min(w-1,x+r),y0=Math.max(0,y-r),y1=Math.min(h-1,y+r);
   const sum=ii[(y1+1)*stride+x1+1]-ii[y0*stride+x1+1]-ii[(y1+1)*stride+x0]+ii[y0*stride+x0];
   out[y*w+x]=dilate?Number(sum>0):Number(sum===(x1-x0+1)*(y1-y0+1));
  }
  return out;
 };
 return pass(pass(mask,true),false);
}
function regions(mask,w,h){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),regions=[];
 for(let i=0;i<mask.length;i++){
  if(!mask[i]||seen[i])continue;
  seen[i]=1;queue[0]=i;let head=0,tail=1,x0=w,x1=0,y0=h,y1=0;
  const border=[];
  while(head<tail){
   const k=queue[head++],x=k%w,y=(k/w)|0;
   if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
   let isBorder=false;
   const next=[k-1,k+1,k-w,k+w];
   for(let z=0;z<4;z++){
    const j=next[z];
    if(j<0||j>=mask.length||(z<2&&((j/w)|0)!==y)||!mask[j]){isBorder=true;continue;}
    if(!seen[j]){seen[j]=1;queue[tail++]=j;}
   }
   if(isBorder&&border.length<5500&&(x+y)%2===0)border.push({x,y});
  }
  if(tail>Math.max(150,w*h*.008))regions.push({x0,x1,y0,y1,pixels:tail,border});
 }
 return regions.sort((a,b)=>b.pixels-a.pixels).slice(0,20);
}
function rect(region,w,h){
 if(region.border.length<35)return null;
 let best=null;
 for(let deg=-13;deg<=13;deg+=.5){
  const a=deg*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a);
  let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
  for(const p of region.border){
   const u=p.x*cs+p.y*sn,v=p.y*cs-p.x*sn;
   if(u<u0)u0=u;if(u>u1)u1=u;if(v<v0)v0=v;if(v>v1)v1=v;
  }
  const ww=u1-u0,hh=v1-v0,ratio=ww/hh;
  if(ratio<1.27||ratio>2.10)continue;
  const area=ww*hh;
  if(!best||area<best.area)best={cs,sn,u0,u1,v0,v1,area,ratio};
 }
 if(!best)return null;
 // Keep a thin exterior safety margin to avoid loss of the outer print.
 const box=[[best.u0-2,best.v0-2],[best.u1+2,best.v0-2],
  [best.u1+2,best.v1+2],[best.u0-2,best.v1+2]];
 const quad=box.map(([u,v])=>({x:(u*best.cs-v*best.sn)/w,y:(u*best.sn+v*best.cs)/h}));
 if(quad.some(p=>p.x<.007||p.x>.993||p.y<.007||p.y>.993))return null;
 const area=best.area/(w*h);
 if(area<.05||area>.34)return null;
 return {quad,coverage:area,ratio:best.ratio};
}
function analyzeRGBA(data,w,h){
 if(!data||data.length<w*h*4||w<260||h<180||w/h<1.12||w/h>2.10)return null;
 const mask=new Uint8Array(w*h),bg=[];
 for(let y=0;y<h;y+=5)for(let x=0;x<w;x+=5){
  if(x>w*.07&&x<w*.93&&y>h*.06&&y<h*.94)continue;
  const k=(y*w+x)*4,rr=linear[data[k]],gg=linear[data[k+1]],bb=linear[data[k+2]];
  const fy=f(.2126729*rr+.7151522*gg+.0721750*bb);
  const fz=f((.0193339*rr+.1191920*gg+.9503041*bb)/1.08883);
  bg.push(128+200*(fy-fz));
 }
 // A neutral/blue desk is not the warm paper background intended here.
 if(bg.length<30||median(bg)<132)return null;
 let blue=0;
 for(let i=0;i<w*h;i++){
  const k=i*4,rr=linear[data[k]],gg=linear[data[k+1]],bb=linear[data[k+2]];
  const fy=f(.2126729*rr+.7151522*gg+.0721750*bb);
  const fx=f((.4124564*rr+.3575761*gg+.1804375*bb)/.95047);
  const fz=f((.0193339*rr+.1191920*gg+.9503041*bb)/1.08883);
  if(128+200*(fy-fz)<129&&128+500*(fx-fy)<140){mask[i]=1;blue++;}
 }
 if(blue/(w*h)<.07||blue/(w*h)>.54)return null;
 const radius=clamp(Math.round(Math.min(w,h)*.011),3,9);
 const regionsFound=regions(closing(mask,w,h,radius),w,h);
 const candidates=regionsFound.filter(p=>{
  const bw=p.x1-p.x0+1,bh=p.y1-p.y0+1,ratio=bw/bh,area=bw*bh/(w*h);
  return p.x0>w*.018&&p.x1<w*.982&&p.y0>h*.08&&p.y1<h*.82&&
   bw>w*.24&&bw<w*.65&&bh>h*.17&&bh<h*.55&&
   ratio>1.17&&ratio<2.55&&area>.048&&area<.31&&p.pixels/(bw*bh)>.17;
 });
 if(candidates.length<2)return null;
 const merged=[];
 for(const part of candidates){
  const existing=merged.find(p=>{
   const overlap=Math.max(0,Math.min(p.x1,part.x1)-Math.max(p.x0,part.x0));
   const narrow=Math.min(p.x1-p.x0,part.x1-part.x0);
   const gap=Math.max(0,Math.max(p.y0,part.y0)-Math.min(p.y1,part.y1));
   return overlap/Math.max(1,narrow)>.72&&gap<h*.055;
  });
  if(existing){
   existing.x0=Math.min(existing.x0,part.x0);existing.x1=Math.max(existing.x1,part.x1);
   existing.y0=Math.min(existing.y0,part.y0);existing.y1=Math.max(existing.y1,part.y1);
   existing.pixels+=part.pixels;existing.border.push(...part.border);
  }else merged.push({...part,border:part.border.slice()});
 }
 const cards=merged.map(p=>({p,shape:rect(p,w,h)})).filter(x=>x.shape);
 if(cards.length!==2)return null;
 cards.sort((a,b)=>(a.p.x0+a.p.x1)-(b.p.x0+b.p.x1));
 const left=cards[0],right=cards[1],gap=right.p.x0-left.p.x1;
 if(gap<w*.018||gap>w*.30)return null;
 const cy=p=>(p.y0+p.y1)/2;
 if(Math.abs(cy(left.p)-cy(right.p))>h*.18)return null;
 const areaRatio=Math.max(left.shape.coverage,right.shape.coverage)/
  Math.min(left.shape.coverage,right.shape.coverage);
 if(areaRatio>2)return null;
 return {cards:cards.map(({shape})=>({status:'found',quad:shape.quad,confidence:.73,
  needsReview:true,physicallyVerified:false,method:'paper-blue-pair-provisional'})),
  needsReview:true,verifiedSplit:false,method:'two-independent-blue-material-regions'};
}
function detect(original){
 const scan=window.DocFixScanner;
 if(!scan?.resize||!original?.width||!original?.height)return null;
 let sample=null;
 try{
  sample=scan.resize(original,560);
  const data=sample.getContext('2d',{willReadFrequently:true})
   .getImageData(0,0,sample.width,sample.height).data;
  const out=analyzeRGBA(data,sample.width,sample.height);
  return out&&window.DocFixPairProof?.geometry?.(original,out.cards)?.ok===true?out:null;
 }catch(error){console.warn('DocFix: coppia su foglio non disponibile',error);return null;}
 finally{if(sample&&sample!==original)sample.width=sample.height=1;}
}
window.DocFixPaperPair=Object.freeze({analyzeRGBA,detect,version:'1.9.57-rc1'});
})();