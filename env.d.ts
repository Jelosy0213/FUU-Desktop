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
      credentials: {
        get: () => Promise<{ username: string; password: string } | null>
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
