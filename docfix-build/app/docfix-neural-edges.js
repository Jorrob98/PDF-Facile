/* DocFix 1.9.60 Bordi v2: local DocAligner corner proposal only.
 * Model and WASM are bundled in app.asar; no cloud / remote URLs.
 * A neural prediction is NEVER proof of a physical outline or permission
 * to export a PDF. All pixels for final crop remain on the original canvas.
 * DocAligner: Apache-2.0; quadscan orchestration reference: MIT. */
(()=>{'use strict';
 const BASE='./vendor/docfix-ml/';
 const MODEL=BASE+'lcnet100_h_e_bifpn_256_fp32.onnx';
 const HEATMAP=128,INPUT=256;
 let loader=null,session=null,failed=false;
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const area=q=>Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
 function orderPoints(points){
  if(!Array.isArray(points)||points.length!==4||points.some(p=>!finite(p?.x)||!finite(p?.y)))return null;
  const sums=points.map(p=>p.x+p.y),diffs=points.map(p=>p.x-p.y);
  const indices=[sums.indexOf(Math.min(...sums)),diffs.indexOf(Math.max(...diffs)),
   sums.indexOf(Math.max(...sums)),diffs.indexOf(Math.min(...diffs))];
  if(new Set(indices).size!==4)return null;
  const q=indices.map(i=>({...points[i]}));
  const cross=q.map((p,i)=>{
   const b=q[(i+1)%4],c=q[(i+2)%4];
   return (b.x-p.x)*(c.y-b.y)-(b.y-p.y)*(c.x-b.x);
  });
  return cross.every(v=>v>1e-7)?q:null;
 }
 function decodeHeatmap(data,width,height,{floor=.15}={}){
  if(!data||data.length<4*HEATMAP*HEATMAP||!(width>0&&height>0))return null;
  const found=[],plane=HEATMAP*HEATMAP;
  for(let c=0;c<4;c++){
   const off=c*plane;let index=-1,peak=-Infinity;
   for(let i=0;i<plane;i++){const v=data[off+i];if(finite(v)&&v>peak){peak=v;index=i;}}
   if(index<0||peak<floor)return null;
   const px=index%HEATMAP,py=Math.floor(index/HEATMAP),radius=4,threshold=peak*.3;
   let sx=0,sy=0,sw=0;
   for(let y=Math.max(0,py-radius);y<=Math.min(HEATMAP-1,py+radius);y++)
    for(let x=Math.max(0,px-radius);x<=Math.min(HEATMAP-1,px+radius);x++){
     const v=data[off+y*HEATMAP+x];
     if(v>=threshold){sx+=x*v;sy+=y*v;sw+=v;}
    }
   const cx=sw>0?sx/sw:px,cy=sw>0?sy/sw:py;
   found.push({x:cx/HEATMAP*width,y:cy/HEATMAP*height,confidence:peak});
  }
  const quad=orderPoints(found);
  return quad?{quad,confidence:Math.min(...found.map(p=>p.confidence))}:null;
 }
 function bounds(q){const xs=q.map(p=>p.x),ys=q.map(p=>p.y);
  return {x:Math.min(...xs),y:Math.min(...ys),r:Math.max(...xs),b:Math.max(...ys)};}
 function validQuad(q,format='card'){
  if(!Array.isArray(q)||q.length!==4||q.some(p=>!finite(p?.x)||!finite(p?.y)||p.x<=.003||p.y<=.003||p.x>=.997||p.y>=.997))return false;
  const a=area(q);if(a<.025||a>.90)return false;
  const lens=q.map((p,i)=>dist(p,q[(i+1)%4]));
  const ratio=Math.max((lens[0]+lens[2])/(lens[1]+lens[3]),(lens[1]+lens[3])/(lens[0]+lens[2]));
  if(format==='card'&&(ratio<1.28||ratio>2.02))return false;
  if(lens.some(n=>n<.035))return false;
  const cross=q.map((p,i)=>{
   const b=q[(i+1)%4],c=q[(i+2)%4];
   return (b.x-p.x)*(c.y-b.y)-(b.y-p.y)*(c.x-b.x);
  });
  return cross.every(v=>v>1e-7);
 }
 function overlap(a,b){
  const x=Math.max(0,Math.min(a.r,b.r)-Math.max(a.x,b.x));
  const y=Math.max(0,Math.min(a.b,b.b)-Math.max(a.y,b.y));
  const union=(a.r-a.x)*(a.b-a.y)+(b.r-b.x)*(b.b-b.y)-x*y;
  return union>0?x*y/union:0;
 }
 // Keep a candidate within its own source ROI: an adjacent document may
 // not steal the centre or create a phantom page.
 function acceptProposal(rough,proposal,{format='card'}={}){
  if(!validQuad(proposal,format))return false;
  if(!rough)return true;
  if(!validQuad(rough,'document'))return false;
  const a=area(rough),b=area(proposal),ratio=b/a;
  if(ratio<.48||ratio>1.46)return false;
  if(overlap(bounds(rough),bounds(proposal))<.44)return false;
  const bound=bounds(rough),cx=(bound.x+bound.r)/2,cy=(bound.y+bound.b)/2;
  const midpoint=proposal.reduce((s,p)=>({x:s.x+p.x/4,y:s.y+p.y/4}),{x:0,y:0});
  const limit=Math.max(bound.r-bound.x,bound.b-bound.y)*.24;
  if(dist(midpoint,{x:cx,y:cy})>limit)return false;
  return true;
 }
 function roiOf(source,rough){
  if(!rough)return {x:0,y:0,w:source.width,h:source.height};
  const b=bounds(rough),bw=b.r-b.x,bh=b.b-b.y;
  const x0=clamp(b.x-.23*bw,0,1),y0=clamp(b.y-.23*bh,0,1);
  const x1=clamp(b.r+.23*bw,0,1),y1=clamp(b.b+.23*bh,0,1);
  return {x:x0*source.width,y:y0*source.height,
   w:(x1-x0)*source.width,h:(y1-y0)*source.height};
 }
 function appendLocalRuntime(){
  if(window.ort?.InferenceSession)return Promise.resolve(window.ort);
  return new Promise((resolve,reject)=>{
   const s=document.createElement('script');s.src=BASE+'ort.min.js';
   s.async=true;s.crossOrigin='anonymous';
   s.onload=()=>window.ort?.InferenceSession?resolve(window.ort):reject(Error('Runtime ONNX non disponibile'));
   s.onerror=()=>reject(Error('Runtime ONNX locale mancante'));
   document.head.appendChild(s);
  });
 }
 async function getSession(){
  if(session)return session;
  if(failed)return null;
  if(loader)return loader;
  loader=(async()=>{
   const ort=await appendLocalRuntime();
   // One CPU thread works in sandboxed Electron with no dependency on
   // COOP/COEP, WebGPU, remote workers, or external services.
   ort.env.wasm.numThreads=1;
   ort.env.wasm.wasmPaths=new URL(BASE,window.location.href).href;
   const response=await fetch(MODEL,{cache:'no-store',credentials:'omit'});
   if(!response.ok)throw Error('Modello ONNX locale assente ('+response.status+')');
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes.byteLength<1000000)throw Error('Modello ONNX incompleto');
   session=await ort.InferenceSession.create(bytes,{
    executionProviders:['wasm'],graphOptimizationLevel:'all'
   });
   if(!session?.inputNames?.length||!session?.outputNames?.length)throw Error('Modello ONNX non valido');
   return session;
  })().catch(error=>{
   failed=true;
   console.warn('DocFix ML offline non disponibile; ripristino analisi geometrica',String(error?.message||error));
   return null;
  }).finally(()=>{loader=null;});
  return loader;
 }
 async function infer(source,roi){
  const engine=await getSession();if(!engine)return null;
  const temp=document.createElement('canvas');temp.width=INPUT;temp.height=INPUT;
  const g=temp.getContext('2d',{alpha:false,willReadFrequently:true});
  if(!g)return null;
  g.drawImage(source,roi.x,roi.y,roi.w,roi.h,0,0,INPUT,INPUT);
  const rgba=g.getImageData(0,0,INPUT,INPUT).data;
  const tensor=new Float32Array(INPUT*INPUT*3),plane=INPUT*INPUT;
  for(let i=0;i<plane;i++){
   tensor[i]=rgba[i*4]/255;tensor[i+plane]=rgba[i*4+1]/255;
   tensor[i+2*plane]=rgba[i*4+2]/255;
  }
  temp.width=temp.height=1;
  const output=await engine.run({[engine.inputNames[0]]:new window.ort.Tensor('float32',tensor,[1,3,INPUT,INPUT])});
  const heatmap=output[engine.outputNames[0]]?.data;
  if(!heatmap)return null;
  const result=decodeHeatmap(heatmap,roi.w,roi.h,{floor:.18});
  return result?{quad:result.quad.map(p=>({x:(roi.x+p.x)/source.width,y:(roi.y+p.y)/source.height})),
   confidence:result.confidence}:null;
 }
 // Never mark a neural guess 'verified'. The physical four-edge auditor
 // remains independent, and manual confirmation stays mandatory.
 async function propose(source,rough=null,{format='card'}={}){
  if(!source||source.width<180||source.height<120)return null;
  if(rough&&!validQuad(rough,'document'))return null;
  try{
   const roi=roiOf(source,rough),result=await infer(source,roi);
   if(!result||!acceptProposal(rough,result.quad,{format}))return null;
   let finalQuad=result.quad,independent=false;
   if(window.DocFixProjectedEdges?.refine){
    const fitted=window.DocFixProjectedEdges.refine(source,result.quad);
    if(fitted?.matchedSides===4&&acceptProposal(rough,fitted.quad,{format})){
     const deviation=Math.max(...fitted.quad.map((p,i)=>dist(p,result.quad[i])));
     if(deviation<Math.min(roi.w/source.width,roi.h/source.height)*.075){
      finalQuad=fitted.quad;independent=true;
     }
    }
   }
   return {quad:finalQuad,confidence:clamp(result.confidence,0,.85),
    method:independent?'DocAligner-local + 4 physical edges':'DocAligner-local-candidate',
    matchedSides:independent?4:0,needsReview:true,physicallyVerified:false,
    independent,localOnly:true};
  }catch(error){
   console.warn('DocFix Bordi v2: proposta neurale non applicata',String(error?.message||error));
   return null;
  }
 }
 async function selfTest(){
  const engine=await getSession();
  if(!engine)return {ok:false,reason:'Runtime or model unavailable'};
  try{
   const input=new Float32Array(3*INPUT*INPUT);input.fill(.42);
   const output=await engine.run({[engine.inputNames[0]]:new window.ort.Tensor('float32',input,[1,3,INPUT,INPUT])});
   const data=output[engine.outputNames[0]]?.data;
   return {ok:!!data&&data.length>=4*HEATMAP*HEATMAP,
    tensorLength:data?.length||0,offline:true};
  }catch(error){return {ok:false,reason:String(error?.message||error)};}
 }
 window.DocFixNeuralEdges=Object.freeze({propose,selfTest,decodeHeatmap,orderPoints,acceptProposal,
  validQuad,roiOf,version:'bordi-v2-offline-1.9.60'});
})();
