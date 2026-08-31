/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { reactive } from 'vue'
import { useAuthStore } from '../stores/auth'

// "不再提示"记录的版本号：只对同一版本生效，新版本到来时会再次提醒
const DISMISS_KEY = 'fzu_update_dismissed_version'

export interface UpdateInfo {
  version: string
  downloadUrl: string
  releaseNotes: string
}

interface UpdateState {
  visible: boolean
  checking: boolean
  manual: boolean
  info: UpdateInfo | null
  downloading: boolean
  progress: number
  downloaded: boolean
  downloadPath: string
  error: string
}

export const updateState = reactive<UpdateState>({
  visible: false,
  checking: false,
  manual: false,
  info: null,
  downloading: false,
  progress: 0,
  downloaded: false,
  downloadPath: '',
  error: '',
})

function isDismissed(version: string): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === version
  } catch {
    return false
  }
}

/**
 * 检查更新。manual 为 true 表示用户在设置页手动触发：
 * - 自动检查（进入主页面）：无更新或已勾选"不再提示"时不打扰用户；
 * - 手动检查：无论结果都给出提示。
 */
export async function checkForUpdate(manual = false) {
  if (updateState.checking) return
  const auth = useAuthStore()
  updateState.checking = true
  updateState.error = ''
  try {
    const result = await window.electronAPI?.checkForUpdate()
    if (!result?.ok) {
      if (manual) auth.showToast(result?.error || '检查更新失败', 'error')
      return
    }
    if (!result.hasUpdate || !result.version || !result.downloadUrl) {
      if (manual) {
        // 已是最新：明确给出当前与线上版本号，避免"点检查更新没反应"的困惑
        auth.showToast(
          result.version
            ? `已是最新版本（当前 v${result.currentVersion || '?'} / 线上 v${result.version}）`
            : '已是最新版本',
          'success',
        )
      }
      return
    }
    if (!manual && isDismissed(result.version)) return
    updateState.info = {
      version: result.version,
      downloadUrl: result.downloadUrl,
      releaseNotes: result.releaseNotes || '',
    }
    updateState.manual = manual
    updateState.downloading = false
    updateState.progress = 0
    updateState.downloaded = false
    updateState.downloadPath = ''
    updateState.visible = true
  } finally {
    updateState.checking = false
  }
}

/** 点击"更新"：开始下载更新包并监听进度/完成事件 */
export function startDownload() {
  const info = updateState.info
  if (!info?.downloadUrl || updateState.downloading) return
  updateState.downloading = true
  updateState.progress = 0
  updateState.downloaded = false
  updateState.error = ''
  window.electronAPI?.downloadUpdate(info.downloadUrl)
}

/**
 * 关闭弹窗。remindLater 为 true 表示用户勾选了"不再提示"：
 * 记录当前可用版本号，之后自动检查对该版本不再提醒（手动检查仍会展示）。
 */
export function closeUpdate(noReminder: boolean) {
  const info = updateState.info
  if (noReminder && info) {
    try {
      localStorage.setItem(DISMISS_KEY, info.version)
    } catch {
      // 忽略：本地存储失败不影响功能
    }
  }
  updateState.visible = false
}

// 下载进度与完成事件：模块加载时注册一次（单例）
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.onUpdateProgress(({ percent }) => {
    updateState.progress = percent
  })
  window.electronAPI.onUpdateDone(({ status, path, reason }) => {
    updateState.downloading = false
    if (status === 'completed') {
      updateState.downloaded = true
      updateState.downloadPath = path || ''
      updateState.progress = 100
    } else {
      updateState.error = reason === 'interrupted' ? '下载中断，请检查网络后重试' : '下载失败，请重试'
    }
  })
}
