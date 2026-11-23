/* DocFix 1.9.63: one actual ID-1 card on a warm wooden desk => ONE
 * source-backed page. Intentionally conservative: no split, no auto-approval.
 * Calibrated from original 2-image CIE front/back test; no user photos stored. */
(()=>{'use strict';
 const size=360,clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const warm=(r,g,b)=>{
  const high=Math.max(r,g,b),low=Math.min(r,g,b);
  return high>85&&r>g*1.28&&g>b+8&&r-b>48&&(high-low)/Math.max(1,high)>.53;
 };
 const neutral=(r,g,b)=>{
  const high=Math.max(r,g,b),low=Math.min(r,g,b);
  return high>55&&(high-low)/Math.max(1,high)<.53;
 };
 function segments(indices,minGap=5){
  const out=[];if(!indices.length)return out;
  let a=indices[0],b=a;
  for(let i=1;i<indices.length;i++){
   const v=indices[i];if(v-b>minGap){out.push([a,b]);a=v;}b=v;
  }
  out.push([a,b]);return out;
 }
 function detect(source){
  if(!source||source.width<280||source.height<280)return null;
  const w=Math.max(140,Math.round(source.width*size/Math.max(source.width,source.height)));
  const h=Math.max(140,Math.round(source.height*size/Math.max(source.width,source.height)));
  const c=document.createElement('canvas');c.width=w;c.height=h;
  try{
   const g=c.getContext('2d',{alpha:false,willReadFrequently:true});
   if(!g)return null;
   g.drawImage(source,0,0,source.width,source.height,0,0,w,h);
   const d=g.getImageData(0,0,w,h).data;
   // The outer 2% margins must repeatedly show the same warm, highly
   // saturated desk. Otherwise do not replace other document detectors.
   const samples=[];
   const ys=[.07,.18,.79,.92],xs=[.04,.96];
   for(const fy of ys)for(const fx of xs){
    const px=clamp(Math.round(fx*w),0,w-1),py=clamp(Math.round(fy*h),0,h-1);
    const k=(py*w+px)*4;samples.push(warm(d[k],d[k+1],d[k+2]));
   }
   const confirmedWarm=samples.filter(Boolean).length;
   if(confirmedWarm<7)return null;
   const rowCount=new Uint32Array(h),colCount=new Uint32Array(w);
   const mask=new Uint8Array(w*h);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,k=i*4;
    if(!neutral(d[k],d[k+1],d[k+2]))continue;
    mask[i]=1;rowCount[y]++;colCount[x]++;
   }
   const rows=[];
   for(let y=0;y<h;y++)if(rowCount[y]>=w*.16)rows.push(y);
   if(rows.length<h*.12)return null;
   const bands=segments(rows,Math.max(3,Math.round(h*.015)));
   // Two separate printed/plastic bands means more than one object.
   const substantial=bands.filter(([a,b])=>b-a>h*.10);
   if(substantial.length!==1)return null;
   const [y0,y1]=substantial[0];
   if(y1-y0<h*.13||y0<h*.03||y1>h*.97)return null;
   const countX=new Uint32Array(w);
   for(let y=y0;y<=y1;y++)for(let x=0;x<w;x++)countX[x]+=mask[y*w+x];
   const cols=[];
   for(let x=0;x<w;x++)if(countX[x]>=(y1-y0+1)*.15)cols.push(x);
   if(cols.length<w*.25)return null;
   const groups=segments(cols,Math.max(3,Math.round(w*.018)));
   const validGroups=groups.filter(([a,b])=>b-a>w*.12);
   if(validGroups.length!==1)return null;
   const [x0,x1]=validGroups[0];
   if(x1-x0<w*.38||x0<w*.02||x1>w*.98)return null;
   const width=(x1-x0+1)*source.width/w,height=(y1-y0+1)*source.height/h;
   const ratio=width/Math.max(1,height),coverage=(x1-x0+1)*(y1-y0+1)/(w*h);
   if(ratio<1.35||ratio>1.90||coverage<.065||coverage>.70)return null;
   let filled=0;
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)filled+=mask[y*w+x];
   const density=filled/((y1-y0+1)*(x1-x0+1));
   if(density<.67)return null;
   const extendX=Math.max(2,Math.round(w*.009)),extendY=Math.max(2,Math.round(h*.009));
   const a=clamp((x0-extendX)/w,.001,.999),b=clamp((x1+extendX)/w,.001,.999);
   const t=clamp((y0-extendY)/h,.001,.999),bottom=clamp((y1+extendY)/h,.001,.999);
   const quad=[{x:a,y:t},{x:b,y:t},{x:b,y:bottom},{x:a,y:bottom}];
   return {quad,strongSingle:true,cardCount:1,confidence:Math.min(.91,.77+density*.13),
    method:'warm-desk-material-single-ID1',review:true,physicallyVerified:false,
    diagnostic:{width,height,ratio,coverage,density,confirmedWarm}};
  }catch(error){
   console.warn('DocFix: prova tessera singola su legno non disponibile',error);
   return null;
  }finally{c.width=1;c.height=1;}
 }
 window.DocFixWoodSingle=Object.freeze({detect,version:'1.9.63-warm-desk-1card'});
})();
