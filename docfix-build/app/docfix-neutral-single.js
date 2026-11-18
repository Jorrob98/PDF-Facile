/* DocFix 1.9.55 candidate: pale/neutral ISO ID-1 on a warm textured desk.
 * Detects one physical colour-surface region, never identity text. No network,
 * no auto-confirmation. Final photo pixels remain from the original canvas.
 */
(()=>{'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function median(values){values.sort((a,b)=>a-b);return values[values.length>>1]||0;}
function morph(src,w,h,r,dilate){
 const stride=w+1,integral=new Int32Array((w+1)*(h+1)),out=new Uint8Array(w*h);
 for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){
  row+=src[y*w+x];integral[(y+1)*stride+x+1]=row+integral[y*stride+x+1];
 }}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const x0=Math.max(0,x-r),x1=Math.min(w-1,x+r),y0=Math.max(0,y-r),y1=Math.min(h-1,y+r);
  const sum=integral[(y1+1)*stride+x1+1]-integral[y0*stride+x1+1]-integral[(y1+1)*stride+x0]+integral[y0*stride+x0];
  out[y*w+x]=dilate?Number(sum>0):Number(sum===(x1-x0+1)*(y1-y0+1));
 }
 return out;
}
function regions(mask,w,h){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),out=[];
 for(let i=0;i<mask.length;i++){
  if(!mask[i]||seen[i])continue;
  seen[i]=1;queue[0]=i;let head=0,tail=1,minX=w,maxX=0,minY=h,maxY=0;
  let TL=null,TR=null,BR=null,BL=null;
  while(head<tail){
   const j=queue[head++],x=j%w,y=(j/w)|0;
   if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
   if(!TL||x+y<TL.x+TL.y)TL={x,y};
   if(!TR||x-y>TR.x-TR.y)TR={x,y};
   if(!BR||x+y>BR.x+BR.y)BR={x,y};
   if(!BL||x-y<BL.x-BL.y)BL={x,y};
   const neighbors=[j-w,j+w,j-1,j+1];
   for(let k=0;k<4;k++){
    const z=neighbors[k];if(z<0||z>=mask.length||seen[z]||!mask[z])continue;
    if(k>=2&&((z/w)|0)!==y)continue;
    seen[z]=1;queue[tail++]=z;
   }
  }
  if(tail>100)out.push({count:tail,minX,maxX,minY,maxY,corners:[TL,TR,BR,BL]});
 }
 return out.sort((a,b)=>b.count-a.count);
}
function analyzeRGBA(d,w,h){
 if(!d||d.length<w*h*4||w<190||h<230||h/w<1.08||h/w>2.20)return null;
 const warm=[];
 const borderX=Math.max(6,Math.round(w*.08)),borderY=Math.max(6,Math.round(h*.07));
 for(let y=0;y<h;y+=7)for(let x=0;x<w;x+=7){
  if(x>borderX&&x<w-borderX&&y>borderY&&y<h-borderY)continue;
  const k=(y*w+x)*4,r=d[k],g=d[k+1],b=d[k+2];
  if(r+g+b>155)warm.push(r-b);
 }
 // A white/gray desk must not be interpreted as one white plastic card.
 if(warm.length<50||median(warm)<24)return null;
 const raw=new Uint8Array(w*h);let neutralCount=0;
 for(let i=0;i<w*h;i++){
  const k=i*4,r=d[k],g=d[k+1],b=d[k+2],lum=.299*r+.587*g+.114*b;
  const yes=b-r>-19&&b-g>-15&&lum>100&&lum<250;
  raw[i]=Number(yes);neutralCount+=Number(yes);
 }
 if(neutralCount/(w*h)<.09||neutralCount/(w*h)>.48)return null;
 const radius=clamp(Math.round(w*.021),7,15);
 const closed=morph(morph(raw,w,h,radius,true),w,h,radius,false);
 const clean=morph(morph(closed,w,h,3,false),w,h,3,true);
 const parts=regions(clean,w,h);
 if(!parts.length)return null;
 const one=parts[0],second=parts[1];
 if(second&&(second.count>one.count*.19||second.count/(w*h)>.025))return null;
 const {minX:x0,maxX:x1,minY:y0,maxY:y1}=one,bw=x1-x0+1,bh=y1-y0+1;
 const fraction=bw*bh/(w*h),ratio=bw/bh;
 if(fraction<.15||fraction>.56||ratio<1.32||ratio>1.91||
  x0<w*.032||x1>w*.965||y0<h*.12||y1>h*.88||
  one.count/(bw*bh)<.52)return null;
 let within=0;
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)within+=raw[y*w+x];
 if(within/neutralCount<.80||within/(bw*bh)<.38)return null;
 // Preserve rounded corners and a narrow safe border; the four points are
 // only a REVIEW proposal, not four independently audited physical sides.
 const center={x:(x0+x1)/2,y:(y0+y1)/2},pad=8.0;
 const quad=one.corners.map(p=>{
  const mag=Math.hypot(p.x-center.x,p.y-center.y)||1;
  return {x:(p.x+pad*(p.x-center.x)/mag)/w,y:(p.y+pad*(p.y-center.y)/mag)/h};
 });
 const p=quad.map(q=>({x:q.x*w,y:q.y*h})),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const pw=(distance(p[0],p[1])+distance(p[2],p[3]))/2;
 const ph=(distance(p[1],p[2])+distance(p[3],p[0]))/2;
 const shape=pw/ph;
 const cross=p.map((v,i)=>{
  const a=p[(i+1)%4],b=p[(i+2)%4];
  return (a.x-v.x)*(b.y-a.y)-(a.y-v.y)*(b.x-a.x);
 });
 if(shape<1.33||shape>1.91||cross.some(v=>v<50)||quad.some(v=>v.x<=.005||v.x>=.995||v.y<=.005||v.y>=.995))return null;
 return {status:'found',strongSingle:true,quad,needsReview:true,
  physicallyVerified:false,confidence:.70,method:'pale-neutral-material-on-warm-background',
  diagnostic:{backgroundWarm:true,coverage:fraction,neutralRatio:within/(bw*bh),secondRegionRatio:second?second.count/one.count:0}};
}
function detect(original){
 const scan=window.DocFixScanner;
 if(!original||!scan?.resize)return null;
 let sampled=null;
 try{
  sampled=scan.resize(original,520);
  const {width:w,height:h}=sampled;
  const rgba=sampled.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const result=analyzeRGBA(rgba,w,h);
  return result&&scan.validQuad(result.quad)?result:null;
 }catch(error){console.warn('DocFix: neutral material guard unavailable',error);return null;}
 finally{if(sampled&&sampled!==original)sampled.width=sampled.height=1;}
}
window.DocFixNeutralCardEvidence=Object.freeze({analyzeRGBA,detect,version:'1.9.55-experimental'});
})();