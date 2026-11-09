/* DocFix 1.9.15: verify the four physical licence edges before source crop.
 * Local/offline only. Original photo is never overwritten. Other document
 * types and the proven 2-up detector are not modified.
 */
(()=>{'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const point=(p,w,h)=>({x:p.x*w,y:p.y*h});
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y});
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const mul=(p,v)=>({x:p.x*v,y:p.y*v});
const norm=p=>Math.hypot(p.x,p.y);
const lerp=(a,b,t)=>add(mul(a,1-t),mul(b,t));
const ratio=q=>{
 const d=(a,b)=>norm(sub(q[a],q[b]));
 return (d(0,1)+d(2,3))/Math.max(1,d(1,2)+d(3,0));
};
function intersection(a,b,c,d){
 const x=sub(b,a),y=sub(d,c),den=x.x*y.y-x.y*y.x;
 if(Math.abs(den)<1e-6)return null;
 const v=sub(c,a),t=(v.x*y.y-v.y*y.x)/den;
 return add(a,mul(x,t));
}
function fitSide(q,i,data,w,h){
 const a=q[i],b=q[(i+1)%4],v=sub(b,a),L=norm(v);
 if(L<55)return null;
 const outward={x:v.y/L,y:-v.x/L};
 const samples=17,eps=2.7;
 function sample(p){
  const x=clamp(Math.round(p.x),0,w-1),y=clamp(Math.round(p.y),0,h-1),k=(y*w+x)*4;
  return [data[k],data[k+1],data[k+2]];
 }
 function edge(p){
  if(p.x<5||p.x>w-6||p.y<5||p.y>h-6)return 0;
  const x=sample(add(p,mul(outward,eps))),y=sample(add(p,mul(outward,-eps)));
  return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2]);
 }
 function measure(offset,tilt){
  const values=[];
  for(let j=0;j<samples;j++){
   const t=.12+.76*j/(samples-1);
   const p=add(lerp(a,b,t),mul(outward,offset+tilt*(t-.5)*L));
   values.push(edge(p));
  }
  values.sort((x,y)=>x-y);
  const q40=values[6],median=values[8],covered=values.filter(x=>x>=18).length;
  return {strength:q40*.78+median*.22,covered};
 }
 const baseline=measure(0,0);
 let best=null;
 // A pale card may be truncated by more than 30 pixels on the long side.
 const maxOut=i===1?Math.min(58,Math.max(28,L*.20)):Math.min(37,Math.max(14,L*.11));
 for(let off=-Math.min(14,L*.035);off<=maxOut;off+=2){
  for(let tilt=-.085;tilt<=.085;tilt+=.017){
   const m=measure(off,tilt);
   const score=m.strength+(m.covered>=13?5:0)-Math.abs(off)*.17-Math.abs(tilt)*12;
   if(!best||score>best.score)best={off,tilt,score,...m};
  }
 }
 const improved=best&&best.covered>=12&&best.strength>=22
  &&best.strength>=baseline.strength+3;
 const baselineReliable=baseline.covered>=12&&baseline.strength>=22;
 const reliable=!!(improved||baselineReliable);
 const minimumPadding=i===1?Math.max(3,L*.009):Math.max(2,L*.006);
 const fallbackPadding=i===1?Math.max(5,L*.019):Math.max(3,L*.012);
 let offset=improved?best.off+minimumPadding:(baselineReliable?minimumPadding:fallbackPadding);
 offset=Math.max(minimumPadding,offset);
 const tilt=improved?best.tilt:0;
 const shift=(p,t)=>add(p,mul(outward,offset+tilt*(t-.5)*L));
 return {a:shift(a,0),b:shift(b,1),reliable,shift:offset,
   baseline:baseline.strength,strength:best?.strength||0};
}
function polishQuad(q,data,w,h){
 const px=q.map(p=>point(p,w,h)),fits=px.map((_,i)=>fitSide(px,i,data,w,h));
 if(fits.some(x=>!x))return {quad:q,verified:false,reason:'bordo troppo piccolo'};
 const candidate=Array.from({length:4},(_,i)=>
  intersection(fits[(i+3)%4].a,fits[(i+3)%4].b,fits[i].a,fits[i].b));
 if(candidate.some(x=>!x||!Number.isFinite(x.x)||!Number.isFinite(x.y)))
  return {quad:q,verified:false,reason:'intersezione non confermata'};
 const area=q=>Math.abs(q.reduce((n,p,i)=>n+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))*.5;
 const areaRatio=area(candidate)/Math.max(1,area(px)),r=ratio(candidate);
 if(r<1.36||r>1.91||areaRatio<.94||areaRatio>1.30||
    candidate.some(p=>p.x<3||p.y<3||p.x>w-4||p.y>h-4))
  return {quad:q,verified:false,reason:'espansione fuori geometria sicura'};
 return {quad:candidate.map(p=>({x:p.x/w,y:p.y/h})),
  verified:fits.every(x=>x.reliable),reason:'bordi protetti prima del ritaglio',
  edges:fits.map(x=>({reliable:x.reliable,shift:+x.shift.toFixed(1),
   strength:+x.strength.toFixed(1),baseline:+x.baseline.toFixed(1)}))};
}
// A pale rose driving licence can have low-contrast edges: the old gradient
// search may lock onto printed text while leaving the actual plastic outside.
// Detect a saturated rose surface separated from neutral paper, but ONLY
// accept it if almost all of that colour is inside ONE card-shaped envelope.
function pinkEnvelope(q,rgba,w,h){
 if(!Array.isArray(q)||q.length!==4||!rgba||w<100||h<100)return {quad:q,verified:false,reason:'campione insufficiente'};
 const p=q.map(z=>point(z,w,h)),xs=p.map(z=>z.x),ys=p.map(z=>z.y);
 const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),ww=x1-x0,hh=y1-y0;
 if(ww<80||hh<48)return {quad:q,verified:false,reason:'tessera troppo piccola'};
 const left=clamp(Math.floor(x0-ww*.25),0,w-1),right=clamp(Math.ceil(x1+ww*.25),1,w);
 const top=clamp(Math.floor(y0-hh*.20),0,h-1),bottom=clamp(Math.ceil(y1+hh*.20),1,h);
 const xa=clamp(Math.round(x0+ww*.25),left,right-1),xb=clamp(Math.round(x1-ww*.25),xa+1,right);
 const ya=clamp(Math.round(y0+hh*.25),top,bottom-1),yb=clamp(Math.round(y1-hh*.25),ya+1,bottom);
 function isRose(x,y){
  const i=(y*w+x)*4,r=rgba[i],g=rgba[i+1],b=rgba[i+2];
  const max=Math.max(r,g,b),min=Math.min(r,g,b);
  return r>45&&r-g>=5&&max>0&&(max-min)*255/max>=17;
 }
 const cols=[];
 for(let x=left;x<right;x++){
  let pink=0;
  for(let y=ya;y<yb;y++)pink+=Number(isRose(x,y));
  if(pink/Math.max(1,yb-ya)>.15)cols.push(x);
 }
 const rows=[];
 for(let y=top;y<bottom;y++){
  let pink=0;
  for(let x=xa;x<xb;x++)pink+=Number(isRose(x,y));
  if(pink/Math.max(1,xb-xa)>.15)rows.push(y);
 }
 if(cols.length<ww*.42||rows.length<hh*.42)
  return {quad:q,verified:false,reason:'colore della plastica non confermato'};
 const minX=cols[0],maxX=cols[cols.length-1],minY=rows[0],maxY=rows[rows.length-1];
 const width=maxX-minX+1,height=maxY-minY+1;
 const ratio=width/height,area=width*height/(ww*hh);
 if(ratio<1.43||ratio>1.80||area<.70||area>1.55
    ||Math.abs((minX+maxX-x0-x1)/2)>ww*.20
    ||Math.abs((minY+maxY-y0-y1)/2)>hh*.20)
  return {quad:q,verified:false,reason:'ingombro non coerente con una patente'};
 let inner=0,pinkInside=0,pinkOutside=0,outer=0;
 for(let y=top;y<bottom;y+=2)for(let x=left;x<right;x+=2){
  const inside=x>=minX&&x<=maxX&&y>=minY&&y<=maxY;
  if(inside){inner++;pinkInside+=Number(isRose(x,y));}
  else {outer++;pinkOutside+=Number(isRose(x,y));}
 }
 const coverage=pinkInside/Math.max(1,inner),spill=pinkOutside/Math.max(1,outer);
 if(coverage<.29||spill>.12)
  return {quad:q,verified:false,reason:'superficie plastica non distinta dallo sfondo'};
 const pad=Math.max(2,Math.round(Math.min(width,height)*.013));
 const L=minX-pad,R=maxX+pad,T=minY-pad,B=maxY+pad;
 if(L<3||R>w-4||T<3||B>h-4)
  return {quad:q,verified:false,reason:'patente troppo vicina al bordo'};
 // Bounding the entire coloured plastic is safer than warping along the
 // inner text frame. Small neutral margins remain intentionally visible.
 const quad=[{x:L/w,y:T/h},{x:R/w,y:T/h},{x:R/w,y:B/h},{x:L/w,y:B/h}];
 return {quad,verified:true,reason:'plastica rosa separata dal foglio originale',
   coverage:+coverage.toFixed(3),spill:+spill.toFixed(3),
   recoveredPixels:{left:+(x0-L).toFixed(1),right:+(R-x1).toFixed(1),
    top:+(y0-T).toFixed(1),bottom:+(B-y1).toFixed(1)}};
}
function protect(original,detected){
 if(!original||!detected?.verified||detected.cards?.length!==3||
    detected.materialVerified!==true)return detected;
 const scan=window.DocFixScanner;if(!scan)return detected;
 const portrait=detected.orientation==='left';
 let oriented=original;
 try{
  if(portrait){
   oriented=document.createElement('canvas');
   oriented.width=original.height;oriented.height=original.width;
   const g=oriented.getContext('2d',{willReadFrequently:true});
   g.translate(0,original.width);g.rotate(-Math.PI/2);
   g.drawImage(original,0,0);
  }
  const sample=scan.resize(oriented,1000),w=sample.width,h=sample.height;
  try{
   const d=sample.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
   const toRot=q=>portrait?q.map(p=>({x:p.y,y:1-p.x})):q.map(p=>({...p}));
   const toSrc=q=>portrait?q.map(p=>({x:1-p.y,y:p.x})):q.map(p=>({...p}));
   const cards=detected.cards.map(card=>{
    if(card.kind!=='licence')return card;
    const orientedQuad=toRot(card.quad);
    const colour=pinkEnvelope(orientedQuad,d,w,h);
    const check=colour.verified?colour:polishQuad(orientedQuad,d,w,h);
    const quad=toSrc(check.quad);
    if(!scan.validQuad(quad))return {...card,
      licenceGuard:{verified:false,reason:'geometria non valida'}};
    // Unverified edge searches must NEVER silently alter four-corner geometry.
    if(!check.verified)return {...card,geometryReview:true,
      licenceGuard:{verified:false,reason:check.reason||'bordi non confermati'}};
    return {...card,quad,licenceGuard:{verified:true,
      reason:check.reason,method:colour.verified?'pink-envelope':'gradient-edges',
      edges:check.edges,recoveredPixels:check.recoveredPixels}};
   });
   return {...detected,cards};
  }finally{if(sample!==oriented&&sample!==original)sample.width=sample.height=1;}
 }finally{if(oriented!==original)oriented.width=oriented.height=1;}
}
window.DocFixLicenceGuard=Object.freeze({protect,polishQuad,pinkEnvelope,version:'1.9.16'});
})();