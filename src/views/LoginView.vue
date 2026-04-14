<template>
  <div class="login-page">
    <div class="login-box">
      <div class="login-title">🌍 WebGIS 地图系统</div>
      <div class="login-subtitle">请登录以继续</div>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label>用户名</label>
          <input v-model="username" type="text" placeholder="请输入用户名" autocomplete="username" />
        </div>
        <div class="form-group">
          <label>密码</label>
          <input v-model="password" type="password" placeholder="请输入密码" autocomplete="current-password" />
        </div>
        <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
        <button type="submit">登 录</button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref('')
const password = ref('')
const errorMsg = ref('')

const USERS: Record<string, string> = {
  admin: '123456',
  guest: '123456',
}

function handleLogin() {
  errorMsg.value = ''
  if (!username.value || !password.value) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  if (USERS[username.value] !== password.value) {
    errorMsg.value = '用户名或密码错误'
    return
  }
  sessionStorage.setItem('user', JSON.stringify({ username: username.value }))
  router.push('/')
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: #0f0f1a;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-box {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid rgba(66, 184, 131, 0.3);
  border-radius: 12px;
  padding: 2.5rem 2rem;
  width: 360px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.login-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: #42b883;
  text-align: center;
  margin-bottom: 0.4rem;
}

.login-subtitle {
  font-size: 0.85rem;
  color: #8a9bb0;
  text-align: center;
  margin-bottom: 2rem;
}

.form-group {
  margin-bottom: 1.2rem;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  color: #8a9bb0;
  margin-bottom: 0.4rem;
}

.form-group input {
  width: 100%;
  padding: 0.65rem 0.9rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(66, 184, 131, 0.25);
  border-radius: 6px;
  color: #fff;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-group input:focus {
  border-color: #42b883;
}

.error-msg {
  color: #ff6b6b;
  font-size: 0.85rem;
  margin-bottom: 1rem;
  text-align: center;
}

button[type='submit'] {
  width: 100%;
  padding: 0.75rem;
  background: #42b883;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 0.5rem;
}

button[type='submit']:hover:not(:disabled) {
  background: #33a06f;
}

button[type='submit']:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
