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

onMounted(() => {
  // 有登录态时启动后台自动登录：先展示缓存课表，无感恢复代理会话并刷新数据
  if (auth.loggedIn) void auth.startupAutoLogin()
  // 进入主页面后检查更新：无更新或已勾选"不再提示"时不打扰用户
  void checkForUpdate(false)
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
