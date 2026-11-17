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

 // A CIE front on an office worktop may have a horizontal dark scanner edge
 // and weak lettering. Texture rows then follow the SCANNER instead of the
 // blue plastic. Use the material's cyan/teal silhouette as an independent
 // geometrical hypothesis, never as proof for exporting a PDF.
 function morph(bits,w,h,r,dilate){
  const stride=w+1,integral=new Uint32Array((w+1)*(h+1));
  for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){
   row+=bits[y*w+x];integral[(y+1)*stride+x+1]=row+integral[y*stride+x+1];
  }}
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const left=Math.max(0,x-r),right=Math.min(w-1,x+r);
   const top=Math.max(0,y-r),bottom=Math.min(h-1,y+r);
   const count=integral[(bottom+1)*stride+right+1]-integral[top*stride+right+1]
    -integral[(bottom+1)*stride+left]+integral[top*stride+left];
   out[y*w+x]=Number(dilate?count>0:count===(right-left+1)*(bottom-top+1));
  }
  return out;
 }
 function cyanSilhouetteRGBA(data,w,h){
  if(!data||w<140||h<110||data.length<w*h*4||w/h<1.10||w/h>2.20)return null;
  const mask=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++){
   const k=i*4,r=data[k],g=data[k+1],b=data[k+2];
   const lum=.299*r+.587*g+.114*b;
   // Both blue ink and pale blue plastic must differ chromatically from
   // beige/grey desks. Portraits and black desk edges are NOT selected.
   mask[i]=Number(b-r>4&&g-r>2&&b-g>-15&&lum>76&&lum<252);
  }
  const rad=Math.max(2,Math.min(6,Math.round(Math.min(w,h)*.019)));
  const merged=morph(morph(mask,w,h,rad,true),w,h,rad,false);
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
  let best=null;
  for(let start=0;start<merged.length;start++){
   if(!merged[start]||seen[start])continue;
   let head=0,tail=1,minX=w,maxX=-1,minY=h,maxY=-1;
   queue[0]=start;seen[start]=1;
   while(head<tail){
    const v=queue[head++],x=v%w,y=Math.floor(v/w);
    if(x<minX)minX=x;if(x>maxX)maxX=x;
    if(y<minY)minY=y;if(y>maxY)maxY=y;
    for(const next of [v-1,v+1,v-w,v+w]){
     if(next<0||next>=merged.length||!merged[next]||seen[next])continue;
     if(Math.abs(next-v)===1&&Math.floor(next/w)!==y)continue;
     seen[next]=1;queue[tail++]=next;
    }
   }
   const width=maxX-minX+1,height=maxY-minY+1,ratio=width/Math.max(1,height);
   const area=width*height/(w*h),fill=tail/Math.max(1,width*height);
   const centerX=(minX+maxX)/(2*w),centerY=(minY+maxY)/(2*h);
   // A portrait, a letterhead logo, a coloured band and a full-page blue
   // background all fail at least one of these whole-plastic safeguards.
   if(width<w*.53||width>w*.93||height<h*.31||height>h*.82||
      ratio<1.37||ratio>1.86||area<.20||area>.72||fill<.23||
      centerX<.30||centerX>.70||centerY<.28||centerY>.77||
      minX<w*.012||maxX>w*.989||minY<h*.012||maxY>h*.989)continue;
   const shapeScore=1-Math.min(1,Math.abs(ratio-1.586)/.38);
   const score=fill*.57+shapeScore*.25+area*.18;
   if(!best||score>best.score)
    best={minX,maxX,minY,maxY,width,height,area,ratio,fill,score};
  }
  if(!best)return null;
  const padding=Math.max(2,Math.round(Math.min(w,h)*.013));
  const left=clamp(best.minX-padding,2,w-3),right=clamp(best.maxX+padding,2,w-3);
  const top=clamp(best.minY-padding,2,h-3),bottom=clamp(best.maxY+padding,2,h-3);
  const paddedRatio=(right-left)/(bottom-top);
  if(paddedRatio<1.34||paddedRatio>1.92)return null;
  const quad=[{x:left/w,y:top/h},{x:right/w,y:top/h},
   {x:right/w,y:bottom/h},{x:left/w,y:bottom/h}];
  return {status:'found',quad,confidence:.69,cardLikely:true,needsReview:true,
   physicallyVerified:false,method:'visual-cie-blue-material-provisional',
   reason:'Perimetro colorato della CIE proposto: verifica i 4 angoli sulla foto originale',
   details:{area:Number(best.area.toFixed(3)),fill:Number(best.fill.toFixed(3)),
    ratio:Number(paddedRatio.toFixed(3)),score:Number(best.score.toFixed(3))}};
 }
 function detect(original){
  const scanner=window.DocFixScanner;
  if(!scanner||!original)return null;
  const sample=scanner.resize(original,420);
  try{
   const d=sample.getContext('2d',{willReadFrequently:true}).getImageData(0,0,sample.width,sample.height).data;
   const proposed=analyzeRGBA(d,sample.width,sample.height)
    ||cyanSilhouetteRGBA(d,sample.width,sample.height);
   return proposed&&scanner.validQuad(proposed.quad)?proposed:null;
  }catch(e){console.warn('DocFix visual card preview',e);return null;}
  finally{if(sample!==original)sample.width=sample.height=1;}
 }
 window.DocFixVisualCard=Object.freeze({analyzeRGBA,cyanSilhouetteRGBA,detect,version:'1.9.44-candidate'});
})();