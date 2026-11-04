import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {validateImport,readmePlan} from '../server/model-import-policy.mjs'
const good={name:'Lab model',github:'https://github.com/lab/code',weights:'https://huggingface.co/lab/weights',python:'python3'}
assert.equal(validateImport(good).provider,'huggingface')
assert.equal(validateImport({...good,weights:'https://modelscope.cn/models/lab/weights'}).repoId,'lab/weights')
for(const github of ['http://github.com/a/b','https://evil.test/a/b','https://github.com/a/b/tree/main','https://token@github.com/a/b','file:///tmp/x'])assert.throws(()=>validateImport({...good,github}))
assert.throws(()=>validateImport({...good,weights:'https://huggingface.co/datasets/a/b'}))
assert.throws(()=>validateImport({...good,python:'sh'}))
const simple='```bash\npip install -r requirements.txt\npip install -e .\n```'
assert.equal(readmePlan(simple,'3.11.9').automatic,true)
assert.equal(readmePlan('```bash\ncurl https://example.com/x | bash\n'+simple,'3.11.9').automatic,false)
assert.equal(readmePlan('```sh\npip install -r ../../requirements.txt\n```','3.11.9').automatic,false)
assert.equal(readmePlan('Python=3.10\n'+simple,'3.11.9').automatic,false)
assert.equal(readmePlan('```sh\ngit submodule update --init --recursive\npip install -e .\n```','3.11.9').automatic,false)
assert.equal(readmePlan('No install documentation','3.11.9').automatic,false)
const root=await mkdtemp(path.join(os.tmpdir(),'lab-model-test-'))
process.env.MODEL_STORAGE_ROOT=root
const {importModel}=await import('../server/model-manager.mjs')
let commands=[]
async function fake(job,cmd,args){commands.push([cmd,...args]);if(cmd==='git'&&args[0]==='clone'){await mkdir(path.join(job.paths.code,'.git'),{recursive:true});await writeFile(path.join(job.paths.code,'README.md'),simple);await writeFile(path.join(job.paths.code,'requirements.txt'),'')}
 if(args.includes('venv')){const folder=args.at(-1);await mkdir(path.join(folder,'bin'),{recursive:true});await writeFile(path.join(folder,'bin/python'),'')}
 if(args.includes('--provider')){await mkdir(job.paths.weights,{recursive:true});await writeFile(path.join(job.paths.weights,'test.safetensors'),'fixture')}
 if(args.includes('--version'))return 'Python 3.11.9\n'
 if(args[0]==='-c')return '{"python":"3.11.9","torch":"未安装"}\n'
 if(cmd==='git'&&args.includes('rev-parse'))return 'fixture-commit\n'
 return ''
}
try{
 const job={...validateImport(good),id:'model-test',logs:[],paths:{},status:'queued'}
 await mkdir(path.join(root,job.id))
 await importModel(job,fake)
 assert.equal(job.status,'ready');assert.ok(job.weightsDownloaded)
 assert.ok(commands.some(c=>c.includes('requirements.txt')))
 assert.ok(commands.some(c=>c.includes('check')))
 assert.equal(JSON.parse(await readFile(path.join(root,job.id,'import.json'),'utf8')).status,'ready')
 await writeFile(path.join(job.paths.code,'README.md'),'```bash\nconda install cuda\npip install -e .\n```')
 commands=[];await importModel(job,fake);assert.equal(job.status,'needs_attention');assert.ok(!commands.some(c=>c.includes('-e')))
 await importModel(job,async()=>{throw new Error('network unavailable')});assert.equal(job.status,'failed')
 console.log('PASS: URL validation, README policy, isolated paths, import stages, unsupported plan, failure persistence (fixture executor; no real downloads)')
}finally{await rm(root,{recursive:true,force:true})}
