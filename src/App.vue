<template>
  <div id="app-root">
    <header class="topbar">
      <div class="topbar-brand">🌍 Vue3 + Typescript + WebGIS 地图展示系统</div>
    </header>
    <div class="body-row">
      <nav class="sidebar">
        <ul class="sidebar-links">
          <li><RouterLink to="/"><span class="nav-icon">🏠</span><span class="nav-text">首页</span></RouterLink></li>
          <li><RouterLink to="/about"><span class="nav-icon">🗺️</span><span class="nav-text">地图门户</span></RouterLink></li>
          <li><RouterLink to="/counter"><span class="nav-icon">🌍</span><span class="nav-text">Cesium</span></RouterLink></li>
        </ul>
      </nav>
      <main class="main-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<style scoped>
* {
  box-sizing: border-box;
}

#app-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #0f0f1a;
}

.topbar {
  height: 56px;
  background: linear-gradient(90deg, #1a1a2e 0%, #16213e 100%);
  color: #fff;
  display: flex;
  align-items: center;
  padding: 0 2rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  flex-shrink: 0;
  border-bottom: 2px solid #42b883;
  z-index: 100;
}

.topbar-brand {
  font-size: 1.2rem;
  font-weight: 700;
  color: #42b883;
  letter-spacing: 0.03em;
}

.body-row {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 90px;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  padding: 1.2rem 0;
  flex-shrink: 0;
  border-right: 1px solid rgba(66, 184, 131, 0.2);
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}

.sidebar-links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sidebar-links li a {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 0.75rem 0.5rem;
  color: #8a9bb0;
  text-decoration: none;
  font-size: 0.78rem;
  transition: background 0.2s, color 0.2s;
  border-left: 3px solid transparent;
}

.nav-icon {
  font-size: 1.2rem;
  line-height: 1;
}

.nav-text {
  font-size: 0.75rem;
}

.sidebar-links li a:hover {
  color: #42b883;
  background: rgba(66, 184, 131, 0.08);
  border-left-color: rgba(66, 184, 131, 0.4);
}

.sidebar-links li a.router-link-active {
  color: #42b883;
  background: rgba(66, 184, 131, 0.12);
  border-left-color: #42b883;
}

.main-content {
  flex: 1;
  overflow: hidden;
}
</style>
