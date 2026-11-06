import type { RouteRecordRaw } from 'vue-router'
import Overview from '../views/Overview.vue'
export const routes:RouteRecordRaw[]=[
 {path:'/',name:'Overview',component:Overview,meta:{title:'总览',section:'Overview'}},
 {path:'/training/real',name:'RealTraining',component:()=>import('../views/RealTraining.vue'),meta:{title:'真实训练',section:'Training'}},
 {path:'/real-jobs',name:'RealJobs',component:()=>import('../views/RealJobs.vue'),meta:{title:'真实任务',section:'Jobs'}},
 {path:'/real-jobs/:id',name:'RealJobDetail',component:()=>import('../views/RealJobDetail.vue'),meta:{title:'真实任务监控',section:'Jobs'}},
 {path:'/training',name:'Training',component:()=>import('../views/NewTraining.vue'),meta:{title:'新建训练',section:'Training'}},
 {path:'/jobs',name:'Jobs',component:()=>import('../views/Jobs.vue'),meta:{title:'训练任务',section:'Jobs'}},
 {path:'/jobs/:id',name:'JobDetail',component:()=>import('../views/JobDetail.vue'),meta:{title:'任务监控',section:'Jobs'}},
 {path:'/models/new',name:'NewModel',component:()=>import('../views/NewModel.vue'),meta:{title:'新建模型',section:'Models'}},
 {path:'/models',name:'Models',component:()=>import('../views/Models.vue'),meta:{title:'模型与环境',section:'Models'}},
 {path:'/datasets/new',name:'NewDataset',component:()=>import('../views/NewDataset.vue'),meta:{title:'新建数据集',section:'Datasets'}},
 {path:'/datasets/:id',name:'DatasetViewer',component:()=>import('../views/DatasetViewer.vue'),meta:{title:'数据集可视化',section:'Datasets'}},
 {path:'/datasets',name:'Datasets',component:()=>import('../views/Datasets.vue'),meta:{title:'数据集',section:'Datasets'}},
 {path:'/checkpoints',name:'Checkpoints',component:()=>import('../views/Checkpoints.vue'),meta:{title:'Checkpoints',section:'Checkpoints'}},
 {path:'/settings',name:'Settings',component:()=>import('../views/Settings.vue'),meta:{title:'设置',section:'Settings'}},
 {path:'/:pathMatch(.*)*',redirect:'/'}
]
