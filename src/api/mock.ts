import { initialJobs, initialGpus, checkpoints, jobLossHistories } from '../mocks/data'
export function getDemoOverview() { return structuredClone({ jobs: initialJobs, gpus: initialGpus, checkpoints, jobLossHistories }) }
