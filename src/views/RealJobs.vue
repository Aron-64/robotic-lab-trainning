<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount} from 'vue'
import {useRouter} from 'vue-router'
import {listRealJobs,realLabels} from '../api/training'
import type {RealJob} from '../api/training'
const jobs=ref<RealJob[]>([]),error=ref(''),router=useRouter();let timer:ReturnType<typeof setTimeout>,disposed=false
async function refresh(){try{jobs.value=(await listRealJobs()).jobs;error.value=''}catch(e){error.value=String(e)}finally{if(!disposed)timer=setTimeout(refresh,2500)}}
onMounted(refresh);onBeforeUnmount(()=>{disposed=true;clearTimeout(timer)})
</script>
<template><div class="page-heading"><div><h1>真实训练任务</h1><p>串行执行队列 · 状态与指标来自实际进程</p></div><button class="button primary" @click="router.push('/training/real')">新建真实训练</button><button class="button" @click="router.push('/jobs')">模拟任务</button></div><p v-if="error" class="form-error">{{error}}</p><section class="panel page-table"><table><thead><tr><th>任务</th><th>模型 / 数据集</th><th>状态</th><th>Step</th><th>Loss</th><th>操作</th></tr></thead><tbody><tr v-for="j in jobs" :key="j.id"><td>{{j.name}}</td><td>{{j.modelName}}<small>{{j.datasetName}}</small></td><td>{{realLabels[j.status]||j.status}}</td><td>{{j.step}} / {{j.steps}}</td><td>{{j.loss??'尚未产生'}}</td><td><button class="text-link" @click="router.push('/real-jobs/'+j.id)">监控</button></td></tr></tbody></table><p v-if="!jobs.length" class="empty-state">暂无真实任务。</p></section></template>
