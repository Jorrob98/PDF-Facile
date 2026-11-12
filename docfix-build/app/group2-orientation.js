/* DocFix Group 2: orientation guard. 2026-10-29.
   A physical card's aspect ratio is NOT evidence of its readable orientation.
   Distinctive, repeated MRZ text bands can support a 0/90/180/270-degree
   correction of an Italian ID card reverse; otherwise defer to trustworthy
   text orientation detection and warn the operator. No identity fields read. */
(()=>{'use strict';
 const CANDIDATES=[0,90,180,270], scan=window.DocFixScanner;
 function normalizedAngle(a){return ((Math.round(a/90)*90)%360+360)%360;}
 function rotateCanvas(source,deg){const d=normalizedAngle(deg);if(!d)return source;const swap=d%180!==0;
  const out=document.createElement('canvas');out.width=swap?source.height:source.width;out.height=swap?source.width:source.height;
  const g=out.getContext('2d');g.translate(out.width/2,out.height/2);g.rotate(d*Math.PI/180);g.drawImage(source,-source.width/2,-source.height/2);return out;}
 function bandStats(series,from,to,minTransitions){
  const lo=Math.floor(from*series.length),hi=Math.ceil(to*series.length);let longRuns=0,covered=0,maxRun=0,r=0,sum=0;
  for(let i=lo;i<hi;i++){const n=series[i];sum+=n;if(n>=minTransitions){r++;covered++;}else{if(r>=7)longRuns++;maxRun=Math.max(maxRun,r);r=0;}}
  if(r>=7)longRuns++;maxRun=Math.max(maxRun,r);return {longRuns,covered,maxRun,mean:sum/Math.max(1,hi-lo)};
 }
 function barcodeEvidence(pix,w,h){
  const x0=Math.floor(w*.08),x1=Math.ceil(w*.92);
  for(const [yf,yt] of [[.30,.65],[.38,.60],[.35,.72]]){
   const y0=Math.floor(h*yf),y1=Math.ceil(h*yt),n=Math.max(1,y1-y0);
   for(const threshold of [110,140]){
    let prev=false,changes=0,darkColumns=0;
    for(let x=x0;x<x1;x++){
     let dark=0;
     for(let y=y0;y<y1;y++){const k=(y*w+x)*4;if((pix[k]*.299+pix[k+1]*.587+pix[k+2]*.114)<threshold)dark++;}
     const isDark=dark/n>.5;if(x>x0&&isDark!==prev)changes++;if(isDark)darkColumns++;prev=isDark;
    }
    const fraction=darkColumns/Math.max(1,x1-x0);if(changes>=44&&fraction>.12&&fraction<.94)return true;
   }
  }
  return false;
 }
 function signature(source){
  const ratio=source.width/source.height;if(ratio<1.30||ratio>2.02||source.width<140||source.height<95)return {candidate:false,score:0};
  const w=720,h=Math.max(120,Math.round(720/ratio));const c=document.createElement('canvas');c.width=w;c.height=h;
  try{
  const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(source,0,0,w,h);
  const pix=g.getImageData(0,0,w,h).data,row=new Float32Array(h),threshold=130;
  for(let y=0;y<h;y++){let transitions=0,previous=false;for(let x=Math.floor(w*.04);x<Math.ceil(w*.96);x++){const i=(y*w+x)*4,gray=pix[i]*.299+pix[i+1]*.587+pix[i+2]*.114;const dark=gray<threshold;if(dark&&!previous)transitions++;previous=dark;}row[y]=transitions;}
  const thresholdTransitions=16,top=bandStats(row,.025,.30,thresholdTransitions),bottom=bandStats(row,.70,.975,thresholdTransitions);
  const qualifies=b=>b.longRuns>=2&&b.maxRun>=10&&b.covered>=27&&b.mean>=12,hasBarcode=barcodeEvidence(pix,w,h);
  return {candidate:hasBarcode&&qualifies(bottom)&&bottom.mean>top.mean*1.2&&bottom.covered>top.covered*1.15,score:bottom.mean+bottom.covered*.16+bottom.longRuns*5,top,bottom};
  }finally{c.width=c.height=1;}
 }
 function recognizeMRZOrientation(source){
  const ratio=Math.max(source.width,source.height)/Math.min(source.width,source.height);if(ratio<1.30||ratio>2.02)return {angle:0,trustworthy:false,method:'not-card'};
  const small=scan.resize(source,900),hits=[];
  try{
   for(const a of CANDIDATES){
    const rr=rotateCanvas(small,a);
    try{
     const result=signature(rr);
     if(result.candidate)hits.push({angle:a,score:result.score,top:result.top,bottom:result.bottom});
    }finally{if(rr!==small)rr.width=rr.height=1;}
   }
   hits.sort((a,b)=>b.score-a.score);
   if(hits.length===1)return {...hits[0],method:'mrz',trustworthy:true};
   return {angle:0,method:'mrz-inconclusive',trustworthy:false,candidates:hits.map(h=>h.angle)};
  }finally{if(small!==source)small.width=small.height=1;}
 }
 window.DocFixGroup2=Object.freeze({normalizedAngle,rotateCanvas,signature,recognizeMRZOrientation,version:'group2-superrun-20261105'});
})();