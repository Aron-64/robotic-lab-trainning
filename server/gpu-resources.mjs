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
export async function detectGpus() {
 try {
  const {stdout}=await execute('nvidia-smi',['--query-gpu=index,uuid,name','--format=csv,noheader'],{timeout:5000,maxBuffer:1024*128,windowsHide:true})
  const devices=parseVisibleGpus(stdout,process.env)
  return {status:'ok',count:devices.length,devices,source:'nvidia-smi',checkedAt:new Date().toISOString()}
 } catch(error) {
  const message=error.code==='ENOENT'?'容器未安装 nvidia-smi。':error.killed?'GPU 检测超时。':error.code?'无法连接 NVIDIA 驱动，请检查容器 GPU 挂载与驱动状态。':error.message
  return {status:'unavailable',count:0,devices:[],source:'nvidia-smi',message,checkedAt:new Date().toISOString()}
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
