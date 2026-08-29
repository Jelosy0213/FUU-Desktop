/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/LoginView.vue'
import ScheduleView from '../views/ScheduleView.vue'
import MiniScheduleView from '../views/MiniScheduleView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
      meta: { guestOnly: true },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: ForgotPasswordView,
    },
    {
      path: '/schedule',
      name: 'schedule',
      component: ScheduleView,
      meta: { requiresAuth: true },
    },
    {
      path: '/mini',
      name: 'mini',
      component: MiniScheduleView,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.loggedIn) {
    // 窗口内无登录会话（迷你/主窗口均可能）：让主进程关闭当前窗口并打开登录小窗，
    // 避免登录页渲染在大窗或迷你窗里
    window.electronAPI?.showLogin()
    return { name: 'login' }
  }
  // 注意：guestOnly（登录页）不在此拦截。重启后 localStorage 残留会话，
  // 但代理内存中的教务会话已清空，是否有效由 LoginView 挂载时静默校验：
  // 有效 → 通知主进程打开主窗口；失效 → 清空本地登录态，正常显示登录页
})

export default router
