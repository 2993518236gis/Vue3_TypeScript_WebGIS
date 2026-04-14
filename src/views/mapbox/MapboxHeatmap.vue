<template>
  <div class="heatmap-page">
    <!-- 工具栏 -->
    <div class="map-toolbar">
      <span class="toolbar-title">🔥 深圳学校热力图</span>
      <div class="toolbar-controls">
        <!-- 学校类型筛选 -->
        <div class="btn-group">
          <button :class="{ active: filter === 'all' }" @click="setFilter('all')">全部</button>
          <button :class="{ active: filter === 'primary' }" @click="setFilter('primary')">🏫 小学</button>
          <button :class="{ active: filter === 'middle' }" @click="setFilter('middle')">🏛️ 初中</button>
        </div>
        <!-- 可视化模式 -->
        <div class="btn-group">
          <button :class="{ active: vizMode === 'heatmap' }" @click="setVizMode('heatmap')">热力图</button>
          <button :class="{ active: vizMode === 'cluster' }" @click="setVizMode('cluster')">聚合点</button>
          <button :class="{ active: vizMode === 'scatter' }" @click="setVizMode('scatter')">散点图</button>
        </div>
        <!-- 热力半径 -->
        <div class="slider-group" v-if="vizMode === 'heatmap'">
          <span class="slider-label">半径</span>
          <input type="range" min="10" max="60" v-model.number="heatRadius" @input="updateHeatmap" />
          <span class="slider-val">{{ heatRadius }}px</span>
        </div>
        <!-- 热力强度 -->
        <div class="slider-group" v-if="vizMode === 'heatmap'">
          <span class="slider-label">强度</span>
          <input type="range" min="0.1" max="2" step="0.1" v-model.number="heatIntensity" @input="updateHeatmap" />
          <span class="slider-val">{{ heatIntensity.toFixed(1) }}</span>
        </div>
        <button class="btn-icon" @click="resetView">🔄 复位</button>
      </div>
      <span class="stat-text" v-if="!loadingData">
        📊 共 <b>{{ totalCount }}</b> 所学校（小学 {{ primaryCount }} · 初中 {{ middleCount }}）
      </span>
      <span class="stat-text" v-else>⏳ 正在加载学校数据...</span>
    </div>

    <!-- 地图容器 -->
    <div ref="mapEl" class="map-body"></div>

    <!-- 图例面板 -->
    <div class="legend-panel">
      <div class="legend-title">📋 图例</div>
      <div class="legend-row" v-if="vizMode === 'heatmap'">
        <div class="heatbar"></div>
        <div class="heatbar-labels">
          <span>低密度</span><span>高密度</span>
        </div>
      </div>
      <div class="legend-row" v-else>
        <span class="legend-dot primary"></span><span class="legend-text">小学</span>
        <span class="legend-dot middle"></span><span class="legend-text">初中</span>
      </div>

      <div class="legend-divider"></div>
      <div class="legend-title">📊 各区统计</div>
      <div class="district-stats">
        <div v-for="d in districtStats" :key="d.name" class="district-row">
          <span class="district-name">{{ d.name }}</span>
          <div class="district-bar-wrap">
            <div class="district-bar" :style="{ width: d.pct + '%' }"></div>
          </div>
          <span class="district-count">{{ d.count }}</span>
        </div>
      </div>
    </div>

    <!-- 弹出框占位，由 Mapbox Popup 控制 -->
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// ---- 类型 ----
interface School {
  name: string
  lng: number
  lat: number
  type: 'primary' | 'middle'
  district?: string
  address: string
  nature?: string
  category?: string
}

interface DistrictStat {
  name: string
  count: number
  pct: number
}

// ---- 响应式 ----
const mapEl = ref<HTMLDivElement>()
const filter = ref<'all' | 'primary' | 'middle'>('all')
const vizMode = ref<'heatmap' | 'cluster' | 'scatter'>('heatmap')
const heatRadius = ref(25)
const heatIntensity = ref(0.8)
const loadingData = ref(true)

const allSchools = ref<School[]>([])
const filteredSchools = computed(() => {
  if (filter.value === 'all') return allSchools.value
  return allSchools.value.filter(s => s.type === filter.value)
})
const totalCount = computed(() => allSchools.value.length)
const primaryCount = computed(() => allSchools.value.filter(s => s.type === 'primary').length)
const middleCount = computed(() => allSchools.value.filter(s => s.type === 'middle').length)

// ---- 各区统计 ----
const districtBounds: { name: string; lngMin: number; lngMax: number; latMin: number; latMax: number }[] = [
  { name: '福田', lngMin: 114.00, lngMax: 114.08, latMin: 22.50, latMax: 22.56 },
  { name: '南山', lngMin: 113.86, lngMax: 114.00, latMin: 22.48, latMax: 22.58 },
  { name: '罗湖', lngMin: 114.08, lngMax: 114.18, latMin: 22.53, latMax: 22.60 },
  { name: '宝安', lngMin: 113.81, lngMax: 113.93, latMin: 22.55, latMax: 22.75 },
  { name: '龙岗', lngMin: 114.15, lngMax: 114.38, latMin: 22.65, latMax: 22.78 },
  { name: '龙华', lngMin: 113.98, lngMax: 114.10, latMin: 22.60, latMax: 22.70 },
  { name: '光明', lngMin: 113.88, lngMax: 114.00, latMin: 22.70, latMax: 22.80 },
  { name: '坪山', lngMin: 114.30, lngMax: 114.42, latMin: 22.64, latMax: 22.74 },
  { name: '盐田', lngMin: 114.18, lngMax: 114.28, latMin: 22.53, latMax: 22.60 },
  { name: '大鹏', lngMin: 114.42, lngMax: 114.55, latMin: 22.50, latMax: 22.66 },
]

function getDistrict(s: School): string {
  // 优先使用 API 返回的 district 字段
  if (s.district) {
    // 统一简称
    const d = s.district.replace(/区$/, '')
    for (const b of districtBounds) {
      if (d.includes(b.name)) return b.name
    }
    return s.district.replace(/区$/, '')
  }
  // 回退：按坐标判断
  for (const d of districtBounds) {
    if (s.lng >= d.lngMin && s.lng <= d.lngMax && s.lat >= d.latMin && s.lat <= d.latMax) return d.name
  }
  return '其他'
}

const districtStats = computed<DistrictStat[]>(() => {
  const map = new Map<string, number>()
  filteredSchools.value.forEach(s => {
    const d = getDistrict(s)
    map.set(d, (map.get(d) || 0) + 1)
  })
  const arr = Array.from(map.entries())
    .map(([name, count]) => ({ name, count, pct: 0 }))
    .sort((a, b) => b.count - a.count)
  const max = arr.length > 0 ? arr[0].count : 1
  arr.forEach(d => { d.pct = (d.count / max) * 100 })
  return arr
})

let map: mapboxgl.Map
let popup: mapboxgl.Popup | null = null

// ---- GeoJSON 构建 ----
function buildGeoJSON(schools: School[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: schools.map(s => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
      properties: { name: s.name, type: s.type, address: s.address, district: s.district || '', nature: s.nature || '' },
    })),
  }
}

// ---- 数据加载 ----
async function loadSchools() {
  loadingData.value = true
  try {
    // 优先尝试加载本地静态 JSON（无需后端）
    let schools: School[] | null = null
    try {
      const localRes = await fetch(import.meta.env.BASE_URL + 'shenzhen-schools.json')
      if (localRes.ok) {
        const localData = await localRes.json() as School[]
        if (localData.length > 0) schools = localData
      }
    } catch { /* ignore, try backend */ }

    // 回退到后端 API
    if (!schools) {
      const res = await fetch('http://localhost:3002/api/schools')
      const data = await res.json() as { success: boolean; schools?: School[]; message?: string }
      if (data.success && data.schools) schools = data.schools
    }

    if (schools && schools.length > 0) {
      allSchools.value = schools
    } else {
      console.error('加载学校数据失败')
    }
  } catch (err) {
    console.error('无法加载学校数据:', err)
  } finally {
    loadingData.value = false
  }
}

// ---- 图层管理 ----
const LAYER_IDS = [
  'schools-heat', 'schools-heat-label',
  'clusters', 'cluster-count', 'unclustered-point',
  'scatter-primary', 'scatter-middle',
]
const SOURCE_IDS = ['schools', 'schools-cluster']

function removeLayers() {
  LAYER_IDS.forEach(id => { if (map.getLayer(id)) map.removeLayer(id) })
  SOURCE_IDS.forEach(id => { if (map.getSource(id)) map.removeSource(id) })
}

// ---- 热力图模式 ----
function addHeatmapLayer(schools: School[]) {
  const geojson = buildGeoJSON(schools)

  map.addSource('schools', { type: 'geojson', data: geojson })

  map.addLayer({
    id: 'schools-heat',
    type: 'heatmap',
    source: 'schools',
    paint: {
      // 热力权重
      'heatmap-weight': 1,
      // 热力强度（随缩放递增）
      'heatmap-intensity': [
        'interpolate', ['linear'], ['zoom'],
        8, heatIntensity.value * 0.5,
        13, heatIntensity.value * 1.5,
      ],
      // 热力颜色渐变
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0,    'rgba(0,0,0,0)',
        0.1,  'rgba(33,102,172,0.4)',
        0.3,  'rgb(103,169,207)',
        0.5,  'rgb(209,229,240)',
        0.7,  'rgb(253,219,119)',
        0.85, 'rgb(239,138,59)',
        1,    'rgb(178,24,43)',
      ],
      // 热力半径
      'heatmap-radius': [
        'interpolate', ['linear'], ['zoom'],
        8, heatRadius.value * 0.6,
        13, heatRadius.value,
        16, heatRadius.value * 1.5,
      ],
      // 高缩放时降低不透明度
      'heatmap-opacity': [
        'interpolate', ['linear'], ['zoom'],
        10, 0.9,
        16, 0.3,
      ],
    },
  })

  // 高缩放时显示文字标签
  map.addLayer({
    id: 'schools-heat-label',
    type: 'circle',
    source: 'schools',
    minzoom: 13,
    paint: {
      'circle-radius': 5,
      'circle-color': [
        'match', ['get', 'type'],
        'primary', '#42b883',
        'middle', '#5b9ef4',
        '#ccc',
      ],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#fff',
      'circle-opacity': [
        'interpolate', ['linear'], ['zoom'],
        13, 0,
        14, 1,
      ],
    },
  })
}

// ---- 聚合点模式 ----
function addClusterLayer(schools: School[]) {
  const geojson = buildGeoJSON(schools)

  map.addSource('schools-cluster', {
    type: 'geojson',
    data: geojson,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50,
  })

  // 聚合圆
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'schools-cluster',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step', ['get', 'point_count'],
        '#42b883', 5,
        '#f7c948', 15,
        '#f4845f', 30,
        '#e63946',
      ],
      'circle-radius': [
        'step', ['get', 'point_count'],
        15, 5, 20, 15, 28, 30, 36,
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
      'circle-opacity': 0.85,
    },
  })

  // 聚合数字
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'schools-cluster',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 13,
    },
    paint: { 'text-color': '#fff' },
  })

  // 未聚合的单点
  map.addLayer({
    id: 'unclustered-point',
    type: 'circle',
    source: 'schools-cluster',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 6,
      'circle-color': [
        'match', ['get', 'type'],
        'primary', '#42b883',
        'middle', '#5b9ef4',
        '#ccc',
      ],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#fff',
    },
  })

  // 聚合圆点击展开
  map.on('click', 'clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
    if (!features.length) return
    const clusterId = features[0].properties!.cluster_id
    const src = map.getSource('schools-cluster') as mapboxgl.GeoJSONSource
    src.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return
      map.easeTo({ center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom! })
    })
  })

  map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = '' })
}

// ---- 散点图模式 ----
function addScatterLayer(schools: School[]) {
  const geojson = buildGeoJSON(schools)

  map.addSource('schools', { type: 'geojson', data: geojson })

  // 小学
  map.addLayer({
    id: 'scatter-primary',
    type: 'circle',
    source: 'schools',
    filter: ['==', ['get', 'type'], 'primary'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 7],
      'circle-color': '#42b883',
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fff',
      'circle-opacity': 0.85,
    },
  })

  // 初中
  map.addLayer({
    id: 'scatter-middle',
    type: 'circle',
    source: 'schools',
    filter: ['==', ['get', 'type'], 'middle'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 7],
      'circle-color': '#5b9ef4',
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fff',
      'circle-opacity': 0.85,
    },
  })
}

// ---- 刷新可视化 ----
function refreshViz() {
  if (!map || !map.isStyleLoaded()) return
  removeLayers()
  const schools = filteredSchools.value
  if (schools.length === 0) return

  switch (vizMode.value) {
    case 'heatmap':  addHeatmapLayer(schools); break
    case 'cluster':  addClusterLayer(schools); break
    case 'scatter':  addScatterLayer(schools); break
  }

  // 所有模式都绑定点击弹窗
  bindPopupEvents()
}

// ---- 弹窗事件 ----
function bindPopupEvents() {
  const pointLayers = ['schools-heat-label', 'unclustered-point', 'scatter-primary', 'scatter-middle']
  pointLayers.forEach(layerId => {
    if (!map.getLayer(layerId)) return

    map.on('click', layerId, (e) => {
      if (!e.features?.length) return
      const props = e.features[0].properties!
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number]
      const typeLabel = props.type === 'primary' ? '🏫 小学' : '🏛️ 初中'

      popup?.remove()
      popup = new mapboxgl.Popup({ offset: 15, maxWidth: '280px' })
        .setLngLat(coords)
        .setHTML(`
          <div class="school-popup">
            <div class="school-popup-name">${props.name}</div>
            <div class="school-popup-type">${typeLabel}${props.nature ? ' · ' + props.nature : ''}${props.district ? ' · ' + props.district : ''}</div>
            <div class="school-popup-addr">${props.address}</div>
            <div class="school-popup-coord">${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}</div>
          </div>
        `)
        .addTo(map)
    })

    map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = '' })
  })
}

// ---- 工具栏操作 ----
function setFilter(v: typeof filter.value) {
  filter.value = v
}

function setVizMode(v: typeof vizMode.value) {
  vizMode.value = v
}

function updateHeatmap() {
  if (vizMode.value === 'heatmap') refreshViz()
}

function resetView() {
  map.flyTo({ center: [114.05, 22.55], zoom: 10, pitch: 0, bearing: 0, duration: 800 })
}

// ---- 监听筛选/模式变化 ----
watch([filter, vizMode], () => { refreshViz() })

// ---- 生命周期 ----
onMounted(async () => {
  map = new mapboxgl.Map({
    container: mapEl.value!,
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [114.05, 22.55],
    zoom: 10,
    attributionControl: false,
  })

  map.addControl(new mapboxgl.NavigationControl(), 'top-right')
  map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-right')

  map.on('load', async () => {
    await loadSchools()
    refreshViz()
  })
})

onUnmounted(() => {
  popup?.remove()
  map?.remove()
})
</script>

<style scoped>
.heatmap-page {
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
  white-space: nowrap;
}

.btn-group button:last-child { border-right: none; }

.btn-group button:hover,
.btn-group button.active {
  background: rgba(66, 184, 131, 0.22);
  color: #42b883;
}

.slider-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.slider-label {
  color: #5a6a7a;
  font-size: 0.78rem;
  white-space: nowrap;
}

.slider-group input[type="range"] {
  width: 70px;
  accent-color: #42b883;
  cursor: pointer;
}

.slider-val {
  color: #42b883;
  font-size: 0.78rem;
  font-family: monospace;
  min-width: 30px;
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
  background: rgba(66, 184, 131, 0.22);
  color: #42b883;
  border-color: #42b883;
}

.stat-text {
  margin-left: auto;
  color: #5a6a7a;
  font-size: 0.8rem;
  white-space: nowrap;
}

.stat-text b {
  color: #42b883;
}

/* ---- 地图 ---- */
.map-body {
  flex: 1;
  min-height: 0;
}

/* ---- 图例面板 ---- */
.legend-panel {
  position: absolute;
  bottom: 36px;
  left: 12px;
  width: 180px;
  background: rgba(16, 20, 40, 0.92);
  border: 1px solid rgba(66, 184, 131, 0.25);
  border-radius: 8px;
  padding: 10px 12px;
  z-index: 10;
  max-height: 360px;
  overflow-y: auto;
}

.legend-title {
  color: #42b883;
  font-size: 0.8rem;
  font-weight: 700;
  margin-bottom: 8px;
}

.legend-divider {
  height: 1px;
  background: rgba(66, 184, 131, 0.15);
  margin: 10px 0;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 热力条 */
.heatbar {
  width: 100%;
  height: 14px;
  border-radius: 3px;
  background: linear-gradient(
    90deg,
    rgba(33, 102, 172, 0.6),
    rgb(103, 169, 207),
    rgb(209, 229, 240),
    rgb(253, 219, 119),
    rgb(239, 138, 59),
    rgb(178, 24, 43)
  );
}

.heatbar-labels {
  display: flex;
  justify-content: space-between;
  width: 100%;
  color: #5a6a7a;
  font-size: 0.7rem;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-dot.primary { background: #42b883; }
.legend-dot.middle  { background: #5b9ef4; }

.legend-text {
  color: #8a9bb0;
  font-size: 0.78rem;
}

/* ---- 各区统计 ---- */
.district-stats {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.district-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.district-name {
  color: #8a9bb0;
  font-size: 0.72rem;
  width: 28px;
  flex-shrink: 0;
  text-align: right;
}

.district-bar-wrap {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  overflow: hidden;
}

.district-bar {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #42b883, #5b9ef4);
  transition: width 0.3s ease;
}

.district-count {
  color: #42b883;
  font-size: 0.72rem;
  font-family: monospace;
  min-width: 18px;
  text-align: right;
}

/* ---- Mapbox Popup ---- */
:global(.school-popup) {
  font-size: 0.82rem;
  line-height: 1.6;
}

:global(.school-popup-name) {
  color: #42b883;
  font-weight: 700;
  font-size: 0.88rem;
  margin-bottom: 2px;
}

:global(.school-popup-type) {
  color: #8a9bb0;
  font-size: 0.78rem;
}

:global(.school-popup-addr) {
  color: #cde;
  font-size: 0.78rem;
  margin-top: 4px;
}

:global(.school-popup-coord) {
  color: #4a5a6a;
  font-size: 0.72rem;
  font-family: monospace;
  margin-top: 2px;
}

:global(.mapboxgl-popup-content) {
  background: rgba(16, 20, 40, 0.95) !important;
  border: 1px solid rgba(66, 184, 131, 0.4) !important;
  border-radius: 8px !important;
  padding: 10px 14px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
}

:global(.mapboxgl-popup-tip) {
  border-top-color: rgba(66, 184, 131, 0.4) !important;
}

:global(.mapboxgl-popup-close-button) {
  color: #8a9bb0 !important;
}

:global(.mapboxgl-ctrl-group) {
  background: rgba(16, 20, 40, 0.9) !important;
  border: 1px solid rgba(66, 184, 131, 0.3) !important;
}

:global(.mapboxgl-ctrl-scale) {
  background: rgba(16, 20, 40, 0.7) !important;
  border-color: #42b883 !important;
  color: #42b883 !important;
}
</style>
