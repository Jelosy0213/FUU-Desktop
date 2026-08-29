/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'
import avatarImg from '../image/avatar.jpg'

const auth = useAuthStore()
const { username, profile, profileLoading } = storeToRefs(auth)

// 展示顺序与字段（后端返回中文键）
const fieldOrder = [
  { key: '学院名称', label: '学院' },
  { key: '年级', label: '年级' },
  { key: '专业名称', label: '专业' },
  { key: '性别', label: '性别' },
  { key: '出生日期', label: '出生日期' },
  { key: '民族', label: '民族' },
  { key: '政治面貌', label: '政治面貌' },
  { key: '学制', label: '学制' },
  { key: '培养层次', label: '培养层次' },
  { key: '入学日期', label: '入学日期' },
] as const

const shownFields = computed(() =>
  fieldOrder
    .map(({ key, label }) => ({ label, value: profile.value?.[key] || '' }))
    .filter((field) => field.value),
)

const name = computed(() => profile.value?.姓名 || username.value || '同学')
const studentId = computed(() => profile.value?.学号 || '')

const loadError = ref('')

async function loadProfile() {
  loadError.value = ''
  const ok = await auth.fetchProfile()
  if (!ok) loadError.value = '个人信息获取失败，请稍后重试'
}

function handleLogout() {
  // 标记主动退出：下次启动不自动登录，需手动输入验证码（由主进程持久化）
  window.electronAPI?.setExplicitLogout(true)
  auth.logout()
}

onMounted(() => {
  if (!profile.value) void loadProfile()
})
</script>

<template>
  <div class="profile-view">
    <div v-if="!profile && profileLoading" class="profile-state">
      <span class="spinner" aria-hidden="true"></span>
      <span>正在加载个人信息...</span>
    </div>

    <div v-else-if="!profile" class="profile-state">
      <strong>{{ loadError || '暂无个人信息' }}</strong>
      <button type="button" class="action-btn" @click="loadProfile">重新加载</button>
    </div>

    <template v-else>
      <div class="profile-card">
        <div class="profile-header">
          <img class="profile-avatar" :src="avatarImg" alt="头像" />
          <div class="profile-headline">
            <h1 class="profile-name">{{ name }}</h1>
            <span class="profile-id">学号：{{ studentId || '未知' }}</span>
          </div>
        </div>

        <dl class="profile-fields">
          <template v-for="field in shownFields" :key="field.label">
            <dt>{{ field.label }}</dt>
            <dd>{{ field.value }}</dd>
          </template>
        </dl>

        <div class="profile-actions">
          <button type="button" class="action-btn logout" @click="handleLogout">退出登录</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.profile-view {
  display: grid;
  place-items: center;
  min-height: calc(100vh - 42px);
  padding: 24px;
}

.profile-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  color: #5b6b7f;
  font-size: 14px;
}

.spinner {
  width: 22px;
  height: 22px;
  border: 2.5px solid #dbe3ee;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.profile-card {
  width: min(100%, 520px);
  padding: 28px 32px;
  border: 1px solid #dbe3ee;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 12px 30px rgba(30, 64, 110, 0.07);
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 20px;
  border-bottom: 1px solid #edf2f9;
}

.profile-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.22);
}

.profile-name {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #102033;
}

.profile-id {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: #5b6b7f;
}

.profile-fields {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 12px 16px;
  margin: 20px 0 0;
}

.profile-fields dt {
  font-size: 13px;
  color: #8296ab;
}

.profile-fields dd {
  margin: 0;
  font-size: 13px;
  font-weight: 900;
  color: #102033;
}

.profile-actions {
  display: flex;
  justify-content: center;
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid #edf2f9;
}

.action-btn {
  padding: 8px 16px;
  border: 1px solid #dbe3ee;
  border-radius: 9px;
  background: #f6f9fd;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.action-btn:hover {
  background: #e3edfd;
}

.action-btn.logout {
  padding: 12px 40px;
  border-color: transparent;
  background: transparent;
  color: #c0362c;
  font-size: 15px;
}

.action-btn.logout:hover {
  background: #fdeceb;
}
</style>
