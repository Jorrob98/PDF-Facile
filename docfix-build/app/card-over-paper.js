/* DocFix: detect one ISO card resting on a printed document.
 * Works offline and never changes or uploads the source image.
 * Weak contours remain marked for review, not falsely certified.
 */
(()=>{'use strict';
const median=a=>{a.sort((x,y)=>x-y);return a[a.length>>1]||0};
function morph(src,w,h,r,dilate){
 const stride=w+1,ii=new Int32Array((w+1)*(h+1));
 for(let y=0;y<h;y++){let n=0;for(let x=0;x<w;x++){n+=src[y*w+x];ii[(y+1)*stride+x+1]=ii[y*stride+x+1]+n;}}
 const out=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const l=Math.max(0,x-r),rr=Math.min(w-1,x+r),t=Math.max(0,y-r),b=Math.min(h-1,y+r);
  const n=ii[(b+1)*stride+rr+1]-ii[t*stride+rr+1]-ii[(b+1)*stride+l]+ii[t*stride+l];
  out[y*w+x]=Number(dilate?n>0:n===(rr-l+1)*(b-t+1));
 }
 return out;
}
function components(mask,w,h){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),results=[];
 for(let start=0;start<mask.length;start++){
  if(!mask[start]||seen[start])continue;
  let head=0,tail=1,minX=w,maxX=0,minY=h,maxY=0;
  queue[0]=start;seen[start]=1;
  while(head<tail){const v=queue[head++],x=v%w,y=Math.floor(v/w);
   minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const n of [v-1,v+1,v-w,v+w]){
    if(n<0||n>=mask.length||seen[n]||!mask[n])continue;
    if(Math.abs(n-v)===1&&Math.floor(n/w)!==y)continue;
    queue[tail++]=n;seen[n]=1;
   }
  }
  const bw=maxX-minX+1,bh=maxY-minY+1;
  if(tail<.006*w*h||bw<.10*w||bh<.09*h||tail/(bw*bh)<.17)continue;
  results.push({minX,maxX,minY,maxY,pixels:tail,fill:tail/(bw*bh)});
 }
 return results.sort((a,b)=>b.pixels-a.pixels).slice(0,12);
}
function analyzeRGBA(data,w,h){
 if(!data||w<180||h<160)return null;
 const rgb=[],ex=Math.max(12,Math.round(w*.11)),ey=Math.max(12,Math.round(h*.11));
 for(let y=3;y<h-3;y+=3)for(let x=3;x<w-3;x+=3){
  if((x>ex&&x<w-ex)||(y>ey&&y<h-ey))continue;
  const k=(y*w+x)*4;rgb.push([data[k],data[k+1],data[k+2]]);
 }
 if(rgb.length<40)return null;
 const bg=Array.from({length:3},(_,i)=>median(rgb.map(c=>c[i])));
 const bgBR=bg[2]-bg[0],bgLum=.299*bg[0]+.587*bg[1]+.114*bg[2];
 const mask0=new Uint8Array(w*h),threshold=Math.max(-6,bgBR+7);
 for(let i=0;i<w*h;i++){
  const k=i*4,r=data[k],g=data[k+1],b=data[k+2],lum=.299*r+.587*g+.114*b;
  mask0[i]=Number(b-r>=threshold&&b-g>=-10&&lum>bgLum*.34&&lum<bgLum+18);
 }
 const small=Math.max(1,Math.round(Math.min(w,h)*.003));
 let mask=morph(mask0,w,h,small,false);
 mask=morph(mask,w,h,small,true);
 const close=Math.max(3,Math.round(Math.min(w,h)*.009));
 mask=morph(mask,w,h,close,true);mask=morph(mask,w,h,close,false);
 const comps=components(mask,w,h);
 if(!comps.length)return null;
 const choices=comps.map(c=>({...c,combined:1}));
 // On an ID reverse the pale MRZ strip may split the coloured plastic in two.
 for(let i=0;i<comps.length;i++)for(let j=i+1;j<comps.length;j++){
  const a=comps[i],b=comps[j],overlap=Math.max(0,Math.min(a.maxY,b.maxY)-Math.max(a.minY,b.minY)+1);
  const shorter=Math.min(a.maxY-a.minY+1,b.maxY-b.minY+1),gap=Math.max(0,Math.max(a.minX,b.minX)-Math.min(a.maxX,b.maxX));
  if(overlap/shorter<.68||gap>Math.max(a.maxX-a.minX,b.maxX-b.minX)*1.5)continue;
  choices.push({minX:Math.min(a.minX,b.minX),maxX:Math.max(a.maxX,b.maxX),minY:Math.min(a.minY,b.minY),maxY:Math.max(a.maxY,b.maxY),pixels:a.pixels+b.pixels,combined:2});
 }
 let best=null;
 for(const c of choices){
  const bw=c.maxX-c.minX+1,bh=c.maxY-c.minY+1,wide=bw>=bh,major=Math.max(bw,bh),minor=Math.min(bw,bh);
  const expected=major/1.586,expansion=Math.max(0,(expected-minor)/Math.max(1,minor));
  const boxFrac=bw*bh/(w*h),evidence=c.pixels/Math.max(1,bw*bh);
  if(boxFrac<.12||boxFrac>.71||major<Math.min(w,h)*.35||evidence<.19||expansion>.50)continue;
  let L=c.minX,R=c.maxX,T=c.minY,B=c.maxY;
  // Extend in the expected direction to preserve neutral MRZ and security print.
  if(wide&&bh<expected)B+=expected-bh;
  else if(!wide&&bw<expected)L-=expected-bw;
  const margin=Math.max(2,Math.round(Math.min(R-L,B-T)*.018));
  L-=margin;R+=margin;T-=margin;B+=margin;
  if(L<2||T<2||R>w-3||B>h-3)continue;
  const ratio=Math.max(R-L,B-T)/Math.max(1,Math.min(R-L,B-T)),coverage=(R-L)*(B-T)/(w*h);
  if(ratio<1.43||ratio>1.79||coverage<.075||coverage>.78)continue;
  const score=c.pixels/(w*h)+Math.min(.15,evidence*.12)-expansion*.065+(c.combined===2?.028:0);
  if(!best||score>best.score)best={L,R,T,B,score,evidence,expansion,combined:c.combined};
 }
 if(!best)return null;
 const verified=best.evidence>=.33&&best.expansion<.19;
 const quad=[{x:best.L/w,y:best.T/h},{x:best.R/w,y:best.T/h},{x:best.R/w,y:best.B/h},{x:best.L/w,y:best.B/h}];
 return {quad,status:'found',cardLikely:true,confidence:verified?.89:.80,
  physicallyVerified:verified,needsReview:!verified,
  method:'over-paper-blue-card',reason:verified?'Tessera isolata dal foglio':'Tessera isolata: controlla margini e MRZ',
  details:{colourSupport:+best.evidence.toFixed(3),expansion:+best.expansion.toFixed(3),components:best.combined}};
}
function detect(original){
 const scanner=window.DocFixScanner;
 if(!scanner||!original)return null;
 const sample=scanner.resize(original,680);
 try{
  const ctx=sample.getContext('2d',{willReadFrequently:true}),found=analyzeRGBA(ctx.getImageData(0,0,sample.width,sample.height).data,sample.width,sample.height);
  return found&&scanner.validQuad(found.quad)?found:null;
 }finally{if(sample!==original)sample.width=sample.height=1;}
}
window.DocFixOverPaper=Object.freeze({analyzeRGBA,detect,version:'1.9.26'});
})();