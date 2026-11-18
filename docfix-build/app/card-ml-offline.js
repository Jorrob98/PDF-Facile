/* DocFix 1.9.51 EXPERIMENTAL — offline neural corner candidate.
 * DocAligner/Quadscan is always served from 127.0.0.1, never a CDN.
 * This does not verify plastic edges and NEVER approves a PDF by itself.
 * No user images, tensor values, or OCR data leave the PC.
 */
(()=>{'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 let loading=null,engine=null,unavailable=false;
 const asset=name=>new URL('./vendor/quadscan/'+name,location.href).href;
 function quadArea(q){
  return Math.abs(q.reduce((sum,p,i)=>sum+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
 }
 function side(a,b,w,h){return Math.hypot((a.x-b.x)*w,(a.y-b.y)*h);}
 function shape(q,w,h){
  const width=(side(q[0],q[1],w,h)+side(q[2],q[3],w,h))/2;
  const height=(side(q[1],q[2],w,h)+side(q[3],q[0],w,h))/2;
  return {width,height,aspect:width/Math.max(1,height)};
 }
 function validQuad(q,w,h){
  if(!Array.isArray(q)||q.length!==4||q.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
      p.x<=.006||p.x>=.994||p.y<=.006||p.y>=.994))return false;
  const cross=q.map((v,i)=>{
   const b=q[(i+1)%4],c=q[(i+2)%4];
   return (b.x-v.x)*(c.y-b.y)-(b.y-v.y)*(c.x-b.x);
  });
  if(!cross.every(n=>n>.002)&&!cross.every(n=>n<-.002))return false;
  const coverage=quadArea(q),s=shape(q,w,h);
  if(coverage<.095||coverage>.82||s.aspect<1.40||s.aspect>1.86)return false;
  if(s.width<130||s.height<70)return false;
  if(Math.max(side(q[0],q[1],w,h),side(q[2],q[3],w,h))/
     Math.max(1,Math.min(side(q[0],q[1],w,h),side(q[2],q[3],w,h)))>1.40)return false;
  return true;
 }
 function padded(q,w,h){
  const center=q.reduce((a,p)=>({x:a.x+p.x/4,y:a.y+p.y/4}),{x:0,y:0});
  // 0.8% protective outward guard preserves rounded ISO-card corners
  // and the last line of the MRZ. No additional inner crop after this.
  const expand=.008;
  const result=q.map(p=>({x:clamp(center.x+(p.x-center.x)*(1+expand),.001,.999),
   y:clamp(center.y+(p.y-center.y)*(1+expand),.001,.999)}));
  return validQuad(result,w,h)?result:q;
 }
 function intersects(a,b){
  const xy=q=>({left:Math.min(...q.map(p=>p.x)),right:Math.max(...q.map(p=>p.x)),
   top:Math.min(...q.map(p=>p.y)),bottom:Math.max(...q.map(p=>p.y))});
  const x=xy(a),y=xy(b),w=Math.max(0,Math.min(x.right,y.right)-Math.max(x.left,y.left)),
    h=Math.max(0,Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top));
  const ai=(x.right-x.left)*(x.bottom-x.top),bi=(y.right-y.left)*(y.bottom-y.top);
  return w*h/Math.max(.00001,Math.min(ai,bi));
 }
 function candidate(result,w,h,previous=null){
  if(!result?.success||!result?.corners)return null;
  const c=result.corners;
  const points=['topLeft','topRight','bottomRight','bottomLeft'].map(k=>c[k]);
  if(points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  const modelConf=Number(result.confidence)||0;
  // Model probabilities are heatmap peak scores, not calibrated certainties.
  // Require evidence on all four points, reject small portraits and A4 pages.
  if(modelConf<.19||points.some(p=>(Number(p.confidence)||0)<.14))return null;
  const q=points.map(p=>({x:p.x/w,y:p.y/h}));
  if(!validQuad(q,w,h))return null;
  if(previous&&validQuad(previous,w,h)&&intersects(q,previous)<.44)
   return null; // Neural ROI and classical detector disagree too much.
  return {quad:padded(q,w,h),confidence:modelConf,method:'docfix-local-docaligner-corner-proposal',
   physicallyVerified:false,needsReview:true,manualPending:true,modelHint:true};
 }
 async function load(){
  if(engine)return engine;
  if(unavailable)return null;
  if(loading)return loading;
  loading=(async()=>{
   // Explicit local-origin policy. Never silently fall back to jsDelivr.
   if(location.hostname!=='127.0.0.1')return null;
   const scriptUrl=asset('quadscan.iife.js');
   if(new URL(scriptUrl).origin!==location.origin)return null;
   if(!window.Quadscan){
    await new Promise((resolve,reject)=>{
     const s=document.createElement('script');s.src=scriptUrl;
     s.onload=resolve;s.onerror=()=>reject(Error('Modulo IA offline non installato'));
     document.head.appendChild(s);
    });
   }
   const Lib=window.Quadscan?.Quadscan||window.Quadscan;
   if(typeof Lib!=='function')throw Error('Quadscan offline non disponibile');
   // The entire model and all ORT wasm assets are copied into the
   // installer. The app's Electron network policy blocks every remote URL.
   const instance=new Lib({model:'lcnet',modelUrl:asset('model.onnx'),
     wasmPaths:asset('ort/'),executionProviders:['wasm']});
   await instance.initialize();
   engine=instance;
   return engine;
  })().catch(error=>{
   unavailable=true;console.warn('DocFix: IA locale non avviata, motore precedente conservato',error);
   return null;
  }).finally(()=>{loading=null;});
  return loading;
 }
 async function detect(original,previous=null){
  if(!original||!(original.width>=280&&original.height>=180))return null;
  const model=await load();
  if(!model)return null;
  try{
   const r=await model.scan(original,{mode:'detect',minDetectionConfidence:.14});
   return candidate(r,original.width,original.height,previous);
  }catch(error){
   console.warn('DocFix: rilevamento IA locale fallito, foto conservata',error);
   return null;
  }
 }
 window.DocFixLocalML=Object.freeze({detect,load,candidate,validQuad,shape,
  version:'1.9.51-candidate',offlineOnly:true});
})();