// Detached supervisor persists state even when the HTTP service restarts.
import {spawn} from 'node:child_process'
import {promises as fs,createWriteStream} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {trainingEnv,parseTrainingMetric,completedCheckpoints,atomicJson} from './training-core.mjs'
const folder=process.argv[2],config=JSON.parse(await fs.readFile(path.join(folder,'config.json'),'utf8')),stateFile=path.join(folder,'state.json')
let state=JSON.parse(await fs.readFile(stateFile,'utf8')),child,stopping=false,finishing=false,timer,killTimer,writing=Promise.resolve()
const save=()=>{const snapshot=structuredClone(state);writing=writing.then(()=>atomicJson(stateFile,snapshot));return writing}
const log=createWriteStream(path.join(folder,'training.log'),{flags:'a'})
function line(value){state.logs.push(value);if(state.logs.length>300)state.logs.shift();const metric=parseTrainingMetric(value);if(metric){state.step=metric.step;state.loss=metric.loss;state.metrics.push(metric);if(state.metrics.length>2000)state.metrics.shift()}}
async function tick(){if(finishing)return;state.elapsed=Math.floor((Date.now()-Date.parse(state.started))/1000);state.checkpoints=await completedCheckpoints(config.checkpointDir);if(finishing)return;if(await fs.stat(path.join(folder,'stop')).catch(()=>null))stop();await save()}
function stop(){if(stopping||finishing)return;stopping=true;state.status='Stopping';line('[PLATFORM] 请求停止训练，等待进程退出。');if(child?.pid){try{process.kill(-child.pid,'SIGTERM')}catch{};killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},10000);killTimer.unref()}}
process.on('SIGTERM',stop);process.on('SIGINT',stop)
async function finish(code,error){if(finishing)return;finishing=true;clearInterval(timer);clearTimeout(killTimer);state.exitCode=code;state.error=error||'';state.status=stopping?'Stopped':code===0?'Completed':'Failed';state.finished=new Date().toISOString();state.checkpoints=await completedCheckpoints(config.checkpointDir);if(code===0)state.step=config.steps;line(`[PLATFORM] ${state.status}; exit=${code}${error?' '+error:''}`);await save();log.end();}
try{
 state.status='Running';state.started=new Date().toISOString();state.supervisorPid=process.pid;await save()
 const runner=fileURLToPath(new URL('./openpi-runner.py',import.meta.url)),args=config.gpuCount>1?['-m','torch.distributed.run','--standalone','--nnodes=1',`--nproc_per_node=${config.gpuCount}`,runner,path.join(folder,'config.json')]:[runner,path.join(folder,'config.json')]
 child=spawn(config.python,args,{cwd:config.project,env:trainingEnv(config),detached:true,stdio:['ignore','pipe','pipe']});state.pid=child.pid
 for(const stream of [child.stdout,child.stderr]){let pending='';stream.on('data',chunk=>{log.write(chunk);pending+=chunk.toString();const lines=pending.split(/[\r\n]/);pending=lines.pop()??'';for(const text of lines)if(text)line(text);if(pending.length>65536){line(pending.slice(0,65536));pending=''}});stream.on('end',()=>{if(pending)line(pending)})}
 child.once('error',e=>{void finish(null,e.message)});child.once('close',code=>{void finish(code)})
 timer=setInterval(()=>{void tick().catch(e=>{state.error=e.message;stop()})},1000);await save()
}catch(e){await finish(null,e.message)}
