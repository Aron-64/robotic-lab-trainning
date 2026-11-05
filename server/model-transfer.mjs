import {inspectWeights,scanCheckpoints} from './checkpoint-catalog.mjs'
import {promises as fs,createWriteStream} from 'node:fs'
import {pipeline} from 'node:stream/promises'
import {Transform} from 'node:stream'
import path from 'node:path'
const within=(base,p)=>p===base||p.startsWith(base+path.sep)
export async function validateTransfer(input,storage,roots=(process.env.MODEL_TRANSFER_ROOTS||'/mnt/data').split(path.delimiter)){
 const name=String(input.name??'').trim();if(!name||name.length>80)throw new Error('模型名称应为 1～80 字。')
 const allowed=await Promise.all(roots.map(p=>fs.realpath(p).catch(()=>null)))
 const weightMode=input.weightMode??'base';if(!['base','checkpoints','none'].includes(weightMode))throw new Error('权重来源无效');
 const config={name,mode:'transfer',github:'',weights:'',weightMode,selectedCheckpoints:[]}
 for(const key of ['sourceCode','sourceWeights','sourceEnvironment']){
  if(key==='sourceWeights'&&weightMode==='none'){config.sourceWeights='';continue}
  const p=String(input[key]??'').trim();if(!path.isAbsolute(p))throw new Error('代码、权重和环境必须填写云容器内绝对路径。')
  const real=await fs.realpath(p);if(!allowed.some(base=>base&&within(base,real)))throw new Error('源路径不在 MODEL_TRANSFER_ROOTS 允许目录内。')
  if(!(await fs.stat(real)).isDirectory())throw new Error('代码、权重和环境路径必须为目录。')
  const target=await fs.realpath(storage)
  if(within(real,target)||within(target,real))throw new Error('源目录不能与模型管理目录相互包含。')
  config[key]=real
 }
 if(config.sourceWeights&&within(config.sourceWeights,config.sourceCode))throw new Error('权重目录不能包含整个代码目录。')
 if(within(config.sourceEnvironment,config.sourceCode)||within(config.sourceEnvironment,config.sourceWeights))throw new Error('代码和权重不能位于环境目录内。')
 if(weightMode==='checkpoints'){const selected=input.selectedCheckpoints??[];if(!Array.isArray(selected)||selected.length>500||selected.some(n=>typeof n!=='string'||!/^\d+$/.test(n)))throw new Error('Checkpoint 选择无效');config.selectedCheckpoints=[...new Set(selected)]}
 await fs.access(path.join(config.sourceEnvironment,'bin/python'),fs.constants.X_OK)
 return config
}
export async function transferModel(job,{root,executor,phase,log}){
 const config=await validateTransfer(job,root)
 Object.assign(job,config)
 const base=path.join(root,job.id)
 job.paths={root:base,code:path.join(base,'code'),weights:path.join(base,'weights'),environment:config.sourceEnvironment,python:path.join(config.sourceEnvironment,'bin/python')}
 await phase(job,'checking','验证原环境 Python 与依赖；不会安装或修改原环境')
 const result=await executor(job,job.paths.python,['-I','-c',"import json,sys,importlib.util,importlib.metadata as m; print(json.dumps({'pip':importlib.util.find_spec('pip') is not None,'prefix':sys.prefix,'python':sys.version.split()[0],'torch':next((d.version for d in m.distributions() if d.metadata.get('Name','').lower()=='torch'),'未安装')}))"],{cwd:base,timeout:30000})
 job.runtime=JSON.parse(result.trim().split('\n').at(-1))
 if(await fs.realpath(job.runtime.prefix)!==config.sourceEnvironment)throw new Error('Python 实际环境与填写的 env 目录不一致。')
 job.environmentCheck=job.runtime.pip===false?'依赖未验证：原环境未安装 pip':'依赖检查通过';
 if(job.runtime.pip!==false)await executor(job,job.paths.python,['-m','pip','check'],{cwd:base,timeout:120000});else log(job,job.environmentCheck)
 job.importedCheckpoints=[];job.baseWeightInfo=null
 if(job.weightMode==='checkpoints'){const candidates=await scanCheckpoints(config.sourceWeights);if(!config.selectedCheckpoints.length)throw new Error('至少选择一个 Checkpoint');for(const name of config.selectedCheckpoints){const cp=candidates.find(c=>c.name===name);if(!cp?.complete)throw new Error(`Checkpoint ${name} 未识别到完整模型文件结构`);job.importedCheckpoints.push({...cp,path:path.join(job.paths.weights,name),experiment:config.sourceWeights})}}
 else if(job.weightMode==='base')job.baseWeightInfo=await inspectWeights(config.sourceWeights)
 await phase(job,'scanning','扫描代码和权重，排除原 env 目录')
 const entries=[];let total=0,visited=0
 async function scan(source,target,codeTree=false){
  if(job.cancelRequested)throw new Error('已取消')
  if(++visited>200000)throw new Error('目录条目过多。')
  if(within(config.sourceEnvironment,source))return
  if(codeTree){const relative=path.relative(config.sourceCode,source),parts=relative.split(path.sep);if(parts.some(p=>['.git','wandb','__pycache__','.pytest_cache','.cache','.venv','env','venv','.venv_copied_broken'].includes(p))||parts[0]==='checkpoints'||source===config.sourceWeights||source.endsWith('.log'))return}
  const info=await fs.lstat(source)
  if(info.isSymbolicLink())throw new Error(`源目录包含符号链接，请先准备普通文件副本：${source}`)
  if(info.isDirectory()){for(const name of await fs.readdir(source))await scan(path.join(source,name),path.join(target,name),codeTree)}
  else if(info.isFile()){entries.push({source,target,size:info.size});total+=info.size;if(!Number.isSafeInteger(total))throw new Error('文件总大小过大。')}
  else throw new Error('仅支持普通文件和目录。')
 }
 await scan(config.sourceCode,job.paths.code,true);if(job.weightMode==='base')await scan(config.sourceWeights,job.paths.weights);if(job.weightMode==='checkpoints')for(const cp of job.importedCheckpoints)await scan(path.join(config.sourceWeights,cp.name),cp.path)
 if(!entries.length)throw new Error('没有可复制的代码或权重文件。')
 const space=await fs.statfs(root);if(total>space.bavail*space.bsize)throw new Error('管理目录磁盘空间不足。')
 // Retry rebuilds only this import's copies; original folders and env are untouched.
 for(const folder of [job.paths.code,job.paths.weights]){await fs.rm(folder,{recursive:true,force:true});await fs.mkdir(folder,{recursive:true})}
 job.progress={copiedBytes:0,totalBytes:total,copiedFiles:0,totalFiles:entries.length}
 await phase(job,'copying','复制代码和权重；原环境保留并复用')
 for(const entry of entries){
  if(job.cancelRequested)throw new Error('已取消')
  if(await fs.realpath(entry.source)!==entry.source)throw new Error('源文件路径已变化。')
  await fs.mkdir(path.dirname(entry.target),{recursive:true})
  const handle=await fs.open(entry.source,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW)
  try{
   const info=await handle.stat();if(!info.isFile()||info.size!==entry.size)throw new Error('源文件已变化。')
   let bytes=0
   const guard=new Transform({transform(chunk,encoding,callback){if(job.cancelRequested)return callback(new Error('已取消'));bytes+=chunk.length;if(bytes>entry.size)return callback(new Error('源文件大小已变化。'));job.progress.copiedBytes+=chunk.length;callback(null,chunk)}})
   await pipeline(handle.createReadStream({autoClose:false}),guard,createWriteStream(entry.target,{flags:'wx',mode:info.mode&0o777}))
   if(bytes!==entry.size)throw new Error('源文件复制不完整。')
  }finally{await handle.close()}
  job.progress.copiedFiles++;log(job,`已复制 ${job.progress.copiedFiles}/${entries.length}：${path.relative(base,entry.target)}`)
 }
 if(job.cancelRequested)throw new Error('已取消')
 job.status='ready';job.error='';log(job,'转移完成：代码与权重已复制，原 env 路径已复用。未验证训练；环境中的 editable 依赖可能仍引用原代码，请保留原目录。')
}
