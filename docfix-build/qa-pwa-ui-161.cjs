'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=__dirname,read=p=>fs.readFileSync(path.join(root,p),'utf8');
const runtime=read('app/stability.js');
const h=read('app/index.html'),css=read('app/docfix-pwa-refresh.css'),js=read('app/docfix-ui-refresh.js'),svg=read('app/docfix-mark.svg'),main=read('main.js');
assert.ok(h.includes('src="./docfix-mark.svg"')&&h.includes('class="logo"'),'new visible PWA mark');
assert.ok(h.includes('rel="icon" href="./docfix-mark.svg"'),'favicon set to new offline mark');
assert.ok(h.includes('docfix-ui-refresh.js'),'visual theme imported');
assert.ok(h.indexOf('stability.js')<h.indexOf('docfix-ui-refresh.js'),'new theme loads after old UI styles');
assert.ok(js.includes("stylesheet.href='./docfix-pwa-refresh.css'"),'theme file loaded locally');
assert.ok(!/https?:\/\//i.test(js+css),'no external stylesheet or resource');
assert.ok(svg.includes('viewBox="0 0 512 512"')&&svg.includes('linearGradient')&&svg.includes('path'),'scalable mark');
for(const k of ['dropzone','workspace','cards','download','editor','edit-apply','corners','edit-zoom' ]){
 assert.ok(h.includes(k),k+' kept');
}
for(const k of ['.top','.dropzone','.has-document .pages','.page-card','.preview','.card-controls','.action-bar','.editor-dialog','.corner']){
 assert.ok(css.includes(k),'PWA theme covers '+k);
}
assert.ok(h.includes('document.body.classList.remove(\'has-document\')'),'reset untouched');
assert.ok(h.includes('entries.some(e=>e.manualPending===true)'),'no unverified export');
assert.ok(h.includes('e.processed=window.DocFixScanner.process(editSource,{crop:true,quad:editQuad,rotation:0'),'final corrected pixels stay original');
assert.ok(!css.includes('pointer-events:none!important')&&!css.includes('#download{display:none'),'no blanket blocked controls');
assert.ok(runtime.includes('docfix-update-button'),'updater still constructed in stability module');
assert.ok(main.includes('docfix-pwa-refresh.css')&&main.includes('docfix-mark.svg'),'startup verifies local visual assets');
console.log('PASS: brand SVG/favicon, offline PWA theme, editor, two large cards, manual export locks, unchanged functional IDs');
