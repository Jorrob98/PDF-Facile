/* DocFix 1.9.32 — conservative licence plastic locator for a single photo.
 * Specialized for pale/rose Italian driving-licence backs lying on printed paper.
 * Does not affect already verified blue CIE cards, grouped cards or PDFs.
 */
(()=>{'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=xs=>{xs.sort((a,b)=>a-b);return xs[Math.floor(xs.length/2)]||0;};
function morph(binary,w,h,r,dilate){
 const stride=w+1,sums=new Int32Array((w+1)*(h+1)),out=new Uint8Array(w*h);
 for(let y=0;y<h;y++){let run=0;for(let x=0;x<w;x++){run+=binary[y*w+x];sums[(y+1)*stride+x+1]=sums[y*stride+x+1]+run;}}
 for(let y=0;y<h;y++){const t=Math.max(0,y-r),b=Math.min(h-1,y+r);for(let x=0;x<w;x++){
  const l=Math.max(0,x-r),rr=Math.min(w-1,x+r);
  const n=sums[(b+1)*stride+rr+1]-sums[t*stride+rr+1]-sums[(b+1)*stride+l]+sums[t*stride+l];
  out[y*w+x]=dilate?Number(n>0):Number(n===(b-t+1)*(rr-l+1));
 }}
 return out;
}
function boxes(mask,w,h){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),found=[];
 for(let start=0;start<mask.length;start++){
  if(!mask[start]||seen[start])continue;
  seen[start]=1;queue[0]=start;let head=0,tail=1,l=w,r=0,t=h,b=0;
  while(head<tail){
   const k=queue[head++],x=k%w,y=(k/w)|0;
   l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
   const left=x>0?k-1:-1,right=x<w-1?k+1:-1,top=y>0?k-w:-1,bottom=y<h-1?k+w:-1;
   for(const v of [left,right,top,bottom])if(v>=0&&mask[v]&&!seen[v]){seen[v]=1;queue[tail++]=v;}
  }
  if(tail>w*h*.014)found.push({l,r,t,b,pixels:tail});
 }
 return found.sort((a,b)=>b.pixels-a.pixels).slice(0,6);
}
function analyzeRGBA(data,w,h){
 if(!data||w<160||h<160||data.length<w*h*4)return null;
 const border=[],step=Math.max(2,Math.round(Math.min(w,h)/190));
 for(let y=2;y<h-2;y+=step)for(let x=2;x<w-2;x+=step){
  if(x>w*.12&&x<w*.88&&y>h*.12&&y<h*.88)continue;
  const k=(y*w+x)*4;border.push([data[k],data[k+1],data[k+2]]);
 }
 if(border.length<50)return null;
 const bg=Array.from({length:3},(_,i)=>median(border.map(z=>z[i])));
 const bgRG=bg[0]-bg[1],bgRB=bg[0]-bg[2];
 // Reject flat, printed-paper reds. Card needs a coherent rose material field.
 const thresholdRG=Math.max(10,bgRG+7),thresholdRB=Math.max(4,bgRB+5);
 const raw=new Uint8Array(w*h);
 for(let i=0;i<w*h;i++){
  const k=i*4,r=data[k],g=data[k+1],b=data[k+2],lo=Math.min(r,g,b),hi=Math.max(r,g,b);
  raw[i]=Number(r-g>=thresholdRG&&r-b>=thresholdRB&&hi-lo>=14&&r>63&&r<248);
 }
 const small=Math.max(1,Math.round(Math.min(w,h)*.003));
 let mask=morph(morph(raw,w,h,small,false),w,h,small,true);
 const gap=Math.max(3,Math.round(Math.min(w,h)*.014));
 mask=morph(morph(mask,w,h,gap,true),w,h,gap,false);
 let best=null;
 for(const c of boxes(mask,w,h)){
  const bw=c.r-c.l+1,bh=c.b-c.t+1,major=Math.max(bw,bh),minor=Math.min(bw,bh);
  const coverage=bw*bh/(w*h),material=c.pixels/(bw*bh);
  if(coverage<.13||coverage>.75||material<.24||major<Math.min(w,h)*.32)continue;
  // A face portrait may have almost the same rose colour and aspect ratio.
  // Check spatial support and reject any rose rectangle surrounded by the
  // cyan material of a larger identity card.
  const quadrants=[0,0,0,0],totals=[0,0,0,0];
  const qstep=Math.max(2,Math.round(Math.min(bw,bh)/44));
  for(let y=c.t+Math.round(bh*.07);y<c.b-Math.round(bh*.07);y+=qstep)
   for(let x=c.l+Math.round(bw*.07);x<c.r-Math.round(bw*.07);x+=qstep){
    const qi=(y>(c.t+c.b)/2?2:0)+(x>(c.l+c.r)/2?1:0);
    quadrants[qi]+=raw[y*w+x];totals[qi]++;
   }
  if(quadrants.some((v,i)=>v/Math.max(1,totals[i])<.12))continue;
  const sx=Math.max(3,Math.round(bw*.57)),sy=Math.max(3,Math.round(bh*.57));
  const x0=Math.max(2,c.l-sx),x1=Math.min(w-2,c.r+sx);
  const y0=Math.max(2,c.t-sy),y1=Math.min(h-2,c.b+sy);
  let cyan=0,around=0;
  for(let y=y0;y<=y1;y+=3)for(let x=x0;x<=x1;x+=3){
   if(x>=c.l&&x<=c.r&&y>=c.t&&y<=c.b)continue;
   const k=(y*w+x)*4,r=data[k],g=data[k+1],b=data[k+2];
   cyan+=Number(b-r>8&&b-g>-4&&b-(r+g)*.5>5);
   around++;
  }
  if(around>=80&&cyan/around>.16)continue;
  const projectedMinor=major/1.586;
  if(minor<projectedMinor*.70||minor>projectedMinor*1.20)continue;
  // An uncoloured security margin can be present on any edge.
  // Expand safely rather than cropping at the last coloured pixel.
  const wpad=Math.max(3,Math.round(bw*.023)),hpad=Math.max(3,Math.round(bh*.023));
  const missing=Math.max(0,projectedMinor-minor);
  let L=c.l-wpad,R=c.r+wpad,T=c.t-hpad,B=c.b+hpad;
  if(bw>bh){T-=missing*.50;B+=missing*.50;}
  else{L-=missing*.50;R+=missing*.50;}
  if(L<3||R>w-4||T<3||B>h-4)continue;
  const finalRatio=Math.max(R-L,B-T)/Math.max(1,Math.min(R-L,B-T));
  if(finalRatio<1.41||finalRatio>1.82)continue;
  const bgMargin=(L/w+(w-R)/w+T/h+(h-B)/h)*.25;
  const score=material*.46+coverage*.32-Math.abs(finalRatio-1.586)*.14-bgMargin*.05;
  if(!best||score>best.score)best={L,R,T,B,score,material,coverage,missing,finalRatio};
 }
 if(!best)return null;
 return {status:'found',
  quad:[{x:best.L/w,y:best.T/h},{x:best.R/w,y:best.T/h},
   {x:best.R/w,y:best.B/h},{x:best.L/w,y:best.B/h}],
  confidence:.82,cardLikely:true,needsReview:true,physicallyVerified:false,
  isLicenceBackCandidate:true,method:'licence-rear-rose-material',
  reason:'Patente isolata dalla superficie rosa · verifica i quattro bordi',
  evidence:{material:+best.material.toFixed(3),coverage:+best.coverage.toFixed(3),
   estimatedNeutralBand:+best.missing.toFixed(1)}};
}
function detect(original){
 const scan=window.DocFixScanner;
 if(!scan||!original)return null;
 const sample=scan.resize(original,680);
 try{
  const ctx=sample.getContext('2d',{willReadFrequently:true});
  const rgba=ctx.getImageData(0,0,sample.width,sample.height).data;
  const candidate=analyzeRGBA(rgba,sample.width,sample.height);
  if(!candidate||!scan.validQuad(candidate.quad))return null;
  // Physical-border refinements may improve the quad, but an unverified
  // suggestion never overrides a conservative material envelope.
  try{
   const guard=window.DocFixLicenceGuard?.polishQuad?.(candidate.quad,rgba,sample.width,sample.height);
   if(guard?.verified===true&&scan.validQuad(guard.quad)){
    const bounds=q=>({l:Math.min(...q.map(p=>p.x)),r:Math.max(...q.map(p=>p.x)),
     t:Math.min(...q.map(p=>p.y)),b:Math.max(...q.map(p=>p.y))});
    const base=bounds(candidate.quad),next=bounds(guard.quad);
    // Inner text lines must never win over the coloured plastic envelope.
    const containsMaterial=next.l<=base.l+.004&&next.r>=base.r-.004
     &&next.t<=base.t+.004&&next.b>=base.b-.004;
    if(containsMaterial){candidate.quad=guard.quad;
    candidate.physicallyVerified=true;
    candidate.needsReview=false;
    candidate.confidence=.91;
    candidate.reason='Patente · quattro bordi fisici verificati';
    }
   }
  }catch(_){/* material fallback is retained */}
  return candidate;
 }finally{if(sample!==original)sample.width=sample.height=1;}
}
window.DocFixLicenceRear=Object.freeze({detect,analyzeRGBA,version:'1.9.32'});
})();