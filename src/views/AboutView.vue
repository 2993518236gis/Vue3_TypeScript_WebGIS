<template>
  <div class="about">
    <h1>关于本项目</h1>
    <p>这是一个用于学习 Vue 3 核心特性的示例工程。</p>

    <div class="tech-list">
      <div class="tech-item" v-for="tech in techs" :key="tech.name">
        <strong>{{ tech.name }}</strong>
        <span>{{ tech.version }}</span>
        <p>{{ tech.desc }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Tech {
  name: string
  version: string
  desc: string
}

const techs: Tech[] = [
  { name: 'Vue 3', version: '^3.4', desc: '渐进式 JavaScript 框架，Composition API 使逻辑复用更简洁' },
  { name: 'Vite', version: '^5.0', desc: '基于 ES Module 的构建工具，开发体验极佳' },
  { name: 'Vue Router', version: '^4.3', desc: 'Vue 官方路由管理器，支持 History / Hash 模式' },
  { name: 'Pinia', version: '^2.1', desc: 'Vue 推荐的状态管理库，API 简洁，DevTools 支持好' }
]
</script>

<style scoped>
.about {
  max-width: 700px;
}

h1 {
  font-size: 1.8rem;
  color: #1a1a2e;
  margin-bottom: 0.5rem;
}

.about > p {
  color: #666;
  margin-bottom: 2rem;
}

.tech-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tech-item {
  background: #fff;
  border-left: 4px solid #42b883;
  padding: 1rem 1.2rem;
  border-radius: 0 8px 8px 0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.tech-item strong {
  font-size: 1rem;
  color: #1a1a2e;
  margin-right: 0.6rem;
}

.tech-item span {
  font-size: 0.8rem;
  background: #e8f5ef;
  color: #42b883;
  padding: 2px 8px;
  border-radius: 10px;
}

.tech-item p {
  margin: 0.5rem 0 0;
  color: #666;
  font-size: 0.9rem;
}
</style>
