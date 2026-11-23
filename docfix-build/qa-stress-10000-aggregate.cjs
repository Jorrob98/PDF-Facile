'use strict';
/* 10,000-case reproducible stress aggregate.
   Strictly reject missing/duplicate shards, unexecuted scenarios, unsafe
   automatic crops, image-classification errors, or zero good approvals. */
const fs=require('node:fs'),path=require('node:path');
const root=process.argv[2]?path.resolve(process.argv[2]):path.join(__dirname,'stress-10k-shards');
const props=['total','single','physical','auto','manual','falseSingle','unsafeAuto',
 'accurateAuto','proposedGood','proposedBad','errors','autoBelow97','coverageFailures'];
const expected=['normal','perspective','rotation','offcenter','blur','grain','shadow',
 'missingCorner','missingSide','clipped','twoCards','otherBackground'];
const sum=Object.fromEntries(props.map(x=>[x,0]));
sum.scenarios=Object.fromEntries(expected.map(k=>[k,{total:0,single:0,physical:0,
 auto:0,unsafeAuto:0,falseSingle:0}]));
sum.shards=[];sum.failedShards=[];sum.nShards=20;sum.caseDimensions=[420,560];
const fail=(message)=>{sum.failedShards.push(message);};
for(let shard=0;shard<20;shard++){
 const filename='stress-10000-shard-'+shard+'.json',file=path.join(root,filename);
 if(!fs.existsSync(file)){fail('Missing shard '+shard);continue;}
 let x;
 try{x=JSON.parse(fs.readFileSync(file,'utf8'))}
 catch(e){fail('Unreadable JSON shard '+shard+': '+e.message);continue;}
 if(x.shard!==shard||x.globalFirst!==shard*500||x.globalLast!==(shard+1)*500-1||
    x.total!==500||x.scenesPerShard!==500){fail('Invalid/overlapping shard '+shard);continue;}
 for(const key of props){
  if(!Number.isSafeInteger(x[key])||x[key]<0){fail('Invalid '+key+' in '+shard);continue;}
  sum[key]+=x[key];
 }
 for(const k of expected){
  const a=x.byScenario?.[k];
  if(!a||!Number.isInteger(a.total)||a.total<0){fail('Missing scenario '+k+' on shard '+shard);continue;}
  for(const prop of Object.keys(sum.scenarios[k]))sum.scenarios[k][prop]+=a[prop]||0;
 }
 if(!x.success)fail('Stress gate failed on shard '+shard);
 sum.shards.push({id:shard,seed:x.seed,total:x.total,auto:x.auto,manual:x.manual,
  unsafeAuto:x.unsafeAuto,falseSingle:x.falseSingle,errors:x.errors,
  strictIoUBelow97:x.autoBelow97,coverageFailures:x.coverageFailures});
}
if(sum.shards.length!==20)fail('Need 20 complete shards; got '+sum.shards.length);
if(sum.total!==10000)fail('Expected 10000 unique scenes, got '+sum.total);
if(sum.auto+sum.manual!==sum.total)fail('Approved/review counts do not equal total');
if(sum.auto<=0)fail('No successful auto approvals; trivial refuse-all result');
if(sum.unsafeAuto!==0)fail('Dangerous automatic approvals: '+sum.unsafeAuto);
if(sum.falseSingle!==0)fail('False single-document assignments: '+sum.falseSingle);
if(sum.errors!==0)fail('Exceptions: '+sum.errors);
for(const [name,r] of Object.entries(sum.scenarios)){
 if(r.total<830||r.total>835)fail('Unbalanced coverage: '+name+' = '+r.total);
 if(['missingCorner','missingSide','clipped','twoCards'].includes(name)&&r.auto!==0)
  fail('Unsafe approval in '+name+': '+r.auto);
}
sum.success=sum.failedShards.length===0;
const outPath=path.join(__dirname,'STRESS_10000_RESULTS.json');
fs.writeFileSync(outPath,JSON.stringify(sum,null,2)+'\n');
const header=['Scenario','Cases','Single detected','4 sides fitted','Auto approved','Unsafe'];
let report='# DocFix — 10,000-case deterministic stress report\n\n';
report+='Run date: '+new Date().toISOString()+'\n\n';
report+='| Metric | Result |\n|---|---:|\n';
for(const [title,k] of [['Synthetic scenes','total'],['Auto-approved','auto'],
 ['Manual review','manual'],['Approvals below 97% IoU','autoBelow97'],
 ['Approvals cutting >0.5% plastic','coverageFailures'],
 ['Unsafe approvals','unsafeAuto'],['Phantom single-document assignments','falseSingle'],
 ['Exceptions','errors']])report+='| '+title+' | '+sum[k]+' |\n';
report+='\n| '+header.join(' | ')+' |\n|'+header.map(()=>'---').join('|')+'|\n';
for(const [k,v] of Object.entries(sum.scenarios))report+='| '+[k,v.total,v.single,v.physical,v.auto,v.unsafeAuto].join(' | ')+' |\n';
report+='\n**Outcome:** '+(sum.success?'PASS':'FAIL')+'\n';
if(sum.failedShards.length)report+='\n**Failures:** '+sum.failedShards.join('; ')+'\n';
report+='\nImportant: Synthetic tests of three DocFix border modules, not the full OCR/UI/PDF processing chain or a representative sample of real identification documents. IoU threshold is separate from safety cutoff. All scene generation is local to GitHub Actions; no personal documents are uploaded.\n';
fs.writeFileSync(path.join(__dirname,'STRESS_10000_RESULTS.md'),report);
console.log(report);
if(!sum.success){console.error('DOCFIX_10000_FAIL '+sum.failedShards.join(' | '));process.exitCode=1;}
else console.log('DOCFIX_10000_PASS: 20 distinct shards, 10,000 scenes, 0 unsafe approvals.');
