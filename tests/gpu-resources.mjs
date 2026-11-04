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
