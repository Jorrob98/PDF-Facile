/* DocFix 1.9.48 - safe two blue cards stacked on a dark textile desk.
 * This is a REVIEW-ONLY detector for a common WhatsApp layout:
 * TS/CF rear above CIE back, each landscape ID-1; not a physical-edge proof.
 * No personal data or pixels are persisted. Sources are never altered.
 */
(()=>{'use strict';
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 function median(a){const s=[...a].sort((a,b)=>a-b);return s[Math.floor(s.length/2)]||0;}
 function regionMedian(d,w,h,x0,x1,y0,y1){
  const arr=[[],[],[]];
  for(let y=clamp(Math.round(y0),0,h-1);y<clamp(Math.round(y1),1,h);y+=2)
   for(let x=clamp(Math.round(x0),0,w-1);x<clamp(Math.round(x1),1,w);x+=3){
    const k=(y*w+x)*4;for(let c=0;c<3;c++)arr[c].push(d[k+c]);
   }
  return arr.map(median);
 }
 function analyzeRGBA(d,w,h){
  if(!d||w<100||h<135||d.length<w*h*4||h/w<1.13||h/w>2.72)return null;
  const beginX=Math.round(w*.025),endX=Math.round(w*.975);
  const mask=new Uint8Array(w*h),row=new Float32Array(h);
  for(let y=0;y<h;y++){
   let active=0,total=0;
   for(let x=beginX;x<endX;x++){
    const k=(y*w+x)*4,r=d[k],g=d[k+1],b=d[k+2];
    // Neutral carpet/desk remains near-zero; both blue ID-1 designs survive.
    const blue=(b-r>10&&g-r>5&&b-g>-18&&b>62&&b<245);
    mask[y*w+x]=Number(blue);active+=Number(blue);total++;
   }
   row[y]=active/Math.max(1,total);
  }
  const threshold=.11;
  const on=Array.from(row,v=>v>threshold);
  // Fill only 1-2 row holes: do not bridge the physical gap between cards.
  for(let pass=0;pass<2;pass++)for(let y=1;y<h-1;y++)
   if(!on[y]&&on[y-1]&&on[y+1])on[y]=true;
  const runs=[];let start=-1;
  for(let y=0;y<=h;y++){
   if(y<h&&on[y]){if(start<0)start=y;}
   else if(start>=0){
    const span=y-start;
    if(span>=h*.115&&span<=h*.55){
     let sum=0;for(let k=start;k<y;k++)sum+=row[k];
     if(sum/span>.19)runs.push({start,end:y-1,span,activity:sum/span});
    }
    start=-1;
   }
  }
  if(runs.length!==2)return null;
  const [first,second]=runs;
  const gap=second.start-first.end-1;
  if(gap<h*.024||gap>h*.19)return null;
  // An internal white graphic stripe is not a second plastic card.
  // The seam should resemble the surrounding desk/carpet, not bright paper.
  const seam=regionMedian(d,w,h,w*.13,w*.87,first.end+2,second.start-1);
  const desk=regionMedian(d,w,h,w*.13,w*.87,h*.87,h*.975);
  if(Math.hypot(seam[0]-desk[0],seam[1]-desk[1],seam[2]-desk[2])>45)return null;
  if((seam[0]+seam[1]+seam[2])/3>211)return null;
  function horizontalBounds(run){
   const xs=[];
   for(let y=run.start;y<=run.end;y++)
    for(let x=beginX;x<endX;x++)if(mask[y*w+x])xs.push(x);
   if(xs.length<w*run.span*.08)return null;
   xs.sort((a,b)=>a-b);
   return {x0:xs[Math.floor(xs.length*.010)],x1:xs[Math.floor(xs.length*.990)]};
  }
  function candidate(run,idx){
   const xs=horizontalBounds(run);if(!xs)return null;
   const cardW=xs.x1-xs.x0;
   if(cardW<w*.42||cardW>w*.96)return null;
   const targetH=cardW/1.586;
   if(run.span>targetH*1.09||run.span<targetH*.34)return null;
   // Tiny coloured card header above the primary printed block belongs
   // to that same card, but cannot count as a third independent card.
   let headerTop=null;
   const scanFrom=Math.max(0,Math.round(run.start-targetH*.27));
   for(let y=scanFrom;y<run.start-2;y++){
    if(row[y]>.27){
     let last=y;while(last+1<run.start-1&&row[last+1]>.19)last++;
     if(last-y+1>=Math.max(2,h*.010)&&run.start-last<=targetH*.27){
      headerTop=y;break;
     }
     y=last;
    }
   }
   let top=headerTop!==null?headerTop:run.start-Math.max(2,targetH*.058);
   let bottom=Math.max(run.end+targetH*.042,top+targetH);
   // Bound the two outer edges by the observed neutral physical seam.
   const seamMid=(first.end+second.start)/2;
   if(idx===0)bottom=Math.min(bottom,seamMid-targetH*.013);
   else top=Math.max(top,seamMid+targetH*.013);
   const padX=Math.max(3,cardW*.065),padY=Math.max(2,targetH*.024);
   const left=clamp(xs.x0-padX,1,w-2),right=clamp(xs.x1+padX,2,w-1);
   const y0=clamp(top-padY,1,h-2),y1=clamp(bottom+padY,2,h-1);
   const width=right-left,height=y1-y0,ratio=width/Math.max(1,height),area=width*height/(w*h);
   if(ratio<1.32||ratio>2.05||area<.034||area>.55)return null;
   return {status:'found',confidence:.71,physicallyVerified:false,
    needsReview:true,method:'stacked-blue-ID1-pair-provisional',
    quad:[{x:left/w,y:y0/h},{x:right/w,y:y0/h},
     {x:right/w,y:y1/h},{x:left/w,y:y1/h}],
    box:{x:left/w,y:y0/h,width:width/w,height:height/h},splitSlot:idx};
  }
  const cards=[candidate(first,0),candidate(second,1)];
  if(cards.some(c=>!c))return null;
  const [a,b]=cards.map(c=>c.box);
  if(a.y+a.height>b.y+.012)return null;
  const centerDiff=Math.abs(a.x+a.width/2-b.x-b.width/2);
  const widthRatio=Math.max(a.width,b.width)/Math.max(.001,Math.min(a.width,b.width));
  if(centerDiff>.20||widthRatio>1.50)return null;
  return {cards,provisional:true,verified:false,reason:'due ID-1 sovrapposte; controlla i quattro angoli di entrambe',
   method:'stacked-blue-ID1-pair-provisional'};
 }
 function detect(original){
  const scan=window.DocFixScanner;
  if(!scan?.resize||!original?.width||!original?.height)return null;
  let sample=null;
  try{
   sample=scan.resize(original,520);
   const w=sample.width,h=sample.height;
   const d=sample.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
   const candidate=analyzeRGBA(d,w,h);
   if(!candidate||candidate.cards.some(c=>!scan.validQuad(c.quad)))return null;
   if(window.DocFixPairProof?.geometry?.(original,candidate.cards)?.ok!==true)return null;
   return candidate;
  }catch(error){console.warn('DocFix: doppia tessera azzurra',error);return null;}
  finally{if(sample&&sample!==original)sample.width=sample.height=1;}
 }
 window.DocFixStackedBluePair=Object.freeze({analyzeRGBA,detect,version:'1.9.48-candidate'});
})();