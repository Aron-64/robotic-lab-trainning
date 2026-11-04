import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { validateImport, readmePlan } from './model-import-policy.mjs'
const root=path.resolve(process.env.MODEL_STORAGE_ROOT||path.join(process.cwd(),'managed-models'))
const helper=fileURLToPath(new URL('./download-weights.py',import.meta.url))
const children=new Map(),jobs=new Map()
let ready,active=null
const terminal=new Set(['ready','needs_attention','failed','cancelled','interrupted'])
const pythonPath=folder=>path.join(folder,process.platform==='win32'?'Scripts/python.exe':'bin/python')
const exists=async p=>!!await fs.stat(p).catch(()=>null)
function sanitize(s){let text=String(s);for(const key of ['HF_TOKEN','MODELSCOPE_API_TOKEN'])if(process.env[key])text=text.split(process.env[key]).join('[REDACTED]');return text.replace(/\x1b\[[0-9;]*m/g,'')}
function log(job,line){job.logs.push(`[${new Date().toISOString().slice(11,19)}] ${sanitize(line)}`);if(job.logs.length>400)job.logs.splice(0,job.logs.length-400)}
async function persist(job){const target=path.join(root,job.id,'import.json');await fs.writeFile(target+'.tmp',JSON.stringify(job,null,2));await fs.rename(target+'.tmp',target)}
async function init(){if(!ready)ready=(async()=>{await fs.mkdir(root,{recursive:true});for(const dir of await fs.readdir(root,{withFileTypes:true})){if(!dir.isDirectory()||!/^model-[a-f0-9-]+$/.test(dir.name))continue;try{const job=JSON.parse(await fs.readFile(path.join(root,dir.name,'import.json'),'utf8'));if(job.id!==dir.name)continue;if(!terminal.has(job.status)){job.status='interrupted';job.error='导入服务已重启，可重试继续下载。';await persist(job)}jobs.set(job.id,job)}catch{}}})();await ready}
function run(job,command,args,options={}){return new Promise((resolve,reject)=>{if(job.cancelRequested)return reject(new Error('已取消'));log(job,`执行：${path.basename(command)} ${args.join(' ')}`);let output='';const child=spawn(command,args,{cwd:options.cwd??root,env:{...process.env,PYTHONUNBUFFERED:'1',PIP_DISABLE_PIP_VERSION_CHECK:'1',HF_HUB_DISABLE_TELEMETRY:'1',GIT_TERMINAL_PROMPT:'0'},shell:false,detached:process.platform!=='win32'});children.set(job.id,child);const timer=setTimeout(()=>{kill(child);reject(new Error('命令执行超时，可重试。'))},options.timeout??3600000);function chunk(data){const text=data.toString();output=(output+text).slice(-65536);for(const line of text.split(/[\r\n]+/).filter(Boolean))log(job,line)}child.stdout.on('data',chunk);child.stderr.on('data',chunk);child.once('error',e=>{clearTimeout(timer);children.delete(job.id);reject(new Error(e.code==='ENOENT'?`未安装 ${command}`:e.message))});child.once('close',code=>{clearTimeout(timer);children.delete(job.id);if(job.cancelRequested)reject(new Error('已取消'));else if(code!==0)reject(new Error(`${path.basename(command)} 执行失败（退出码 ${code}），请查看日志。`));else resolve(output)})})}
function kill(child){try{if(process.platform==='win32')child.kill('SIGTERM');else process.kill(-child.pid,'SIGTERM')}catch{};const timer=setTimeout(()=>{try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL')}catch{}},3000);timer.unref()}
async function phase(job,status,label){if(job.cancelRequested)throw new Error('已取消');job.status=status;log(job,label);await persist(job)}
export async function importModel(job,executor=run){active=job.id;job.cancelRequested=false;job.error='';try{
 const base=path.join(root,job.id),code=path.join(base,'code'),weights=path.join(base,'weights'),venv=path.join(base,'.venv')
 job.paths={root:base,code,weights,environment:venv,python:pythonPath(venv)}
 await phase(job,'cloning','拉取 GitHub 代码仓库')
 if(!await exists(path.join(code,'.git')))await executor(job,'git',['clone','--depth','1','--',job.github,code],{timeout:900000})
 else await executor(job,'git',['-C',code,'rev-parse','HEAD'],{timeout:30000})
 job.commit=(await executor(job,'git',['-C',code,'rev-parse','HEAD'],{timeout:30000})).trim()
 await phase(job,'downloading','下载权重快照到独立 weights 目录')
 const downloader=path.join(root,'.downloader'),downloadPython=pythonPath(downloader)
 if(!await exists(downloadPython))await executor(job,job.python,['-m','venv',downloader],{timeout:120000})
 const packageName=job.provider==='huggingface'?'huggingface_hub':'modelscope'
 await executor(job,downloadPython,['-m','pip','install',packageName],{timeout:600000})
 await executor(job,downloadPython,[helper,'--provider',job.provider,'--repo',job.repoId,'--target',weights,...(job.revision?['--revision',job.revision]:[])],{timeout:24*3600000})
 job.weightsDownloaded=true
 await phase(job,'analyzing','读取 README，生成环境安装计划')
 const files=await fs.readdir(code);const readme=files.find(f=>/^readme\.md$/i.test(f))??files.find(f=>/^readme.*\.(md|rst|txt)$/i.test(f))
 if(readme){const target=await fs.realpath(path.join(code,readme));if(!target.startsWith(code+path.sep))throw new Error('README 路径超出代码目录。')}
 job.readme=readme?(await fs.readFile(path.join(code,readme),'utf8')).slice(0,100000):''
 job.readmeFile=readme??''
 job.pythonVersion=(await executor(job,job.python,['--version'],{timeout:10000})).trim().replace(/^Python\s+/,'')
 job.plan=readmePlan(job.readme,job.pythonVersion)
 if(!job.plan.automatic){job.status='needs_attention';job.error=job.plan.commands.length?'README 包含额外依赖或安装步骤，需人工完成。':'未识别到可自动执行的 README 安装步骤。';log(job,job.error);return}
 for(const command of job.plan.commands){const file=path.resolve(code,command.file);const real=await fs.realpath(file);if(real!==code&&!real.startsWith(code+path.sep))throw new Error('安装文件路径超出模型代码目录。')}
 await phase(job,'installing','创建独立 Python 环境并按 README 安装依赖')
 if(!await exists(job.paths.python))await executor(job,job.python,['-m','venv',venv],{timeout:120000})
 for(const command of job.plan.commands)await executor(job,job.paths.python,['-m','pip','install',...command.args],{cwd:code})
 await phase(job,'checking','检查环境依赖一致性')
 await executor(job,job.paths.python,['-m','pip','check'],{cwd:base,timeout:120000})
 // Package metadata probe does not load project code or execute a training entry point.
 const info=await executor(job,job.paths.python,['-c',"import json,sys,importlib.metadata as m; print(json.dumps({'python':sys.version.split()[0], 'torch':next((d.version for d in m.distributions() if d.metadata['Name'].lower()=='torch'), '未安装')}))"],{cwd:base,timeout:30000})
 job.runtime=JSON.parse(info.trim().split('\n').at(-1));job.status='ready';job.error='';log(job,'代码、权重和 Python 依赖准备完成；尚未执行训练验证。')
 }catch(error){job.status=job.cancelRequested?'cancelled':'failed';job.error=sanitize(error.message);log(job,job.error)}finally{job.updatedAt=new Date().toISOString();await persist(job);active=null}}
const publicJob=job=>({...job,readme:job.readme??'',cancelRequested:undefined})
function send(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
async function body(req){let content='';for await(const chunk of req){content+=chunk;if(content.length>10000)throw new Error('请求内容过长。')}return JSON.parse(content)}
export async function modelManagerMiddleware(req,res,next){const pathname=req.url?.split('?')[0];if(!pathname?.startsWith('/api/model-imports'))return next?.();try{
 await init()
 if(req.method==='GET'&&pathname==='/api/model-imports'){return send(res,200,{root,jobs:[...jobs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(publicJob)})}
 if(req.method==='GET'){const id=pathname.split('/')[3];const job=jobs.get(id);return job?send(res,200,publicJob(job)):send(res,404,{message:'导入记录不存在。'})}
 // Mutations require a same-origin browser request. No arbitrary command/path is accepted.
 const address=req.socket?.remoteAddress
 if(address&&!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address))return send(res,403,{message:'模型导入仅允许本地访问，请使用 localhost 或 SSH 端口转发；云端需通过已鉴权的本地网关访问。'})
 if(!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host||req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,403,{message:'仅接受同源页面提交的 JSON 请求。'})
 if(req.method==='POST'&&pathname==='/api/model-imports'){
  if(active)return send(res,409,{message:'已有导入正在运行，请等待或取消后再创建。'})
  const config=validateImport(await body(req));if([...jobs.values()].some(j=>j.name===config.name))return send(res,409,{message:'模型名称已存在，请使用不同名称。'});const id='model-'+randomUUID();const job={...config,id,status:'queued',createdAt:new Date().toISOString(),logs:[],error:'',paths:{root:path.join(root,id)},plan:null}
  active=id;try{await fs.mkdir(path.join(root,id))}catch(e){active=null;throw e}jobs.set(id,job);await persist(job);void importModel(job);return send(res,202,publicJob(job))
 }
 const [, , ,id,action]=pathname.split('/');const job=jobs.get(id)
 if(!job)return send(res,404,{message:'导入记录不存在。'})
 if(req.method==='POST'&&action==='cancel'){if(active===id){job.cancelRequested=true;const child=children.get(id);if(child)kill(child)}return send(res,200,publicJob(job))}
 if(req.method==='POST'&&action==='retry'){if(active)return send(res,409,{message:'已有导入正在运行。'});if(!terminal.has(job.status))return send(res,409,{message:'任务仍在运行。'});active=id;void importModel(job);return send(res,202,publicJob(job))}
 return send(res,405,{message:'不支持的操作。'})
 }catch(e){send(res,400,{message:sanitize(e.message)})}}
function shutdown(){for(const [id,child] of children){const job=jobs.get(id);if(job)job.cancelRequested=true;kill(child)}}
process.once('exit',()=>{for(const child of children.values()){try{if(process.platform==='win32')child.kill();else process.kill(-child.pid,'SIGTERM')}catch{}}})
export function modelManagerPlugin(){return {name:'model-manager',configureServer(server){server.middlewares.use(modelManagerMiddleware);server.httpServer?.once('close',shutdown)},configurePreviewServer(server){server.middlewares.use(modelManagerMiddleware);server.httpServer?.once('close',shutdown)}}}
