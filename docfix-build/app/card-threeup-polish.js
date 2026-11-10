/* DocFix Desktop 1.9.29 - material-aware geometry for photos with three cards.
 * Only a downscaled scratch canvas is analyzed. The full-resolution original
 * is never changed. Runs locally and keeps the 2-card engine untouched.
 */
(()=>{'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function material(rgba,quad,w,h){
 const n=26,m=18;
 const at=(x,y)=>{const k=(clamp(Math.round(y),0,h-1)*w+clamp(Math.round(x),0,w-1))*4;return [rgba[k],rgba[k+1],rgba[k+2]]};
 let red=0,blue=0,dark=0,total=0;
 for(let j=0;j<m;j++)for(let i=0;i<n;i++){
  const u=.11+.78*(i+.5)/n,v=.11+.78*(j+.5)/m;
  const x=(quad[0].x*(1-u)+quad[1].x*u)*(1-v)+(quad[3].x*(1-u)+quad[2].x*u)*v;
  const y=(quad[0].y*(1-u)+quad[1].y*u)*(1-v)+(quad[3].y*(1-u)+quad[2].y*u)*v;
  const [r,g,b]=at(x*w,y*h);
  red+=(r>b+5&&r>g+5)?1:0;
  blue+=(b>r+15)?1:0;
  dark+=(.3*r+.59*g+.11*b)<65?1:0;
  total++;
 }
 const redFraction=red/total,blueFraction=blue/total,darkFraction=dark/total;
 return {kind:redFraction>.36?'licence':blueFraction>.26?'cf':'identity',redFraction,blueFraction,darkFraction};
}
function fitPhysicalLine(rgba,w,h,q,side){
 const top=side==='top',x0=Math.min(...q.map(p=>p.x))*w,x1=Math.max(...q.map(p=>p.x))*w,width=x1-x0;
 const yBase=((top?q[0].y+q[1].y:q[2].y+q[3].y)/2)*h,cx=(x0+x1)/2;
 const baselineSlope=(q[1].y-q[0].y)*h/Math.max(1,(q[1].x-q[0].x)*w);
 const xs=Array.from({length:27},(_,i)=>Math.round(x0+width*(.16+.68*i/26)));
 let winner=null;
 for(let k=-17;k<=17;k++){
  const slope=k*.006;
  for(let offset=-12;offset<=18;offset++){
   const values=[];let valid=true;
   for(const x of xs){
    const y=Math.round(yBase+(x-cx)*slope+offset);
    if(x<3||x>=w-3||y<4||y>=h-4){valid=false;break;}
    let total=0;
    for(let c=0;c<3;c++){
     const a=rgba[((y+2)*w+x)*4+c]-rgba[((y-2)*w+x)*4+c];
     total+=a*a;
    }
    values.push(Math.sqrt(total));
   }
   if(!valid)continue;
   values.sort((a,b)=>a-b);
   const strength=values[Math.floor(values.length*.38)],support=values.filter(x=>x>14).length/values.length;
   const score=strength*.9+support*4-Math.abs(offset)*.15-Math.abs(slope-baselineSlope)*14;
   if(!winner||score>winner.score)winner={slope,offset,strength,support,score,yBase};
  }
 }
 return winner;
}
function refineLicence(rgba,w,h,box){
 const q=box.map(p=>({...p})),top=fitPhysicalLine(rgba,w,h,q,'top'),bottom=fitPhysicalLine(rgba,w,h,q,'bottom');
 const valid=x=>x&&x.strength>=21&&x.support>.66;
 if(!valid(top)&&!valid(bottom))return q;
 const x0=Math.min(...q.map(p=>p.x))*w,x1=Math.max(...q.map(p=>p.x))*w,cx=(x0+x1)/2;
 const slopes=[top,bottom].filter(valid).map(x=>x.slope);
 const slope=clamp(slopes.reduce((a,b)=>a+b,0)/slopes.length,-.10,.10);
 const first=(valid(top)?top.yBase+top.offset:((q[0].y+q[1].y)/2)*h)-3.5;
 const observed=((q[3].y+q[2].y)/2)*h;
 const last=Math.max(observed+3.5,(valid(bottom)?bottom.yBase+bottom.offset:observed)+(valid(bottom)?3.5:4.5));
 if(last-first<45||last-first>h*.75)return q;
 q[0].y=clamp((first+(q[0].x*w-cx)*slope)/h,0,1);
 q[1].y=clamp((first+(q[1].x*w-cx)*slope)/h,0,1);
 q[2].y=clamp((last+(q[2].x*w-cx)*slope)/h,0,1);
 q[3].y=clamp((last+(q[3].x*w-cx)*slope)/h,0,1);
 for(const i of [0,3])q[i].x=clamp(q[i].x-2.5/w,0,1);
 for(const i of [1,2])q[i].x=clamp(q[i].x+5/w,0,1);
 const length=(a,b)=>Math.hypot((a.x-b.x)*w,(a.y-b.y)*h);
 const wide=(length(q[0],q[1])+length(q[3],q[2]))/2;
 const high=(length(q[0],q[3])+length(q[1],q[2]))/2;
 return wide/high<1.35||wide/high>1.90?box:q;
}
function refine(original,detected){
 if(!detected?.verified||detected.cards?.length!==3)return detected;
 const scan=window.DocFixScanner;if(!scan)return detected;
 const portrait=detected.orientation==='left';
 let oriented=original;
 try{
 if(portrait){
  oriented=document.createElement('canvas');oriented.width=original.height;oriented.height=original.width;
  const g=oriented.getContext('2d',{willReadFrequently:true});
  g.translate(0,original.width);g.rotate(-Math.PI/2);g.drawImage(original,0,0);
 }
 const sample=scan.resize(oriented,600),w=sample.width,h=sample.height;
 try{
 const rgba=sample.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
 const toRot=q=>portrait?q.map(p=>({x:p.y,y:1-p.x})):q.map(p=>({...p}));
 const toSrc=q=>portrait?q.map(p=>({x:1-p.y,y:p.x})):q.map(p=>({...p}));
 const cards=detected.cards.map(card=>({...card,...material(rgba,toRot(card.quad),w,h),rot:toRot(card.quad)}));

 // Use RELATIVE material evidence, not just hard thresholds: on pale backgrounds
 // the blue of a worn health card can dip below the old threshold.
 const reds=[...cards].sort((a,b)=>b.redFraction-a.redFraction);
 const licence=reds[0];
 const other=cards.filter(c=>c!==licence).sort((a,b)=>b.blueFraction-a.blueFraction);
 const cfCandidate=other[0],identityCandidate=other[1];
 const distinct=licence.redFraction>.22
   &&licence.redFraction-reds[1].redFraction>.10
   &&cfCandidate.blueFraction>.18
   &&cfCandidate.blueFraction-identityCandidate.blueFraction>.075;
 if(distinct){licence.kind='licence';cfCandidate.kind='cf';identityCandidate.kind='identity';}
 const allTypes=distinct&&['cf','licence','identity'].every(x=>cards.filter(c=>c.kind===x).length===1);
 const cf=cards.find(x=>x.kind==='cf');
 const sourceSide=allTypes?(cf.darkFraction>.46?'retro':'fronte'):'indefinito';
 const result=cards.map(c=>{
  let q=c.rot.map(p=>({...p}));
  if(allTypes&&c.kind==='licence'){
   // Low-threshold mask retains outer pale-pink plastic beyond printed text.
   const outer=c.outerQuad?toRot(c.outerQuad):null;
   if(outer){
    for(const j of [0,3])q[j].x=Math.min(q[j].x,outer[j].x-1.1/w);
    for(const j of [1,2])q[j].x=Math.max(q[j].x,outer[j].x+1.1/w);
    for(const j of [2,3])q[j].y=Math.max(q[j].y,Math.min(outer[j].y,q[j].y+.035));
   }
   q=refineLicence(rgba,w,h,q);
  }
  if(allTypes&&c.kind==='identity'&&sourceSide==='retro'){
   // Do not cut the bottom line of MRZ on the pale identity-card back.
   q[2].y=clamp(q[2].y+7/h,0,1);q[3].y=clamp(q[3].y+7/h,0,1);
  }
  return {...c,quad:toSrc(q),sideGuess:sourceSide,materialVerified:allTypes};
 });
 // A difficult corner must not discard the classification and ordering of
 // all six cards. Revert only that corner to its safe detected source quad.
 let physicalReview=false;
 for(let i=0;i<result.length;i++){
  if(!scan.validQuad(result[i].quad)){
   result[i].quad=detected.cards[i].quad.map(p=>({...p}));
   result[i].geometryReview=true;physicalReview=true;
  }
 }
 return {...detected,cards:result,materialVerified:allTypes,sourceSide,physicalReview};
 }finally{if(sample!==oriented&&sample!==original)sample.width=sample.height=1;}
 }finally{if(oriented!==original)oriented.width=oriented.height=1;}
}
window.DocFixThreeUpPolish=Object.freeze({refine,material,version:'1.9.29'});
})();