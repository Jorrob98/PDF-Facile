'use strict';
/* Build-time ONLY: vendor a pinned open-source corner detector and its model.
 * No online model/CDN calls are permitted by the DocFix renderer.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname,dir=path.join(root,'app','vendor','quadscan');
const modules=path.join(root,'node_modules');
const lib=path.join(modules,'quadscan'),ort=path.join(modules,'onnxruntime-web');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function copy(src,rel){
 if(!fs.existsSync(src))throw new Error('Offline model asset missing: '+src);
 const dst=path.join(dir,rel);
 fs.mkdirSync(path.dirname(dst),{recursive:true});
 fs.copyFileSync(src,dst);
 const size=fs.statSync(dst).size;
 if(size<10)throw new Error('Empty offline asset '+rel);
 return {file:'vendor/quadscan/'+rel,bytes:size,sha256:sha(dst)};
}
const assets=[
 copy(path.join(lib,'dist','quadscan.iife.js'),'quadscan.iife.js'),
 copy(path.join(lib,'models','lcnet100_h_e_bifpn_256_fp32.onnx'),'model.onnx'),
 copy(path.join(lib,'LICENSE'),'LICENSE-quadscan.txt'),
 copy(path.join(lib,'licenses','DocAligner-LICENSE.txt'),'LICENSE-DocAligner.txt'),
 copy(path.join(ort,'LICENSE'),'LICENSE-onnxruntime.txt')
];
const wasmDir=path.join(ort,'dist');
const wasm=fs.readdirSync(wasmDir).filter(name=>/\.wasm$/i.test(name));
if(wasm.length<1)throw new Error('onnxruntime-web WASM engines missing');
for(const name of wasm)assets.push(copy(path.join(wasmDir,name),'ort/'+name));
if(assets.find(a=>a.file.endsWith('/model.onnx'))?.bytes<4_000_000)
 throw new Error('DocAligner model unexpectedly small');
fs.writeFileSync(path.join(dir,'manifest.json'),
 JSON.stringify({runtime:'offline',model:'DocAligner LCNet100',
  package:'quadscan@1.0.0',wasmPackage:'onnxruntime-web@1.20.1',assets},null,2)+'\n');
console.log('DOCFIX_LOCAL_ML_PREPARED',JSON.stringify({
 assets:assets.length,modelBytes:assets.find(a=>a.file.endsWith('/model.onnx')).bytes,
 wasmCount:wasm.length,allLocal:assets.every(a=>a.file.startsWith('vendor/quadscan/'))}));
