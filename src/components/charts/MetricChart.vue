<script setup lang="ts">
import { onMounted,onBeforeUnmount,ref,watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart,BarChart } from 'echarts/charts'
import { GridComponent,TooltipComponent,LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
echarts.use([LineChart,BarChart,GridComponent,TooltipComponent,LegendComponent,CanvasRenderer])
const props=defineProps<{option:EChartsCoreOption}>()
const el=ref<HTMLDivElement>();let chart:echarts.ECharts;let observer:ResizeObserver
onMounted(()=>{chart=echarts.init(el.value);chart.setOption(props.option);observer=new ResizeObserver(()=>chart.resize());observer.observe(el.value!)})
watch(()=>props.option,v=>chart?.setOption(v,true),{deep:true})
onBeforeUnmount(()=>{observer?.disconnect();chart?.dispose()})
</script>
<template><div ref="el" class="metric-chart" role="img" aria-label="训练数据图表"></div></template>
