import {promises as fs,createReadStream} from 'node:fs'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import {asyncBufferFromFile,parquetReadObjects,parquetMetadataAsync,parquetSchema} from 'hyparquet'
import {compressors} from 'hyparquet-compressors'
export const datasetProjects=['未分类','Franka','Openarm','宇树G1','仿真','其他']
export const datasetFormats=['LeRobot','LeRobot v2.1','LeRobot v3.0','HDF5','Parquet','其他']
export async function safeDatasetFile(base,relative){
 if(!relative||relative.includes('\\')||path.isAbsolute(relative)||relative.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('文件路径无效。')
 const realBase=await fs.realpath(base),target=await fs.realpath(path.join(base,relative))
 if(!target.startsWith(realBase+path.sep)||!(await fs.stat(target)).isFile())throw new Error('文件不在数据集目录内。')
 return target
}
async function jsonFile(base,file,lines=false){const target=await safeDatasetFile(base,file);if((await fs.stat(target)).size>16*1024**2)throw new Error('元数据文件超过 16 MB。');const text=await fs.readFile(target,'utf8');return lines?text.split(/\r?\n/).filter(l=>l.trim()).map(l=>JSON.parse(l)):JSON.parse(text)}
function template(pattern,values){return pattern.replace(/\{([^}:]+)(?::0?(\d+)d)?\}/g,(_,key,width)=>{if(values[key]===undefined)throw new Error(`路径模板缺少 ${key}`);return String(values[key]).padStart(Number(width)||0,'0')})}
export async function inspectDataset(session,base){
 const files=session.files.filter(f=>f.uploaded).map(f=>({path:f.path,size:f.size})),warnings=[]
 const infos=files.filter(f=>/(^|\/)meta\/info.json$/.test(f.path))
 const videos=files.filter(f=>/\.(mp4|webm|mov)$/i.test(f.path))
 const result={info:null,version:session.format,episodes:[],videos,files,warnings,features:[],rootPrefix:''}
 if(infos.length!==1){warnings.push(infos.length?'包含多个数据集根目录，请分别导入以解析 Episode。':'未找到 meta/info.json；可直接选择视频文件预览。');return result}
 const prefix=infos[0].path.slice(0,-'meta/info.json'.length);result.rootPrefix=prefix
 try{
  const info=await jsonFile(base,infos[0].path);result.info=info;result.version=info.codebase_version?`LeRobot ${info.codebase_version}`:session.format
  result.features=Object.entries(info.features??{}).map(([key,value])=>({key,...value}))
  const cameras=result.features.filter(f=>f.dtype==='video').map(f=>f.key)
  let rows=[]
  if(String(info.codebase_version).startsWith('v3')){
   const indexes=files.filter(f=>f.path.startsWith(prefix+'meta/episodes/')&&f.path.endsWith('.parquet')).sort((a,b)=>a.path.localeCompare(b.path))
   if(!indexes.length)throw new Error('缺少 v3.0 的 meta/episodes Parquet 索引。')
   for(const entry of indexes){
    const file=await asyncBufferFromFile(await safeDatasetFile(base,entry.path)),meta=await parquetMetadataAsync(file)
    const columns=parquetSchema(meta).children.map(e=>e.element.name).filter(key=>['episode_index','length','tasks'].includes(key)||key.startsWith('videos/'));
    const remaining=10000-rows.length;if(remaining<=0){warnings.push('Episode 索引仅展示前 10,000 条。');break}
    rows.push(...await parquetReadObjects({file,compressors,columns,rowEnd:Math.min(Number(meta.num_rows),remaining)}))
    if(Number(meta.num_rows)>remaining)warnings.push('Episode 索引仅展示前 10,000 条。')
   }
  }else{rows=await jsonFile(base,prefix+'meta/episodes.jsonl',true);if(rows.length>10000){rows=rows.slice(0,10000);warnings.push('Episode 索引仅展示前 10,000 条。')}}
  const available=new Set(videos.map(v=>v.path))
  for(const row of rows){
   const index=Number(row.episode_index);if(!Number.isSafeInteger(index)||index<0)continue
   const episode={index,length:Number(row.length)||0,tasks:Array.isArray(row.tasks)?row.tasks.map(String):[],videos:[]}
   for(const camera of cameras){
    const v3=String(info.codebase_version).startsWith('v3'),key=`videos/${camera}`
    const start=v3?Number(row[key+'/from_timestamp']):0,end=v3?Number(row[key+'/to_timestamp']):episode.length/Number(info.fps)
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start){warnings.push(`Episode ${index} / ${camera} 缺少有效时间范围。`);continue}
    try{const relative=prefix+template(info.video_path??(v3?'videos/{video_key}/chunk-{chunk_index:03d}/file-{file_index:03d}.mp4':'videos/chunk-{episode_chunk:03d}/{video_key}/episode_{episode_index:06d}.mp4'),{video_key:camera,episode_index:index,episode_chunk:Math.floor(index/(Number(info.chunks_size)||1000)),chunk_index:row[key+'/chunk_index'],file_index:row[key+'/file_index']})
     if(available.has(relative))episode.videos.push({camera,path:relative,start,end});else warnings.push(`Episode ${index} 缺少视频：${relative}`)
    }catch(e){warnings.push(e.message)}
   }
   result.episodes.push(episode)
  }
 }catch(e){warnings.push(`元数据解析失败：${e.message}；仍可浏览原始视频文件。`)}
 result.warnings=[...new Set(warnings)].slice(0,30);return result
}
export function parseByteRange(range,size){
 if(!range)return null
 const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2])||!size)throw new Error('range')
 const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2])),end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw new Error('range')
 return {start,end}
}
export async function serveDatasetVideo(req,res,session,base,relative){
 if(!session.files.some(f=>f.path===relative&&f.uploaded)||! /\.(mp4|webm|mov)$/i.test(relative)){res.writeHead(404);res.end();return}
 const target=await safeDatasetFile(base,relative),size=(await fs.stat(target)).size
 let range;try{range=parseByteRange(req.headers.range,size)}catch{res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return}
 const headers={'Accept-Ranges':'bytes','Content-Type':relative.toLowerCase().endsWith('.webm')?'video/webm':relative.toLowerCase().endsWith('.mov')?'video/quicktime':'video/mp4','X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=300','Content-Length':range?range.end-range.start+1:size}
 if(range)headers['Content-Range']=`bytes ${range.start}-${range.end}/${size}`
 res.writeHead(range?206:200,headers);if(req.method==='HEAD'||!size){res.end();return}
 try{await pipeline(createReadStream(target,range??{}),res)}catch(e){if(!res.destroyed)res.destroy(e)}
}
