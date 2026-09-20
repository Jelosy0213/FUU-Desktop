/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { describe, expect, it } from 'vitest'

import { getErrorMessage } from '../errors'

describe('getErrorMessage', () => {
  it('保留以字符串形式抛出的错误信息', () => {
    expect(getErrorMessage('会话已失效，请重新登录', '请求失败')).toBe('会话已失效，请重新登录')
  })

  it('从 Error 实例中取出 message', () => {
    expect(getErrorMessage(new Error('本地代理服务不可用'), '请求失败')).toBe('本地代理服务不可用')
  })

  it('对无法提取信息的抛出物回退到默认文案', () => {
    expect(getErrorMessage(null, '请求失败')).toBe('请求失败')
    expect(getErrorMessage({}, '请求失败')).toBe('请求失败')
  })
})
