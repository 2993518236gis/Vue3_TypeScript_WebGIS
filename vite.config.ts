import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  base: '/Vue3_TypeScript_WebGIS/',
  // server: {
  //   port: 8080
  // },
  plugins: [vue(), cesium()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
