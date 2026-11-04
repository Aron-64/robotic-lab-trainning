<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRight,Sun,Moon,RotateCcw,PanelLeftClose,Menu,Command } from '@lucide/vue'
import Sidebar from './Sidebar.vue'
import { useDemoStore } from '../../stores/demo'
const store=useDemoStore();const mobile=ref(false);const route=useRoute()
let timer:ReturnType<typeof setInterval>
onMounted(()=>{timer=setInterval(store.update,2000);store.syncImportedModels().catch(()=>{});store.syncUploadedDatasets().catch(()=>{})})
onBeforeUnmount(()=>clearInterval(timer))
</script>
<template><div class="app-shell"><div v-if="mobile" class="sidebar-scrim" @click="mobile=false"></div><Sidebar :open="mobile" @close="mobile=false"/><div class="main-shell"><header class="topbar"><div class="breadcrumbs"><button class="icon-button mobile-menu" aria-label="打开导航" @click="mobile=!mobile"><Menu :size="20"/></button><PanelLeftClose class="desktop-only" :size="17"/><span class="desktop-only">工作空间</span><ChevronRight :size="14"/><strong>{{route.meta.title}}</strong></div><div class="topbar-actions"><span class="demo-badge">演示</span><span class="local-status"><i></i> 本地工作空间</span><span class="divider"></span><button class="icon-button" :aria-label="store.dark?'切换浅色模式':'切换深色模式'" @click="store.dark=!store.dark"><Sun v-if="store.dark" :size="18"/><Moon v-else :size="18"/></button><button class="reset-button" @click="store.reset"><RotateCcw :size="14"/><span>重置演示</span></button></div></header><main><slot/></main><footer><span><Command :size="13"/> Robotic Lab</span><span>本地演示 · 无真实训练任务 <span class="footer-version">v0.2.0</span></span></footer></div><Transition name="toast"><div v-if="store.notice" class="toast" role="status">{{store.notice}}</div></Transition></div></template>
