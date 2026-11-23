'use strict';
/*
 * DocFix seeded stress run — genuine shipped JS detector modules.
 * No personal images included; deterministic synthetic plastic-on-desk scenes.
 * The reference document photos are ONLY used locally, not committed.
 *
 * Cases: perspective, rotation, off-centre, shadow, JPEG-style blur/noise,
 * missing corners, cropped edges, 2 cards, neutral white/blue/grey desktops.
 *
 * Safety-critical: one unsafe AUTO-approved bad crop is a regression.
 * Inconclusive candidates may remain manual; high recall is a separate goal.
 */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=__dirname,W=420,H=560,SEED=16620261123;
let state=SEED>>>0;function rand(){state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;}
function range(a,b){return a+(b-a)*rand();}
function choice(a){return a[Math.floor(rand()*a.length)];}
const count={signals:{good:[],bad:[]},total:0,single:0,physical:0,auto:0,manual:0,falseSingle:0,unsafeAuto:0,
 accurateAuto:0,proposedGood:0,proposedBad:0,errors:0,byScenario:{},worst:[]};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function canvasFactory(){
 let img=null,width=1,height=1;
 return {
  get width(){return width},set width(v){width=v;img=null;},
  get height(){return height},set height(v){height=v;img=null;},
  getContext(){return {
   drawImage(source,...rest){
    const w=width,h=height,sw=source.width,sh=source.height;
    img=new Uint8ClampedArray(w*h*4);
    // Canvas-style image resizing is intentionally mocked with nearest
    // resampling; the sharpness/blur variants are generated in source.
    for(let y=0;y<h;y++){
     const sy=clamp(Math.round((y+.5)*sh/h-.5),0,sh-1);
     for(let x=0;x<w;x++){
      const sx=clamp(Math.round((x+.5)*sw/w-.5),0,sw-1);
      const from=(sy*sw+sx)*4,to=(y*w+x)*4;
      img[to]=source.rgba[from];img[to+1]=source.rgba[from+1];
      img[to+2]=source.rgba[from+2];img[to+3]=255;
     }
    }
   },
   getImageData(){return {data:img||new Uint8ClampedArray(width*height*4)};}
  }}
 };
}
const document={createElement(tag){if(tag!=='canvas')throw Error('Not canvas');return canvasFactory();}};
const window={};
const ctx={window,document,console,Math,Uint8Array,Uint8ClampedArray,Uint32Array};
for(const name of ['card-quad-audit.js','docfix-wood-single.js','docfix-wood-physical-edges.js']){
 const src=fs.readFileSync(path.join(ROOT,'app',name),'utf8');
 vm.runInNewContext(src,ctx,{filename:name});
}
function pointIn(q,x,y){
 let c=false;
 for(let i=0,j=q.length-1;i<q.length;j=i++){
  const a=q[i],b=q[j];
  if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)c=!c;
 }return c;
}
function cardQuad({scale=1,angle=0,shiftX=0,shiftY=0,skew=0}={}){
 const hw=158*scale,hh=100*scale,cx=W/2+shiftX,cy=H/2+shiftY;
 const pts=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
 const c=Math.cos(angle),s=Math.sin(angle);
 return pts.map(([x,y],i)=>{
  const xx=x+(i<2?-skew:skew)*hw,yy=y+(i%3===0?-skew:skew)*hh*.2;
  return {x:cx+xx*c-yy*s,y:cy+xx*s+yy*c};
 });
}
function paint(scene,q,{colour=[214,216,202],barcode=false}={}){
 const xmin=clamp(Math.floor(Math.min(...q.map(p=>p.x)))-2,0,W-1);
 const xmax=clamp(Math.ceil(Math.max(...q.map(p=>p.x)))+2,0,W-1);
 const ymin=clamp(Math.floor(Math.min(...q.map(p=>p.y)))-2,0,H-1);
 const ymax=clamp(Math.ceil(Math.max(...q.map(p=>p.y)))+2,0,H-1);
 for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
  if(!pointIn(q,x+.5,y+.5))continue;
  const i=(y*W+x)*4,pattern=((x+y*3)%41===0)?-24:Math.sin((x+3*y)*.16)*4;
  let col=colour.map(v=>v+pattern);
  if(barcode&&y>H*.55&&y<H*.63&&x>W*.16&&x<W*.83&&x%7<2)col=[32,35,38];
  for(let z=0;z<3;z++)scene.rgba[i+z]=clamp(Math.round(col[z]),0,255);
 }
}
function newScene(name,index){
 const rgba=new Uint8ClampedArray(W*H*4);
 const backgrounds={
  wood:[155,66,16],wood2:[115,52,19],woodRed:[190,75,20],
  white:[245,245,242],blue:[51,103,166],gray:[131,136,142],dark:[36,38,40],green:[57,127,93]
 };
 const type={
  normal:'wood',perspective:'wood',rotation:'wood2',offcenter:'woodRed',
  blur:'wood',grain:'woodRed',shadow:'wood2',missingCorner:'wood',
  missingSide:'wood',clipped:'wood',twoCards:'wood',otherBackground:choice(['white','blue','gray','dark','green'])
 }[name];
 const bg=backgrounds[type];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=(y*W+x)*4,grain=Math.sin(x*.059+y*.012)*7+Math.sin((x-y*.6)*.03)*5;
  const f=name==='grain'?2:1;
  rgba[i]=clamp(bg[0]+f*grain,0,255);
  rgba[i+1]=clamp(bg[1]+grain*.42*f,0,255);
  rgba[i+2]=clamp(bg[2]+grain*.18*f,0,255);rgba[i+3]=255;
 }
 const q=cardQuad({
  scale:name==='clipped'?.96:range(.85,1.08),
  angle:name==='rotation'?range(-.30,.30):name==='perspective'?range(-.12,.12):range(-.045,.045),
  shiftX:name==='clipped'?choice([-105,110]):name==='offcenter'?range(-36,36):range(-12,12),
  shiftY:name==='clipped'?choice([-180,180]):name==='offcenter'?range(-64,64):range(-20,20),
  skew:name==='perspective'?range(-.19,.19):range(-.025,.025)
 });
 const source={width:W,height:H,rgba,getContext(){return {getImageData(){return {data:rgba}}}}};
 paint(source,q,{barcode:index%2===0});
 const cards=[q];
 if(name==='twoCards'){
  // Separate physical card beside/above: neither may be discarded.
  const second=cardQuad({scale:.55,angle:range(-.06,.06),shiftX:range(-68,68),shiftY:choice([-196,196]),skew:0});
  paint(source,second,{colour:[224,212,184]});cards.push(second);
 }
 if(name==='missingCorner'){
  const corner=q[Math.floor(rand()*4)];
  const rad=range(22,62);
  for(let y=Math.max(0,Math.floor(corner.y-rad));y<Math.min(H,Math.ceil(corner.y+rad));y++)
   for(let x=Math.max(0,Math.floor(corner.x-rad));x<Math.min(W,Math.ceil(corner.x+rad));x++){
    if(Math.hypot(x-corner.x,y-corner.y)>rad)continue;
    const i=(y*W+x)*4,grain=Math.sin(x*.059+y*.012)*7;
    rgba[i]=bg[0]+grain;rgba[i+1]=bg[1]+grain*.4;rgba[i+2]=bg[2]+grain*.18;
   }
 }
 if(name==='missingSide'){
  const sx=Math.round(Math.min(q[0].x,q[3].x)),sy=Math.round((q[0].y+q[3].y)/2);
  const rad=range(24,85);
  // Typed arrays IGNORE fractional pixel offsets. Always round raster
  // loop bounds, otherwise the synthetic occlusion is never rendered!
  for(let y=Math.max(0,Math.floor(sy-rad));y<Math.min(H,Math.ceil(sy+rad));y++)
   for(let x=Math.max(0,Math.floor(sx-6));x<Math.min(W,Math.ceil(sx+rad));x++){
    const k=(y*W+x)*4;rgba[k]=bg[0];rgba[k+1]=bg[1];rgba[k+2]=bg[2];
   }
  const probe=(sy*W+sx+5)*4;
  if(rgba[probe]!==bg[0]||rgba[probe+1]!==bg[1]||rgba[probe+2]!==bg[2])
   throw Error('Synthetic occlusion missing: invalid raster generation');
 }
 if(name==='shadow'){
  const xc=range(100,350),strength=range(.38,.82);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const factor=1-strength*clamp((x-xc+70)/130,0,1),i=(y*W+x)*4;
   for(let z=0;z<3;z++)rgba[i+z]*=factor;
  }
 }
 if(name==='blur'){
  const radius=choice([1,2,3,4]),src=rgba.slice();
  for(let y=radius;y<H-radius;y++)for(let x=radius;x<W-radius;x++){
   const i=(y*W+x)*4;
   for(let z=0;z<3;z++){
    let v=0,n=0;
    for(let a=-radius;a<=radius;a+=radius)for(let b=-radius;b<=radius;b+=radius){v+=src[((y+a)*W+x+b)*4+z];n++;}
    rgba[i+z]=v/n;
   }
  }
 }
 return {source,cards,name};
}
function polygonIoU(a,b){
 let both=0,either=0;
 for(let y=0;y<H;y+=6)for(let x=0;x<W;x+=6){
  const aa=pointIn(a,x+3,y+3),bb=pointIn(b,x+3,y+3);
  if(aa&&bb)both++;if(aa||bb)either++;
 }
 return either?both/either:0;
}
const names=['normal','perspective','rotation','offcenter','blur','grain','shadow',
 'missingCorner','missingSide','clipped','twoCards','otherBackground'];
const N=50;
for(const name of names)for(let i=0;i<N;i++){
 const {source,cards}=newScene(name,i),k=count.byScenario[name]||{
  total:0,single:0,physical:0,auto:0,unsafeAuto:0,falseSingle:0,minIoU:1,meanIoU:0};
 k.total++;count.total++;count.byScenario[name]=k;
 try{
  const one=window.DocFixWoodSingle.detect(source);
  if(!one){count.manual++;continue;}
  count.single++;k.single++;
  if(cards.length!==1){
   count.falseSingle++;k.falseSingle++;
   continue;
  }
  const fitted=window.DocFixWoodPhysicalEdges.refine(source,one.quad);
  if(!fitted){count.manual++;continue;}
  count.physical++;k.physical++;
  if(name==='missingSide'&&i===0){
    const trueQ=cards[0],sx=Math.round(Math.min(trueQ[0].x,trueQ[3].x)),
       sy=Math.round((trueQ[0].y+trueQ[3].y)/2);
    const px=(x,y)=>Array.from(source.rgba.slice((y*W+x)*4,(y*W+x)*4+3));
    count.debugMissingSide={rough:one.quad,fit:fitted.quad,
     trueQ,probePos:{sx,sy},probes:[
      {point:'trueLeftPlus5',rgb:px(clamp(sx+5,0,W-1),clamp(sy,0,H-1))},
      {point:'trueLeftPlus20',rgb:px(clamp(sx+20,0,W-1),clamp(sy,0,H-1))},
      {point:'trueLeftPlus60',rgb:px(clamp(sx+60,0,W-1),clamp(sy,0,H-1))},
      {point:'trueLeftMidUp60',rgb:px(clamp(sx+5,0,W-1),clamp(sy-60,0,H-1))}
     ],
     sideCoverage:fitted.diagnostic?.sideCoverage,
     cornersSupported:fitted.diagnostic?.cornersSupported,
     independent:fitted.diagnostic?.independentAudit};
  }
  if(name==='normal'&&i===0){
    count.debugNormal={rough:one.quad,fit:fitted.quad,
     sideCoverage:fitted.diagnostic?.sideCoverage,
     cornersSupported:fitted.diagnostic?.cornersSupported};
  }
  const iou=polygonIoU(fitted.quad.map(p=>({x:p.x*W,y:p.y*H})),cards[0]);
  k.minIoU=Math.min(k.minIoU,iou);
  k.meanIoU+=iou;
  if(iou>=.97)count.proposedGood++;else count.proposedBad++;
  if(fitted.physicallyVerified===true){
   count.auto++;k.auto++;
   const signal={iou:+iou.toFixed(4),
    minSupport:fitted.diagnostic?.minSupport,
    maxError:fitted.diagnostic?.maxError,
    maxShiftPx:fitted.diagnostic?.maxShiftPx};
   count.signals[iou>=.97?'good':'bad'].push(signal);
   if(iou<.97||['missingCorner','missingSide','clipped'].includes(name)){
    count.unsafeAuto++;k.unsafeAuto++;
    if(count.worst.length<12)count.worst.push({name,index:i,iou:+iou.toFixed(3),
     quad:fitted.quad,details:fitted.diagnostic?.cornersSupported});
   }else count.accurateAuto++;
  }else count.manual++;
 }catch(error){
  count.errors++;
  if(count.worst.length<12)count.worst.push({name,index:i,error:String(error?.stack||error)});
 }
}
for(const k of Object.values(count.byScenario)){
 k.meanIoU=k.physical?+(k.meanIoU/k.physical).toFixed(4):null;
 k.minIoU=k.physical?+k.minIoU.toFixed(4):null;
}
// Report accuracy versus confidence without changing the safety threshold.
for(const group of ['good','bad']){
 const data=count.signals[group];const summary={n:data.length};
 for(const key of ['iou','minSupport','maxError','maxShiftPx']){
  const arr=data.map(x=>x[key]).filter(Number.isFinite).sort((a,b)=>a-b);
  summary[key]=arr.length?{min:arr[0],median:arr[Math.floor(arr.length/2)],
   max:arr[arr.length-1]}:null;
 }
 count.signals[group]=summary;
}
count.seed=SEED;count.dimensions=[W,H];count.scenesPerScenario=N;
count.success=count.errors===0&&count.unsafeAuto===0&&count.falseSingle===0;
fs.writeFileSync(path.join(ROOT,'stress-166-summary.json'),JSON.stringify(count,null,2));
console.log(JSON.stringify(count,null,2));
if(!count.success){
 console.error('DOCFIX_STRESS_166_FAIL: unsafe auto crop, false single or exception');
 process.exitCode=1;
}else console.log('DOCFIX_STRESS_166_PASS: no unsafe auto crop or false single across '+count.total+' deterministic scenes');
