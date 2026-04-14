<template>
  <div class="mb-draw-page">
    <!-- 工具栏 -->
    <div class="draw-toolbar">
      <span class="toolbar-title">✏️ Mapbox 矢量绘制</span>
      <div class="tool-group">
        <button
          v-for="tool in tools"
          :key="tool.mode"
          :class="{ active: activeMode === tool.mode }"
          @click="selectTool(tool.mode)"
        >{{ tool.icon }} {{ tool.label }}</button>
        <button class="btn-danger" @click="clearAll">🗑️ 清空</button>
      </div>
      <span class="hint-text">{{ hintText }}</span>
      <span class="count-badge">已绘制 {{ featureCount }} 个要素</span>
    </div>

    <!-- 地图 -->
    <div ref="mapEl" class="map-body"></div>

    <!-- 右侧要素面板 -->
    <div class="feature-panel">
      <div class="panel-title">📋 要素列表</div>
      <div class="feature-list">
        <div
          v-for="(item, i) in featureList"
          :key="i"
          class="feature-item"
          @click="zoomToFeature(item)"
        >
          <span class="feature-icon">{{ item.icon }}</span>
          <span class="feature-name">{{ item.name }}</span>
        </div>
        <div v-if="featureList.length === 0" class="no-feature">暂无要素</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import type { Feature, GeoJsonProperties, Geometry, BBox } from 'geojson'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// ---- 工具定义 ----
type DrawMode = 'draw_point' | 'draw_line_string' | 'draw_polygon' | 'draw_circle'

const tools = [
  { mode: 'draw_point'       as DrawMode, label: '点',  icon: '📍' },
  { mode: 'draw_line_string' as DrawMode, label: '线',  icon: '〰️' },
  { mode: 'draw_polygon'     as DrawMode, label: '面',  icon: '⬡'  },
]

const hintMap: Record<DrawMode, string> = {
  draw_point:       '点击地图放置点要素',
  draw_line_string: '点击添加节点，双击结束绘线',
  draw_polygon:     '点击添加顶点，双击闭合多边形',
  draw_circle:      '暂不支持',
}

// ---- 响应式状态 ----
const mapEl = ref<HTMLDivElement>()
const activeMode = ref<DrawMode | null>(null)
const featureList = reactive<{ name: string; icon: string; bbox: BBox | null }[]>([])
const featureCount = computed(() => featureList.length)
const hintText = computed(() => activeMode.value ? hintMap[activeMode.value] : '请选择绘制工具')

let map: mapboxgl.Map
let draw: MapboxDraw
let featureCounter = 0

const modeIconMap: Record<DrawMode, string> = {
  draw_point:       '📍',
  draw_line_string: '〰️',
  draw_polygon:     '⬡',
  draw_circle:      '⭕',
}

const modeLabelMap: Record<DrawMode, string> = {
  draw_point:       '点',
  draw_line_string: '线',
  draw_polygon:     '面',
  draw_circle:      '圆',
}

// ---- 工具选择 ----
function selectTool(mode: DrawMode) {
  if (activeMode.value === mode) {
    activeMode.value = null
    draw.changeMode('simple_select')
    return
  }
  activeMode.value = mode
  draw.changeMode(mode as string)
}

// ---- 清空 ----
function clearAll() {
  draw.deleteAll()
  featureList.splice(0)
  featureCounter = 0
  activeMode.value = null
}

// ---- 缩放到要素 ----
function zoomToFeature(item: { bbox: BBox | null }) {
  if (!item.bbox) return
  const [minLng, minLat, maxLng, maxLat] = item.bbox
  map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
    padding: 60,
    duration: 600,
    maxZoom: 16
  })
}

// ---- 计算 BBox ----
function calcBBox(feature: Feature<Geometry, GeoJsonProperties>): BBox | null {
  const coords: [number, number][] = []
  function collect(arr: unknown): void {
    if (typeof arr[0] === 'number') {
      coords.push(arr as [number, number])
    } else {
      (arr as unknown[]).forEach(collect)
    }
  }
  const geom = feature.geometry
  if (geom.type === 'Point') {
    const [lng, lat] = geom.coordinates as [number, number]
    return [lng, lat, lng, lat]
  }
  collect((geom as { coordinates: unknown }).coordinates)
  if (!coords.length) return null
  const lngs = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
}

// ---- 生命周期 ----
onMounted(async () => {
  // 动态加载 mapbox-gl-draw
  const DrawModule = await import('@mapbox/mapbox-gl-draw')
  const DrawCtor = DrawModule.default ?? DrawModule

  map = new mapboxgl.Map({
    container: mapEl.value!,
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [116.397, 39.908],
    zoom: 5,
    attributionControl: false,
  })

  map.addControl(new mapboxgl.NavigationControl(), 'top-left')
  map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left')

  draw = new DrawCtor({
    displayControlsDefault: false,
    styles: [
      // 点
      {
        id: 'gl-draw-point',
        type: 'circle',
        filter: ['all', ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
        paint: {
          'circle-radius': 7,
          'circle-color': '#42b883',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff'
        }
      },
      // 线
      {
        id: 'gl-draw-line',
        type: 'line',
        filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#f7c948', 'line-width': 2.5 }
      },
      // 面填充
      {
        id: 'gl-draw-polygon-fill',
        type: 'fill',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        paint: { 'fill-color': '#5b9ef4', 'fill-opacity': 0.2 }
      },
      // 面描边
      {
        id: 'gl-draw-polygon-stroke',
        type: 'line',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#5b9ef4', 'line-width': 2.5 }
      },
      // 顶点
      {
        id: 'gl-draw-vertex',
        type: 'circle',
        filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
        paint: {
          'circle-radius': 5,
          'circle-color': '#fff',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#42b883'
        }
      },
    ]
  })

  map.addControl(draw as unknown as mapboxgl.IControl)

  // 绘制完成事件
  map.on('draw.create', (e: { features: Feature[] }) => {
    e.features.forEach(feature => {
      featureCounter++
      const mode = activeMode.value ?? 'draw_point'
      const icon = modeIconMap[mode]
      const label = modeLabelMap[mode]
      const name = `${icon} ${label}${featureCounter}`
      const bbox = calcBBox(feature)
      featureList.push({ name, icon, bbox })
    })
    // 绘完后保持当前工具
    if (activeMode.value) {
      draw.changeMode(activeMode.value as string)
    }
  })

  // 删除事件同步
  map.on('draw.delete', () => {
    // 与 draw 实际要素数同步
    const all = draw.getAll()
    if (all.features.length === 0) {
      featureList.splice(0)
      featureCounter = 0
    }
  })
})

onUnmounted(() => {
  map?.remove()
})
</script>

<style scoped>
.mb-draw-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f0f1a;
  position: relative;
  overflow: hidden;
}

/* ---- 工具栏 ---- */
.draw-toolbar {
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

.tool-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tool-group button {
  padding: 4px 12px;
  background: rgba(66, 184, 131, 0.07);
  color: #8a9bb0;
  border: 1px solid rgba(66, 184, 131, 0.25);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.82rem;
  transition: all 0.2s;
  white-space: nowrap;
}

.tool-group button:hover,
.tool-group button.active {
  background: rgba(66, 184, 131, 0.22);
  color: #42b883;
  border-color: #42b883;
}

.btn-danger {
  background: rgba(255, 107, 107, 0.07) !important;
  border-color: rgba(255, 107, 107, 0.3) !important;
  color: #ff6b6b !important;
}

.btn-danger:hover {
  background: rgba(255, 107, 107, 0.18) !important;
  border-color: #ff6b6b !important;
}

.hint-text {
  color: #5a6a7a;
  font-size: 0.8rem;
  margin-left: 4px;
  font-style: italic;
}

.count-badge {
  margin-left: auto;
  color: #42b883;
  font-size: 0.8rem;
  font-family: monospace;
  white-space: nowrap;
}

/* ---- 地图 + 面板 ---- */
.map-body {
  flex: 1;
  min-height: 0;
  margin-right: 200px;
}

/* ---- 右侧要素面板 ---- */
.feature-panel {
  position: absolute;
  top: 48px;
  right: 0;
  bottom: 0;
  width: 200px;
  background: rgba(16, 20, 40, 0.92);
  border-left: 1px solid rgba(66, 184, 131, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-title {
  padding: 10px 12px 8px;
  color: #42b883;
  font-size: 0.82rem;
  font-weight: 700;
  border-bottom: 1px solid rgba(66, 184, 131, 0.15);
  flex-shrink: 0;
}

.feature-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  cursor: pointer;
  font-size: 0.8rem;
  color: #8a9bb0;
  transition: background 0.15s, color 0.15s;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.feature-item:hover {
  background: rgba(66, 184, 131, 0.1);
  color: #fff;
}

.feature-icon { font-size: 1rem; flex-shrink: 0; }
.feature-name { word-break: break-all; line-height: 1.4; }

.no-feature {
  padding: 20px 12px;
  color: #3a4a5a;
  font-size: 0.78rem;
  text-align: center;
  font-style: italic;
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
