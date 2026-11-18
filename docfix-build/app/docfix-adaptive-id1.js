/* DocFix 1.9.51 — adaptive-background ID-1 proposal.
 * Runs only as an UNVERIFIED preview when all other physical-edge
 * candidates fail. Row-local background subtraction avoids brittle
 * fixed blue thresholds on strongly illuminated cream worktops.
 * A single weak bottom edge is inferred from ISO/IEC 7810 ID-1
 * geometry with a protective margin; NEVER certify such a crop.
 */
(()=>{'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=(v)=>{if(!v.length)return 0;const a=Array.from(v).sort((x,y)=>x-y);return a[a.length>>1]};
function morph(src,w,h,rx,ry,dilate){
 const stride=w+1,integral=new Uint32Array((w+1)*(h+1)),out=new Uint8Array(w*h);
 for(let y=0;y<h;y++){let sum=0;for(let x=0;x<w;x++){
  sum+=src[y*w+x];integral[(y+1)*stride+x+1]=sum+integral[y*stride+x+1];
 }}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const x0=Math.max(0,x-rx),x1=Math.min(w-1,x+rx),y0=Math.max(0,y-ry),y1=Math.min(h-1,y+ry);
  const count=integral[(y1+1)*stride+x1+1]-integral[y0*stride+x1+1]-
   integral[(y1+1)*stride+x0]+integral[y0*stride+x0];
  out[y*w+x]=dilate?Number(count>0):Number(count===(x1-x0+1)*(y1-y0+1));
 }
 return out;
}
function components(bits,w,h){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),found=[];
 for(let i=0;i<bits.length;i++){
  if(!bits[i]||seen[i])continue;
  let head=0,tail=1,xmin=w,xmax=0,ymin=h,ymax=0;queue[0]=i;seen[i]=1;
  while(head<tail){
   const v=queue[head++],x=v%w,y=Math.floor(v/w);
   xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);
   for(const n of [v-1,v+1,v-w,v+w]){
    if(n<0||n>=seen.length||seen[n]||!bits[n])continue;
    if(Math.abs(n-v)===1&&Math.floor(n/w)!==y)continue;
    seen[n]=1;queue[tail++]=n;
   }
  }
  found.push({xmin,xmax,ymin,ymax,pixels:tail});
 }
 return found;
}
function analyzeRGBA(rgba,w,h){
 if(!rgba||rgba.length<w*h*4||w<300||h<220||w/h<1.20||w/h>1.64)return null;
 // Camera/desk gradients vary strongly from top to bottom; estimate the
 // background separately for every horizontal band, from both margins.
 const left=new Float32Array(h*3),right=new Float32Array(h*3);
 const lowX=Math.max(3,Math.floor(w*.015)),highX=Math.max(lowX+4,Math.floor(w*.082));
 for(let y=0;y<h;y++){
  for(let c=0;c<3;c++){
   const l=[],r=[];
   for(let x=lowX;x<highX;x+=3){
    l.push(rgba[(y*w+x)*4+c]);r.push(rgba[(y*w+(w-1-x))*4+c]);
   }
   left[y*3+c]=median(l);right[y*3+c]=median(r);
  }
 }
 // Resist scratches, shadows, and scanner bars at individual rows.
 const L=new Float32Array(h*3),R=new Float32Array(h*3);
 for(let y=0;y<h;y++)for(let c=0;c<3;c++){
  const l=[],r=[];
  for(let dy=-16;dy<=16;dy+=2){
   const yy=clamp(y+dy,0,h-1);l.push(left[yy*3+c]);r.push(right[yy*3+c]);
  }
  L[y*3+c]=median(l);R[y*3+c]=median(r);
 }
 const deviation=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const t=x/(w-1),i=y*w+x,k=i*4;
  const dr=rgba[k]-(L[y*3]*(1-t)+R[y*3]*t);
  const dg=rgba[k+1]-(L[y*3+1]*(1-t)+R[y*3+1]*t);
  const db=rgba[k+2]-(L[y*3+2]*(1-t)+R[y*3+2]*t);
  const lum=.30*dr+.59*dg+.11*db;
  const chroma1=dr-dg,chroma2=db-dg;
  deviation[i]=Math.sqrt(lum*lum+.6*chroma1*chroma1+.6*chroma2*chroma2);
 }
 let best=null;
 for(const threshold of [24,30,36]){
  const initial=new Uint8Array(w*h);
  for(let i=0;i<initial.length;i++)initial[i]=Number(deviation[i]>threshold);
  const cx=Math.max(5,Math.round(w*.016)),cy=Math.max(5,Math.round(h*.020));
  const close=morph(morph(initial,w,h,cx,cy,true),w,h,cx,cy,false);
  const smallX=Math.max(2,Math.round(w*.005)),smallY=Math.max(2,Math.round(h*.008));
  const clean=morph(morph(close,w,h,smallX,smallY,false),w,h,smallX,smallY,true);
  for(const c of components(clean,w,h)){
   const x0=c.xmin,x1=c.xmax,y0=c.ymin,y1=c.ymax,bw=x1-x0+1,bh=y1-y0+1;
   const a=bw*bh/(w*h),r=bw/bh,cx=(x0+x1)/(2*w),cy=(y0+y1)/(2*h);
   if(x0<w*.055||x1>w*.91||y0<h*.085||y1>h*.90||
    a<.23||a>.70||r<1.42||r>1.86||cx<.36||cx>.65||cy<.32||cy>.72||
    c.pixels/(bw*bh)<.42)continue;
   const score=.58*(1-Math.abs(r-1.586)/.45)+.27*(c.pixels/(bw*bh))+.15*(1-Math.abs(a-.40));
   if(!best||score>best.score)best={...c,bw,bh,area:a,ratio:r,score,threshold};
  }
 }
 if(!best)return null;
 const {xmin:x0,xmax:x1,ymin:y0,ymax:y1,bw,bh}=best;
 const scoreEdge=(side)=>{
  const axis=side==='top'||side==='bottom'?'y':'x';
  const lo=side==='top'?y0-24:side==='bottom'?y1-44:side==='left'?x0-42:x1-48;
  const hi=side==='top'?y0+48:side==='bottom'?y1+32:side==='left'?x0+38:x1+36;
  let result=null;
  for(let p=lo;p<=hi;p++){
   if(p<12||p>(axis==='y'?h-13:w-13))continue;
   const signal=[],outside=[],inside=[];
   const first=axis==='y'?x0+Math.round(bw*.075):y0+Math.round(bh*.12);
   const end=axis==='y'?x1-Math.round(bw*.075):y1-Math.round(bh*.12);
   const step=axis==='y'?5:4;
   for(let z=first;z<=end;z+=step){
    const inI=axis==='y'?(side==='top'?(p+8)*w+z:(p-8)*w+z)
      :(side==='left'?z*w+(p+8):z*w+(p-8));
    const outI=axis==='y'?(side==='top'?(p-8)*w+z:(p+8)*w+z)
      :(side==='left'?z*w+(p-8):z*w+(p+8));
    const inn=deviation[inI],out=deviation[outI];
    signal.push(clamp(inn-out,-50,80));outside.push(out);inside.push(Number(inn>18&&out<26));
   }
   if(signal.length<20)continue;
   const pos=signal.reduce((s,v)=>s+clamp(v,0,65),0)/signal.length;
   const ordered=signal.slice().sort((a,b)=>a-b);
   const p40=ordered[Math.floor(ordered.length*.40)];
   const support=inside.reduce((s,v)=>s+v,0)/inside.length;
   if(support<.55)continue;
   const score=.40*pos+.45*p40+15*support-.1*median(outside);
   if(!result||score>result.score)result={p,score,support};
  }
  return result;
 };
 const top=scoreEdge('top'),leftEdge=scoreEdge('left'),rightEdge=scoreEdge('right'),bottom=scoreEdge('bottom');
 if(!top||!leftEdge||!rightEdge||top.score<12||leftEdge.score<9||rightEdge.score<9)return null;
 const leftPad=clamp(11+Math.max(0,leftEdge.p-x0)*1.6,8,30);
 const l=leftEdge.p-leftPad,r=rightEdge.p+8,t=top.p-5;
 const width=r-l;
 // ISO ID-1: 85.60×53.98mm (1.586). We do NOT force a stretch when a
 // weak lower edge is absent: use this only as a safe OUTER bound.
 const guessedBottom=t+width/1.65;
 const b=Math.max(guessedBottom,bottom?bottom.p+3:0,y1+5);
 if(l<3||r>w-4||t<3||b>h-4||width<=0)return null;
 const ratio=width/(b-t),area=width*(b-t)/(w*h);
 if(ratio<1.38||ratio>1.76||area<.22||area>.70)return null;
 const quad=[{x:l/w,y:t/h},{x:r/w,y:t/h},{x:r/w,y:b/h},{x:l/w,y:b/h}];
 return {status:'found',quad,needsReview:true,physicallyVerified:false,
  confidence:.69,method:'adaptive-background-id1-3-edge-provisional',
  diagnostic:{threshold:best.threshold,component:{x0,y0,x1,y1},
   edgeSupport:{top:top.support,left:leftEdge.support,right:rightEdge.support,bottom:bottom?.support??null},
   inferredBottom:!bottom||bottom.p<guessedBottom}};
}
function detect(original){
 const scanner=window.DocFixScanner;
 if(!original||!scanner?.resize)return null;
 let sample;
 try{
  sample=scanner.resize(original,800);
  const {width,height}=sample;
  const rgba=sample.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data;
  const result=analyzeRGBA(rgba,width,height);
  return result&&scanner.validQuad(result.quad)?result:null;
 }catch(error){console.warn('DocFix adaptive background not applied',error);return null;}
 finally{if(sample&&sample!==original)sample.width=sample.height=1;}
}
window.DocFixAdaptiveID1=Object.freeze({analyzeRGBA,detect,version:'1.9.51-experimental'});
})();