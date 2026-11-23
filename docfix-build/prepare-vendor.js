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

/* Local DocAligner model and local ONNX Runtime: ZERO CDN fetch at runtime. */
const ort=path.join(nm,'onnxruntime-web','dist'),ml=path.join(v,'docfix-ml');
copy(path.join(ort,'ort.min.js'),path.join(ml,'ort.min.js'));
let wasmCount=0;
for(const name of fs.readdirSync(ort)){
  if(/^ort-wasm.*\.(?:wasm|mjs)$/.test(name)){
    copy(path.join(ort,name),path.join(ml,name));wasmCount++;
  }
}
if(wasmCount<1)throw new Error('ONNX Runtime WASM assente');
copy(path.join(nm,'quadscan','models','lcnet100_h_e_bifpn_256_fp32.onnx'),
 path.join(ml,'lcnet100_h_e_bifpn_256_fp32.onnx'));
copy(path.join(nm,'quadscan','licenses','DocAligner-LICENSE.txt'),
 path.join(ml,'DocAligner-LICENSE.txt'));
console.log('Vendor locale pronto: OCR italiano + inglese + DocAligner AI offline (nessun CDN).');

