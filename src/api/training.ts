const base=(import.meta.env.VITE_API_BASE_URL||'/api')+'/training'
export interface RealJob {id:string;name:string;modelName:string;datasetName:string;status:string;created:string;outputDir?:string;step:number;steps:number;loss:number|null;elapsed?:number;error:string;logs:string[];metrics:{step:number;loss:number;lr:number}[];checkpoints:{step:number;path:string}[];config?:Record<string,any>}
async function request<T>(suffix:string,body?:unknown):Promise<T>{const r=await fetch(base+suffix,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(90000)});const data=await r.json();if(!r.ok)throw new Error(data.message||'训练接口失败');return data}
export const listRealJobs=()=>request<{jobs:RealJob[]}>('')
export const getRealJob=(id:string)=>request<RealJob>('/'+encodeURIComponent(id))
export const preflightTraining=(body:unknown)=>request<{report:Record<string,any>}>('/preflight',body)
export const launchTraining=(body:unknown)=>request<RealJob>('',body)
export const stopTraining=(id:string)=>request('/'+encodeURIComponent(id)+'/stop',{})
export const resumeTraining=(id:string,step:number,steps:number)=>request<RealJob>('/'+encodeURIComponent(id)+'/resume',{step,steps})
export const realLabels:Record<string,string>={Queued:'排队中',Starting:'启动中',Running:'训练中',Stopping:'停止中',Stopped:'已停止',Completed:'已完成',Failed:'失败',Interrupted:'进程中断'}

export const getTrainingStorage=()=>request<{root:string;timezone:string}>('/storage')
