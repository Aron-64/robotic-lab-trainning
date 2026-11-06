import {promises as fs} from 'node:fs'
import path from 'node:path'
export async function inspectWeights(folder){
 const exists=async(name,directory=false)=>{const s=await fs.lstat(path.join(folder,name)).catch(()=>null);return !!s&&!s.isSymbolicLink()&&(directory?s.isDirectory():s.isFile()&&s.size>0)}
 const names=await fs.readdir(folder);let hasWeights=false;for(const name of names)if(/\.(safetensors|bin|pt|pth|ckpt)$/i.test(name)&&! /^(optimizer|metadata|scheduler|rng)/i.test(name)&&await exists(name))hasWeights=true
 const pytorch=await exists('model.safetensors'),jax=await exists('params',true)
 const format=pytorch?'pytorch':jax?'jax':'unknown'
 const resumable=pytorch?(await exists('optimizer.pt')&&await exists('metadata.pt')):jax&&await exists('train_state',true)
 let size=0,count=0;async function walk(p){if(++count>200000)throw new Error('目录条目过多');const st=await fs.lstat(p);if(st.isSymbolicLink())throw new Error('权重目录包含符号链接');if(st.isDirectory())for(const n of await fs.readdir(p))await walk(path.join(p,n));else if(st.isFile())size+=st.size;else throw new Error('不支持的文件类型')}
 await walk(folder)
 return {format,resumable,size,complete:format!=='unknown'||hasWeights,note:'仅检查文件结构，不代表张量、优化器或架构兼容性已验证'}
}
export async function scanCheckpoints(folder){
 const entries=await fs.readdir(folder,{withFileTypes:true})
 const marker=async p=>{const names=await fs.readdir(p);return names.some(n=>n==='params'||(/\.(safetensors|bin|pt|pth|ckpt)$/i.test(n)&&!/^(optimizer|metadata|scheduler|rng)/i.test(n)))}
 // A directory that already contains weights is one version, not an experiment root.
 const dirs=await marker(folder)?['.']:entries.filter(d=>d.isDirectory()&&!d.name.startsWith('.')).map(d=>d.name)
 if(dirs.length>500)throw new Error('子目录超过 500 个，请缩小扫描范围。')
 const result=[]
 for(const name of dirs){const target=path.join(folder,name);if(!await marker(target))continue;try{
  const info=await inspectWeights(target);if(!info.complete)continue
  const label=name==='.'?path.basename(folder):name
  const step=/^\d+$/.test(label)&&Number.isSafeInteger(Number(label))?Number(label):null
  result.push({name,step,...info})
 }catch(e){result.push({name,step:null,format:'unknown',resumable:false,complete:false,size:0,note:e.message})}}
 return result.sort((a,b)=>(a.step??-1)-(b.step??-1)||a.name.localeCompare(b.name))
}
