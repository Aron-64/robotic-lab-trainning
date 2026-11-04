<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import PageHeading from '../components/common/PageHeading.vue'
import DetailModal from '../components/common/DetailModal.vue'
import {useDemoStore} from '../stores/demo'
import {download} from '../utils/download'
import type {Checkpoint} from '../types'
const store=useDemoStore(),route=useRoute(),router=useRouter(),model=ref(''),job=ref(String(route.query.job??'')),search=ref(''),detail=ref<Checkpoint|null>(null)
watch(()=>route.query.job,v=>job.value=String(v??''))
const rows=computed(()=>store.checkpoints.filter(c=>(!model.value||c.model===model.value)&&(!job.value||c.job===job.value)&&c.name.toLowerCase().includes(search.value.toLowerCase())))
function save(cp:Checkpoint){download(cp.name+'.mock.json',JSON.stringify({mode:'MOCK',containsWeights:false,description:'仅为模拟 Checkpoint 元数据，不包含模型权重',...cp},null,2),'application/json');store.notify('已下载模拟元数据 JSON，不包含模型权重。')}
</script>
<template><PageHeading title="Checkpoints" description="保存实验里程碑，追溯模型状态并准备后续训练。"/><div class="page-toolbar"><input v-model="search" placeholder="搜索 Checkpoint 名称…" aria-label="搜索 Checkpoint"/><select v-model="model" aria-label="按模型筛选"><option value="">全部模型</option><option v-for="m in store.models" :key="m.id">{{m.name}}</option></select><select v-model="job" aria-label="按训练任务筛选"><option value="">全部任务</option><option v-for="j in store.jobs" :key="j.id" :value="j.id">{{j.name}} · {{j.id}}</option></select></div><section class="panel page-table"><table><thead><tr><th>Checkpoint / 路径</th><th>模型 / 任务</th><th>Global Step</th><th>创建时间</th><th>演示大小</th><th>操作</th></tr></thead><tbody><tr v-for="cp in rows" :key="cp.job+cp.name"><td><button class="text-link" @click="detail=cp">{{cp.name}}</button><div class="path-text">{{cp.path}}</div></td><td>{{cp.model}}<div><button class="text-link" @click="router.push('/jobs/'+cp.job)">{{cp.job}}</button></div></td><td>{{cp.step.toLocaleString()}}</td><td>{{cp.created}}</td><td>{{cp.size}}</td><td><div class="row-actions"><button class="text-link" @click="save(cp)">模拟下载</button><button class="text-link" @click="router.push({path:'/training',query:{resume:cp.name}})">Resume</button></div></td></tr></tbody></table><div v-if="!rows.length" class="empty-state">暂无匹配的 Checkpoint。<br>任务达到保存间隔后会自动生成模拟记录。</div><div class="panel-foot">{{rows.length}} 个模拟快照 · 无真实权重文件</div></section><div class="info-note">Resume 会打开新建训练页面并预填恢复配置，经确认后创建新的模拟任务。原始任务保持不变。</div><DetailModal v-if="detail" :title="detail.name" :details="{'模型':detail.model,'训练任务':detail.job,'Global Step':detail.step,'创建时间':detail.created??'演示时间','演示大小':detail.size,'路径':detail.path??'/demo/checkpoints','内容':'仅 Mock 元数据，无真实权重'}" @close="detail=null"/></template>
