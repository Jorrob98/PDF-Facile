/* DocFix 1.9.46 — conservative fine deskew for a provisional ID-1 crop.
   Full-length top/bottom plastic transitions adjust the original source
   quadrilateral even when side edges are weak. Manual review mandatory. */
(()=>{'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function inspectRGBA(data,w,h,rough){
 if(!data||data.length<w*h*4||w<240||h<170||!Array.isArray(rough)||rough.length!==4)return null;
 const p=rough.map(t=>({x:t.x*w,y:t.y*h}));
 if(p.some(t=>!Number.isFinite(t.x)||!Number.isFinite(t.y)))return null;
 const L=(p[0].x+p[3].x)/2,R=(p[1].x+p[2].x)/2;
 const T=(p[0].y+p[1].y)/2,B=(p[2].y+p[3].y)/2;
 const cw=R-L,ch=B-T;
 if(cw<w*.36||ch<h*.24||cw/ch<1.28||cw/ch>1.94)return null;
 const lum=new Float32Array(w*h),hue=new Float32Array(w*h);
 for(let i=0;i<w*h;i++){
  const k=i*4,r=data[k],g=data[k+1],b=data[k+2];
  lum[i]=.299*r+.587*g+.114*b;hue[i]=g-r;
 }
 function sample(a,x,y){
  const xx=clamp(Math.round(x),2,w-3),yy=clamp(Math.round(y),2,h-3);
  const idx=yy*w+xx;return (a[idx-1]+a[idx]+a[idx+1])/3;
 }
 const range=Math.round(clamp(ch*.09,10,44)),slopes=51,n=48;
 function track(which,guideSlope=null){
  const top=which==='top',inward=top?1:-1;
  const yNom=top?T:B,leftX=L+cw*.09,rightX=R-cw*.09,mid=(leftX+rightX)/2;
  const baseSlope=top?(p[1].y-p[0].y)/Math.max(1,p[1].x-p[0].x)
                    :(p[2].y-p[3].y)/Math.max(1,p[2].x-p[3].x);
  const xs=Array.from({length:n},(_,i)=>leftX+(rightX-leftX)*i/(n-1));
  let best=null;
  for(let si=0;si<slopes;si++){
   const slope=clamp(baseSlope,-.12,.12)+(-.115+si*.23/(slopes-1));
   if(Math.abs(slope)>.20||(guideSlope!==null&&Math.abs(slope-guideSlope)>.042))continue;
   for(let offset=-range;offset<=range;offset++){
    let acc=0,bright=0;const third=[0,0,0];let ix=0;
    for(const x of xs){
     const y=yNom+offset+slope*(x-mid);
     if(y<12||y>h-12){acc=-1e6;break}
     const innerH=sample(hue,x,y+inward*8),outerH=sample(hue,x,y-inward*8);
     const innerL=sample(lum,x,y+inward*8),outerL=sample(lum,x,y-inward*8);
     const hd=innerH-outerH;
     if(hd>6){bright++;third[Math.min(2,Math.floor(ix*3/n))]++;}ix++;
     acc+=Math.max(0,hd-2.5)*2+Math.min(75,Math.abs(innerL-outerL))*.55;
    }
    const support=bright/n;
    const balanced=Math.min(...third)/(n/3);
    // For the bottom edge favour consistent evidence across the width.
    // This avoids following MRZ lines or a shadow present on one segment.
    const score=acc/n-.12*Math.abs(offset)-.025*Math.abs(slope*ch)
     +support*2.5+(top?0:18*balanced);
    if(!best||score>best.score)
     best={score,slope,offset,support,third:third.map(x=>+(x/(n/3)).toFixed(2)),yNom,mid};
   }
  }
  if(!best||best.score<(top?21:24))return null;
  if(best.support<.14&&best.score<36)return null;
  return best;
 }
 const top=track('top'),bottom=top?track('bottom',top.slope):null;
 if(!top||!bottom)return null;
 if(Math.abs(top.slope-bottom.slope)>.105)return null;
 const at=(fit,x)=>fit.yNom+fit.offset+fit.slope*(x-fit.mid);
 const padTop=clamp(ch*.018,4,13),padBottom=clamp(ch*.033,6,24);
 const padX=clamp(cw*.018,3,20),flareLeft=clamp(cw*.016,2,12);
 // Protective outside margins, and an extra small lower-left flare for
 // perspective: never slice the curved lower-left plastic corner.
 const newp=[{x:p[0].x-padX,y:at(top,p[0].x)-padTop},
   {x:p[1].x+padX,y:at(top,p[1].x)-padTop},
   {x:p[2].x+padX,y:at(bottom,p[2].x)+padBottom},
   {x:p[3].x-padX-flareLeft,y:at(bottom,p[3].x)+padBottom}];
 if(newp.some((t,i)=>Math.abs(t.y-p[i].y)>ch*.125))return null;
 if(newp.some(t=>t.x<3||t.x>w-3||t.y<3||t.y>h-3))return null;
 const newH=((newp[3].y-newp[0].y)+(newp[2].y-newp[1].y))/2;
 const aspect=(cw+2*padX)/Math.max(1,newH);
 if(aspect<1.35||aspect>1.87||newH/ch<.85||newH/ch>1.15)return null;
 const angle=(top.slope+bottom.slope)/2*180/Math.PI;
 const oldAngle=(p[1].y-p[0].y+p[2].y-p[3].y)/(2*cw)*180/Math.PI;
 if(Math.abs(angle-oldAngle)<.36&&Math.abs(top.offset)+Math.abs(bottom.offset)<7)return null;
 const quad=newp.map(t=>({x:t.x/w,y:t.y/h}));
 return {quad,angleDeg:+angle.toFixed(2),needsReview:true,physicallyVerified:false,
   targetAspect:aspect>=1.49&&aspect<=1.69?1.586:null,
   method:'cie-postcrop-horizontal-edge-deskew',confidence:.70,
   support:{top:+top.support.toFixed(2),bottom:+bottom.support.toFixed(2),
     topScore:+top.score.toFixed(1),bottomScore:+bottom.score.toFixed(1),
     topThird:top.third,bottomThird:bottom.third}};
}
function refine(original,rough){
 const sc=window.DocFixScanner;
 if(!original||!sc?.resize||!sc?.validQuad?.(rough))return null;
 let sample;
 try{
  sample=sc.resize(original,820);
  const w=sample.width,h=sample.height;
  const rgba=sample.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const fit=inspectRGBA(rgba,w,h,rough);
  return fit&&sc.validQuad(fit.quad)?fit:null;
 }catch(err){console.warn('DocFix fine deskew not applied',err);return null;}
 finally{if(sample&&sample!==original)sample.width=sample.height=1;}
}
window.DocFixFineDeskew=Object.freeze({inspectRGBA,refine,version:'1.9.46'});
})();
