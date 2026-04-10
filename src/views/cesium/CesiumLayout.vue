<template>
  <div class="cesium-layout">
    <!-- 子页签导航 -->
    <nav class="cesium-tabs">
      <RouterLink to="/cesium/draw"   class="tab-link">🖊 绘制 / 无人车</RouterLink>
      <RouterLink to="/cesium/models" class="tab-link">✈ 3D 飞机轨迹</RouterLink>
    </nav>
    <!-- 子页内容 -->
    <div class="cesium-content">
      <RouterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<style scoped>
.cesium-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.cesium-tabs {
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

.cesium-content {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-height: 0;
  height: 0;
}
</style>
