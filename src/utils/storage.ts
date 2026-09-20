/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// 统一的本地持久化入口：所有键值读写都经过这里，避免各业务模块重复写 try/catch 与 JSON 编解码。
// 存储介质仍是 localStorage（主进程固定应用服务端口就是为了让 origin 稳定、数据可持久化），
// 不可用时退回内存，保证本次会话功能不中断。

const memoryFallback = new Map<string, string>()

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return memoryFallback.get(key) ?? null
  }
}

function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    memoryFallback.set(key, value)
  }
}

export function readStoredString(key: string): string | null {
  return readRaw(key)
}

export function writeStoredString(key: string, value: string): void {
  writeRaw(key, value)
}

// JSON 读取：缺失或解析失败都回退到默认值，不向调用方抛错
export function readStoredValue<T>(key: string, fallback: T): T {
  const raw = readRaw(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeStoredValue(key: string, value: unknown): void {
  try {
    writeRaw(key, JSON.stringify(value))
  } catch {
    // 忽略：序列化失败不影响功能
  }
}

export function removeStoredKey(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // 忽略：存储不可用时只需清理内存兜底
  }
  memoryFallback.delete(key)
}
