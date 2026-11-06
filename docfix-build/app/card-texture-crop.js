/* DocFix 1.9.8 - background-texture card detection.
 * Only analyzes a temporary scaled canvas. All final crops originate from
 * the untouched, full-resolution source (one perspective transformation).
 * Offline, no personal data upload, no document text generation. */
(()=>{'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const linear=new Float32Array(256);
for(let i=0;i<256;i++){const a=i/255;linear[i]=a<=.04045?a/12.92:Math.pow((a+.055)/1.055,2.4)}
function medianSmall(a){a.sort((x,y)=>x-y);return a[(a.length/2)|0]||0}
function toLab(data,w,h){
 const v=new Float32Array(w*h*3);
 for(let i=0,j=0;i<data.length;i+=4,j+=3){
  const r=linear[data[i]],g=linear[data[i+1]],b=linear[data[i+2]];
  const x=(.4124564*r+.3575761*g+.1804375*b)/.95047;
  const y=(.2126729*r+.7151522*g+.0721750*b);
  const z=(.0193339*r+.1191920*g+.9503041*b)/1.08883;
  const f=t=>t>.008856451679?Math.cbrt(t):(7.787037*t+16/116);
  const X=f(x),Y=f(y),Z=f(z);
  v[j]=(116*Y-16)*2.55;
  v[j+1]=500*(X-Y)+128;
  v[j+2]=200*(Y-Z)+128;
 }return v;
}
function predictBackground(lab,w,h){
 const left=new Float32Array(h*3),right=new Float32Array(h*3),
 x1=Math.max(2,Math.round(w*.020)),x2=Math.max(x1+3,Math.round(w*.067));
 for(let y=0;y<h;y++)for(let c=0;c<3;c++){
  const a=[],b=[];for(let x=x1;x<x2;x++){a.push(lab[(y*w+x)*3+c]);b.push(lab[(y*w+(w-1-x))*3+c]);}
  left[y*3+c]=medianSmall(a);right[y*3+c]=medianSmall(b);
 }
 function smooth(input){
  const result=new Float32Array(h*3),radius=Math.round(h*.016);
  for(let c=0;c<3;c++){
   const prefix=new Float64Array(h+1);
   for(let y=0;y<h;y++)prefix[y+1]=prefix[y]+input[y*3+c];
   for(let y=0;y<h;y++){
    const a=Math.max(0,y-radius),b=Math.min(h-1,y+radius);
    result[y*3+c]=(prefix[b+1]-prefix[a])/(b-a+1);
   }
  }return result;
 }
 return {left:smooth(left),right:smooth(right)};
}
function maskFromColor(lab,w,h,bg,threshold){
 const mask=new Uint8Array(w*h);
 for(let y=0;y<h;y++){
  let j=y*w*3,k=y*3;
  const l0=bg.left[k],l1=bg.left[k+1],l2=bg.left[k+2];
  const dr0=bg.right[k]-l0,dr1=bg.right[k+1]-l1,dr2=bg.right[k+2]-l2;
  for(let x=0;x<w;x++,j+=3){
   const t=x/Math.max(1,w-1),a=lab[j]-l0-dr0*t,b=lab[j+1]-l1-dr1*t,c=lab[j+2]-l2-dr2*t;
   mask[y*w+x]=(a*a+b*b+c*c)>threshold*threshold?1:0;
  }
 }return mask;
}
function morph(binary,w,h,rx,ry,isDilate){
 const stride=w+1,integral=new Uint32Array((w+1)*(h+1));
 for(let y=0;y<h;y++){
  let row=0,from=y*w,to=(y+1)*stride,prev=y*stride;
  for(let x=0;x<w;x++){row+=binary[from+x];integral[to+x+1]=integral[prev+x+1]+row;}
 }
 const out=new Uint8Array(w*h);
 for(let y=0;y<h;y++){
  const top=Math.max(0,y-ry),bottom=Math.min(h-1,y+ry),nrows=bottom-top+1;
  for(let x=0;x<w;x++){
   const left=Math.max(0,x-rx),right=Math.min(w-1,x+rx),p=(bottom+1)*stride,q=top*stride;
   const sum=integral[p+right+1]-integral[q+right+1]-integral[p+left]+integral[q+left];
   out[y*w+x]=isDilate?(sum>0?1:0):(sum===nrows*(right-left+1)?1:0);
  }
 }return out;
}
function connectedCards(mask,w,h){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),cards=[];
 for(let p=0;p<mask.length;p++){
  if(!mask[p]||seen[p])continue;
  seen[p]=1;queue[0]=p;let head=0,tail=1,xmin=w,ymin=h,xmax=0,ymax=0;
  const border=[];let sx=0,sy=0;
  while(head<tail){
   const pos=queue[head++],x=pos%w,y=(pos/w)|0;
   if(x<xmin)xmin=x;if(x>xmax)xmax=x;if(y<ymin)ymin=y;if(y>ymax)ymax=y;sx+=x;sy+=y;
   const n=[pos-1,pos+1,pos-w,pos+w];let edge=false;
   for(let k=0;k<4;k++){
    const t=n[k];if(t<0||t>=mask.length||((k<2)&&Math.floor(t/w)!==y)){edge=true;continue}
    if(!mask[t]){edge=true;continue}
    if(!seen[t]){seen[t]=1;queue[tail++]=t;}
   }
   if(edge&&head%2===0)border.push([x,y]);
  }
  const bw=xmax-xmin+1,bh=ymax-ymin+1,area=tail;
  if(area<.045*w*h||bw<.26*w||bh<.15*h||bw/bh<1.18||bw/bh>2.18)continue;
  const fill=area/(bw*bh);if(fill<.48)continue;
  cards.push({xmin,ymin,xmax,ymax,area,fill,border,cx:sx/area,cy:sy/area});
 }
 return cards.sort((a,b)=>b.area-a.area).slice(0,8);
}
function rectifyBox(component,w,h){
 const points=component.border;if(points.length<90)return null;
 let best=null;
 for(let ang=-9;ang<=9.00001;ang+=.5){
  const a=ang*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),xvec=[],yvec=[];
  for(let j=0;j<points.length;j++){
   const [x,y]=points[j],dx=x-component.cx,dy=y-component.cy;
   xvec.push(dx*cs+dy*sn);yvec.push(dy*cs-dx*sn);
  }
  xvec.sort((a,b)=>a-b);yvec.sort((a,b)=>a-b);
  const lo=Math.max(0,Math.floor(points.length*.002)),hi=Math.min(points.length-1,Math.ceil(points.length*.998));
  const x0=xvec[lo],x1=xvec[hi],y0=yvec[lo],y1=yvec[hi],ww=x1-x0,hh=y1-y0,ratio=ww/hh;
  if(ratio<1.36||ratio>1.93)continue;
  const score=(ww*hh)*(1+Math.abs(ratio-1.586)*.09)+Math.abs(ang)*3;
  if(!best||score<best.score)best={ang,cs,sn,x0,x1,y0,y1,ww,hh,ratio,score};
 }
 if(!best)return null;
 const p=Math.max(1,Math.min(w,h)*.0025),{cs,sn}=best;
 const box=[[best.x0-p,best.y0-p],[best.x1+p,best.y0-p],[best.x1+p,best.y1+p],[best.x0-p,best.y1+p]];
 const quad=box.map(([x,y])=>({x:clamp((component.cx+x*cs-y*sn)/w,0,1),y:clamp((component.cy+x*sn+y*cs)/h,0,1)}));
 return {...best,quad};
}
function analyzeRGBA(pixels,w,h){
 if(!pixels||w<200||h<250)return {cards:[],reason:'immagine piccola'};
 const lab=toLab(pixels,w,h),bg=predictBackground(lab,w,h);
 let best=null;
 for(const threshold of [30,26,34,38]){
  let bits=maskFromColor(lab,w,h,bg,threshold);
  let k=Math.max(2,Math.round(Math.min(w,h)*.007));
  bits=morph(morph(bits,w,h,k,k,false),w,h,k,k,true);
  k=Math.max(6,Math.round(Math.min(w,h)*.019));
  bits=morph(morph(bits,w,h,k,k,true),w,h,k,k,false);
  const comps=connectedCards(bits,w,h),cards=[];
  for(const c of comps){
   const result=rectifyBox(c,w,h);
   if(!result)continue;
   const coverage=c.area/(w*h);
   if(result.ratio<1.38||result.ratio>1.85||coverage<.075||coverage>.38)continue;
   if(result.quad.some(p=>p.x<.01||p.x>.99||p.y<.01||p.y>.99))continue;
   const confidence=Math.min(.97,.76+(.18*Math.min(1,c.fill))+.025*(result.ratio>1.46&&result.ratio<1.74));
   cards.push({quad:result.quad,confidence,method:'source-background-texture',angle:result.ang,coverage,ratio:result.ratio,maskFill:c.fill});
  }
  cards.sort((a,b)=>a.quad.reduce((t,p)=>t+p.y,0)-b.quad.reduce((t,p)=>t+p.y,0));
  if(!best||Math.abs(cards.length-2)<Math.abs(best.cards.length-2))best={cards,threshold};
  if(cards.length===2)break;
 }
 return best||{cards:[],reason:'bordi non confermati'};
}
function detect(original){
 const scan=window.DocFixScanner;if(!scan||!original)return {cards:[],reason:'scanner non disponibile'};
 const sample=scan.resize(original,600),ctx=sample.getContext('2d',{willReadFrequently:true});
 let output;
 try{output=analyzeRGBA(ctx.getImageData(0,0,sample.width,sample.height).data,sample.width,sample.height)}
 finally{sample.width=sample.height=1;}
 return output;
}
window.DocFixRealCrop=Object.freeze({detect,analyzeRGBA,version:'1.9.8'});
})();
