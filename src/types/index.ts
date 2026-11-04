export type JobStatus = 'Running' | 'Completed' | 'Failed' | 'Stopped' | 'Pending'
export interface TrainingConfig { name:string; model:string; dataset:string; environment:string; steps:number; batchSize:number; learningRate:number; optimizer:string; precision:string; gpuDevices:number[]; saveInterval:number; outputDir:string; resume:string; seed:number; extra:number }
export interface Job { id: string; name: string; model: string; dataset: string; status: JobStatus; progress: number; step: number; loss: number; gpu: string; started: string; config?:TrainingConfig; elapsed?:number; logs?:string[]; metrics?:MetricPoint[] }
export interface MetricPoint { step:number; lr:number; utilization:number; memory:number }
export interface Gpu { id: number; utilization: number; memory: number; temperature: number }
export interface Checkpoint { name: string; model: string; job: string; step: number; size: string; created?:string; path?:string; loss?:number }
export interface LossPoint { step: number; loss: number }
export interface JobLossHistory { jobId: string; points: LossPoint[] }
export interface Model { id:string; name:string; framework:string; description:string; repo:string; environment:string; python:string; entry:string; version:string; torch:string; checked:boolean; extraLabel:string; extraDefault:number; source?:'import'; weights?:string }
export interface Dataset { id:string; name:string; format:string; episodes:number; size:string; path:string; description:string; source?:'upload'; fileCount?:number }

export interface ModelImport { id:string; name:string; github:string; weights:string; provider:string; repoId:string; revision:string; python:string; status:string; error:string; createdAt:string; logs:string[]; paths:{root:string;code?:string;weights?:string;environment?:string;python?:string}; readme?:string; readmeFile?:string; commit?:string; weightsDownloaded?:boolean; runtime?:{python:string;torch:string}; plan?:{commands:{label:string;args:string[]}[];unsupported:string[];automatic:boolean} }
