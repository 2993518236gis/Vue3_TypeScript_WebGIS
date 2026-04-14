<template>
  <div class="poi-page">
    <!-- 左侧聊天面板 -->
    <div class="chat-side">
      <div class="chat-header">
        <span class="chat-title">🤖 AI 地点搜索</span>
        <span class="chat-hint">基于 Mapbox MCP 的智能 POI 查询</span>
      </div>

      <!-- 对话列表 -->
      <div class="chat-messages" ref="messagesRef">
        <!-- 欢迎消息 -->
        <div class="msg assistant" v-if="messages.length === 0">
          <div class="msg-content">
            👋 你好！我可以帮你搜索地点附近的 POI。<br/><br/>
            试试问我：<br/>
            <span class="example" @click="fillExample('深圳盛港国际科技园附近有什么咖啡店？')">☕ 深圳盛港国际科技园附近有什么咖啡店？</span><br/>
            <span class="example" @click="fillExample('北京王府井附近的餐厅')">🍜 北京王府井附近的餐厅</span><br/>
            <span class="example" @click="fillExample('上海外滩附近有药店吗')">💊 上海外滩附近有药店吗</span>
          </div>
        </div>

        <div v-for="(msg, i) in messages" :key="i" :class="['msg', msg.role]">
          <div class="msg-content" v-html="msg.html || msg.content"></div>
        </div>

        <div v-if="loading" class="msg assistant">
          <div class="msg-content">
            <div class="loading-dots">
              <span class="step-text">{{ loadingStep }}</span>
              <span class="dots">···</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入框 -->
      <div class="chat-input">
        <textarea
          v-model="input"
          placeholder="输入问题，如：深圳盛港国际科技园附近有什么咖啡店？"
          @keydown.enter.exact.prevent="send"
          rows="2"
          :disabled="loading"
        />
        <button @click="send" :disabled="loading || !input.trim()">
          {{ loading ? '搜索中' : '发送' }}
        </button>
      </div>
    </div>

    <!-- 右侧地图 -->
    <div class="map-side">
      <div ref="mapEl" class="map-container"></div>
      <!-- POI 数量 badge -->
      <div v-if="poiCount > 0" class="poi-badge">
        📍 {{ poiCount }} 个结果
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, onUnmounted } from 'vue'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// ---- 类型 ----
interface POI {
  name: string
  address: string
  lng: number
  lat: number
  category: string
  distance?: number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  html?: string
}

// ---- 响应式状态 ----
const mapEl = ref<HTMLDivElement>()
const messagesRef = ref<HTMLDivElement>()
const input = ref('')
const loading = ref(false)
const loadingStep = ref('')
const messages = ref<ChatMessage[]>([])
const poiCount = ref(0)

let map: mapboxgl.Map
const markerInstances: mapboxgl.Marker[] = []
let centerMarker: mapboxgl.Marker | null = null

// ---- 滚动到底部 ----
async function scrollToBottom() {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

// ---- 填入示例 ----
function fillExample(text: string) {
  input.value = text
}

// ---- 清除地图标记 ----
function clearMarkers() {
  markerInstances.forEach(m => m.remove())
  markerInstances.length = 0
  centerMarker?.remove()
  centerMarker = null
  poiCount.value = 0
}

// ---- 在地图上显示 POI ----
function showPOIsOnMap(center: { lng: number; lat: number }, pois: POI[]) {
  clearMarkers()

  // 中心标记 — 红色大标记
  const centerEl = document.createElement('div')
  centerEl.className = 'center-marker'
  centerEl.innerHTML = '📍'
  centerMarker = new mapboxgl.Marker({ element: centerEl })
    .setLngLat([center.lng, center.lat])
    .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
      `<div class="poi-popup"><b>📍 搜索中心</b><br/>${center.lng.toFixed(5)}, ${center.lat.toFixed(5)}</div>`
    ))
    .addTo(map)

  // POI 标记 — 绿色圆点 + 编号
  const bounds = new mapboxgl.LngLatBounds()
  bounds.extend([center.lng, center.lat])

  pois.forEach((poi, i) => {
    const el = document.createElement('div')
    el.className = 'poi-marker'
    el.textContent = String(i + 1)
    el.title = poi.name

    const dist = poi.distance != null
      ? poi.distance >= 1000
        ? `${(poi.distance / 1000).toFixed(1)}km`
        : `${poi.distance}m`
      : ''

    const popup = new mapboxgl.Popup({ offset: 18, maxWidth: '260px' }).setHTML(
      `<div class="poi-popup">
        <b>${i + 1}. ${poi.name}</b>
        ${dist ? `<br/><span class="poi-dist">📏 ${dist}</span>` : ''}
        <br/><span class="poi-addr">${poi.address}</span>
      </div>`
    )

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([poi.lng, poi.lat])
      .setPopup(popup)
      .addTo(map)

    markerInstances.push(marker)
    bounds.extend([poi.lng, poi.lat])
  })

  poiCount.value = pois.length

  // 适配视角
  map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 800 })
}

// ---- 发送搜索 ----
async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return

  messages.value.push({ role: 'user', content: text })
  input.value = ''
  loading.value = true
  loadingStep.value = '🧠 AI 正在理解你的问题'
  await scrollToBottom()

  try {
    loadingStep.value = '🔍 正在搜索 POI'

    const res = await fetch('http://localhost:3002/api/poi-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text }),
    })

    const data = await res.json() as {
      success: boolean
      message?: string
      intent?: { location: string; poiType: string; poiKeyword: string }
      center?: { lng: number; lat: number; placeName: string }
      pois?: POI[]
      reply?: string
    }

    if (!data.success) {
      messages.value.push({
        role: 'assistant',
        content: `❌ ${data.message || '搜索失败'}`,
      })
      await scrollToBottom()
      return
    }

    // 构建带格式的 HTML 回复
    let html = `<div class="result-block">`
    html += `<div class="result-location">📍 已定位「${data.intent!.location}」</div>`

    if (data.pois && data.pois.length > 0) {
      html += `<div class="result-count">找到 <b>${data.pois.length}</b> 个「${data.intent!.poiType}」</div>`
      html += `<div class="result-list">`
      data.pois.forEach((p, i) => {
        const dist = p.distance != null
          ? p.distance >= 1000
            ? `${(p.distance / 1000).toFixed(1)}km`
            : `${p.distance}m`
          : ''
        html += `<div class="result-item" data-idx="${i}">
          <span class="item-num">${i + 1}</span>
          <div class="item-info">
            <div class="item-name">${p.name}${dist ? ` <span class="item-dist">${dist}</span>` : ''}</div>
            <div class="item-addr">${p.address}</div>
          </div>
        </div>`
      })
      html += `</div>`
    } else {
      html += `<div class="result-empty">😕 附近未找到「${data.intent!.poiType}」相关地点</div>`
    }
    html += `</div>`

    messages.value.push({ role: 'assistant', content: data.reply || '', html })

    // 在地图上显示
    if (data.center && data.pois) {
      showPOIsOnMap(data.center, data.pois)
    }
  } catch (err) {
    messages.value.push({
      role: 'assistant',
      content: '❌ 无法连接到 MCP 代理服务，请确认 server 已启动（端口 3002）',
    })
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

// ---- 生命周期 ----
onMounted(() => {
  map = new mapboxgl.Map({
    container: mapEl.value!,
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [114.05, 22.55], // 深圳
    zoom: 10,
    attributionControl: false,
  })
  map.addControl(new mapboxgl.NavigationControl(), 'top-right')
  map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-right')
})

onUnmounted(() => {
  clearMarkers()
  map?.remove()
})
</script>

<style scoped>
.poi-page {
  display: flex;
  height: 100%;
  background: #0f0f1a;
  overflow: hidden;
}

/* ========== 左侧聊天 ========== */
.chat-side {
  width: 380px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #12122a;
  border-right: 1px solid rgba(66, 184, 131, 0.2);
}

.chat-header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(66, 184, 131, 0.15);
  flex-shrink: 0;
}

.chat-title {
  display: block;
  color: #42b883;
  font-size: 1rem;
  font-weight: 700;
}

.chat-hint {
  display: block;
  margin-top: 4px;
  color: #4a5a6a;
  font-size: 0.75rem;
}

/* ---- 消息列表 ---- */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.msg {
  max-width: 92%;
  border-radius: 10px;
  line-height: 1.6;
  word-break: break-word;
}

.msg.user {
  align-self: flex-end;
  background: rgba(66, 184, 131, 0.65);
  padding: 8px 12px;
  color: #fff;
  font-size: 0.88rem;
}

.msg.assistant {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.07);
  padding: 10px 14px;
  color: #cde;
  font-size: 0.85rem;
}

.msg-content {
  white-space: pre-wrap;
}

/* 示例点击 */
.example {
  color: #42b883;
  cursor: pointer;
  display: inline-block;
  margin: 2px 0;
  transition: color 0.15s;
}

.example:hover {
  color: #5bd9a2;
  text-decoration: underline;
}

/* ---- 加载动画 ---- */
.loading-dots {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-text {
  color: #8a9bb0;
  font-size: 0.82rem;
}

.dots {
  animation: blink 1.2s infinite;
  font-size: 1.2rem;
  color: #42b883;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}

/* ---- 结果块样式 ---- */
:deep(.result-block) {
  font-size: 0.84rem;
}

:deep(.result-location) {
  color: #42b883;
  font-weight: 600;
  margin-bottom: 6px;
}

:deep(.result-count) {
  color: #8a9bb0;
  margin-bottom: 8px;
}

:deep(.result-list) {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

:deep(.result-item) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(66, 184, 131, 0.06);
  border-radius: 6px;
  border: 1px solid rgba(66, 184, 131, 0.1);
  transition: background 0.15s;
}

:deep(.result-item:hover) {
  background: rgba(66, 184, 131, 0.12);
}

:deep(.item-num) {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #42b883;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

:deep(.item-info) {
  flex: 1;
  min-width: 0;
}

:deep(.item-name) {
  color: #dde;
  font-weight: 600;
  font-size: 0.83rem;
}

:deep(.item-dist) {
  color: #42b883;
  font-size: 0.75rem;
  font-weight: 400;
}

:deep(.item-addr) {
  color: #5a6a7a;
  font-size: 0.74rem;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.result-empty) {
  color: #5a6a7a;
  font-style: italic;
  padding: 8px 0;
}

/* ---- 输入框 ---- */
.chat-input {
  display: flex;
  gap: 8px;
  padding: 10px 12px 14px;
  border-top: 1px solid rgba(66, 184, 131, 0.15);
  flex-shrink: 0;
}

.chat-input textarea {
  flex: 1;
  resize: none;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(66, 184, 131, 0.25);
  border-radius: 8px;
  color: #fff;
  padding: 8px 10px;
  font-size: 0.88rem;
  outline: none;
  cursor: text;
  transition: border-color 0.2s;
}

.chat-input textarea:focus {
  border-color: #42b883;
}

.chat-input textarea::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.chat-input button {
  padding: 0 18px;
  background: #42b883;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.chat-input button:hover:not(:disabled) {
  background: #33a06f;
}

.chat-input button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ========== 右侧地图 ========== */
.map-side {
  flex: 1;
  position: relative;
  min-width: 0;
}

.map-container {
  width: 100%;
  height: 100%;
}

.poi-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(16, 20, 40, 0.85);
  border: 1px solid rgba(66, 184, 131, 0.4);
  border-radius: 6px;
  padding: 5px 12px;
  color: #42b883;
  font-size: 0.82rem;
  font-weight: 600;
  pointer-events: none;
  z-index: 10;
}

/* ========== 地图标记样式 ========== */
:global(.center-marker) {
  font-size: 2rem;
  filter: drop-shadow(0 2px 6px rgba(255, 0, 0, 0.5));
  animation: bounce 0.6s ease-out;
  line-height: 1;
}

:global(.poi-marker) {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #42b883;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  transition: transform 0.15s;
}

:global(.poi-marker:hover) {
  transform: scale(1.3);
}

@keyframes bounce {
  0%   { transform: translateY(-20px); opacity: 0; }
  60%  { transform: translateY(4px); }
  100% { transform: translateY(0); opacity: 1; }
}

/* Mapbox Popup 样式 */
:global(.poi-popup) {
  font-size: 0.82rem;
  line-height: 1.6;
  color: #cde;
}

:global(.poi-popup b) {
  color: #42b883;
}

:global(.poi-dist) {
  color: #42b883;
  font-size: 0.78rem;
}

:global(.poi-addr) {
  color: #8a9bb0;
  font-size: 0.76rem;
}

:global(.mapboxgl-popup-content) {
  background: rgba(16, 20, 40, 0.95) !important;
  border: 1px solid rgba(66, 184, 131, 0.4) !important;
  border-radius: 8px !important;
  color: #cde !important;
  padding: 10px 14px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
}

:global(.mapboxgl-popup-tip) {
  border-top-color: rgba(66, 184, 131, 0.4) !important;
}

:global(.mapboxgl-popup-close-button) {
  color: #8a9bb0 !important;
  font-size: 1.1rem !important;
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
