/* DocFix Desktop 1.9.7 — Source-first, one-transform card extraction.
   The intermediate two-up rectangles are used ONLY for locating a document.
   The final output is sampled once from the untouched source canvas.
   Ambiguous borders never count as a successful automatic crop. */
(()=>{'use strict';
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 function median(a){const sorted=a.slice().sort((x,y)=>x-y);return sorted[Math.floor(sorted.length/2)]||0;}
 function shape(q,w,h){
  const pts=q.map(p=>({x:p.x*w,y:p.y*h})),side=(a,b)=>Math.hypot(pts[a].x-pts[b].x,pts[a].y-pts[b].y);
  const width=(side(0,1)+side(2,3))/2,height=(side(0,3)+side(1,2))/2;
  return width/Math.max(1,height);
 }
 // Region sampled from the untouched original. Its pixels are never exported.
 function region(original,rough){
  const bb={x:Math.min(...rough.map(p=>p.x)),y:Math.min(...rough.map(p=>p.y)),r:Math.max(...rough.map(p=>p.x)),b:Math.max(...rough.map(p=>p.y))};
  const x0=clamp(bb.x-(bb.r-bb.x)*.07,0,1),x1=clamp(bb.r+(bb.r-bb.x)*.07,0,1),
        y0=clamp(bb.y-(bb.b-bb.y)*.09,0,1),y1=clamp(bb.b+(bb.b-bb.y)*.09,0,1);
  const sw=original.width*(x1-x0),sh=original.height*(y1-y0),scale=Math.min(1,760/Math.max(sw,sh));
  const w=Math.max(120,Math.round(sw*scale)),h=Math.max(90,Math.round(sh*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;
  c.getContext('2d',{alpha:false}).drawImage(original,x0*original.width,y0*original.height,sw,sh,0,0,w,h);
  return {canvas:c,x0,x1,y0,y1};
 }
 function colorCandidate(c){
  const w=c.width,h=c.height;
  if(w<120||h<90)return null;
  const d=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const rgb=(x,y)=>{const k=(clamp(y,0,h-1)*w+clamp(x,0,w-1))*4;return [d[k],d[k+1],d[k+2]]};
  // Prefer the perimeter strip with the lowest texture/variance.
  const strips=[
   {id:'right',samples:[]},{id:'left',samples:[]},
   {id:'top',samples:[]},{id:'bottom',samples:[]}
  ];
  for(let y=4;y<h-4;y+=3)for(let x=4;x<w-4;x+=3){
   if(x>=w*.88)strips[0].samples.push(rgb(x,y));
   if(x<=w*.12)strips[1].samples.push(rgb(x,y));
   if(y<=h*.12)strips[2].samples.push(rgb(x,y));
   if(y>=h*.88)strips[3].samples.push(rgb(x,y));
  }
  for(const s of strips){
   s.ref=[0,1,2].map(k=>median(s.samples.map(p=>p[k])));
   const errors=s.samples.map(p=>dist(p,s.ref));
   s.spread=median(errors);s.percentile=errors.sort((a,b)=>a-b)[Math.floor(errors.length*.70)]||0;
   s.score=s.spread+(s.percentile*.65);
  }
  strips.sort((a,b)=>a.score-b.score);
  // The background must be reasonably coherent: otherwise no confident segmentation.
  const bg=strips[0];if(!bg||bg.spread>45)return null;
  const threshold=clamp(Math.max(26,bg.percentile*1.5+10),26,63);
  const binary=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const p=rgb(x,y);
   // Brightness and RGB chromatic differences are both useful for blue and pink documents.
   const dr=p[0]-bg.ref[0],dg=p[1]-bg.ref[1],db=p[2]-bg.ref[2];
   const bright=Math.abs(.299*dr+.587*dg+.114*db);
   const chroma=Math.hypot(dr-dg,db-dg);
   binary[y*w+x]=(bright*.80+chroma*.65)>threshold?1:0;
  }
  // A 7 x 7 majority filter suppresses single printed glyphs and textured-floor noise.
  const stride=w+1,integ=new Uint32Array((w+1)*(h+1));
  for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=binary[y*w+x];integ[(y+1)*stride+x+1]=integ[y*stride+x+1]+row;}}
  function density(x0,y0,x1,y1){const n=integ[(y1+1)*stride+x1+1]-integ[y0*stride+x1+1]-integ[(y1+1)*stride+x0]+integ[y0*stride+x0];return n/Math.max(1,(x1-x0+1)*(y1-y0+1));}
  const clean=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)clean[y*w+x]=density(Math.max(0,x-3),Math.max(0,y-3),Math.min(w-1,x+3),Math.min(h-1,y+3))>.42?1:0;
  // Largest connected foreground component; prevent a stray printed strip from winning.
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
  let best=null;
  for(let i=0;i<clean.length;i++){
   if(!clean[i]||seen[i])continue;
   let head=0,tail=1;queue[0]=i;seen[i]=1;
   let xlo=w,ylo=h,xhi=0,yhi=0;
   while(head<tail){
    const k=queue[head++],x=k%w,y=(k/w)|0;
    xlo=Math.min(xlo,x);xhi=Math.max(xhi,x);ylo=Math.min(ylo,y);yhi=Math.max(yhi,y);
    for(const n of [k-1,k+1,k-w,k+w]){
     if(n<0||n>=clean.length||seen[n]||!clean[n])continue;
     if(Math.abs(n-k)===1&&Math.floor(n/w)!==y)continue;
     seen[n]=1;queue[tail++]=n;
    }
   }
   const bw=xhi-xlo+1,bh=yhi-ylo+1,ratio=bw/Math.max(1,bh),fraction=tail/(w*h),fill=tail/(bw*bh);
   if(fraction<.16||fraction>.86||ratio<1.33||ratio>1.89||fill<.42||bw<w*.46||bh<h*.30)continue;
   const score=tail/(w*h)*Math.min(1,fill*1.5)-Math.abs(ratio-1.586)*.20;
   if(!best||score>best.score)best={xlo,ylo,xhi,yhi,ratio,fraction,fill,score};
  }
  if(!best)return null;
  const p=Math.max(1,Math.round(Math.min(w,h)*.007));
  const q=[
   {x:clamp((best.xlo-p)/w,0,1),y:clamp((best.ylo-p)/h,0,1)},
   {x:clamp((best.xhi+p)/w,0,1),y:clamp((best.ylo-p)/h,0,1)},
   {x:clamp((best.xhi+p)/w,0,1),y:clamp((best.yhi+p)/h,0,1)},
   {x:clamp((best.xlo-p)/w,0,1),y:clamp((best.yhi+p)/h,0,1)}
  ];
  return {quad:q,confidence:.81,method:'one-pass-background-segmentation',score:best.score,component:best};
 }
 function mapFromLeftTurn(q){return q.map(p=>({x:1-p.y,y:p.x}));}
 function detect(original,rough,{rotatedLeft=false,auditEnabled=false,format='card'}={}){
  const scan=window.DocFixScanner;if(!scan?.validQuad?.(rough))return null;
  const roi=region(original,rough),raw=roi.canvas,choices=[];
  // A 3-up WhatsApp photo can contain sideways cards. Rotate only the
  // temporary ROI, not the uploaded source or the saved crop coordinates.
  const turned=rotatedLeft&&raw.height>raw.width*1.10;
  let c=raw;
  if(turned){
   c=document.createElement('canvas');c.width=raw.height;c.height=raw.width;
   const g=c.getContext('2d',{alpha:false,willReadFrequently:true});
   g.translate(0,raw.width);g.rotate(-Math.PI/2);g.drawImage(raw,0,0);
  }
  const release=()=>{if(c!==raw)c.width=c.height=1;raw.width=raw.height=1;};
  const add=(obj,origin)=>{
   if(!obj?.quad||!scan.validQuad(obj.quad))return;
   const ratio=shape(obj.quad,c.width,c.height),coverage=scan.area(obj.quad);
   if(ratio<1.35||ratio>1.90||coverage<.18||coverage>.96)return;
   const img=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;
   const support=window.DocFixGroup1?.edgeSupport?.(obj.quad.map(p=>({x:p.x*c.width,y:p.y*c.height})),img,c.width,c.height);
   if(!support)return;
   // Conservative four-edge audit is opt-in for a new scan; the previous
   // engine remains exactly selectable through the compatibility setting.
   const audited=auditEnabled?window.DocFixQuadAudit?.inspectCanvas?.(c,obj.quad,{format}):null;
   if(auditEnabled&&!audited?.verified)return;
   if(!auditEnabled&&(support.sidesOk<3||support.strength<17.5))return;
   const physical=(obj.method||'').includes('physical')?1:0;
   const score=audited?.verified
     ?audited.score+support.sidesOk*1.1
     :support.strength*.45+support.sidesOk*6-Math.abs(ratio-1.586)*24+Math.min(.8,coverage)*5+physical*2;
   choices.push({quad:audited?.verified?audited.quad:obj.quad,score,
    confidence:audited?.verified?audited.confidence:Math.min(.94,.76+support.sidesOk*.04),
    method:(audited?.verified?'quad-audit / ':'')+origin+' / '+(obj.method||''),
    support:audited?.verified?audited.support:support,ratio,
    physicallyVerified:audited?.verified===true});
  };
  try{
   add(window.DocFixGroup1?.candidateFromBackground?.(c),'original-background');
   add(window.DocFixPhysicalEdges?.detect?.(c),'original-edges');
   add(colorCandidate(c),'original-color');
   // This detector may locate contours but never defines the output by itself.
   for(const candidate of (scan.detectAll?.(c)||[]).slice(0,5))add(candidate,'original-contour');
  }catch(err){console.warn('DocFix single-pass analysis failed',err);}
  choices.sort((a,b)=>b.score-a.score);
  const best=choices[0]||null;
  if(!best){release();return null;}
  const mapped=turned?mapFromLeftTurn(best.quad):best.quad;
  const quad=mapped.map(p=>({x:roi.x0+p.x*(roi.x1-roi.x0),y:roi.y0+p.y*(roi.y1-roi.y0)}));
  release();
  if(!scan.validQuad(quad))return null;
  // An expanded search region must never take the card belonging to the other half.
  const center={x:quad.reduce((sum,p)=>sum+p.x,0)/4,y:quad.reduce((sum,p)=>sum+p.y,0)/4};
  const bounds={x0:Math.min(...rough.map(p=>p.x)),y0:Math.min(...rough.map(p=>p.y)),x1:Math.max(...rough.map(p=>p.x)),y1:Math.max(...rough.map(p=>p.y))};
  if(center.x<bounds.x0-.025||center.x>bounds.x1+.025||center.y<bounds.y0-.025||center.y>bounds.y1+.025)return null;
  return {quad,verified:true,confidence:best.confidence,method:best.method,support:best.support,score:best.score};
 }
 window.DocFixOnePass=Object.freeze({detect,detectColorRect:colorCandidate,mapFromLeftTurn,version:'source-first-1.9.29'});
})();