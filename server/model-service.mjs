import {trainingMiddleware} from './training-service.mjs'
import {createServer} from 'node:http'
import {modelManagerMiddleware} from './model-manager.mjs'
import {datasetUploadMiddleware} from './dataset-uploads.mjs'
import {gpuMiddleware} from './gpu-resources.mjs'
const port=Number(process.env.MODEL_SERVICE_PORT??8001)
createServer((req,res)=>modelManagerMiddleware(req,res,()=>datasetUploadMiddleware(req,res,()=>trainingMiddleware(req,res,()=>gpuMiddleware(req,res))))).listen(port,'127.0.0.1',()=>console.log(`Model service: http://127.0.0.1:${port}/api/model-imports`))
