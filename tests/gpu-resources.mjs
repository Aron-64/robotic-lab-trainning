import assert from 'node:assert/strict'
import {parseVisibleGpus} from '../server/gpu-resources.mjs'
const rows='0, GPU-one, NVIDIA A100\n1, GPU-two, NVIDIA A100\n2, GPU-three, NVIDIA A100'
assert.equal(parseVisibleGpus(rows).length,3)
assert.equal(parseVisibleGpus(rows,{CUDA_VISIBLE_DEVICES:'1'}).length,1)
assert.equal(parseVisibleGpus(rows,{NVIDIA_VISIBLE_DEVICES:'GPU-one,GPU-two'}).length,2)
assert.equal(parseVisibleGpus(rows,{CUDA_VISIBLE_DEVICES:'-1'}).length,0)
assert.equal(parseVisibleGpus(rows,{CUDA_VISIBLE_DEVICES:''}).length,0)
assert.equal(parseVisibleGpus('').length,0)
assert.throws(()=>parseVisibleGpus(rows,{CUDA_VISIBLE_DEVICES:'9'}))
assert.throws(()=>parseVisibleGpus(rows,{CUDA_VISIBLE_DEVICES:'MIG-example'}))
assert.throws(()=>parseVisibleGpus('bad output'))
console.log('PASS: GPU count, container visibility limits, zero GPU, invalid/MIG fail closed')

const {parseVisibleXpus,detectGpus}=await import('../server/gpu-resources.mjs')
const xpuRows=`| XPU-SMI Driver Version: 5.0.21 |
| XPU Name Persistence-M | Bus-Id |
| 0 P800 OAM N/A | 00000000:A3:00.0 N/A | 0 |
| N/A 35C P0 60W / 400W | 0MiB / 98304MiB | 0% |
| 2 P800 OAM N/A | 00000000:A4:00.0 N/A | 0 |
| 0 12345 C python P800 10MiB |`
assert.equal(parseVisibleXpus(xpuRows).length,2)
assert.deepEqual(parseVisibleXpus(xpuRows,{XPU_VISIBLE_DEVICES:'2'}),[{index:0,physicalIndex:2,name:'P800 OAM'}])
assert.equal(parseVisibleXpus(xpuRows,{XPU_VISIBLE_DEVICES:'-1'}).length,0)
assert.equal(parseVisibleXpus(xpuRows,{XPU_VISIBLE_DEVICES:''}).length,0)
assert.equal(parseVisibleXpus(xpuRows,{XPU_VISIBLE_DEVICES:'all',CXPU_VISIBLE_DEVICES:'0'}).length,1)
assert.equal(parseVisibleXpus('No devices found').length,0)
for(const value of ['1','2,2','abc','0,'])assert.throws(()=>parseVisibleXpus(xpuRows,{XPU_VISIBLE_DEVICES:value}))
assert.throws(()=>parseVisibleXpus('unrecognized output'))
assert.throws(()=>parseVisibleXpus(xpuRows+'\nVXPU Virtual Function'))
const calls=[]
const missing=Object.assign(new Error('missing'),{code:'ENOENT'})
let result=await detectGpus({env:{},run:async(command)=>{calls.push(command);return {stdout:xpuRows}}})
assert.equal(result.source,'xpu-smi');assert.equal(result.count,2);assert.deepEqual(calls,['xpu-smi'])
result=await detectGpus({env:{},run:async(command)=>{if(command==='xpu-smi')throw missing;return {stdout:rows}}})
assert.equal(result.source,'nvidia-smi');assert.equal(result.count,3)
for(const env of [{ACCELERATOR_BACKEND:'xpu'},{XPU_VISIBLE_DEVICES:'0'}]){
 const attempted=[];result=await detectGpus({env,run:async(command)=>{attempted.push(command);throw missing}})
 assert.equal(result.status,'unavailable');assert.deepEqual(attempted,['xpu-smi'])
}
result=await detectGpus({env:{},run:async(command)=>{assert.equal(command,'xpu-smi');throw Object.assign(new Error('timeout'),{killed:true})}})
assert.equal(result.status,'unavailable');assert.match(result.message,/超时/)
result=await detectGpus({env:{},run:async()=>({stdout:'unknown driver output'})})
assert.equal(result.status,'unavailable')
result=await detectGpus({env:{ACCELERATOR_BACKEND:'nvidia'},run:async(command)=>{assert.equal(command,'nvidia-smi');return {stdout:rows}}})
assert.equal(result.count,3)
console.log('PASS: P800 table parsing, visibility, physical IDs, malformed/virtual output, backend selection, missing tool fallback and driver failure')
