/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

// Tauri 版本的 window.electronAPI 实现：把原 Electron preload 暴露的能力
// 映射到 Tauri invoke 命令，前端组件无需改动调用方式。
// 由 main.ts 在应用挂载前注入 window.electronAPI。

interface Credentials {
  username: string
  password: string
}

interface UpdateCheckResult {
  ok: boolean
  hasUpdate: boolean
  currentVersion?: string
  version?: string
  downloadUrl?: string
  releaseNotes?: string
  error?: string
}

export const electronAPI = {
  loginSuccess: () => {
    void invoke('set_explicit_logout', { enabled: false })
    void invoke('show_main')
  },
  logout: (explicit?: boolean) => {
    if (explicit) void invoke('set_explicit_logout', { enabled: true })
    void invoke('show_login')
  },
  // 账号密码存放在系统凭据库，密码只允许 Rust 侧读取：
  // 前端只能问"是否存过凭据"和"存的是哪个账号"，重新登录走 relogin_with_remembered
  credentials: {
    remembers: () => invoke<boolean>('remembers_credentials'),
    username: () => invoke<string | null>('remembered_username'),
    set: (data: Credentials) =>
      invoke<boolean>('credentials_set', { username: data.username, password: data.password }),
    clear: () => invoke<boolean>('credentials_clear'),
  },
  minimize: () => {
    void invoke('window_minimize')
  },
  maximize: () => {
    void invoke('window_toggle_maximize')
  },
  onMaximized: (callback: (maximized: boolean) => void) => {
    const win = getCurrentWindow()
    void win.onResized(async () => {
      callback(await win.isMaximized())
    })
  },
  close: () => {
    void invoke('window_close')
  },
  enterMini: () => {
    void invoke('enter_mini')
  },
  exitMini: () => {
    void invoke('exit_mini')
  },
  showLogin: () => {
    void invoke('show_login')
  },
  setExplicitLogout: (enabled: boolean) => {
    void invoke('set_explicit_logout', { enabled })
  },
  setWindowMemory: (enabled: boolean) => {
    void invoke('set_window_memory', { enabled })
  },
  openForgotPassword: () => {
    void invoke('open_forgot')
  },
  // 当前窗口的背景材质：mica 表示 Win11 云母已启用，页面需要让出底色（styles/backdrop.css）
  backdrop: () => invoke<string>('window_backdrop'),
  // 展示周变化：广播给所有窗口，让隐藏着的另一窗口一起切换
  notifyWeekChanged: (week: number) => {
    void invoke('notify_week_changed', { week })
  },
  onWeekChanged: (callback: (week: number) => void) => {
    const win = getCurrentWindow()
    void win.listen<number>('week-changed', (event) => callback(event.payload))
  },
  // 本窗口被重新显示时触发（窗口只隐藏不销毁，靠这个事件重新同步缓存并按需刷新）
  onWindowShown: (callback: () => void) => {
    const win = getCurrentWindow()
    void win.listen('window-shown', () => callback())
  },
  // 本窗口当前是否可见：隐藏的窗口启动时不主动拉数据，等 window-shown
  isWindowVisible: () => invoke<boolean>('is_window_visible'),
  checkForUpdate: async (): Promise<UpdateCheckResult> => {
    try {
      return await invoke<UpdateCheckResult>('check_update')
    } catch (error) {
      return {
        ok: false,
        hasUpdate: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
  // 应用内下载更新包并静默安装：失败时 reject，由调用方把原因显示出来
  downloadAndInstall: (url: string) => invoke<void>('download_and_install', { url }),
  onUpdateProgress: (callback: (data: { percent: number }) => void) => {
    const win = getCurrentWindow()
    void win.listen<{ percent: number }>('update-progress', (event) => callback(event.payload))
  },
  onUpdateDone: (
    callback: (data: { status: 'completed' | 'failed'; reason?: string; path: string }) => void,
  ) => {
    const win = getCurrentWindow()
    void win.listen<{ status: 'completed' | 'failed'; reason?: string; path: string }>(
      'update-done',
      (event) => callback(event.payload),
    )
  },
}
