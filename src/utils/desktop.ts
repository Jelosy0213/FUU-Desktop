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
  // 把主题同步给原生窗口：云母是 DWM 按窗口主题着色的，只切页面不切窗口会颜色错配
  setWindowTheme: (theme: 'light' | 'dark' | null) => {
    void invoke('set_window_theme', { theme })
  },
  // 主题变化广播：通知所有窗口（含隐藏窗口）一起切换
  notifyThemeChanged: (theme: 'system' | 'light' | 'dark') => {
    void invoke('notify_theme_changed', { theme })
  },
  onThemeChanged: (callback: (theme: string) => void) => {
    const win = getCurrentWindow()
    void win.listen<string>('theme-changed', (event) => callback(event.payload))
  },
  // 当前进程已有几个窗口：启动时用它判断本窗口是不是"本次启动的第一个窗口"
  windowCount: () => invoke<number>('window_count'),
  // 展示周变化：广播给所有窗口，让隐藏着的另一窗口一起切换
  notifyWeekChanged: (week: number) => {
    void invoke('notify_week_changed', { week })
  },
  onWeekChanged: (callback: (week: number) => void) => {
    const win = getCurrentWindow()
    void win.listen<number>('week-changed', (event) => callback(event.payload))
  },
  // 迷你窗被重新显示（进入迷你模式）时触发：窗口只隐藏不销毁，需要靠这个事件重新同步
  onMiniShown: (callback: () => void) => {
    const win = getCurrentWindow()
    void win.listen('mini-shown', () => callback())
  },
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
  // 简化更新：不再后台下载，改为打开浏览器下载页（完整自动更新留待 tauri-plugin-updater）
  downloadUpdate: (url: string) => {
    void invoke('open_url', { url })
  },
  onUpdateProgress: () => {},
  onUpdateDone: () => {},
}
