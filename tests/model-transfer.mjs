import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod,symlink,stat} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const temp=await mkdtemp(path.join(os.tmpdir(),'lab-transfer-')),root=path.join(temp,'managed'),source=path.join(temp,'sources')
process.env.MODEL_STORAGE_ROOT=root;process.env.MODEL_TRANSFER_ROOTS=source
const {validateTransfer}=await import('../server/model-transfer.mjs')
const {importModel}=await import('../server/model-manager.mjs')
try{
 const code=path.join(source,'code'),weights=path.join(source,'weights'),env=path.join(code,'env')
 await mkdir(root);await mkdir(path.join(env,'bin'),{recursive:true});await mkdir(weights)
 await writeFile(path.join(env,'bin/python'),'fixture');await chmod(path.join(env,'bin/python'),0o755)
 await writeFile(path.join(code,'train.py'),'print("hello")');await writeFile(path.join(weights,'weights.bin'),'weights')
 const input={name:'Transferred',sourceCode:code,sourceWeights:weights,sourceEnvironment:env}
 await assert.rejects(validateTransfer({...input,sourceCode:'/etc'},root))
 await assert.rejects(validateTransfer({...input,sourceCode:'relative'},root))
 const config=await validateTransfer(input,root)
 const job={...config,id:'model-transfer-fixture',logs:[],paths:{},status:'queued'}
 await mkdir(path.join(root,job.id))
 let calls=[]
 const executor=async(j,cmd,args)=>{calls.push([cmd,...args]);return args.includes('-c')?JSON.stringify({prefix:env,python:'3.11.9',torch:'2.6'}):''}
 await importModel(job,executor);assert.equal(job.status,'ready',job.error)
 assert.equal(await readFile(path.join(job.paths.code,'train.py'),'utf8'),'print("hello")')
 assert.equal(await readFile(path.join(job.paths.weights,'weights.bin'),'utf8'),'weights')
 assert.equal(await stat(path.join(job.paths.code,'env')).catch(()=>null),null)
 assert.equal(await readFile(path.join(env,'bin/python'),'utf8'),'fixture')
 assert.equal(job.paths.environment,env);assert.equal(job.progress.copiedFiles,2)
 assert.ok(calls.every(c=>!c.includes('install')))
 await importModel(job,executor);assert.equal(job.status,'ready',job.error)
 await importModel(job,async()=>{throw new Error('broken environment')});assert.equal(job.status,'failed')
 await importModel(job,async(j,c,args)=>args.includes('-c')?JSON.stringify({prefix:root}):'');assert.equal(job.status,'failed')
 await symlink('/etc/passwd',path.join(code,'unsafe'))
 await importModel(job,executor);assert.equal(job.status,'failed');assert.match(job.error,/符号链接/)
 await rm(path.join(code,'unsafe'))
 await importModel(job,async(j,c,args)=>{j.cancelRequested=true;return executor(j,c,args)});assert.equal(job.status,'cancelled')
 assert.equal(await readFile(path.join(code,'train.py'),'utf8'),'print("hello")')
 console.log('PASS: model transfer real file copies, env exclusion/reuse, retry, allowed roots, symlink rejection, environment failures and cancellation (Python executor fixture)')
}finally{await rm(temp,{recursive:true,force:true})}
