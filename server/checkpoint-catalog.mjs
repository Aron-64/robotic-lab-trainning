import {promises as fs} from 'node:fs'
import path from 'node:path'
export async function inspectWeights(folder){
 const exists=async(name,directory=false)=>{const s=await fs.lstat(path.join(folder,name)).catch(()=>null);return !!s&&!s.isSymbolicLink()&&(directory?s.isDirectory():s.isFile()&&s.size>0)}
 const pytorch=await exists('model.safetensors'),jax=await exists('params',true)
 const format=pytorch?'pytorch':jax?'jax':'unknown'
 const resumable=pytorch?(await exists('optimizer.pt')&&await exists('metadata.pt')):jax&&await exists('train_state',true)
 let size=0,count=0;async function walk(p){if(++count>200000)throw new Error('目录条目过多');const st=await fs.lstat(p);if(st.isSymbolicLink())throw new Error('权重目录包含符号链接');if(st.isDirectory())for(const n of await fs.readdir(p))await walk(path.join(p,n));else if(st.isFile())size+=st.size;else throw new Error('不支持的文件类型')}
 await walk(folder)
 return {format,resumable,size,complete:format!=='unknown',note:'仅检查文件结构，不代表张量、优化器或架构兼容性已验证'}
}
export async function scanCheckpoints(folder){
 const dirs=(await fs.readdir(folder,{withFileTypes:true})).filter(d=>d.isDirectory()&&/^\d+$/.test(d.name)&&Number.isSafeInteger(Number(d.name))).sort((a,b)=>Number(a.name)-Number(b.name))
 if(dirs.length>500)throw new Error('实验目录超过 500 个 Checkpoints，请缩小范围。')
 const result=[]
 for(const d of dirs){try{result.push({name:d.name,step:Number(d.name),...await inspectWeights(path.join(folder,d.name))})}catch(e){result.push({name:d.name,step:Number(d.name),format:'unknown',resumable:false,complete:false,size:0,note:e.message})}}
 return result
}
