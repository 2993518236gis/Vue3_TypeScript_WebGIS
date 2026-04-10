<template>
  <div class="map-portal">
    <div class="map-header">
      <h2>地图门户</h2>
      <div class="map-controls">
        <button @click="setLayer('osm')" :class="{ active: currentLayer === 'osm' }">街道图</button>
        <button @click="setLayer('satellite')" :class="{ active: currentLayer === 'satellite' }">卫星图</button>
        <button @click="locateMe">定位</button>
        <span class="coord-display">{{ coordText }}</span>
      </div>
    </div>
    <div ref="mapEl" class="map-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import XYZ from 'ol/source/XYZ'
import { fromLonLat, toLonLat } from 'ol/proj'
import { defaults as defaultControls, ScaleLine, ZoomSlider } from 'ol/control'
import 'ol/ol.css'

const mapEl = ref<HTMLDivElement>()
const coordText = ref('移动鼠标查看坐标')
const currentLayer = ref<'osm' | 'satellite'>('osm')

let map: Map

const osmLayer = new TileLayer({ source: new OSM() })

const satelliteLayer = new TileLayer({
  source: new XYZ({
    url: 'https://mt{0-3}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  }),
  visible: false,
})

function setLayer(type: 'osm' | 'satellite') {
  currentLayer.value = type
  osmLayer.setVisible(type === 'osm')
  satelliteLayer.setVisible(type === 'satellite')
}

function locateMe() {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition((pos) => {
    const center = fromLonLat([pos.coords.longitude, pos.coords.latitude])
    map.getView().animate({ center, zoom: 14, duration: 800 })
  })
}

onMounted(() => {
  map = new Map({
    target: mapEl.value!,
    layers: [osmLayer, satelliteLayer],
    view: new View({
      center: fromLonLat([116.397, 39.908]), // 北京
      zoom: 10,
    }),
    controls: defaultControls().extend([new ScaleLine(), new ZoomSlider()]),
  })

  map.on('pointermove', (e) => {
    const [lon, lat] = toLonLat(e.coordinate)
    coordText.value = `${lon.toFixed(5)}, ${lat.toFixed(5)}`
  })
})

onUnmounted(() => {
  map?.setTarget(undefined)
})
</script>

<style scoped>
.map-portal {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f0f1a;
}

.map-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1rem;
  background: #1a1a2e;
  border-bottom: 1px solid rgba(66, 184, 131, 0.3);
  flex-shrink: 0;
}

.map-header h2 {
  margin: 0;
  color: #42b883;
  font-size: 1rem;
  font-weight: 600;
}

.map-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.map-controls button {
  padding: 4px 12px;
  background: rgba(66, 184, 131, 0.1);
  color: #8a9bb0;
  border: 1px solid rgba(66, 184, 131, 0.3);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.82rem;
  transition: all 0.2s;
}

.map-controls button:hover,
.map-controls button.active {
  background: rgba(66, 184, 131, 0.25);
  color: #42b883;
  border-color: #42b883;
}

.coord-display {
  margin-left: 0.5rem;
  color: #5a6a7a;
  font-size: 0.8rem;
  font-family: monospace;
  min-width: 180px;
}

.map-container {
  flex: 1;
}
</style>
