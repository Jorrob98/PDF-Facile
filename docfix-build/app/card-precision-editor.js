/* DocFix 1.9.50: original-pixel precision editor helpers.
 * The selected corner is moved in ORIGINAL SOURCE pixels, not CSS pixels
 * or the compressed 650 px thumbnail. No photos or coordinates leave
 * the computer. Manual confirmation remains mandatory.
 */
(()=>{'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function nudge(q,index,dx,dy,sourceWidth,sourceHeight,step=1,validate=null){
  if(!Array.isArray(q)||q.length!==4||index<0||index>3||
     !Number.isFinite(sourceWidth)||!Number.isFinite(sourceHeight)||
     sourceWidth<1||sourceHeight<1||!Number.isFinite(dx)||!Number.isFinite(dy))
   return null;
  const moved=q.map(p=>({...p}));
  const point=moved[index];
  point.x=clamp(point.x+dx*step/sourceWidth,.001,.999);
  point.y=clamp(point.y+dy*step/sourceHeight,.001,.999);
  if(validate&&validate(moved)!==true)return null;
  return moved;
 }
 function screenToImage(eventX,eventY,rect,sourceWidth,sourceHeight){
  if(!rect||!(rect.width>0&&rect.height>0))return null;
  return {x:clamp((eventX-rect.left)/rect.width,0,1)*sourceWidth,
   y:clamp((eventY-rect.top)/rect.height,0,1)*sourceHeight};
 }
 function drawZoom(canvas,source,point,{span=60}={}){
  if(!canvas||!source||!(source.width>0&&source.height>0)||!point)return false;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)return false;
  const w=canvas.width,h=canvas.height;
  if(!w||!h)return false;
  const cx=clamp(Math.round(point.x*source.width),0,source.width-1);
  const cy=clamp(Math.round(point.y*source.height),0,source.height-1);
  const radius=Math.max(10,Math.floor(span/2));
  const sx=Math.max(0,cx-radius),sy=Math.max(0,cy-radius);
  const ex=Math.min(source.width,cx+radius),ey=Math.min(source.height,cy+radius);
  const drawW=Math.max(1,ex-sx),drawH=Math.max(1,ey-sy);
  const srcScale=Math.max(w/span,h/span);
  const destX=w/2-(cx-sx)*srcScale;
  const destY=h/2-(cy-sy)*srcScale;
  ctx.save();
  ctx.fillStyle='#e7ebef';ctx.fillRect(0,0,w,h);
  ctx.imageSmoothingEnabled=false;
  // Physical pixels are enlarged, not interpolated away.
  ctx.drawImage(source,sx,sy,drawW,drawH,
    destX,destY,
    drawW*srcScale,drawH*srcScale);
  ctx.strokeStyle='#fff';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);
  ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
  ctx.strokeStyle='#06776d';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);
  ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
  ctx.restore();
  return true;
 }
 window.DocFixPrecisionEditor=Object.freeze({nudge,screenToImage,drawZoom,version:'1.9.50-candidate'});
})();