'use strict';
/* DocFix Bordi v2 — Benchmark senza immagini o dati personali.
 * Input JSON: [{id:"...",quads:[[{x:.1,y:.2},...]],statuses:["auto"|"review"]}]
 * Angoli TL,TR,BR,BL normalizzati nell'immagine originale. */
const fs=require('node:fs'),EPS=1e-10;
const signedArea=q=>q.reduce((s,p,i)=>s+p.x*q[(i+1)%q.length].y-p.y*q[(i+1)%q.length].x,0)/2;
const area=q=>Math.abs(signedArea(q));
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function valid(q){return Array.isArray(q)&&q.length===4&&q.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=1&&p.y<=1)&&area(q)>EPS&&q.every((p,i)=>cross(p,q[(i+1)%4],q[(i+2)%4])*Math.sign(signedArea(q))>EPS);}
function lineCross(a,b,p,q){
 const dx=b.x-a.x,dy=b.y-a.y,ex=q.x-p.x,ey=q.y-p.y,den=dx*ey-dy*ex;
 if(Math.abs(den)<EPS)return b;
 const t=((p.x-a.x)*ey-(p.y-a.y)*ex)/den;
 return {x:a.x+dx*t,y:a.y+dy*t};
}
function intersectionArea(subject,clip){
 if(!valid(subject)||!valid(clip))return 0;
 let points=subject.slice(),dir=Math.sign(signedArea(clip));
 for(let i=0;i<clip.length;i++){
  const a=clip[i],b=clip[(i+1)%clip.length],before=points;points=[];
  for(let j=0;j<before.length;j++){
   const last=before[(j+before.length-1)%before.length],now=before[j];
   const inNow=cross(a,b,now)*dir>=-EPS,inLast=cross(a,b,last)*dir>=-EPS;
   if(inNow!==inLast)points.push(lineCross(last,now,a,b));
   if(inNow)points.push(now);
  }
 }
 return points.length>=3?area(points):0;
}
function compare(truth,proposal){
 const inter=intersectionArea(truth,proposal),a=area(truth),b=area(proposal);
 return {iou:inter/(a+b-inter),coverage:inter/a,precision:inter/b};
}
const round=n=>Number(n.toFixed(5));
function score(expected,predicted,{iouMin=.97,coverageMin=.995,precisionMin=.965}={}){
 const target=new Map(expected.map(x=>[x.id,x])),found=new Map(predicted.map(x=>[x.id,x]));
 if(target.size!==expected.length||found.size!==predicted.length)throw Error('ID duplicati');
 let docs=0,accepted=0,missing=0,extra=0,unsafeAuto=0,review=0;
 const samples=[];
 for(const [id,item] of target){
  if(!Array.isArray(item.quads)||item.quads.some(q=>!valid(q)))throw Error('Ground truth non valida: '+id);
  const predictedItem=found.get(id)||{quads:[],statuses:[]};
  if(!Array.isArray(predictedItem.quads)||predictedItem.quads.some(q=>!valid(q)))throw Error('Ritagli non validi: '+id);
  const {quads:guesses,statuses=[]}=predictedItem,choices=[];
  for(let i=0;i<item.quads.length;i++)for(let j=0;j<guesses.length;j++)choices.push({i,j,...compare(item.quads[i],guesses[j])});
  choices.sort((a,b)=>b.iou-a.iou);
  const usedTruth=new Set(),usedPred=new Set(),results=[];
  for(const c of choices){
   if(c.iou<.1||usedTruth.has(c.i)||usedPred.has(c.j))continue;
   usedTruth.add(c.i);usedPred.add(c.j);
   const passed=c.iou>=iouMin&&c.coverage>=coverageMin&&c.precision>=precisionMin;
   if(passed)accepted++;else if(statuses[c.j]==='auto')unsafeAuto++;
   results.push({expected:c.i,prediction:c.j,iou:round(c.iou),coverage:round(c.coverage),precision:round(c.precision),passed,status:statuses[c.j]||'unknown'});
  }
  const miss=item.quads.length-usedTruth.size,spur=guesses.length-usedPred.size;
  for(let j=0;j<guesses.length;j++)if(!usedPred.has(j)&&statuses[j]==='auto')unsafeAuto++;
  docs+=item.quads.length;missing+=miss;extra+=spur;
  review+=statuses.filter(x=>x==='review').length;
  samples.push({id,expected:item.quads.length,detected:guesses.length,missing:miss,extra:spur,results});
 }
 for(const id of found.keys())if(!target.has(id))throw Error('ID non annotato: '+id);
 return {summary:{photos:expected.length,expectedDocuments:docs,accepted,missing,extra,unsafeAuto,review,acceptedRate:docs?round(accepted/docs):1},thresholds:{iouMin,coverageMin,precisionMin},samples};
}
if(require.main===module){
 const [reference,prediction]=process.argv.slice(2);
 if(!reference||!prediction){console.error('Usage: node qa-border-score-v2.cjs riferimento.json previsioni.json [--strict]');process.exitCode=2;}
 else {
  const r=score(JSON.parse(fs.readFileSync(reference,'utf8')),JSON.parse(fs.readFileSync(prediction,'utf8')));
  console.log(JSON.stringify(r,null,2));
  if(process.argv.includes('--strict')&&(r.summary.accepted!==r.summary.expectedDocuments||r.summary.missing||r.summary.extra||r.summary.unsafeAuto))process.exitCode=1;
 }
}
module.exports={area,valid,intersectionArea,compare,score};
