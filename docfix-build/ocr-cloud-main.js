'use strict';
const {safeStorage}=require('electron');
const https=require('https'),fs=require('fs'),path=require('path');

function registerOcrHandlers({ipcMain,app,log}){
  const configPath=()=>path.join(app.getPath('userData'),'ocr-cloud.json');

  function readConfig(){
    try{
      const raw=JSON.parse(fs.readFileSync(configPath(),'utf8'));
      return {
        google:{projectId:String(raw?.google?.projectId||''),apiKeyEnc:String(raw?.google?.apiKeyEnc||'')},
        azure:{endpoint:String(raw?.azure?.endpoint||''),keyEnc:String(raw?.azure?.keyEnc||'')}
      };
    }catch{return {google:{projectId:'',apiKeyEnc:''},azure:{endpoint:'',keyEnc:''}}}
  }
  function writeConfig(cfg){
    const file=configPath();fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,JSON.stringify(cfg,null,2),'utf8');
  }
  function enc(value){
    if(!value)return '';
    if(!safeStorage.isEncryptionAvailable())throw new Error('Cifratura credenziali Windows non disponibile.');
    return safeStorage.encryptString(String(value)).toString('base64');
  }
  function dec(value){
    if(!value)return '';
    if(!safeStorage.isEncryptionAvailable())throw new Error('Cifratura credenziali Windows non disponibile.');
    return safeStorage.decryptString(Buffer.from(value,'base64'));
  }
  function status(){
    const c=readConfig();
    return {
      google:{configured:Boolean(c.google.projectId&&c.google.apiKeyEnc),projectId:c.google.projectId||''},
      azure:{configured:Boolean(c.azure.endpoint&&c.azure.keyEnc),endpoint:c.azure.endpoint||''},
      secureStorage:safeStorage.isEncryptionAvailable()
    };
  }
  function saveConfig(input={}){
    const c=readConfig();
    if(input.clearGoogle)c.google={projectId:'',apiKeyEnc:''};
    else{
      if(typeof input.googleProjectId==='string')c.google.projectId=input.googleProjectId.trim();
      if(typeof input.googleApiKey==='string'&&input.googleApiKey.trim())c.google.apiKeyEnc=enc(input.googleApiKey.trim());
    }
    if(input.clearAzure)c.azure={endpoint:'',keyEnc:''};
    else{
      if(typeof input.azureEndpoint==='string'){
        const ep=input.azureEndpoint.trim().replace(/\/+$/,'');
        if(ep&&!/^https:\/\//i.test(ep))throw new Error('Endpoint Azure non valido: deve iniziare con https://');
        c.azure.endpoint=ep;
      }
      if(typeof input.azureKey==='string'&&input.azureKey.trim())c.azure.keyEnc=enc(input.azureKey.trim());
    }
    writeConfig(c);log('OCR_CONFIG_SAVED','google='+Boolean(c.google.projectId&&c.google.apiKeyEnc),'azure='+Boolean(c.azure.endpoint&&c.azure.keyEnc));
    return status();
  }

  function jsonRequest(url,{method='GET',headers={},body=null,timeout=30000}={}){
    return new Promise((resolve,reject)=>{
      const u=new URL(url),payload=body==null?null:Buffer.from(JSON.stringify(body),'utf8');
      const req=https.request(u,{method,headers:{
        'User-Agent':'DocFix-OCR-MAX/1.9.16',
        'Accept':'application/json',
        ...(payload?{'Content-Type':'application/json','Content-Length':String(payload.length)}:{}),
        ...headers
      }},res=>{
        const chunks=[];let total=0;
        res.on('data',c=>{chunks.push(c);total+=c.length;if(total>40*1024*1024)req.destroy(new Error('Risposta OCR troppo grande'));});
        res.on('end',()=>{
          const raw=Buffer.concat(chunks).toString('utf8');
          let data=null;try{data=raw?JSON.parse(raw):null}catch{}
          const code=res.statusCode||0;
          if(code<200||code>=300){
            const msg=data?.error?.message||data?.message||raw.slice(0,400)||('HTTP '+code);
            const err=new Error(msg);err.statusCode=code;err.headers=res.headers;return reject(err);
          }
          resolve({statusCode:code,headers:res.headers,data,raw});
        });
      });
      req.setTimeout(timeout,()=>req.destroy(new Error('Timeout OCR cloud')));
      req.on('error',reject);
      if(payload)req.write(payload);req.end();
    });
  }

  async function jsonRequestRetry(url,opts={},attempts=3){
    let last;
    for(let i=0;i<attempts;i++){
      try{return await jsonRequest(url,opts)}
      catch(e){
        last=e;const code=Number(e?.statusCode)||0;
        const retryable=!code||[408,425,429,500,502,503,504].includes(code);
        if(!retryable||i===attempts-1)throw e;
        const retryAfter=Number(e?.headers?.['retry-after']);
        const delay=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(5000,retryAfter*1000):Math.min(4000,450*Math.pow(2,i));
        await new Promise(r=>setTimeout(r,delay));
      }
    }
    throw last||new Error('Richiesta OCR non riuscita');
  }

  const stripDataUrl=s=>String(s||'').replace(/^data:image\/[a-z0-9.+-]+;base64,/i,'').replace(/\s+/g,'');
  function validateImageBase64(value){
    const s=stripDataUrl(value);
    if(!s||!/^[A-Za-z0-9+/=]+$/.test(s))throw new Error('Immagine OCR non valida.');
    const approx=s.length*.75;
    if(approx>8.2*1024*1024)throw new Error('Immagine OCR troppo grande: riduci la risoluzione.');
    return s;
  }
  function average(nums){const v=nums.filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:0}
  function googleWords(annotation){
    const words=[],confs=[];
    for(const page of annotation?.pages||[])for(const block of page.blocks||[])for(const para of block.paragraphs||[])for(const word of para.words||[]){
      const text=(word.symbols||[]).map(s=>s.text||'').join('');
      const confidence=Number(word.confidence);
      if(text){words.push({text,confidence:Number.isFinite(confidence)?confidence:null,boundingBox:word.boundingBox||null});if(Number.isFinite(confidence))confs.push(confidence);}
    }
    return {words,confidence:average(confs)};
  }
  async function googleVision(image,cfg){
    const project=encodeURIComponent(cfg.google.projectId),key=encodeURIComponent(dec(cfg.google.apiKeyEnc));
    const url='https://eu-vision.googleapis.com/v1/projects/'+project+'/locations/eu/images:annotate?key='+key;
    const body={requests:[{image:{content:image},features:[{type:'DOCUMENT_TEXT_DETECTION',model:'builtin/latest'}],imageContext:{languageHints:['it','en']}}]};
    const r=await jsonRequestRetry(url,{method:'POST',body,timeout:35000},3);
    const first=r.data?.responses?.[0];
    if(first?.error)throw new Error(first.error.message||'Google Vision OCR non riuscito');
    const text=String(first?.fullTextAnnotation?.text||first?.textAnnotations?.[0]?.description||'').trim();
    const meta=googleWords(first?.fullTextAnnotation);
    return {provider:'google',text,confidence:meta.confidence,words:meta.words};
  }

  async function azureAnalyze(image,cfg,modelId){
    const endpoint=cfg.azure.endpoint.replace(/\/+$/,'');
    const key=dec(cfg.azure.keyEnc);
    const locale=modelId==='prebuilt-read'?'&locale=it-IT':'';
    const startUrl=endpoint+'/documentintelligence/documentModels/'+encodeURIComponent(modelId)+':analyze?api-version=2024-11-30'+locale;
    const start=await jsonRequestRetry(startUrl,{method:'POST',headers:{'Ocp-Apim-Subscription-Key':key},body:{base64Source:image},timeout:35000},3);
    const op=start.headers['operation-location'];
    if(!op)throw new Error('Azure non ha restituito Operation-Location.');
    let last=null;
    for(let i=0;i<42;i++){
      await new Promise(r=>setTimeout(r,i<4?450:750));
      const r=await jsonRequestRetry(op,{headers:{'Ocp-Apim-Subscription-Key':key},timeout:20000},3);
      last=r.data;
      const state=String(last?.status||'').toLowerCase();
      if(state==='succeeded')break;
      if(state==='failed'||state==='canceled')throw new Error(last?.error?.message||'Azure OCR non riuscito');
    }
    if(String(last?.status||'').toLowerCase()!=='succeeded')throw new Error('Azure OCR non ha terminato in tempo.');
    return last.analyzeResult||{};
  }
  function azureWords(ar){
    const words=[],confs=[];
    for(const page of ar.pages||[])for(const word of page.words||[]){
      const confidence=Number(word.confidence);
      words.push({text:String(word.content||''),confidence:Number.isFinite(confidence)?confidence:null,polygon:word.polygon||null});
      if(Number.isFinite(confidence))confs.push(confidence);
    }
    return {words,confidence:average(confs)};
  }
  function primitiveFieldValue(field){
    if(!field||typeof field!=='object')return '';
    if(typeof field.content==='string'&&field.content.trim())return field.content.trim();
    for(const key of ['valueString','valueDate','valueTime','valueCountryRegion','valuePhoneNumber','valueNumber','valueInteger']){
      if(field[key]!==undefined&&field[key]!==null&&String(field[key]).trim())return String(field[key]).trim();
    }
    return '';
  }
  function structuredAzureFields(ar){
    const out=[];
    for(const doc of ar.documents||[])for(const [name,field] of Object.entries(doc.fields||{})){
      const value=primitiveFieldValue(field);if(!value)continue;
      const confidence=Number(field.confidence);
      out.push({name,value,confidence:Number.isFinite(confidence)?confidence:null});
    }
    return out.sort((a,b)=>(b.confidence||0)-(a.confidence||0));
  }
  async function azureRead(image,cfg){
    const ar=await azureAnalyze(image,cfg,'prebuilt-read'),meta=azureWords(ar);
    return {provider:'azure',text:String(ar.content||'').trim(),confidence:meta.confidence,words:meta.words,structuredFields:[]};
  }
  async function azureIdDocument(image,cfg){
    const ar=await azureAnalyze(image,cfg,'prebuilt-idDocument'),meta=azureWords(ar);
    return {provider:'azure-id',text:String(ar.content||'').trim(),confidence:meta.confidence,words:meta.words,structuredFields:structuredAzureFields(ar)};
  }

  const normalizeTokens=text=>String(text||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[A-Z0-9]{2,}/g)||[];
  function tokenAgreement(a,b){
    const A=new Set(normalizeTokens(a)),B=new Set(normalizeTokens(b));if(!A.size||!B.size)return 0;
    let common=0;for(const t of A)if(B.has(t))common++;
    return (2*common)/(A.size+B.size);
  }
  function cfValid(cf){
    cf=String(cf||'').toUpperCase();if(!/^[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]$/.test(cf))return false;
    const odd={0:1,1:0,2:5,3:7,4:9,5:13,6:15,7:17,8:19,9:21,A:1,B:0,C:5,D:7,E:9,F:13,G:15,H:17,I:19,J:21,K:2,L:4,M:18,N:20,O:11,P:3,Q:6,R:8,S:12,T:14,U:16,V:10,W:22,X:25,Y:24,Z:23};
    const even={0:0,1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,A:0,B:1,C:2,D:3,E:4,F:5,G:6,H:7,I:8,J:9,K:10,L:11,M:12,N:13,O:14,P:15,Q:16,R:17,S:18,T:19,U:20,V:21,W:22,X:23,Y:24,Z:25};
    let sum=0;for(let i=0;i<15;i++)sum+=(i%2===0?odd:even)[cf[i]];return String.fromCharCode(65+(sum%26))===cf[15];
  }
  function validatedSignals(text){
    const up=String(text||'').toUpperCase().replace(/[\s.-]+/g,' ');
    const cfs=(up.match(/\b[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]\b/g)||[]).filter(cfValid);
    const vins=up.match(/\b[A-HJ-NPR-Z0-9]{17}\b/g)||[];
    const plates=up.match(/\b[A-Z]{2}\s?[0-9]{3}\s?[A-Z]{2}\b/g)||[];
    const dates=up.match(/\b(?:0?[1-9]|[12][0-9]|3[01])[\/. -](?:0?[1-9]|1[0-2])[\/. -](?:19|20)[0-9]{2}\b/g)||[];
    const mrz=String(text||'').toUpperCase().split(/\r?\n/).filter(x=>/^[A-Z0-9<]{28,44}$/.test(x.replace(/\s/g,'')));
    return {count:cfs.length+vins.length+plates.length+dates.length+mrz.length,cfs,vins,plates,dates,mrz};
  }
  function candidateScore(c,candidates){
    const confidence=Math.max(0,Math.min(1,Number(c.confidence)||0));
    const tokens=normalizeTokens(c.text),signals=validatedSignals(c.text);
    const agreement=candidates.length>1?average(candidates.filter(x=>x!==c).map(x=>tokenAgreement(c.text,x.text))):0;
    const lengthScore=Math.min(1,tokens.length/36),alnum=(String(c.text||'').match(/[A-Za-z0-9]/g)||[]).length/Math.max(1,String(c.text||'').length);
    const structure=Math.min(1,signals.count/4);
    return confidence*.50+agreement*.24+structure*.16+lengthScore*.07+Math.min(1,alnum)*.03;
  }
  function chooseBest(candidates){
    const valid=candidates.filter(c=>String(c?.text||'').trim().length>=2);
    if(!valid.length)return null;
    return valid.map(c=>({...c,score:candidateScore(c,valid),signals:validatedSignals(c.text)})).sort((a,b)=>b.score-a.score)[0];
  }
  function mergeSignals(candidates){
    const out={cfs:[],vins:[],plates:[],dates:[],mrz:[]};
    for(const c of candidates){const s=validatedSignals(c.text);for(const k of Object.keys(out))out[k].push(...s[k]);}
    for(const k of Object.keys(out))out[k]=[...new Set(out[k])];
    return out;
  }
  function identityHint(text){
    const s=String(text||'').toUpperCase();
    return /CARTA.{0,12}IDENTIT|IDENTITY.{0,8}CARD|PATENTE.{0,10}GUIDA|DRIVING.{0,8}LICEN|REPUBBLICA\s+ITALIANA|[IP]<ITA/.test(s)
      || validatedSignals(s).mrz.length>0;
  }
  function mergeStructured(candidates){
    const seen=new Map();
    for(const c of candidates)for(const f of c.structuredFields||[]){
      const key=String(f.name||'').toLowerCase()+'|'+String(f.value||'').toUpperCase();
      const old=seen.get(key);if(!old||(Number(f.confidence)||0)>(Number(old.confidence)||0))seen.set(key,f);
    }
    return [...seen.values()].sort((a,b)=>(b.confidence||0)-(a.confidence||0));
  }

  async function recognize(input={}){
    const cfg=readConfig(),image=validateImageBase64(input.imageBase64),alt=input.altImageBase64?validateImageBase64(input.altImageBase64):image;
    const candidates=[],errors=[];
    if(input.local?.text)candidates.push({provider:'tesseract',text:String(input.local.text),confidence:Number(input.local.confidence)||0,words:[]});
    let google=null;
    if(cfg.google.projectId&&cfg.google.apiKeyEnc){
      try{google=await googleVision(image,cfg);candidates.push(google);}catch(e){errors.push('Google: '+(e.message||e));log('OCR_GOOGLE_FAIL',e);}
    }
    const local=candidates.find(c=>c.provider==='tesseract');
    const firstAgreement=google&&local?tokenAgreement(google.text,local.text):1;
    if(google&&alt!==image&&((Number(google.confidence)||0)<.82||(local&&firstAgreement<.55))){
      try{
        const rescue=await googleVision(alt,cfg);rescue.provider='google-rescue';candidates.push(rescue);
      }catch(e){errors.push('Google rescue: '+(e.message||e));log('OCR_GOOGLE_RESCUE_FAIL',e);}
    }
    const googleCandidates=candidates.filter(c=>c.provider==='google'||c.provider==='google-rescue');
    const agreement=local&&googleCandidates.length?Math.max(...googleCandidates.map(g=>tokenAgreement(g.text,local.text))):1;
    const combinedHint=[local?.text,...googleCandidates.map(g=>g.text)].filter(Boolean).join('\n');
    const isIdentity=Boolean(input.identityLikely)||identityHint(combinedHint);
    const needAzure=Boolean(input.forceAzure)||isIdentity||!google||(Number(google.confidence)||0)<.86||(local&&agreement<.64);
    if(needAzure&&cfg.azure.endpoint&&cfg.azure.keyEnc){
      if(isIdentity){
        try{
          const id=await azureIdDocument(image,cfg);
          if(id.text||id.structuredFields?.length)candidates.push(id);
          else throw new Error('Modello ID senza dati utili');
        }catch(e){
          errors.push('Azure ID: '+(e.message||e));log('OCR_AZURE_ID_FAIL',e);
          try{candidates.push(await azureRead(alt,cfg));}catch(e2){errors.push('Azure Read: '+(e2.message||e2));log('OCR_AZURE_FAIL',e2);}
        }
      }else{
        try{candidates.push(await azureRead(alt,cfg));}catch(e){errors.push('Azure: '+(e.message||e));log('OCR_AZURE_FAIL',e);}
      }
    }
    const best=chooseBest(candidates);
    return {ok:Boolean(best),best,candidates,rescuedSignals:mergeSignals(candidates),structuredFields:mergeStructured(candidates),identityDocument:isIdentity,errors,agreement,status:status()};
  }

  function cloudLogicSelfTest(){
    const mock=structuredAzureFields({documents:[{fields:{
      FirstName:{content:'MARIO',confidence:.99},
      LastName:{content:'ROSSI',confidence:.98},
      DateOfBirth:{valueDate:'1985-01-10',confidence:.97}
    }}]});
    return {
      identity:identityHint('REPUBBLICA ITALIANA CARTA DI IDENTITA'),
      structured:mock.length===3&&mock.some(x=>x.name==='FirstName'&&x.value==='MARIO'),
      agreement:tokenAgreement('MARIO ROSSI 123','MARIO ROSSI 123')>.99
    };
  }

  ipcMain.handle('docfix:ocr:selftest',()=>cloudLogicSelfTest());
  ipcMain.handle('docfix:ocr:status',()=>({ok:true,...status()}));
  ipcMain.handle('docfix:ocr:save',(_e,input)=>{try{return {ok:true,...saveConfig(input)}}catch(e){log('OCR_CONFIG_FAIL',e);return {ok:false,error:e.message||String(e)}}});
  ipcMain.handle('docfix:ocr:recognize',async(_e,input)=>{
    try{const r=await recognize(input);log('OCR_DONE','providers='+r.candidates.map(x=>x.provider).join(','),'best='+(r.best?.provider||'none'),'score='+(r.best?.score?.toFixed?.(3)||'0'));return r;}
    catch(e){log('OCR_FAIL',e);return {ok:false,error:e.message||String(e),candidates:[],errors:[e.message||String(e)]}}
  });
}

module.exports={registerOcrHandlers};
