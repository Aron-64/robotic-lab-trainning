import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
const execute = promisify(execFile)
export function parseVisibleGpus(output, env = {}) {
 let devices=output.trim()?output.trim().split(/\r?\n/).map(line=>{const [index,uuid,...name]=line.split(',').map(v=>v.trim());if(!/^\d+$/.test(index)||!uuid?.startsWith('GPU-')||!name.length)throw new Error('无法解析 GPU 信息。');return {index:Number(index),uuid,name:name.join(', ')}}):[]
 for(const key of ['NVIDIA_VISIBLE_DEVICES','CUDA_VISIBLE_DEVICES']) {
  const value=env[key]
  if(value===undefined||value==='all')continue
  if(['','none','void','-1'].includes(value.trim())){devices=[];continue}
  const ids=value.split(',').map(v=>v.trim())
  if(ids.some(id=>id.startsWith('MIG-')))throw new Error('当前为 MIG 环境，请由云平台资源接口提供可分配实例数量。')
  const matched=ids.map(id=>devices.find(d=>String(d.index)===id||d.uuid===id||(/^GPU-/.test(id)&&d.uuid.startsWith(id))))
  if(matched.some(d=>!d))throw new Error('GPU 可见性配置与检测结果不一致，请检查容器资源配置。')
  devices=[...new Set(matched)]
 }
 return devices.map((d,index)=>({index,name:d.name}))
}
export function parseVisibleXpus(output, env = {}) {
 if(/\b(?:VXPU|SR-IOV.*Enabled|Virtual Function)\b/i.test(output))throw new Error('当前为虚拟 XPU 环境，请接入平台分配资源接口。')
 const devices=[]
 // Read device identity rows only, never utilization or process rows.
 for(const line of output.split(/\r?\n/)){
  const match=line.match(/^\s*\|\s*(\d+)\s+(P800(?:[ -]+(?:OAM|PCIe))?)\s+(?:N\/A|On|Off)\s*\|/i)
  if(match)devices.push({index:Number(match[1]),name:match[2].trim()})
 }
 if(!devices.length){if(/no (?:XPU )?devices (?:were )?found/i.test(output))return [];throw new Error('无法解析 xpu-smi 的 P800 设备表，请检查驱动版本和命令输出。')}
 if(new Set(devices.map(d=>d.index)).size!==devices.length)throw new Error('xpu-smi 返回重复设备编号。')
 let visible=devices
 for(const key of ['XPU_VISIBLE_DEVICES','CXPU_VISIBLE_DEVICES']){
  const value=env[key]?.trim();if(value===undefined||value==='all')continue
  if(['','none','void','-1'].includes(value)){visible=[];continue}
  const ids=value.split(',').map(v=>v.trim())
  if(ids.some(id=>!/^\d+$/.test(id))||new Set(ids).size!==ids.length)throw new Error(`${key} 必须是无重复的设备编号列表。`)
  const selected=ids.map(id=>visible.find(d=>d.index===Number(id)))
  if(selected.some(d=>!d))throw new Error(`${key} 与 xpu-smi 设备编号不一致，请检查容器资源配置。`)
  visible=selected
 }
 return visible.map((device,index)=>({index,physicalIndex:device.index,name:device.name}))
}
export async function detectGpus({run=execute,env=process.env} = {}) {
 let source='xpu-smi'
 const options={timeout:5000,maxBuffer:1024*128,windowsHide:true,env:{...env,LC_ALL:'C',LANG:'C'}}
 try {
  const backend=env.ACCELERATOR_BACKEND||'auto'
  if(!['auto','xpu','nvidia'].includes(backend))throw new Error('ACCELERATOR_BACKEND 仅支持 auto、xpu 或 nvidia。')
  let devices
  if(backend!=='nvidia'){
   let output
   try{output=await run('xpu-smi',[],options)}catch(error){
    // Only a missing binary permits switching vendors; do not hide XPU driver failures.
    if(error.code!=='ENOENT'||backend==='xpu'||env.XPU_VISIBLE_DEVICES!==undefined||env.CXPU_VISIBLE_DEVICES!==undefined)throw error
   }
   if(output)devices=parseVisibleXpus(output.stdout,env)
  }
  if(devices===undefined){
   source='nvidia-smi'
   const {stdout}=await run(source,['--query-gpu=index,uuid,name','--format=csv,noheader'],options)
   devices=parseVisibleGpus(stdout,env)
  }
  return {status:'ok',count:devices.length,devices,source,checkedAt:new Date().toISOString()}
 } catch(error) {
  const message=error.code==='ENOENT'?`容器未安装 ${source}，请检查工具安装及 PATH。`:error.killed?`${source} 检测超时。`:error.code?`${source} 执行失败，请检查设备挂载与驱动状态。`:error.message
  return {status:'unavailable',count:0,devices:[],source,message,checkedAt:new Date().toISOString()}
 }
}
export async function gpuMiddleware(req,res,next) {
 if(req.url?.split('?')[0]!=='/api/resources/gpus'){if(next)return next();res.writeHead(404);res.end();return}
 if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});res.end();return}
 const result=await detectGpus()
 res.writeHead(result.status==='ok'?200:503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'})
 res.end(JSON.stringify(result))
}
export function gpuResourcePlugin(){return {name:'container-gpu-resources',configureServer(server){server.middlewares.use(gpuMiddleware)},configurePreviewServer(server){server.middlewares.use(gpuMiddleware)}}}
// Optional read-only endpoint for production reverse proxying; no training commands.
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const port=Number(process.env.GPU_RESOURCE_PORT??8001);createServer((req,res)=>gpuMiddleware(req,res)).listen(port,'127.0.0.1',()=>console.log(`GPU resource API: http://127.0.0.1:${port}/api/resources/gpus`))}
