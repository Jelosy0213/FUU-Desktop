/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { recognizeCaptchaFromImage, waitForCaptchaImage } from '../utils/captcha'

const auth = useAuthStore()
const emit = defineEmits<{ close: [] }>()

// 记住的凭据只在内存中短暂持有，仅用于本次重新登录请求
const remembered = ref<{ username: string; password: string } | null>(null)
const verifyCode = ref('')
const captchaVersion = ref(Date.now())
const captchaLoading = ref(false)
const loading = ref(false)
const errorMessage = ref('')

const captchaImgRef = ref<HTMLImageElement | null>(null)
const autoLoggingIn = ref(false)
const AUTO_LOGIN_ATTEMPTS = 3

const captchaUrl = computed(() => `/api/captcha?t=${captchaVersion.value}`)
const canSubmit = computed(() => verifyCode.value.trim().length > 0 && !loading.value)

function refreshCaptcha() {
  captchaLoading.value = true
  captchaVersion.value = Date.now()
}

async function handleReLogin() {
  if (!canSubmit.value || !remembered.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    await auth.login(remembered.value.username, remembered.value.password, verifyCode.value)
    emit('close')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '重新登录失败，请重试'
    refreshCaptcha()
  } finally {
    loading.value = false
  }
}

function goToLoginPage() {
  // 用户主动选择回登录页：视为主动退出，下次启动直接显示登录小窗
  auth.logout()
  emit('close')
}

// 已保存凭据且非主动退出：自动识别验证码并提交重新登录，识别有误时换新验证码重试
async function autoRelogin() {
  if (autoLoggingIn.value) return
  autoLoggingIn.value = true
  try {
    for (let attempt = 0; attempt < AUTO_LOGIN_ATTEMPTS; attempt++) {
      const loaded = await waitForCaptchaImage(captchaImgRef.value, `/api/captcha?t=${captchaVersion.value}`)
      if (!loaded) {
        refreshCaptcha()
        continue
      }
      const code = await recognizeCaptchaFromImage(captchaImgRef.value!)
      if (code == null) {
        refreshCaptcha()
        continue
      }
      verifyCode.value = code
      await handleReLogin()
      if (auth.loggedIn) return
      // 识别错误或验证码已失效：handleReLogin 已刷新验证码，继续下一轮
    }
  } finally {
    autoLoggingIn.value = false
  }
}

function dismiss() {
  emit('close')
}

onMounted(async () => {
  try {
    remembered.value = (await window.electronAPI?.credentials.get()) || null
  } catch {
    remembered.value = null
  }
  refreshCaptcha()

  // 已保存凭据 → 自动识别验证码重新登录（静默重登失败后的兜底）
  if (remembered.value) {
    void autoRelogin()
  }
})
</script>

<template>
  <div class="reauth-overlay" role="dialog" aria-modal="true" aria-label="会话已过期">
    <div class="reauth-panel">
      <div class="reauth-title">✋很抱歉打断您的浏览</div>

      <template v-if="remembered">
        <p class="reauth-desc">
          {{ remembered.username }}，请您完成一道两位数加减法以继续浏览📒
        </p>
        <div class="reauth-captcha">
          <input
            v-model="verifyCode"
            class="reauth-input"
            type="text"
            autocomplete="off"
            placeholder="请在这里输入答案"
            @keyup.enter="handleReLogin"
          />
          <button class="reauth-captcha-btn" type="button" :title="'刷新验证码'" aria-label="刷新验证码" @click="refreshCaptcha">
            <img ref="captchaImgRef" :src="captchaUrl" alt="验证码" @load="captchaLoading = false" @error="captchaLoading = false" />
            <span v-if="captchaLoading">加载中</span>
          </button>
        </div>
        <p v-if="errorMessage" class="reauth-error">{{ errorMessage }}</p>
        <div class="reauth-actions">
          <button class="reauth-btn secondary" type="button" @click="dismiss">稍后再说</button>
          <button class="reauth-btn primary" type="button" :disabled="!canSubmit || autoLoggingIn" @click="handleReLogin">
            {{ autoLoggingIn ? '正在自动识别验证码...' : loading ? '登录中...' : '让我继续！' }}
          </button>
        </div>
      </template>

      <template v-else>
        <p class="reauth-desc">未找到已保存的账号密码，请前往登录页重新登录。</p>
        <div class="reauth-actions">
          <button class="reauth-btn secondary" type="button" @click="dismiss">稍后再说</button>
          <button class="reauth-btn primary" type="button" @click="goToLoginPage">前往登录页</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.reauth-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  background: rgba(16, 32, 51, 0.36);
  backdrop-filter: blur(3px);
}

.reauth-panel {
  width: min(92vw, 380px);
  padding: 24px;
  border: 1px solid #dbe3ee;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(16, 32, 51, 0.28);
}

.reauth-title {
  font-size: 16px;
  font-weight: 700;
  color: #102033;
}

.reauth-desc {
  margin: 10px 0 16px;
  color: #5b6b7f;
  font-size: 13px;
  line-height: 1.6;
}

.reauth-captcha {
  position: relative;
}

.reauth-input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 2px solid #cfd8e3;
  border-radius: 10px;
  padding: 10px 116px 10px 12px;
  outline: none;
  font-size: 14px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.reauth-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}

.reauth-captcha-btn {
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

.reauth-captcha-btn:hover {
  background: #edf4ff;
}

.reauth-captcha-btn img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.reauth-captcha-btn span {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.82);
  color: #5b6b7f;
  font-size: 13px;
  font-weight: 500;
}

.reauth-error {
  margin: 10px 0 0;
  color: #c0362c;
  font-size: 13px;
  line-height: 1.5;
}

.reauth-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.reauth-btn {
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.reauth-btn.secondary {
  border: 1px solid #dbe3ee;
  background: #f8fafc;
  color: #5b6b7f;
}

.reauth-btn.secondary:hover {
  background: #edf3fb;
  color: #102033;
}

.reauth-btn.primary {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
}

.reauth-btn.primary:hover:not(:disabled) {
  background: #1d4ed8;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28);
  transform: translateY(-1px);
}

.reauth-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
