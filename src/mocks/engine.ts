import type { Job, LossPoint, TrainingConfig } from '../types'
export function validateConfig(c:TrainingConfig, gpuLimit?:number):string[] {
 const errors:string[]=[]
 if(c.keepLast!==undefined&&c.keepLast!==null&&(!Number.isInteger(c.keepLast)||c.keepLast<1||c.keepLast>1000))errors.push('Checkpoint 保留数量应为 1～1000。')
 if(!c.name.trim())errors.push('请输入训练任务名称。')
 if(!c.model||!c.dataset||!c.environment.trim())errors.push('请选择模型、数据集和 Python 环境。')
 if(!Number.isInteger(c.steps)||c.steps<100||c.steps>1000000)errors.push('训练步数应为 100～1,000,000 的整数。')
 if(!Number.isInteger(c.batchSize)||c.batchSize<1||c.batchSize>1024)errors.push('Batch Size 应为 1～1024 的整数。')
 if(!Number.isFinite(c.learningRate)||c.learningRate<=0||c.learningRate>1)errors.push('Learning Rate 应大于 0 且不超过 1。')
 if(!c.gpuDevices.length||new Set(c.gpuDevices).size!==c.gpuDevices.length||c.gpuDevices.some(v=>!Number.isInteger(v)||v<0))errors.push('请选择至少一张有效 GPU。')
 if(gpuLimit!==undefined&&(!Number.isInteger(gpuLimit)||gpuLimit<1||c.gpuDevices.length>gpuLimit||c.gpuDevices.some(v=>v>=gpuLimit)))errors.push('GPU 数量超过当前容器可用上限，请重新检测资源。')
 if(!Number.isInteger(c.saveInterval)||c.saveInterval<1||c.saveInterval>c.steps)errors.push('保存间隔应为 1 到总步数之间的整数。')
 if(!c.outputDir.trim())errors.push('请输入输出目录。')
 if(!Number.isInteger(c.seed)||c.seed<0||c.seed>4294967295)errors.push('Random Seed 应为有效的非负 32 位整数。')
 if(!Number.isInteger(c.extra)||c.extra<1||c.extra>1024)errors.push('模型专属参数应为 1～1024 的整数。')
 if(!['AdamW','Adam','SGD'].includes(c.optimizer)||!['bf16','fp16','fp32'].includes(c.precision))errors.push('请选择有效的 Optimizer 和 Precision。')
 return errors
}
export function advanceJob(job:Job):{point?:LossPoint; save:boolean} {
 if(job.status==='Pending'){job.status='Running';job.logs?.push('[INFO] Loading dataset and model weights (Mock)...','[INFO] Training started (Mock).');return {save:false}}
 if(job.status!=='Running'||!job.config)return {save:false}
 const before=job.step
 const nextSave=(Math.floor(job.step/job.config.saveInterval)+1)*job.config.saveInterval
 job.step=Math.min(job.config.steps,nextSave,job.step+Math.max(100,Math.ceil(job.config.steps/200)))
 job.elapsed=(job.elapsed??0)+2
 job.progress=Math.round(job.step/job.config.steps*100)
 job.loss=Number(Math.max(0.035,job.loss*0.985+Math.sin(job.step/1000)*0.001).toFixed(4))
 const save=Math.floor(before/job.config.saveInterval)<Math.floor(job.step/job.config.saveInterval)||job.step===job.config.steps
 job.logs?.push(`[TRAIN] step=${job.step} loss=${job.loss.toFixed(4)} (Mock)`)
 const lr=job.config.learningRate*(1-job.step/job.config.steps)
 job.metrics?.push({step:job.step,lr,utilization:80+Math.round(10*Math.sin(job.step/900)),memory:Math.min(78,10+job.config.batchSize*1.7)})
 if(job.metrics&&job.metrics.length>200)job.metrics.splice(0,job.metrics.length-200)
 if(job.step===job.config.steps){job.status='Completed';job.logs?.push('[INFO] Training completed (Mock).')}
 if(job.logs&&job.logs.length>300)job.logs.splice(0,job.logs.length-300)
 return {point:{step:job.step,loss:job.loss},save}
}
