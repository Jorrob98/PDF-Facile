/* DocFix 1.9.33: distinguish an entire declaration/A4 sheet from card pairs.
 * Photo pixels stay local; only a scratch thumbnail is inspected.
 */
(()=>{'use strict';
// Two separated, card-sized material regions indicate a multi-card photo,
// even when printed black text makes the image appear to be an A4 declaration.
function hasTwoCardMaterialBands(data,w,h){
 const lum=(x,y)=>{
  const k=(y*w+x)*4;
  return .2126*data[k]+.7152*data[k+1]+.0722*data[k+2];
 };
 function bands(axis){
  const length=axis==='y'?h:w,other=axis==='y'?w:h;
  const sample=(l,o)=>axis==='y'?lum(o,l):lum(l,o);
  const a=Math.round(length*.08),b=Math.round(length*.92),center=Math.round(other*.50);
  const edge0=Math.round(other*.10),edge1=Math.round(other*.90);
  const minRun=Math.round(length*.085),minGap=Math.round(length*.065);
  let runs=[],start=-1;
  for(let z=a;z<=b;z++){
   let active=false;
   if(z<b){
    const middle=(sample(z,center)+sample(z,Math.round(other*.44))+
     sample(z,Math.round(other*.56)))/3;
    const left=sample(z,edge0),right=sample(z,edge1);
    active=Math.abs(left-right)<25&&Math.abs(middle-left)>11&&Math.abs(middle-right)>11;
   }
   if(active&&start<0)start=z;
   if(start>=0&&!active){
    if(z-start>=minRun)runs.push({start,end:z});
    start=-1;
   }
  }
  return runs.length===2&&runs[1].start-runs[0].end>=minGap&&
   runs.every(r=>r.end-r.start<=length*.50);
 }
 return bands('y')||bands('x');
}
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
   const neutral=lo>=142&&hi-lo<=34;
   const warm=lo>=145&&r>=g&&g>=b&&r-b<=100&&g-b>=25;
   const paper=neutral||warm;
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
 // Paper-like colours and A4 proportions alone are ambiguous:
 // a light ID card on a white surface can produce the same histogram.
 // In auto mode require text/ink bands before protecting a page.
 // Explicit A4 mode in the UI still preserves blank and unusual sheets.
 const cardBlocks=hasTwoCardMaterialBands(data,w,h);
 const page=!cardBlocks&&fraction>=.68&&central>=.60&&cells>=17&&bands>=4&&
   density>=.006&&density<.28;
 return {page,reason:page?'A4 / declaration visual layout':'inconclusive text bands',
  fraction,cells,bands,density,cardBlocks};
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