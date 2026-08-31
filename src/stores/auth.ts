/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { recognizeCaptchaFromUrl } from '../utils/captcha'

export interface CoursePeriod {
  number: number
  time: string
  segment: string
}

export interface CourseItem {
  name: string
  teacher: string
  location: string
  weeks: string
  day: number
  start: number
  end: number
  single?: boolean
  double?: boolean
}

export interface CourseResult {
  title?: string
  semester?: string
  terms?: string[]
  periods?: CoursePeriod[]
  courses?: CourseItem[]
  htmlLength?: number
  snippet?: string
}

export interface ExamItem {
  name: string
  date: string
  time: string
  location: string
  seat: string
  type: string
  teacher?: string
  raw?: string[]
}

export interface ExamResult {
  title?: string
  exams?: ExamItem[]
  htmlLength?: number
  snippet?: string
}

// 个人信息（学历信息模块）：键为中文标签，值为对应字段文本
export interface ProfileInfo {
  学号?: string
  姓名?: string
  性别?: string
  出生日期?: string
  民族?: string
  政治面貌?: string
  年级?: string
  学院名称?: string
  专业名称?: string
  学制?: string
  培养层次?: string
  入学日期?: string
}

export interface SchoolTerm {
  term: string
  startDate: string
  endDate: string
}

export interface SchoolCalendar {
  currentTerm: string
  terms: SchoolTerm[]
}

// 主动退出标记由主进程持久化（auth:set-explicit-logout IPC），启动时据此决定直接打开主窗口还是登录窗

interface UISettings {
  courseCardMotion: boolean
  // 启动时记忆窗口：默认开启，重启后恢复上次窗口模式（小窗/大窗）
  windowMemory: boolean
}

// UI 设置缓存
const UI_SETTINGS_CACHE_KEY = 'fzu_ui_settings'

function readUISettings(): UISettings {
  try {
    const raw = localStorage.getItem(UI_SETTINGS_CACHE_KEY)
    if (!raw) return { courseCardMotion: false, windowMemory: true }
    const parsed = JSON.parse(raw) as Partial<UISettings>
    return {
      courseCardMotion: parsed.courseCardMotion ?? false,
      windowMemory: parsed.windowMemory ?? true,
    }
  } catch {
    return { courseCardMotion: false, windowMemory: true }
  }
}

function writeUISettings(settings: UISettings) {
  try {
    localStorage.setItem(UI_SETTINGS_CACHE_KEY, JSON.stringify(settings))
  } catch {
    // 忽略：写入失败不影响功能
  }
}

// 校历缓存：学期起止日期极少变动，登录后获取一次，7 天内直接读缓存
const SCHOOL_CALENDAR_CACHE_KEY = 'fzu_school_calendar_cache'
const AUTH_SESSION_KEY = 'fzu_auth_session'
const SCHOOL_CALENDAR_TTL = 7 * 24 * 60 * 60 * 1000
// 静默重新登录重试次数：验证码模板匹配识别偶有误差，给足重试机会
const SILENT_RELOGIN_ATTEMPTS = 3

interface SchoolCalendarCache {
  savedAt: number
  data: SchoolCalendar
}

function readSchoolCalendarCache(): SchoolCalendarCache | null {
  try {
    const raw = localStorage.getItem(SCHOOL_CALENDAR_CACHE_KEY)
    return raw ? (JSON.parse(raw) as SchoolCalendarCache) : null
  } catch {
    return null
  }
}

function writeSchoolCalendarCache(data: SchoolCalendar) {
  try {
    localStorage.setItem(SCHOOL_CALENDAR_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }))
  } catch {
    // 忽略：缓存写入失败不影响功能
  }
}

// 课表/考试/周数/学期缓存：主窗口直开时先展示上次数据，后台登录成功后刷新，提升打开体感
const COURSE_CACHE_KEY = 'fzu_course_cache'

interface CourseCache {
  username: string
  courseResult: CourseResult | null
  examResult: ExamResult | null
  currentWeek: number | null
  selectedTerm: string | null
  courseWeek: number | null
}

// 仅对同一账号恢复缓存，避免不同用户串数据
function readCourseCache(username: string): CourseCache | null {
  try {
    const raw = localStorage.getItem(COURSE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CourseCache
    return parsed.username === username ? parsed : null
  } catch {
    return null
  }
}

function writeCourseCache(data: CourseCache) {
  try {
    localStorage.setItem(COURSE_CACHE_KEY, JSON.stringify(data))
  } catch {
    // 忽略：缓存写入失败不影响功能
  }
}

export const useAuthStore = defineStore('auth', () => {
  const savedSession = localStorage.getItem(AUTH_SESSION_KEY)
  const username = ref(savedSession || '')
  const loggedIn = ref(Boolean(savedSession))
  const courseLoading = ref(false)
  const examLoading = ref(false)
  // 恢复上次课表数据：主窗口直开时立即渲染，后台登录后由刷新结果覆盖
  const courseCache = readCourseCache(savedSession || '')
  const courseResult = ref<CourseResult | null>(courseCache?.courseResult || null)
  const examResult = ref<ExamResult | null>(courseCache?.examResult || null)
  const profile = ref<ProfileInfo | null>(null)
  const profileLoading = ref(false)
  const currentWeek = ref<number | null>(courseCache?.currentWeek ?? null)
  const schoolCalendar = ref<SchoolCalendar | null>(readSchoolCalendarCache()?.data || null)
  const selectedTerm = ref<string | null>(courseCache?.selectedTerm ?? null)
  // 当前展示周：记录用户看到的周数，缩放小窗/重启后继承
  const courseWeek = ref<number | null>(courseCache?.courseWeek ?? null)
  const uiSettings = ref<UISettings>(readUISettings())
  const toastMessage = ref('')
  const toastType = ref<'success' | 'error' | 'info'>('info')
  // 会话已过期：静默重新登录失败后置位，触发重新登录面板
  const sessionExpired = ref(false)
  // 静默重新登录进行中标记：避免心跳/课表请求并发触发重复登录
  let reloginInFlight = false

  let toastTimer: ReturnType<typeof setTimeout> | undefined

  function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    toastMessage.value = message
    toastType.value = type
    if (toastTimer) {
      clearTimeout(toastTimer)
    }
    toastTimer = setTimeout(() => {
      toastMessage.value = ''
    }, 2600)
  }

  function setCourseCardMotion(enabled: boolean) {
    uiSettings.value = { ...uiSettings.value, courseCardMotion: enabled }
    writeUISettings(uiSettings.value)
  }

  // 启动时记忆窗口开关：本地持久化 + 同步主进程（启动时由主进程决定开大窗还是小窗）
  function setWindowMemory(enabled: boolean) {
    uiSettings.value = { ...uiSettings.value, windowMemory: enabled }
    writeUISettings(uiSettings.value)
    window.electronAPI?.setWindowMemory(enabled)
  }

  // 将当前课表/考试/周数/学期写入缓存，供下次启动即时展示
  function persistCourseCache() {
    if (!username.value) return
    writeCourseCache({
      username: username.value,
      courseResult: courseResult.value,
      examResult: examResult.value,
      currentWeek: currentWeek.value,
      selectedTerm: selectedTerm.value,
      courseWeek: courseWeek.value,
    })
  }

  // 记录当前展示周（大窗/小窗切换周时调用），并持久化供另一窗口继承
  function setCourseWeek(week: number) {
    courseWeek.value = week
    persistCourseCache()
  }

  async function login(account: string, password: string, verifyCode: string, silent = false) {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: account.trim(),
        password,
        verifyCode: verifyCode.trim(),
      }),
    })
    const result = await response.json()
    if (!response.ok || !result.success) {
      throw new Error(result.message || '登录失败，请重试')
    }
    username.value = account.trim()
    loggedIn.value = true
    localStorage.setItem(AUTH_SESSION_KEY, username.value)
    sessionExpired.value = false
    // 登录成功即视为完整登录：清除主动退出标记，后续启动可继续自动登录
    window.electronAPI?.setExplicitLogout(false)
    await fetchCoursePage(silent)
  }

  // 会话过期后的静默重新登录：自动识别验证码并重登，全程不打扰用户。
  // 成功返回 true；失败（无保存凭据/识别或登录失败）返回 false，由调用方决定是否弹出重新登录面板
  async function trySilentRelogin(): Promise<boolean> {
    if (!loggedIn.value || reloginInFlight) return false
    reloginInFlight = true
    try {
      let remembered: { username: string; password: string } | null = null
      try {
        remembered = (await window.electronAPI?.credentials.get()) || null
      } catch {
        remembered = null
      }
      if (!remembered) return false
      for (let attempt = 0; attempt < SILENT_RELOGIN_ATTEMPTS; attempt++) {
        const answer = await recognizeCaptchaFromUrl(`/api/captcha?t=${Date.now()}`)
        if (answer == null) continue
        try {
          await login(remembered.username, remembered.password, answer, true)
          return true
        } catch {
          // 验证码识别有误或已失效：换新验证码重试
        }
      }
      return false
    } finally {
      reloginInFlight = false
    }
  }

  // 会话过期统一处理入口：先尝试静默重新登录，失败才弹出重新登录面板
  async function handleSessionExpired() {
    const ok = await trySilentRelogin()
    if (!ok) sessionExpired.value = true
  }

  // 进入应用时对当前课表进行一次拉取：会话有效直接刷新缓存课表；
  // 会话失效（代理返回"重新登录"）时由 fetchCoursePage 内部触发静默重登并重新拉取
  async function startupAutoLogin() {
    if (!loggedIn.value) return
    await fetchCoursePage(true)
  }

  function dismissSessionExpired() {
    sessionExpired.value = false
  }

  // 获取当前教学周（week.asp 代理），失败不阻塞课表加载
  async function fetchCurrentWeek() {
    try {
      const response = await fetch(
        `/api/locate-date?account=${encodeURIComponent(username.value)}`,
      )
      const result = await response.json()
      if (response.ok && result.success) {
        currentWeek.value = result.week
        persistCourseCache()
      }
    } catch {
      // 忽略：周数获取失败不影响课表展示
    }
  }

  // 获取校历（xl.asp 代理）：学期起止日期，用于推算"某周对应几月几号"
  // 登录后拉取一次并缓存到 localStorage（起止日期极少变动），之后直接读缓存
  async function fetchSchoolCalendar() {
    const cached = readSchoolCalendarCache()
    if (cached) {
      schoolCalendar.value = cached.data
      // 缓存未过期就直接用，不再请求
      if (Date.now() - cached.savedAt < SCHOOL_CALENDAR_TTL) {
        return
      }
    }
    try {
      const response = await fetch(
        `/api/school-calendar?account=${encodeURIComponent(username.value)}`,
      )
      const result = await response.json()
      if (response.ok && result.success) {
        const data = { currentTerm: result.currentTerm, terms: result.terms }
        schoolCalendar.value = data
        writeSchoolCalendarCache(data)
      }
    } catch {
      // 忽略：校历获取失败不影响课表展示（已有缓存则继续用缓存）
    }
  }

  async function fetchExamList(silent = false): Promise<boolean> {
    if (examLoading.value) return false
    examLoading.value = true
    try {
      const response = await fetch('/api/exam-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: username.value,
          ...(selectedTerm.value ? { term: selectedTerm.value } : {}),
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || '考试信息获取失败')
      examResult.value = result
      persistCourseCache()
      if (!silent) showToast('考试信息获取成功', 'success')
      return true
    } catch (error) {
      if (!silent) showToast(error instanceof Error ? error.message : '考试信息获取失败', 'error')
      return false
    } finally {
      examLoading.value = false
    }
  }

  // 获取个人信息（学历信息模块：学号/姓名/学院/年级等）
  async function fetchProfile(silent = false): Promise<boolean> {
    if (profileLoading.value) return false
    profileLoading.value = true
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: username.value }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || '个人信息获取失败')
      profile.value = result.profile
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : '个人信息获取失败'
      if (!silent) {
        if (/重新登录/.test(message)) {
          // 会话失效：先静默重新登录保活会话，再静默重试（成功则直接展示，失败交由重新登录面板兜底）
          await handleSessionExpired()
          profileLoading.value = false
          return await fetchProfile(true)
        }
        showToast(message, 'error')
      }
      return false
    } finally {
      profileLoading.value = false
    }
  }

  // 切换学期：记录所选学期并重新拉取对应课表
  async function selectTerm(term: string) {
    selectedTerm.value = term
    await fetchCoursePage()
    persistCourseCache()
  }

  // 课表请求串行化等待队列：并发请求全部排队、按序执行，避免被 courseLoading 锁直接丢弃。
  // 会话失效时先释放锁再触发重登，重登内部的课表拉取不会被本请求的锁挡住（见下方 needRelogin 处理）
  const courseFetchWaiters: Array<() => void> = []

  async function fetchCoursePage(silent = false): Promise<boolean> {
    if (courseLoading.value) {
      await new Promise<void>((resolve) => courseFetchWaiters.push(resolve))
      return fetchCoursePage(silent)
    }

    courseLoading.value = true
    // 注意：加载期间不清空 courseResult，刷新/切换学期时旧课表保留，避免整块闪烁
    fetchCurrentWeek()
    fetchSchoolCalendar()
    void fetchExamList(true)

    let ok = false
    let needRelogin = false
    try {
      const response = await fetch('/api/course-page', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account: username.value,
          ...(selectedTerm.value ? { term: selectedTerm.value } : {}),
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.message || '课表页面获取失败')
      }
      toastMessage.value = ''
      courseResult.value = result
      persistCourseCache()
      if (!silent) showToast('课表获取成功', 'success')
      ok = true
    } catch (error) {
      const message = error instanceof Error ? error.message : '课表页面获取失败'
      // 会话失效（代理返回"重新登录"）：静默/手动请求都触发重登，保证拉取最终生效
      if (/重新登录/.test(message)) needRelogin = true
      else if (!silent) showToast(message, 'error')
    } finally {
      courseLoading.value = false
      // 唤醒下一个排队请求
      courseFetchWaiters.shift()?.()
    }

    // 锁已释放后再处理会话失效：若在 catch 内等待重登，重登内部重新拉课表会排队等待
    // 本请求释放锁，而本请求又要等重登返回才释放，造成死锁
    if (needRelogin) {
      await handleSessionExpired()
      // 重登成功（未弹出重新登录面板）后重新拉取课表，保证本次操作真正生效
      if (!sessionExpired.value) return fetchCoursePage(silent)
      return false
    }
    return ok
  }

  // 静默校验残留登录会话是否仍有效（代理内存中的教务会话随进程退出清空）：
  // 有效返回 true；失效返回 false，由调用方决定是否清空本地登录态
  async function validateStoredSession(): Promise<boolean> {
    if (!loggedIn.value || !username.value) return false
    return await fetchCoursePage(true)
  }

  // explicit：是否主动退出登录（用户点击退出/切换账号）。
  // 主动退出会写入主进程标记，下次启动直接显示登录小窗；会话失效清理等非主动场景不写标记
  function logout(explicit = true) {
    loggedIn.value = false
    localStorage.removeItem(AUTH_SESSION_KEY)
    // 退出登录即清空课表缓存：重新登录时不读到上次的旧课表（新会话必须是干净状态）
    localStorage.removeItem(COURSE_CACHE_KEY)
    window.electronAPI?.logout(explicit)
    username.value = ''
    courseResult.value = null
    examResult.value = null
    profile.value = null
    currentWeek.value = null
    schoolCalendar.value = null
    selectedTerm.value = null
    toastMessage.value = ''
    sessionExpired.value = false
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = undefined
    }
  }

  return {
    username,
    loggedIn,
    courseLoading,
    examLoading,
    courseResult,
    examResult,
    profile,
    profileLoading,
    currentWeek,
    schoolCalendar,
    selectedTerm,
    courseWeek,
    setCourseWeek,
    uiSettings,
    setCourseCardMotion,
    setWindowMemory,
    toastMessage,
    toastType,
    showToast,
    sessionExpired,
    login,
    fetchCoursePage,
    fetchExamList,
    fetchProfile,
    fetchCurrentWeek,
    fetchSchoolCalendar,
    validateStoredSession,
    selectTerm,
    logout,
    dismissSessionExpired,
    startupAutoLogin,
  }
})
