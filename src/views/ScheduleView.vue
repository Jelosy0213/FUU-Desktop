/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import CourseSchedule from '../components/CourseSchedule.vue'
import { useAuthStore } from '../stores/auth'
import { checkForUpdate } from '../utils/update'

const auth = useAuthStore()
const { courseLoading, examLoading, courseResult, examResult, currentWeek, schoolCalendar, selectedTerm } = storeToRefs(auth)

function handleRefresh() {
  auth.fetchCoursePage()
}

function handleChangeTerm(term: string) {
  auth.selectTerm(term)
}

// 隐藏窗口不主动拉数据（拿不到原生接口时按可见处理，纯浏览器下照常工作）
async function isWindowVisible() {
  return (await window.electronAPI?.isWindowVisible?.()) ?? true
}

onMounted(async () => {
  // 有登录态且窗口可见时启动后台自动登录：先展示缓存课表，无感恢复代理会话并刷新数据。
  // 预建的隐藏窗口（启动时选了迷你模式）不在这里拉，等真正被显示时的 window-shown
  if (auth.loggedIn && (await isWindowVisible())) void auth.startupAutoLogin()
  // 进入主页面后检查更新：无更新或已勾选"不再提示"时不打扰用户
  void checkForUpdate(false)

  // 从迷你窗放大回来时窗口只是重新显示（不会重新挂载），由 Rust 发事件通知：
  // 同步迷你窗写入的缓存（课表与展示周），并按需刷新（超过刷新间隔才真的拉数据）
  window.electronAPI?.onWindowShown(() => {
    auth.syncFromCache()
    auth.refreshIfStale()
  })
})
</script>

<template>
  <CourseSchedule
    :course-loading="courseLoading"
    :course-result="courseResult"
    :exam-loading="examLoading"
    :exam-result="examResult"
    :current-week="currentWeek"
    :school-calendar="schoolCalendar"
    :selected-term="selectedTerm"
    @refresh="handleRefresh"
    @change-term="handleChangeTerm"
  />
</template>
