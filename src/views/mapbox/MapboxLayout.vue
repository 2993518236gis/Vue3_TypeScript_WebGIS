<template>
  <div class="mb-layout">
    <!-- 子页签导航 -->
    <nav class="mb-tabs">
      <RouterLink to="/mapbox/basic"    class="tab-link">🗺️ 基础地图</RouterLink>
      <RouterLink to="/mapbox/draw"     class="tab-link">✏️ 矢量绘制</RouterLink>
      <RouterLink to="/mapbox/3d"       class="tab-link">🏙️ 3D建筑</RouterLink>
      <RouterLink to="/mapbox/poi"      class="tab-link">🔍 POI搜索</RouterLink>
      <RouterLink to="/mapbox/heatmap"  class="tab-link">🔥 学校热力图</RouterLink>
    </nav>
    <!-- 子页内容 -->
    <div class="mb-content">
      <RouterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<style scoped>
.mb-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.mb-tabs {
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

.mb-content {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-height: 0;
  height: 0;
}
</style>
