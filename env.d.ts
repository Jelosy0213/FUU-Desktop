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
      checkForUpdate: () => Promise<UpdateCheckResult>
      downloadUpdate: (url: string) => void
      onUpdateProgress: (callback: (data: { percent: number }) => void) => void
      onUpdateDone: (callback: (data: { status: 'completed' | 'failed'; reason?: string; path: string }) => void) => void
    }
  }
}

export {}
