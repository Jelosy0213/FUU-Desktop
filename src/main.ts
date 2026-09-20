/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import './styles/index.css'
import { electronAPI } from './utils/desktop'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useAuthStore } from './stores/auth'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// 注入 Tauri 版 electronAPI，前端组件沿用 window.electronAPI 调用
if (isTauri) {
  window.electronAPI = electronAPI
}

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// 各窗口都加载同一份 index.html，靠窗口 label 决定初始路由
// （忘记密码窗直接加载教务处页面，不经过这里）
function routeForLabel(label: string): string | null {
  switch (label) {
    case 'main':
      return '/schedule'
    case 'mini':
      return '/mini'
    default:
      return null
  }
}

async function bootstrap() {
  const label = isTauri ? getCurrentWindow().label : ''
  const target = routeForLabel(label)

  // 必须先挂载、再切换初始路由。
  // 若在 mount 之前调用 router.replace()，首次更新时 Vue 会抛
  // "Cannot read properties of null (reading 'emitsOptions')"（shouldUpdateComponent 读到空组件实例），
  // 该元素（标题栏插槽所在区块）的子节点补丁随即中断，表现为顶部课表工具栏完全不渲染。
  // 挂载后导航发生在微任务内、早于下一帧绘制，因此不会闪现登录页。
  app.mount('#app')

  if (target) {
    await router.replace(target)
  }

  // 挂载后处理"窗口尺寸与登录态不匹配"：
  // Rust 端仅依据本地凭据文件决定启动哪个窗口，而登录会话存在 localStorage（按 origin 隔离）。
  // 开发态（http://127.0.0.1:5173）与安装态（http://tauri.localhost）origin 不同，
  // 会出现"有凭据但无会话"——此时主窗/迷你窗不能用来显示登录页，交给 Rust 切回登录小窗。
  if ((label === 'main' || label === 'mini') && !useAuthStore(pinia).loggedIn) {
    window.electronAPI?.showLogin()
  }
}

// 启动失败时给出控制台错误：否则窗口会停在空白页且没有任何线索
bootstrap().catch((error) => {
  console.error('[bootstrap] 初始化失败：', error)
})
