/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import CourseSchedule from '../components/CourseSchedule.vue'
import { useAuthStore } from '../stores/auth'

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
  // 迷你窗是预建的（启动时隐藏），先只展示缓存课表；隐藏时不拉数据，
  // 等真正被显示时的 window-shown 再恢复会话并刷新
  if (auth.loggedIn && (await isWindowVisible())) void auth.startupAutoLogin()

  // 迷你窗只隐藏、不销毁，"重新显示"不会再触发 onMounted，因此由 Rust 在显示时发事件通知：
  // 同步主窗写入的缓存（课表与展示周），并按需刷新（超过刷新间隔才真的拉数据）
  window.electronAPI?.onWindowShown(() => {
    auth.syncFromCache()
    auth.refreshIfStale()
  })
})
</script>

<template>
  <CourseSchedule
    compact
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
