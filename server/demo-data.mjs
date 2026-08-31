/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
// 演示数据：使用演示账号（123456/root，验证码留空）登录时，
// 本地代理直接返回示例课表/考表/个人信息/校历，无需真实教务账号即可体验全部功能。
// 字段结构与 fzu-proxy.mjs 真实接口返回保持一致。

export const DEMO_ACCOUNT = '123456'
export const DEMO_PASSWORD = 'root'

// 当前演示学期：课表页学期下拉里的"当前"选项
export const DEMO_TERM = '202601'
export const DEMO_TERMS = ['202501', '202502', '202601']

// 11 节次时段表（与福大课表一致）
const DEMO_PERIODS = [
  { number: 1, time: '08:20-09:05', segment: '上午' },
  { number: 2, time: '09:15-10:00', segment: '上午' },
  { number: 3, time: '10:20-11:05', segment: '上午' },
  { number: 4, time: '11:15-12:00', segment: '上午' },
  { number: 5, time: '14:00-14:45', segment: '下午' },
  { number: 6, time: '14:55-15:40', segment: '下午' },
  { number: 7, time: '16:00-16:45', segment: '下午' },
  { number: 8, time: '16:55-17:40', segment: '下午' },
  { number: 9, time: '19:00-19:45', segment: '晚上' },
  { number: 10, time: '19:55-20:40', segment: '晚上' },
  { number: 11, time: '20:50-21:35', segment: '晚上' },
]

// 固定个人信息：涵盖个人页展示的全部字段
const DEMO_PROFILE = {
  学号: '852300001',
  姓名: '陈小U',
  性别: '男',
  出生日期: '2005-03-18',
  民族: '汉族',
  政治面貌: '共青团员',
  年级: '2023',
  学院名称: '计算机与大数据学院',
  专业名称: '计算机科学与技术',
  学制: '四年',
  培养层次: '本科',
  入学日期: '2023-09-11',
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 本周周一（day: 0=周一 ... 6=周日）
function mondayOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function demoPeriods() {
  return DEMO_PERIODS
}

// 当前学期（202601）完整课程：覆盖多周区间、单/双周标记、跨节次、周末课程等特性
function fullDemoCourses() {
  return [
    // day: 0=周一 ... 6=周日；single=false 表示仅双周，double=false 表示仅单周
    { name: '高等数学A(一)', teacher: '张明远', location: '文1-201', weeks: '01-16', day: 0, start: 1, end: 2 },
    { name: '大学英语(一)', teacher: '李晓华', location: '外语楼404', weeks: '01-16', day: 0, start: 3, end: 4 },
    { name: '大学体育(一)', teacher: '陈志强', location: '东区田径场', weeks: '01-16', day: 0, start: 7, end: 8, single: false, double: true },
    { name: '程序设计基础(C语言)', teacher: '郑海涛', location: '计算机楼305', weeks: '01-08,10-16', day: 1, start: 1, end: 2 },
    { name: '大学物理A(一)', teacher: '林秀英', location: '物3-210', weeks: '03-16', day: 1, start: 3, end: 4, single: false, double: true },
    { name: '思想道德与法治', teacher: '吴慧敏', location: '文2-305', weeks: '01-16', day: 1, start: 5, end: 6 },
    { name: '高等数学A(一)', teacher: '张明远', location: '文1-201', weeks: '01-16', day: 2, start: 1, end: 2 },
    { name: '大学英语(一)', teacher: '李晓华', location: '外语楼404', weeks: '01-16', day: 2, start: 3, end: 4 },
    { name: '中国近现代史纲要', teacher: '陈志强', location: '文2-108', weeks: '01-16', day: 2, start: 5, end: 6, single: true, double: false },
    { name: '形势与政策', teacher: '林嘉琪', location: '综合楼102', weeks: '05-16', day: 2, start: 9, end: 10 },
    { name: '大学物理A(一)', teacher: '林秀英', location: '物3-210', weeks: '01-16', day: 3, start: 1, end: 2 },
    { name: '程序设计实验', teacher: '郑海涛', location: '计算机楼505', weeks: '01-16', day: 3, start: 3, end: 4 },
    { name: '大学体育(一)', teacher: '陈志强', location: '东区田径场', weeks: '01-16', day: 3, start: 5, end: 6, single: false, double: true },
    { name: '线性代数', teacher: '王建国', location: '数3-102', weeks: '01-16', day: 4, start: 1, end: 2 },
    { name: '心理健康教育', teacher: '郭丽华', location: '文2-402', weeks: '01-16', day: 4, start: 3, end: 4 },
    { name: '大学物理实验A', teacher: '林秀英', location: '物理实验楼301', weeks: '01-08', day: 4, start: 5, end: 6 },
    { name: '创新思维训练', teacher: '孙宇辰', location: '线上教学', weeks: '01-16', day: 5, start: 1, end: 2 },
  ]
}

// 历史学期课程：切换学期后课表内容随之变化（演示学期切换功能）
function pastDemoCourses() {
  return [
    { name: '高等数学A(二)', teacher: '张明远', location: '文1-201', weeks: '01-16', day: 0, start: 1, end: 2 },
    { name: '大学英语(二)', teacher: '李晓华', location: '外语楼404', weeks: '01-16', day: 0, start: 3, end: 4 },
    { name: '概率论与数理统计', teacher: '王建国', location: '数3-102', weeks: '01-16', day: 2, start: 1, end: 2 },
    { name: '数字逻辑', teacher: '黄志斌', location: '计算机楼302', weeks: '03-14', day: 2, start: 5, end: 6, single: false, double: true },
    { name: '离散数学', teacher: '陈慧琳', location: '数3-208', weeks: '01-16', day: 4, start: 3, end: 4 },
  ]
}

export function demoCourses(term) {
  return term && term !== DEMO_TERM ? pastDemoCourses() : fullDemoCourses()
}

// 考表：日期落在"本周"，保证打开课表当周即可看到考试卡片（含考场/座位/类型/教师）
export function demoExams(term) {
  if (term && term !== DEMO_TERM) return []
  const monday = mondayOfWeek(new Date())
  const at = (offset) => isoDate(addDays(monday, offset))
  return [
    {
      name: '高等数学A(一) 阶段测验',
      date: at(3),
      time: '08:30-10:30',
      location: '文1-201',
      seat: '12',
      type: '闭卷',
      teacher: '张明远',
    },
    {
      name: '大学英语(一) 听力测试',
      date: at(4),
      time: '14:00-15:30',
      location: '外语楼语音室204',
      seat: '03',
      type: '听力',
      teacher: '李晓华',
    },
  ]
}

export function demoProfile() {
  return { ...DEMO_PROFILE }
}

// 校历：当前学期从本周周一起算（共 20 周），保证"今天"落在学期内、周数推算正确
export function demoCalendar() {
  const start = mondayOfWeek(new Date())
  const end = addDays(start, 139)
  const year = start.getFullYear()
  return {
    currentTerm: DEMO_TERM,
    terms: [
      { term: '202501', startDate: `${year - 1}-09-01`, endDate: `${year}-01-18` },
      { term: '202502', startDate: `${year}-02-23`, endDate: `${year}-07-05` },
      { term: DEMO_TERM, startDate: isoDate(start), endDate: isoDate(end) },
    ],
  }
}

// 当前教学周：按校历起始周一到今天的间隔推算（今天落在本周 → 第 1 周）
export function demoLocateDate() {
  const monday = mondayOfWeek(new Date())
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - monday.getTime()) / 86400000)
  const week = Math.max(1, Math.floor(diffDays / 7) + 1)
  const year = now.getFullYear()
  return { week, year, term: '01', semester: `${year}01` }
}

// 演示账号验证码占位图：无需真实验证码，直接提示可留空
export function demoCaptchaSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="36">
  <rect width="120" height="36" rx="4" fill="#eef4ff"/>
  <text x="60" y="22" font-size="13" text-anchor="middle" fill="#2563eb" font-weight="600">演示账号 免验证码</text>
</svg>`
}
