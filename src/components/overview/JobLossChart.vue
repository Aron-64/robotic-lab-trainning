<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDemoStore } from '../../stores/demo'
import MetricChart from '../charts/MetricChart.vue'
const store = useDemoStore()
const selectedId = ref('')
const histories = computed(() => new Map(store.lossHistories.map(history => [history.jobId, history.points])))
const runningJobs = computed(() => store.jobs.filter(job => job.status === 'Running').sort((a,b) => b.started.localeCompare(a.started) || b.id.localeCompare(a.id)))
watch(runningJobs, jobs => {
 if (!jobs.some(job => job.id === selectedId.value)) selectedId.value = jobs[0]?.id ?? ''
}, { immediate: true })
const selectedJob = computed(() => runningJobs.value.find(job => job.id === selectedId.value))
const points = computed(() => histories.value.get(selectedId.value) ?? [])
const option = computed(() => {
 const text = store.dark ? '#91a0b6' : '#8792a5'
 const grid = store.dark ? '#273347' : '#eef1f6'
 return {
  animationDuration: 300,
  grid: { top: 25, right: 20, bottom: 35, left: 45 },
  tooltip: { trigger: 'axis', renderMode: 'richText', confine: true, valueFormatter: (value: unknown) => Number(value).toFixed(4) },
  xAxis: { type: 'value', name: '训练步数', nameLocation: 'middle', nameGap: 23, nameTextStyle: { color: text, fontSize: 10 }, axisLabel: { color: text, fontSize: 10, formatter: (value: number) => value === 0 ? '0' : value / 1000 + 'k' }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
  yAxis: { type: 'value', min: 0, name: 'Loss', nameTextStyle: { color: text, fontSize: 10 }, splitNumber: 4, axisLabel: { color: text, fontSize: 10 }, splitLine: { lineStyle: { color: grid, type: 'dashed' } } },
  series: selectedJob.value ? [{
   id: selectedJob.value.id, name: `${selectedJob.value.id} · ${selectedJob.value.name}`, type: 'line', smooth: false, showSymbol: false,
   lineStyle: { width: 2.3 }, itemStyle: { color: '#3974f6' }, areaStyle: { opacity: 0.06 },
   data: points.value.map(point => [point.step, point.loss])
  }] : []
 }
})
</script>
<template>
<section class="panel loss-panel task-loss-panel">
 <div class="section-heading"><div><h2>训练任务 Loss 趋势</h2><p>查看运行中的单个训练任务 · Mock</p></div><span v-if="selectedJob" class="small-badge">运行中</span></div>
 <div class="task-selector"><label for="loss-job">选择训练任务 <span>按启动时间从新到旧</span></label><select id="loss-job" v-model="selectedId" :disabled="!runningJobs.length"><option v-if="!runningJobs.length" value="">暂无运行中的任务</option><option v-for="job in runningJobs" :key="job.id" :value="job.id">{{job.name}} · {{job.id}}</option></select></div>
 <template v-if="selectedJob"><div class="selected-job-info"><span>{{selectedJob.model}} · {{selectedJob.id}}</span><span>数据集：{{selectedJob.dataset}}</span></div><MetricChart v-if="points.length" :option="option"/><p v-else class="loss-empty">任务已启动，等待首条 Loss 记录。</p><div class="selected-job-metrics"><span>最新 Loss <strong>{{points.at(-1)?.loss.toFixed(4) ?? '—'}}</strong></span><span>训练步数 <strong>{{points.at(-1)?.step.toLocaleString() ?? '—'}}</strong></span></div></template>
 <p v-else class="loss-empty">暂无正在训练的任务，启动训练后可在此查看 Loss。</p>
</section>
</template>
<style scoped>
.task-loss-panel .metric-chart{margin-top:10px;height:210px}.task-selector{padding:17px 20px 0}.task-selector label{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--text);margin-bottom:8px}.task-selector label span{font-size:9px;color:var(--muted)}.task-selector select{width:100%;min-width:0;border:1px solid var(--border);border-radius:6px;background:var(--subtle);color:var(--text);font-size:11px;padding:9px;text-overflow:ellipsis}.selected-job-info{display:flex;flex-direction:column;gap:4px;padding:10px 20px 0;font-size:10px;color:var(--muted);overflow-wrap:anywhere}.selected-job-metrics{display:flex;justify-content:space-between;gap:12px;padding:13px 20px;border-top:1px solid var(--border);font-size:10px;color:var(--muted)}.selected-job-metrics strong{margin-left:7px;color:var(--text);font-weight:550;font-variant-numeric:tabular-nums}.loss-empty{padding:32px 20px;font-size:12px;color:var(--muted);line-height:1.8}
</style>
