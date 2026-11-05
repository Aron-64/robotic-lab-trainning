import {parentPort,workerData} from 'node:worker_threads'
import {inspectDataset} from './dataset-visualizer.mjs'
try{parentPort.postMessage({result:await inspectDataset(workerData.session,workerData.base)})}
catch(error){parentPort.postMessage({error:error.message})}
