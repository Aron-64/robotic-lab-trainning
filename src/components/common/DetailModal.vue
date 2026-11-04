<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { X } from '@lucide/vue'
defineProps<{title:string; details:Record<string,string|number>}>()
const emit=defineEmits<{close:[]}>()
const dialog=ref<HTMLDialogElement>()
onMounted(()=>dialog.value?.showModal())
</script>
<template><Teleport to="body"><dialog ref="dialog" class="modal native-modal" :aria-label="title" @cancel.prevent="emit('close')" @click="event=>{if(event.target===dialog)emit('close')}"><div class="section-heading"><h2>{{title}}</h2><button autofocus class="icon-button" aria-label="关闭详情" @click="emit('close')"><X :size="20"/></button></div><p class="muted">Demo 数据 · 未连接真实训练服务</p><dl><div v-for="(value,key) in details" :key="key"><dt>{{key}}</dt><dd>{{value}}</dd></div></dl><button class="button primary" @click="emit('close')">完成</button></dialog></Teleport></template>
