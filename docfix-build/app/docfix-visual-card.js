/* DocFix Visual Card Preview — low-contrast ID-1 boundaries on office desks.
 * Produces a provisional, editable crop ONLY. It never proves physical edges,
 * cannot set cropVerified=true, and never exports original personal data.
 */
(()=>{'use strict';
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 function estimate(values,start,end){
  const a=Array.from(values.slice(Math.max(0,start),Math.min(values.length,end))).sort((a,b)=>a-b);
  return a[Math.floor(a.length/2)]||0;
 }
 function smooth(values,r){
  const a=new Float32Array(values.length),prefix=new Float32Array(values.length+1);
  for(let i=0;i<values.length;i++)prefix[i+1]=prefix[i]+values[i];
  for(let i=0;i<values.length;i++){
   const lo=Math.max(0,i-r),hi=Math.min(values.length,i+r+1);
   a[i]=(prefix[hi]-prefix[lo])/(hi-lo);
  }
  return a;
 }
 function bestBand(signal,start,end,baseline,minLength){
  const high=estimate(signal,start,end),threshold=baseline+Math.max(2.6,(high-baseline)*.28);
  if(high<baseline*1.48+3.2)return null;
  let best=null,on=false,begin=-1,lastOn=-1;
  const maxGap=Math.max(3,Math.round(signal.length*.043));
  for(let i=start;i<=end;i++){
   if(i<end&&signal[i]>threshold){if(!on){begin=i;on=true;}lastOn=i;}
   else if(on&&i-lastOn>maxGap){
    const left=begin,right=lastOn,span=right-left+1;
    if(span>=minLength&&(!best||span>best.span))best={left,right,span};
    on=false;
   }
  }
  if(on){const span=lastOn-begin+1;if(span>=minLength&&(!best||span>best.span))best={left:begin,right:lastOn,span};}
  return best&&{...best,high,threshold};
 }
 function analyzeRGBA(data,w,h){
  if(!data||w<140||h<110||data.length<w*h*4)return null;
  if(w/h<1.10||w/h>2.20)return null;
  const gray=new Float32Array(w*h);
  for(let i=0;i<w*h;i++){const k=i*4;gray[i]=.299*data[k]+.587*data[k+1]+.114*data[k+2];}
  // Microprinted document texture contrasts with larger, even desk surfaces.
  const xActivity=new Float32Array(w);
  const sy0=Math.round(h*.29),sy1=Math.round(h*.77);
  for(let x=3;x<w-3;x++){
   let sum=0,n=0;
   for(let y=sy0;y<sy1;y+=2){sum+=Math.abs(gray[(y+2)*w+x]-gray[(y-2)*w+x]);n++;}
   xActivity[x]=sum/Math.max(1,n);
  }
  const xs=smooth(xActivity,Math.max(2,Math.round(w*.012)));
  const leftBg=estimate(xs,Math.round(w*.03),Math.round(w*.115));
  const rightBg=estimate(xs,Math.round(w*.885),Math.round(w*.97));
  const baseline=Math.min(leftBg,rightBg);
  const xb=bestBand(xs,Math.round(w*.04),Math.round(w*.96),baseline,Math.round(w*.47));
  if(!xb)return null;
  const padX=Math.max(2,Math.round(xb.span*.052));
  const L=clamp(xb.left-padX,2,w-3),R=clamp(xb.right+padX,2,w-3);
  // Exclude photo-inner regions: a strong isolated portrait must not
  // masquerade as the complete plastic card.
  if(R-L<w*.53||R-L>w*.91||L<w*.018||R>w*.982||L>w*.22||R<w*.77)return null;
  const yActivity=new Float32Array(h),dx0=Math.round(L+(R-L)*.12),dx1=Math.round(R-(R-L)*.12);
  for(let y=3;y<h-3;y++){
   let sum=0,n=0;
   for(let x=dx0;x<dx1;x+=2){sum+=Math.abs(gray[y*w+x+2]-gray[y*w+x-2]);n++;}
   yActivity[y]=sum/Math.max(1,n);
  }
  const ys=smooth(yActivity,Math.max(2,Math.round(h*.016)));
  const topBg=estimate(ys,Math.round(h*.018),Math.round(h*.105));
  const bottomBg=estimate(ys,Math.round(h*.90),Math.round(h*.98));
  const yBase=Math.min(topBg,bottomBg);
  const yb=bestBand(ys,Math.round(h*.05),Math.round(h*.95),yBase,Math.round(h*.32));
  if(!yb)return null;
  const desired=(R-L)/1.586;
  let T=yb.left,B=yb.right;
  const slack=Math.max(3,Math.round((B-T)*.025));T-=slack;B+=slack;
  const extra=Math.max(0,desired-(B-T));T-=extra*.5;B+=extra*.5;
  T=Math.round(clamp(T,2,h-3));B=Math.round(clamp(B,2,h-3));
  const ratio=(R-L)/Math.max(1,B-T),area=(R-L)*(B-T)/(w*h);
  if(ratio<1.40||ratio>1.90||area<.19||area>.78||T<h*.018||B>h*.976)return null;
  const xInside=estimate(xs,Math.round(L+w*.045),Math.round(R-w*.045));
  const yInside=estimate(ys,Math.round(T+h*.06),Math.round(B-h*.06));
  if(xInside<baseline*1.6+2.2||yInside<yBase*1.45+1.6)return null;
  const quad=[{x:L/w,y:T/h},{x:R/w,y:T/h},{x:R/w,y:B/h},{x:L/w,y:B/h}];
  return {status:'found',quad,confidence:.67,cardLikely:true,needsReview:true,
   physicallyVerified:false,method:'visual-id1-texture-provisional',
   reason:'Bordo esterno proposto dal contrasto della tessera: conferma i 4 angoli',
   details:{xContrast:Number((xInside/Math.max(1,baseline)).toFixed(2)),yContrast:Number((yInside/Math.max(1,yBase)).toFixed(2)),ratio:Number(ratio.toFixed(3)),area:Number(area.toFixed(3))}};
 }
 function detect(original){
  const scanner=window.DocFixScanner;
  if(!scanner||!original)return null;
  const sample=scanner.resize(original,420);
  try{
   const d=sample.getContext('2d',{willReadFrequently:true}).getImageData(0,0,sample.width,sample.height).data;
   const proposed=analyzeRGBA(d,sample.width,sample.height);
   return proposed&&scanner.validQuad(proposed.quad)?proposed:null;
  }catch(e){console.warn('DocFix visual card preview',e);return null;}
  finally{if(sample!==original)sample.width=sample.height=1;}
 }
 window.DocFixVisualCard=Object.freeze({analyzeRGBA,detect,version:'1.9.43-candidate'});
})();