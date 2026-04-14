<template>
  <div class="mb-map-page">
    <!-- 工具栏 -->
    <div class="map-toolbar">
      <span class="toolbar-title">🗺️ Mapbox 基础地图</span>
      <div class="toolbar-controls">
        <div class="btn-group">
          <button
            v-for="s in styleOptions"
            :key="s.key"
            :class="{ active: currentStyle === s.key }"
            @click="switchStyle(s.key)"
          >{{ s.label }}</button>
        </div>
        <button class="btn-icon" @click="locateMe">📍 定位</button>
        <button class="btn-icon" @click="flyTo(116.397, 39.908, 10)">🏙️ 北京</button>
        <button class="btn-icon" @click="flyTo(121.473, 31.230, 10)">🌆 上海</button>
        <button class="btn-icon" @click="toggleFullscreen">⛶ 全屏</button>
      </div>
      <span class="coord-display">{{ coordText }}</span>
    </div>

    <!-- 地图容器 -->
    <div ref="mapEl" class="map-body"></div>

    <!-- 弹出信息框 -->
    <div v-if="popup.visible" class="map-popup" :style="{ left: popup.x + 'px', top: popup.y + 'px' }">
      <div class="popup-close" @click="popup.visible = false">✕</div>
      <div class="popup-content">{{ popup.text }}</div>
    </div>

    <!-- 当前样式角标 -->
    <div class="style-badge">{{ currentStyleLabel }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Mapbox 公开演示 token（仅用于学习/演示）
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// ---- 响应式状态 ----
const mapEl = ref<HTMLDivElement>()
const coordText = ref('移动鼠标查看坐标')
const currentStyle = ref<'streets' | 'satellite' | 'outdoors' | 'dark'>('streets')
const popup = reactive({ visible: false, x: 0, y: 0, text: '' })

// ---- 样式配置 ----
const styleOptions = [
  { key: 'streets'   as const, label: '街道图',  url: 'mapbox://styles/mapbox/streets-v12' },
  { key: 'satellite' as const, label: '卫星图',  url: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { key: 'outdoors'  as const, label: '地形图',  url: 'mapbox://styles/mapbox/outdoors-v12' },
  { key: 'dark'      as const, label: '暗色图',  url: 'mapbox://styles/mapbox/dark-v11' },
]

const currentStyleLabel = computed(
  () => styleOptions.find(o => o.key === currentStyle.value)?.label ?? ''
)

// ---- 城市地标 ----
const landmarks = [
  { lng: 116.3975, lat: 39.9087, name: '天安门广场', emoji: '🏛️' },
  { lng: 121.4896, lat: 31.2397, name: '上海外滩',   emoji: '🌆' },
  { lng: 113.9285, lat: 22.5324, name: '深圳市中心', emoji: '🏙️' },
  { lng: 104.0665, lat: 30.5728, name: '成都天府广场', emoji: '🐼' },
  { lng: 108.9480, lat: 34.2588, name: '西安钟楼',   emoji: '🔔' },
  { lng: 120.1536, lat: 30.2874, name: '杭州西湖',   emoji: '⛵' },
]

let map: mapboxgl.Map
const markerInstances: mapboxgl.Marker[] = []

// ---- 样式切换 ----
function switchStyle(key: typeof currentStyle.value) {
  currentStyle.value = key
  const opt = styleOptions.find(o => o.key === key)!
  map.setStyle(opt.url)
  // 样式加载完成后重新添加标记
  map.once('style.load', addMarkers)
}

// ---- 添加地标 ----
function addMarkers() {
  markerInstances.forEach(m => m.remove())
  markerInstances.length = 0

  landmarks.forEach(lm => {
    // 自定义 DOM 标记
    const el = document.createElement('div')
    el.className = 'custom-marker'
    el.innerHTML = lm.emoji
    el.title = lm.name

    const mbPopup = new mapboxgl.Popup({ offset: 20, closeButton: false })
      .setHTML(`<div class="mb-popup-inner"><b>${lm.emoji} ${lm.name}</b><br/>
        经度：${lm.lng.toFixed(4)}<br/>纬度：${lm.lat.toFixed(4)}</div>`)

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([lm.lng, lm.lat])
      .setPopup(mbPopup)
      .addTo(map)

    markerInstances.push(marker)
  })
}

// ---- 定位 ----
function locateMe() {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition((pos) => {
    map.flyTo({
      center: [pos.coords.longitude, pos.coords.latitude],
      zoom: 13,
      duration: 900
    })
  })
}

// ---- 飞行 ----
function flyTo(lng: number, lat: number, zoom: number) {
  map.flyTo({ center: [lng, lat], zoom, duration: 900 })
}

// ---- 全屏 ----
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    mapEl.value?.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

// ---- 生命周期 ----
onMounted(() => {
  map = new mapboxgl.Map({
    container: mapEl.value!,
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [116.397, 39.908],
    zoom: 4,
    minZoom: 2,
    maxZoom: 20,
    attributionControl: false,
  })

  map.addControl(new mapboxgl.NavigationControl(), 'top-left')
  map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left')

  map.on('load', addMarkers)

  // 坐标显示
  map.on('mousemove', (e) => {
    coordText.value = `经度 ${e.lngLat.lng.toFixed(5)}  纬度 ${e.lngLat.lat.toFixed(5)}`
  })
})

onUnmounted(() => {
  map?.remove()
})
</script>

<style scoped>
.mb-map-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f0f1a;
  position: relative;
  overflow: hidden;
}

/* ---- 工具栏 ---- */
.map-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: #1a1a2e;
  border-bottom: 1px solid rgba(66, 184, 131, 0.25);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toolbar-title {
  color: #42b883;
  font-size: 0.9rem;
  font-weight: 700;
  white-space: nowrap;
}

.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-group {
  display: flex;
  border: 1px solid rgba(66, 184, 131, 0.3);
  border-radius: 4px;
  overflow: hidden;
}

.btn-group button {
  padding: 4px 12px;
  background: rgba(66, 184, 131, 0.06);
  color: #8a9bb0;
  border: none;
  border-right: 1px solid rgba(66, 184, 131, 0.2);
  cursor: pointer;
  font-size: 0.82rem;
  transition: all 0.2s;
}

.btn-group button:last-child { border-right: none; }

.btn-group button:hover,
.btn-group button.active {
  background: rgba(66, 184, 131, 0.22);
  color: #42b883;
}

.btn-icon {
  padding: 4px 10px;
  background: rgba(66, 184, 131, 0.06);
  color: #8a9bb0;
  border: 1px solid rgba(66, 184, 131, 0.25);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.82rem;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-icon:hover {
  background: rgba(66, 184, 131, 0.2);
  color: #42b883;
  border-color: #42b883;
}

.coord-display {
  margin-left: auto;
  color: #5a6a7a;
  font-size: 0.8rem;
  font-family: monospace;
  min-width: 220px;
  text-align: right;
}

/* ---- 地图主体 ---- */
.map-body {
  flex: 1;
  min-height: 0;
}

/* ---- 弹出信息框 ---- */
.map-popup {
  position: absolute;
  background: rgba(16, 20, 40, 0.95);
  border: 1px solid rgba(66, 184, 131, 0.5);
  border-radius: 8px;
  padding: 10px 14px;
  color: #cde;
  font-size: 0.82rem;
  line-height: 1.7;
  white-space: pre-line;
  z-index: 200;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
}

.popup-close {
  position: absolute;
  top: 4px;
  right: 8px;
  cursor: pointer;
  color: #8a9bb0;
  font-size: 0.75rem;
}

.popup-close:hover { color: #ff6b6b; }

/* ---- 角标 ---- */
.style-badge {
  position: absolute;
  bottom: 36px;
  left: 10px;
  background: rgba(16, 20, 40, 0.78);
  border: 1px solid rgba(66, 184, 131, 0.35);
  border-radius: 4px;
  color: #42b883;
  font-size: 0.75rem;
  padding: 2px 8px;
  pointer-events: none;
  z-index: 100;
}

/* ---- 自定义标记 ---- */
:global(.custom-marker) {
  font-size: 1.6rem;
  cursor: pointer;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));
  transition: transform 0.15s;
  line-height: 1;
}

:global(.custom-marker:hover) {
  transform: scale(1.3);
}

/* Mapbox 弹出框样式覆盖 */
:global(.mb-popup-inner) {
  font-size: 0.82rem;
  line-height: 1.6;
  color: #cde;
}

:global(.mapboxgl-popup-content) {
  background: rgba(16, 20, 40, 0.95) !important;
  border: 1px solid rgba(66, 184, 131, 0.4) !important;
  border-radius: 8px !important;
  color: #cde !important;
  padding: 10px 14px !important;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5) !important;
}

:global(.mapboxgl-popup-tip) {
  border-top-color: rgba(66, 184, 131, 0.4) !important;
}

:global(.mapboxgl-ctrl-group) {
  background: rgba(16, 20, 40, 0.9) !important;
  border: 1px solid rgba(66, 184, 131, 0.3) !important;
}

:global(.mapboxgl-ctrl button) {
  background-color: transparent !important;
}

:global(.mapboxgl-ctrl-scale) {
  background: rgba(16, 20, 40, 0.7) !important;
  border-color: #42b883 !important;
  color: #42b883 !important;
  font-size: 11px !important;
}
</style>
