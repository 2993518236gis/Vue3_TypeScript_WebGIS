<template>
  <div class="ol-draw-page">
    <!-- 工具栏 -->
    <div class="draw-toolbar">
      <span class="toolbar-title">✏️ 矢量绘制</span>
      <div class="tool-group">
        <button
          v-for="tool in tools"
          :key="tool.type"
          :class="{ active: activeTool === tool.type }"
          @click="selectTool(tool.type)"
          :title="tool.label"
        >{{ tool.icon }} {{ tool.label }}</button>
        <button class="btn-danger" @click="clearAll">🗑️ 清空</button>
      </div>
      <span class="hint-text">{{ hintText }}</span>
      <span class="count-badge">已绘制 {{ featureCount }} 个要素</span>
    </div>

    <!-- 地图 -->
    <div ref="mapEl" class="map-body"></div>

    <!-- 右侧要素列表面板 -->
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
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import Draw from 'ol/interaction/Draw'
import Modify from 'ol/interaction/Modify'
import Snap from 'ol/interaction/Snap'
import Feature from 'ol/Feature'
import { fromLonLat, toLonLat } from 'ol/proj'
import { defaults as defaultControls, ScaleLine } from 'ol/control'
import { Style, Circle as CircleStyle, Fill, Stroke, Text } from 'ol/style'
import { getArea, getLength } from 'ol/sphere'
import type { Geometry } from 'ol/geom'
import 'ol/ol.css'

// ---- 工具定义 ----
type DrawType = 'Point' | 'LineString' | 'Polygon' | 'Circle'

const tools = [
  { type: 'Point'      as DrawType, label: '点',   icon: '📍' },
  { type: 'LineString' as DrawType, label: '线',   icon: '〰️' },
  { type: 'Polygon'    as DrawType, label: '面',   icon: '⬡'  },
  { type: 'Circle'     as DrawType, label: '圆',   icon: '⭕' },
]

const hintMap: Record<DrawType, string> = {
  Point:      '点击地图放置点要素',
  LineString:  '点击添加节点，双击结束绘线',
  Polygon:    '点击添加顶点，双击闭合多边形',
  Circle:     '点击圆心后拖动确定半径',
}

// ---- 响应式状态 ----
const mapEl = ref<HTMLDivElement>()
const activeTool = ref<DrawType | null>(null)
const featureList = reactive<{ name: string; icon: string; feature: Feature }[]>([])
const featureCount = computed(() => featureList.length)
const hintText = computed(() => activeTool.value ? hintMap[activeTool.value] : '请选择绘制工具')

// ---- OL 变量 ----
let map: Map
let drawSource: VectorSource
let vectorLayer: VectorLayer<VectorSource>
let drawInteraction: Draw | null = null
let modifyInteraction: Modify
let snapInteraction: Snap
let featureCounter = 0

// ---- 颜色配置（按类型） ----
const colorMap: Record<DrawType, string> = {
  Point:      '#42b883',
  LineString:  '#f7c948',
  Polygon:    '#5b9ef4',
  Circle:     '#f4845f',
}

function getStyle(type: DrawType, label: string): Style {
  const color = colorMap[type]
  if (type === 'Point') {
    return new Style({
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#fff', width: 2 })
      }),
      text: new Text({
        text: label,
        font: '12px sans-serif',
        fill: new Fill({ color: '#fff' }),
        stroke: new Stroke({ color: '#1a1a2e', width: 3 }),
        offsetY: -16
      })
    })
  }
  return new Style({
    fill: new Fill({ color: color + '33' }),
    stroke: new Stroke({ color, width: 2.5, lineDash: type === 'Circle' ? [6, 3] : undefined }),
    text: new Text({
      text: label,
      font: 'bold 12px sans-serif',
      fill: new Fill({ color: '#fff' }),
      stroke: new Stroke({ color: '#1a1a2e', width: 3 })
    })
  })
}

// ---- 工具切换 ----
function removeDrawInteraction() {
  if (drawInteraction) {
    map.removeInteraction(drawInteraction)
    drawInteraction = null
  }
}

function selectTool(type: DrawType) {
  if (activeTool.value === type) {
    // 再次点击取消
    activeTool.value = null
    removeDrawInteraction()
    return
  }
  activeTool.value = type
  removeDrawInteraction()

  drawInteraction = new Draw({
    source: drawSource,
    type: type === 'Circle' ? 'Circle' : type,
  })

  drawInteraction.on('drawend', (e) => {
    featureCounter++
    const typeLabel = tools.find(t => t.type === type)!
    const name = `${typeLabel.icon} ${typeLabel.label}${featureCounter}`
    const feature = e.feature as Feature<Geometry>
    feature.set('name', name)
    feature.set('drawType', type)
    feature.setStyle(getStyle(type, name))

    // 计算面积/长度
    const geom = feature.getGeometry()!
    let info = ''
    if (type === 'LineString') {
      const len = getLength(geom as any)
      info = len >= 1000 ? `${(len / 1000).toFixed(2)} km` : `${len.toFixed(0)} m`
    } else if (type === 'Polygon') {
      const area = getArea(geom as any)
      info = area >= 1e6 ? `${(area / 1e6).toFixed(2)} km²` : `${area.toFixed(0)} m²`
    }
    feature.set('info', info)

    featureList.push({ name: info ? `${name} (${info})` : name, icon: typeLabel.icon, feature })
  })

  map.addInteraction(drawInteraction)
  map.addInteraction(snapInteraction)
}

// ---- 清空 ----
function clearAll() {
  drawSource.clear()
  featureList.splice(0)
  featureCounter = 0
}

// ---- 缩放到要素 ----
function zoomToFeature(item: { feature: Feature }) {
  const extent = item.feature.getGeometry()?.getExtent()
  if (extent) {
    map.getView().fit(extent, { padding: [60, 60, 60, 60], duration: 600, maxZoom: 16 })
  }
}

// ---- 生命周期 ----
onMounted(() => {
  drawSource = new VectorSource()
  vectorLayer = new VectorLayer({ source: drawSource, zIndex: 10 })

  map = new Map({
    target: mapEl.value!,
    layers: [new TileLayer({ source: new OSM() }), vectorLayer],
    view: new View({
      center: fromLonLat([116.397, 39.908]),
      zoom: 6,
      minZoom: 3,
      maxZoom: 19
    }),
    controls: defaultControls({ zoom: true }).extend([new ScaleLine({ units: 'metric' })])
  })

  modifyInteraction = new Modify({ source: drawSource })
  snapInteraction   = new Snap({ source: drawSource })
  map.addInteraction(modifyInteraction)
})

onUnmounted(() => {
  map?.setTarget(undefined)
})
</script>

<style scoped>
.ol-draw-page {
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

/* ---- 地图 + 面板布局 ---- */
.map-body {
  flex: 1;
  min-height: 0;
  /* 给右侧面板留位置 */
  margin-right: 200px;
}

/* ---- 右侧要素面板 ---- */
.feature-panel {
  position: absolute;
  top: 48px;   /* 工具栏高度 */
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

.feature-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.feature-name {
  word-break: break-all;
  line-height: 1.4;
}

.no-feature {
  padding: 20px 12px;
  color: #3a4a5a;
  font-size: 0.78rem;
  text-align: center;
  font-style: italic;
}

/* OL 控件微调 */
:deep(.ol-zoom) {
  top: 10px;
  left: 10px;
}

:deep(.ol-scale-line) {
  bottom: 10px;
  left: 10px;
  background: rgba(16, 20, 40, 0.7);
  border-radius: 4px;
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
