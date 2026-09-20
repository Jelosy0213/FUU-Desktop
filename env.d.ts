/// <reference types="vite/client" />

declare global {
  interface UpdateCheckResult {
    ok: boolean
    hasUpdate: boolean
    currentVersion?: string
    version?: string
    downloadUrl?: string
    releaseNotes?: string
    error?: string
  }

  interface Window {
    electronAPI?: {
      loginSuccess: (username?: string) => void
      logout: (explicit?: boolean) => void
      // 密码存于系统凭据库且不回传前端，故只有 remembers / username 两个只读入口
      credentials: {
        remembers: () => Promise<boolean>
        username: () => Promise<string | null>
        set: (data: { username: string; password: string }) => Promise<boolean>
        clear: () => Promise<boolean>
      }
      minimize: () => void
      maximize: () => void
      onMaximized: (callback: (maximized: boolean) => void) => void
      close: () => void
      enterMini: () => void
      exitMini: () => void
      showLogin: () => void
      setExplicitLogout: (enabled: boolean) => void
      setWindowMemory: (enabled: boolean) => void
      openForgotPassword: () => void
      // 当前窗口背景材质：'mica' 表示 Win11 云母已启用（需让出页面底色），否则为 'solid'
      backdrop: () => Promise<string>
      // 把设置里选定的主题同步给原生窗口（null = 交回系统）：云母按窗口主题着色，
      // 只切页面不切窗口会出现颜色错配
      setWindowTheme: (theme: 'light' | 'dark' | null) => void
      // 主题变化广播：通知所有窗口（含隐藏窗口）一起切换
      notifyThemeChanged: (theme: 'system' | 'light' | 'dark') => void
      onThemeChanged: (callback: (theme: string) => void) => void
      // 当前进程已有几个窗口（启动时用于判断本窗口是否为本次启动的第一个窗口）
      windowCount: () => Promise<number>
      // 展示周变化广播：通知所有窗口（含隐藏窗口）一起切换
      notifyWeekChanged: (week: number) => void
      onWeekChanged: (callback: (week: number) => void) => void
      // 迷你窗被重新显示时触发（窗口只隐藏不销毁，靠这个事件重新同步）
      onMiniShown: (callback: () => void) => void
      checkForUpdate: () => Promise<UpdateCheckResult>
      downloadUpdate: (url: string) => void
      onUpdateProgress: (callback: (data: { percent: number }) => void) => void
      onUpdateDone: (callback: (data: { status: 'completed' | 'failed'; reason?: string; path: string }) => void) => void
    }
  }
}

export {}
