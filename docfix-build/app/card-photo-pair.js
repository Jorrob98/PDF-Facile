/* DocFix: source-image rescue for two aligned plastic cards.
 * Returns TWO provisional quadrilaterals, never physical edge proof.
 * Only scratch pixels are sampled; the original image is never modified.
 */
(()=>{'use strict';
function detect(original){
 const scan=window.DocFixScanner;
 if(!scan?.resize||!original?.width||!original?.height)return null;
 const aspect=original.height/original.width;
 if(aspect<1.18||aspect>2.55)return null;
 let tmp=null;
 try{
  tmp=scan.resize(original,460);
  const w=tmp.width,h=tmp.height;
  if(w<95||h<170)return null;
  const data=tmp.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const diff=(x,y,xx,yy)=>{
   const a=(y*w+x)*4,b=(yy*w+xx)*4;
   return Math.hypot(data[a]-data[b],data[a+1]-data[b+1],data[a+2]-data[b+2]);
  };
  const xEdge=new Float32Array(w);
  for(let x=3;x<w-3;x++){
   let sum=0,count=0;
   for(let y=Math.round(h*.18);y<Math.round(h*.72);y+=2){
    sum+=diff(x-2,y,x+2,y);count++;
   }
   xEdge[x]=sum/Math.max(1,count);
  }
  const smooth=(src,pos,radius)=>{
   let sum=0,count=0;
   for(let z=-radius;z<=radius;z++){
    const k=pos+z;if(k>=0&&k<src.length){sum+=src[k];count++;}
   }
   return sum/Math.max(1,count);
  };
  const sx=new Float32Array(w);
  for(let x=4;x<w-4;x++)sx[x]=smooth(xEdge,x,2);
  const median=values=>{
   const v=[...values].sort((a,b)=>a-b);
   return v[v.length>>1]||0;
  };
  const ambient=median(sx.slice(Math.round(w*.15),Math.round(w*.85)));
  let bestX=null;
  for(let l=Math.round(w*.09);l<=Math.round(w*.38);l++){
   for(let r=Math.round(w*.59);r<=Math.round(w*.91);r++){
    const width=r-l;if(width<w*.43||width>w*.80)continue;
    const score=sx[l]+sx[r];
    if(!bestX||score>bestX.score)bestX={l,r,score};
   }
  }
  if(!bestX||sx[bestX.l]<Math.max(16,ambient*1.50)||
     sx[bestX.r]<Math.max(16,ambient*1.50))return null;
  const left=bestX.l,right=bestX.r,width=right-left;
  const yEdge=new Float32Array(h);
  const lowX=left+Math.round(width*.09),highX=right-Math.round(width*.09);
  for(let y=3;y<h-3;y++){
   const values=[];
   for(let x=lowX;x<=highX;x+=2)values.push(diff(x,y-2,x,y+2));
   values.sort((a,b)=>a-b);
   yEdge[y]=values[Math.floor(values.length*.4)]||0;
  }
  const sy=new Float32Array(h);
  for(let y=4;y<h-4;y++)sy[y]=smooth(yEdge,y,1);
  const baseY=median(sy.slice(Math.round(h*.13),Math.round(h*.80)));
  const expected=width/1.58,minH=Math.round(expected*.72),maxH=Math.round(expected*1.32);
  if(minH<18||maxH>h*.45)return null;
  const first=[];
  for(let top=Math.round(h*.13);top<=Math.round(h*.42);top++){
   for(let height=minH;height<=maxH;height++){
    const end=top+height;if(end>=h*.69)continue;
    first.push({top,end,score:sy[top]+sy[end]-Math.abs(height-expected)*.48});
   }
  }
  first.sort((a,b)=>b.score-a.score);
  const finals=[];
  for(const a of first.slice(0,42)){
   for(let start=Math.max(a.end-2,Math.round(h*.31));
       start<=Math.min(a.end+Math.round(h*.085),Math.round(h*.76));start++){
    for(let height=minH;height<=maxH;height++){
     const end=start+height;if(end>h*.86)continue;
     const score=a.score+sy[start]+sy[end]-Math.abs(height-expected)*.48-
       Math.max(0,start-a.end-5)*.30;
     if(finals.length<3||score>finals[finals.length-1].score){
      finals.push({top:a.top,middleA:a.end,middleB:start,bottom:end,score});
      finals.sort((u,v)=>v.score-u.score);finals.length=Math.min(3,finals.length);
     }
    }
   }
  }
  if(!finals.length)return null;
  // An A4 declaration may have printed horizontal text rows. A true card
  // division also changes pixels right near both outside plastic edges.
  const sideEdge=(y)=>{
   const t=Math.max(2,Math.min(h-3,y));
   const cols=[.03,.07,.93,.97].map(f=>Math.round(left+width*f));
   const v=cols.map(x=>diff(x,t-2,x,t+2));
   return Math.min((v[0]+v[1])/2,(v[2]+v[3])/2);
  };
  const qualified=finals.filter(p=>
   Math.max(sideEdge(p.middleA),sideEdge(p.middleB))>=22&&
   sideEdge(p.top)>=18&&sideEdge(p.bottom)>=18);
  if(!qualified.length)return null;
  const p=qualified[0],required=Math.max(22,baseY*1.40);
  if(sy[p.top]<required||sy[p.bottom]<required||
     Math.max(sy[p.middleA],sy[p.middleB])<required)return null;
  const cards=[[p.top,p.middleA],[p.middleB,p.bottom]].map(([y0,y1],slot)=>{
   const padX=Math.max(1,Math.round(w*.008)),padY=Math.max(1,Math.round(h*.006));
   const x0=Math.max(2,left-padX)/w,x1=Math.min(w-2,right+padX)/w;
   const top=Math.max(2,y0-padY)/h,bottom=Math.min(h-2,y1+padY)/h;
   return {quad:[{x:x0,y:top},{x:x1,y:top},{x:x1,y:bottom},{x:x0,y:bottom}],
    status:'found',confidence:.68,physicallyVerified:false,
    method:'two-card-horizontal-border-rescue',splitSlot:slot,
    box:{x:x0,y:top,width:x1-x0,height:bottom-top}};
  });
  const geometry=window.DocFixPairProof?.geometry?.(original,cards);
  if(!geometry?.ok)return null;
  return {cards,verified:false,provisional:true,
   reason:'quattro lati di ogni tessera da verificare'};
 }catch(error){
  console.warn('DocFix: recupero rettangoli fotografati',error);return null;
 }finally{
  if(tmp&&tmp!==original)tmp.width=tmp.height=1;
 }
}
window.DocFixPhotoPair=Object.freeze({detect,version:'1.9.39'});
})();