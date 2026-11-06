import {promises as fs} from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
export const outputRoot=path.resolve(process.env.TRAINING_OUTPUT_ROOT||'training-outputs')
export const outputTimezone=process.env.TRAINING_TIMEZONE||'Asia/Shanghai'
export function safeName(value){
 const cleaned=String(value??'').normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'')
 let result='';for(const char of cleaned){if(Buffer.byteLength(result+char)>60)break;result+=char}
 return result||'未命名'
}
export function outputName(config,date=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:outputTimezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]))
 return [config.name,config.modelName,config.datasetName].map(safeName).join('_')+`_${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`
}
export async function createOutput(config,{root=outputRoot,date=new Date()}={}){
 await fs.mkdir(root,{recursive:true});const base=outputName(config,date)
 for(let attempt=0;attempt<10;attempt++){
  const target=path.join(root,base+(attempt?'_'+randomUUID().slice(0,8):''))
  try{await fs.mkdir(target);return target}catch(e){if(e.code!=='EEXIST')throw e}
 }
 throw new Error('无法创建独立输出目录，请重试。')
}
