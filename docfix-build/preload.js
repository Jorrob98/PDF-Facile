'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('DocFixUpdater',Object.freeze({
  currentVersion:()=>ipcRenderer.invoke('docfix:update:version'),
  lastResult:()=>ipcRenderer.invoke('docfix:update:last-result'),
  // No user-visible channels. Catch IPC errors so the practice stays open.
  check:async()=>{
    try{return await ipcRenderer.invoke('docfix:update:check');}
    catch(error){return {ok:false,available:false,error:'IPC check: '+String(error?.message||error)};}
  },
  install:async()=>{
    try{return await ipcRenderer.invoke('docfix:update:install');}
    catch(error){return {ok:false,available:false,error:'IPC install: '+String(error?.message||error)};}
  },
  onProgress:(callback)=>{
    if(typeof callback!=='function')return ()=>{};
    const handler=(_event,data)=>{
      const plain={phase:String(data?.phase||''),percent:Number(data?.percent)||0,
       message:String(data?.message||''),downloaded:Number(data?.downloaded)||0,
       total:Number(data?.total)||0,speed:Number(data?.speed)||0,
       etaSeconds:Number.isFinite(data?.etaSeconds)?Number(data.etaSeconds):null};
      try{callback(plain)}catch{}; // Never forward native IPC events.
    };
    ipcRenderer.on('docfix:update:progress',handler);
    return ()=>ipcRenderer.removeListener('docfix:update:progress',handler);
  }
}));
contextBridge.exposeInMainWorld('DocFixOCRCloud',Object.freeze({
  status:()=>ipcRenderer.invoke('docfix:ocr:status'),
  saveConfig:(config)=>ipcRenderer.invoke('docfix:ocr:save',config),
  recognize:(payload)=>ipcRenderer.invoke('docfix:ocr:recognize',payload),
  selfTest:()=>ipcRenderer.invoke('docfix:ocr:selftest')
}));