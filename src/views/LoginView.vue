/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const electronAPI = window.electronAPI

// 清理旧版本用 localStorage 保存的明文凭据
localStorage.removeItem('fzu_remember_login')

const password = ref('')
const verifyCode = ref('')
const rememberPassword = ref(false)
const captchaVersion = ref(Date.now())
const captchaLoading = ref(false)
const loading = ref(false)
const errorMessage = ref('')

const captchaUrl = computed(() => `/api/captcha?t=${captchaVersion.value}`)
const canSubmit = computed(
  () => auth.username.trim().length > 0 && password.value.length > 0 && verifyCode.value.trim().length > 0,
)

function refreshCaptcha() {
  captchaLoading.value = true
  captchaVersion.value = Date.now()
}

function openForgotPassword() {
  window.electronAPI?.openForgotPassword()
}

async function readRememberedLogin() {
  try {
    return (await electronAPI?.credentials.get()) || null
  } catch {
    return null
  }
}

async function saveRememberedLogin() {
  try {
    if (!rememberPassword.value) {
      await electronAPI?.credentials.clear()
      return
    }
    await electronAPI?.credentials.set({ username: auth.username.trim(), password: password.value })
  } catch {
    // 忽略：凭据保存失败不影响登录
  }
}

async function handleLogin() {
  if (!canSubmit.value || loading.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    await auth.login(auth.username, password.value, verifyCode.value)
    await saveRememberedLogin()
    password.value = ''
    verifyCode.value = ''
    // 凭据已保存，再通知主进程切换到主窗口，避免窗口关闭导致保存中断
    window.electronAPI?.loginSuccess(auth.username.trim())
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败，请重试'
    refreshCaptcha()
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // 重启后 localStorage 可能残留登录会话，但代理内存中的教务会话已清空：
  // 静默校验一次课表请求，有效则直接进入主窗口，失效则清空本地登录态走正常登录
  if (auth.loggedIn) {
    const valid = await auth.validateStoredSession()
    if (valid) {
      window.electronAPI?.loginSuccess(auth.username.trim())
      return
    }
    // 会话已失效：仅清理本地登录态，不算主动退出，下次启动仍可尝试自动登录
    auth.logout(false)
  }

  const remembered = await readRememberedLogin()
  if (remembered) {
    auth.username = remembered.username
    password.value = remembered.password
    rememberPassword.value = true
  }
  refreshCaptcha()
})
</script>

<template>
  <section class="panel auth-panel">
    <div class="panel-header">
      <p class="eyebrow">FZUHelper</p>
      <h1>教务登录</h1>
    </div>

    <form class="form" @submit.prevent="handleLogin">
      <label class="field">
        <span>账号</span>
        <input v-model="auth.username" type="text" autocomplete="username" placeholder="请输入学号/工号" />
      </label>

      <label class="field">
        <span>密码</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="请输入密码"
        />
      </label>

      <label class="field">
        <span>验证码</span>
        <div class="captcha-field">
          <input v-model="verifyCode" type="text" autocomplete="off" placeholder="请输入验证码" />
          <button class="captcha-btn" type="button" @click="refreshCaptcha">
            <img :src="captchaUrl" alt="验证码" @load="captchaLoading = false" @error="captchaLoading = false" />
            <span v-if="captchaLoading">加载中</span>
          </button>
        </div>
      </label>

      <div class="remember-row">
        <button
          class="remember-field"
          :class="{ selected: rememberPassword }"
          type="button"
          :aria-pressed="rememberPassword"
          @click="rememberPassword = !rememberPassword"
        >
          <span class="remember-dot" aria-hidden="true"></span>
          <span>记住密码</span>
        </button>
        <button class="forgot-btn" type="button" @click="openForgotPassword">忘记密码</button>
      </div>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

      <button class="primary-btn" type="submit" :disabled="!canSubmit || loading">
        {{ loading ? '登录中...' : '登录' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.panel {
  width: min(100%, 440px);
  margin: 0 auto;
  padding: 64px 28px 28px;
  user-select: none;
}

.panel-header h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.2;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2563eb;
}

.subtitle {
  margin: 8px 0 0;
  color: #5b6b7f;
}

.form {
  margin-top: 24px;
  display: grid;
  gap: 16px;
}

.field {
  display: grid;
  gap: 8px;
  color: #344054;
  font-size: 14px;
  font-weight: 500;
}

.field input {
  --input-border-width: 2px;
  --input-border-color: #cfd8e3;
  width: 100%;
  min-width: 0;
  border: var(--input-border-width) solid var(--input-border-color);
  border-radius: 10px;
  padding: 12px 14px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  background: #fff;
  font-weight: 500;
  user-select: text;
}

.field input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}

.field input::selection {
  background: #e5e7eb;
  color: inherit;
}

.field input::-moz-selection {
  background: #e5e7eb;
  color: inherit;
}

.captcha-field {
  position: relative;
}

.captcha-field input {
  padding-right: 116px;
}

.captcha-btn {
  position: absolute;
  top: 3px;
  right: 3px;
  bottom: 3px;
  width: 106px;
  border: 0;
  border-left: 1px solid #cfd8e3;
  border-radius: 0 8px 8px 0;
  padding: 4px 6px;
  background: #f8fafc;
  overflow: hidden;
  cursor: pointer;
  transition: background 0.2s ease;
}

.captcha-btn:hover {
  background: #edf4ff;
}

.captcha-btn img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.captcha-btn span {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.82);
  color: #5b6b7f;
  font-size: 13px;
  font-weight: 500;
}

.remember-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.remember-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border: 2px solid #bfd9fd;
  border-radius: 999px;
  background: #f8fafc;
  color: #323c49;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.forgot-btn {
  border: 0;
  background: transparent;
  padding: 7px 2px;
  color: #2563eb;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s ease;
}

.forgot-btn:hover {
  color: #1d4ed8;
  text-decoration: underline;
}

.remember-field:hover {
  border-color: #93c5fd;
  color: #2563eb;
}

.remember-field.selected {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.remember-field:active {
  transform: translateY(1px);
}

.remember-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.95;
  transition: opacity 0.2s ease, background 0.2s ease;
}

.remember-field.selected .remember-dot {
  background: #fff;
  opacity: 1;
}

.primary-btn {
  border: 0;
  border-radius: 10px;
  padding: 12px 16px;
  cursor: pointer;
  transition: transform 0.12s ease, opacity 0.12s ease;
  background: #2563eb;
  color: #fff;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primary-btn:not(:disabled):active,
.captcha-btn:active {
  transform: translateY(1px);
}

.error {
  margin: 0;
  color: #c0362c;
  font-size: 14px;
}

@media (max-width: 420px) {
  .captcha-btn {
    width: 96px;
  }

  .captcha-field input {
    padding-right: 106px;
  }
}
</style>
