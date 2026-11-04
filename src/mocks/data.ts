import type { Job, Gpu, Checkpoint, JobLossHistory } from '../types'
export const initialJobs: Job[] = [
 { id:'TRN-0248', name:'pi05-pick-place-v3', model:'Pi0.5', dataset:'pick_place_waterbottle', status:'Running', progress:64, step:32000, loss:0.1842, gpu:'GPU 0, 1', started:'2026-11-04 14:32' },
 { id:'TRN-0247', name:'groot-robotwin-finetune', model:'NVIDIA GR00T', dataset:'RoboTwin 2.0 Clean', status:'Running', progress:38, step:19000, loss:0.3261, gpu:'GPU 2', started:'2026-11-04 15:08' },
 { id:'TRN-0246', name:'lingbot-manipulation-baseline', model:'LingBot-VLA 2.0', dataset:'Manipulation Dataset A', status:'Completed', progress:100, step:50000, loss:0.0928, gpu:'GPU 3', started:'2026-11-04 09:15' },
 { id:'TRN-0245', name:'pi05-pick-place-v2', model:'Pi0.5', dataset:'pick_place_waterbottle', status:'Completed', progress:100, step:50000, loss:0.1274, gpu:'GPU 0, 1', started:'2026-11-03 16:40' }
]
export const initialGpus: Gpu[] = [{id:0,utilization:92,memory:65.4,temperature:68},{id:1,utilization:88,memory:62.8,temperature:66},{id:2,utilization:76,memory:48.2,temperature:61},{id:3,utilization:0,memory:0.8,temperature:34}]
export const checkpoints: Checkpoint[] = [{name:'pi05_step_30000',model:'Pi0.5',job:'TRN-0248',step:30000,size:'6.8 GB'},{name:'groot_step_15000',model:'NVIDIA GR00T',job:'TRN-0247',step:15000,size:'5.2 GB'},{name:'lingbot_final',model:'LingBot-VLA 2.0',job:'TRN-0246',step:50000,size:'7.4 GB'}]
// Each history belongs to a unique training run, never to a model name.
export const jobLossHistories: JobLossHistory[] = initialJobs.map((job, index) => {
 const count = Math.ceil(job.step / 1000)
 const rate = 3.2 + index * 0.35
 const points = Array.from({ length: count + 1 }, (_, i) => {
  const step = Math.min(i * 1000, job.step)
  const progress = job.step === 0 ? 1 : step / job.step
  const decay = (Math.exp(-rate * progress) - Math.exp(-rate)) / (1 - Math.exp(-rate))
  const noise = Math.sin(i * 2.1 + index) * 0.025 * (1 - progress)
  return { step, loss: Number((job.loss + (0.95 + index * 0.06) * decay + noise).toFixed(4)) }
 })
 return { jobId: job.id, points }
})
