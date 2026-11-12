/* DocFix 1.9.32 — independent four-corner verification for two-card photos.
 * A detector saying "two rectangles" proves neither card is complete.
 * This gate runs ONLY in precision mode. Compatibility mode is untouched.
 * No original pixels, personal data, OCR output or filenames are persisted.
 */
(()=>{'use strict';
const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
const bbox=q=>({x0:Math.min(...q.map(p=>p.x)),x1:Math.max(...q.map(p=>p.x)),
 y0:Math.min(...q.map(p=>p.y)),y1:Math.max(...q.map(p=>p.y))});
const rectArea=b=>(b.x1-b.x0)*(b.y1-b.y0);
function geometry(source,candidates){
 const scan=window.DocFixScanner;
 if(!scan||!source?.width||!source?.height||
    !Array.isArray(candidates)||candidates.length!==2)return {ok:false,reason:'numero tessere incerto'};
 const boxes=[];
 for(const c of candidates){
  const q=c?.quad;
  if(!scan.validQuad(q))return {ok:false,reason:'angoli non validi'};
  const lengths=q.map((p,i)=>distance(
   {x:p.x*source.width,y:p.y*source.height},
   {x:q[(i+1)%4].x*source.width,y:q[(i+1)%4].y*source.height}));
  if(lengths.some(x=>!Number.isFinite(x)||x<28))return {ok:false,reason:'dimensioni minime'};
  const long=Math.max(lengths[0]+lengths[2],lengths[1]+lengths[3]);
  const short=Math.min(lengths[0]+lengths[2],lengths[1]+lengths[3]);
  if(long/Math.max(1,short)<1.32||long/Math.max(1,short)>2.05)
   return {ok:false,reason:'proporzioni non compatibili'};
  const b=bbox(q),a=rectArea(b);
  if(a<.022||a>.55)return {ok:false,reason:'area del documento sospetta'};
  boxes.push(b);
 }
 const i={x0:Math.max(boxes[0].x0,boxes[1].x0),x1:Math.min(boxes[0].x1,boxes[1].x1),
   y0:Math.max(boxes[0].y0,boxes[1].y0),y1:Math.min(boxes[0].y1,boxes[1].y1)};
 const overlap=Math.max(0,i.x1-i.x0)*Math.max(0,i.y1-i.y0);
 if(overlap/Math.max(.00001,Math.min(rectArea(boxes[0]),rectArea(boxes[1])))>.12)
  return {ok:false,reason:'rettangoli sovrapposti'};
 const areaRatio=Math.max(rectArea(boxes[0]),rectArea(boxes[1]))/
    Math.min(rectArea(boxes[0]),rectArea(boxes[1]));
 if(areaRatio>2.25)return {ok:false,reason:'dimensioni tra tessere incoerenti'};
 return {ok:true};
}
function verify(original,candidates){
 const scan=window.DocFixScanner,audit=window.DocFixQuadAudit;
 const shape=geometry(original,candidates);
 if(!shape.ok)return {verified:false,reason:shape.reason};
 if(!audit?.inspectCanvas)return {verified:false,reason:'controllo bordi indisponibile'};
 let sample=null;
 try{
  sample=scan.resize(original,880);
  const result=candidates.map(c=>{
   const test=audit.inspectCanvas(sample,c.quad,{format:'card'});
   if(test?.verified===true&&test.support?.sidesOk===4&&scan.validQuad(test.quad))
    return {...c,quad:test.quad,physicallyVerified:true,
     confidence:Math.min(1,Math.max(c.confidence||0,test.confidence||0)),
     method:'two-cards / 4 physical edges'};
   // Full-frame audit can miss a small card. Retry on a dedicated ROI at
   // higher effective resolution, but ONLY with four independent edges.
   // A colour match or an approximate location never counts as proof.
   const restored=window.DocFixOnePass?.detect?.(original,c.quad,
    {auditEnabled:true,format:'card'})||null;
   if(!restored?.physicallyVerified||restored.support?.sidesOk!==4||
      !scan.validQuad(restored.quad))return null;
   const before=bbox(c.quad),after=bbox(restored.quad);
   const ai=rectArea(before),bi=rectArea(after);
   const overlap=Math.max(0,Math.min(before.x1,after.x1)-Math.max(before.x0,after.x0))*
    Math.max(0,Math.min(before.y1,after.y1)-Math.max(before.y0,after.y0));
   const center={x:(after.x0+after.x1)/2,y:(after.y0+after.y1)/2};
   if(bi<ai*.13||bi>ai*1.5||overlap/Math.max(.00001,bi)<.80||
      center.x<before.x0-.025||center.x>before.x1+.025||
      center.y<before.y0-.025||center.y>before.y1+.025)return null;
   return {...c,quad:restored.quad,physicallyVerified:true,
    confidence:Math.min(1,Math.max(c.confidence||0,restored.confidence||0)),
    method:'two-cards / ROI with 4 physical edges'};
  });
  if(result.some(x=>!x))return {verified:false,reason:'almeno una tessera senza quattro bordi confermati'};
  const final=geometry(original,result);
  if(!final.ok)return {verified:false,reason:'bordi rifiniti non coerenti: '+final.reason};
  return {verified:true,cards:result,reason:'due perimetri fisici indipendenti'};
 }catch(err){
  console.warn('DocFix: verifica geometria coppia non applicata',err);
  return {verified:false,reason:'controllo geometrico non riuscito'};
 }finally{if(sample&&sample!==original)sample.width=sample.height=1;}
}
window.DocFixPairProof=Object.freeze({verify,geometry,version:'1.9.32'});
})();