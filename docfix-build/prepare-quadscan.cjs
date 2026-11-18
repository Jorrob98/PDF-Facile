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
 // NPM's onnxruntime-web@1.20.1 tarball omits the MIT LICENSE file.
 // Bundle Microsoft's upstream MIT text when not shipped by the tarball.
 (()=>{const target=path.join(dir,'LICENSE-onnxruntime.txt');
  const existing=['LICENSE','LICENSE.txt','LICENSE.md'].map(n=>path.join(ort,n)).find(fs.existsSync);
  if(existing)return copy(existing,'LICENSE-onnxruntime.txt');
  const license=`MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,license);
  return {file:'vendor/quadscan/LICENSE-onnxruntime.txt',bytes:fs.statSync(target).size,sha256:sha(target)};
 })()
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
