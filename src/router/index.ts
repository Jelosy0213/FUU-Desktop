/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/LoginView.vue'
import ScheduleView from '../views/ScheduleView.vue'
import MiniScheduleView from '../views/MiniScheduleView.vue'

// 各窗口共用同一份 index.html，初始路由由窗口 label 决定
// （忘记密码窗直接加载教务处页面，不经过这里）
export function routeForLabel(label: string): string | null {
  switch (label) {
    case 'main':
      return '/schedule'
    case 'mini':
      return '/mini'
    default:
      return null
  }
}

// 必须在 createRouter 之前把 hash 设成目标路由。
// 否则每个窗口的 hash 都是空的：路由先解析成登录页，登录页挂载时会校验会话并调用
// loginSuccess()（→ show_main），把刚切到迷你模式后已隐藏的主窗口又唤出来，
// 表现为"主窗口隐藏后又出现"。
// 这里只改初始 URL，不涉及挂载后的导航，因此不会踩 README 里记录的
// "mount 之前 router.replace 导致 emitsOptions 报错" 那个坑。
const windowLabel =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? getCurrentWindow().label : ''
const initialRoute = routeForLabel(windowLabel)
if (initialRoute && window.location.hash !== `#${initialRoute}`) {
  window.location.hash = initialRoute
}

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
