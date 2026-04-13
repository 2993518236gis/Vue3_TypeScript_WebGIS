<template>
  <div class="cesium-draw-page">
    <div id="cesiumDrawContainer"></div>
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
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as Cesium from 'cesium'

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
const carSpeed = ref(50)

const routeCoords: [number, number][] = [
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

// 将路线坐标数组预处理成"线段数组"，方便后续按距离插值计算小车位置
function buildSegments() {
  segments = []
  totalLength = 0
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const s = Cesium.Cartesian3.fromDegrees(routeCoords[i][0], routeCoords[i][1])  // // 起点
    const e = Cesium.Cartesian3.fromDegrees(routeCoords[i + 1][0], routeCoords[i + 1][1])  // // 终点
    const len = Cesium.Cartesian3.distance(s, e)  // 该段长度（米）
    segments.push({ start: s, end: e, length: len })  
    totalLength += len  // 累加总长度
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
      const east  = new Cesium.Cartesian3(enu[0], enu[1], enu[2])
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
  const startPos = Cesium.Cartesian3.fromDegrees(routeCoords[0][0], routeCoords[0][1])
  const routePoints = routeCoords.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1]))

  // 规划路线虚线
  routeEntity = viewer.entities.add({
    polyline: {
      positions: routePoints,
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.YELLOW.withAlpha(0.9),
        dashLength: 16
      })
    }
  })

  // 实时轨迹（初始空）
  trailEntity = viewer.entities.add({
    polyline: {
      positions: [startPos.clone()],
      width: 4,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.3,
        color: Cesium.Color.CYAN
      })
    }
  })

  // 使用 glTF 模型替代 box
  carEntity = viewer.entities.add({
    position: startPos,
    orientation: Cesium.Transforms.headingPitchRollQuaternion(
      startPos, new Cesium.HeadingPitchRoll(-Math.PI / 2, 0, 0)) as any,
    model: {
      uri: '/models/CesiumMilkTruck/CesiumMilkTruck.glb',
      // uri: '/models/CesiumAir/Cesium_Air.glb',
      minimumPixelSize: 64,
      maximumScale: 200,
      silhouetteColor: Cesium.Color.WHITE,
      silhouetteSize: 1
    },
    label: {
      text: '🚗 无人车',
      font: 'bold 13px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -28),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000)
    }
  })

  trailPositions.length = 0
  trailPositions.push(startPos.clone())
}

// 直接在动画帧里更新实体位置 + 姿态 + 轨迹，相机不动
function updateCarEntities() {
  const { pos, heading } = getPosAndHeading(traveledDist)
  // CesiumMilkTruck 模型车头默认朝 X 轴（东），Cesium heading=0 朝北，需补偿 -90°
  const orientation = Cesium.Transforms.headingPitchRollQuaternion(
    pos, new Cesium.HeadingPitchRoll(heading - Math.PI / 2, 0, 0))

  if (carEntity) {
    (carEntity.position as Cesium.ConstantPositionProperty).setValue(pos)
    ;(carEntity.orientation as Cesium.ConstantProperty).setValue(orientation)
  }

  // 更新轨迹线
  const last = trailPositions[trailPositions.length - 1]
  if (!last || Cesium.Cartesian3.distance(pos, last) > 10) {
    trailPositions.push(pos.clone())
    if (trailEntity?.polyline) {
      (trailEntity.polyline.positions as Cesium.ConstantProperty).setValue([...trailPositions])
    }
  }
}

function animate(now: number) {
  if (lastTime !== null) {
    const dt = (now - lastTime) / 1000
    traveledDist += carSpeed.value * dt

    if (traveledDist >= totalLength) {
      traveledDist = totalLength
      updateCarEntities()
      trailPositions.push(segments[segments.length - 1].end.clone())
      if (trailEntity?.polyline) {
        (trailEntity.polyline.positions as Cesium.ConstantProperty).setValue([...trailPositions])
      }
      viewer.scene.requestRender()
      carRunning.value = false
      lastTime = null
      animFrameId = null
      return
    }

    updateCarEntities()
    viewer.scene.requestRender()
  }
  lastTime = now
  animFrameId = requestAnimationFrame(animate)
}

const startCar = () => {
  carRunning.value = true
  lastTime = null
  if (animFrameId === null) animFrameId = requestAnimationFrame(animate)
}

const pauseCar = () => {
  carRunning.value = false
  lastTime = null
  if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null }
}

const resetCar = () => {
  pauseCar()
  traveledDist = 0
  trailPositions.length = 0
  if (carEntity)    { viewer.entities.remove(carEntity);    carEntity = null }
  if (trailEntity)   { viewer.entities.remove(trailEntity);   trailEntity = null }
  if (routeEntity)   { viewer.entities.remove(routeEntity);   routeEntity = null }
  initCarEntities()
  locateInitCamera()
}

function locateInitCamera() {
  // 计算路线所有坐标的中心经纬度
  let lonSum = 0, latSum = 0
  for (const [lon, lat] of routeCoords) {
    lonSum += lon
    latSum += lat
  }
  const centerLon = lonSum / routeCoords.length
  const centerLat = latSum / routeCoords.length
  // 直接定位，不做飞行动画，相机固定俯视整个路线区域
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 2500),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-60),
      roll: 0
    }
  })
}

// ---- 绘制工具 ----
const drawPoint = () => {
  handler.setInputAction((click: any) => {
    const position = viewer.camera.pickEllipsoid(click.position)
    if (position) {
      entities.value.push(viewer.entities.add({
        position,
        point: { pixelSize: 10, color: Cesium.Color.RED }
      }))
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

onMounted(() => {
  viewer = new Cesium.Viewer('cesiumDrawContainer', {
    navigationHelpButton: false,
    creditContainer: document.createElement('div'),
    animation: false,
    timeline: false
  })

  // Cesium 版的鼠标事件监听器，用来在 3D 场景里处理点击、移动等交互
  handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)   // 给三维场景绑定鼠标 / 触摸事件监听器
  buildSegments()
  initCarEntities()

  // 视野定位到轨迹区域中心
  let lonSum = 0, latSum = 0
  for (const [lon, lat] of routeCoords) { lonSum += lon; latSum += lat }
  viewer.camera.setView({
    // destination: Cesium.Cartesian3.fromDegrees(lonSum / routeCoords.length, latSum / routeCoords.length, 2500),
    destination: Cesium.Cartesian3.fromDegrees(116.403, 39.892, 2500),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-60),
      roll: 0
    }
  })
})

onUnmounted(() => {
  if (animFrameId !== null) cancelAnimationFrame(animFrameId)
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  viewer?.destroy()
})
</script>

<style scoped>
.cesium-draw-page {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

#cesiumDrawContainer {
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
