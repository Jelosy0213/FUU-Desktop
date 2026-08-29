/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { CourseItem, CoursePeriod, CourseResult, ExamItem, ExamResult, SchoolCalendar } from '../stores/auth'
import { useAuthStore } from '../stores/auth'
import SettingsView from './SettingsView.vue'
import ProfileView from './ProfileView.vue'
import avatarImg from '../image/avatar.jpg'

const props = defineProps<{
  courseLoading: boolean
  courseResult: CourseResult | null
  examLoading: boolean
  examResult: ExamResult | null
  currentWeek: number | null
  schoolCalendar: SchoolCalendar | null
  selectedTerm: string | null
  // 迷你模式：隐藏导航栏、学期切换、刷新按钮，工具栏内联显示
  compact?: boolean
}>()

const emit = defineEmits<{
  refresh: []
  changeTerm: [term: string]
}>()

const auth = useAuthStore()
const { username } = storeToRefs(auth)

const dayNames = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']

const periods = computed<CoursePeriod[]>(() => props.courseResult?.periods || [])
const courses = computed<CourseItem[]>(() => props.courseResult?.courses || [])
const exams = computed<ExamItem[]>(() => props.examResult?.exams || [])
const hasCourses = computed(() => courses.value.length > 0)
const hasExams = computed(() => exams.value.length > 0)
const mainNavItems = [
  { key: 'schedule', label: '课表', icon: 'grid' },
  { key: 'study', label: '学业', icon: 'book' },
] as const
const activeSection = ref<'schedule' | 'study' | 'settings' | 'profile'>('schedule')

// 学期下拉选项：直接取课表页内置的学期列表（courseResult.terms），不依赖校历
const termOptions = computed(() => props.courseResult?.terms || [])

// 当前选中的学期
const currentTermValue = computed(() => props.selectedTerm || props.courseResult?.semester || '')

const termMenuOpen = ref(false)
const termMenuRef = ref<HTMLElement | null>(null)

function openTermMenu() {
  if (termOptions.value.length > 1) termMenuOpen.value = true
}

function closeTermMenu() {
  termMenuOpen.value = false
}

function toggleTermMenu() {
  if (termMenuOpen.value) closeTermMenu()
  else openTermMenu()
}

function selectTerm(term: string) {
  if (term !== currentTermValue.value) {
    emit('changeTerm', term)
  }
  closeTermMenu()
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node)) return
  if (termMenuRef.value?.contains(target)) return
  closeTermMenu()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeTermMenu()
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
  if (wheelTimer) clearTimeout(wheelTimer)
})

watch(currentTermValue, () => {
  closeTermMenu()
})

function selectSection(section: 'schedule' | 'study' | 'settings' | 'profile') {
  activeSection.value = section
}

// 当前学期开始日期：以课表页学期为准（courseResult.semester），校历 currentTerm 兜底
// （教务处校历页的"当前学期"在暑假过渡期可能还是上一学期，而课表已切到新学期）
const semesterStart = computed(() => {
  const cal = props.schoolCalendar
  if (!cal?.terms?.length) return ''
  const term = props.courseResult?.semester || cal.currentTerm || ''
  const found = cal.terms.find((t) => t.term === term)
  return found?.startDate || cal.terms[0]?.startDate || ''
})

// 当前学期结束日期
const semesterEnd = computed(() => {
  const cal = props.schoolCalendar
  if (!cal?.terms?.length) return ''
  const term = props.courseResult?.semester || cal.currentTerm || ''
  const found = cal.terms.find((t) => t.term === term)
  return found?.endDate || cal.terms[0]?.endDate || ''
})

function parseDate(value: string): Date | null {
  const parts = value.split('-').map(Number)
  const [y, m, d] = parts
  if (y === undefined || m === undefined || d === undefined) return null
  return new Date(y, m - 1, d)
}

// 学期总周数（与福大助手一致：开始到结束的天数 / 7 向上取整）
const maxWeek = computed(() => {
  if (!semesterStart.value || !semesterEnd.value) return null
  const start = parseDate(semesterStart.value)
  const end = parseDate(semesterEnd.value)
  if (!start || !end) return null
  return Math.ceil((end.getTime() - start.getTime()) / 86400000 / 7)
})

// 今天是否在当前学期起止日期范围内
const todayInSemester = computed(() => {
  if (!semesterStart.value || !semesterEnd.value) return false
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const start = parseDate(semesterStart.value)
  const end = parseDate(semesterEnd.value)
  if (!start || !end) return false
  return now.getTime() >= start.getTime() && now.getTime() <= end.getTime()
})

// 由学期开始日期算出第 week 周的周一（学期开始对齐到周一 + (week-1)*7 天）
function getMondayOfWeek(week: number): Date | null {
  if (!semesterStart.value) return null
  const parts = semesterStart.value.split('-').map(Number)
  const [y, m, d] = parts
  if (y === undefined || m === undefined || d === undefined) return null
  const start = new Date(y, m - 1, d)
  const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() - ((start.getDay() + 6) % 7))
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + (week - 1) * 7)
}

// 有效教学周：用课表学期起始日期 + 今天重算，而非直接用 week.asp 的周数
// （week.asp 的周数可能属于上一学期，暑假过渡期会与课表学期错位；开学前返回 0）
const effectiveWeek = computed(() => {
  if (!semesterStart.value) return props.currentWeek ?? 0
  const parts = semesterStart.value.split('-').map(Number)
  const [y, m, d] = parts
  if (y === undefined || m === undefined || d === undefined) return props.currentWeek ?? 0
  const start = new Date(y, m - 1, d)
  const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() - ((start.getDay() + 6) % 7))
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((now.getTime() - monday.getTime()) / 86400000)
  return Math.max(0, Math.floor(diffDays / 7) + 1)
})

// "本周"锚点：今天在学期起止范围内 → 当前周；否则（未开学/已结束）→ 第 1 周
const homeWeek = computed(() => {
  if (!todayInSemester.value) return 1
  return Math.max(1, effectiveWeek.value)
})

// 当前展示周：初始继承 store 中保存的展示周（缩放小窗/重启时保持一致），
// 学期变更（切换学期）时重新定位到本周；展示周变化时写回 store 供另一窗口继承
function locateWeek() {
  const week = Math.min(homeWeek.value, maxWeek.value ?? homeWeek.value)
  return Math.max(1, week)
}

const displayWeek = ref<number | null>(null)

function initDisplayWeek() {
  const stored = auth.courseWeek
  displayWeek.value = stored != null ? Math.min(stored, maxWeek.value ?? stored) : locateWeek()
}

initDisplayWeek()

watch(displayWeek, (week) => {
  if (week != null) auth.setCourseWeek(week)
})

watch(
  () => props.courseResult?.semester,
  () => {
    displayWeek.value = locateWeek()
  },
)

// 展示周的 7 天日期
const weekDays = computed<Date[]>(() => {
  if (displayWeek.value == null) return []
  const monday = getMondayOfWeek(displayWeek.value)
  if (!monday) return []
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))
})

// 左上角月份：本周周一所在月份；跨月时显示如 9-10月
const cornerMonth = computed(() => {
  if (weekDays.value.length !== 7) return ''
  const first = weekDays.value[0]
  const last = weekDays.value[6]
  if (!first || !last) return ''
  const monthStart = first.getMonth() + 1
  const monthEnd = last.getMonth() + 1
  return monthStart === monthEnd ? `${monthStart}月` : `${monthStart}月`
})

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

const today = computed(() => {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
})

// 表头：星期 + 具体日期 + 是否今天
const weekHeaders = computed(() =>
  dayNames.map((name, i) => {
    const date = weekDays.value[i] ?? null
    return { name, date, isToday: date ? isSameDay(date, today.value) : false }
  }),
)

const isTodayColumn = (i: number) => weekHeaders.value[i]?.isToday ?? false

// 课程周次过滤：仅显示当周课程（支持多段周次区间 + 单/双周标记）
function courseInWeek(course: CourseItem, week: number) {
  const ranges = (course.weeks || '')
    .split(',')
    .map((range) => range.match(/(\d{1,2})\s*-\s*(\d{1,2})/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
  if (!ranges.length) return true
  const inWeeks = ranges.some((m) => {
    const start = Number(m[1])
    const end = Number(m[2])
    return week >= start && week <= end
  })
  if (!inWeeks) return false
  const isOdd = week % 2 === 1
  if (course.single === false && isOdd) return false // 仅双周课，单周跳过
  if (course.double === false && !isOdd) return false // 仅单周课，双周跳过
  return true
}

const visibleCourses = computed(() => {
  if (displayWeek.value == null) return courses.value
  return courses.value.filter((course) => courseInWeek(course, displayWeek.value as number))
})

function examDate(value: string): Date | null {
  const match = value.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function examDay(exam: ExamItem): number | null {
  const date = examDate(exam.date)
  if (!date || !weekDays.value.length) return null
  const monday = weekDays.value[0]
  if (!monday) return null
  const diff = Math.round((date.getTime() - monday.getTime()) / 86400000)
  return diff >= 0 && diff < 7 ? diff : null
}

function timeToMinutes(value: string): number | null {
  const match = value.match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function examPeriods(exam: ExamItem): { start: number; end: number } {
  const times = (exam.time || '').match(/\d{1,2}:\d{2}/g) || []
  const examStart = timeToMinutes(times[0] || '')
  const examEnd = timeToMinutes(times[1] || '') ?? examStart
  if (examStart == null || !periods.value.length) return { start: 1, end: 1 }

  const matched = periods.value.filter((period) => {
    const periodTimes = period.time.match(/\d{1,2}:\d{2}/g) || []
    const periodStart = timeToMinutes(periodTimes[0] || '')
    const periodEnd = timeToMinutes(periodTimes[1] || '')
    return periodStart != null && periodEnd != null && examStart < periodEnd && (examEnd ?? examStart) > periodStart
  })
  if (matched.length) {
    const first = matched[0]!
    const last = matched[matched.length - 1]!
    return { start: first.number, end: last.number }
  }

  let nearest = periods.value[0]
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const period of periods.value) {
    const periodStart = timeToMinutes(period.time.match(/\d{1,2}:\d{2}/)?.[0] || '')
    if (periodStart == null) continue
    const distance = Math.abs(periodStart - examStart)
    if (distance < nearestDistance) {
      nearest = period
      nearestDistance = distance
    }
  }
  return { start: nearest?.number || 1, end: nearest?.number || 1 }
}

const visibleExams = computed(() => exams.value.filter((exam) => examDay(exam) !== null))

function examStyle(exam: ExamItem, index: number) {
  const range = examPeriods(exam)
  return {
    gridColumn: `${(examDay(exam) ?? 0) + 2}`,
    gridRow: range ? `${range.start + 1} / ${range.end + 2}` : undefined,
    animationDelay: `${Math.min(index * 45, 520)}ms`,
  }
}

function prevWeek() {
  if (displayWeek.value != null) displayWeek.value = Math.max(1, displayWeek.value - 1)
}

function nextWeek() {
  if (displayWeek.value != null) {
    displayWeek.value =
      maxWeek.value != null ? Math.min(maxWeek.value, displayWeek.value + 1) : displayWeek.value + 1
  }
}

function goCurrentWeek() {
  displayWeek.value = Math.min(homeWeek.value, maxWeek.value ?? homeWeek.value)
}

// 在课表网格内滚动鼠标切换周数：向下滚下一周、向上滚上一周
// shift + 滚动（横向滚动）和触控板水平手势交给浏览器原生处理
let wheelLock = false
let wheelTimer: ReturnType<typeof setTimeout> | undefined
function onGridWheel(event: WheelEvent) {
  const delta = event.deltaY
  if (Math.abs(delta) < 1 || event.shiftKey) return
  if (wheelLock) return
  event.preventDefault()
  wheelLock = true
  if (delta > 0) nextWeek()
  else prevWeek()
  wheelTimer = setTimeout(() => {
    wheelLock = false
  }, 50)
}

// day: 0=周一..6=周日，start/end 为节次
// 表头占第 1 行，节次 n 占第 n+1 行，卡片覆盖 start..end 行
const courseTones = [
  'blue',
  'violet',
  'teal',
  'amber',
  'rose',
  'indigo',
  'cyan',
  'lime',
  'orange',
  'fuchsia',
  'sky',
  'emerald',
  'pink',
  'slate',
]

// 课程时长：开始节次的起始时间 → 结束节次的结束时间（如 8:20-10:00）
function courseDuration(course: CourseItem): string {
  const startPeriod = periods.value.find((p) => p.number === course.start)
  const endPeriod = periods.value.find((p) => p.number === course.end)
  if (!startPeriod || !endPeriod) return ''
  const startTime = startPeriod.time.split('-')[0]?.trim()
  const endTime = endPeriod.time.split('-')[1]?.trim()
  if (!startTime || !endTime) return ''
  return `${startTime}-${endTime}`
}

// 复制课程/考试信息
const copiedCourseIndex = ref<number | null>(null)
const copiedExamIndex = ref<number | null>(null)
let copyTimer: ReturnType<typeof setTimeout> | undefined

async function copyCourse(course: CourseItem, index: number) {
  const duration = courseDuration(course)
  const parity = course.single === false ? '（双周）' : course.double === false ? '（单周）' : ''
  const text = [
    course.name,
    ...(course.teacher ? [`教师：${course.teacher}`] : []),
    ...(course.location ? [`地点：${course.location}`] : []),
    `${dayNames[course.day]} ${duration}${course.weeks ? `（第${course.weeks}周${parity}）` : ''}`,
  ].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    copiedCourseIndex.value = index
    copiedExamIndex.value = null
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copiedCourseIndex.value = null
    }, 1500)
  } catch {
    // 忽略：剪贴板写入失败不打断交互
  }
}

async function copyExam(exam: ExamItem, index: number) {
  const text = [
    exam.name,
    ...(exam.teacher ? [`教师：${exam.teacher}`] : []),
    ...(exam.location ? [`考场：${exam.location}`] : []),
    ...(exam.seat ? [`座位：${exam.seat}`] : []),
    `${exam.date}${exam.time ? ` ${exam.time}` : ''}`,
  ].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    copiedExamIndex.value = index
    copiedCourseIndex.value = null
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copiedExamIndex.value = null
    }, 1500)
  } catch {
    // 忽略：剪贴板写入失败不打断交互
  }
}

function courseStyle(course: CourseItem, index: number) {
  return {
    gridColumn: `${course.day + 2}`,
    gridRow: `${course.start + 1} / ${course.end + 2}`,
    animationDelay: `${Math.min(index * 45, 520)}ms`,
  }
}

// 课程配色：按课程名首次出现的顺序分配调色板颜色。
// 同名课程跨周保持同一颜色；不同名称尽量不撞色（课程数不超过调色板大小时各不相同）
const courseToneMap = computed(() => {
  const map = new Map<string, string>()
  for (const course of courses.value) {
    const name = course.name.trim()
    if (!map.has(name)) {
      // 取模索引必然在 courseTones 范围内，非空断言消除 noUncheckedIndexedAccess 误报
      map.set(name, courseTones[map.size % courseTones.length]!)
    }
  }
  return map
})

function courseToneClass(course: CourseItem) {
  return `course-card-${courseToneMap.value.get(course.name.trim()) || 'blue'}`
}

// 课程/考试卡片的 UI 浮层提示（跟随鼠标、不超出窗口边缘）
const hoveredCourse = ref<CourseItem | null>(null)
const hoveredExam = ref<ExamItem | null>(null)
const tooltipPos = ref({ x: 0, y: 0 })

// 估算提示框尺寸，用于靠近窗口边缘时自动翻转位置
const TOOLTIP_W = 170
const TOOLTIP_H = 150

const tooltipStyle = computed(() => {
  const pad = 14
  let left = tooltipPos.value.x + pad
  let top = tooltipPos.value.y + pad
  if (left + TOOLTIP_W > window.innerWidth - 8) left = tooltipPos.value.x - pad - TOOLTIP_W
  if (top + TOOLTIP_H > window.innerHeight - 8) top = tooltipPos.value.y - pad - TOOLTIP_H
  return { left: `${left}px`, top: `${top}px` }
})

function showCourseTooltip(course: CourseItem, event: MouseEvent) {
  hoveredCourse.value = course
  hoveredExam.value = null
  updateTooltipPos(event)
}

function showExamTooltip(exam: ExamItem, event: MouseEvent) {
  hoveredExam.value = exam
  hoveredCourse.value = null
  updateTooltipPos(event)
}

function updateTooltipPos(event: MouseEvent) {
  const { clientX, clientY } = event
  tooltipPos.value = { x: clientX, y: clientY }
}

function hideTooltip() {
  hoveredCourse.value = null
  hoveredExam.value = null
}
</script>

<template>
  <section class="app-view schedule-layout" :class="{ 'schedule-layout-compact': compact }">
    <aside v-if="!compact" class="main-nav" aria-label="主菜单">
      <button
        v-for="item in mainNavItems"
        :key="item.key"
        type="button"
        class="main-nav-item"
        :class="{ active: activeSection === item.key }"
        :title="item.label"
        :aria-label="item.label"
        @click="selectSection(item.key)"
      >
        <svg v-if="item.icon === 'grid'" aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </svg>
        <svg v-else aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span>{{ item.label }}</span>
      </button>

      <div class="nav-footer">
        <div class="avatar-wrap">
          <button
            type="button"
            class="avatar-btn"
            :class="{ active: activeSection === 'profile' }"
            :title="username || '账号'"
            aria-label="个人主页"
            @click="selectSection('profile')"
          >
            <img :src="avatarImg" alt="头像" />
          </button>
        </div>

        <button
          type="button"
          class="main-nav-item nav-settings"
          :class="{ active: activeSection === 'settings' }"
          title="设置"
          aria-label="设置"
          @click="selectSection('settings')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
          <span>设置</span>
        </button>
      </div>
    </aside>

    <section class="schedule-panel content-shell">
      <template v-if="activeSection === 'schedule'">
        <div
          v-if="hasCourses || hasExams"
          class="schedule-content"
          :class="{ 'motion-disabled': !auth.uiSettings.courseCardMotion }"
        >
        <Teleport to="#schedule-toolbar-slot">
          <div v-if="displayWeek !== null" class="schedule-toolbar">
            <div v-if="termOptions.length && !compact" ref="termMenuRef" class="term-select">
              <button
                class="term-select-trigger"
                type="button"
                :class="{ open: termMenuOpen }"
                :aria-expanded="termMenuOpen"
                aria-haspopup="listbox"
                @click="toggleTermMenu"
              >
                <span class="term-select-value">{{ currentTermValue || termOptions[0] }}</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              <Transition name="term-menu">
                <div v-if="termMenuOpen" class="term-select-menu" role="listbox">
                  <button
                    v-for="term in termOptions"
                    :key="term"
                    type="button"
                    class="term-select-option"
                    :class="{ active: term === currentTermValue }"
                    role="option"
                    :aria-selected="term === currentTermValue"
                    @click="selectTerm(term)"
                  >
                    <span>{{ term }}</span>
                    <small>学期</small>
                  </button>
                </div>
              </Transition>
            </div>

            <div class="week-switcher">
              <button
                class="week-btn week-btn-arrow"
                type="button"
                aria-label="上一周"
                title="上一周"
                :disabled="displayWeek <= 1"
                @click="prevWeek"
              >
                <span aria-hidden="true">←</span>
              </button>
              <span class="week-label">第 {{ displayWeek }} 周</span>
              <button
                class="week-btn week-btn-arrow"
                type="button"
                aria-label="下一周"
                title="下一周"
                :disabled="maxWeek != null && displayWeek >= maxWeek"
                @click="nextWeek"
              >
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </Teleport>

        <div class="weekly-grid" @wheel="onGridWheel">
          <div class="grid-corner" style="grid-column: 1; grid-row: 1">
            <span v-if="cornerMonth" class="corner-month">{{ cornerMonth }}</span>
          </div>
          <div
            v-for="(header, i) in weekHeaders"
            :key="`day-${i}`"
            class="grid-day"
            :class="{ 'grid-day-today': header.isToday }"
            :style="{ gridColumn: `${i + 2}`, gridRow: '1' }"
          >
            <span class="day-name">{{ header.name }}</span>
            <span v-if="header.date" class="day-date">{{ header.date.getDate() }}</span>
          </div>
          <template v-for="period in periods" :key="`period-${period.number}`">
            <div class="grid-period" :style="{ gridColumn: '1', gridRow: `${period.number + 1}` }">
              <span class="period-number">{{ compact ? period.number : `第${period.number}节` }}</span>
              <span v-if="!compact" class="period-time">{{ period.time }}</span>
            </div>
            <div
              v-for="d in 7"
              :key="`cell-${period.number}-${d}`"
              class="grid-cell"
              :class="{ 'grid-cell-today': isTodayColumn(d - 1) }"
              :style="{ gridColumn: `${d + 1}`, gridRow: `${period.number + 1}` }"
            ></div>
          </template>

          <div
            v-for="(exam, i) in visibleExams"
            :key="`exam-${displayWeek}-${i}`"
            class="exam-card"
            :style="examStyle(exam, i)"
            @mouseenter="showExamTooltip(exam, $event)"
            @mousemove="updateTooltipPos"
            @mouseleave="hideTooltip"
          >
            <div class="exam-kicker"><span class="exam-kicker-mark" aria-hidden="true"></span>考试</div>
            <div class="exam-name">{{ exam.name }}</div>
            <div v-if="exam.location" class="exam-meta exam-meta-location">{{ exam.location }}</div>
            <div v-if="exam.teacher" class="exam-meta exam-meta-teacher">{{ exam.teacher }}</div>
            <div v-if="exam.type || exam.seat" class="exam-meta exam-meta-extra">
              <span v-if="exam.type">{{ exam.type }}</span>
              <span v-if="exam.type && exam.seat"> · </span>
              <span v-if="exam.seat">座位 {{ exam.seat }}</span>
            </div>
            <div v-if="exam.time" class="exam-time">{{ exam.time }}</div>
            <button
              class="course-copy-btn exam-copy-btn"
              type="button"
              :class="{ copied: copiedExamIndex === i }"
              :title="copiedExamIndex === i ? '已复制' : '复制考试信息'"
              :aria-label="copiedExamIndex === i ? '已复制' : '复制考试信息'"
              @click.stop="copyExam(exam, i)"
            >
              <svg v-if="copiedExamIndex === i" aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <svg v-else aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>

          <div
            v-for="(course, i) in visibleCourses"
            :key="`course-${displayWeek}-${i}`"
            class="course-card"
            :class="[courseToneClass(course), { 'course-card-today': isTodayColumn(course.day) }]"
            :style="courseStyle(course, i)"
            @mouseenter="showCourseTooltip(course, $event)"
            @mousemove="updateTooltipPos"
            @mouseleave="hideTooltip"
          >
            <div class="course-name">{{ course.name }}</div>
            <template v-if="!compact">
              <div v-if="course.location" class="course-meta course-meta-location">{{ course.location }}</div>
              <div v-if="course.teacher" class="course-meta course-meta-teacher">{{ course.teacher }}</div>
              <div v-if="course.weeks" class="course-dates">
                {{ courseDuration(course) }}
                <template v-if="course.single === false">·双</template>
                <template v-else-if="course.double === false">·单</template>
              </div>
            </template>
            <div v-else-if="course.location" class="course-meta course-meta-location">{{ course.location }}</div>
            <button
              class="course-copy-btn"
              type="button"
              :class="{ copied: copiedCourseIndex === i }"
              :title="copiedCourseIndex === i ? '已复制' : '复制课程信息'"
              :aria-label="copiedCourseIndex === i ? '已复制' : '复制课程信息'"
              @click.stop="copyCourse(course, i)"
            >
              <svg v-if="copiedCourseIndex === i" aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <svg v-else aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

        <div v-else-if="courseResult || examResult" class="empty-state">
          <strong>暂未解析到课表或考试卡片</strong>
          <span>{{ courseResult?.title || examResult?.title || '教务页面已返回，但页面结构需要继续适配' }}</span>
          <pre>{{ courseResult?.snippet || examResult?.snippet }}</pre>
        </div>

        <div v-else class="empty-state">
          <strong>暂无课表或考试数据</strong>
          <span>点击右下角刷新按钮获取数据</span>
        </div>
      </template>

      <div v-else-if="activeSection === 'study'" class="study-placeholder">
        <strong>学业</strong>
        <span>开发中，敬请期待。</span>
      </div>

      <ProfileView v-else-if="activeSection === 'profile'" />

      <SettingsView v-else />
    </section>

    <div v-if="activeSection === 'schedule'" class="fab-group">
      <button
        v-if="todayInSemester"
        class="fab go-week-fab"
        type="button"
        :disabled="displayWeek === homeWeek || !hasCourses"
        :title="displayWeek === homeWeek ? '已在当前周' : '回到本周'"
        aria-label="回到本周"
        @click="goCurrentWeek"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 16v-7" />
          <path d="m9 12 3-3 3 3" />
        </svg>
      </button>

      <button
        v-if="!compact"
        class="fab refresh-fab"
        type="button"
        :disabled="courseLoading"
        :title="courseLoading ? '刷新中...' : '刷新课表'"
        aria-label="刷新课表"
        @click="emit('refresh')"
      >
        <svg :class="{ spinning: courseLoading || examLoading }" aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      </button>
    </div>

    <Teleport to="body">
      <Transition name="tooltip">
        <div v-if="hoveredCourse || hoveredExam" class="course-tooltip" :style="tooltipStyle" role="tooltip">
          <div v-if="hoveredCourse" class="course-tooltip-name">{{ hoveredCourse.name }}</div>
          <div v-if="hoveredExam" class="course-tooltip-name">{{ hoveredExam.name }}</div>

          <template v-if="hoveredCourse">
            <div v-if="hoveredCourse.teacher" class="course-tooltip-meta">
              <span class="course-tooltip-label">教师</span>{{ hoveredCourse.teacher }}
            </div>
            <div v-if="hoveredCourse.location" class="course-tooltip-meta">
              <span class="course-tooltip-label">地点</span>{{ hoveredCourse.location }}
            </div>
            <div v-if="hoveredCourse.weeks" class="course-tooltip-meta">
              <span class="course-tooltip-label">时间</span>{{ courseDuration(hoveredCourse) }}
            </div>
          </template>

          <template v-else-if="hoveredExam">
            <div v-if="hoveredExam.teacher" class="course-tooltip-meta">
              <span class="course-tooltip-label">教师</span>{{ hoveredExam.teacher }}
            </div>
            <div v-if="hoveredExam.location" class="course-tooltip-meta">
              <span class="course-tooltip-label">考场</span>{{ hoveredExam.location }}
            </div>
            <div class="course-tooltip-meta">
              <span class="course-tooltip-label">时间</span>{{ hoveredExam.date }}<template v-if="hoveredExam.time"> · {{ hoveredExam.time }}</template>
            </div>
            <div v-if="hoveredExam.seat || hoveredExam.type" class="course-tooltip-meta">
              <span class="course-tooltip-label">附加</span>
              <template v-if="hoveredExam.type">{{ hoveredExam.type }}</template>
              <template v-if="hoveredExam.type && hoveredExam.seat"> · </template>
              <template v-if="hoveredExam.seat">座位 {{ hoveredExam.seat }}</template>
            </div>
          </template>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.app-view {
  position: relative;
  display: block;
  width: 100%;
  min-height: 100vh;
  background: rgb(242, 246, 252);
}

.schedule-layout {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  min-height: 100vh;
}

/* 迷你模式：无导航栏，单列布局 */
.schedule-layout-compact {
  grid-template-columns: minmax(0, 1fr);
}

.main-nav {
  position: sticky;
  top: 42px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 10px 8px;
  background: #f2f6fc;
}

.main-nav-item {
  display: grid;
  justify-items: center;
  gap: 4px;
  width: 100%;
  padding: 10px 0 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: #56708d;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
}

.main-nav-item svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.main-nav-item:hover {
  background: #ffffff;
  color: #1d4ed8;
  transform: translateY(0px);
}
.main-nav-item.active {
  background: #ffffff;
  color: #1d4ed8;
  transform: translateY(0px);
}

/* 导航栏底部区域：头像 + 设置按钮，吸附在导航栏底部（应用左下角） */
.nav-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.nav-settings {
  flex: none;
}

.avatar-wrap {
  position: relative;
  display: flex;
  justify-content: center;
}

.avatar-btn {
  width: 40px;
  height: 40px;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.avatar-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-btn.active {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.schedule-panel {
  position: relative;
  min-height: calc(100vh - 42px);
}

.study-placeholder {
  min-height: calc(100vh - 42px);
  display: grid;
  place-items: center;
  gap: 8px;
  color: #344054;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, rgba(248, 250, 252, 0.88) 100%);
}

.study-placeholder strong {
  font-size: 18px;
  font-weight: 800;
}

.study-placeholder span {
  font-size: 13px;
  color: #607086;
}

.schedule-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
}

.term-select {
  position: relative;
  min-width: 170px;
}

.term-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  height: 34px;
  padding: 0 12px 0 14px;
  border: 1px solid #d6e0ee;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  color: #102033;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.term-select-trigger:hover {
  border-color: #bfd0ea;
  background: #fff;
}

.term-select-trigger.open,
.term-select-trigger:focus-visible {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.term-select-trigger svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: none;
  color: #64748b;
  transition: transform 0.2s ease, color 0.2s ease;
}

.term-select-trigger.open svg {
  transform: rotate(180deg);
  color: #2563eb;
}

.term-select-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.term-select-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 50;
  min-width: 100%;
  max-height: 280px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px;
  border: 1px solid #d8e2ef;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(8px);
  overscroll-behavior: contain;
  box-sizing: border-box;
}

.term-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #334155;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
  transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.term-select-option + .term-select-option {
  margin-top: 2px;
}

.term-select-option:hover {
  background: #eef4ff;
  color: #1d4ed8;
  box-shadow: inset 0 0 0 1px rgba(191, 208, 234, 0.28);
}

.term-select-option.active {
  background: #eaf1ff;
  color: #1d4ed8;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
}

.term-select-option:active {
  background: #dbe7ff;
}

.term-select-option:focus-visible {
  outline: none;
  background: #eaf1ff;
  color: #1d4ed8;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.term-select-option span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
  flex: 1 1 auto;
}

.term-select-option small {
  flex: none;
  font-size: 11px;
  line-height: 1.2;
  color: inherit;
  opacity: 0.7;
}

.term-menu-enter-active,
.term-menu-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.term-menu-enter-from,
.term-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 720px) {
  .term-select {
    min-width: 148px;
  }

  .term-select-menu {
    right: 0;
    left: auto;
  }
}

.week-switcher {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 2px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.82);
}

.week-label {
  min-width: 60px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: #102033;
  transition: color 0.2s ease;
}

.week-btn {
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 4px 10px;
  background: transparent;
  color: #344054;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}

.week-btn:hover:not(:disabled) {
  background: #fff;
  color: #1d4ed8;
  box-shadow: 0 3px 9px rgba(30, 64, 110, 0.1);
  transform: translateY(-1px);
}

.week-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.week-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.week-btn-arrow {
  width: 28px;
  height: 26px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
}

.weekly-grid {
  display: grid;
  grid-template-columns: 92px repeat(7, minmax(118px, 1fr));
  grid-auto-rows: minmax(52px, 1fr);
  min-height: calc(100vh - 42px);
  overflow-x: auto;
  scrollbar-width: none;
}

.weekly-grid::-webkit-scrollbar {
  display: none;
}

.grid-corner,
.grid-day,
.grid-period,
.grid-cell {
  min-width: 0;
  border-bottom: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
}

.grid-day {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 5px 0;
  color: #1d3b68;
  box-shadow: inset 0 -1px 0 rgba(148, 163, 184, 0.22);
}

/* 表头（月份/星期/节次）统一为「主信息 + 次信息」两行结构，纯色平铺背景 */
.grid-corner,
.grid-day,
.grid-period {
  background: #f8fafc;
}

.grid-corner {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
}

.corner-month {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}

.day-name {
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
}

.day-date {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  color: #1d3b68;
}

.grid-day-today {
  background: #eff6ff;
}

.grid-day-today .day-name {
  color: #1d4ed8;
}

.grid-day-today .day-date {
  color: #fff;
  background: #2563eb;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.grid-period {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 4px 2px;
  color: #344054;
}

.period-number {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.period-time {
  font-size: 10px;
  font-weight: 400;
  color: #94a3b8;
  white-space: nowrap;
}

.grid-cell {
  background: #fff;
}

.grid-cell-today {
  background: #eff6ff;
}

.course-card-today {
  border-color: #2563eb;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.2);
}

.motion-disabled .course-card,
.motion-disabled .exam-card {
  animation: none;
  transition: none;
}

.motion-disabled .course-card:hover,
.motion-disabled .exam-card:hover {
  transform: none;
  filter: none;
}

.motion-disabled .course-card:hover {
  box-shadow: 0 12px 24px rgba(30, 64, 110, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.motion-disabled .exam-card:hover {
  box-shadow: 0 12px 24px rgba(180, 83, 9, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.motion-disabled .course-copy-btn,
.motion-disabled .exam-copy-btn {
  transition: none;
}

.exam-card {
  position: relative;
  z-index: 4;
  min-width: 0;
  margin: 4px;
  padding: 8px 9px 8px 11px;
  border: 1px solid #f59e0b;
  border-left: 4px solid #ea580c;
  border-radius: 8px;
  background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
  color: #7c2d12;
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
  container-type: size;
  box-shadow: 0 6px 14px rgba(180, 83, 9, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  animation: course-enter 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  transition: transform 0.22s ease, box-shadow 0.22s ease, filter 0.22s ease;
}

.exam-card:hover {
  z-index: 6;
  transform: translateY(-3px) scale(1.015);
  filter: saturate(1.08);
  box-shadow: 0 12px 24px rgba(180, 83, 9, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.exam-card:hover .exam-copy-btn {
  opacity: 1;
}

.exam-kicker {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
  color: #c2410c;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.2;
  text-transform: uppercase;
}

.exam-kicker-mark {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ea580c;
  box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.14);
}

.exam-name,
.exam-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exam-name {
  font-weight: 700;
}

.exam-meta {
  color: #9a3412;
}

.exam-meta-location,
.exam-meta-teacher {
  font-size: 11px;
}

.exam-meta-extra {
  color: #b45309;
}

.exam-time {
  margin-top: 2px;
  color: #b45309;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exam-copy-btn {
  bottom: 5px;
}

.exam-copy-btn:hover {
  background: #d97706;
  border-color: #d97706;
}

.course-card {
  position: relative;
  z-index: 2;
  margin: 4px;
  padding: 8px 9px;
  border-radius: 8px;
  border: 1px solid transparent;
  color: #1d3b68;
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
  container-type: size;
  box-shadow: 0 5px 12px rgba(30, 64, 110, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.44);
  animation: course-enter 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  transition: transform 0.22s ease, box-shadow 0.22s ease, filter 0.22s ease;
}

/* 表格空间不足时按卡片实际可用高度分级隐藏次要信息，名称始终保留 */
@container (max-height: 132px) {
  .course-meta-teacher,
  .exam-meta-teacher {
    display: none;
  }
}

@container (max-height: 64px) {
  .course-meta-location,
  .course-meta-teacher,
  .exam-meta-location,
  .exam-meta-teacher {
    display: none;
  }
}

@container (max-height: 40px) {
  .course-meta,
  .course-dates,
  .exam-kicker,
  .exam-meta,
  .exam-time {
    display: none;
  }
}

.course-card:hover {
  z-index: 5;
  transform: translateY(-3px) scale(1.015);
  filter: saturate(1.08);
  box-shadow: 0 12px 24px rgba(30, 64, 110, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.course-card-blue { background: #dbeafe; border-color: #93c5fd; }
.course-card-violet { background: #ede9fe; border-color: #c4b5fd; color: #43316e; }
.course-card-teal { background: #ccfbf1; border-color: #5eead4; color: #145b58; }
.course-card-amber { background: #fef3c7; border-color: #fcd34d; color: #704b0b; }
.course-card-rose { background: #ffe4e6; border-color: #fda4af; color: #753044; }
.course-card-indigo { background: #e0e7ff; border-color: #a5b4fc; color: #303d79; }
.course-card-cyan { background: #cffafe; border-color: #67e8f9; color: #155e75; }
.course-card-lime { background: #ecfccb; border-color: #bef264; color: #3f6212; }
.course-card-orange { background: #ffedd5; border-color: #fdba74; color: #7c2d12; }
.course-card-fuchsia { background: #fae8ff; border-color: #e879f9; color: #701a75; }
.course-card-sky { background: #e0f2fe; border-color: #7dd3fc; color: #075985; }
.course-card-emerald { background: #d1fae5; border-color: #6ee7b7; color: #065f46; }
.course-card-pink { background: #fce7f3; border-color: #f9a8d4; color: #831843; }
.course-card-slate { background: #e2e8f0; border-color: #94a3b8; color: #334155; }

.course-name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.course-meta {
  font-size: 11px;
  color: #344054;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.course-dates {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 600;
  color: #2563eb;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.course-copy-btn {
  position: absolute;
  left: 5px;
  bottom: 5px;
  z-index: 6;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(148, 163, 184, 0.5);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.92);
  color: #475569;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.course-card:hover .course-copy-btn {
  opacity: 1;
}

.course-copy-btn:hover {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
  transform: translateY(-1px);
}

.course-copy-btn.copied {
  opacity: 1;
  background: #15803d;
  border-color: #15803d;
  color: #fff;
}

.course-copy-btn svg {
  width: 13px;
  height: 13px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.empty-state {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 10px;
  background: #f7f9fc;
  color: #344054;
  font-size: 13px;
}

.empty-state pre {
  max-height: 220px;
  margin: 0;
  overflow: auto;
  scrollbar-width: none;
  white-space: pre-wrap;
  word-break: break-word;
  color: #102033;
}

.empty-state pre::-webkit-scrollbar {
  display: none;
}

.fab-group {
  position: fixed;
  right: 26px;
  bottom: 26px;
  z-index: 60;
  display: flex;
  gap: 10px;
}

.fab {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border: 1px solid #dbe3ee;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: #2563eb;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(30, 64, 110, 0.14);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.fab:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 26px rgba(30, 64, 110, 0.2);
}

.fab:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.fab svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.refresh-fab svg.spinning {
  animation: fab-spin 1s linear infinite;
}

.course-tooltip {
  position: fixed;
  z-index: 90;
  min-width: 180px;
  max-width: 260px;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 30px rgba(30, 64, 110, 0.18);
  pointer-events: none;
  backdrop-filter: blur(8px);
}

.course-tooltip-name {
  font-size: 13px;
  font-weight: 700;
  color: #102033;
  line-height: 1.45;
  word-break: break-all;
  margin-bottom: 6px;
}

.course-tooltip-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: #344054;
  line-height: 1.6;
}

.course-tooltip-label {
  flex: none;
  min-width: 32px;
  font-size: 11px;
  font-weight: 600;
  color: #2563eb;
}

.tooltip-enter-active,
.tooltip-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translateY(3px);
}

@keyframes fab-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes course-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ===== 迷你窗口紧凑课表 ===== */
.schedule-layout-compact .weekly-grid {
  grid-template-columns: 34px repeat(7, minmax(7px, 1fr));
  grid-auto-rows: minmax(4px, 1fr);
}

/* 表头只留数字：隐藏星期汉字，月份角保留 */
.schedule-layout-compact .day-name {
  display: none;
}

.schedule-layout-compact .grid-corner {
  padding: 2px;
}

.schedule-layout-compact .corner-month {
  font-size: 11px;
  font-weight: 700;
  color: #000000;
}

.schedule-layout-compact .grid-day {
  padding: 3px 0;
}

.schedule-layout-compact .day-date {
  font-size: 14px;
}

.schedule-layout-compact .grid-day-today .day-date {
  width: 24px;
  height: 24px;
}

/* 节次列只留数字，去掉"第X节"汉字与时间 */
.schedule-layout-compact .grid-period {
  padding: 2px;
}

.schedule-layout-compact .period-time {
  display: none;
}

.schedule-layout-compact .period-number {
  font-size: 12px;
}

/* 课程卡片：紧凑留白、名称可换两行、教室只留英数、字体加大 */
.schedule-layout-compact .course-card {
  margin: 1px;
  padding: 5px 6px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.3;
}

.schedule-layout-compact .course-name {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  white-space: normal;
  font-weight: 700;
}

.schedule-layout-compact .course-meta {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
}

/* 小窗教室名也支持两行显示，超出省略；居中展示 */
.schedule-layout-compact .course-meta-location {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: normal;
  text-align: center;
}

.schedule-layout-compact .exam-card {
  margin: 1px;
  padding: 5px 3px 5px 3px;
  border: 1px solid #ff0000;
  border-left: 3px solid #ff0000;
  border-radius: 6px;
  background: #903424;
  color: #fff;
  font-size: 12px;
  line-height: 1.3;
  box-shadow: none;
}

/* 小窗考试卡片与课程卡片一致：去掉"考试"字样/呼吸灯/教师/附加/时间，名称两行、教室两行居中 */
.schedule-layout-compact .exam-kicker,
.schedule-layout-compact .exam-meta-teacher,
.schedule-layout-compact .exam-meta-extra,
.schedule-layout-compact .exam-time {
  display: none;
}

.schedule-layout-compact .exam-name {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  white-space: normal;
  font-weight: 700;
}

.schedule-layout-compact .exam-meta-location {
  margin-top: 2px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  white-space: normal;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

.schedule-layout-compact .course-copy-btn,
.schedule-layout-compact .exam-copy-btn {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .course-card {
    animation: none;
  }

  .week-btn,
  .course-card {
    transition: none;
  }
}

@media (max-width: 640px) {
  .week-switcher {
    gap: 4px;
  }

  .week-btn-arrow {
    flex: 0 0 28px;
  }
}
</style>
