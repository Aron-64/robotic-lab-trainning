export interface GpuResources {status:'ok'|'unavailable';count:number;devices:{index:number;name:string}[];source:string;checkedAt:string;message?:string}
export async function getGpuResources():Promise<GpuResources>{
 const response=await fetch(`${import.meta.env.VITE_API_BASE_URL||'/api'}/resources/gpus`,{signal:AbortSignal.timeout(8000),cache:'no-store'})
 const result=await response.json() as GpuResources
 if(!response.ok||result.status!=='ok')throw new Error(result.message||'GPU 资源接口不可用。')
 if(!Number.isInteger(result.count)||result.count<0||!Array.isArray(result.devices)||result.devices.length!==result.count)throw new Error('GPU 资源接口返回格式不正确。')
 return result
}
