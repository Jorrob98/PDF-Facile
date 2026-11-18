const fs=require('fs'),path=require('path');
const root=__dirname,nm=path.join(root,'node_modules'),v=path.join(root,'app','vendor');
const mkdir=p=>fs.mkdirSync(p,{recursive:true});
const copy=(src,dst)=>{if(!fs.existsSync(src))throw new Error('Manca: '+src);mkdir(path.dirname(dst));fs.copyFileSync(src,dst);console.log(path.relative(root,src),'->',path.relative(root,dst));};
const find=(dir,name)=>{if(!fs.existsSync(dir))return null;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isFile()&&e.name===name)return p;if(e.isDirectory()){const q=find(p,name);if(q)return q;}}return null;};
copy(path.join(nm,'pdfjs-dist','build','pdf.min.mjs'),path.join(v,'pdfjs','pdf.min.mjs'));
copy(path.join(nm,'pdfjs-dist','build','pdf.worker.min.mjs'),path.join(v,'pdfjs','pdf.worker.min.mjs'));
copy(path.join(nm,'pdf-lib','dist','pdf-lib.min.js'),path.join(v,'pdf-lib','pdf-lib.min.js'));
copy(path.join(nm,'tesseract.js','dist','tesseract.min.js'),path.join(v,'tesseract','tesseract.min.js'));
copy(path.join(nm,'tesseract.js','dist','worker.min.js'),path.join(v,'tesseract','worker.min.js'));
const core=path.join(nm,'tesseract.js-core');let cores=0;
for(const f of fs.readdirSync(core))if(/^tesseract-core.*\.wasm\.js$/.test(f)){copy(path.join(core,f),path.join(v,'tesseract-core',f));cores++;}
if(cores<4)throw new Error('Core Tesseract incompleti: '+cores);
const eng=find(path.join(nm,'@tesseract.js-data','eng'),'eng.traineddata.gz');
if(!eng)throw new Error('eng.traineddata.gz non trovato');
copy(eng,path.join(v,'tessdata','eng.traineddata.gz'));
const ita=find(path.join(nm,'@tesseract.js-data','ita'),'ita.traineddata.gz');
if(!ita)throw new Error('ita.traineddata.gz non trovato');
copy(ita,path.join(v,'tessdata','ita.traineddata.gz'));
console.log('Vendor locale pronto: OCR italiano + inglese.');

/* DocFix 1.9.52 prototype: 100% local pretrained four-corner model.
   The 4.5 MB model and ORT WASM runtime are bundled with the Windows
   installer. Never fall back to any remote URL for ID documents. */
const ml=path.join(v,'quadscan'),ort=path.join(nm,'onnxruntime-web','dist');
copy(path.join(nm,'quadscan','dist','quadscan.iife.js'),path.join(ml,'quadscan.iife.js'));
copy(path.join(nm,'quadscan','models','lcnet100_h_e_bifpn_256_fp32.onnx'),path.join(ml,'model.onnx'));
const runtimes=fs.readdirSync(ort).filter(f=>f.endsWith('.wasm')&&f.startsWith('ort-'));
if(!runtimes.some(f=>f.includes('simd')))throw new Error('ONNX WASM SIMD runtime absent');
for(const name of runtimes)copy(path.join(ort,name),path.join(ml,'ort',name));
const license=path.join(nm,'quadscan','licenses','DocAligner-LICENSE.txt');
if(fs.existsSync(license))copy(license,path.join(ml,'DocAligner-LICENSE.txt'));
copy(path.join(nm,'quadscan','LICENSE'),path.join(ml,'quadscan-LICENSE'));
console.log('Rilevatore ML offline presente: Quadscan, modello e runtimes locali.');
