<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowUpRight, ArrowRight, Activity, Cpu, ScanLine, Database, Box, ChartNoAxesCombined, Check, Workflow } from '@lucide/vue'
import { useDemoStore } from '../../stores/demo'
const store = useDemoStore()
const selected = ref(0)
const runningCount=computed(()=>store.jobs.filter(j=>j.status==='Running').length)
const usedGpus=computed(()=>store.gpus.filter(g=>g.utilization>0).length)
const stages = computed(()=>[
 { name: '数据准备', en: 'DATA', subtitle: '准备数据', icon: Database, title: '让每一个 episode 都有迹可循', description: `${store.datasets.length} 个演示数据集已登记，可查看格式、存储位置与采集规模。模型兼容性尚未验证。`, chips: [`${store.datasets.reduce((n,d)=>n+d.episodes,0).toLocaleString()} episodes`, '模拟数据资产', `${store.datasets.length} 个数据集`] },
 { name: '模型训练', en: 'TRAIN', subtitle: '训练模型', icon: Box, title: '你的下一次突破，正在训练中', description: `${runningCount.value} 个模拟实验正在运行，${usedGpus.value} 张 GPU 正在使用。从资源到模型收敛，在一个工作空间掌握全局。`, chips: [`${runningCount.value} 个实验运行中`, `已使用 ${usedGpus.value} / 4 张 GPU`, '模拟环境'] },
 { name: '模型评测', en: 'EVALUATE', subtitle: '评估表现', icon: ChartNoAxesCombined, title: '从训练指标，走向任务表现', description: '后续将在此接入策略评测与任务成功率对比。当前未接入评测结果，训练 Loss 不代表机器人任务成功率。', chips: ['待接入评测服务', '任务成功率', '策略对比'] },
 { name: '数据反馈', en: 'ITERATE', subtitle: '持续迭代', icon: Workflow, title: '让实验结果，指导下一轮迭代', description: '通过 Checkpoint 与实验记录回溯训练过程。数据反馈流程将在后续阶段逐步接入。', chips: [`${store.checkpoints.length} 个 Checkpoint 样本`, '实验可追溯', '反馈流程待接入'] }
])
selected.value=1
const stage=computed(()=>stages.value[selected.value]!)
const emit=defineEmits<{inspect:[]}>()
</script>
<template>
<section class="spotlight">
 <div class="spotlight-copy">
  <div class="spotlight-kicker"><span class="signal-light"></span> Robotic Lab <span> / </span> 工作空间 01</div>
  <h2>{{stage.title}}</h2><p>{{stage.description}}</p>
  <div class="spotlight-chips"><span v-for="chip in stage.chips" :key="chip"><Check :size="12"/>{{chip}}</span></div>
  <button class="spotlight-link" @click="emit('inspect')">查看当前实验快照 <ArrowRight :size="15"/></button>
 </div>
 <div class="compute-visual" :aria-label="`模拟 GPU 集群资源图，${usedGpus} 张使用中`">
  <div class="compute-top"><span><Cpu :size="13"/> GPU 计算集群</span><span class="compute-demo">模拟</span></div>
  <div class="compute-rack"><div v-for="gpu in store.gpus" :key="gpu.id" :class="['compute-node',{available:gpu.utilization===0}]"><div class="node-top"><span>0{{gpu.id}}</span><i></i></div><Cpu :size="26" :stroke-width="1.2"/><strong>{{gpu.utilization===0?'空闲':gpu.utilization+'%'}}</strong><div class="node-bars"><i v-for="n in 12" :key="n" :class="{filled:n<=Math.round(gpu.utilization/100*12)}"></i></div></div></div>
  <div class="compute-bottom"><span><Activity :size="12"/> NVIDIA A100 <b>80GB</b></span><span>{{4-usedGpus}} 张 GPU 可用 <ArrowUpRight :size="12"/></span></div>
 </div>
 <div class="pipeline"><button v-for="(item,index) in stages" :key="item.en" :class="{selected:selected===index}" :aria-pressed="selected===index" @click="selected=index"><span class="pipeline-number">0{{index+1}}</span><component :is="item.icon" :size="16"/><span>{{item.name}}<small>{{item.subtitle}}</small></span><ArrowRight v-if="index<3" class="pipeline-arrow" :size="14"/></button></div>
</section>
</template>
