import type {Model,TrainingConfig} from '../types'
export function resolveWeights(model:Model,c:TrainingConfig){
 if(!c.weightUsage)return
 c.resolvedWeightPath=undefined;c.resolvedWeightStep=undefined
 if(c.resume)throw new Error('不能同时选择模拟 Checkpoint 和导入权重。')
 if(c.weightUsage==='scratch')return
 if(c.weightUsage==='base'){
  if(model.weightMode==='checkpoints'||model.weightMode==='none'||!model.weights)throw new Error('该模型未登记基础权重。')
  if(model.baseWeightInfo?.format==='jax')throw new Error('JAX 权重不能用于当前 PyTorch 训练。')
  c.resolvedWeightPath=model.weights;return
 }
 const candidates=(model.importedCheckpoints??[]).filter(cp=>cp.complete&&cp.format==='pytorch'&&(c.weightUsage!=='resume'||cp.resumable))
 const cp=c.weightSelection==='latest'?candidates.filter(cp=>cp.step!==null).sort((a,b)=>(b.step??0)-(a.step??0))[0]:candidates.find(cp=>cp.name===c.weightSelection)
 if(!cp)throw new Error('请选择兼容的 PyTorch Checkpoint；续训需要完整训练状态文件。')
 if(c.weightUsage==='resume'&&cp.step===null)throw new Error('该版本步数未知，当前不能模拟续训；可选择参数微调。')
 if(c.weightUsage==='resume'&&cp.step!==null&&cp.step>=c.steps)throw new Error('续训总步数必须大于 Checkpoint 步数。')
 c.resolvedWeightPath=cp.path;c.resolvedWeightStep=cp.step??undefined
}
