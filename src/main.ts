/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router, { routeForLabel } from './router'
import './styles/index.css'
import { electronAPI } from './utils/desktop'
import { applyTheme, watchSystemTheme } from './utils/theme'
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

// 主题：首屏的 <html data-theme> 已由 index.html 的内联脚本写好（避免闪白），
// 这里按持久化的偏好再同步一次，并接管运行期——"系统"档需要监听系统主题变化后重新解析；
// 另一窗口改主题时会广播过来，同样要跟上
const auth = useAuthStore(pinia)
applyTheme(auth.uiSettings.theme)
watchSystemTheme(() => auth.uiSettings.theme)
window.electronAPI?.onThemeChanged((theme) => auth.applyRemoteTheme(theme))

async function bootstrap() {
  const label = isTauri ? getCurrentWindow().label : ''
  const target = routeForLabel(label)

  // 背景材质：Win11 主窗口启用了 Mica 云母，页面必须让出底色，否则会把云母完全盖住。
  // 在挂载前写好 <html data-backdrop>，避免先渲染成不透明再切换的闪动。
  let backdrop = 'solid'
  try {
    backdrop = (await window.electronAPI?.backdrop?.()) || 'solid'
  } catch {
    backdrop = 'solid'
  }
  document.documentElement.dataset.backdrop = backdrop

  // 本窗口是不是"本次启动的第一个窗口"：是 → 课表定位到本周；否则继承当前展示周。
  // 同样在挂载前问好，课表组件才能同步读到结果。
  let firstWindow = false
  try {
    firstWindow = (await window.electronAPI?.windowCount?.()) === 1
  } catch {
    firstWindow = false
  }
  useAuthStore(pinia).sessionFirstWindow = firstWindow

  // 初始路由已在 router/index.ts 里通过设置 hash 定好（必须在 createRouter 之前），
  // 所以这里正常不需要再导航，也不会先挂载错页面——之前正是"迷你窗先挂载一次登录页"
  // 导致登录页校验会话后调用 loginSuccess()，把已隐藏的主窗口又唤了出来。
  app.mount('#app')

  // 兜底：万一 hash 没生效，挂载后再切一次。
  // 不要在 mount 之前 replace：首次更新时 Vue 会抛
  // "Cannot read properties of null (reading 'emitsOptions')"，标题栏插槽所在区块的
  // 子节点补丁会中断，表现为顶部课表工具栏完全不渲染。
  if (target && router.currentRoute.value.path !== target) {
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
