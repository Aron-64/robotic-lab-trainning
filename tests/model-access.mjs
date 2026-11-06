import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {execFileSync} from 'node:child_process'
const temp=await mkdtemp(join(tmpdir(),'model-cloud-flow-'))
const source=join(temp,'source'),environment=join(source,'env'),code=join(source,'project'),experiment=join(source,'experiment')
process.env.MODEL_STORAGE_ROOT=join(temp,'storage');process.env.MODEL_TRANSFER_ROOTS=source
try{
 await mkdir(join(experiment,'best'),{recursive:true});await writeFile(join(experiment,'best','model.safetensors'),'fixture weights')
 await mkdir(code);await writeFile(join(code,'train.py'),'print("fixture only")')
 execFileSync('python3',['-m','venv','--without-pip',environment],{timeout:30000})
 const {modelManagerMiddleware}=await import('../server/model-manager.mjs')
 async function call(url,payload={},method='POST'){
  const req=Readable.from(method==='GET'?[]:[JSON.stringify(payload)])
  Object.assign(req,{socket:{remoteAddress:'10.9.8.7'},method,url,headers:{host:'localhost:8888',origin:'https://cloud.example','content-type':'application/json'}})
  let status,data;await modelManagerMiddleware(req,{writeHead(s){status=s},end(v){data=JSON.parse(v)}});return {status,data}
 }
 const result=await call('/api/model-imports/scan-checkpoints',{sourceWeights:experiment});assert.equal(result.status,200);assert.equal(result.data.checkpoints[0].name,'best')
 const created=await call('/api/model-imports',{mode:'transfer',name:'Cloud integration',sourceCode:code,sourceEnvironment:environment,sourceWeights:experiment,weightMode:'checkpoints',selectedCheckpoints:['best']})
 assert.equal(created.status,202,JSON.stringify(created.data));const id=created.data.id
 async function waitReady(){for(let i=0;i<300;i++){const {data}=await call(`/api/model-imports/${id}`,{},'GET');if(['ready','failed','cancelled'].includes(data.status)){assert.equal(data.status,'ready',data.error);return data}await new Promise(r=>setTimeout(r,20))}throw new Error('Import timed out')}
 let imported=await waitReady();assert.match(imported.environmentCheck,/未安装 pip/)
 assert.equal(await readFile(join(imported.paths.weights,'best','model.safetensors'),'utf8'),'fixture weights')
 assert.equal(imported.paths.environment,environment)
 assert.equal((await call(`/api/model-imports/${id}/cancel`)).status,200)
 assert.equal((await call(`/api/model-imports/${id}/retry`)).status,202);await waitReady()
 assert.equal((await call('/api/model-imports/scan-checkpoints',{sourceWeights:'/etc'})).status,400)
 console.log('PASS: remote/proxied scan → transfer → real no-pip Python verification → selected files copied → status → retry; path checks preserved')
}finally{await rm(temp,{recursive:true,force:true})}
