import {promises as fs} from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {detectGpus} from './gpu-resources.mjs'
export const trainingRoot=path.resolve(process.env.TRAINING_STORAGE_ROOT||'managed-training')
const modelRoot=path.resolve(process.env.MODEL_STORAGE_ROOT||'managed-models'),datasetRoot=path.resolve(process.env.DATASET_STORAGE_ROOT||'managed-datasets')
export async function prepareTraining(input,{detect=detectGpus}={}){
 if(!/^model-[a-f0-9-]+$/.test(input.modelId??'')||!/^dataset-[a-f0-9-]+$/.test(input.datasetId??''))throw new Error('请选择真实导入的模型与数据集。')
 const model=JSON.parse(await fs.readFile(path.join(modelRoot,input.modelId,'import.json'),'utf8')),dataset=JSON.parse(await fs.readFile(path.join(datasetRoot,input.datasetId,'dataset.json'),'utf8'))
 if(model.status!=='ready'||dataset.status!=='ready')throw new Error('模型或数据集尚未导入完成。')
 const c={name:String(input.name??'').trim(),modelId:input.modelId,datasetId:input.datasetId,configName:String(input.configName??'').trim(),entry:String(input.entry??'scripts/train_pytorch.py'),precision:input.precision??'bfloat16',assetId:String(input.assetId??'').trim(),weightMode:input.weightMode??'base',checkpointName:String(input.checkpointName??''),modelName:model.name,datasetName:dataset.name}
 if(!c.name||c.name.length>100||! /^[a-zA-Z0-9_-]+$/.test(c.configName))throw new Error('请输入任务名称及有效 OpenPI 配置名。')
 for(const [key,min,max,def] of [['gpuCount',1,256,1],['steps',1,1000000,20],['batchSize',1,4096,1],['workers',0,128,0],['saveInterval',1,1000000,10],['logInterval',1,10000,1],['seed',0,4294967295,42],['keepLast',0,1000,0]]){const v=input[key]??def;if(!Number.isInteger(v)||v<min||v>max)throw new Error(`${key} 参数范围无效`);c[key]=v}
 c.learningRate=Number(input.learningRate??0.00005);if(!Number.isFinite(c.learningRate)||c.learningRate<=0||c.learningRate>1)throw new Error('学习率无效')
 if(!['bfloat16','float32'].includes(c.precision)||c.batchSize%c.gpuCount||c.saveInterval>c.steps)throw new Error('精度、全局 Batch Size 或保存间隔无效。')
 c.project=await fs.realpath(model.paths.code);c.python=model.paths.python
 const entry=await fs.realpath(path.resolve(c.project,c.entry));if(!entry.startsWith(c.project+path.sep)||!entry.endsWith('.py'))throw new Error('训练入口必须位于项目内。');c.entry=entry
 await fs.access(c.python,fs.constants.X_OK)
 const base=path.join(datasetRoot,dataset.id,'files');const infos=dataset.files.filter(f=>f.uploaded&&/(^|\/)meta\/info.json$/.test(f.path));if(infos.length!==1)throw new Error('数据集需包含唯一 LeRobot meta/info.json。')
 c.dataset=await fs.realpath(path.dirname(path.dirname(path.join(base,infos[0].path))))
 const realBase=await fs.realpath(base);if(c.dataset!==realBase&&!c.dataset.startsWith(realBase+path.sep))throw new Error('数据集路径越界')
 c.assets=await fs.realpath(input.assets?path.resolve(c.project,input.assets):path.join(c.project,'assets'))
 if(c.assets!==c.project&&!c.assets.startsWith(c.project+path.sep))throw new Error('assets 必须位于已导入项目中。')
 if(c.weightMode==='base'){if(model.weightMode==='none'||model.weightMode==='checkpoints')throw new Error('该模型未导入基础权重。');c.weights=model.paths.weights}
 else if(c.weightMode==='checkpoint'){
  const candidates=(model.importedCheckpoints??[]).filter(cp=>cp.format==='pytorch'&&cp.complete)
  const cp=c.checkpointName==='latest'?candidates.filter(cp=>cp.step!==null).sort((a,b)=>b.step-a.step)[0]:candidates.find(cp=>cp.name===c.checkpointName)
  if(!cp)throw new Error('没有兼容 PyTorch Checkpoint。');c.weights=cp.path;c.checkpointName=cp.name
 }else if(c.weightMode!=='scratch')throw new Error('权重方式无效。断点续训请从真实任务详情创建。')
 if(c.weights){const weight=await fs.stat(path.join(c.weights,'model.safetensors')).catch(()=>null);if(!weight?.isFile()||!weight.size)throw new Error('该入口要求权重目录内存在非空 model.safetensors，不能加载 JAX 权重。')}
 const resources=await detect();if(resources.status!=='ok'||resources.count<c.gpuCount)throw new Error(resources.message||'设备数量不足。')
 c.devices=resources.devices.slice(0,c.gpuCount).map(d=>d.physicalIndex??d.index);c.resourceSource=resources.source
 return c
}
export function trainingEnv(c){return {...process.env,PYTHONUNBUFFERED:'1',PYTHONPATH:[path.join(c.project,'src'),c.project].join(path.delimiter),WANDB_MODE:'disabled',WANDB_DISABLED:'true',CUDA_VISIBLE_DEVICES:c.devices.join(','),...(c.resourceSource==='xpu-smi'?{XPU_VISIBLE_DEVICES:c.devices.join(','),CXPU_VISIBLE_DEVICES:c.devices.join(',')}:{}),XLA_PYTHON_CLIENT_PREALLOCATE:'false'}}
export function parseTrainingMetric(line){const m=line.match(/\bstep=(\d+)\s+loss=([-+\d.eE]+)\s+lr=([-+\d.eE]+)/);if(!m)return null;const result={step:Number(m[1]),loss:Number(m[2]),lr:Number(m[3])};return Object.values(result).every(Number.isFinite)?result:null}
export async function completedCheckpoints(folder){const dirs=await fs.readdir(folder,{withFileTypes:true}).catch(()=>[]),out=[];for(const d of dirs){if(!d.isDirectory()||!/^\d+$/.test(d.name))continue;let valid=true;for(const name of ['model.safetensors','optimizer.pt','metadata.pt']){const st=await fs.stat(path.join(folder,d.name,name)).catch(()=>null);if(!st?.isFile()||!st.size)valid=false}if(valid)out.push({step:Number(d.name),path:path.join(folder,d.name)})}return out.sort((a,b)=>a.step-b.step)}
export async function atomicJson(file,value){const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2));await fs.rename(temp,file)}
