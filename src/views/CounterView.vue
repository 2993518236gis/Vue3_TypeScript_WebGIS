<template>
  <div class="counter-page">
    <h1>Pinia 计数器示例</h1>
    <p class="sub">演示 Pinia 状态管理与 Composition API</p>

    <div class="counter-card">
      <div class="count-display">{{ counter.count }}</div>
      <p class="double">双倍值：{{ counter.doubleCount }}</p>

      <div class="btn-group">
        <button class="btn btn-danger" @click="counter.decrement">－ 减少</button>
        <button class="btn btn-secondary" @click="counter.reset">重置</button>
        <button class="btn btn-success" @click="counter.increment">＋ 增加</button>
      </div>
    </div>

    <div class="info-box">
      <h3>代码说明</h3>
      <ul>
        <li>使用 <code>defineStore</code> 定义 Pinia store</li>
        <li>使用 <code>ref</code> 定义响应式状态</li>
        <li>使用 <code>computed</code> 定义派生状态</li>
        <li>在组件中通过 <code>useCounterStore()</code> 使用</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCounterStore } from '@/stores/counter'

const counter = useCounterStore()
</script>

<style scoped>
.counter-page {
  max-width: 500px;
  margin: 0 auto;
  text-align: center;
}

h1 {
  font-size: 1.8rem;
  color: #1a1a2e;
}

.sub {
  color: #888;
  margin-bottom: 2rem;
}

.counter-card {
  background: #fff;
  border-radius: 12px;
  padding: 2.5rem 2rem;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  margin-bottom: 2rem;
}

.count-display {
  font-size: 5rem;
  font-weight: 700;
  color: #42b883;
  line-height: 1;
  margin-bottom: 0.5rem;
}

.double {
  color: #aaa;
  font-size: 0.95rem;
  margin-bottom: 1.5rem;
}

.btn-group {
  display: flex;
  gap: 0.8rem;
  justify-content: center;
}

.btn {
  padding: 0.6rem 1.4rem;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  cursor: pointer;
  font-weight: 600;
  transition: opacity 0.2s;
}

.btn:hover { opacity: 0.85; }

.btn-success { background: #42b883; color: #fff; }
.btn-danger  { background: #e74c3c; color: #fff; }
.btn-secondary { background: #eee; color: #333; }

.info-box {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1.2rem 1.5rem;
  text-align: left;
}

.info-box h3 {
  margin: 0 0 0.8rem;
  font-size: 1rem;
  color: #1a1a2e;
}

.info-box ul {
  margin: 0;
  padding-left: 1.2rem;
  color: #555;
  font-size: 0.9rem;
  line-height: 1.8;
}

.info-box code {
  background: #e8f5ef;
  color: #42b883;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.88rem;
}
</style>
