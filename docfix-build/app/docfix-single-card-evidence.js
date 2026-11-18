/* DocFix 1.9.53 test candidate — single blue ID-1 physical material.
 * Finds ONE dominant coloured plastic outline on the original photo.
 * A false 2-up classification must not invent a second "marble" page.
 * Read-only evidence, never a verified crop or an approved PDF.
 */
(()=>{'use strict';
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
const area=q=>Math.abs(q.reduce((n,p,i)=>n+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
function morph(src,w,h,r,dilate){
 const stride=w+1,I=new Int32Array((w+1)*(h+1)),out=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0,row=0;x<w;x++){
  row+=src[y*w+x];I[(y+1)*stride+x+1]=row+I[y*stride+x+1];
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const x0=Math.max(0,x-r),x1=Math.min(w-1,x+r),y0=Math.max(0,y-r),y1=Math.min(h-1,y+r);
  const count=I[(y1+1)*stride+x1+1]-I[y0*stride+x1+1]-I[(y1+1)*stride+x0]+I[y0*stride+x0];
  out[y*w+x]=dilate?Number(count>0):Number(count===(x1-x0+1)*(y1-y0+1));
 }
 return out;
}
function regions(mask,w,h){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),result=[];
 for(let i=0;i<mask.length;i++){
  if(!mask[i]||seen[i])continue;
  let head=0,tail=1,x0=w,x1=0,y0=h,y1=0;
  let tl=null,tr=null,br=null,bl=null;
  queue[0]=i;seen[i]=1;
  while(head<tail){
   const k=queue[head++],x=k%w,y=Math.floor(k/w);
   x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   if(!tl||x+y<tl.x+tl.y)tl={x,y};
   if(!tr||x-y>tr.x-tr.y)tr={x,y};
   if(!br||x+y>br.x+br.y)br={x,y};
   if(!bl||x-y<bl.x-bl.y)bl={x,y};
   const ns=[k-1,k+1,k-w,k+w];
   for(let z=0;z<4;z++){
    const j=ns[z];if(j<0||j>=mask.length||!mask[j]||seen[j])continue;
    if(z<2&&Math.floor(j/w)!==y)continue;
    seen[j]=1;queue[tail++]=j;
   }
  }
  if(tail>=100)result.push({pixels:tail,x0,x1,y0,y1,corners:[tl,tr,br,bl]});
 }
 return result.sort((a,b)=>b.pixels-a.pixels);
}
function analyzeRGBA(d,w,h){
 if(!d||d.length<w*h*4||w<180||h<220||h/w<1.10||h/w>2.15)return null;
 const n=w*h,blue=new Uint8Array(n);let blueN=0;
 for(let i=0;i<n;i++){
  const k=i*4,r=d[k],g=d[k+1],b=d[k+2];
  const keep=b-r>8&&g-r>4&&b-g>-18&&b>75&&b<247;
  blue[i]=Number(keep);blueN+=Number(keep);
 }
 if(blueN/n<.045)return null;
 const radius=clamp(Math.round(w*.025),5,17);
 const closed=morph(morph(blue,w,h,radius,true),w,h,radius,false);
 const parts=regions(closed,w,h);
 if(!parts.length)return null;
 const one=parts[0],two=parts[1];
 if(one.pixels/n<.070||(two&&(two.pixels>one.pixels*.20||two.pixels/n>.025)))return null;
 const {x0,x1,y0,y1}=one,bw=x1-x0+1,bh=y1-y0+1;
 const extent=bw*bh/n;
 if(extent<.12||extent>.55||bw/bh<1.33||bw/bh>1.92||
  x0/w<.025||y0/h<.07||x1/w>.975||y1/h>.94)return null;
 let insideBlue=0;
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)insideBlue+=blue[y*w+x];
 if(insideBlue/blueN<.85||insideBlue/(bw*bh)<.22)return null;
 const center={x:(x0+x1)*.5,y:(y0+y1)*.5},pad=clamp(bh*.009,1.6,4.5);
 const q=one.corners.map(p=>{
  const dd=Math.hypot(p.x-center.x,p.y-center.y)||1;
  return {x:(p.x+pad*(p.x-center.x)/dd)/w,
   y:(p.y+pad*(p.y-center.y)/dd)/h};
 });
 const p=q.map(v=>({x:v.x*w,y:v.y*h}));
 const cardW=(distance(p[0],p[1])+distance(p[2],p[3]))/2;
 const cardH=(distance(p[0],p[3])+distance(p[1],p[2]))/2;
 if(cardW/cardH<1.33||cardW/cardH>1.92||area(q)<.10||area(q)>.55||
  q.some(v=>v.x<.003||v.x>.997||v.y<.003||v.y>.997))return null;
 const turns=p.map((v,i)=>{
  const a=p[(i+1)%4],b=p[(i+2)%4];
  return (a.x-v.x)*(b.y-a.y)-(a.y-v.y)*(b.x-a.x);
 });
 if(turns.some(t=>t<=30))return null;
 return {status:'found',quad:q,confidence:.72,needsReview:true,physicallyVerified:false,
  method:'single-blue-ID1-source-evidence',strongSingle:true,
  diagnostic:{blueRatio:blueN/n,compactness:one.pixels/(bw*bh),
   backgroundBlueRatio:1-insideBlue/blueN,regionCount:parts.length}};
}
function detect(source){
 const scan=window.DocFixScanner;
 if(!source?.width||!source?.height||!scan?.resize)return null;
 let sample=null;
 try{
  sample=scan.resize(source,520);
  const w=sample.width,h=sample.height;
  const data=sample.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const found=analyzeRGBA(data,w,h);
  return found&&scan.validQuad(found.quad)?found:null;
 }catch(error){console.warn('DocFix: single CIE evidence unavailable',error);return null;}
 finally{if(sample&&sample!==source)sample.width=sample.height=1;}
}
window.DocFixSingleCardEvidence=Object.freeze({analyzeRGBA,detect,version:'1.9.53-experimental'});
})();