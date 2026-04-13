<template>
  <div class="ol-map-page">
    <!-- 顶部工具栏 -->
    <div class="map-toolbar">
      <span class="toolbar-title">🗺️ OpenLayers 基础地图</span>
      <div class="toolbar-controls">
        <div class="btn-group">
          <button
            v-for="item in layerOptions"
            :key="item.key"
            :class="{ active: currentLayer === item.key }"
            @click="setLayer(item.key)"
          >{{ item.label }}</button>
        </div>
        <button class="btn-icon" @click="locateMe" title="浏览器定位">📍 定位</button>
        <button class="btn-icon" @click="flyToBeijing">🏙️ 北京</button>
        <button class="btn-icon" @click="flyToShanghai">🌆 上海</button>
        <button class="btn-icon" @click="toggleFullscreen">⛶ 全屏</button>
      </div>
      <span class="coord-display">{{ coordText }}</span>
    </div>

    <!-- 地图容器 -->
    <div ref="mapEl" class="map-body"></div>

    <!-- 信息浮窗（点击地物弹出） -->
    <div v-if="popup.visible" class="map-popup" :style="{ left: popup.x + 'px', top: popup.y + 'px' }">
      <div class="popup-close" @click="popup.visible = false">✕</div>
      <div class="popup-content">{{ popup.text }}</div>
    </div>

    <!-- 图层切换指示 -->
    <div class="layer-badge">{{ currentLayerLabel }}</div>

    <!-- 比例尺挂载点（OL 自动渲染） -->
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import XYZ from 'ol/source/XYZ'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { fromLonLat, toLonLat } from 'ol/proj'
import { defaults as defaultControls, ScaleLine, ZoomSlider, FullScreen, MousePosition } from 'ol/control'
import { createStringXY } from 'ol/coordinate'
import { Style, Icon, Circle as CircleStyle, Fill, Stroke, Text } from 'ol/style'
import 'ol/ol.css'

// ---- 响应式状态 ----
const mapEl = ref<HTMLDivElement>()
const coordText = ref('移动鼠标查看坐标')
const currentLayer = ref<'osm' | 'satellite' | 'terrain'>('osm')

const popup = reactive({ visible: false, x: 0, y: 0, text: '' })

// ---- 图层配置 ----
const layerOptions = [
  { key: 'osm'       as const, label: '街道图' },
  { key: 'satellite' as const, label: '卫星图' },
  { key: 'terrain'   as const, label: '地形图' },
]

const currentLayerLabel = computed(
  () => layerOptions.find(o => o.key === currentLayer.value)?.label ?? ''
)

// ---- 标志性城市地标 ----
const landmarks = [
  { lon: 116.3975, lat: 39.9087, name: '天安门广场', icon: '🏛️' },
  { lon: 121.4896, lat: 31.2397, name: '上海外滩',   icon: '🌆' },
  { lon: 113.9285, lat: 22.5324, name: '深圳市中心', icon: '🏙️' },
  { lon: 104.0665, lat: 30.5728, name: '成都天府广场', icon: '🐼' },
  { lon: 108.9480, lat: 34.2588, name: '西安钟楼',   icon: '🔔' },
  { lon: 120.1536, lat: 30.2874, name: '杭州西湖',   icon: '⛵' },
]

let map: Map
let osmLayer: TileLayer<OSM>
let satelliteLayer: TileLayer<XYZ>
let terrainLayer: TileLayer<XYZ>
let markerLayer: VectorLayer<VectorSource>

// ---- 图层切换 ----
function setLayer(type: typeof currentLayer.value) {
  currentLayer.value = type
  osmLayer.setVisible(type === 'osm')
  satelliteLayer.setVisible(type === 'satellite')
  terrainLayer.setVisible(type === 'terrain')
}

// ---- 定位 ----
function locateMe() {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition((pos) => {
    map.getView().animate({
      center: fromLonLat([pos.coords.longitude, pos.coords.latitude]),
      zoom: 13,
      duration: 900
    })
  })
}

function flyToBeijing() {
  map.getView().animate({ center: fromLonLat([116.397, 39.908]), zoom: 11, duration: 900 })
}

function flyToShanghai() {
  map.getView().animate({ center: fromLonLat([121.473, 31.230]), zoom: 11, duration: 900 })
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    mapEl.value?.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

// ---- 标记点样式 ----
function markerStyle(label: string) {
  return new Style({
    image: new CircleStyle({
      radius: 8,
      fill: new Fill({ color: 'rgba(66,184,131,0.85)' }),
      stroke: new Stroke({ color: '#fff', width: 2 })
    }),
    text: new Text({
      text: label,
      font: 'bold 12px sans-serif',
      fill: new Fill({ color: '#fff' }),
      stroke: new Stroke({ color: '#1a1a2e', width: 3 }),
      offsetY: -18
    })
  })
}

// ---- 生命周期 ----
onMounted(() => {
  osmLayer = new TileLayer({ source: new OSM(), visible: true })

  satelliteLayer = new TileLayer({
    source: new XYZ({
      url: 'https://mt{0-3}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    }),
    visible: false
  })

  terrainLayer = new TileLayer({
    source: new XYZ({
      url: 'https://mt{0-3}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    }),
    visible: false
  })

  // 地标矢量图层
  const features = landmarks.map(lm => {
    const f = new Feature({ geometry: new Point(fromLonLat([lm.lon, lm.lat])), name: lm.name })
    f.setStyle(markerStyle(lm.icon + ' ' + lm.name))
    return f
  })
  markerLayer = new VectorLayer({
    source: new VectorSource({ features }),
    zIndex: 10
  })

  map = new Map({
    target: mapEl.value!,
    layers: [osmLayer, satelliteLayer, terrainLayer, markerLayer],
    view: new View({
      center: fromLonLat([116.397, 39.908]),
      zoom: 5,
      minZoom: 3,
      maxZoom: 19
    }),
    controls: defaultControls({ zoom: true }).extend([
      new ScaleLine({ units: 'metric' }),
      new ZoomSlider(),
    ])
  })

  // 坐标显示
  map.on('pointermove', (e) => {
    const [lon, lat] = toLonLat(e.coordinate)
    coordText.value = `经度 ${lon.toFixed(5)}  纬度 ${lat.toFixed(5)}`
  })

  // 点击地标弹出信息
  map.on('click', (e) => {
    const pixel = map.getEventPixel(e.originalEvent)
    const feature = map.forEachFeatureAtPixel(pixel, f => f)
    if (feature) {
      const name = feature.get('name') as string
      const coords = map.getEventCoordinate(e.originalEvent)
      const [lon, lat] = toLonLat(coords)
      popup.text = `📍 ${name}\n经度：${lon.toFixed(4)}\n纬度：${lat.toFixed(4)}`
      popup.x = (e.originalEvent as MouseEvent).offsetX + 12
      popup.y = (e.originalEvent as MouseEvent).offsetY - 12
      popup.visible = true
    } else {
      popup.visible = false
    }
  })
})

onUnmounted(() => {
  map?.setTarget(undefined)
})
</script>

<style scoped>
.ol-map-page {
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

.btn-group button:last-child {
  border-right: none;
}

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
  pointer-events: auto;
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
  line-height: 1;
}

.popup-close:hover {
  color: #ff6b6b;
}

.popup-content {
  margin-top: 4px;
}

/* ---- 图层角标 ---- */
.layer-badge {
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

/* OL 控件样式微调 */
:deep(.ol-zoom) {
  top: 10px;
  left: 10px;
}

:deep(.ol-zoomslider) {
  top: 76px;
  left: 10px;
}

:deep(.ol-scale-line) {
  bottom: 10px;
  left: 60px;
  background: rgba(16, 20, 40, 0.7);
  border-radius: 4px;
  padding: 2px 6px;
}

:deep(.ol-scale-line-inner) {
  color: #42b883;
  border-color: #42b883;
  font-size: 11px;
}

:deep(.ol-attribution) {
  display: none;
}
</style>
