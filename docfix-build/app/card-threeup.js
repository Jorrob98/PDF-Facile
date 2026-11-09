/* DocFix 1.9.17 - independent 3-up detector and 90-degree source normalization.
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
  if(area<.022*w*h||bw<.21*w||bh<.13*h||bw/bh<1.18||bw/bh>2.18)continue;
  const fill=area/(bw*bh);if(fill<.30)continue;
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
// Recover a nearly white plastic card's physical edge beyond the darker text.
function snapMutedEdges(card,lab,w,h){
 const c=card.comp;if(!c)return null;
 const box=card.quad,top=(box[0].y+box[1].y)*.5*h,bottom=(box[2].y+box[3].y)*.5*h;
 const left=Math.max(2,Math.floor(c.xmin+(c.xmax-c.xmin)*.14));
 const right=Math.min(w-3,Math.ceil(c.xmax-(c.xmax-c.xmin)*.14));
 const steps=30;
 function strength(y){
  const row=clamp(Math.round(y),3,h-4),values=[];
  for(let i=0;i<steps;i++){
   const x=Math.round(left+(right-left)*i/(steps-1)),a=((row-2)*w+x)*3,b=((row+2)*w+x)*3;
   values.push(Math.hypot(lab[a]-lab[b],lab[a+1]-lab[b+1],lab[a+2]-lab[b+2]));
  }
  values.sort((a,b)=>a-b);return values[Math.floor(values.length*.42)];
 }
 function search(base,neg,pos){let best=null;
  for(let y=Math.round(base-neg);y<=Math.round(base+pos);y++){
   if(y<5||y>=h-5)continue;
   const z=strength(y);if(!best||z>best.z)best={y,z};
  }return best;
 }
 const a=search(top,Math.min(13,h*.043),Math.min(30,h*.09));
 const b=search(bottom,Math.min(9,h*.027),Math.min(33,h*.10));
 if(!a||!b||a.z<18||b.z<14||b.y-a.y<55)return null;
 const raw=card.quad.map(p=>({...p})),range=b.y-a.y;
 const width=Math.hypot((box[1].x-box[0].x)*w,(box[1].y-box[0].y)*h),ratio=width/range;
 if(ratio<1.36||ratio>1.92)return null;
 if(Math.abs(a.y-top)>27||Math.abs(b.y-bottom)>34)return null;
 raw[0].y=raw[1].y=clamp((a.y-1)/h,0,1);
 raw[2].y=raw[3].y=clamp((b.y+1)/h,0,1);
 return raw;
}
function analyzeRGBA(pixels,w,h){
 if(!pixels||w<200||h<250)return {cards:[],reason:'immagine piccola'};
 const lab=toLab(pixels,w,h),bg=predictBackground(lab,w,h);
 let best=null;const snapshots=[];
 for(const threshold of [14,16,18,20,22]){
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
   if(result.ratio<1.34||result.ratio>1.90||coverage<.022||coverage>.38)continue;
   if(result.quad.some(p=>p.x<.01||p.x>.99||p.y<.01||p.y>.99))continue;
   const confidence=Math.min(.97,.76+(.18*Math.min(1,c.fill))+.025*(result.ratio>1.46&&result.ratio<1.74));
   cards.push({quad:result.quad,confidence,method:'three-up-background-texture',angle:result.ang,coverage,ratio:result.ratio,maskFill:c.fill,comp:c});
  }
  cards.sort((a,b)=>a.quad.reduce((t,p)=>t+p.y,0)-b.quad.reduce((t,p)=>t+p.y,0)||(a.quad.reduce((t,p)=>t+p.x,0)-b.quad.reduce((t,p)=>t+p.x,0)));
  if(cards.length===3)snapshots.push({cards,threshold});
  if(!best||Math.abs(cards.length-3)<Math.abs(best.cards.length-3))best={cards,threshold};
  
 }

 if(snapshots.length){
  const reference=snapshots.find(s=>s.threshold===18)||snapshots[0];
  const selected=reference.cards.map(base=>{
   const cx=base.quad.reduce((sum,p)=>sum+p.x,0)/4,cy=base.quad.reduce((sum,p)=>sum+p.y,0)/4;
   const options=[];
   for(const snapshot of snapshots)for(const candidate of snapshot.cards){
    const x=candidate.quad.reduce((sum,p)=>sum+p.x,0)/4,y=candidate.quad.reduce((sum,p)=>sum+p.y,0)/4;
    if(Math.hypot(x-cx,y-cy)>.115)continue;
    const ratioScore=Math.abs(candidate.ratio-1.586)*3.8;
    const thinPenalty=candidate.maskFill<.34?.28:0;
    options.push({candidate,score:ratioScore+thinPenalty+Math.abs(snapshot.threshold-18)*.004});
   }
   const maxCoverage=Math.max(...options.map(o=>o.candidate.coverage),.001);
   for(const option of options)option.score+=.65*(1-option.candidate.coverage/maxCoverage);
   options.sort((a,b)=>a.score-b.score);
   const choice=options[0]?.candidate||base;
   const result={...choice};
   // The lowest contrast threshold retains outer pink plastic boundaries
   // which higher thresholds sometimes confuse with the inner printed grid.
   const outer=snapshots.find(t=>t.threshold===14)?.cards.find(candidate=>{
    const center=q=>({x:q.reduce((sum,p)=>sum+p.x,0)/4,y:q.reduce((sum,p)=>sum+p.y,0)/4});
    const a=center(candidate.quad),b=center(choice.quad);
    return Math.hypot(a.x-b.x,a.y-b.y)<.115;
   });
   if(outer)result.outerQuad=outer.quad.map(p=>({...p}));
   if(choice.maskFill<.58&&Math.abs(choice.angle)<3.5){
    const refined=snapMutedEdges(choice,lab,w,h);
    if(refined)result.quad=refined;
   }
   delete result.comp;return result;
  });
  selected.sort((a,b)=>a.quad.reduce((sum,p)=>sum+p.y,0)-b.quad.reduce((sum,p)=>sum+p.y,0)
    ||a.quad.reduce((sum,p)=>sum+p.x,0)-b.quad.reduce((sum,p)=>sum+p.x,0));
  if(selected.length===3)return {cards:selected,threshold:reference.threshold,mode:'three-up'};
 }
 return best||{cards:[],reason:'bordi non confermati'};
}
function detect(original){
 const scan=window.DocFixScanner;
 if(!scan||!original)return {cards:[],reason:'scanner non disponibile'};
 const portrait=original.height>original.width*1.20;
 let oriented=original;
 // Rotate ONLY a temporary analysis canvas; never rotate or overwrite originals.
 if(portrait){
  oriented=document.createElement('canvas');oriented.width=original.height;oriented.height=original.width;
  const g=oriented.getContext('2d',{willReadFrequently:true});
  g.translate(0,original.width);g.rotate(-Math.PI/2);g.drawImage(original,0,0);
 }
 const sample=scan.resize(oriented,600),ctx=sample.getContext('2d',{willReadFrequently:true});
 let result;
 try{result=analyzeRGBA(ctx.getImageData(0,0,sample.width,sample.height).data,sample.width,sample.height)}
 finally{
  if(sample!==original&&sample!==oriented)sample.width=sample.height=1;
  if(oriented!==original)oriented.width=oriented.height=1;
 }
 if(result.cards.length!==3)return {cards:[],reason:'tre tessere non confermate',candidates:result.cards.length};
 const cards=result.cards.map(card=>({...card,
  quad:portrait?card.quad.map(p=>({x:1-p.y,y:p.x})):card.quad,
  outerQuad:card.outerQuad?(portrait?card.outerQuad.map(p=>({x:1-p.y,y:p.x})):card.outerQuad):null,
  orientation:portrait?'left':'none'}));
 if(cards.some(c=>!scan.validQuad(c.quad)))return {cards:[],reason:'angoli non validi'};
 return {cards,orientation:portrait?'left':'none',verified:true};
}
window.DocFixThreeUp=Object.freeze({detect,analyzeRGBA,version:'1.9.17'});
})();
