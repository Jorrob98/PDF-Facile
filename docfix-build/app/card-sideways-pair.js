/* DocFix 1.9.30 — conservative sideways two-card photo recovery.
 * A WhatsApp image can show two physical portrait-oriented cards SIDE BY SIDE
 * (their writing is rotated by 90 degrees). The old two-up detector expects
 * stacked LANDSCAPE cards, so this fallback runs ONLY after that detector
 * fails. Operates on a scratch thumbnail; no OCR or original pixel changes.
 */
(()=>{'use strict';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function analyzeRGBA(data,w,h){
 if(!data||data.length<w*h*4||w<135||h<145)return null;
 const ratio=h/w;
 if(ratio<.76||ratio>1.85)return null;
 const edge=Math.max(2,Math.floor(w*.022)),left=new Float32Array(h*3),right=new Float32Array(h*3);
 // Background follows the dark desk's gradient, not a global colour constant.
 for(let y=0;y<h;y++){
  const rad=3;let n=0;
  for(let dy=-rad;dy<=rad;dy++){
   const yy=clamp(y+dy,0,h-1);
   for(let x=1;x<=edge;x++){
    const a=(yy*w+x)*4,b=(yy*w+w-1-x)*4,k=y*3;
    for(let c=0;c<3;c++){left[k+c]+=data[a+c];right[k+c]+=data[b+c];}
    n++;
   }
  }
  for(let c=0;c<3;c++){left[y*3+c]/=n;right[y*3+c]/=n;}
 }
 // Keep away from labels, page overlays and source edges.
 const yStart=Math.round(h*.13),yEnd=Math.round(h*.86),
       fg=new Uint8Array(w*h),cols=new Float32Array(w);
 let dark=0,edgeN=0;
 for(let y=Math.round(h*.18);y<Math.round(h*.70);y+=8){
  for(const x of [2,w-3]){const k=(y*w+x)*4;dark+=(data[k]+data[k+1]+data[k+2])/3;edgeN++;}
 }
 if(!edgeN||dark/edgeN>165)return null; // avoid paper and bright tables
 for(let y=yStart;y<yEnd;y++){
  const k=y*3;
  for(let x=Math.round(w*.025);x<Math.round(w*.975);x++){
   const t=x/(w-1),i=(y*w+x)*4;
   const dr=data[i]-(left[k]*(1-t)+right[k]*t);
   const dg=data[i+1]-(left[k+1]*(1-t)+right[k+1]*t);
   const db=data[i+2]-(left[k+2]*(1-t)+right[k+2]*t);
   const light=.299*dr+.587*dg+.114*db;
   const delta=Math.hypot(dr,dg,db);
   const on=delta>54&&(light>19||Math.max(Math.abs(dr-dg),Math.abs(db-dg))>21);
   fg[y*w+x]=on?1:0;
  }
 }
 const midY0=Math.round(h*.29),midY1=Math.round(h*.70),den=midY1-midY0;
 for(let x=0;x<w;x++){
  let hits=0;for(let y=midY0;y<midY1;y++)hits+=fg[y*w+x];
  cols[x]=hits/Math.max(1,den);
 }
 const sm=new Float32Array(w);
 for(let x=0;x<w;x++){let sum=0,n=0;for(let k=-2;k<=2;k++){sum+=cols[clamp(x+k,0,w-1)];n++;}sm[x]=sum/n;}
 // Find the bright main object without picking a small printed photo.
 let xmin=-1,xmax=-1;
 for(let x=Math.round(w*.03);x<Math.round(w*.97);x++){
  if(sm[x]>.24){if(xmin<0)xmin=x;xmax=x;}
 }
 if(xmin<0||xmax-xmin<w*.53||xmax-xmin>w*.94||xmin<w*.018||xmax>w*.978)return null;
 const span=xmax-xmin;
 const lo=Math.round(xmin+span*.39),hi=Math.round(xmin+span*.61);
 let split=lo,score=Infinity;
 for(let x=lo;x<=hi;x++){
  const v=(sm[clamp(x-2,0,w-1)]+2*sm[x]+sm[clamp(x+2,0,w-1)])/4+Math.abs(x-(xmin+xmax)/2)/w*.22;
  if(v<score){score=v;split=x;}
 }
 const widths=[split-xmin,xmax-split];
 if(widths.some(v=>v<w*.20||v>w*.55)||Math.max(...widths)/Math.min(...widths)>1.58)return null;
 function candidate(x0,x1){
  const padX=Math.max(2,Math.round(w*.012)),dataX0=clamp(x0+padX,0,w-1),dataX1=clamp(x1-padX,0,w-1);
  const activity=new Float32Array(h);
  const step=2,nx=Math.max(1,Math.ceil((dataX1-dataX0)/step));
  for(let y=yStart;y<yEnd;y++){
   let n=0;for(let x=dataX0;x<dataX1;x+=step)n+=fg[y*w+x];
   activity[y]=n/nx;
  }
  const smY=new Float32Array(h);
  for(let y=yStart;y<yEnd;y++){
   let sum=0,n=0;for(let k=-3;k<=3;k++){sum+=activity[clamp(y+k,yStart,yEnd-1)];n++;}
   smY[y]=sum/n;
  }
  let ya=-1,yb=-1;
  for(let y=yStart;y<yEnd;y++)if(smY[y]>.245){if(ya<0)ya=y;yb=y;}
  if(ya<0||yb-ya<h*.30||yb-ya>h*.75)return null;
  const px=Math.max(2,Math.round(w*.014)),py=Math.max(2,Math.round(h*.014));
  const bx0=clamp(x0-px,1,w-2),bx1=clamp(x1+px,1,w-2),
    by0=clamp(ya-py,1,h-2),by1=clamp(yb+py,1,h-2);
  const tall=(by1-by0)/Math.max(1,bx1-bx0);
  if(tall<1.20||tall>2.32)return null;
  return {quad:[{x:bx0/w,y:by0/h},{x:bx1/w,y:by0/h},
   {x:bx1/w,y:by1/h},{x:bx0/w,y:by1/h}],
   box:{x0:bx0,x1:bx1,y0:by0,y1:by1},tall,confidence:.79};
 }
 const pair=[candidate(xmin,split),candidate(split,xmax)];
 if(pair.some(c=>!c))return null;
 const a=pair[0],b=pair[1];
 const ha=a.box.y1-a.box.y0,hb=b.box.y1-b.box.y0;
 if(Math.abs((a.box.y0+a.box.y1)-(b.box.y0+b.box.y1))/2>h*.13||
   Math.max(ha,hb)/Math.min(ha,hb)>1.37)return null;
 // Search for physical edges but DO NOT manufacture them if uncertain.
 const audit=window.DocFixQuadAudit;
 for(const c of pair){
  const check=audit?.inspectRGBA?.(data,w,h,c.quad,{format:'card'});
  if(check?.verified&&check.support?.sidesOk===4){
   c.quad=check.quad;c.physicallyVerified=true;c.confidence=check.confidence;
   c.method='side-by-side-four-physical-edges';
  }else{
   c.physicallyVerified=false;
   c.method='side-by-side-location-only';
  }
 }
 return {cards:pair,verifiedSplit:true,orientation:'left',method:'side-by-side-rotated-90',
  physicallyVerified:pair.every(c=>c.physicallyVerified)};
}
function detect(original){
 const scanner=window.DocFixScanner;if(!scanner||!original)return null;
 let sample=null;
 try{
  sample=scanner.resize(original,700);
  const w=sample.width,h=sample.height;
  const ctx=sample.getContext('2d',{willReadFrequently:true});
  const found=analyzeRGBA(ctx.getImageData(0,0,w,h).data,w,h);
  if(!found||found.cards.length!==2||found.cards.some(c=>!scanner.validQuad(c.quad)))return null;
  return found;
 }catch(err){console.warn('DocFix: sideways pair detection safely skipped',err);return null;}
 finally{if(sample&&sample!==original)sample.width=sample.height=1;}
}
window.DocFixSidewaysPair=Object.freeze({analyzeRGBA,detect,version:'1.9.30'});
})();