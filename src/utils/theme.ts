/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// 主题偏好：system 跟随系统实时切换，light / dark 为手动固定
export type ThemePreference = 'system' | 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function prefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

// 把偏好解析成实际生效的 light / dark 写到 <html data-theme>。
// CSS 只认这个属性（见 styles/tokens.css），所以“系统”档在系统主题变化时
// 也必须重新解析并写回，光靠 CSS 媒体查询是不够的。
export function applyTheme(preference: ThemePreference) {
  const resolved = preference === 'system' ? (prefersDark() ? 'dark' : 'light') : preference
  document.documentElement.dataset.theme = resolved
  // 原生窗口也要一起切：云母与原生装饰由 DWM 按**窗口主题**着色，
  // 只改页面会让深色界面压在浅色云母上（"系统"档传 null，交回系统决定）
  window.electronAPI?.setWindowTheme(preference === 'system' ? null : preference)
}

// 监听系统主题变化：仅“系统”档需要跟随。返回取消监听的函数
export function watchSystemTheme(getPreference: () => ThemePreference) {
  const media = window.matchMedia(DARK_QUERY)
  const handleChange = () => {
    if (getPreference() === 'system') applyTheme('system')
  }
  media.addEventListener('change', handleChange)
  return () => media.removeEventListener('change', handleChange)
}
