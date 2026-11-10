/* DocFix 1.9.25 — Conservative final alignment of Italian driving-licence cards.
 * Uses the external plastic-to-white-matte boundary, never printed table lines
 * or a portrait. One perspective transform only; otherwise retain source.
 */
(()=>{'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function white(d,k){const r=d[k],g=d[k+1],b=d[k+2];return Math.min(r,g,b)>=207&&Math.max(r,g,b)-Math.min(r,g,b)<=24;}
function trace(d,w,h,side){
 const horizontal=side==='top'||side==='bottom',forward=side==='top'||side==='left';
 const along=horizontal?w:h,depth=horizontal?h:w,limit=Math.min(Math.floor(depth*.22),105);
 const points=[];
 for(let j=0;j<=36;j++){
  const u=Math.round((.10+.80*j/36)*(along-1));
  const at=t=>{
   const v=forward?t:depth-1-t,k=(horizontal?(v*w+u):(u*w+v))*4;
   return white(d,k);
  };
  // Require a genuine exterior white strip, not a white character inside.
  if(!at(0)||!at(1))continue;
  for(let v=2;v<limit-3;v++){
   if(at(v-2)&&at(v-1)&&!at(v)&&!at(v+1)&&!at(v+2)){
    points.push([u,forward?v:depth-1-v]);break;
   }
  }
 }
 if(points.length<22||points[points.length-1][0]-points[0][0]<along*.58)return null;
 const regression=arr=>{
  const mx=arr.reduce((a,p)=>a+p[0],0)/arr.length,my=arr.reduce((a,p)=>a+p[1],0)/arr.length;
  let top=0,den=0;for(const p of arr){top+=(p[0]-mx)*(p[1]-my);den+=(p[0]-mx)**2;}
  const a=top/Math.max(1,den),b=my-a*mx;
  return {a,b};
 };
 let fit=regression(points);
 const filtered=points.filter(p=>Math.abs(p[1]-(fit.a*p[0]+fit.b))<=Math.max(3,depth*.009));
 if(filtered.length<20)return null;
 fit=regression(filtered);
 const rms=Math.sqrt(filtered.reduce((n,p)=>n+(p[1]-(fit.a*p[0]+fit.b))**2,0)/filtered.length);
 if(rms>Math.max(2.3,depth*.0065)||Math.abs(fit.a)>.115)return null;
 return {...fit,rms,points:filtered.length};
}
function analyzeRGBA(data,w,h){
 if(!data||w<250||h<165||data.length<w*h*4)return null;
 const top=trace(data,w,h,'top'),bottom=trace(data,w,h,'bottom');
 const left=trace(data,w,h,'left'),right=trace(data,w,h,'right');
 if(!top||!bottom||(!left&&!right))return null;
 // Four complete white-backed physical sides must form a near rectangle.
 if(Math.abs(top.a-bottom.a)>.035||
    (left&&right&&Math.abs(left.a-right.a)>.035)||
    (left&&Math.abs(top.a+left.a)>.050)||
    (right&&Math.abs(bottom.a+right.a)>.050))return null;
 const meet=(vertical,horizontal)=>{
  const den=1-vertical.a*horizontal.a;if(Math.abs(den)<.8)return null;
  const x=(vertical.a*horizontal.b+vertical.b)/den;
  return {x,y:horizontal.a*x+horizontal.b};
 };
 const L=left||{a:right?.a||-top.a,b:0},R=right||{a:left?.a||-top.a,b:w-1};
 const raw=[meet(L,top),meet(R,top),meet(R,bottom),meet(L,bottom)];
 if(raw.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
  p.x<-.008*w||p.y<-.008*h||p.x>w-1+.008*w||p.y>h-1+.008*h))return null;
 const len=(a,b)=>Math.hypot(raw[a].x-raw[b].x,raw[a].y-raw[b].y);
 const cw=(len(0,1)+len(2,3))/2,ch=(len(1,2)+len(3,0))/2,ratio=cw/Math.max(1,ch);
 const area=Math.abs(raw.reduce((s,p,i)=>s+p.x*raw[(i+1)%4].y-p.y*raw[(i+1)%4].x,0))/2/(w*h);
 if(ratio<1.43||ratio>1.82||area<.72||area>1.015||cw<w*.76||ch<h*.76)return null;
 const angleDeg=(Math.atan(top.a)+Math.atan(bottom.a))*90/Math.PI;
 if(Math.abs(angleDeg)<.40&&raw.every((p,i)=>Math.hypot(
  p.x-[0,w-1,w-1,0][i],p.y-[0,0,h-1,h-1][i])<Math.min(w,h)*.018))return null;
 // Keep a pixel of safety margin where image pixels exist.
 const cx=raw.reduce((s,p)=>s+p.x,0)/4,cy=raw.reduce((s,p)=>s+p.y,0)/4;
 const pad=Math.min(1.5,Math.min(w,h)*.0025);
 const q=raw.map(p=>({
  x:clamp(p.x+Math.sign(p.x-cx)*pad,0,w-1)/w,
  y:clamp(p.y+Math.sign(p.y-cy)*pad,0,h-1)/h
 }));
 return {quad:q,status:'found',angle:+angleDeg.toFixed(2),ratio:+ratio.toFixed(3),
  area:+area.toFixed(3),physicallyVerified:!!(left&&right),needsReview:!(left&&right),method:'licence-exterior-white-matte',
  points:[top.points,bottom.points,left?.points||0,right?.points||0],
  rms:[top.rms,bottom.rms,left?.rms||0,right?.rms||0].map(v=>+v.toFixed(2))};
}
function isLicenceMaterial(source){
 const scanner=window.DocFixScanner;if(!scanner||!source)return false;
 const ratio=Math.max(source.width,source.height)/Math.max(1,Math.min(source.width,source.height));
 if(ratio<1.36||ratio>1.95)return false;
 let sample=null;
 try{
  sample=scanner.resize(source,360);
  const w=sample.width,h=sample.height;
  const d=sample.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  let rose=0,blue=0,n=0;
  for(let y=Math.round(h*.18);y<Math.round(h*.82);y+=3)
   for(let x=Math.round(w*.10);x<Math.round(w*.90);x+=3){
    const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];
    rose+=Number(r-g>=5&&r-b>=2&&r>55&&r<243);
    blue+=Number(b-r>=12&&b-g>=2);n++;
   }
  return n>200&&rose/n>.31&&blue/n<.12&&rose>blue*3;
 }catch{return false;}finally{if(sample&&sample!==source)sample.width=sample.height=1;}
}
function correct(source){
 const scan=window.DocFixScanner;if(!source||!scan)return {canvas:source,applied:false,reason:'scanner unavailable'};
 let s;
 try{
  s=scan.resize(source,850);
  const d=s.getContext('2d',{willReadFrequently:true}).getImageData(0,0,s.width,s.height).data;
  const found=analyzeRGBA(d,s.width,s.height);
  if(!found||!scan.validQuad(found.quad))return {canvas:source,applied:false,reason:'exterior not verified'};
  const processed=scan.process(source,{crop:true,quad:found.quad,rotation:0,filter:'original',strength:0},4200);
  if(!processed||processed.width<240||processed.height<140)throw Error('corrected licence too small');
  const ratio=processed.width/Math.max(1,processed.height);
  if(ratio<1.40||ratio>1.90){if(processed!==source)processed.width=processed.height=1;
   return {canvas:source,applied:false,reason:'unsafe aspect ratio'};}
  return {canvas:processed,applied:true,verified:found.physicallyVerified,needsReview:found.needsReview,angle:found.angle,method:found.method};
 }catch(err){console.warn('DocFix: licence exterior alignment not applied',err);
  return {canvas:source,applied:false,reason:'safe fallback'};
 }finally{if(s&&s!==source)s.width=s.height=1;}
}
window.DocFixLicenceFinish=Object.freeze({analyzeRGBA,isLicenceMaterial,correct,version:'1.9.25'});
})();