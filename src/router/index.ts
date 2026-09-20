/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/LoginView.vue'
import ScheduleView from '../views/ScheduleView.vue'
import MiniScheduleView from '../views/MiniScheduleView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
      meta: { guestOnly: true },
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
    // 只做重定向，不在这里切换窗口：路由守卫执行于应用挂载之前，
    // 若在此关闭当前窗口，后续的 app.mount() 永远不会执行，窗口会停在白屏。
    // 窗口切换统一交由 main.ts 在挂载完成后处理。
    return { name: 'login' }
  }
  // 注意：guestOnly（登录页）不在此拦截。重启后 localStorage 残留会话，
  // 但 Rust 端内存中的教务会话已清空，是否有效由 LoginView 挂载时静默校验：
  // 有效 → 通知主进程打开主窗口；失效 → 清空本地登录态，正常显示登录页
})

export default router
