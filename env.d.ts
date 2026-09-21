/// <reference types="vite/client" />

declare global {
  // 由 vite 在构建时从 src-tauri/tauri.conf.json 注入的应用版本（见 vite.config.ts）
  const __APP_VERSION__: string

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
      // 展示周变化广播：通知所有窗口（含隐藏窗口）一起切换
      notifyWeekChanged: (week: number) => void
      onWeekChanged: (callback: (week: number) => void) => void
      // 本窗口被重新显示时触发（窗口只隐藏不销毁，靠这个事件重新同步）
      onWindowShown: (callback: () => void) => void
      // 本窗口当前是否可见：隐藏的窗口启动时不主动拉数据
      isWindowVisible: () => Promise<boolean>
      checkForUpdate: () => Promise<UpdateCheckResult>
      downloadAndInstall: (url: string) => Promise<void>
      onUpdateProgress: (callback: (data: { percent: number }) => void) => void
      onUpdateDone: (callback: (data: { status: 'completed' | 'failed'; reason?: string; path: string }) => void) => void
    }

    // 由 Rust 在创建窗口时注入（见 src-tauri 的 FIRST_WINDOW_SCRIPT）：
    // 本次启动的第一个窗口为 true，同批预建的另一个窗口没有这个属性（undefined）
    __FUU_FIRST_WINDOW__?: boolean
  }
}

export {}
