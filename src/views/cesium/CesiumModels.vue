<template>
  <div class="models-page">
    <div id="cesiumModelsContainer"></div>

    <!-- 控制面板 -->
    <div class="ctrl-panel" ref="panelRef" @mousedown="startDrag">
      <div class="panel-title">✈ 飞机轨迹</div>

      <div class="info-grid">
        <span class="info-label">状态</span>
        <span class="info-val" :class="running ? 'green' : 'gray'">{{ running ? '飞行中' : '已停止' }}</span>
        <span class="info-label">速度</span>
        <span class="info-val">{{ speed }} m/s</span>
        <span class="info-label">高度</span>
        <span class="info-val">{{ altitudeDisplay }} m</span>
        <span class="info-label">进度</span>
        <span class="info-val">{{ progressPct }}%</span>
      </div>

      <div class="slider-row">
        <span>速度</span>
        <input type="range" min="50" max="500" step="10" v-model.number="speed" />
        <span>{{ speed }}</span>
      </div>

      <div class="btn-row">
        <button @click="startFlight" :disabled="running">▶ 起飞</button>
        <button @click="pauseFlight" :disabled="!running">⏸ 暂停</button>
        <button @click="resetFlight">↺ 重置</button>
      </div>

      <div class="btn-row" style="margin-top:4px">
        <button @click="followPlane" :class="{ active: following }">跟随视角</button>
        <button @click="overviewCamera">全览</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import * as Cesium from 'cesium'

// ---- 响应式状态 ----
const running = ref(false)
const speed = ref(180)          // m/s
const altitudeDisplay = ref(0)
const progressPct = ref(0)
const following = ref(false)
const panelRef = ref<HTMLElement>()

// ---- Cesium 内部变量 ----
let viewer: Cesium.Viewer
let planeEntity: Cesium.Entity
let trailEntity: Cesium.Entity
let routeEntity: Cesium.Entity

let animId: number | null = null
let lastTs: number | null = null
let traveledDist = 0

// ---- 拖拽面板 ----
let dragging = false, ox = 0, oy = 0
const startDrag = (e: MouseEvent) => {
  if ((e.target as HTMLElement).tagName !== 'DIV' && (e.target as HTMLElement).tagName !== 'SPAN') return
  dragging = true
  ox = e.clientX - panelRef.value!.offsetLeft
  oy = e.clientY - panelRef.value!.offsetTop
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}
const onDrag = (e: MouseEvent) => {
  if (!dragging) return
  panelRef.value!.style.left = e.clientX - ox + 'px'
  panelRef.value!.style.top = e.clientY - oy + 'px'
  panelRef.value!.style.right = 'auto'
}
const stopDrag = () => {
  dragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// ---- 飞行路线：北京 → 上海（多航路点，含高度变化模拟爬升巡航下降） ----
const waypoints: [number, number, number][] = [
  // [lon, lat, alt(m)]
  [116.39,  39.91,   500],   // 北京起飞
  [116.80,  39.50,  6000],   // 爬升
  [117.20,  38.80,  9500],   // 巡航
  [118.50,  36.50, 10500],   // 巡航
  [119.80,  34.00, 10500],   // 巡航
  [120.50,  32.00,  8000],   // 下降
  [121.30,  31.20,  2000],   // 进近
  [121.80,  31.15,   200],   // 上海降落
]

interface Seg {
  start: Cesium.Cartesian3
  end: Cesium.Cartesian3
  length: number
  startAlt: number
  endAlt: number
}

let segs: Seg[] = []
let totalLen = 0

function buildSegs() {
  segs = []
  totalLen = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [lon0, lat0, alt0] = waypoints[i]
    const [lon1, lat1, alt1] = waypoints[i + 1]
    const s = Cesium.Cartesian3.fromDegrees(lon0, lat0, alt0)
    const e = Cesium.Cartesian3.fromDegrees(lon1, lat1, alt1)
    const len = Cesium.Cartesian3.distance(s, e)
    segs.push({ start: s, end: e, length: len, startAlt: alt0, endAlt: alt1 })
    totalLen += len
  }
}

// 返回当前位置 + 航向（用于朝向旋转）
function getPosAndHpr(dist: number): { pos: Cesium.Cartesian3; hpr: Cesium.HeadingPitchRoll } {
  let d = Math.min(dist, totalLen)
  for (const seg of segs) {
    if (d <= seg.length) {
      const t = d / seg.length
      const pos = Cesium.Cartesian3.lerp(seg.start, seg.end, t, new Cesium.Cartesian3())

      // 航向角
      const dir = Cesium.Cartesian3.subtract(seg.end, seg.start, new Cesium.Cartesian3())
      Cesium.Cartesian3.normalize(dir, dir)
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pos)
      const east  = new Cesium.Cartesian3(enu[0], enu[1], enu[2])
      const north = new Cesium.Cartesian3(enu[4], enu[5], enu[6])
      const up    = new Cesium.Cartesian3(enu[8], enu[9], enu[10])
      const heading = Math.atan2(
        Cesium.Cartesian3.dot(dir, east),
        Cesium.Cartesian3.dot(dir, north)
      )
      // 俯仰角（爬升/下降时倾斜）
      const pitch = Math.asin(Math.max(-1, Math.min(1, Cesium.Cartesian3.dot(dir, up))))

      // 实时高度
      const carto = Cesium.Cartographic.fromCartesian(pos)
      altitudeDisplay.value = Math.round(carto.height)

      // Cesium_Air.glb 模型头部朝 +Y（北），headingPitchRollQuaternion 以 +X（东）为前向
      // 补偿 -90° 使机头始终指向运动方向
      const headingFixed = heading - Cesium.Math.toRadians(90)
      return { pos, hpr: new Cesium.HeadingPitchRoll(headingFixed, pitch, 0) }
    }
    d -= seg.length
  }
  const last = segs[segs.length - 1]
  return { pos: last.end, hpr: new Cesium.HeadingPitchRoll(0, 0, 0) }
}

// ---- 实体初始化 ----
const trailPositions: Cesium.Cartesian3[] = []

function initEntities() {
  // 规划航线（虚线）
  const routePts = waypoints.map(([lon, lat, alt]) => Cesium.Cartesian3.fromDegrees(lon, lat, alt))
  routeEntity = viewer.entities.add({
    polyline: {
      positions: routePts,
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.CYAN.withAlpha(0.5),
        dashLength: 20
      }),
      clampToGround: false
    }
  })

  // 飞行轨迹（实时）
  trailEntity = viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(
        () => trailPositions.length > 1 ? [...trailPositions] : [], false),
      width: 3,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.2,
        color: Cesium.Color.YELLOW
      }),
      clampToGround: false
    }
  })

  // 飞机实体（加载 Cesium_Air.glb 3D 模型）
  planeEntity = viewer.entities.add({
    position: new Cesium.CallbackProperty(
      () => getPosAndHpr(traveledDist).pos, false) as any,
    orientation: new Cesium.CallbackProperty(() => {
      const { pos, hpr } = getPosAndHpr(traveledDist)
      return Cesium.Transforms.headingPitchRollQuaternion(pos, hpr)
    }, false) as any,
    // 加载 GLB 飞机模型
    model: {
      uri: '/models/CesiumAir/Cesium_Air.glb',
      minimumPixelSize: 64,          // 最小屏幕像素，保证远处也可见
      maximumScale: 20000,           // 最大缩放上限
      scale: 3.0,                    // 模型缩放倍数
      silhouetteColor: Cesium.Color.WHITE,
      silhouetteSize: 1.0,
      colorBlendMode: Cesium.ColorBlendMode.MIX,
      colorBlendAmount: 0.3
    },
    label: {
      text: '✈ CA1234',
      font: 'bold 14px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -30),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2_000_000)
    }
  })

  trailPositions.length = 0
  const [lon0, lat0, alt0] = waypoints[0]
  trailPositions.push(Cesium.Cartesian3.fromDegrees(lon0, lat0, alt0))
}

// ---- 动画循环 ----
function animate(now: number) {
  if (lastTs !== null) {
    const dt = (now - lastTs) / 1000
    traveledDist += speed.value * dt

    const { pos } = getPosAndHpr(traveledDist)
    const last = trailPositions[trailPositions.length - 1]
    if (!last || Cesium.Cartesian3.distance(pos, last) > 500) {
      trailPositions.push(pos.clone())
    }

    progressPct.value = Math.min(100, Math.round((traveledDist / totalLen) * 100))

    // 跟随视角
    if (following.value) {
      const { pos: fp, hpr } = getPosAndHpr(traveledDist)
      viewer.camera.lookAt(
        fp,
        new Cesium.HeadingPitchRange(hpr.heading, Cesium.Math.toRadians(-20), 200_000)
      )
    }

    if (traveledDist >= totalLen) {
      trailPositions.push(segs[segs.length - 1].end.clone())
      progressPct.value = 100
      running.value = false
      lastTs = null
      animId = null
      return
    }
  }
  lastTs = now
  animId = requestAnimationFrame(animate)
}

// ---- 控制函数 ----
const startFlight = () => {
  if (!planeEntity) {
    initEntities()
    overviewCamera()
  }
  running.value = true
  lastTs = null
  if (animId === null) animId = requestAnimationFrame(animate)
}

const pauseFlight = () => {
  running.value = false
  lastTs = null
  if (animId !== null) { cancelAnimationFrame(animId); animId = null }
}

const resetFlight = () => {
  pauseFlight()
  traveledDist = 0
  progressPct.value = 0
  altitudeDisplay.value = 0
  trailPositions.length = 0
  following.value = false
  viewer?.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
  if (planeEntity) { viewer.entities.remove(planeEntity); (planeEntity as any) = null }
  if (trailEntity) { viewer.entities.remove(trailEntity); (trailEntity as any) = null }
  if (routeEntity) { viewer.entities.remove(routeEntity); (routeEntity as any) = null }
}

const followPlane = () => {
  following.value = !following.value
  if (!following.value) {
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
  }
}

const overviewCamera = () => {
  following.value = false
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(120.0, 19.5, 2_000_000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-50), roll: 0 },
    duration: 1.5
  })
}

// ---- 生命周期 ----
onMounted(() => {
  viewer = new Cesium.Viewer('cesiumModelsContainer', {
    navigationHelpButton: false,
    creditContainer: document.createElement('div'),
    animation: false,
    timeline: false  
  })
  buildSegs()
  // overviewCamera()
})

onUnmounted(() => {
  if (animId !== null) cancelAnimationFrame(animId)
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  viewer?.destroy()
})
</script>

<style scoped>
.models-page {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

#cesiumModelsContainer {
  width: 100%;
  height: 100%;
}

.ctrl-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(16, 20, 40, 0.88);
  border: 1px solid rgba(66, 184, 131, 0.35);
  border-radius: 10px;
  padding: 14px 16px;
  z-index: 1000;
  cursor: move;
  user-select: none;
  min-width: 200px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}

.panel-title {
  color: #42b883;
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
  letter-spacing: 0.04em;
}

.info-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 10px;
  margin-bottom: 12px;
}

.info-label {
  color: #8a9bb0;
  font-size: 12px;
}

.info-val {
  color: #fff;
  font-size: 12px;
  font-family: monospace;
}

.info-val.green { color: #42b883; }
.info-val.gray  { color: #8a9bb0; }

.slider-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8a9bb0;
  font-size: 12px;
  margin-bottom: 10px;
}

.slider-row input {
  flex: 1;
}

.btn-row {
  display: flex;
  gap: 6px;
}

.btn-row button {
  flex: 1;
  padding: 5px 0;
  border: 1px solid rgba(66, 184, 131, 0.3);
  border-radius: 5px;
  background: rgba(66, 184, 131, 0.08);
  color: #cde;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-row button:hover:not(:disabled) {
  background: rgba(66, 184, 131, 0.22);
  color: #fff;
}

.btn-row button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-row button.active {
  background: rgba(66, 184, 131, 0.3);
  border-color: #42b883;
  color: #42b883;
}
</style>
