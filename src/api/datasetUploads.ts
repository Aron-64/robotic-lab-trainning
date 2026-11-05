export interface UploadedDataset {episodes?:number;project?:string;message?:string;id:string;name:string;format:string;description:string;status:string;path:string;total:number;fileCount:number;uploadedBytes:number;createdAt:string;files:{path:string;size:number;uploaded:boolean;sha256?:string}[]}
const base=(import.meta.env.VITE_API_BASE_URL||'/api')+'/dataset-uploads'
async function request<T>(url:string,body?:unknown):Promise<T>{const response=await fetch(url,body===undefined?{signal:AbortSignal.timeout(20000)}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});let data;try{data=await response.json()}catch{throw new Error('数据集上传服务不可用。')}if(!response.ok)throw new Error(data.message||'上传请求失败。');return data}
export const listUploadedDatasets=()=>request<{root:string;maxBytes:number;importRoots:string[];jobs:UploadedDataset[]}>(base)
export const createDatasetUpload=(input:{name:string;format:string;project?:string;description:string;files:{path:string;size:number}[]})=>request<UploadedDataset>(base,input)
export const getDatasetUpload=(id:string)=>request<UploadedDataset>(`${base}/${id}`)
export const finishDatasetUpload=(id:string)=>request<UploadedDataset>(`${base}/${id}/complete`,{})
export const cancelDatasetUpload=(id:string)=>request<UploadedDataset>(`${base}/${id}/cancel`,{})
export function uploadDatasetFile(id:string,index:number,file:File,onProgress:(bytes:number)=>void,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',`${base}/${id}/${index}`);xhr.setRequestHeader('Content-Type','application/octet-stream');const abort=()=>xhr.abort();signal.addEventListener('abort',abort,{once:true});xhr.upload.onprogress=e=>onProgress(e.loaded);xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300)resolve();else{let message='文件上传失败';try{message=JSON.parse(xhr.responseText).message||message}catch{}reject(new Error(message))}};xhr.onerror=()=>reject(new Error('网络中断，当前文件上传失败。'));xhr.onabort=()=>reject(new Error('上传已暂停。'));xhr.onloadend=()=>signal.removeEventListener('abort',abort);if(signal.aborted){signal.removeEventListener('abort',abort);reject(new Error('上传已暂停。'));return}xhr.send(file)})}
export function formatBytes(n:number){if(n<1024)return `${n} B`;if(n<1024**2)return `${(n/1024).toFixed(1)} KB`;if(n<1024**3)return `${(n/1024**2).toFixed(1)} MB`;return `${(n/1024**3).toFixed(2)} GB`}

export const createCloudDataset=(input:{name:string;format:string;project?:string;description:string;sourcePath:string})=>request<UploadedDataset>(`${base}/cloud`,input)

export const datasetProjects=['未分类','Franka','Openarm','宇树G1','仿真','其他']
export const datasetFormats=['LeRobot v2.1','LeRobot v3.0','LeRobot','HDF5','Parquet','其他']
export const updateDatasetMetadata=(id:string,project:string,format:string)=>request<UploadedDataset>(`${base}/${id}/metadata`,{project,format})
export interface DatasetVideo {camera:string;path:string;start:number;end:number}
export interface DatasetEpisode {index:number;length:number;tasks:string[];videos:DatasetVideo[]}
export interface DatasetVisualization {info:Record<string,any>|null;version:string;episodes:DatasetEpisode[];videos:{path:string;size:number}[];files:{path:string;size:number}[];warnings:string[];features:{key:string;dtype:string;shape?:number[];names?:unknown}[]}
export const getDatasetVisualization=(id:string)=>request<DatasetVisualization>(`${base}/${encodeURIComponent(id)}/visualization`)
export const datasetVideoUrl=(id:string,path:string)=>`${base}/${encodeURIComponent(id)}/video?path=${encodeURIComponent(path)}`
