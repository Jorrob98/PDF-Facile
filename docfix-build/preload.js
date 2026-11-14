'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('DocFixUpdater',Object.freeze({
  currentVersion:()=>ipcRenderer.invoke('docfix:update:version'),
  lastResult:()=>ipcRenderer.invoke('docfix:update:last-result'),
  check:(channel='stable')=>ipcRenderer.invoke('docfix:update:check',channel),
  install:(channel='stable')=>ipcRenderer.invoke('docfix:update:install',channel),
  onProgress:(callback)=>{
    if(typeof callback!=='function')return ()=>{};
    const handler=(_event,data)=>{try{callback(data)}catch{}};
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