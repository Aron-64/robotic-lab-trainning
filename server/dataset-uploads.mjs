import {datasetProjects,datasetFormats,createVisualizationCache,serveDatasetVideo} from './dataset-visualizer.mjs'
import {promises as fs,createWriteStream,constants} from 'node:fs'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {Transform} from 'node:stream'
import {pipeline} from 'node:stream/promises'
export function validateFiles(files,maxBytes){
 if(!Array.isArray(files)||!files.length||files.length>10000)throw new Error('请选择 1～10,000 个文件。')
 const names=new Set();let total=0
 const result=files.map(f=>{const name=String(f.path??'').normalize('NFC');if(!name||name.length>800||name.includes('\\')||/[\x00-\x1f:*?"<>|]/.test(name)||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..'||p.endsWith('.')||p.endsWith(' ')))throw new Error('文件相对路径不合法。');if(names.has(name.toLowerCase()))throw new Error('存在重复文件路径。');names.add(name.toLowerCase());if(!Number.isSafeInteger(f.size)||f.size<0)throw new Error('文件大小无效。');total+=f.size;if(!Number.isSafeInteger(total)||total>maxBytes)throw new Error('数据集大小超过服务端上传限制。');return {path:name,size:f.size,uploaded:false}})
 for(const name of names){const parts=name.split('/');for(let i=1;i<parts.length;i++)if(names.has(parts.slice(0,i).join('/')))throw new Error('文件与文件夹路径冲突。')}
 return {files:result,total}
}
export function createDatasetService({root=path.resolve(process.env.DATASET_STORAGE_ROOT||'managed-datasets'),maxBytes=Number(process.env.DATASET_MAX_BYTES??100*1024**3),importRoots=(process.env.DATASET_IMPORT_ROOTS||'/mnt/data').split(path.delimiter)}={}){
 const sessions=new Map(),running=new Map(),visualizations=createVisualizationCache();let ready
 const dir=id=>path.join(root,id)
 async function persist(s){const target=path.join(dir(s.id),'dataset.json'),temp=target+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(s,null,2));await fs.rename(temp,target)}
 async function init(){if(!ready)ready=(async()=>{await fs.mkdir(root,{recursive:true});for(const d of await fs.readdir(root,{withFileTypes:true})){if(!d.isDirectory()||!/^dataset-[a-f0-9-]+$/.test(d.name))continue;try{const s=JSON.parse(await fs.readFile(path.join(root,d.name,'dataset.json'),'utf8'));if(s.id===d.name){if(s.status==='copying'){s.status='failed';s.message='服务重启，复制中断，请取消并重新导入。'}sessions.set(s.id,s)}}catch{}}})();await ready}
 function view(s){return {...s,path:path.join(dir(s.id),'files'),fileCount:s.files.length,uploadedBytes:s.files.reduce((n,f)=>n+(f.uploaded?f.size:0),0)}}
 function send(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
 async function readJson(req){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2*1024**2)throw new Error('文件清单过大。')}return JSON.parse(body)}
 const inside=(base,target)=>target===base||target.startsWith(base+path.sep)
 async function copyCloud(s,source,signal){
  const entries=[];let total=0,visited=0
  async function walk(current,relative){
   signal.throwIfAborted();if(++visited>20000)throw new Error('目录条目过多。')
   const real=await fs.realpath(current);if(real!==current)throw new Error('云端导入不支持符号链接。')
   const info=await fs.lstat(current)
   if(info.isDirectory()){for(const name of await fs.readdir(current))await walk(path.join(current,name),relative?relative+'/'+name:name)}
   else if(info.isFile()){entries.push({path:relative,size:info.size,source:current});total+=info.size;if(entries.length>10000||total>maxBytes)throw new Error('文件数量或总大小超过服务端限制。')}
   else throw new Error('仅支持普通文件和文件夹。')
  }
  try{
   const info=await fs.lstat(source);await walk(source,info.isDirectory()?'':path.basename(source))
   const manifest=validateFiles(entries,maxBytes),space=await fs.statfs(root)
   if(manifest.total>space.bavail*space.bsize)throw new Error('服务端可用磁盘空间不足。')
   Object.assign(s,manifest);await persist(s)
   for(let i=0;i<entries.length;i++){
    signal.throwIfAborted();const entry=entries[i],file=s.files[i]
    if(await fs.realpath(entry.source)!==entry.source)throw new Error('源文件路径已变化。')
    const handle=await fs.open(entry.source,constants.O_RDONLY|constants.O_NOFOLLOW)
    try{
     const info=await handle.stat();if(!info.isFile()||info.size!==file.size)throw new Error('源文件已变化，请重新导入。')
     const target=path.join(dir(s.id),'files',file.path);await fs.mkdir(path.dirname(target),{recursive:true})
     let bytes=0;const hash=createHash('sha256')
     const limit=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;if(bytes>file.size)return callback(new Error('源文件大小已变化。'));hash.update(chunk);callback(null,chunk)}})
     await pipeline(handle.createReadStream({autoClose:false}),limit,createWriteStream(target,{flags:'wx'}),{signal})
     if(bytes!==file.size)throw new Error('源文件未完整复制。')
     file.uploaded=true;file.sha256=hash.digest('hex');await persist(s)
    }finally{await handle.close()}
   }
   signal.throwIfAborted();s.status='ready';await persist(s)
  }catch(e){if(s.status!=='cancelled'){s.status='failed';s.message=e.message;await persist(s)} }
 }
 return async function middleware(req,res,next){const pathname=req.url?.split('?')[0];if(!pathname?.startsWith('/api/dataset-uploads'))return next?.();try{
  await init()
  if(req.method==='GET'&&pathname==='/api/dataset-uploads')return send(res,200,{root,maxBytes,importRoots,jobs:[...sessions.values()].filter(s=>s.status==='ready').map(s=>({...view(s),files:[]}))})
  const [, , ,id,indexOrAction]=pathname.split('/'),s=sessions.get(id)
  if(['GET','HEAD'].includes(req.method)&&s&&['visualization','video'].includes(indexOrAction)){
   if(s.status!=='ready')return send(res,409,{message:'数据集尚未完成导入。'})
   if(indexOrAction==='video')return await serveDatasetVideo(req,res,s,path.join(dir(id),'files'),new URL(req.url,'http://localhost').searchParams.get('path'))
   const result=await visualizations.get(s,path.join(dir(id),'files'));if(Number.isSafeInteger(result.info?.total_episodes)&&result.info.total_episodes>=0&&s.episodes!==result.info.total_episodes){s.episodes=result.info.total_episodes;await persist(s)}return send(res,200,result)
  }
  if(req.method==='GET')return s?send(res,200,view(s)):send(res,404,{message:'上传记录不存在。'})
  if(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{message:'只接受同源页面发起的上传。'})
  if(req.method==='POST'&&req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,415,{message:'请使用 JSON 提交文件清单。'})
  if(req.method==='POST'&&pathname==='/api/dataset-uploads/cloud'){
   const input=await readJson(req),name=String(input.name??'').trim(),source=String(input.sourcePath??'').trim()
   if(!name||name.length>100)throw new Error('数据集名称应为 1～100 字。')
   if(!path.isAbsolute(source))throw new Error('请输入云容器内的绝对路径，不支持网页链接。')
   const resolved=await fs.realpath(source),roots=await Promise.all(importRoots.map(r=>fs.realpath(r).catch(()=>null)))
   if(!roots.some(r=>r&&inside(r,resolved)))throw new Error('源路径不在允许导入的数据目录内。')
   const storage=await fs.realpath(root)
   if(inside(resolved,storage)||inside(storage,resolved))throw new Error('源目录不能包含数据集管理目录，也不能位于其中。')
   if([...sessions.values()].some(s=>s.name===name&&['ready','copying','uploading'].includes(s.status)))return send(res,409,{message:'已存在同名数据集或导入任务。'})
   const session={id:'dataset-'+randomUUID(),name,project:datasetProjects.includes(input.project)?input.project:'未分类',format:datasetFormats.includes(input.format)?input.format:'待识别',description:String(input.description??'').slice(0,2000),source:'cloud',status:'copying',createdAt:new Date().toISOString(),files:[],total:0}
   await fs.mkdir(dir(session.id),{recursive:true});sessions.set(session.id,session);await persist(session)
   const controller=new AbortController(),key=session.id+':cloud',promise=copyCloud(session,resolved,controller.signal)
   running.set(key,{controller,promise});promise.catch(()=>{}).finally(()=>running.delete(key))
   return send(res,202,view(session))
  }
  if(req.method==='POST'&&pathname==='/api/dataset-uploads'){
   const input=await readJson(req),name=String(input.name??'').trim();if(!name||name.length>100)throw new Error('数据集名称应为 1～100 字。')
   if([...sessions.values()].some(s=>s.name===name&&['ready','copying','uploading'].includes(s.status)))return send(res,409,{message:'已存在同名数据集。'})
   const manifest=validateFiles(input.files,maxBytes)
   const space=await fs.statfs(root);if(manifest.total>space.bavail*space.bsize)throw new Error('服务端可用磁盘空间不足。')
   const session={id:'dataset-'+randomUUID(),name,project:datasetProjects.includes(input.project)?input.project:'未分类',format:datasetFormats.includes(input.format)?input.format:'待识别',description:String(input.description??'').slice(0,2000),status:'uploading',createdAt:new Date().toISOString(),...manifest}
   await fs.mkdir(path.join(dir(session.id),'.parts'),{recursive:true});sessions.set(session.id,session);await persist(session);return send(res,201,view(session))
  }
  if(!s)return send(res,404,{message:'上传记录不存在。'})
  if(req.method==='POST'&&indexOrAction==='cancel'){
   if(s.status==='ready')return send(res,409,{message:'已完成的数据集不能作为未完成上传取消。'})
   s.status='cancelled';await persist(s);const tasks=[...running.entries()].filter(([key])=>key.startsWith(s.id+':')).map(([,v])=>v);tasks.forEach(v=>v.controller.abort());await Promise.allSettled(tasks.map(v=>v.promise));await fs.rm(path.join(dir(id),'files'),{recursive:true,force:true});await fs.rm(path.join(dir(id),'.parts'),{recursive:true,force:true});return send(res,200,view(s))
  }
  if(req.method==='POST'&&indexOrAction==='metadata'){
   const input=await readJson(req);if(s.status!=='ready'||!datasetProjects.includes(input.project)||!datasetFormats.includes(input.format))throw new Error('分类或格式无效。')
   s.project=input.project;s.format=input.format;visualizations.invalidate(s.id);await persist(s);return send(res,200,view(s))
  }
  if(s.status!=='uploading')return send(res,409,{message:'该上传会话不可写入。'})
  if(req.method==='PUT'&&/^\d+$/.test(indexOrAction??'')){
   const index=Number(indexOrAction),file=s.files[index],key=id+':'+index;if(!file)return send(res,404,{message:'文件不在上传清单中。'});if([...running.keys()].some(k=>k.startsWith(id+':')))return send(res,409,{message:'该数据集已有文件正在上传，请顺序上传。'})
   if(req.headers['content-length']!==undefined&&Number(req.headers['content-length'])!==file.size)return send(res,400,{message:'文件大小与清单不符。'})
   const controller=new AbortController(),part=path.join(dir(id),'.parts',String(index)),target=path.join(dir(id),'files',file.path)
   const promise=(async()=>{let bytes=0;const hash=createHash('sha256');await fs.mkdir(path.dirname(part),{recursive:true});const limit=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;if(bytes>file.size)return callback(new Error('文件超出声明大小。'));hash.update(chunk);callback(null,chunk)}});try{await pipeline(req,limit,createWriteStream(part),{signal:controller.signal});if(bytes!==file.size)throw new Error('文件未完整上传，请重试。');if(s.status!=='uploading')throw new Error('上传已取消。');await fs.mkdir(path.dirname(target),{recursive:true});await fs.rename(part,target);file.sha256=hash.digest('hex');file.uploaded=true;await persist(s)}catch(e){await fs.rm(part,{force:true});throw e}})()
   running.set(key,{controller,promise});try{await promise;return send(res,200,{uploaded:true,index,sha256:file.sha256})}finally{running.delete(key)}
  }
  if(req.method==='POST'&&indexOrAction==='complete'){
   if(s.files.some(f=>!f.uploaded)||[...running.keys()].some(k=>k.startsWith(id+':')))return send(res,409,{message:'仍有文件未完成上传。'})
   for(const file of s.files){const info=await fs.stat(path.join(dir(id),'files',file.path));if(info.size!==file.size)throw new Error('文件大小校验失败，请重试上传。')}
   s.status='ready';await persist(s);await fs.rm(path.join(dir(id),'.parts'),{recursive:true,force:true});return send(res,200,view(s))
  }
  return send(res,405,{message:'不支持的上传操作。'})
 }catch(e){if(!res.headersSent&&!res.destroyed)send(res,400,{message:e.code==='ENOSPC'?'服务端磁盘空间不足。':e.message})}}
}
const middleware=createDatasetService()
export const datasetUploadMiddleware=middleware
export function datasetUploadPlugin(){return {name:'dataset-upload',configureServer(server){server.middlewares.use(middleware)},configurePreviewServer(server){server.middlewares.use(middleware)}}}
