'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'app/card-precision-editor.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const win={};vm.runInNewContext(code,{window:win,Math});
const ui=win.DocFixPrecisionEditor;
assert.ok(ui&&ui.version==='1.9.50-candidate');
const points=[{x:.15,y:.20},{x:.85,y:.20},{x:.85,y:.80},{x:.15,y:.80}];
const ok=q=>q.every(p=>p.x>.001&&p.x<.999&&p.y>.001&&p.y<.999)
 &&q[0].x<q[1].x&&q[3].x<q[2].x&&q[0].y<q[3].y&&q[1].y<q[2].y;
for(const [w,h] of [[1600,1200],[2040,1530],[820,615]]){
 const right=ui.nudge(points,0,1,0,w,h,1,ok);
 const up=ui.nudge(points,0,0,-1,w,h,1,ok);
 const downTen=ui.nudge(points,2,0,1,w,h,10,ok);
 assert.ok(Math.abs((right[0].x-points[0].x)*w-1)<1e-7,'horizontal nudge 1 SOURCE pixel');
 assert.ok(Math.abs((up[0].y-points[0].y)*h+1)<1e-7,'vertical nudge 1 SOURCE pixel');
 assert.ok(Math.abs((downTen[2].y-points[2].y)*h-10)<1e-7,'shift nudge 10 SOURCE pixels');
 assert.deepEqual(points,[{x:.15,y:.20},{x:.85,y:.20},{x:.85,y:.80},{x:.15,y:.80}],'initial quad is immutable');
}
assert.equal(ui.nudge(points,-1,1,0,1600,1200,1,ok),null,'invalid index rejected');
assert.equal(ui.nudge(points,0,1,0,0,1200,1,ok),null,'invalid image rejected');
const rejected=ui.nudge(points,0,1,0,1600,1200,1600,ok);
assert.equal(rejected,null,'invalid corner geometry must not be applied');
const r={left:13,top:26,width:500,height:400};
const p=ui.screenToImage(263,226,r,1600,1200);
assert.equal(p.x,800);assert.equal(p.y,600);
let drawn=[],paint=[];
const canvas={width:240,height:240,getContext:()=>({
 save:()=>paint.push('save'),restore:()=>paint.push('restore'),
 fillRect:(...a)=>paint.push(['fill',...a]),
 drawImage:(...a)=>drawn.push(a),
 beginPath:()=>{},moveTo:()=>{},lineTo:()=>{},stroke:()=>{},
 set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){},set imageSmoothingEnabled(v){assert.equal(v,false);}
})};
assert.equal(ui.drawZoom(canvas,{width:1600,height:1200},{x:.5,y:.5},{span:48}),true);
assert.equal(drawn.length,1);
const [src,sx,sy,sw,sh,dx,dy,dw,dh]=drawn[0];
assert.equal(sx,776);assert.equal(sy,576);assert.equal(sw,48);assert.equal(sh,48);
assert.ok(Math.abs(dx+(800-sx)*dw/sw-canvas.width/2)<1e-8,'selected source pixel centered');
assert.ok(Math.abs(dy+(600-sy)*dh/sh-canvas.height/2)<1e-8);
assert.ok(html.includes("window.DocFixScanner.resize(editSource,2200)"),'editor must use high-resolution preview');
assert.ok(!html.includes("img.src=thumb(editSource)"),'650px editor old bug is removed');
assert.ok(html.includes('id="edit-zoom"')&&html.includes('id="edit-zoom-info"'));
assert.ok(html.includes("window.DocFixPrecisionEditor?.nudge?.("));
assert.ok(html.includes("ev.shiftKey?10:1"),'Shift arrow moves 10 source pixels');
assert.ok(html.includes("min-height:0;"),'no image/corner-overlay letterboxing');
assert.ok(html.includes("entries.some(e=>e.manualPending===true)"),'unconfirmed crops cannot export');
assert.ok(html.includes("e.processed=window.DocFixScanner.process(editSource,{crop:true,quad:editQuad,rotation:0"),'final crop from original');
console.log('PASS: precise editor 1/10 original-pixel moves at 820/1600/2040, centered pixel zoom, source-first perspective, keyboard, no unsafe export');
