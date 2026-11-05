import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {Writable} from 'node:stream'
import {parquetWriteBuffer} from 'hyparquet-writer'
import {inspectDataset,safeDatasetFile,parseByteRange,serveDatasetVideo} from '../server/dataset-visualizer.mjs'
const root=await mkdtemp(path.join(os.tmpdir(),'lab-viewer-'))
const session={files:[],format:'LeRobot'}
async function put(name,content){const bytes=Buffer.isBuffer(content)?content:Buffer.from(content);await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),bytes);session.files=session.files.filter(f=>f.path!==name);session.files.push({path:name,size:bytes.length,uploaded:true})}
const camera='observation.images.front'
try{
 const info={codebase_version:'v2.1',fps:30,total_episodes:1,features:{[camera]:{dtype:'video',shape:[480,640,3]},'observation.state':{dtype:'float32',shape:[7]}},video_path:'videos/chunk-{episode_chunk:03d}/{video_key}/episode_{episode_index:06d}.mp4'}
 await put('wrapped/meta/info.json',JSON.stringify(info));await put('wrapped/meta/episodes.jsonl',JSON.stringify({episode_index:2,length:90,tasks:['pick bottle']})+'\n')
 const v2=`wrapped/videos/chunk-000/${camera}/episode_000002.mp4`;await put(v2,'0123456789')
 let data=await inspectDataset(session,root);assert.equal(data.episodes[0].index,2);assert.equal(data.episodes[0].videos[0].end,3);assert.equal(data.rootPrefix,'wrapped/')
 const metadata={...info,codebase_version:'v3.0',video_path:'videos/{video_key}/chunk-{chunk_index:03d}/file-{file_index:03d}.mp4'}
 await put('wrapped/meta/info.json',JSON.stringify(metadata))
 const columns=[{name:'episode_index',data:[0n,1n],type:'INT64'},{name:'length',data:[60,90],type:'INT32'},{name:'tasks',data:[['first'],['second']],type:'JSON'},...Object.entries({'chunk_index':[0,0],'file_index':[0,0],'from_timestamp':[0,2],'to_timestamp':[2,5]}).map(([key,data])=>({name:`videos/${camera}/${key}`,data,type:'DOUBLE'}))]
 await put('wrapped/meta/episodes/chunk-000/file-000.parquet',Buffer.from(parquetWriteBuffer({columnData:columns})))
 const video=`wrapped/videos/${camera}/chunk-000/file-000.mp4`;await put(video,'abcdefghij')
 data=await inspectDataset(session,root);assert.equal(data.episodes.length,2);assert.equal(data.episodes[1].videos[0].start,2);assert.equal(data.episodes[1].videos[0].end,5);assert.deepEqual(data.episodes[1].tasks,['second'])
 assert.equal(data.episodes[0].videos[0].path,data.episodes[1].videos[0].path)
 assert.deepEqual(parseByteRange('bytes=3-6',10),{start:3,end:6});assert.deepEqual(parseByteRange('bytes=-3',10),{start:7,end:9})
 for(const value of ['bytes=20-','bytes=4-2','bytes=-0','bytes=0-1,3-4'])assert.throws(()=>parseByteRange(value,10))
 async function videoRequest(method,range,relative=video){const chunks=[];const res=new Writable({write(chunk,encoding,cb){chunks.push(chunk);cb()}});let code,headers;res.writeHead=(c,h)=>{code=c;headers=h};await serveDatasetVideo({method,headers:{range}},res,session,root,relative);return {code,headers,bytes:Buffer.concat(chunks).toString()}}
 let response=await videoRequest('GET','bytes=2-5');assert.equal(response.code,206);assert.equal(response.bytes,'cdef');assert.equal(response.headers['Content-Range'],'bytes 2-5/10')
 response=await videoRequest('HEAD',undefined);assert.equal(response.code,200);assert.equal(response.bytes,'');assert.equal(response.headers['Content-Length'],10)
 assert.equal((await videoRequest('GET','bytes=20-')).code,416)
 assert.equal((await videoRequest('GET',undefined,'wrapped/meta/info.json')).code,404)
 await assert.rejects(safeDatasetFile(root,'../outside'))
 await symlink('/etc/passwd',path.join(root,'escape.mp4'));await assert.rejects(safeDatasetFile(root,'escape.mp4'))
 session.files=session.files.filter(f=>!f.path.endsWith('info.json'));assert.ok((await inspectDataset(session,root)).warnings.length)
 console.log('PASS: v2.1 wrapped roots, real v3.0 Parquet index/shared video offsets, tasks, Range/HEAD streaming, invalid ranges, path and symlink protection, raw fallback')
}finally{await rm(root,{recursive:true,force:true})}
