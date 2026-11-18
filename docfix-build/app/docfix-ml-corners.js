/* DocFix 1.9.52 beta — offline, consent-free four-corner proposal.
   The model and WASM are served from the existing local app origin.
   No photographs leave this machine. AI proposals are NEVER a physical
   border confirmation and NEVER bypass manual PDF review. */
(()=>{'use strict';
let scanner=null,loading=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const bounds=q=>({l:Math.min(...q.map(p=>p.x)),r:Math.max(...q.map(p=>p.x)),
 t:Math.min(...q.map(p=>p.y)),b:Math.max(...q.map(p=>p.y))});
const area=q=>Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))/2;
function roughlySame(a,b){
 if(!a||!b||a.length!==4||b.length!==4)return false;
 const A=bounds(a),B=bounds(b);
 const xx=Math.max(0,Math.min(A.r,B.r)-Math.max(A.l,B.l));
 const yy=Math.max(0,Math.min(A.b,B.b)-Math.max(A.t,B.t));
 const inter=xx*yy,un=(A.r-A.l)*(A.b-A.t)+(B.r-B.l)*(B.b-B.t)-inter;
 return un>.001&&inter/un>.63;
}
function safeCandidate(q,w,h,confidence,rough=null){
 if(!Array.isArray(q)||q.length!==4||q.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||
 p.x<.009||p.y<.009||p.x>.991||p.y>.991))return null;
 const scan=window.DocFixScanner;
 if(!scan?.validQuad?.(q))return null;
 const d=(a,b)=>Math.hypot((a.x-b.x)*w,(a.y-b.y)*h);
 const ww=(d(q[0],q[1])+d(q[2],q[3]))/2,hh=(d(q[0],q[3])+d(q[1],q[2]))/2;
 const ratio=ww/Math.max(1,hh),size=area(q),bb=bounds(q);
 if(ratio<1.36||ratio>1.91||size<.09||size>.83||
  (bb.l+bb.r)/2<.23||(bb.l+bb.r)/2>.77||
  (bb.t+bb.b)/2<.22||(bb.t+bb.b)/2>.80)return null;
 // A strong neural suggestion and a classical provisional crop should
 // normally agree. Disagreement is safer than one attractive wrong crop.
 if(rough&&!roughlySame(q,rough))return null;
 if((rough?confidence<.38:confidence<.68))return null;
 return {status:'found',quad:q.map(p=>({...p})),confidence,
  needsReview:true,physicallyVerified:false,cardLikely:true,
  method:'local-onnx-four-corners-review-only'};
}
async function initialize(){
 if(scanner)return scanner;
 if(loading)return loading;
 loading=(async()=>{
  const Global=window.Quadscan;
  const Ctor=Global?.Quadscan||Global;
  if(typeof Ctor!=='function')throw Error('Modello locale Quadscan non incluso');
  const localModel=new URL('./vendor/quadscan/model.onnx',location.href).href;
  const localORT=new URL('./vendor/quadscan/ort/',location.href).href;
  // Explicitly pass local-only URLs: never accept Quadscan's CDN default.
  const instance=new Ctor({model:'lcnet',modelUrl:localModel,
   wasmPaths:localORT,executionProviders:['wasm']});
  await instance.initialize();scanner=instance;return instance;
 })();
 try{return await loading}finally{loading=null}
}
async function detect(original,rough=null){
 if(!original||!(original.width>0&&original.height>0))return null;
 const aspect=original.width/original.height;
 // The neural model predicts ONE document. Do not attempt to replace the
 // independent multi-card separator or portrait A4 protection.
 if(aspect<1.16||aspect>1.84)return null;
 try{
  const instance=await initialize();
  const res=await instance.scan(original,{mode:'detect',minDetectionConfidence:.23});
  if(res?.success!==true||!res.corners)return null;
  const raw=[res.corners.topLeft,res.corners.topRight,
   res.corners.bottomRight,res.corners.bottomLeft];
  const conf=Math.min(...raw.map(p=>Number(p.confidence)||0));
  const q=raw.map(p=>({x:clamp(p.x/original.width,0,1),
   y:clamp(p.y/original.height,0,1)}));
  return safeCandidate(q,original.width,original.height,conf,rough);
 }catch(error){
  console.warn('DocFix modello locale non disponibile, uso il motore tradizionale',error);
  return null;
 }
}
function state(){
 return {ready:!!scanner,loading:!!loading,offlineOnly:true};
}
window.DocFixMLCorners=Object.freeze({detect,warmup:initialize,safeCandidate,roughlySame,state,version:'1.9.52-experimental'});
})();