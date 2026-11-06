// Real subprocess / queue integration; hardware and OpenPI are fixtures, not GPU validation.
import assert from 'node:assert/strict'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {Readable} from 'node:stream'
import {execFileSync} from 'node:child_process'
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lab-training-'))
process.env.TRAINING_OUTPUT_ROOT=path.join(temp,'outputs');process.env.TRAINING_TIMEZONE='Asia/Shanghai'
process.env.MODEL_STORAGE_ROOT=path.join(temp,'models');process.env.DATASET_STORAGE_ROOT=path.join(temp,'datasets');process.env.TRAINING_STORAGE_ROOT=path.join(temp,'jobs');process.env.ACCELERATOR_BACKEND='xpu'
const project=path.join(temp,'project'),modelId='model-aaaa',datasetId='dataset-bbbb'
async function write(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,value)}
const python=execFileSync('which',['python3'],{encoding:'utf8'}).trim()
await write(path.join(temp,'bin/xpu-smi'),'#!/bin/sh\nprintf "| 0 P800 OAM N/A |\\n"\n');await fs.chmod(path.join(temp,'bin/xpu-smi'),0o755);process.env.PATH=path.join(temp,'bin')+':'+process.env.PATH
for(const key of ['CUDA_VISIBLE_DEVICES','XPU_VISIBLE_DEVICES','CXPU_VISIBLE_DEVICES'])delete process.env[key]
await write(path.join(project,'src/torch.py'),`__version__='fixture'
class Tensor:
 def __add__(self,other):return self
 def sum(self):return self
 def item(self):return 8
class Cuda:
 def is_available(self):return True
 def device_count(self):return 1
 def synchronize(self):pass
 def get_device_name(self,i):return 'fixture GPU'
cuda=Cuda()
def ones(*args,**kwargs):return Tensor()
`)
await write(path.join(project,'src/openpi/__init__.py'),'')
await write(path.join(project,'src/openpi/training/__init__.py'),'')
await write(path.join(project,'src/openpi/training/config.py'),`from dataclasses import dataclass,field
from pathlib import Path
@dataclass
class Data:
 repo_id:str=''
@dataclass
class LR:
 peak_lr:float=0.1
@dataclass
class Config:
 data:Data=field(default_factory=Data)
 lr_schedule:LR=field(default_factory=LR)
 exp_name:str=''
 checkpoint_base_dir:str=''
 assets_base_dir:str=''
 pytorch_weight_path:str=''
 pytorch_training_precision:str='bfloat16'
 num_train_steps:int=20
 wandb_enabled:bool=True
 resume:bool=False
 overwrite:bool=False
 batch_size:int=1
 num_workers:int=0
 save_interval:int=10
 log_interval:int=1
 seed:int=42
 @property
 def checkpoint_dir(self):return Path(self.checkpoint_base_dir)/'fixture'/self.exp_name
def get_config(name):
 if name!='fixture':raise ValueError('unknown config')
 return Config()
`)
await write(path.join(project,'scripts/train_pytorch.py'),`import time
from pathlib import Path
def init_logging():pass
def save_checkpoint(model,optimizer,global_step,config,is_main,data_config):
 if global_step%config.save_interval:return
 folder=config.checkpoint_dir/str(global_step);folder.mkdir(parents=True,exist_ok=True)
 for name in ['model.safetensors','optimizer.pt','metadata.pt']:(folder/name).write_text('fixture')
def train_loop(config):
 assert not config.wandb_enabled
 assert Path(config.data.repo_id,'meta/info.json').exists()
 start=max([int(p.name) for p in config.checkpoint_dir.iterdir()]) if config.resume else 0
 print('RESUME_FROM='+str(start),flush=True)
 for step in range(start+1,config.num_train_steps+1):
  print(f'step={step} loss={1/step:.5f} lr=5.00e-05',flush=True)
  save_checkpoint(None,None,step,config,True,None)
  time.sleep(0.08)
`)
await fs.mkdir(path.join(project,'assets'))
await write(path.join(temp,'weights/model.safetensors'),'fixture')
await write(path.join(process.env.MODEL_STORAGE_ROOT,modelId,'import.json'),JSON.stringify({id:modelId,name:'fixture',status:'ready',weightMode:'base',paths:{code:project,python,weights:path.join(temp,'weights')}}))
await write(path.join(process.env.DATASET_STORAGE_ROOT,datasetId,'dataset.json'),JSON.stringify({id:datasetId,name:'fixture dataset',status:'ready',files:[{path:'meta/info.json',uploaded:true}]}))
await write(path.join(process.env.DATASET_STORAGE_ROOT,datasetId,'files/meta/info.json'),'{}')
const {trainingMiddleware}=await import('../server/training-service.mjs')
const {parseTrainingMetric}=await import('../server/training-core.mjs')
assert.equal(parseTrainingMetric('unrelated loss 3'),null)
assert.equal(parseTrainingMetric('step=1 loss=NaN lr=1'),null)
async function call(url,body,method=body===undefined?'GET':'POST'){
 const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);Object.assign(req,{url:'/api/training'+url,method,headers:{'content-type':'application/json'}})
 let status,data;await trainingMiddleware(req,{writeHead(v){status=v},end(v){data=JSON.parse(v)}});return {status,data}
}
const input={name:'fixture',modelId,datasetId,configName:'fixture',steps:5,saveInterval:2,logInterval:1}
async function wait(id,predicate){for(let i=0;i<200;i++){const {data}=await call('/'+id);if(predicate(data))return data;await new Promise(r=>setTimeout(r,100))}throw Error('Timed out '+id)}
const terminal=s=>['Completed','Failed','Stopped','Interrupted'].includes(s.status)
const created=[]
try{
 const {safeName,outputName,createOutput}=await import('../server/training-output.mjs')
 assert.equal(safeName('../任务 / A:*?'),'任务-A')
 assert(Buffer.byteLength(safeName('中'.repeat(100)))<=60)
 const label={name:'抓取',modelName:'模型',datasetName:'数据集'},date=new Date('2026-11-06T07:30:25Z')
 assert.equal(outputName(label,date),'抓取_模型_数据集_20261106-153025')
 const names=await Promise.all([createOutput(label,{root:path.join(temp,'collision'),date}),createOutput(label,{root:path.join(temp,'collision'),date})]);assert.notEqual(...names)
 const storage=await call('/storage');assert.equal(storage.data.root,process.env.TRAINING_OUTPUT_ROOT)
 const pre=await call('/preflight',input);assert.equal(pre.status,200,JSON.stringify(pre));assert.equal(pre.data.report.tensorCheck,8)
 const bad=await call('',{...input,gpuCount:2});assert.equal(bad.status,400)
 const result=await call('',input);assert.equal(result.status,202,JSON.stringify(result));created.push(result.data.id)
 const done=await wait(result.data.id,terminal);assert.equal(done.status,'Completed',done.error);assert.equal(done.metrics.length,5);assert.equal(done.config.checkpointDir,path.join(done.outputDir,'checkpoints'));assert.match(path.basename(done.outputDir),/^fixture_fixture_fixture-dataset_\d{8}-\d{6}/);assert.equal(await fs.realpath(path.join(process.env.TRAINING_STORAGE_ROOT,done.id)),done.outputDir);assert.deepEqual(done.checkpoints.map(c=>c.step),[2,4,5]);assert.match(await fs.readFile(path.join(process.env.TRAINING_STORAGE_ROOT,done.id,'training.log'),'utf8'),/step=5/)
 // Legacy ID directory stays readable and can still seed a new-layout resume.
 const legacyId='real-cccc',legacy=path.join(process.env.TRAINING_STORAGE_ROOT,legacyId),oldConfig={...done.config}
 delete oldConfig.outputDir;delete oldConfig.outputLayout;oldConfig.experiment=legacyId;oldConfig.outputBase=path.join(legacy,'outputs');oldConfig.checkpointDir=path.join(oldConfig.outputBase,'fixture',legacyId)
 await fs.mkdir(oldConfig.checkpointDir,{recursive:true});await fs.cp(path.join(done.config.checkpointDir,'4'),path.join(oldConfig.checkpointDir,'4'),{recursive:true})
 await write(path.join(legacy,'config.json'),JSON.stringify(oldConfig));await write(path.join(legacy,'state.json'),JSON.stringify({...done,id:legacyId,outputDir:undefined,config:undefined}))
 assert.equal((await call('/'+legacyId)).data.config.checkpointDir,oldConfig.checkpointDir)
 const legacyResume=await call('/'+legacyId+'/resume',{step:4,steps:6});assert.equal(legacyResume.status,202);created.push(legacyResume.data.id);assert.equal((await wait(legacyResume.data.id,terminal)).status,'Completed')
 const resumed=await call('/'+done.id+'/resume',{step:4,steps:7});assert.equal(resumed.status,202,JSON.stringify(resumed));created.push(resumed.data.id)
 const next=await wait(resumed.data.id,terminal);assert.equal(next.status,'Completed',next.error);assert(next.logs.includes('RESUME_FROM=4'));assert.equal(next.step,7);assert.notEqual(next.outputDir,done.outputDir);assert.equal(next.config.resumeParent.jobId,done.id);assert.equal(next.config.resumeParent.step,4);assert.equal(next.checkpoints.at(-1).step,7)
 const long=await call('',{...input,steps:100});created.push(long.data.id);await wait(long.data.id,s=>s.step>=2)
 const queued=await call('',input);created.push(queued.data.id);assert.equal(queued.data.status,'Queued')
 await call('/'+queued.data.id+'/stop',{});assert.equal((await wait(queued.data.id,terminal)).status,'Stopped')
 await call('/'+long.data.id+'/stop',{});assert.equal((await wait(long.data.id,terminal)).status,'Stopped')
 const fail=await call('',{...input,configName:'unknown'});created.push(fail.data.id);assert.equal((await wait(fail.data.id,terminal)).status,'Failed')
 console.log('PASS: real Python supervisor → preflight → queue → logs/Loss → final checkpoint → async resume → running/queued stop → startup failure (fixture GPU/OpenPI)')
}finally{
 for(const id of created){await call('/'+id+'/stop',{}).catch(()=>{});await wait(id,terminal).catch(()=>{})}
 await fs.rm(temp,{recursive:true,force:true})
}
