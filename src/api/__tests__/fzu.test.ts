/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fzuApi } from '../fzu'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

const fetchMock = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('fzuApi', () => {
  it('课表请求携带账号与学期，并返回业务数据', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, courses: [{ name: '高等数学' }] }))

    const result = await fzuApi.getCoursePage('2021001', '2024-2025-1')

    expect(result.courses?.[0]?.name).toBe('高等数学')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]!
    expect(call[0]).toBe('/api/course-page')
    expect(JSON.parse(String(call[1]?.body))).toEqual({ account: '2021001', term: '2024-2025-1' })
  })

  it('未选学期时请求体只包含账号', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, courses: [] }))

    await fzuApi.getCoursePage('2021001')

    const call = fetchMock.mock.calls[0]!
    expect(JSON.parse(String(call[1]?.body))).toEqual({ account: '2021001' })
  })

  it('业务失败时抛出服务端 message，且不重试', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, message: '账号或密码错误' }))

    await expect(fzuApi.login('2021001', 'pwd', '1234')).rejects.toThrow('账号或密码错误')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('个人信息从响应信封中取出 profile 字段', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, profile: { 学号: '2021001' } }))

    const profile = await fzuApi.getProfile('2021001')

    expect(profile.学号).toBe('2021001')
  })

  it('教学周返回纯数值', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, week: 7 }))

    await expect(fzuApi.getCurrentWeek('2021001')).resolves.toBe(7)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/locate-date?account=2021001')
  })
})
