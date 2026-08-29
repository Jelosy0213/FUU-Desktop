/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from './stores/auth'
import ReauthPanel from './components/ReauthPanel.vue'
import UpdateDialog from './components/UpdateDialog.vue'
import { updateState } from './utils/update'

const route = useRoute()
const auth = useAuthStore()
const { toastMessage, toastType } = storeToRefs(auth)
const isLoginPage = computed(() => route.name === 'login')
const isForgotPasswordPage = computed(() => route.name === 'forgot-password')
const isMiniPage = computed(() => route.name === 'mini')
const electronAPI = window.electronAPI

const isMaximized = ref(false)

onMounted(() => {
  electronAPI?.onMaximized((maximized) => {
    isMaximized.value = maximized
  })
})
</script>

<template>
  <main class="ui-page-shell page-shell">
    <template v-if="isLoginPage">
      <div class="login-drag-region" aria-hidden="true"></div>
      <div class="window-controls login-controls">
        <button class="window-icon minimize-icon" type="button" title="最小化" aria-label="最小化" @click="electronAPI?.minimize()"></button>
        <button class="window-icon close-icon close-control" type="button" title="关闭" aria-label="关闭" @click="electronAPI?.close()"></button>
      </div>
    </template>
    <template v-else-if="isForgotPasswordPage">
      <!-- 忘记密码窗口的顶栏由 ForgotPasswordView 自行渲染，与主页保持一致 -->
    </template>
    <template v-else-if="isMiniPage">
      <div class="main-titlebar mini-titlebar">
        <div class="titlebar-drag" aria-hidden="true"></div>
        <div class="mini-toolbar">
          <div id="schedule-toolbar-slot" class="schedule-toolbar-slot"></div>
        </div>
        <div class="window-controls mini-controls">
          <button class="window-icon expand-icon" type="button" title="放大窗口" aria-label="放大窗口" @click="electronAPI?.exitMini()">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
              <path d="M3 8V5a2 2 0 0 1 2-2h3" />
              <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
              <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v3" />
            </svg>
          </button>
          <button class="window-icon minimize-icon" type="button" title="最小化" aria-label="最小化" @click="electronAPI?.minimize()"></button>
          <button class="window-icon close-icon close-control" type="button" title="关闭" aria-label="关闭" @click="electronAPI?.close()"></button>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="main-titlebar">
        <div class="titlebar-drag" aria-hidden="true"></div>
        <button
          type="button"
          class="back-nav-btn"
          title="返回"
          aria-label="返回"
          disabled
        ></button>
        <div class="titlebar-brand" aria-hidden="true">
          <span>福uu(第三方)</span><span class="titlebar-preview">PREVIEW</span>
        </div>
        <div class="titlebar-actions">
          <div id="schedule-toolbar-slot" class="schedule-toolbar-slot"></div>
          <div class="window-controls">
            <button class="window-icon shrink-icon" type="button" title="缩小窗口" aria-label="缩小窗口" @click="electronAPI?.enterMini()">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            </button>
            <button class="window-icon minimize-icon" type="button" title="最小化" aria-label="最小化" @click="electronAPI?.minimize()"></button>
            <button
              class="window-icon"
              :class="isMaximized ? 'restore-icon' : 'maximize-icon'"
              type="button"
              :title="isMaximized ? '还原' : '最大化'"
              :aria-label="isMaximized ? '还原' : '最大化'"
              @click="electronAPI?.maximize()"
            ></button>
            <button class="window-icon close-icon close-control" type="button" title="关闭" aria-label="关闭" @click="electronAPI?.close()"></button>
          </div>
        </div>
      </div>
    </template>

    <RouterView />

    <Transition name="toast">
      <div v-if="toastMessage" class="toast" :class="toastType" role="status">
        {{ toastMessage }}
      </div>
    </Transition>

    <ReauthPanel v-if="auth.sessionExpired" @close="auth.dismissSessionExpired()" />

    <UpdateDialog v-if="updateState.visible" />
  </main>
</template>

<style scoped>
.page-shell {
  position: relative;
  display: block;
  padding: 0;
  /* 覆盖 ui.css 中 .ui-page-shell 的 place-items: center，避免主页面内容被居中 */
  place-items: stretch;
}

.login-drag-region {
  position: fixed;
  inset: 0 0 auto;
  height: 42px;
  z-index: 90;
  -webkit-app-region: drag;
}

.login-controls {
  position: fixed;
  top: 0;
  right: 0;
  left: auto;
  z-index: 100;
  width: 92px;
  height: 42px;
  display: flex;
  flex: none;
  -webkit-app-region: no-drag;
}

.login-controls button {
  flex: 0 0 46px;
  width: 46px;
  height: 42px;
}

.main-titlebar {
  position: fixed;
  inset: 0 0 auto;
  z-index: 100;
  height: 42px;
  background: #f2f6fc;
}

/* 迷你窗口顶栏：周切换靠左，窗口控制靠右 */
.mini-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 8px;
}

.mini-toolbar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
}

.mini-controls {
  position: relative;
  z-index: 1;
  flex: none;
}

.titlebar-drag {
  position: absolute;
  inset: 0;
  -webkit-app-region: drag;
}

/* 顶栏左侧返回按钮（占位，暂不可点击）：图标为 Segoe Fluent Icons 的 Back（E0A6） */
.back-nav-btn {
  position: absolute;
  top: 0;
  left: 4px;
  width: 40px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: #2563eb;
  -webkit-app-region: no-drag;
}

.back-nav-btn::before {
  font-family: 'SegoeIcons';
  content: '\e0a6';
  font-size: 14px;
  line-height: 1;
}

.back-nav-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

/* 主页面左上角品牌文字，pointer-events: none 保证顶栏拖拽区域可拖动 */
.titlebar-brand {
  position: absolute;
  top: 0;
  left: 56px;
  height: 46px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #2563eb;
  pointer-events: none;
}

.titlebar-brand > span:first-child {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 1.5px;
  line-height: 1;
}

.titlebar-preview {
  color: #94a3b8;
  height: 6px;
  font-size: 10px;
  font-weight: 400;
  line-height: 1;
  letter-spacing: 0.02em;
}

.titlebar-actions {
  position: absolute;
  top: 0;
  right: 0;
  height: 42px;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.window-controls {
  height: 100%;
  display: flex;
  -webkit-app-region: no-drag;
}

.window-controls button {
  width: 46px;
  border: 0;
  background: transparent;
  color: #5b6b7f;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.window-controls button svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.window-icon::before {
  font-family: 'SegoeIcons';
  font-size: 10px;
  font-weight: 400;
  line-height: 1;
}

.minimize-icon::before {
  content: '\e921';
}

.maximize-icon::before {
  content: '\e922';
}

.restore-icon::before {
  content: '\e923';
}

.close-icon::before {
  content: '\e8bb';
}

.window-controls button:hover {
  background: #edf3fb;
  color: #102033;
}

.window-controls .close-control:hover {
  background: #c0362c;
  color: #fff;
}

:deep(.app-view) {
  padding-top: 42px;
}

:deep(.content-shell) {
  --content-border-width: 1.5px;
  --content-corner-radius: 12px;
  position: relative;
  border-top-left-radius: var(--content-corner-radius);
  overflow: hidden;
  /* 底部底色：作为内容之下的背景层，不遮挡内容显示 */
  background: rgb(242, 246, 252);
}

/* 用绝对定位的伪元素画边界线，避免 border 占用布局空间导致内容溢出出现滚动条 */
:deep(.content-shell)::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 5;
  border-top: var(--content-border-width) solid #dbe3ee;
  border-left: var(--content-border-width) solid #dbe3ee;
  border-top-left-radius: var(--content-corner-radius);
  pointer-events: none;
}

:deep(.auth-panel) {
  margin-top: 0;
}

.toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 80;
  min-width: 180px;
  max-width: min(92vw, 420px);
  padding: 10px 18px;
  border-radius: 999px;
  box-shadow: 0 12px 28px rgba(16, 32, 51, 0.16);
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  background: #102033;
  color: #fff;
  pointer-events: none;
}

.toast.success {
  background: #15803d;
}

.toast.error {
  background: #c0362c;
}

.toast.info {
  background: #102033;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 16px);
}
</style>
