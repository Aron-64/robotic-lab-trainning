import assert from 'node:assert/strict'
import {createRouter,createMemoryHistory} from 'vue-router'
import { createServer } from 'vite'
import { createServer as createHttpServer } from 'node:http'
const memory=new Map()
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}
globalThis.document={documentElement:{dataset:{}},createElement:()=>({content:{}}),querySelector:()=>null}
const vite=await createServer({server:{middlewareMode:true,hmr:{server:createHttpServer()},watch:null},appType:'custom'})
try {
 const {createPinia,setActivePinia}=await import('pinia')
 const {useDemoStore}=await vite.ssrLoadModule('/src/stores/demo.ts')
 const {defaultConfig}=await vite.ssrLoadModule('/src/mocks/catalog.ts')
 const {validateConfig}=await vite.ssrLoadModule('/src/mocks/engine.ts')
 const pinia=createPinia();setActivePinia(pinia)
 const store=useDemoStore(pinia)
 const config={...defaultConfig(),name:'test-bottle-run',steps:1000,saveInterval:500}
 assert.equal(validateConfig(config,2).length,0)
 assert.ok(validateConfig({...config,gpuDevices:[0,1]},1).length)
 assert.ok(validateConfig(config,0).length)
 assert.equal(validateConfig({...config,gpuDevices:Array.from({length:8},(_,i)=>i)},8).length,0)
 assert.ok(validateConfig({...config,batchSize:0}).length)
 assert.ok(validateConfig({...config,gpuDevices:[]}).length)
 assert.ok(validateConfig({...config,learningRate:NaN}).length)
 assert.ok(validateConfig({...config,saveInterval:2000}).length)
 const id=store.launch(config,2),j=store.jobs.find(j=>j.id===id)
 assert.equal(j.status,'Pending');store.update();assert.equal(j.status,'Running')
 store.live=false;store.update();assert.equal(j.step,0);store.live=true
 for(let i=0;i<5;i++)store.update()
 assert.equal(j.step,500);assert.equal(store.checkpoints.filter(c=>c.job===id).length,1)
 const cp=store.checkpoints.find(c=>c.job===id)
 const resumed=store.launch({...config,name:'resume-test',resume:cp.name,steps:2000},2)
 const r=store.jobs.find(j=>j.id===resumed);assert.equal(r.step,500);assert.equal(r.loss,cp.loss)
 assert.throws(()=>store.launch({...config,resume:cp.name,steps:500},2))
 store.stop(resumed);store.update();assert.equal(r.status,'Stopped');assert.equal(r.step,500)
 const failedId=store.launch({...config,name:'failure-test'},2);store.fail(failedId);store.update();assert.equal(store.jobs.find(j=>j.id===failedId).status,'Failed')
 for(let i=0;i<5;i++)store.update()
 assert.equal(j.status,'Completed');assert.equal(j.step,1000);assert.equal(j.progress,100)
 assert.equal(store.checkpoints.filter(c=>c.job===id).length,2)
 assert.equal(store.lossHistories.find(h=>h.jobId===id).points.at(-1).loss,j.loss)
 const pinia2=createPinia();setActivePinia(pinia2);const restored=useDemoStore(pinia2)
 assert.equal(restored.jobs.find(j=>j.id===id).status,'Completed')
 assert.equal(restored.checkpoints.filter(c=>c.job===id).length,2)
 restored.reset();assert.equal(restored.jobs.length,4);assert.equal(restored.checkpoints.length,3)
 const {advanceJob}=await vite.ssrLoadModule('/src/mocks/engine.ts')
 const odd={...j,status:'Running',step:0,config:{...config,saveInterval:333},logs:[],metrics:[]}
 for(let i=0;i<4;i++)advanceJob(odd)
 assert.equal(odd.step,333)
 console.log('PASS: validation, pending/running/completed, pause, stop/failure, checkpoint/resume, persistence/reset')
 // Server-render each route with its real Pinia store and router to catch setup/template failures.
 const {createSSRApp}=await import('vue')
 const {renderToString}=await import('@vue/server-renderer')
 const routeDefs=(await vite.ssrLoadModule('/src/router/routes.ts')).routes
 const App=(await vite.ssrLoadModule('/src/App.vue')).default
 for(const path of ['/','/training','/jobs','/jobs/TRN-0248','/jobs/missing','/models','/models/new','/datasets','/datasets/new','/checkpoints','/settings','/training?resume=pi05_step_30000']) {
  const router=createRouter({history:createMemoryHistory(),routes:routeDefs})
  const app=createSSRApp(App);app.use(pinia2);app.use(router)
  await router.push(path);await router.isReady()
  const html=await renderToString(app)
  assert.ok(html.length>2000,path)
  assert.ok(!html.includes('NaN'),path)
  assert.ok(html.includes('Robotic Lab'),path)
  if(path==='/')assert.ok(!html.includes('模型实验概览'))
  if(path==='/datasets/new')assert.ok(html.includes('webkitdirectory')&&html.includes('选择文件'))
  if(path==='/datasets')assert.ok(html.includes('新建数据集')&&!html.includes('登记演示数据集'))
  if(path==='/training')assert.ok(html.includes('GPU 数量') && html.includes('保存与恢复') && !html.includes('stepper'))
  if(path==='/jobs/missing')assert.ok(html.includes('未找到此任务'))
  if(path==='/training?resume=pi05_step_30000')assert.ok(html.includes('pi05_step_30000') && html.includes('resume'))
  console.log('PASS render:',path)
 }
} finally {await vite.close()}
