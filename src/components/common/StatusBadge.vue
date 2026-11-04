<script setup lang="ts">
import type { JobStatus } from '../../types'
import { statusLabels } from '../../mocks/catalog'
defineProps<{status:JobStatus}>()
</script>
<template><span :class="['status',status.toLowerCase()]"><i></i>{{statusLabels[status]}}</span></template>
