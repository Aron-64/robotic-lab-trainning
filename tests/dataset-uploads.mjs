import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {mkdtemp,readFile,rm,stat,mkdir,writeFile,symlink} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createDatasetService,validateFiles} from '../server/dataset-uploads.mjs'
for(const name of ['../secret','/tmp/x','a/../../b','a\\b','a//b'])assert.throws(()=>validateFiles([{path:name,size:1}],100))
assert.throws(()=>validateFiles([{path:'a',size:1},{path:'a/b',size:1}],100))
assert.throws(()=>validateFiles([{path:'a',size:101}],100))
const root=await mkdtemp(path.join(os.tmpdir(),'lab-dataset-test-'))
const source=await mkdtemp(path.join(os.tmpdir(),'lab-source-'))
let handler=createDatasetService({root,maxBytes:1000,importRoots:[source]})
async function request(method,url,body,origin='http://localhost'){
 const payload=method==='PUT'?Buffer.from(body??''):body===undefined?Buffer.alloc(0):Buffer.from(JSON.stringify(body))
 const req=Readable.from([payload]);Object.assign(req,{method,url,headers:{host:'localhost',origin,'content-type':method==='PUT'?'application/octet-stream':'application/json','content-length':String(payload.length)}})
 let status,data
 const res={headersSent:false,destroyed:false,writeHead(code){status=code;this.headersSent=true},end(text){data=JSON.parse(text)}}
 await handler(req,res)
 return {status,data}
}
try{
 assert.equal((await request('POST','/api/dataset-uploads',{name:'bad',files:[{path:'a',size:1}]},'https://other.test')).status,403)
 const created=await request('POST','/api/dataset-uploads',{name:'Dataset',project:'Franka',format:'LeRobot v2.1',files:[{path:'scene/data.h5',size:5},{path:'scene/empty.txt',size:0}]})
 assert.equal(created.data.project,'Franka');assert.equal(created.data.format,'LeRobot v2.1');assert.equal(created.status,201);const id=created.data.id
 assert.equal((await request('POST',`/api/dataset-uploads/${id}/complete`,{})).status,409)
 assert.equal((await request('PUT',`/api/dataset-uploads/${id}/0`,'123')).status,400)
 assert.equal((await request('PUT',`/api/dataset-uploads/${id}/0`,'hello')).status,200)
 assert.equal((await request('PUT',`/api/dataset-uploads/${id}/1`,'')).status,200)
 const completed=await request('POST',`/api/dataset-uploads/${id}/complete`,{})
 assert.equal(completed.status,200);assert.equal(completed.data.status,'ready');assert.equal(completed.data.uploadedBytes,5)
 assert.equal(await readFile(path.join(completed.data.path,'scene/data.h5'),'utf8'),'hello')
 assert.equal(completed.data.files[0].sha256,'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
 const classified=await request('POST',`/api/dataset-uploads/${id}/metadata`,{project:'宇树G1',format:'LeRobot v3.0'});assert.equal(classified.status,200)
 assert.equal((await request('POST',`/api/dataset-uploads/${id}/metadata`,{project:'invalid',format:'HDF5'})).status,400)
 handler=createDatasetService({root,maxBytes:1000,importRoots:[source]})
 const restored=(await request('GET','/api/dataset-uploads')).data.jobs;assert.equal(restored.length,1);assert.equal(restored[0].project,'宇树G1');assert.equal(restored[0].format,'LeRobot v3.0')
 const second=(await request('POST','/api/dataset-uploads',{name:'Cancel',files:[{path:'f',size:4}]})).data
 await request('PUT',`/api/dataset-uploads/${second.id}/0`,'test')
 assert.equal((await request('POST',`/api/dataset-uploads/${second.id}/cancel`,{})).status,200)
 assert.equal(await stat(path.join(root,second.id,'files')).catch(()=>null),null)
 assert.equal((await request('PUT',`/api/dataset-uploads/${second.id}/0`,'test')).status,409)
 await mkdir(path.join(source,'nested'))
 await writeFile(path.join(source,'nested','data.txt'),'cloud data')
 const cloud=await request('POST','/api/dataset-uploads/cloud',{name:'Cloud',sourcePath:source})
 assert.equal(cloud.status,202)
 async function waitCloud(id){for(let i=0;i<200;i++){const result=await request('GET',`/api/dataset-uploads/${id}`);if(result.data.status!=='copying')return result.data;await new Promise(r=>setTimeout(r,10))}throw new Error('Copy timed out')}
 const copied=await waitCloud(cloud.data.id)
 assert.equal(copied.status,'ready');assert.equal(copied.fileCount,1)
 assert.equal(await readFile(path.join(copied.path,'nested/data.txt'),'utf8'),'cloud data')
 assert.equal(await readFile(path.join(source,'nested/data.txt'),'utf8'),'cloud data')
 assert.equal((await request('POST','/api/dataset-uploads/cloud',{name:'Outside',sourcePath:'/etc'})).status,400)
 assert.equal((await request('POST','/api/dataset-uploads/cloud',{name:'URL',sourcePath:'https://example.com/data'})).status,400)
 await symlink('/etc/passwd',path.join(source,'link'))
 const unsafe=await request('POST','/api/dataset-uploads/cloud',{name:'Symlink',sourcePath:source})
 assert.equal((await waitCloud(unsafe.data.id)).status,'failed')
 assert.equal((await request('POST',`/api/dataset-uploads/${unsafe.data.id}/cancel`,{})).status,200)
 console.log('PASS: dataset streams, bytes/hash, empty files, size/path/origin validation, incomplete finalize, persistence, cancel cleanup')
}finally{await rm(root,{recursive:true,force:true});await rm(source,{recursive:true,force:true})}
