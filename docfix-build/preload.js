'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('DocFixUpdater',Object.freeze({
  currentVersion:()=>ipcRenderer.invoke('docfix:update:version'),
  check:()=>ipcRenderer.invoke('docfix:update:check'),
  install:()=>ipcRenderer.invoke('docfix:update:install')
}));
