/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { invoke } from '@tauri-apps/api/core'
import { requestWithPolicy } from '../utils/requestCenter'
import type { CourseResult, ExamResult, ProfileInfo, SchoolCalendar } from '../types/fzu'

// Tauri 环境通过 __TAURI_INTERNALS__ 检测；纯浏览器（npm run dev:web）回退到本地代理 fetch
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

interface LoginOutcome {
  success: boolean
  message: string
  status?: number
}

interface CaptchaData {
  mime: string
  base64: string
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

// ===== fetch 回退（纯浏览器 dev） =====
interface ApiEnvelope {
  success?: boolean
  message?: string
}

async function requestJson<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(path, init)
  const payload = (await response.json().catch(() => null)) as (T & ApiEnvelope) | null
  if (!response.ok) {
    throw new Error(`${payload?.message || fallback}（HTTP ${response.status}）`)
  }
  if (!payload?.success) {
    throw new Error(payload?.message || fallback)
  }
  return payload
}

function post<T>(path: string, body: unknown, fallback: string, label: string): Promise<T> {
  return requestWithPolicy(
    label,
    () =>
      requestJson<T>(path, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) }, fallback),
  )
}

function get<T>(path: string, fallback: string, label: string): Promise<T> {
  return requestWithPolicy(label, () => requestJson<T>(path, { method: 'GET' }, fallback))
}

// ===== Tauri invoke =====
function invokeNative<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return requestWithPolicy(cmd, () => invoke<T>(cmd, args))
}

function termBody(account: string, term?: string | null): Record<string, string> {
  return term ? { account, term } : { account }
}

export const fzuApi = {
  // 教务登录：失败抛出带服务端 message 的异常
  async login(username: string, password: string, verifyCode: string): Promise<void> {
    if (isTauri) {
      const result = await invokeNative<LoginOutcome>('login', { username, password, verifyCode })
      if (!result.success) throw new Error(result.message)
      return
    }
    await post('/api/login', { username, password, verifyCode }, '登录失败，请重试', '登录')
  },

  // 用系统凭据库中保存的账号密码重新登录：密码在 Rust 侧读取使用，前端只提供验证码答案
  async reloginWithRemembered(verifyCode: string): Promise<void> {
    if (!isTauri) {
      throw new Error('重新登录仅支持桌面端')
    }
    const result = await invokeNative<LoginOutcome>('relogin_with_remembered', {
      verifyCode,
    })
    if (!result.success) throw new Error(result.message)
  },

  // 验证码：Tauri 下返回 data URL，纯浏览器下返回代理 URL
  async getCaptcha(account: string): Promise<string> {
    if (isTauri) {
      const data = await invokeNative<CaptchaData>('get_captcha', { account })
      return `data:${data.mime};base64,${data.base64}`
    }
    return `/api/captcha?t=${Date.now()}&account=${encodeURIComponent(account)}`
  },

  async getCoursePage(account: string, term?: string | null): Promise<CourseResult> {
    if (isTauri) {
      return await invokeNative<CourseResult>('get_course_page', { account, term })
    }
    return await post<CourseResult>(
      '/api/course-page',
      termBody(account, term),
      '课表页面获取失败',
      '课表',
    )
  },

  async getExamList(account: string, term?: string | null): Promise<ExamResult> {
    if (isTauri) {
      return await invokeNative<ExamResult>('get_exam_list', { account, term })
    }
    return await post<ExamResult>(
      '/api/exam-list',
      termBody(account, term),
      '考试信息获取失败',
      '考试信息',
    )
  },

  async getProfile(account: string): Promise<ProfileInfo> {
    if (isTauri) {
      return await invokeNative<ProfileInfo>('get_profile', { account })
    }
    const data = await post<{ profile: ProfileInfo }>(
      '/api/profile',
      { account },
      '个人信息获取失败',
      '个人信息',
    )
    return data.profile
  },

  async getCurrentWeek(account: string): Promise<number> {
    if (isTauri) {
      const data = await invokeNative<{ week: number }>('get_locate_date', { account })
      return data.week
    }
    const data = await get<{ week: number }>(
      `/api/locate-date?account=${encodeURIComponent(account)}`,
      '获取教学周失败',
      '教学周',
    )
    return data.week
  },

  async getSchoolCalendar(account: string): Promise<SchoolCalendar> {
    if (isTauri) {
      return await invokeNative<SchoolCalendar>('get_school_calendar', { account })
    }
    const data = await get<SchoolCalendar>(
      `/api/school-calendar?account=${encodeURIComponent(account)}`,
      '获取校历失败',
      '校历',
    )
    return { currentTerm: data.currentTerm, terms: data.terms }
  },
}
