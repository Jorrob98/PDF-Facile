'use strict';
const {app,BrowserWindow,Menu,shell,session,dialog,ipcMain}=require('electron');
const http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {spawn}=require('child_process');

let server=null, mainWindow=null, logFile=null, quitting=false;
const SELF_TEST=process.argv.includes('--self-test');
const root=path.join(__dirname,'app');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm','.gz':'application/gzip','.pdf':'application/pdf'};

function initLog(){
  try{
    const dir=path.join(app.getPath('userData'),'logs');
    fs.mkdirSync(dir,{recursive:true});
    logFile=path.join(dir,'docfix.log');
    if(fs.existsSync(logFile)&&fs.statSync(logFile).size>1024*1024)fs.renameSync(logFile,logFile+'.old');
    log('START','DocFix Desktop 1.3.0',process.platform,process.arch,SELF_TEST?'SELF_TEST':'NORMAL');
  }catch(e){console.error(e);}
}
function log(...parts){
  const line='['+new Date().toISOString()+'] '+parts.map(v=>v instanceof Error?(v.stack||v.message):String(v)).join(' ')+'\n';
  try{if(logFile)fs.appendFileSync(logFile,line);}catch{}
  console.log(line.trim());
}
function requiredFiles(){
  return [
    'index.html','group1-safe-crop.js','group2-orientation.js','group3-quality.js','group5-export.js','stability.js',
    'vendor/pdfjs/pdf.min.mjs','vendor/pdfjs/pdf.worker.min.mjs','vendor/pdf-lib/pdf-lib.min.js',
    'vendor/tesseract/tesseract.min.js','vendor/tesseract/worker.min.js','vendor/tessdata/eng.traineddata.gz'
  ];
}
function validateBundle(){
  const missing=requiredFiles().filter(rel=>!fs.existsSync(path.join(root,...rel.split('/'))));
  const coreDir=path.join(root,'vendor','tesseract-core');
  let cores=[];
  try{cores=fs.readdirSync(coreDir).filter(f=>/^tesseract-core.*\.wasm\.js$/.test(f));}catch{}
  if(cores.length<4)missing.push('vendor/tesseract-core (core WASM)');
  if(missing.length)throw new Error('Componenti DocFix mancanti: '+missing.join(', '));
  log('BUNDLE_OK','cores='+cores.length);
}
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
          res.setHeader('Cache-Control','no-store');
          res.setHeader('Cross-Origin-Opener-Policy','same-origin');
          res.setHeader('X-Content-Type-Options','nosniff');
          fs.createReadStream(requested).on('error',e=>{log('READ_ERROR',e);if(!res.headersSent)res.writeHead(500);res.end();}).pipe(res);
        });
      }catch(e){log('SERVER_ERROR',e);res.writeHead(500);res.end('DocFix startup error');}
    });
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{const p=server.address().port;log('SERVER_READY',p);resolve(p);});
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
  validateBundle();
  const port=await startLocalServer();
  applyOfflinePolicy(port);
  const win=new BrowserWindow({
    title:'DocFix Desktop',width:1320,height:920,minWidth:960,minHeight:680,center:true,show:false,
    backgroundColor:'#edf3f5',icon:path.join(__dirname,'build','icon.png'),autoHideMenuBar:true,
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:!app.isPackaged,preload:path.join(__dirname,'preload.js')}
  });
  if(!selfTest)mainWindow=win;
  Menu.setApplicationMenu(null);
  win.webContents.on('console-message',(_e,level,message)=>{if(level>=2)log('RENDERER',level,message);});
  win.webContents.on('render-process-gone',(_e,details)=>log('RENDER_GONE',JSON.stringify(details)));
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//i.test(url)&&!selfTest)shell.openExternal(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('http://127.0.0.1:'+port+'/')){log('NAV_BLOCKED',url);e.preventDefault();}});
  await win.loadURL('http://127.0.0.1:'+port+'/index.html');
  log('WINDOW_LOADED');
  if(show)win.once('ready-to-show',()=>{win.show();log('WINDOW_SHOWN');});
  if(!selfTest){
    win.on('unresponsive',async()=>{
      log('WINDOW_UNRESPONSIVE');
      const {response}=await dialog.showMessageBox(win,{type:'warning',title:'DocFix non risponde',message:'DocFix sta impiegando troppo tempo.',detail:'Puoi ricaricare il programma senza cancellare i file originali sul PC.',buttons:['Ricarica DocFix','Chiudi'],defaultId:0,cancelId:1});
      if(response===0)win.reload(); else win.close();
    });
  }
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
        out.modules=!!window.DocFixGroup1&&!!window.DocFixGroup2&&!!window.DocFixGroup3&&!!window.DocFixGroup5&&!!window.DocFixStability;
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
        const worker=await Tesseract.createWorker('eng',1,{legacyCore:true,legacyLang:true,workerPath:abs('./vendor/tesseract/worker.min.js'),corePath:abs('./vendor/tesseract-core/'),langPath:abs('./vendor/tessdata'),gzip:true});
        const ocr=await worker.recognize(c);await worker.terminate();
        out.ocr=typeof ocr?.data?.text==='string'&&ocr.data.text.length>0;
        out.localFetch=(await fetch('./index.html',{cache:'no-store'})).ok;
        out.updaterBridge=!!window.DocFixUpdater;
        out.updaterVersion=window.DocFixUpdater?(await window.DocFixUpdater.currentVersion())==='1.3.0':false;
        out.updaterButton=!!document.querySelector('#docfix-update-button');
        const mc=document.createElement('canvas');mc.width=900;mc.height=1200;const mg=mc.getContext('2d');mg.fillStyle='#b7895f';mg.fillRect(0,0,mc.width,mc.height);
        for(const y of [230,620]){mg.fillStyle='#d9eef0';mg.fillRect(130,y,640,360);mg.fillStyle='#1b6380';mg.fillRect(130,y,640,80);mg.fillStyle='#fff';mg.fillRect(170,y+120,560,70);mg.fillStyle='#111';for(let x=190;x<700;x+=12)mg.fillRect(x,y+135,5,40);mg.fillStyle='#222';mg.font='32px Arial';mg.fillText('DOCFIX TEST',190,y+250);}
        const multi=window.DocFixDesktopDiagnostics?.multiCardCandidates(mc)||[];
        out.multiCard=multi.length===2&&multi.every(x=>x.status==='found');
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
function httpsBuffer(url,headers={},redirects=0){
  return new Promise((resolve,reject)=>{
    if(redirects>6)return reject(new Error('Troppi reindirizzamenti durante il download'));
    const req=https.get(url,{headers:{'User-Agent':'DocFix-Desktop-Updater/1.3','Accept':'application/vnd.github+json',...headers}},res=>{
      const code=res.statusCode||0;
      if(code>=300&&code<400&&res.headers.location){res.resume();return resolve(httpsBuffer(new URL(res.headers.location,url).toString(),headers,redirects+1));}
      if(code!==200){res.resume();return reject(new Error('Server aggiornamenti non disponibile ('+code+')'));}
      const chunks=[];let total=0;
      res.on('data',c=>{chunks.push(c);total+=c.length;if(total>220*1024*1024){req.destroy(new Error('Aggiornamento troppo grande'));}});
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
async function downloadVerifiedUpdate(){
  const latest=await getLatestUpdate();
  const current=app.getVersion();
  if(!isNewerVersion(latest.version,current))return {available:false,current,latest:latest.version};
  log('UPDATE_DOWNLOAD_START',current,'->',latest.version);
  const [exe,shaRaw]=await Promise.all([httpsBuffer(latest.exeUrl,{'Accept':'application/octet-stream'}),httpsBuffer(latest.shaUrl,{'Accept':'text/plain'})]);
  if(latest.size&&exe.length!==latest.size)throw new Error('Dimensione aggiornamento non valida');
  const expected=(shaRaw.toString('utf8').match(/[a-fA-F0-9]{64}/)||[])[0]?.toLowerCase();
  if(!expected)throw new Error('Firma SHA-256 aggiornamento mancante');
  const actual=crypto.createHash('sha256').update(exe).digest('hex');
  if(actual!==expected)throw new Error('Verifica SHA-256 aggiornamento fallita');
  const dir=path.join(app.getPath('userData'),'updates');fs.mkdirSync(dir,{recursive:true});
  const updater=path.join(dir,latest.exeName);fs.writeFileSync(updater,exe);
  log('UPDATE_VERIFIED',latest.version,actual,exe.length);
  return {available:true,current,latest:latest.version,updater};
}
function launchVerifiedUpdater(updater){
  const dir=path.dirname(updater),helper=path.join(dir,'apply-docfix-update.ps1'),exe=process.execPath;
  const ps=[
    "$ErrorActionPreference='Stop'",
    "$u="+JSON.stringify(updater),
    "$appExe="+JSON.stringify(exe),
    "Start-Sleep -Milliseconds 900",
    "$p=Start-Process -FilePath $u -ArgumentList '/S' -PassThru -Wait",
    "if($p.ExitCode -eq 0){Start-Sleep -Milliseconds 900;Start-Process -FilePath $appExe}",
    "Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue"
  ].join("\r\n");
  fs.writeFileSync(helper,ps,'utf8');
  const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',helper],{detached:true,windowsHide:true,stdio:'ignore'});
  child.unref();
  log('UPDATE_LAUNCHED',updater);
  setTimeout(()=>app.quit(),350);
  return true;
}

ipcMain.handle('docfix:update:version',()=>app.getVersion());
ipcMain.handle('docfix:update:check',async()=>{try{return {ok:true,...await checkForUpdates()}}catch(e){log('UPDATE_CHECK_FAIL',e);return {ok:false,error:e.message||String(e)}}});
ipcMain.handle('docfix:update:install',async()=>{try{const r=await downloadVerifiedUpdate();if(!r.available)return {ok:true,...r};launchVerifiedUpdater(r.updater);return {ok:true,...r,launching:true};}catch(e){log('UPDATE_INSTALL_FAIL',e);return {ok:false,error:e.message||String(e)}}});

function fatalStartup(err){
  log('FATAL_STARTUP',err);
  try{dialog.showErrorBox('DocFix non può avviarsi','Si è verificato un problema nei componenti del programma. Reinstalla DocFix.\n\nDettaglio: '+(err?.message||err));}catch{}
  app.exit(1);
}

process.on('uncaughtException',e=>{log('UNCAUGHT',e);if(!quitting&&!SELF_TEST)dialog.showErrorBox('Errore DocFix','Si è verificato un errore inatteso. Puoi riaprire DocFix; i documenti originali non vengono modificati.');});
process.on('unhandledRejection',e=>log('UNHANDLED_REJECTION',e));

const gotLock=app.requestSingleInstanceLock();
if(!gotLock){app.quit();}else{
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();log('SECOND_INSTANCE_FOCUSED');}});
  app.whenReady().then(async()=>{
    initLog();
    try{if(SELF_TEST)await runSelfTest();else await createWindow({show:true,selfTest:false});}
    catch(e){fatalStartup(e);}
  });
}
app.on('before-quit',()=>{quitting=true;});
app.on('window-all-closed',()=>{try{server?.close();}catch{} if(process.platform!=='darwin'||SELF_TEST)app.quit();});
