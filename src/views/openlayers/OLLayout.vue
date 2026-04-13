<template>
  <div class="ol-layout">
    <!-- 子页签导航 -->
    <nav class="ol-tabs">
      <RouterLink to="/openlayers/map"  class="tab-link">🗺️ 基础地图</RouterLink>
      <RouterLink to="/openlayers/draw" class="tab-link">✏️ 矢量绘制</RouterLink>
    </nav>
    <!-- 子页内容 -->
    <div class="ol-content">
      <RouterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<style scoped>
.ol-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.ol-tabs {
  display: flex;
  gap: 2px;
  background: #12122a;
  border-bottom: 1px solid rgba(66, 184, 131, 0.25);
  padding: 0 1rem;
  flex-shrink: 0;
}

.tab-link {
  padding: 8px 18px;
  color: #8a9bb0;
  text-decoration: none;
  font-size: 0.85rem;
  border-bottom: 2px solid transparent;
  transition: color 0.2s, border-color 0.2s;
  white-space: nowrap;
}

.tab-link:hover {
  color: #42b883;
}

.tab-link.router-link-active {
  color: #42b883;
  border-bottom-color: #42b883;
}

.ol-content {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-height: 0;
  height: 0;
}
</style>
