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

onMounted(() => {
  // 迷你窗口：从缓存课表立即展示，后台静默恢复会话并刷新数据
  if (auth.loggedIn) void auth.startupAutoLogin()

  // 迷你窗只隐藏、不销毁，"重新显示"不会再触发 onMounted，因此由 Rust 在显示时发事件通知：
  // 同步主窗写入的缓存（课表与展示周），并按需刷新（超过刷新间隔才真的拉数据）
  window.electronAPI?.onMiniShown(() => {
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
