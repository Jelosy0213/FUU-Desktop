/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

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
