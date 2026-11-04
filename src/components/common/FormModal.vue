<script setup lang="ts">
import { ref,onMounted } from 'vue'
import { X } from '@lucide/vue'
defineProps<{title:string}>()
const emit=defineEmits<{close:[]}>()
const el=ref<HTMLDialogElement>()
onMounted(()=>el.value?.showModal())
</script>
<template><Teleport to="body"><dialog ref="el" class="modal native-modal" :aria-label="title" @cancel.prevent="emit('close')"><div class="section-heading"><h2>{{title}}</h2><button class="icon-button" aria-label="关闭" @click="emit('close')"><X :size="18"/></button></div><slot/></dialog></Teleport></template>
