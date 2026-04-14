<template>
  <div class="mb-3d-page">
    <!-- 工具栏 -->
    <div class="map-toolbar">
      <span class="toolbar-title">🏙️ Mapbox 3D建筑</span>
      <div class="toolbar-controls">
        <button class="btn-icon" :class="{ active: buildingsVisible }" @click="toggleBuildings">
          🏢 建筑物
        </button>
        <button class="btn-icon" :class="{ active: terrainEnabled }" @click="toggleTerrain">
          ⛰️ 三维地形
        </button>
        <button class="btn-icon" @click="flyTo(121.473, 31.230, 15, 45)">🌆 上海</button>
        <button class="btn-icon" @click="flyTo(116.397, 39.908, 15, 45)">🏙️ 北京</button>
        <button class="btn-icon" @click="flyTo(114.057, 22.543, 15, 45)">🌃 深圳</button>
        <button class="btn-icon" @click="resetView">🔄 复位</button>
      </div>
      <span class="tip-text">💡 右键拖拽旋转视角 · 滚轮缩放</span>
    </div>

    <!-- 地图容器 -->
    <div ref="mapEl" class="map-body"></div>

    <!-- 信息面板 -->
    <div class="info-panel">
      <div class="info-title">📊 场景信息</div>
      <div class="info-row"><span class="info-label">缩放级别</span><span class="info-val">{{ info.zoom }}</span></div>
      <div class="info-row"><span class="info-label">俯仰角</span><span class="info-val">{{ info.pitch }}°</span></div>
      <div class="info-row"><span class="info-label">方位角</span><span class="info-val">{{ info.bearing }}°</span></div>
      <div class="info-row"><span class="info-label">中心经度</span><span class="info-val">{{ info.lng }}</span></div>
      <div class="info-row"><span class="info-label">中心纬度</span><span class="info-val">{{ info.lat }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

const mapEl = ref<HTMLDivElement>()
const buildingsVisible = ref(true)
const terrainEnabled = ref(false)

const info = reactive({
  zoom: '0.00',
  pitch: '0.0',
  bearing: '0.0',
  lng: '0.00000',
  lat: '0.00000',
})

let map: mapboxgl.Map

// ---- 建筑物开关 ----
function toggleBuildings() {
  buildingsVisible.value = !buildingsVisible.value
  if (map.getLayer('3d-buildings')) {
    map.setLayoutProperty('3d-buildings', 'visibility', buildingsVisible.value ? 'visible' : 'none')
  }
}

// ---- 地形开关 ----
function toggleTerrain() {
  terrainEnabled.value = !terrainEnabled.value
  if (terrainEnabled.value) {
    if (!map.getSource('mapbox-dem')) {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      })
    }
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
  } else {
    map.setTerrain(undefined as unknown as mapboxgl.TerrainSpecification)
  }
}

// ---- 飞行 ----
function flyTo(lng: number, lat: number, zoom: number, pitch: number) {
  map.flyTo({ center: [lng, lat], zoom, pitch, bearing: -20, duration: 1200 })
}

// ---- 复位 ----
function resetView() {
  map.flyTo({ center: [116.397, 39.908], zoom: 5, pitch: 0, bearing: 0, duration: 800 })
}

// ---- 添加 3D 建筑图层 ----
function add3DBuildings() {
  if (map.getLayer('3d-buildings')) return

  map.addLayer({
    id: '3d-buildings',
    source: 'composite',
    'source-layer': 'building',
    filter: ['==', 'extrude', 'true'],
    type: 'fill-extrusion',
    minzoom: 12,
    paint: {
      'fill-extrusion-color': [
        'interpolate', ['linear'], ['get', 'height'],
        0,   '#1a1a3e',
        50,  '#2a2a5e',
        100, '#3a3a8e',
        200, '#42b883',
      ],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 12, 0, 12.5, ['get', 'height']],
      'fill-extrusion-base':   ['interpolate', ['linear'], ['zoom'], 12, 0, 12.5, ['get', 'min_height']],
      'fill-extrusion-opacity': 0.85,
    }
  })
}

// ---- 更新信息面板 ----
function updateInfo() {
  const center = map.getCenter()
  info.zoom    = map.getZoom().toFixed(2)
  info.pitch   = map.getPitch().toFixed(1)
  info.bearing = map.getBearing().toFixed(1)
  info.lng     = center.lng.toFixed(5)
  info.lat     = center.lat.toFixed(5)
}

// ---- 生命周期 ----
onMounted(() => {
  map = new mapboxgl.Map({
    container: mapEl.value!,
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [121.473, 31.230],
    zoom: 14,
    pitch: 50,
    bearing: -20,
    antialias: true,
    attributionControl: false,
  })

  map.addControl(new mapboxgl.NavigationControl(), 'top-left')
  map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left')

  map.on('load', () => {
    add3DBuildings()
    // 添加天空层
    map.addLayer({
      id: 'sky',
      type: 'sky',
      paint: {
        'sky-type': 'atmosphere',
        'sky-atmosphere-sun': [0, 0],
        'sky-atmosphere-sun-intensity': 15,
      }
    })
    updateInfo()
  })

  map.on('move', updateInfo)
})

onUnmounted(() => {
  map?.remove()
})
</script>

<style scoped>
.mb-3d-page {
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

.btn-icon:hover,
.btn-icon.active {
  background: rgba(66, 184, 131, 0.22);
  color: #42b883;
  border-color: #42b883;
}

.tip-text {
  margin-left: auto;
  color: #4a5a6a;
  font-size: 0.78rem;
  white-space: nowrap;
}

/* ---- 地图 ---- */
.map-body {
  flex: 1;
  min-height: 0;
}

/* ---- 信息面板 ---- */
.info-panel {
  position: absolute;
  top: 56px;
  right: 12px;
  width: 160px;
  background: rgba(16, 20, 40, 0.88);
  border: 1px solid rgba(66, 184, 131, 0.25);
  border-radius: 8px;
  padding: 10px 0 8px;
  z-index: 100;
  pointer-events: none;
}

.info-title {
  padding: 0 12px 8px;
  color: #42b883;
  font-size: 0.82rem;
  font-weight: 700;
  border-bottom: 1px solid rgba(66, 184, 131, 0.15);
  margin-bottom: 6px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 12px;
}

.info-label {
  color: #5a6a7a;
  font-size: 0.75rem;
}

.info-val {
  color: #42b883;
  font-size: 0.75rem;
  font-family: monospace;
}

/* Mapbox 控件覆盖 */
:global(.mapboxgl-ctrl-group) {
  background: rgba(16, 20, 40, 0.9) !important;
  border: 1px solid rgba(66, 184, 131, 0.3) !important;
}

:global(.mapboxgl-ctrl-scale) {
  background: rgba(16, 20, 40, 0.7) !important;
  border-color: #42b883 !important;
  color: #42b883 !important;
  font-size: 11px !important;
}
</style>
