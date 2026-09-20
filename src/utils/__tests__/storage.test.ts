/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  readStoredString,
  readStoredValue,
  removeStoredKey,
  writeStoredString,
  writeStoredValue,
} from '../storage'

afterEach(() => {
  window.localStorage.clear()
})

describe('storage', () => {
  it('按 JSON 读写对象', () => {
    writeStoredValue('demo', { week: 7 })
    expect(readStoredValue<{ week: number } | null>('demo', null)).toEqual({ week: 7 })
  })

  it('键不存在时返回默认值', () => {
    expect(readStoredValue('missing', 'fallback')).toBe('fallback')
  })

  it('内容损坏时返回默认值', () => {
    window.localStorage.setItem('broken', '{not json')
    expect(readStoredValue('broken', 'fallback')).toBe('fallback')
  })

  it('原样读写字符串，不额外加引号', () => {
    writeStoredString('session', '2021001')
    expect(window.localStorage.getItem('session')).toBe('2021001')
    expect(readStoredString('session')).toBe('2021001')
  })

  it('删除后读取返回默认值', () => {
    writeStoredValue('demo', 1)
    removeStoredKey('demo')
    expect(readStoredValue<number | null>('demo', null)).toBeNull()
  })
})
