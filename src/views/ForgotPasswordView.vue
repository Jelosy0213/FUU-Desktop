/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
<script setup lang="ts">
import { onMounted, ref } from 'vue'

const RESET_PASSWORD_URL = 'https://jwcjwxt2.fzu.edu.cn/Login/ReSetPassWord'

const electronAPI = window.electronAPI
const isMaximized = ref(false)

onMounted(() => {
  electronAPI?.onMaximized((maximized) => {
    isMaximized.value = maximized
  })
})
</script>

<template>
  <div class="forgot-shell">
    <div class="forgot-titlebar">
      <div class="titlebar-drag" aria-hidden="true"></div>
      <div class="titlebar-title">重置密码</div>
      <div class="titlebar-actions">
        <div class="window-controls">
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

    <webview class="forgot-webview" :src="RESET_PASSWORD_URL" allowpopups></webview>
  </div>
</template>

<style scoped>
.forgot-shell {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
}

.forgot-titlebar {
  position: relative;
  flex: none;
  height: 42px;
  z-index: 100;
  background: #f4f7fb;
}

.titlebar-drag {
  position: absolute;
  inset: 0;
  -webkit-app-region: drag;
}

.titlebar-title {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 15px;
  font-weight: 700;
  color: #102033;
  white-space: nowrap;
  pointer-events: none;
  -webkit-app-region: drag;
}

.titlebar-actions {
  position: absolute;
  top: 0;
  right: 0;
  height: 42px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 10px;
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

.forgot-webview {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: 0;
  background: #fff;
}
</style>
