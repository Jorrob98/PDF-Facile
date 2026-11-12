/* DocFix 1.9.33: distinguish an entire declaration/A4 sheet from card pairs.
 * Photo pixels stay local; only a scratch thumbnail is inspected.
 */
(()=>{'use strict';
function analyzeRGBA(data,w,h){
 if(!data||data.length<w*h*4||w<220||h<220)return {page:false,reason:'image size'};
 const ratio=Math.max(w,h)/Math.min(w,h);
 if(ratio<1.30||ratio>1.51)return {page:false,reason:'not A4-like'};
 const nx=5,ny=5,white=new Uint16Array(nx*ny),total=new Uint16Array(nx*ny);
 const longSideIsVertical=h>=w;
 let light=0,count=0,ink=0;
 const inkRows=new Uint16Array(longSideIsVertical?h:w);
 const rowTotal=new Uint16Array(inkRows.length);
 for(let y=Math.floor(h*.08);y<h*.92;y+=3)
  for(let x=Math.floor(w*.08);x<w*.92;x+=3){
   const k=(y*w+x)*4,r=data[k],g=data[k+1],b=data[k+2];
   const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
   const paper=lo>=184&&hi-lo<=31;
   const tx=Math.min(nx-1,Math.floor((x/w-.08)/.84*nx));
   const ty=Math.min(ny-1,Math.floor((y/h-.08)/.84*ny));
   const c=ty*nx+tx;
   white[c]+=Number(paper);total[c]++;
   light+=paper;count++;
   const black=hi<140;ink+=black;
   const row=longSideIsVertical?y:x;
   inkRows[row]+=Number(black);rowTotal[row]++;
  }
 const fraction=light/Math.max(1,count);
 const coverage=Array.from(white,(v,i)=>v/Math.max(1,total[i]));
 const cells=coverage.filter(v=>v>=.59).length,central=coverage[12];
 if(fraction<.69||central<.60||cells<17)
  return {page:false,reason:'not broad neutral paper',fraction,cells};
 const density=ink/Math.max(1,count);
 let bands=0,inside=false;
 for(let i=Math.floor(inkRows.length*.10);i<inkRows.length*.90;i++){
  const active=rowTotal[i]>0&&inkRows[i]/rowTotal[i]>.045;
  if(active&&!inside){bands++;inside=true;}
  if(!active)inside=false;
 }
 const strong=fraction>=.84&&cells>=22;
 const page=(strong&&density<.28)||(fraction>=.72&&cells>=18&&bands>=6&&density<.25);
 return {page,reason:page?'A4 / declaration visual layout':'inconclusive text bands',
  fraction,cells,bands,density};
}
function detect(original){
 const scan=window.DocFixScanner;
 if(!original||!scan?.resize)return {page:false,reason:'scanner unavailable'};
 let small;
 try{
  small=scan.resize(original,550);
  const c=small.getContext('2d',{willReadFrequently:true});
  return analyzeRGBA(c.getImageData(0,0,small.width,small.height).data,small.width,small.height);
 }catch(error){
  console.warn('DocFix: A4 guard skipped',error);
  return {page:false,reason:'guard error'};
 }finally{if(small&&small!==original)small.width=small.height=1;}
}
window.DocFixPageGuard=Object.freeze({analyzeRGBA,detect,version:'1.9.33'});
})();