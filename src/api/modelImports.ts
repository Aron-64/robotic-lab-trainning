import type {ModelImport} from '../types'
const base=(import.meta.env.VITE_API_BASE_URL||'/api')+'/model-imports'
async function request<T>(url:string,init?:RequestInit):Promise<T>{const res=await fetch(url,{...init,signal:AbortSignal.timeout(15000)});let data;try{data=await res.json()}catch{throw new Error('模型导入服务不可用，请确认服务端已启动。')}if(!res.ok)throw new Error(data.message||'模型导入请求失败。');return data as T}
export const listModelImports=()=>request<{root:string;jobs:ModelImport[]}>(base)
export const getModelImport=(id:string)=>request<ModelImport>(`${base}/${encodeURIComponent(id)}`)
export const createModelImport=(data:{name:string;github:string;weights:string;revision:string;python:string;mode?:string;sourceCode?:string;sourceWeights?:string;sourceEnvironment?:string;weightMode?:string;selectedCheckpoints?:string[]})=>request<ModelImport>(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
export const controlModelImport=(id:string,action:'cancel'|'retry')=>request<ModelImport>(`${base}/${encodeURIComponent(id)}/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
export const importLabels:Record<string,string>={scanning:'扫描源目录',copying:'复制代码与权重',queued:'等待导入',cloning:'拉取代码',downloading:'下载权重',analyzing:'解析 README',installing:'安装环境',checking:'检查依赖',ready:'已准备 · 未验证训练',needs_attention:'需人工处理',failed:'导入失败',cancelled:'已取消',interrupted:'服务中断'}
export const importActive=(status:string)=>['scanning','copying','queued','cloning','downloading','analyzing','installing','checking'].includes(status)

export const scanModelCheckpoints=(data:unknown)=>request<{checkpoints:import('../types').ImportedCheckpoint[]}>(`${base}/scan-checkpoints`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
