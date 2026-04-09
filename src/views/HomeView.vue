<template>
  <div class="home">
    <div id="cesiumContainer"></div>
    <div class="draw-panel" ref="panelRef" @mousedown="startDrag">
      <h3>绘制工具</h3>
      <div class="btn-group">
        <button @click="drawPoint">绘制点</button>
        <button @click="drawLine">绘制线</button>
        <button @click="drawPolygon">绘制面</button>
      </div>
      <div class="btn-group">
        <button @click="saveDrawing">保存</button>
        <button @click="clearDrawing">清除</button>
      </div>
      <h3 style="margin-top:12px">无人车</h3>
      <div class="btn-group">
        <button @click="startCar" :disabled="carRunning">启动</button>
        <button @click="pauseCar" :disabled="!carRunning">暂停</button>
        <button @click="resetCar">重置</button>
      </div>
      <div class="info-row">
        <span>速度：{{ carSpeed }} m/s</span>
        <input type="range" min="10" max="200" v-model.number="carSpeed" style="width:80px" />
      </div>
    </div>
    <ChatAssistant />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as Cesium from 'cesium'
import ChatAssistant from '@/components/ChatAssistant.vue'

let viewer: Cesium.Viewer
let handler: Cesium.ScreenSpaceEventHandler
const entities = ref<Cesium.Entity[]>([])
const panelRef = ref<HTMLElement>()

// ---- 拖拽 ----
let isDragging = false
let offsetX = 0
let offsetY = 0

const startDrag = (e: MouseEvent) => {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'BUTTON' || tag === 'INPUT') return
  isDragging = true
  offsetX = e.clientX - panelRef.value!.offsetLeft
  offsetY = e.clientY - panelRef.value!.offsetTop
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}
const onDrag = (e: MouseEvent) => {
  if (!isDragging) return
  panelRef.value!.style.left = e.clientX - offsetX + 'px'
  panelRef.value!.style.top = e.clientY - offsetY + 'px'
  panelRef.value!.style.right = 'auto'
}
const stopDrag = () => {
  isDragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// ---- 无人车 ----
const carRunning = ref(false)
const carSpeed = ref(50) // m/s

// 预设路径（北京某区域）
const routeCoords = [
  [116.391, 39.907],
  [116.395, 39.910],
  [116.400, 39.912],
  [116.406, 39.910],
  [116.410, 39.906],
  [116.408, 39.901],
  [116.402, 39.899],
  [116.396, 39.901],
  [116.391, 39.907],
]

interface Segment { start: Cesium.Cartesian3; end: Cesium.Cartesian3; length: number }
let segments: Segment[] = []
let totalLength = 0

let carEntity: Cesium.Entity | null = null
let trailEntity: Cesium.Entity | null = null
let routeEntity: Cesium.Entity | null = null
let animFrameId: number | null = null
let lastTime: number | null = null
let traveledDist = 0
const trailPositions: Cesium.Cartesian3[] = []

function buildSegments() {
  segments = []
  totalLength = 0
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const s = Cesium.Cartesian3.fromDegrees(routeCoords[i][0], routeCoords[i][1])
    const e = Cesium.Cartesian3.fromDegrees(routeCoords[i + 1][0], routeCoords[i + 1][1])
    const len = Cesium.Cartesian3.distance(s, e)
    segments.push({ start: s, end: e, length: len })
    totalLength += len
  }
}

function getPosAndHeading(dist: number): { pos: Cesium.Cartesian3; heading: number } {
  let d = Math.min(dist, totalLength)
  for (const seg of segments) {
    if (d <= seg.length) {
      const t = d / seg.length
      const pos = Cesium.Cartesian3.lerp(seg.start, seg.end, t, new Cesium.Cartesian3())
      const dir = Cesium.Cartesian3.subtract(seg.end, seg.start, new Cesium.Cartesian3())
      Cesium.Cartesian3.normalize(dir, dir)
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pos)
      const east = new Cesium.Cartesian3(enu[0], enu[1], enu[2])
      const north = new Cesium.Cartesian3(enu[4], enu[5], enu[6])
      const heading = Math.atan2(
        Cesium.Cartesian3.dot(dir, east),
        Cesium.Cartesian3.dot(dir, north)
      )
      return { pos, heading }
    }
    d -= seg.length
  }
  return { pos: segments[segments.length - 1].end, heading: 0 }
}

function initCarEntities() {
  const routePoints = routeCoords.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1]))

  routeEntity = viewer.entities.add({
    polyline: {
      positions: routePoints,
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.YELLOW.withAlpha(0.6),
        dashLength: 16
      })
    }
  })

  trailEntity = viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(
        () => trailPositions.length > 1 ? [...trailPositions] : [], false),
      width: 4,
      material: Cesium.Color.CYAN
    }
  })

  carEntity = viewer.entities.add({
    position: new Cesium.CallbackProperty(() => getPosAndHeading(traveledDist).pos, false) as any,
    orientation: new Cesium.CallbackProperty(() => {
      const { pos, heading } = getPosAndHeading(traveledDist)
      return Cesium.Transforms.headingPitchRollQuaternion(pos, new Cesium.HeadingPitchRoll(heading, 0, 0))
    }, false) as any,
    box: {
      dimensions: new Cesium.Cartesian3(4, 2, 1.5),
      material: Cesium.Color.ORANGERED,
      outline: true,
      outlineColor: Cesium.Color.WHITE
    },
    label: {
      text: '无人车',
      font: '14px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -20)
    }
  })

  trailPositions.length = 0
  trailPositions.push(Cesium.Cartesian3.fromDegrees(routeCoords[0][0], routeCoords[0][1]))
}

function animate(now: number) {
  if (lastTime !== null) {
    const dt = (now - lastTime) / 1000
    traveledDist += carSpeed.value * dt

    const { pos } = getPosAndHeading(traveledDist)
    const last = trailPositions[trailPositions.length - 1]
    if (!last || Cesium.Cartesian3.distance(pos, last) > 15) {
      trailPositions.push(pos.clone())
    }

    if (traveledDist >= totalLength) {
      trailPositions.push(segments[segments.length - 1].end.clone())
      carRunning.value = false
      lastTime = null
      animFrameId = null
      return
    }
  }
  lastTime = now
  animFrameId = requestAnimationFrame(animate)
}

const startCar = () => {
  if (!carEntity) {
    initCarEntities()
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(116.403, 39.892, 3000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-60), roll: 0 }
    })
  }
  carRunning.value = true
  lastTime = null
  if (animFrameId === null) animFrameId = requestAnimationFrame(animate)
}

const pauseCar = () => {
  carRunning.value = false
  lastTime = null  // 暂停时重置时间，恢复时不会跳帧
  if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null }
}

const resetCar = () => {
  pauseCar()
  traveledDist = 0
  trailPositions.length = 0
  if (carEntity) { viewer.entities.remove(carEntity); carEntity = null }
  if (trailEntity) { viewer.entities.remove(trailEntity); trailEntity = null }
  if (routeEntity) { viewer.entities.remove(routeEntity); routeEntity = null }
}

// ---- 绘制工具 ----
onMounted(() => {
  viewer = new Cesium.Viewer('cesiumContainer', {
    navigationHelpButton: false,
    creditContainer: document.createElement('div'),
    animation: false,
    timeline: false
  })
  handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  buildSegments()
})

onUnmounted(() => {
  if (animFrameId !== null) cancelAnimationFrame(animFrameId)
})

const drawPoint = () => {
  handler.setInputAction((click: any) => {
    const position = viewer.camera.pickEllipsoid(click.position)
    if (position) {
      const entity = viewer.entities.add({
        position,
        point: { pixelSize: 10, color: Cesium.Color.RED }
      })
      entities.value.push(entity)
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
}

const drawLine = () => {
  const positions: Cesium.Cartesian3[] = []
  const previewEntity = viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(() => positions.length > 1 ? positions : [], false),
      width: 3,
      material: Cesium.Color.BLUE
    }
  })

  handler.setInputAction((click: any) => {
    const position = viewer.camera.pickEllipsoid(click.position)
    if (position) positions.push(position.clone())
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  handler.setInputAction((move: any) => {
    if (positions.length < 1) return
    const position = viewer.camera.pickEllipsoid(move.endPosition)
    if (position) {
      const preview = [...positions, position]
      ;(previewEntity.polyline!.positions as any) = new Cesium.CallbackProperty(() => preview, false)
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  handler.setInputAction(() => {
    if (positions.length > 1) {
      viewer.entities.remove(previewEntity)
      entities.value.push(viewer.entities.add({
        polyline: { positions: [...positions], width: 3, material: Cesium.Color.BLUE }
      }))
    } else {
      viewer.entities.remove(previewEntity)
    }
    handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
    handler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE)
    handler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK)
    drawLine()
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
}

const drawPolygon = () => {
  const positions: Cesium.Cartesian3[] = []
  const previewEntity = viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.CallbackProperty(() =>
        positions.length > 2 ? new Cesium.PolygonHierarchy(positions) : new Cesium.PolygonHierarchy(), false),
      material: Cesium.Color.GREEN.withAlpha(0.5)
    },
    polyline: {
      positions: new Cesium.CallbackProperty(() =>
        positions.length > 1 ? [...positions, positions[0]] : [], false),
      width: 2,
      material: Cesium.Color.GREEN
    }
  })

  handler.setInputAction((click: any) => {
    const position = viewer.camera.pickEllipsoid(click.position)
    if (position) positions.push(position.clone())
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  handler.setInputAction((move: any) => {
    if (positions.length < 1) return
    const position = viewer.camera.pickEllipsoid(move.endPosition)
    if (position) {
      const preview = [...positions, position]
      ;(previewEntity.polygon!.hierarchy as any) = new Cesium.CallbackProperty(() =>
        preview.length > 2 ? new Cesium.PolygonHierarchy(preview) : new Cesium.PolygonHierarchy(), false)
      ;(previewEntity.polyline!.positions as any) = new Cesium.CallbackProperty(() =>
        preview.length > 1 ? [...preview, preview[0]] : [], false)
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  handler.setInputAction(() => {
    if (positions.length > 2) {
      viewer.entities.remove(previewEntity)
      entities.value.push(viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy([...positions]),
          material: Cesium.Color.GREEN.withAlpha(0.5)
        }
      }))
    } else {
      viewer.entities.remove(previewEntity)
    }
    handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
    handler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE)
    handler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK)
    drawPolygon()
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
}

const saveDrawing = () => {
  const data = entities.value.map(e => ({
    id: e.id,
    position: e.position,
    point: e.point,
    polyline: e.polyline,
    polygon: e.polygon
  }))
  localStorage.setItem('cesiumDrawing', JSON.stringify(data))
  alert('保存成功')
}

const clearDrawing = () => {
  entities.value.forEach(e => viewer.entities.remove(e))
  entities.value = []
}
</script>

<style scoped>
.home {
  width: 100%;
  height: 100vh;
  position: relative;
}

#cesiumContainer {
  width: 100%;
  height: 100%;
}

.draw-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(49, 44, 44, 0.85);
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  z-index: 1000;
  cursor: move;
  user-select: none;
  min-width: 180px;
}

.draw-panel h3 {
  color: #fff;
  margin: 0 0 10px;
  font-size: 15px;
}

.btn-group {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.btn-group button {
  padding: 5px 10px;
  border: 1px solid #555;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #fff;
  background: rgba(80, 70, 70, 0.8);
  transition: background 0.2s;
}

.btn-group button:hover:not(:disabled) {
  background: rgba(120, 110, 110, 0.9);
}

.btn-group button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ccc;
  font-size: 12px;
  margin-top: 4px;
}
</style>
