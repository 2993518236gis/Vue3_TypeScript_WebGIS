<template>
  <div class="chat-panel" ref="panelRef" @mousedown="startDrag">
    <div class="chat-header">
      <span>🤖 千问助手</span>
      <button class="toggle-btn" @click.stop="collapsed = !collapsed">{{ collapsed ? '▲' : '▼' }}</button>
    </div>

    <div v-show="!collapsed">
      <div class="chat-messages" ref="messagesRef">
        <div v-for="(msg, i) in messages" :key="i" :class="['msg', msg.role]">
          <span class="msg-content">{{ msg.content }}</span>
        </div>
        <div v-if="loading" class="msg assistant">
          <span class="msg-content typing">...</span>
        </div>
      </div>
      <div class="chat-input">
        <textarea
          v-model="input"
          placeholder="输入问题，Enter 发送，Shift+Enter 换行"
          @keydown.enter.exact.prevent="send"
          rows="2"
        />
        <button @click.stop="send" :disabled="loading">发送</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const panelRef = ref<HTMLElement>()
const messagesRef = ref<HTMLElement>()
const messages = ref<Message[]>([])
const input = ref('')
const loading = ref(false)
const collapsed = ref(false)

let isDragging = false
let offsetX = 0
let offsetY = 0

const startDrag = (e: MouseEvent) => {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'BUTTON' || tag === 'TEXTAREA') return
  isDragging = true
  offsetX = e.clientX - panelRef.value!.offsetLeft
  offsetY = e.clientY - panelRef.value!.offsetTop
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

const onDrag = (e: MouseEvent) => {
  if (!isDragging) return
  panelRef.value!.style.left = e.clientX - offsetX + 'px'
  panelRef.value!.style.top = e.clientY - offsetY + 'px'
  panelRef.value!.style.right = 'auto'
  panelRef.value!.style.bottom = 'auto'
}

const stopDrag = () => {
  isDragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

const scrollToBottom = async () => {
  await nextTick()
  if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
}

const send = async () => {
  const text = input.value.trim()
  if (!text || loading.value) return

  messages.value.push({ role: 'user', content: text })
  input.value = ''
  loading.value = true
  await scrollToBottom()

  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5',
        messages: messages.value.map(m => ({ role: m.role, content: m.content })),
        stream: true
      })
    })

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let assistantMsg = ''
    messages.value.push({ role: 'assistant', content: '' })
    const msgIndex = messages.value.length - 1

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = decoder.decode(value).split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const data = JSON.parse(line)
          if (data.message?.content) {
            assistantMsg += data.message.content
            messages.value[msgIndex].content = assistantMsg
            await scrollToBottom()
          }
        } catch {}
      }
    }
  } catch (e) {
    messages.value.push({ role: 'assistant', content: '连接失败，请确认 Ollama 服务已启动。' })
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}
</script>

<style scoped>
.chat-panel {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 340px;
  background: rgba(30, 30, 40, 0.88);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  z-index: 1001;
  cursor: move;
  user-select: none;
  color: #fff;
  font-size: 14px;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  font-weight: bold;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.toggle-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
}

.chat-messages {
  height: 260px;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.msg {
  max-width: 85%;
  padding: 7px 10px;
  border-radius: 8px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}

.msg.user {
  align-self: flex-end;
  background: rgba(66, 184, 131, 0.7);
}

.msg.assistant {
  align-self: flex-start;
  background: rgba(255,255,255,0.12);
}

.typing {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1 }
  50% { opacity: 0.3 }
}

.chat-input {
  display: flex;
  gap: 6px;
  padding: 8px 12px 12px;
  border-top: 1px solid rgba(255,255,255,0.1);
}

.chat-input textarea {
  flex: 1;
  resize: none;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  color: #fff;
  padding: 6px 8px;
  font-size: 13px;
  cursor: text;
  outline: none;
}

.chat-input textarea::placeholder {
  color: rgba(255,255,255,0.4);
}

.chat-input button {
  padding: 0 14px;
  background: #42b883;
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}

.chat-input button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
