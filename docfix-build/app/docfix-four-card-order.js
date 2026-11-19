/* DocFix: conservatively recognize the four physically separate cards
 * from two source photos. Never invent "front/back" from page positions.
 * Source photos remain local. If evidence is insufficient, do not label.
 */
(()=>{'use strict';
function inspectRGBA(data,w,h){
 if(!data||data.length<w*h*4||w<60||h<40)return null;
 let blue=0,total=0,darkRows=[],peak=0;
 for(let y=3;y<h-3;y++){
  let dark=0,pixels=0;
  for(let x=3;x<w-3;x++){
   const k=(y*w+x)*4,r=data[k],g=data[k+1],b=data[k+2];
   if(b>r+9&&g>r+4)blue++;
   if(Math.max(r,g,b)<98)dark++;
   pixels++;total++;
  }
  darkRows.push(dark/Math.max(1,pixels));
 }
 const maxY=Math.min(darkRows.length,Math.floor(h*.58));
 const minY=Math.max(0,Math.floor(h*.06));
 for(let y=minY;y<maxY-3;y++){
  const m=(darkRows[y]+darkRows[y+1]+darkRows[y+2]+darkRows[y+3])/4;
  if(m>peak)peak=m;
 }
 return {blue:blue/Math.max(1,total),darkBand:peak};
}
function inspect(canvas){
 if(!canvas?.width||!canvas?.height)return null;
 const w=220,h=140;
 let sample=null;
 try{
  // Read the displayed perspective crop only; no OCR, no identity data.
  sample=document.createElement('canvas');sample.width=w;sample.height=h;
  const ctx=sample.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(canvas,0,0,w,h);
  return inspectRGBA(ctx.getImageData(0,0,w,h).data,w,h);
 }catch(error){return null;}finally{if(sample)sample.width=sample.height=1;}
}
function plan(entries,provided){
 if(!Array.isArray(entries)||entries.length!==4)return null;
 const sources=[...new Set(entries.map(e=>e.sourceIndex))];
 if(sources.length!==2||sources.some(id=>entries.filter(e=>e.sourceIndex===id).length!==2))return null;
 const items=entries.map((e,i)=>({e,i,stats:provided?.[i]||inspect(e.processed)}));
 if(items.some(x=>!x.stats))return null;
 const stripes=items.filter(x=>x.stats.darkBand>.77);
 if(stripes.length!==1)return null;
 const tsBack=stripes[0],backSource=tsBack.e.sourceIndex;
 const cieBack=items.find(x=>x.e.sourceIndex===backSource&&x!==tsBack);
 const fronts=items.filter(x=>x.e.sourceIndex!==backSource);
 if(!cieBack||fronts.length!==2)return null;
 fronts.sort((a,b)=>b.stats.blue-a.stats.blue);
 const [tsFront,cieFront]=fronts;
 if(tsFront.stats.blue<.42||tsFront.stats.blue-cieFront.stats.blue<.12 ||
    cieBack.stats.darkBand>.63||cieFront.stats.darkBand>.68)return null;
 const ordered=[cieFront,cieBack,tsFront,tsBack];
 if(new Set(ordered.map(x=>x.i)).size!==4)return null;
 return {indices:ordered.map(x=>x.i),
  labels:['Carta identità · fronte','Carta identità · retro',
          'Tessera sanitaria · fronte','Tessera sanitaria · retro'],
  confidence:'source-layout-and-distinct-color-bands'};
}
window.DocFixFourCardOrder=Object.freeze({inspectRGBA,plan});
})();