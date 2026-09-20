/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// 从任意抛出物中取出可展示的错误文本：代理可能以字符串或 { message } 形式返回错误
export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim()
    if (message) return message
  }
  return fallback
}
