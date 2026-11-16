'use strict';
// Synthetic ID-1 facsimiles: no real identity data, images or OCR are stored.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'app/card-threeup.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'app/index.html'),'utf8');
const W=360,H=625;
const cardBox=(x0,y0,x1,y1)=>[{x:x0/W,y:y0/H},{x:x1/W,y:y0/H},
  {x:x1/W,y:y1/H},{x:x0/W,y:y1/H}];
function createFixture(count=3){
 const pix=new Uint8ClampedArray(W*H*4);
 const starts=[30,215,400],height=179,colors=[[182,213,222],[208,168,191],[145,181,204]];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let rgb=[50,53,55];
  for(let c=0;c<count;c++){
   if(x>=37&&x<=322&&y>=starts[c]&&y<starts[c]+height){
    rgb=colors[c];
    // Black interior features: MRZ on CIE back, licence table, TS barcode.
    // They must never become additional physical document edges.
    if(c===0&&y>starts[c]+height-32&&y<starts[c]+height-8&&x>60&&x<300&&((y-starts[c])%8)<2)rgb=[55,61,65];
    if(c===1&&x>55&&x<305&&y>starts[c]+28&&y<starts[c]+height-12&&
       ((y-starts[c])%17)<2)rgb=[96,83,91];
    if(c===2&&x>80&&x<290&&y>starts[c]+height-50&&y<starts[c]+height-35&&x%6<3)rgb=[29,39,47];
   }
  }
  let k=(y*W+x)*4;pix[k]=rgb[0];pix[k+1]=rgb[1];pix[k+2]=rgb[2];pix[k+3]=255;
 }
 return {width:W,height:H,pixels:pix,getContext:()=>({getImageData:()=>({data:pix})})};
}
const original=createFixture(),snapshot=original.pixels.slice();
const validQuad=q=>Array.isArray(q)&&q.length===4&&q.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
const canvasFactory=()=>{
 const c={width:1,height:1,getContext:()=>({translate(){},rotate(){},drawImage(){},
  getImageData:()=>({data:new Uint8ClampedArray(c.width*c.height*4)})})};
 return c;
};
const win={DocFixScanner:{resize:c=>c,validQuad}};
vm.runInNewContext(src,{window:win,document:{createElement:canvasFactory},console,Math,Float32Array,Float64Array,Uint8Array,Uint8ClampedArray,Uint32Array,Int32Array});
const found=win.DocFixThreeUp.detect(original);
assert.equal(found?.cards?.length,3,'portrait WhatsApp photo of 3 horizontal cards must yield 3 candidates');
assert.equal(found.orientation,'none','do not turn already horizontal ID-1 cards sideways');
assert.equal(found.arrangement,'stacked-landscape');
let previousBottom=0;
for(const [i,c] of found.cards.entries()){
 const pts=c.quad.map(p=>({x:p.x*W,y:p.y*H}));
 const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
 assert.ok(w/h>=1.34&&w/h<=1.92,'only full ID-1-shaped outer rectangles, not barcodes or portraits');
 assert.ok(Math.min(...ys)>=previousBottom-8,'source top-to-bottom order remains intact');
 previousBottom=Math.max(...ys);
 assert.ok(w>W*.62&&h>H*.18,'full plastic card visible, not an inner printed zone');
}
assert.deepEqual(original.pixels,snapshot,'detect must not alter source photo');
assert.notEqual(win.DocFixThreeUp.detect(createFixture(1)).cards?.length,3,'single card cannot be split into three');

const begin=html.indexOf('function chooseMultiCardMode(');
const end=html.indexOf('function decideTwoUpProof(',begin);
assert.ok(begin>=0&&end>begin,'multi-card candidate choice must exist');
const bounds=q=>{
 const x=q.map(p=>p.x),y=q.map(p=>p.y),lx=Math.min(...x),ly=Math.min(...y);
 return {x:lx,y:ly,width:Math.max(...x)-lx,height:Math.max(...y)-ly};
};
const overlap=(a,b)=>{
 const ix=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
 const iy=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
 return ix*iy/Math.max(.00001,Math.min(a.width*a.height,b.width*b.height));
};
const choose=new Function('window','quadBounds','overlapFraction',html.slice(begin,end)+';return chooseMultiCardMode;')(win,bounds,overlap);
const cards=[cardBox(37,30,322,209),cardBox(37,215,322,394),cardBox(37,400,322,579)]
  .map((quad,i)=>({quad,confidence:.93,kind:['identity','licence','cf'][i]}));
let decision=choose(cards.slice(0,2),{cards,verified:true,materialVerified:false,arrangement:'stacked-landscape'});
assert.equal(decision.mode,'three','three independent physical candidate outlines survive uncertain colors');
assert.equal(decision.conflict,true,'uncertain facsimile identification must remain flagged');
decision=choose(cards.slice(0,2),{cards,verified:true,materialVerified:true});
assert.equal(decision.mode,'three');
assert.equal(decision.conflict,false);
const duplicate={...cards[2],quad:cards[1].quad};
assert.notEqual(choose(cards.slice(0,2),{cards:[cards[0],cards[1],duplicate],verified:true}).mode,'three',
 'internal duplicate contour must not create a fourth/third fake page');
console.log('PASS: ID-1 3-up landscape stack, narrow gaps, photo intact, dark MRZ/table/barcode not separate docs, three-up safe review');
