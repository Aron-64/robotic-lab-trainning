import type { Model, Dataset, TrainingConfig, JobStatus } from '../types'
export const modelCatalog:Model[]=[
 {id:'pi05',name:'Pi0.5',framework:'LeRobot',description:'视觉、语言与动作联合建模，探索通用机器人操作。',repo:'/demo/models/pi05',environment:'/demo/models/pi05/.venv',python:'/demo/models/pi05/.venv/bin/python',entry:'train.py',version:'3.11',torch:'2.6 · Mock',checked:false,extraLabel:'动作分块长度',extraDefault:50},
 {id:'groot',name:'NVIDIA GR00T',framework:'NVIDIA',description:'面向多任务具身学习的模型训练工作流。',repo:'/demo/models/groot',environment:'/demo/models/groot/.venv',python:'/demo/models/groot/.venv/bin/python',entry:'train.py',version:'3.10',torch:'2.5 · Mock',checked:false,extraLabel:'预测动作步数',extraDefault:16},
 {id:'lingbot',name:'LingBot-VLA 2.0',framework:'PyTorch',description:'从视觉感知与语言指令到机器人动作策略。',repo:'/demo/models/lingbot',environment:'/demo/models/lingbot/.venv',python:'/demo/models/lingbot/.venv/bin/python',entry:'train.py',version:'3.11',torch:'2.6 · Mock',checked:false,extraLabel:'观测窗口长度',extraDefault:2}
]
export const datasetCatalog:Dataset[]=[
 {id:'bottle',name:'pick_place_waterbottle',format:'LeRobot',episodes:1280,size:'42.8 GB',path:'/demo/datasets/pick_place_waterbottle',description:'水瓶抓取与放置场景，包含多视角观测与机器人动作。'},
 {id:'robotwin',name:'RoboTwin 2.0 Clean',format:'HDF5',episodes:800,size:'64.2 GB',path:'/demo/datasets/robotwin-clean',description:'双臂操作任务样本，演示多场景训练数据管理。'},
 {id:'manipulation',name:'Manipulation Dataset A',format:'Parquet',episodes:400,size:'21.6 GB',path:'/demo/datasets/manipulation-a',description:'桌面物体操作数据，演示策略训练的数据输入。'}
]
export const statusLabels:Record<JobStatus,string>={Pending:'等待中',Running:'运行中',Completed:'已完成',Failed:'失败',Stopped:'已停止'}
export function defaultConfig(model=modelCatalog[0]!):TrainingConfig { return {name:'',model:model.name,dataset:datasetCatalog[0]!.name,environment:model.environment,steps:50000,batchSize:16,learningRate:0.0001,optimizer:'AdamW',precision:'bf16',gpuDevices:[0],saveInterval:5000,outputDir:'/demo/outputs',resume:'',seed:42,extra:model.extraDefault} }
export function formatTime(seconds=0) { const n=Math.max(0,Math.floor(seconds));return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}` }
export function timestamp() { return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()) }
