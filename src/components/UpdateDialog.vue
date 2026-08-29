/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
<script setup lang="ts">
import { ref } from 'vue'
import appIcon from '../assets/icon.png'
import { version as appVersion } from '../../package.json'
import { updateState, closeUpdate, startDownload } from '../utils/update'

const noReminder = ref(false)
</script>

<template>
  <div class="update-overlay" role="presentation">
    <div class="update-dialog" role="dialog" aria-modal="true" aria-label="更新提示">
      <div class="update-header">
        <img class="update-logo" :src="appIcon" alt="应用图标" />
        <div class="update-title">
          <h2>发现新版本</h2>
          <span class="update-badge">v{{ updateState.info?.version }}</span>
        </div>
      </div>

      <div class="update-body">
        <div class="update-version-line">
          <span>当前版本 <strong>v{{ appVersion }}</strong></span>
          <span class="version-arrow" aria-hidden="true">→</span>
          <span>新版本 <strong class="new-version">v{{ updateState.info?.version }}</strong></span>
        </div>

        <div v-if="updateState.info?.releaseNotes" class="update-notes">
          <h3>更新内容</h3>
          <p>{{ updateState.info.releaseNotes }}</p>
        </div>

        <div v-if="updateState.downloading" class="download-area">
          <div class="progress-track" aria-hidden="true">
            <div class="progress-fill" :style="{ width: `${updateState.progress}%` }"></div>
          </div>
          <span class="progress-text">正在下载 {{ updateState.progress }}%</span>
        </div>

        <div v-else-if="updateState.downloaded" class="download-done">
          <span>下载完成，安装包已保存至：{{ updateState.downloadPath }}</span>
        </div>

        <p v-if="updateState.error" class="update-error">{{ updateState.error }}</p>
      </div>

      <div class="update-footer">
        <label class="no-reminder">
          <input v-model="noReminder" type="checkbox" :disabled="updateState.downloading || updateState.downloaded" />
          <span>不再提示</span>
        </label>
        <div class="update-actions">
          <button
            type="button"
            class="btn btn-later"
            :disabled="updateState.downloading || updateState.downloaded"
            @click="closeUpdate(noReminder)"
          >以后再说</button>
          <button
            v-if="!updateState.downloaded"
            type="button"
            class="btn btn-update"
            :disabled="updateState.downloading"
            @click="startDownload"
          >{{ updateState.downloading ? '下载中…' : '更新' }}</button>
          <button
            v-else
            type="button"
            class="btn btn-update"
            @click="closeUpdate(false)"
          >完成</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.update-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  background: rgba(16, 32, 51, 0.45);
  backdrop-filter: blur(2px);
}

.update-dialog {
  width: 600px;
  height: 700px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  padding: 28px 32px;
  border: 1px solid #dbe3ee;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(16, 32, 51, 0.28);
  box-sizing: border-box;
}

.update-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.update-logo {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  object-fit: cover;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28);
}

.update-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.update-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #102033;
}

.update-badge {
  padding: 2px 10px;
  border-radius: 999px;
  background: #e3edfd;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.update-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 20px;
  border-top: 1px solid #edf2f9;
  padding-top: 18px;
}

.update-version-line {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #56708d;
}

.update-version-line strong {
  color: #102033;
}

.update-version-line .new-version {
  color: #1d4ed8;
}

.version-arrow {
  color: #94a3b8;
}

.update-notes {
  flex: 1;
  min-height: 0;
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid #edf2f9;
  border-radius: 12px;
  background: #f8fafd;
  overflow-y: auto;
}

.update-notes h3 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: #102033;
}

.update-notes p {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #344054;
  white-space: pre-wrap;
  word-break: break-word;
}

.download-area {
  margin-top: auto;
  padding-top: 18px;
}

.progress-track {
  height: 10px;
  border-radius: 999px;
  background: #e5edf7;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #3b82f6, #1d4ed8);
  transition: width 0.15s ease;
}

.progress-text {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: #56708d;
  text-align: center;
}

.download-done {
  margin-top: auto;
  padding: 14px 16px;
  border-radius: 12px;
  background: #eef7f0;
  color: #15803d;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
}

.update-error {
  margin: 12px 0 0;
  color: #c0362c;
  font-size: 13px;
}

.update-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #edf2f9;
}

.no-reminder {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #56708d;
  cursor: pointer;
  user-select: none;
}

.no-reminder input {
  accent-color: #2563eb;
}

.update-actions {
  display: flex;
  gap: 10px;
}

.btn {
  min-width: 96px;
  padding: 9px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.btn-later {
  border: 1px solid #dbe3ee;
  background: #fff;
  color: #56708d;
}

.btn-later:hover:not(:disabled) {
  background: #f2f6fc;
}

.btn-update {
  border: 0;
  background: #2563eb;
  color: #fff;
}

.btn-update:hover:not(:disabled) {
  background: #1d4ed8;
}
</style>
