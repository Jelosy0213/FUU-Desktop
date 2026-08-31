/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'
import appIcon from '../assets/icon.png'
import { version as appVersion } from '../../update.json'
import { checkForUpdate, updateState } from '../utils/update'

type SettingsSection = 'display' | 'system' | 'about'

const auth = useAuthStore()
const { uiSettings } = storeToRefs(auth)

const menuItems = [
  { key: 'display', label: '显示与主题', icon: 'display' },
  { key: 'system', label: '系统与功能', icon: 'system' },
  { key: 'about', label: '关于', icon: 'info' },
] as const

const activeSection = ref<SettingsSection>('display')

function toggleCourseCardMotion(event: Event) {
  const target = event.target as HTMLInputElement
  auth.setCourseCardMotion(target.checked)
}

function toggleWindowMemory(event: Event) {
  const target = event.target as HTMLInputElement
  auth.setWindowMemory(target.checked)
}
</script>

<template>
  <div class="settings-view">
    <aside class="settings-menu" aria-label="设置菜单">
      <button
        v-for="item in menuItems"
        :key="item.key"
        type="button"
        class="settings-menu-item"
        :class="{ active: activeSection === item.key }"
        :aria-current="activeSection === item.key ? 'page' : undefined"
        @click="activeSection = item.key"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <template v-if="item.icon === 'display'">
            <path d="M4 6h16v10H4z" />
            <path d="M9 18h6" />
            <path d="M12 16v2" />
          </template>
          <template v-else-if="item.icon === 'system'">
            <rect x="3" y="5" width="18" height="12" rx="2" />
            <path d="M12 5v12" />
            <circle cx="12" cy="8" r="1.5" />
            <path d="M7 17v2M17 17v2" />
          </template>
          <template v-else-if="item.icon === 'info'">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </template>
        </svg>
        <span>{{ item.label }}</span>
      </button>
    </aside>

    <section class="settings-content">
      <div v-if="activeSection === 'display'" class="setting-panel">
        <h1 class="panel-title">显示与主题</h1>
        <div class="setting-item">
          <div>
            <strong>课程卡片动效</strong>
            <p>控制课表中课程卡片的入场与悬停动效，默认关闭。</p>
          </div>
          <label class="switch" :title="uiSettings.courseCardMotion ? '已开启' : '已关闭'">
            <input
              type="checkbox"
              :checked="uiSettings.courseCardMotion"
              @change="toggleCourseCardMotion"
            />
            <span class="switch-track" aria-hidden="true"></span>
          </label>
        </div>
      </div>

      <div v-else-if="activeSection === 'system'" class="setting-panel">
        <h1 class="panel-title">系统与功能</h1>
        <div class="setting-item">
          <div>
            <strong>启动时记忆窗口</strong>
            <p>退出时若处于小窗模式，下次启动直接打开小窗；默认开启。</p>
          </div>
          <label class="switch" :title="uiSettings.windowMemory ? '已开启' : '已关闭'">
            <input type="checkbox" :checked="uiSettings.windowMemory" @change="toggleWindowMemory" />
            <span class="switch-track" aria-hidden="true"></span>
          </label>
        </div>
      </div>

      <div v-else-if="activeSection === 'about'" class="about-panel">
        <img class="about-logo" :src="appIcon" alt="应用图标" aria-hidden="true" />
        <h1 class="about-name">福uu(第三方)</h1>
        <span class="about-preview">版本号：{{ appVersion }}</span>
        <p class="about-name-zh"></p>
        <p class="about-desc">
          基于
          <a
          >GNU GPL v3</a
          > 协议发布的开源软件。
        </p>
        <div class="about-actions">
          <button
            type="button"
            class="check-update-btn"
            :disabled="updateState.checking"
            @click="checkForUpdate(true)"
          >{{ updateState.checking ? '检查中…' : '检查更新' }}</button>
        </div>
        <div class="about-footer">
          <span>「反馈邮箱：<B>3926315038@qq.com</B>」</span>
          <span>© 2026 JELOSY</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings-view {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 18px;
  padding: 20px;
  min-height: calc(100vh - 42px);
}

.settings-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-self: start;
  padding: 8px;
  border: 1px solid #dbe3ee;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 6px 16px rgba(30, 64, 110, 0.06);
}

.settings-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #56708d;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.settings-menu-item svg {
  width: 17px;
  height: 17px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: none;
}

.settings-menu-item:hover {
  background: #eef4fc;
  color: #1d4ed8;
}

.settings-menu-item.active {
  background: #e3edfd;
  color: #1d4ed8;
  font-weight: 700;
}

.settings-content {
  min-width: 0;
}

.setting-panel,
.about-panel {
  max-width: 560px;
  padding: 36px 40px;
  border: 1px solid #dbe3ee;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 12px 30px rgba(30, 64, 110, 0.07);
}

.panel-title {
  margin: 0;
  color: #102033;
  font-size: 20px;
  font-weight: 800;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 24px;
  padding: 16px 0;
  border-top: 1px solid #edf2f9;
}

.setting-item strong {
  display: block;
  color: #102033;
  font-size: 14px;
  font-weight: 700;
}

.setting-item p {
  margin: 6px 0 0;
  color: #8296ab;
  font-size: 12px;
  line-height: 1.5;
}

.switch {
  position: relative;
  flex: none;
  width: 42px;
  height: 24px;
  cursor: pointer;
}

.switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.switch-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: #cbd5e1;
  transition: background 0.2s ease;
}

.switch-track::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 5px rgba(30, 64, 110, 0.2);
  content: '';
  transition: transform 0.2s ease;
}

.switch input:checked + .switch-track {
  background: #2563eb;
}

.switch input:checked + .switch-track::after {
  transform: translateX(18px);
}

.switch input:focus-visible + .switch-track {
  outline: 3px solid rgba(96, 165, 250, 0.28);
  outline-offset: 2px;
}

.about-panel {
  max-width: 560px;
  padding: 36px 40px;
  border: 1px solid #dbe3ee;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 12px 30px rgba(30, 64, 110, 0.07);
}

.about-logo {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  object-fit: cover;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.3);
}

.about-name {
  margin: 18px 0 0;
  font-size: 22px;
  font-weight: 800;
  color: #102033;
}

.about-preview {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.about-name-zh {
  margin: 4px 0 0;
  font-size: 13px;
  color: #5b6b7f;
}

.about-version {
  display: inline-block;
  margin-top: 14px;
  padding: 3px 10px;
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  background: #f6f9fd;
  color: #56708d;
  font-size: 12px;
}

.about-desc {
  margin: 16px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: #344054;
}

.about-desc a {
  color: #1d4ed8;
  text-decoration: none;
}

.about-desc a:hover {
  text-decoration: underline;
}

.about-actions {
  margin-top: 16px;
}

.check-update-btn {
  padding: 8px 18px;
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  background: #f6f9fd;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.check-update-btn:hover:not(:disabled) {
  background: #e3edfd;
  border-color: #b9cdf5;
}

.check-update-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.about-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 26px;
  padding-top: 16px;
  border-top: 1px solid #edf2f9;
  font-size: 12px;
  color: #8296ab;
}
</style>
