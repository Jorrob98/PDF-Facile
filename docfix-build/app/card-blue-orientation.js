/* DocFix blue-card orientation — no text fields, OCR or identity data.
 * This restricted fallback runs only on provisional blue health cards.
 * The dark printed strip is expected at the top when upright.
 */
(()=>{'use strict';
function decide(source){
 if(!source?.width||!source?.height)return {angle:0,trustworthy:false};
 const ratio=source.width/source.height;
 if(ratio<1.29||ratio>2.12)return {angle:0,trustworthy:false};
 let small=null;
 try{
  small=window.DocFixScanner?.resize?.(source,440)||source;
  const w=small.width,h=small.height;
  const pix=small.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  let blue=0,total=0,topDark=0,bottomDark=0,topN=0,bottomN=0;
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
   const k=(y*w+x)*4,r=pix[k],g=pix[k+1],b=pix[k+2];
   blue+=Number(b>r+22&&b>g+6&&b>90);total++;
   const dark=r<85&&g<85&&b<130;
   if(y<h*.15){topN++;topDark+=Number(dark);}
   if(y>=h*.85){bottomN++;bottomDark+=Number(dark);}
  }
  const color=blue/Math.max(1,total),top=topDark/Math.max(1,topN),bottom=bottomDark/Math.max(1,bottomN);
  if(color<.21)return {angle:0,trustworthy:false,reason:'not a blue health-card layout'};
  if(bottom>=.15&&bottom>top+.085)
   return {angle:180,trustworthy:true,method:'health-card dark-band direction',blueFraction:color};
  if(top>=.17&&top>bottom+.10)
   return {angle:0,trustworthy:true,method:'health-card dark-band direction',blueFraction:color};
  return {angle:0,trustworthy:false,reason:'inconclusive blue strip'};
 }catch(e){return {angle:0,trustworthy:false,reason:'orientation guard unavailable'};}
 finally{if(small&&small!==source)small.width=small.height=1;}
}
window.DocFixBlueCardOrientation=Object.freeze({decide,version:'lab-1'});
})();