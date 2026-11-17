/* DocFix 1.9.47 — provisional ID-1 crop for low-contrast light backgrounds.
 * Works from printed texture plus coherent horizontal coverage, not fixed
 * blue saturation or a minimum 53%-of-photo card size.
 * Never certifies physical borders: manual confirmation remains required.
 */
(()=>{'use strict';
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
function morph(bits,w,h,rx,ry,dilate){
 const stride=w+1,integ=new Int32Array((w+1)*(h+1));
 for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){
  row+=bits[y*w+x];integ[(y+1)*stride+x+1]=row+integ[y*stride+x+1];
 }}
 const out=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const a=Math.max(0,x-rx),b=Math.min(w-1,x+rx),c=Math.max(0,y-ry),d=Math.min(h-1,y+ry);
  const sum=integ[(d+1)*stride+b+1]-integ[c*stride+b+1]-integ[(d+1)*stride+a]+integ[c*stride+a];
  out[y*w+x]=dilate?Number(sum>0):Number(sum===(b-a+1)*(d-c+1));
 }
 return out;
}
function analyzeRGBA(data,w,h){
 if(!data||w<210||h<150||data.length<w*h*4||w/h<1.05||w/h>2.15)return null;
 const gray=new Float32Array(w*h),blur=new Float32Array(w*h),mask=new Uint8Array(w*h);
 for(let i=0;i<w*h;i++){const k=i*4;gray[i]=.299*data[k]+.587*data[k+1]+.114*data[k+2];}
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const k=y*w+x;
  blur[k]=(gray[k-w-1]+2*gray[k-w]+gray[k-w+1]+2*gray[k-1]+4*gray[k]+2*gray[k+1]
   +gray[k+w-1]+2*gray[k+w]+gray[k+w+1])/16;
 }
 for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
  const k=y*w+x;
  const gx=-blur[k-w-1]-2*blur[k-1]-blur[k+w-1]+blur[k-w+1]+2*blur[k+1]+blur[k+w+1];
  const gy=-blur[k-w-1]-2*blur[k-w]-blur[k-w+1]+blur[k+w-1]+2*blur[k+w]+blur[k+w+1];
  // Peripheral scratches/laptop frames are not card print; apply this mask
  // ONLY to discovery. The later crop can extend outside the mask.
  mask[k]=Number(Math.hypot(gx,gy)>25&&y>h*.13&&y<h*.91&&x>w*.06&&x<w*.94);
 }
 const rx=Math.max(5,Math.round(w*15/680)),ry=Math.max(3,Math.round(h*9/510));
 let filled=morph(morph(mask,w,h,rx,ry,true),w,h,rx,ry,false);
 const ex=Math.max(2,Math.round(w*5/680)),ey=Math.max(2,Math.round(h*6/510));
 filled=morph(morph(filled,w,h,ex,ey,false),w,h,ex,ey,true);
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
 let best=null;
 for(let i=0;i<filled.length;i++){
  if(!filled[i]||seen[i])continue;
  let q=0,end=1,minX=w,maxX=-1,minY=h,maxY=-1;
  queue[0]=i;seen[i]=1;
  while(q<end){
   const v=queue[q++],x=v%w,y=(v/w)|0;
   if(x<minX)minX=x;if(x>maxX)maxX=x;
   if(y<minY)minY=y;if(y>maxY)maxY=y;
   for(const n of [v-1,v+1,v-w,v+w]){
    if(n<0||n>=seen.length||seen[n]||!filled[n]||(Math.abs(v-n)===1&&((n/w)|0)!==y))continue;
    seen[n]=1;queue[end++]=n;
   }
  }
  const bw=maxX-minX+1,bh=maxY-minY+1,frac=bw*bh/(w*h),ratio=bw/bh;
  const cx=(minX+maxX)/(2*w),cy=(minY+maxY)/(2*h);
  // Only an isolated, centrally located compact card candidate.
  // Old photos with busy dark desks connect to the image borders and fail.
  if(bw<w*.27||bw>w*.82||bh<h*.25||bh>h*.90||frac<.085||frac>.70||ratio<.82||ratio>2.22
    ||minX<w*.018||maxX>w*.98||minY<h*.018||maxY>h*.98||cx<.26||cx>.74||cy<.26||cy>.74)continue;
  const score=end/(bw*bh)*.24+Math.min(1,frac)*.15+Math.max(0,1-Math.abs(ratio-1.586)/.75)*.61;
  if(!best||score>best.score)best={minX,maxX,minY,maxY,bw,bh,ratio,score,count:end};
 }
 if(!best)return null;
 const L=best.minX,R=best.maxX,width=R-L;
 // Connected desktop scratches may stretch the component above the card:
 // keep the longest band whose row coverage is substantial and continuous.
 const rowCov=new Float32Array(h),x0=Math.round(L+width*.02),x1=Math.round(R-width*.02);
 for(let y=0;y<h;y++){
  let n=0,total=0;
  for(let x=x0;x<=x1;x+=3){n+=filled[y*w+x];total++;}
  rowCov[y]=n/Math.max(1,total);
 }
 const rowSmooth=new Float32Array(h);
 for(let y=0;y<h;y++){
  let total=0,count=0;
  for(let k=-3;k<=3;k++)if(y+k>=0&&y+k<h){total+=rowCov[y+k];count++;}
  rowSmooth[y]=total/Math.max(1,count);
 }
 let run=null,start=-1,below=0;
 for(let y=0;y<=h;y++){
  const on=y<h&&rowSmooth[y]>.38;
  if(on&&start<0)start=y;
  if(start>=0){
   if(on)below=0;
   else below++;
   if(y===h||below>Math.max(4,Math.round(h*.018))){
    const end=y-below,span=end-start+1;
    if(span>=h*.23&&(!run||span>run.span))run={start,end,span};
    start=-1;below=0;
   }
  }
 }
 if(!run)return null;
 // Protective margins are intentional: the printed texture can stop short
 // of the outer rounded plastic. Never crop the MRZ or portrait to fit text.
 const padY=Math.max(12,Math.round(run.span*.082));
 const desiredWidth=1.586*(run.span+2*padY);
 const padX=Math.max(10,Math.round((desiredWidth-width)/2)+2);
 const left=clamp(L-padX,2,w-3),right=clamp(R+padX,2,w-3);
 const top=clamp(run.start-padY,2,h-3),bottom=clamp(run.end+padY,2,h-3);
 const aspect=(right-left)/(bottom-top),area=(right-left)*(bottom-top)/(w*h);
 if(aspect<1.43||aspect>1.79||area<.083||area>.67)return null;
 const quad=[{x:left/w,y:top/h},{x:right/w,y:top/h},{x:right/w,y:bottom/h},{x:left/w,y:bottom/h}];
 return {status:'found',quad,confidence:.63,needsReview:true,physicallyVerified:false,cardLikely:true,
  method:'id1-light-background-provisional',
  reason:'Proposta tessera su sfondo chiaro: verificare tutti e quattro gli angoli',
  details:{area,aspect,materialWidth:width,materialRows:run.span}};
}
function detect(original){
 const scan=window.DocFixScanner;
 if(!scan||!original)return null;
 let sample;
 try{
  sample=scan.resize(original,680);
  const {width:w,height:h}=sample;
  const rgba=sample.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  const found=analyzeRGBA(rgba,w,h);
  return found&&scan.validQuad(found.quad)?found:null;
 }catch(err){console.warn('DocFix light-background preview skipped',err);return null;}
 finally{if(sample&&sample!==original)sample.width=sample.height=1;}
}
window.DocFixTextureCard=Object.freeze({analyzeRGBA,detect,version:'1.9.47'});
})();