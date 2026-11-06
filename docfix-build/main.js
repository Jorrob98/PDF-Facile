'use strict';
const {app,BrowserWindow,Menu,shell,session,dialog,ipcMain}=require('electron');
const http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {spawn}=require('child_process');
const {registerOcrHandlers}=require('./ocr-cloud-main');

let server=null, mainWindow=null, logFile=null, quitting=false, pendingSecondInstance=false;
const SELF_TEST=process.argv.includes('--self-test');
const root=path.join(__dirname,'app');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm','.gz':'application/gzip','.pdf':'application/pdf'};

function initLog(){
  try{
    const dir=path.join(app.getPath('userData'),'logs');
    fs.mkdirSync(dir,{recursive:true});
    logFile=path.join(dir,'docfix.log');
    if(fs.existsSync(logFile)&&fs.statSync(logFile).size>1024*1024)fs.renameSync(logFile,logFile+'.old');
    log('START','DocFix Desktop 1.9.8',process.platform,process.arch,SELF_TEST?'SELF_TEST':'NORMAL');
  }catch(e){console.error(e);}
}
function log(...parts){
  const line='['+new Date().toISOString()+'] '+parts.map(v=>v instanceof Error?(v.stack||v.message):String(v)).join(' ')+'\n';
  try{if(logFile)fs.appendFileSync(logFile,line);}catch{}
  console.log(line.trim());
}
function requiredStartupFiles(){
  return ['index.html','group1-safe-crop.js','card-physical-edges.js','card-onepass.js','card-texture-crop.js','group2-orientation.js','group3-quality.js','group5-export.js','stability.js','ocr-max.js'];
}
function requiredEngineFiles(){
  return [
    'vendor/pdfjs/pdf.min.mjs','vendor/pdfjs/pdf.worker.min.mjs','vendor/pdf-lib/pdf-lib.min.js',
    'vendor/tesseract/tesseract.min.js','vendor/tesseract/worker.min.js','vendor/tessdata/eng.traineddata.gz','vendor/tessdata/ita.traineddata.gz'
  ];
}
function validateStartupBundle(){
  const missing=requiredStartupFiles().filter(rel=>!fs.existsSync(path.join(root,...rel.split('/'))));
  if(missing.length)throw new Error('Componenti base DocFix mancanti: '+missing.join(', '));
  log('STARTUP_BUNDLE_OK');
}
function validateEngineBundle({throwOnError=true}={}){
  const missing=requiredEngineFiles().filter(rel=>!fs.existsSync(path.join(root,...rel.split('/'))));
  const coreDir=path.join(root,'vendor','tesseract-core');
  let cores=[];
  try{cores=fs.readdirSync(coreDir).filter(f=>/^tesseract-core.*\.wasm\.js$/.test(f));}catch{}
  if(cores.length<4)missing.push('vendor/tesseract-core (core WASM)');
  if(missing.length){
    const err=new Error('Componenti PDF/OCR mancanti: '+missing.join(', '));
    log('ENGINE_BUNDLE_FAIL',err.message);
    if(throwOnError)throw err;
    return false;
  }
  log('ENGINE_BUNDLE_OK','cores='+cores.length);
  return true;
}
function validateBundle(){validateStartupBundle();validateEngineBundle({throwOnError:true});}
function startLocalServer(){
  if(server?.listening)return Promise.resolve(server.address().port);
  return new Promise((resolve,reject)=>{
    server=http.createServer((req,res)=>{
      try{
        let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
        if(pathname==='/'||pathname==='')pathname='/index.html';
        const base=path.resolve(root),requested=path.resolve(root,'.'+pathname);
        if(!(requested===base||requested.startsWith(base+path.sep))){res.writeHead(403);return res.end('Forbidden');}
        fs.stat(requested,(err,st)=>{
          if(err||!st.isFile()){res.writeHead(404);return res.end('Not found');}
          res.setHeader('Content-Type',mime[path.extname(requested).toLowerCase()]||'application/octet-stream');
          const rel=path.relative(base,requested).split(path.sep).join('/');
          res.setHeader('Cache-Control','no-cache, no-store, must-revalidate');
          res.setHeader('Pragma','no-cache');
          res.setHeader('Cross-Origin-Opener-Policy','same-origin');
          res.setHeader('X-Content-Type-Options','nosniff');
          fs.createReadStream(requested).on('error',e=>{log('READ_ERROR',e);if(!res.headersSent)res.writeHead(500);res.end();}).pipe(res);
        });
      }catch(e){log('SERVER_ERROR',e);res.writeHead(500);res.end('DocFix startup error');}
    });
    const listen=(port)=>{
      server.once('error',err=>{
        if(err?.code==='EADDRINUSE'&&port!==0){
          log('SERVER_PORT_BUSY',port,'fallback=ephemeral');
          try{server.close();}catch{}
          server.removeAllListeners('error');
          server.listen(0,'127.0.0.1',()=>{const p=server.address().port;log('SERVER_READY',p);resolve(p);});
        }else reject(err);
      });
      server.listen(port,'127.0.0.1',()=>{const p=server.address().port;log('SERVER_READY',p);resolve(p);});
    };
    listen(18654);
  });
}
function applyOfflinePolicy(port){
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,cb)=>{
    try{
      const u=new URL(details.url);
      const local=u.hostname==='127.0.0.1'&&String(u.port)===String(port);
      if(!local)log('NETWORK_BLOCKED',u.hostname,u.pathname);
      cb({cancel:!local});
    }catch{cb({cancel:true});}
  });
}
async function createWindow({show=true,selfTest=false}={}){
  const launchStarted=Date.now();
  if(selfTest)validateBundle(); else validateStartupBundle();
  const port=await startLocalServer();
  applyOfflinePolicy(port);
  const win=new BrowserWindow({
    title:'DocFix Desktop',width:1320,height:920,minWidth:960,minHeight:680,center:true,show:false,
    backgroundColor:'#edf3f5',icon:path.join(__dirname,'build','icon.png'),autoHideMenuBar:true,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:!app.isPackaged,preload:path.join(__dirname,'preload.js')}
  });
  if(!selfTest)mainWindow=win;
  Menu.setApplicationMenu(null);
  let windowShown=false;
  const showWindow=(reason)=>{
    if(!show||windowShown||win.isDestroyed())return;
    windowShown=true;
    try{win.show();win.focus();}catch{}
    log('WINDOW_SHOWN',reason,(Date.now()-launchStarted)+'ms');
  };
  if(show){
    win.once('ready-to-show',()=>showWindow('ready-to-show'));
    win.webContents.once('dom-ready',()=>showWindow('dom-ready'));
    setTimeout(()=>showWindow('startup-fallback'),300);
  }
  win.webContents.on('console-message',(_e,level,message)=>{if(level>=2)log('RENDERER',level,message);});
  win.webContents.on('render-process-gone',(_e,details)=>log('RENDER_GONE',JSON.stringify(details)));
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//i.test(url)&&!selfTest)shell.openExternal(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('http://127.0.0.1:'+port+'/')){log('NAV_BLOCKED',url);e.preventDefault();}});
  await win.loadURL('http://127.0.0.1:'+port+'/index.html');
  log('WINDOW_LOADED',(Date.now()-launchStarted)+'ms');
  if(show)showWindow('load-complete');
  if(!selfTest){
    setTimeout(()=>{try{validateEngineBundle({throwOnError:false});}catch(e){log('ENGINE_BACKGROUND_CHECK_FAIL',e)}},700);
    win.on('unresponsive',async()=>{
      log('WINDOW_UNRESPONSIVE');
      const {response}=await dialog.showMessageBox(win,{type:'warning',title:'DocFix non risponde',message:'DocFix sta impiegando troppo tempo.',detail:'Puoi ricaricare il programma senza cancellare i file originali sul PC.',buttons:['Ricarica DocFix','Chiudi'],defaultId:0,cancelId:1});
      if(response===0)win.reload(); else win.close();
    });
  }
  if(!selfTest&&pendingSecondInstance){pendingSecondInstance=false;showWindow('pending-second-instance');try{win.focus();win.moveTop?.();}catch{}}
  return {win,port};
}
async function runSelfTest(){
  let win;
  try{
    const created=await createWindow({show:false,selfTest:true});win=created.win;
    const result=await win.webContents.executeJavaScript(`
      (async()=>{
        const out={};
        out.ui=!!document.querySelector('#dropzone')&&!!document.querySelector('#download')&&!!document.querySelector('#picker');
        out.modules=!!window.DocFixGroup1&&!!window.DocFixGroup2&&!!window.DocFixGroup3&&!!window.DocFixGroup5&&!!window.DocFixStability&&!!window.DocFixPhysicalEdges&&!!window.DocFixOnePass&&!!window.DocFixRealCrop;
        const c=document.createElement('canvas');c.width=800;c.height=500;
        const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#111';g.font='40px Arial';g.fillText('DOCFIX SELF TEST 123',70,180);g.strokeRect(40,40,720,420);
        const jpg=await window.DocFixGroup3.encodeJPEG(c,'high');
        out.jpeg=jpg.byteLength>1000;
        const blob=await window.DocFixGroup5.create([{processed:c,source:'selftest.png'}],{encodeJPEG:(canvas)=>window.DocFixGroup3.encodeJPEG(canvas,'high')});
        window.DocFixGroup5.validate(blob,1);
        const pdfBytes=new Uint8Array(await blob.arrayBuffer());
        out.pdf=blob.size>1000&&new TextDecoder().decode(pdfBytes.slice(0,5))==='%PDF-';
        const pdfjs=await import('./vendor/pdfjs/pdf.min.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc='./vendor/pdfjs/pdf.worker.min.mjs';
        const doc=await pdfjs.getDocument({data:pdfBytes}).promise;
        out.pdfjs=doc.numPages===1;await doc.destroy();
        if(!window.PDFLib){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/pdf-lib/pdf-lib.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
        out.pdflib=!!window.PDFLib?.PDFDocument;
        const abs=p=>new URL(p,location.href).toString();
        const worker=await Tesseract.createWorker(['ita','eng'],1,{legacyCore:true,legacyLang:true,workerPath:abs('./vendor/tesseract/worker.min.js'),corePath:abs('./vendor/tesseract-core/'),langPath:abs('./vendor/tessdata'),gzip:true});
        const ocr=await worker.recognize(c);await worker.terminate();
        out.ocr=typeof ocr?.data?.text==='string'&&ocr.data.text.length>0;
        out.localFetch=(await fetch('./index.html',{cache:'no-store'})).ok;
        out.updaterBridge=!!window.DocFixUpdater;
        out.ocrBridge=!!window.DocFixOCRCloud;
        out.updaterVersion=window.DocFixUpdater?(await window.DocFixUpdater.currentVersion())==='1.9.8':false;
        out.updaterButton=!!document.querySelector('#docfix-update-button');
        out.updaterHiddenWhenNoUpdate=document.querySelector('#docfix-update-button')?.hidden===true;
        out.ocrModule=window.DocFixOCRMax?.version==='1.9.8';
        const cloudTest=window.DocFixOCRCloud?.selfTest?await window.DocFixOCRCloud.selfTest():null;
        out.ocrCloudLogic=!!cloudTest&&cloudTest.identity===true&&cloudTest.structured===true&&cloudTest.agreement===true;
        const mc=document.createElement('canvas');mc.width=900;mc.height=1200;const mg=mc.getContext('2d');mg.fillStyle='#b7895f';mg.fillRect(0,0,mc.width,mc.height);
        for(const y of [230,620]){mg.fillStyle='#d9eef0';mg.fillRect(130,y,640,360);mg.fillStyle='#1b6380';mg.fillRect(130,y,640,80);mg.fillStyle='#fff';mg.fillRect(170,y+120,560,70);mg.fillStyle='#111';for(let x=190;x<700;x+=12)mg.fillRect(x,y+135,5,40);mg.fillStyle='#222';mg.font='32px Arial';mg.fillText('DOCFIX TEST',190,y+250);}
        const multi=window.DocFixDesktopDiagnostics?.multiCardCandidates(mc)||[];
        out.multiCard=multi.length===2&&multi.every(x=>x.status==='found');
        // Privacy-safe synthetic texture regression: no customer documents are
        // included in the repository or GitHub Actions artifacts.
        const tex=document.createElement('canvas');tex.width=600;tex.height=800;
        const tx=tex.getContext('2d'),gtex=tx.createLinearGradient(0,0,600,800);
        gtex.addColorStop(0,'rgb(138,120,139)');gtex.addColorStop(1,'rgb(132,131,155)');
        tx.fillStyle=gtex;tx.fillRect(0,0,600,800);
        tx.fillStyle='rgb(200,230,232)';tx.fillRect(90,100,400,260);
        tx.fillStyle='rgb(28,89,139)';tx.fillRect(90,100,400,35);
        tx.fillStyle='#f7f7f7';tx.fillRect(115,210,349,18);
        tx.fillStyle='rgb(215,205,212)';tx.fillRect(95,450,401,257);
        tx.fillStyle='#604f65';for(let z=0;z<5;z++)tx.fillRect(130,530+z*29,325,3);
        const textureTest=window.DocFixRealCrop?.detect?.(tex)||{cards:[]};
        out.textureTwoCards=textureTest.cards?.length===2
          &&textureTest.cards[0].quad[0].x>.10&&textureTest.cards[0].quad[0].x<.18
          &&textureTest.cards[0].quad[0].y>.09&&textureTest.cards[0].quad[0].y<.16
          &&textureTest.cards[1].quad[0].y>.52&&textureTest.cards[1].quad[0].y<.61;

        // Both cards must be detected independently on the same untouched scan.
        const sourceFirst=multi.length===2?multi.map(c=>window.DocFixDesktopDiagnostics?.detectOriginalCard?.(mc,c.quad)):[],
              sourceCenter=r=>r?.quad?.reduce((sum,p)=>sum+p.y,0)/4;
        out.onePassTwoCards=sourceFirst.length===2&&sourceFirst.every(r=>r?.verified)
          &&sourceCenter(sourceFirst[0])<.52&&sourceCenter(sourceFirst[1])>.49
          &&sourceCenter(sourceFirst[1])-sourceCenter(sourceFirst[0])>.24;
        const safeCrops=multi.map(x=>window.DocFixDesktopDiagnostics?.safeMultiCropPreview?.(mc,x)).filter(Boolean);
        out.multiCardSafe=safeCrops.length===2&&safeCrops.every(c=>window.DocFixDesktopDiagnostics?.multiCropHealthy?.(c));
        for(const c of safeCrops){try{c.width=c.height=1}catch{}}
        const edge=document.createElement('canvas');edge.width=900;edge.height=1300;const eg=edge.getContext('2d');
        eg.fillStyle='#777983';eg.fillRect(0,0,edge.width,edge.height);
        eg.fillStyle='#1b6ea9';eg.fillRect(0,0,880,505);
        eg.fillStyle='#eef4f8';for(let y=80;y<480;y+=65)eg.fillRect(25,y,820,22);
        eg.fillStyle='#0a1d2a';for(let x=80;x<820;x+=55)eg.fillRect(x,25,18,440);
        eg.fillStyle='#ead4df';eg.fillRect(35,720,865,580);
        eg.fillStyle='#faf6f8';for(let y=780;y<1260;y+=72)eg.fillRect(65,y,790,24);
        eg.fillStyle='#29343a';for(let x=95;x<850;x+=63)eg.fillRect(x,755,16,500);
        const stacked=window.DocFixDesktopDiagnostics?.stackedCardCandidatesByGap?.(edge)||[];
        out.stackedEdgeCards=stacked.length===2&&stacked[0].box.y<.05&&stacked[1].box.y>.45;
        const pairTest=window.DocFixDesktopDiagnostics?.pairedFourCards?.([
          {id:'f1-top',sourceIndex:101,splitSlot:0,splitCount:2,batchSize:1,twoUp:true},
          {id:'f1-bottom',sourceIndex:101,splitSlot:1,splitCount:2,batchSize:1,twoUp:true},
          {id:'f2-top',sourceIndex:202,splitSlot:0,splitCount:2,batchSize:1,twoUp:true},
          {id:'f2-bottom',sourceIndex:202,splitSlot:1,splitCount:2,batchSize:1,twoUp:true}
        ])||[];
        out.fourCardPairOrder=pairTest.map(x=>x.id).join('|')==='f1-top|f2-top|f1-bottom|f2-bottom';
        const safeMulti=window.DocFixDesktopDiagnostics?.safeRefineMultiQuad?.(edge,[{x:0,y:0},{x:1,y:0},{x:1,y:.39},{x:0,y:.39}])||[];
        const safeArea=safeMulti.length===4?window.DocFixScanner.area(safeMulti):0;
        out.multiRefineSafe=safeMulti.length===4&&safeArea>.30&&safeArea<.46;
        const recovery=document.createElement('canvas');recovery.width=900;recovery.height=1300;const rg=recovery.getContext('2d');
        rg.fillStyle='#8b8e91';rg.fillRect(0,0,900,1300);
        rg.fillStyle='#5f86a0';rg.fillRect(18,18,864,500);rg.fillStyle='#d8e6ec';
        for(let y=70;y<480;y+=58)rg.fillRect(45,y,810,18);
        rg.fillStyle='#b39aa3';rg.fillRect(28,760,850,520);rg.fillStyle='#f1e6ea';
        for(let y=815;y<1240;y+=61)rg.fillRect(55,y,790,20);
        const recovered=window.DocFixDesktopDiagnostics?.stackedCardCandidatesRecovery?.(recovery)||[];
        out.stackedRecovery=recovered.length===2;
        out.twoByTwoGate=typeof window.DocFixDesktopDiagnostics?.twoByTwoState==='function';
        const meta=window.DocFixDesktopDiagnostics?.twoByTwoCandidateMeta;
        out.onePlusOneRecovery=typeof meta==='function'&&meta([1,1],true,true)===true&&meta([1,1],false,true)===false&&meta([2,1],false,false)===true&&meta([2,2],false,false)===true;
        const border=document.createElement('canvas');border.width=1000;border.height=700;const bg=border.getContext('2d');
        bg.fillStyle='#8b8b8b';bg.fillRect(0,0,1000,700);
        bg.fillStyle='#d6eaf3';bg.fillRect(150,150,700,440);
        bg.fillStyle='#0c5e86';bg.fillRect(150,150,700,85);
        bg.fillStyle='#fff';for(let y=280;y<540;y+=52)bg.fillRect(195,y,610,18);
        bg.fillStyle='#111';for(let x=210;x<790;x+=16)bg.fillRect(x,500,6,50);
        const tightened=window.DocFixDesktopDiagnostics?.tightenSeparatedCardCanvas?.(border);
        const tr=tightened?.canvas?Math.max(tightened.canvas.width,tightened.canvas.height)/Math.max(1,Math.min(tightened.canvas.width,tightened.canvas.height)):0;
        out.tightSeparatedCard=!!tightened?.tightened&&tightened.canvas.width<930&&tightened.canvas.height<650&&tr>1.40&&tr<1.84;
        const cf=document.createElement('canvas');cf.width=1050;cf.height=720;const cg=cf.getContext('2d');
        cg.fillStyle='#8d8b8c';cg.fillRect(0,0,1050,720);
        cg.fillStyle='#cce8f2';cg.fillRect(150,155,750,472);
        cg.fillStyle='#0879ae';cg.fillRect(150,155,750,94);
        cg.fillStyle='#fff';for(let y=300;y<530;y+=48)cg.fillRect(205,y,620,18);
        cg.fillStyle='#111';for(let x=220;x<820;x+=14)cg.fillRect(x,520,5,62);
        const cfTight=window.DocFixDesktopDiagnostics?.tightenSeparatedCardCanvas?.(cf,{cardKind:'cf'});
        const cfr=cfTight?.canvas?Math.max(cfTight.canvas.width,cfTight.canvas.height)/Math.max(1,Math.min(cfTight.canvas.width,cfTight.canvas.height)):0;
        out.cfPhysicalCrop=!!cfTight?.tightened&&cfTight.canvas.width<960&&cfTight.canvas.height<665&&cfr>1.45&&cfr<1.76;
        // Source-first regression: the projected quad must be in original coordinates
        // and the crop must be made directly from the original canvas, just once.
        const oneQ=[{x:.05,y:.09},{x:.96,y:.09},{x:.96,y:.96},{x:.05,y:.96}];
        const one=window.DocFixDesktopDiagnostics?.detectOriginalCard?.(cf,oneQ);
        out.onePassPhysicalOriginal=!!one?.verified&&one.quad[0].x>.07&&one.quad[0].y>.07
          &&one.quad[2].x<.95&&one.quad[2].y<.98;
        const empty=document.createElement('canvas');empty.width=800;empty.height=520;
        empty.getContext('2d').fillRect(0,0,800,520);
        const eq=[{x:.02,y:.02},{x:.98,y:.02},{x:.98,y:.98},{x:.02,y:.98}];
        out.onePassBlankRejected=window.DocFixDesktopDiagnostics?.detectOriginalCard?.(empty,eq)===null;
        const physicalEdge=window.DocFixPhysicalEdges?.detect?.(cf);
        out.physicalBorderCrop=!!physicalEdge&&physicalEdge.quad[0].x>.08&&physicalEdge.quad[0].y>.10&&physicalEdge.quad[2].x<.95&&physicalEdge.quad[2].y<.95;
        const flat=document.createElement('canvas');flat.width=560;flat.height=380;const fl=flat.getContext('2d');fl.fillStyle='#aeb1b7';fl.fillRect(0,0,560,380);fl.fillStyle='#242a31';for(const y of [80,150,230,300])fl.fillRect(80,y,400,10);
        out.physicalNoFalseCrop=window.DocFixPhysicalEdges?.detect?.(flat)===null;
        const base=document.createElement('canvas');base.width=900;base.height=560;const sg=base.getContext('2d');
        sg.fillStyle='#d9edf5';sg.fillRect(0,0,900,560);sg.fillStyle='#0d6f9a';sg.fillRect(0,0,900,90);
        sg.fillStyle='#111';for(let y=150;y<500;y+=50)sg.fillRect(80,y,730,8);
        const skew=window.DocFixDesktopDiagnostics?.fineDeskewCard?(()=>{const c=document.createElement('canvas'),a=2.5*Math.PI/180,cs=Math.abs(Math.cos(a)),sn=Math.abs(Math.sin(a));c.width=Math.ceil(base.width*cs+base.height*sn);c.height=Math.ceil(base.height*cs+base.width*sn);const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.translate(c.width/2,c.height/2);g.rotate(a);g.drawImage(base,-base.width/2,-base.height/2);return c})():null;
        const est=skew?window.DocFixDesktopDiagnostics?.estimateFineDeskew?.(skew):null;
        out.fineDeskew=!!est&&est.applied===true&&Math.abs(est.angle-2.5)<.9;
        const estCf=skew?window.DocFixDesktopDiagnostics?.estimateFineDeskew?.(skew,{cardKind:'cf'}):null;
        const straightCf=window.DocFixDesktopDiagnostics?.estimateFineDeskew?.(base,{cardKind:'cf'});
        out.cfFineDeskew=!!estCf&&estCf.applied===true&&Math.abs(estCf.angle-2.5)<.8&&!!straightCf&&straightCf.applied===false;
        const tilt=document.createElement('canvas');tilt.width=560;tilt.height=380;
        const tg=tilt.getContext('2d');tg.fillStyle='#b0b1b7';tg.fillRect(0,0,560,380);tg.translate(280,180);tg.rotate(2.5*Math.PI/180);tg.fillStyle='#c0ddeb';tg.fillRect(-215,-135,430,270);tg.fillStyle='#19659a';tg.fillRect(-180,-65,360,23);tg.fillStyle='#222';for(const y of [0,34,68,104])tg.fillRect(-180,y,345,8);
        const tiltedEdges=window.DocFixPhysicalEdges?.detect?.(tilt);
        out.physicalLineDeskew=!!tiltedEdges&&Math.abs(tiltedEdges.angle-2.5)<1&&tiltedEdges.area>.40&&tiltedEdges.area<.75;
        const verifiedDeskew=skew?window.DocFixDesktopDiagnostics?.fineDeskewCard?.(skew,{cardKind:'cf'}):null;
        const verifiedResidual=verifiedDeskew?.canvas?window.DocFixDesktopDiagnostics?.estimateFineDeskew?.(verifiedDeskew.canvas,{cardKind:'cf'}):null;
        out.deskewResidualVerified=!!verifiedDeskew?.applied&&verifiedDeskew.verified===true&&verifiedDeskew.residual<=.5&&(!verifiedResidual?.applied||Math.abs(verifiedResidual.angle)<=.5);
        out.diagnosticsCoverage=['tightenSeparatedCardCanvas','estimateFineDeskew','fineDeskewCard','twoByTwoCandidateMeta','detectPhysicalLines','detectOriginalCard','detectTextureCards'].every(k=>typeof window.DocFixDesktopDiagnostics?.[k]==='function');
        const orderTest=window.DocFixDesktopDiagnostics?.orderedIncoming?.([
          new File(['b'],'WhatsApp Image 2026-11-05 at 15.10.11.jpeg',{type:'image/jpeg',lastModified:2}),
          new File(['a'],'WhatsApp Image 2026-11-05 at 15.10.10.jpeg',{type:'image/jpeg',lastModified:1})
        ])||[];
        out.inputOrder=orderTest.length===2&&/15\.10\.11\.jpeg$/i.test(orderTest[0].name)&&/15\.10\.10\.jpeg$/i.test(orderTest[1].name);
        out.reverseFileOrder=typeof window.DocFixDesktopDiagnostics?.reverseFileOrder==='function';
        const fc=document.createElement('canvas');fc.width=1000;fc.height=700;const fg=fc.getContext('2d');
        fg.fillStyle='#b98861';fg.fillRect(0,0,fc.width,fc.height);
        const actual=[{x:.16,y:.20},{x:.84,y:.16},{x:.87,y:.74},{x:.13,y:.78}];
        fg.beginPath();fg.moveTo(actual[0].x*1000,actual[0].y*700);for(let i=1;i<4;i++)fg.lineTo(actual[i].x*1000,actual[i].y*700);fg.closePath();fg.fillStyle='#dceff1';fg.fill();fg.strokeStyle='#49747e';fg.lineWidth=3;fg.stroke();
        fg.fillStyle='#1b6580';fg.fillRect(220,210,560,70);fg.fillStyle='#fff';fg.fillRect(240,310,520,80);fg.fillStyle='#222';fg.font='30px Arial';fg.fillText('DOCFIX BORDI TEST',260,365);
        const approx=[{x:.148,y:.188},{x:.852,y:.148},{x:.882,y:.752},{x:.118,y:.792}];
        const fine=window.DocFixGroup1?.refineQuad?.(fc,approx);
        const err=q=>q.reduce((sum,p,i)=>sum+Math.hypot((p.x-actual[i].x)*1000,(p.y-actual[i].y)*700),0)/4;
        out.fineCrop=!!fine?.refined&&err(fine.quad)<err(approx)*.72;
        const low=document.createElement('canvas');low.width=220;low.height=130;const lg=low.getContext('2d');lg.fillStyle='#fff';lg.fillRect(0,0,220,130);lg.fillStyle='#111';lg.font='18px Arial';lg.fillText('DOCFIX QUALITA',18,65);
        const qa=window.DocFixDesktopDiagnostics?.qualityAudit?.(low);
        out.qualityAudit=!!qa?.review&&qa.issues.includes('Risoluzione bassa');
        out.smartFilename=window.DocFixGroup5.filename([{source:'pratica-cliente.pdf'},{source:'pratica-cliente.pdf'}])==='pratica-cliente-docfix.pdf';
        try{await fetch('https://example.com/docfix-network-test',{cache:'no-store'});out.externalBlocked=false;}catch{out.externalBlocked=true;}
        return out;
      })()
    `,true);
    const failed=Object.entries(result).filter(([,v])=>v!==true);
    log('SELF_TEST_RESULT',JSON.stringify(result));
    if(failed.length)throw new Error('Self-test fallito: '+failed.map(([k])=>k).join(', '));
    process.exitCode=0;
  }catch(e){
    log('SELF_TEST_FAIL',e);
    process.exitCode=2;
  }finally{
    try{win?.destroy();}catch{}
    try{server?.close();}catch{}
    setTimeout(()=>app.quit(),100);
  }
}

const UPDATE_API='https://api.github.com/repos/Jorrob98/PDF-Facile/releases/latest';

function versionParts(v){return String(v||'0').replace(/^v/i,'').split('.').map(x=>parseInt(x,10)||0).slice(0,3)}
function isNewerVersion(candidate,current){
  const a=versionParts(candidate),b=versionParts(current);
  for(let i=0;i<3;i++){if((a[i]||0)>(b[i]||0))return true;if((a[i]||0)<(b[i]||0))return false}
  return false;
}
function httpsBuffer(url,headers={},redirects=0,onProgress=null,totalHint=0){
  return new Promise((resolve,reject)=>{
    if(redirects>6)return reject(new Error('Troppi reindirizzamenti durante il download'));
    const req=https.get(url,{headers:{'User-Agent':'DocFix-Desktop-Updater/1.9.8','Accept':'application/vnd.github+json',...headers}},res=>{
      const code=res.statusCode||0;
      if(code>=300&&code<400&&res.headers.location){res.resume();return resolve(httpsBuffer(new URL(res.headers.location,url).toString(),headers,redirects+1,onProgress,totalHint));}
      if(code!==200){res.resume();return reject(new Error('Server aggiornamenti non disponibile ('+code+')'));}
      const chunks=[];let total=0;
      const headerTotal=Number(res.headers['content-length'])||0,expected=headerTotal||Number(totalHint)||0;
      res.on('data',c=>{
        chunks.push(c);total+=c.length;
        if(onProgress)try{onProgress(total,expected)}catch{}
        if(total>220*1024*1024){req.destroy(new Error('Aggiornamento troppo grande'));}
      });
      res.on('end',()=>resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(25000,()=>req.destroy(new Error('Timeout connessione aggiornamenti')));
    req.on('error',reject);
  });
}
async function getLatestUpdate(){
  const raw=await httpsBuffer(UPDATE_API);
  const release=JSON.parse(raw.toString('utf8'));
  const version=String(release.tag_name||'').replace(/^docfix-v/i,'').replace(/^v/i,'');
  if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Versione aggiornamento non valida');
  const short=version.split('.').slice(0,2).join('.');
  const exeName='DocFix_Aggiornamento_'+short+'.exe';
  const shaName='DocFix_Aggiornamento_'+short+'.sha256';
  const exe=(release.assets||[]).find(a=>a.name===exeName);
  const sha=(release.assets||[]).find(a=>a.name===shaName);
  if(!exe||!sha)throw new Error('Pacchetto aggiornamento incompleto');
  return {version,short,exeName,shaName,exeUrl:exe.browser_download_url,shaUrl:sha.browser_download_url,size:Number(exe.size)||0,notes:String(release.body||'')};
}
async function checkForUpdates(){
  const current=app.getVersion();
  const latest=await getLatestUpdate();
  return {current,latest:latest.version,available:isNewerVersion(latest.version,current),notes:latest.notes};
}
function sendUpdateProgress(sender,data){
  try{if(sender&&!sender.isDestroyed())sender.send('docfix:update:progress',data)}catch{}
}
async function downloadVerifiedUpdate(sender){
  sendUpdateProgress(sender,{phase:'preparing',percent:2,message:'Preparo aggiornamento…'});
  const latest=await getLatestUpdate();
  const current=app.getVersion();
  if(!isNewerVersion(latest.version,current))return {available:false,current,latest:latest.version};
  sendUpdateProgress(sender,{phase:'metadata',percent:5,message:'Pacchetto trovato · preparo il download',total:latest.size||0});
  log('UPDATE_DOWNLOAD_START',current,'->',latest.version);
  const started=Date.now();
  const [exe,shaRaw]=await Promise.all([
    httpsBuffer(latest.exeUrl,{'Accept':'application/octet-stream'},0,(received,total)=>{
      const known=total||latest.size||0,raw=known?Math.min(1,received/known):0;
      const elapsed=Math.max(.25,(Date.now()-started)/1000),speed=received/elapsed,eta=known&&speed>1024?Math.max(0,(known-received)/speed):null;
      sendUpdateProgress(sender,{phase:'download',percent:Math.max(6,Math.min(88,Math.round(6+raw*82))),message:'Scarico aggiornamento',downloaded:received,total:known,speed,etaSeconds:eta});
    },latest.size),
    httpsBuffer(latest.shaUrl,{'Accept':'text/plain'})
  ]);
  sendUpdateProgress(sender,{phase:'verify',percent:92,message:'Verifico integrità SHA-256…',downloaded:exe.length,total:latest.size||exe.length});
  if(latest.size&&exe.length!==latest.size)throw new Error('Dimensione aggiornamento non valida');
  const expected=(shaRaw.toString('utf8').match(/[a-fA-F0-9]{64}/)||[])[0]?.toLowerCase();
  if(!expected)throw new Error('Firma SHA-256 aggiornamento mancante');
  const actual=crypto.createHash('sha256').update(exe).digest('hex');
  if(actual!==expected)throw new Error('Verifica SHA-256 aggiornamento fallita');
  sendUpdateProgress(sender,{phase:'save',percent:96,message:'Pacchetto verificato · preparo installazione…',downloaded:exe.length,total:exe.length,etaSeconds:4});
  const dir=path.join(app.getPath('userData'),'updates');fs.mkdirSync(dir,{recursive:true});
  const updater=path.join(dir,latest.exeName);fs.writeFileSync(updater,exe);
  log('UPDATE_VERIFIED',latest.version,actual,exe.length);
  return {available:true,current,latest:latest.version,updater};
}
function launchVerifiedUpdater(updater){
  // Quit only after Windows confirms that the verified updater process spawned.
  return new Promise((resolve,reject)=>{
    const child=spawn(updater,['/S'],{
      detached:true,
      windowsHide:false,
      stdio:'ignore',
      cwd:path.dirname(updater)
    });
    let settled=false;
    child.once('error',err=>{
      if(settled)return;settled=true;log('UPDATE_LAUNCH_ERROR',err);reject(err);
    });
    child.once('spawn',()=>{
      if(settled)return;settled=true;child.unref();
      log('UPDATE_DIRECT_LAUNCHED',updater,'pid='+String(child.pid||0));
      setTimeout(()=>app.quit(),1200);
      resolve(true);
    });
  });
}

ipcMain.handle('docfix:update:version',()=>app.getVersion());
ipcMain.handle('docfix:update:check',async()=>{try{return {ok:true,...await checkForUpdates()}}catch(e){log('UPDATE_CHECK_FAIL',e);return {ok:false,error:e.message||String(e)}}});
ipcMain.handle('docfix:update:install',async(event)=>{
  try{
    const r=await downloadVerifiedUpdate(event.sender);
    if(!r.available)return {ok:true,...r};
    sendUpdateProgress(event.sender,{phase:'install',percent:98,message:'Applico aggiornamento…',etaSeconds:4});
    await launchVerifiedUpdater(r.updater);
    sendUpdateProgress(event.sender,{phase:'restart',percent:99,message:'Completo aggiornamento…',etaSeconds:2});
    return {ok:true,...r,launching:true};
  }catch(e){
    sendUpdateProgress(event.sender,{phase:'error',percent:0,message:e.message||String(e)});
    log('UPDATE_INSTALL_FAIL',e);return {ok:false,error:e.message||String(e)}
  }
});

function fatalStartup(err){
  log('FATAL_STARTUP',err);
  try{dialog.showErrorBox('DocFix non può avviarsi','Si è verificato un problema nei componenti del programma. Reinstalla DocFix.\n\nDettaglio: '+(err?.message||err));}catch{}
  app.exit(1);
}

process.on('uncaughtException',e=>{log('UNCAUGHT',e);if(!quitting&&!SELF_TEST)dialog.showErrorBox('Errore DocFix','Si è verificato un errore inatteso. Puoi riaprire DocFix; i documenti originali non vengono modificati.');});
process.on('unhandledRejection',e=>log('UNHANDLED_REJECTION',e));

const gotLock=app.requestSingleInstanceLock();
if(!gotLock){app.quit();}else{
  app.on('second-instance',()=>{
    if(mainWindow&&!mainWindow.isDestroyed()){
      if(mainWindow.isMinimized())mainWindow.restore();
      mainWindow.show();mainWindow.focus();mainWindow.moveTop?.();
      log('SECOND_INSTANCE_FOCUSED');
    }else{
      pendingSecondInstance=true;
      log('SECOND_INSTANCE_PENDING');
    }
  });
  app.whenReady().then(async()=>{
    app.setAppUserModelId?.('it.jorrob.docfix');
    initLog();
    registerOcrHandlers({ipcMain,app,log});
    try{if(SELF_TEST)await runSelfTest();else await createWindow({show:true,selfTest:false});}
    catch(e){fatalStartup(e);}
  });
}
app.on('before-quit',()=>{quitting=true;});
app.on('window-all-closed',()=>{try{server?.close();}catch{} if(process.platform!=='darwin'||SELF_TEST)app.quit();});
