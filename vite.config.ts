import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { datasetUploadPlugin } from './server/dataset-uploads.mjs'
import { modelManagerPlugin } from './server/model-manager.mjs'
import { gpuResourcePlugin } from './server/gpu-resources.mjs'
export default defineConfig({ plugins: [vue(), gpuResourcePlugin(), modelManagerPlugin(), datasetUploadPlugin()], server: { port: 5173 }, build: { rollupOptions: { output: { manualChunks: { charts: ['echarts/core','echarts/charts','echarts/components','echarts/renderers'] } } } } })
