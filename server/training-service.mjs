import {promises as fs} from 'node:fs'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {outputRoot,outputTimezone,createOutput} from './training-output.mjs'
import {trainingRoot as root,prepareTraining,trainingEnv,atomicJson,completedCheckpoints} from './training-core.mjs'
const execute=promisify(execFile),runner=fileURLToPath(new URL('./openpi-runner.py',import.meta.url)),supervisor=fileURLToPath(new URL('./training-worker.mjs',import.meta.url))
let scheduling=false;const folder=id=>{if(!/^real-[a-f0-9-]+$/.test(id))throw new Error('任务 ID 无效');return path.join(root,id)}
async function states(){await fs.mkdir(root,{recursive:true});const result=[];for(const name of await fs.readdir(root)){if(!/^real-[a-f0-9-]+$/.test(name))continue;try{const state=JSON.parse(await fs.readFile(path.join(root,name,'state.json'),'utf8'));result.push(state)}catch{}}return result.sort((a,b)=>a.created.localeCompare(b.created))}
async function alive(s){if(!s.supervisorPid)return false;try{const command=await fs.readFile(`/proc/${s.supervisorPid}/cmdline`,'utf8');return command.includes(supervisor)&&command.includes(folder(s.id))}catch{return false}}
async function preflight(c){const temp=path.join(root,'preflight-'+randomUUID()+'.json');await fs.mkdir(root,{recursive:true});await fs.writeFile(temp,JSON.stringify(c));try{const {stdout}=await execute(c.python,[runner,temp,'--preflight'],{cwd:c.project,env:trainingEnv(c),timeout:60000,maxBuffer:2*1024**2});const marker=stdout.split('\n').find(l=>l.startsWith('ROBOTIC_LAB_PREFLIGHT='));if(!marker)throw new Error('预检未返回设备检查结果');return JSON.parse(marker.slice('ROBOTIC_LAB_PREFLIGHT='.length))}catch(e){throw new Error(e.killed?'预检超过 60 秒。':String(e.stderr||e.message).slice(-5000))}finally{await fs.rm(temp,{force:true})}}
// Cross-process reservation covers preflight, checkpoint staging and dispatch.
async function reserve(){
 await fs.mkdir(root,{recursive:true});const lock=path.join(root,'.scheduler.lock')
 try{const handle=await fs.open(lock,'wx');await handle.writeFile(String(process.pid));await handle.close();return ()=>fs.rm(lock,{force:true})}
 catch(e){if(e.code!=='EEXIST')throw e;const owner=Number(await fs.readFile(lock,'utf8').catch(()=>''));if(owner){try{process.kill(owner,0);return null}catch(e){if(e.code!=='ESRCH')return null}}else if(Date.now()-(await fs.stat(lock)).mtimeMs<30000)return null;await fs.rm(lock,{force:true});return null}
}
async function schedule(){if(scheduling)return;scheduling=true;let release;try{
 release=await reserve();if(!release)return;
 const all=await states();let occupied=false
 for(const s of all.filter(s=>['Running','Starting','Stopping'].includes(s.status))){if(await alive(s)){occupied=true;continue}if(s.pid){try{const cmd=await fs.readFile(`/proc/${s.pid}/cmdline`,'utf8');if(cmd.includes(path.join(folder(s.id),'config.json'))){occupied=true;s.error='监督进程异常，但训练进程仍在运行；暂停队列，请检查进程。';await atomicJson(path.join(folder(s.id),'state.json'),s);continue}}catch{}}
 if(s.status==='Starting'&&Date.now()-Date.parse(s.started)<10000){occupied=true;continue}s.status='Interrupted';s.error='训练监督进程已退出，不能确认训练成功。';await atomicJson(path.join(folder(s.id),'state.json'),s)}
 if(occupied)return
 const next=all.find(s=>s.status==='Queued');if(!next)return
 const dir=folder(next.id);if(await fs.stat(path.join(dir,'stop')).catch(()=>null)){next.status='Stopped';await atomicJson(path.join(dir,'state.json'),next);return}
 try{next.status='Starting';next.started=new Date().toISOString();await atomicJson(path.join(dir,'state.json'),next);let c=JSON.parse(await fs.readFile(path.join(dir,'config.json'),'utf8'));const checked=await prepareTraining(c);c={...c,devices:checked.devices,resourceSource:checked.resourceSource};await preflight(c);if(c.resumeSource){const target=path.join(c.checkpointDir,String(c.resumeFrom));await fs.mkdir(c.checkpointDir,{recursive:true});await fs.cp(c.resumeSource,target,{recursive:true,errorOnExist:true,force:false,filter:async()=>{if(await fs.stat(path.join(dir,'stop')).catch(()=>null))throw new Error('已取消 Checkpoint 复制');return true}});delete c.resumeSource}await atomicJson(path.join(dir,'config.json'),c)
 if(await fs.stat(path.join(dir,'stop')).catch(()=>null)){next.status='Stopped';await atomicJson(path.join(dir,'state.json'),next);return}
 next.status='Starting';next.started=new Date().toISOString();await atomicJson(path.join(dir,'state.json'),next)
 const child=spawn(process.execPath,[supervisor,dir],{detached:true,stdio:'ignore'});child.once('error',async e=>{next.status='Failed';next.error=e.message;await atomicJson(path.join(dir,'state.json'),next)});next.supervisorPid=child.pid;child.unref()
 }catch(e){next.status=(await fs.stat(path.join(dir,'stop')).catch(()=>null))?'Stopped':'Failed';next.error=e.message;await atomicJson(path.join(dir,'state.json'),next)}
 }finally{if(release)await release();scheduling=false}}
const timer=setInterval(()=>void schedule().catch(()=>{}),2500);timer.unref()
async function body(req){let text='';for await(const b of req){text+=b;if(text.length>20000)throw new Error('请求过大')}return JSON.parse(text)}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
export async function trainingMiddleware(req,res,next){const url=req.url?.split('?')[0];if(!url?.startsWith('/api/training'))return next?.();try{
 if(req.method==='GET'&&url==='/api/training/storage')return send(res,200,{root:outputRoot,timezone:outputTimezone})
 if(req.method==='GET'&&url==='/api/training'){return send(res,200,{jobs:(await states()).reverse()})}
 const [, , ,id,action]=url.split('/')
 if(req.method==='GET'&&id){const dir=folder(id);return send(res,200,{...JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8')),config:JSON.parse(await fs.readFile(path.join(dir,'config.json'),'utf8'))})}
 if(req.method!=='POST'||req.headers['content-type']?.split(';')[0]!=='application/json')return send(res,405,{message:'请提交 JSON POST 请求'})
 const input=await body(req)
 if(url==='/api/training/preflight'){const release=await reserve();if(!release)throw new Error('正在准备其他任务，请稍后预检。');try{if((await states()).some(s=>['Running','Starting','Stopping'].includes(s.status)))throw new Error('已有真实任务运行，请结束后预检。');const config=await prepareTraining(input);return send(res,200,{config,report:await preflight(config)})}finally{await release()}}
 if(action==='stop'){const dir=folder(id);await fs.writeFile(path.join(dir,'stop'),'stop');const state=JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8'));if(state.status==='Queued'){state.status='Stopped';await atomicJson(path.join(dir,'state.json'),state)}return send(res,200,{ok:true})}
 let c
 if(action==='resume'){
  const previous=JSON.parse(await fs.readFile(path.join(folder(id),'state.json'),'utf8'));if(!['Stopped','Failed','Completed','Interrupted'].includes(previous.status))throw new Error('原任务尚未停止')
  const old=JSON.parse(await fs.readFile(path.join(folder(id),'config.json'),'utf8')),cps=await completedCheckpoints(old.checkpointDir),cp=cps.find(v=>v.step===Number(input.step))
  if(!cp||!Number.isInteger(input.steps)||input.steps<=cp.step)throw new Error('请选择完整 Checkpoint，并填写更大的总步数')
  c=await prepareTraining({...old,steps:input.steps});c.resumeSource=cp.path;c.resumeFrom=cp.step;c.resumeParent={jobId:id,checkpoint:cp.path,step:cp.step}
 }else if(url==='/api/training'){c=await prepareTraining(input)}else return send(res,404,{message:'未知训练接口'})
 const jobId='real-'+randomUUID(),dir=folder(jobId),created=new Date();c.experiment=jobId;c.outputDir=await createOutput(c,{date:created});c.outputBase=c.outputDir;c.checkpointDir=path.join(c.outputDir,'checkpoints');c.outputLayout='flat-v1';c.outputTimezone=outputTimezone
 // Keep stable ID lookup and legacy tasks, while all new files live in the readable directory.
 await fs.mkdir(root,{recursive:true});try{await fs.symlink(c.outputDir,dir,'dir')}catch(e){await fs.rmdir(c.outputDir);throw e}
 await atomicJson(path.join(dir,'config.json'),c);const state={id:jobId,name:c.name,modelName:c.modelName,datasetName:c.datasetName,status:'Queued',created:created.toISOString(),outputDir:c.outputDir,steps:c.steps,step:c.resumeFrom??0,loss:null,metrics:[],logs:[],checkpoints:[],error:'',configPath:path.join(c.outputDir,'config.json')};await atomicJson(path.join(dir,'state.json'),state);void schedule().catch(()=>{});return send(res,202,state)
 }catch(e){return send(res,400,{message:e.message})}}
export function trainingPlugin(){return {name:'real-training',configureServer(s){s.middlewares.use(trainingMiddleware)},configurePreviewServer(s){s.middlewares.use(trainingMiddleware)}}}
