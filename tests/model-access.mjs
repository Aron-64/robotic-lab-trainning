import assert from 'node:assert/strict'
import {trustedModelCaller,modelRequestOriginAllowed} from '../server/model-access.mjs'
const request=(ip,origin='https://lab.example',host='lab.example')=>({socket:{remoteAddress:ip},headers:{origin,host,'content-type':'application/json'}})
assert.equal(trustedModelCaller('127.0.0.1',{}),true)
assert.equal(trustedModelCaller('::ffff:127.0.0.1',{}),true)
assert.equal(trustedModelCaller('10.0.0.2',{}),false)
assert.equal(trustedModelCaller(undefined,{}),false)
assert.equal(trustedModelCaller('::ffff:10.0.0.2',{MODEL_TRUSTED_PROXY_IPS:'10.0.0.2'}),true)
assert.equal(trustedModelCaller('10.0.0.2',{MODEL_TRUSTED_PROXY_IPS:'*'}),false)
assert.equal(modelRequestOriginAllowed(request('10.0.0.9'),{}),true)
assert.equal(modelRequestOriginAllowed(request('10.0.0.9','https://evil.example'),{}),false)
const env={MODEL_TRUSTED_PROXY_IPS:'10.0.0.2',MODEL_ALLOWED_ORIGINS:'https://lab.example'}
assert.equal(modelRequestOriginAllowed(request('10.0.0.2','https://lab.example','localhost:8888'),env),true)
assert.equal(modelRequestOriginAllowed(request('10.0.0.9','https://lab.example','localhost:8888'),env),false)
console.log('PASS: remote same-origin scans, exact proxy IP trust, rewritten Host allowlist, missing peer and spoofed origin rejection')
const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises')
const {tmpdir}=await import('node:os')
const {join}=await import('node:path')
const {Readable}=await import('node:stream')
const temp=await mkdtemp(join(tmpdir(),'model-access-'))
process.env.MODEL_STORAGE_ROOT=join(temp,'storage');process.env.MODEL_TRANSFER_ROOTS=join(temp,'source')
try{
 await mkdir(join(temp,'source','1000'),{recursive:true});await writeFile(join(temp,'source','1000','model.safetensors'),'fixture')
 const {modelManagerMiddleware}=await import('../server/model-manager.mjs')
 async function call(url,origin='https://lab.example'){
  const req=Readable.from([JSON.stringify({sourceWeights:join(temp,'source')})]);Object.assign(req,request('10.9.8.7',origin),{method:'POST',url});let status,data
  await modelManagerMiddleware(req,{writeHead(s){status=s},end(v){data=JSON.parse(v)}});return {status,data}
 }
 const result=await call('/api/model-imports/scan-checkpoints');assert.equal(result.status,200);assert.equal(result.data.checkpoints[0].step,1000)
 assert.equal((await call('/api/model-imports')).status,403)
 assert.equal((await call('/api/model-imports/scan-checkpoints','https://evil.example')).status,403)
 console.log('PASS: actual remote scan route succeeds; remote execution and foreign-origin scan rejected')
}finally{await rm(temp,{recursive:true,force:true})}
