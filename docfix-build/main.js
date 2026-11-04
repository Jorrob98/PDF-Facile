'use strict';
const {app,BrowserWindow,Menu,shell}=require('electron');
const http=require('http'),fs=require('fs'),path=require('path');
let server;
const root=path.join(__dirname,'app');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm','.gz':'application/gzip','.pdf':'application/pdf'};
function startLocalServer(){
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
     fs.createReadStream(requested).pipe(res);
    });
   }catch(e){res.writeHead(500);res.end('DocFix startup error');}
  });
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>resolve(server.address().port));
 });
}
async function createWindow(){
 const port=await startLocalServer();
 const win=new BrowserWindow({
  title:'DocFix Desktop',width:1320,height:920,minWidth:960,minHeight:680,center:true,show:false,
  backgroundColor:'#edf3f5',icon:path.join(__dirname,'build','icon.png'),autoHideMenuBar:true,
  webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}
 });
 Menu.setApplicationMenu(null);
 win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//i.test(url))shell.openExternal(url);return {action:'deny'};});
 win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith(`http://127.0.0.1:${port}/`))e.preventDefault();});
 await win.loadURL(`http://127.0.0.1:${port}/index.html`);
 win.once('ready-to-show',()=>win.show());
}
app.whenReady().then(createWindow).catch(err=>{console.error(err);app.quit();});
app.on('window-all-closed',()=>{if(server){try{server.close()}catch{}}app.quit();});
