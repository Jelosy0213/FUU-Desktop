/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
// 课表 HTML 结构化解析
// 输入：课表页面的完整 HTML 文本
// 输出：{ periods, courses }
//   periods: [{ number, time, segment }] 节次时段表（如 第1节 8:20-9:05 上午）
//   courses: [{ name, teacher, location, weeks, day, start, end }] 课程列表
//     day: 0=星期一 ... 6=星期日，start/end: 起止节次（含）

function cleanInline(value) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanCellLines(value) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    // 去掉 [教学大纲|授课计划] 这类操作链接块
    .replace(/\[[\s\S]*?<\/a>[\s\S]*?\]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

// 周次字符串 -> 区间数组（如 "01-12" -> [[1,12]]，"01-10,13-14" -> [[1,10],[13,14]]）
function parseWeekRanges(weeks) {
  const ranges = []
  for (const match of weeks.matchAll(/(\d{1,2})\s*[-—~－]\s*(\d{1,2})/g)) {
    const a = Number(match[1])
    const b = Number(match[2])
    ranges.push([Math.min(a, b), Math.max(a, b)])
  }
  return ranges
}

// 区间数组 -> 周次字符串（相邻区间合并，如 [[1,12],[13,14]] -> "01-14"）
function weekRangesToString(ranges) {
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged = []
  for (const [start, end] of ranges) {
    const prev = merged[merged.length - 1]
    if (prev && start <= prev[1] + 1) {
      prev[1] = Math.max(prev[1], end)
    } else {
      merged.push([start, end])
    }
  }
  return merged.map(([s, e]) => `${String(s).padStart(2, '0')}-${String(e).padStart(2, '0')}`).join(',')
}

// 两段周次字符串取并集
function unionWeeks(a, b) {
  if (!a) return b
  if (!b) return a
  return weekRangesToString([...parseWeekRanges(a), ...parseWeekRanges(b)])
}

// 解析单个课程块（名称已从 <font> 提取，剩余部分是教室/老师/周次等）
function parseCourseBlock(name, tailHtml) {
  const course = { name: cleanInline(name), teacher: '', location: '', weeks: '', single: true, double: true }
  const lines = cleanCellLines(tailHtml)
  for (const line of lines) {
    // 行内可能有多个方括号块，如 "[双] [晋江A116]"（&nbsp; 已被转为空格）
    const brackets = [...line.matchAll(/\[([^\]]*)\]/g)]
    if (brackets.length > 0) {
      for (const bracket of brackets) {
        const inner = bracket[1].trim()
        if (!inner) continue
        if (inner === '单') {
          course.single = true
          course.double = false
          continue
        }
        if (inner === '双') {
          course.single = false
          course.double = true
          continue
        }
        course.location = inner // 教室
      }
    }
    // 去掉方括号块后的剩余文本
    const rest = line.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
    if (!rest) continue
    if (/^\d{1,2}-\d{1,2}$/.test(rest)) {
      course.weeks = rest
      continue
    }
    if (!course.name) {
      course.name = rest
      continue
    }
    if (!course.teacher) {
      course.teacher = rest
    }
  }
  return course.name ? course : null
}

// 一个 <td> 内可能按周次拆分多门课（每个课程名都包在 <font> 里），
// 这里按 <font> 边界切成多个课程块分别解析，避免信息互相覆盖/丢课。
function parseCourseCell(tdHtml) {
  const names = [...tdHtml.matchAll(/<font\b[^>]*>([\s\S]*?)<\/font>/gi)]
  if (names.length === 0) {
    // 无 <font> 课程名标记：兼容个别不含标记的单元格，按单块解析
    const parsed = parseCourseBlock('', tdHtml)
    return parsed ? [parsed] : []
  }
  const courses = []
  for (let i = 0; i < names.length; i++) {
    const tailStart = names[i].index + names[i][0].length
    const tailEnd = i + 1 < names.length ? names[i + 1].index : tdHtml.length
    const parsed = parseCourseBlock(names[i][1], tdHtml.slice(tailStart, tailEnd))
    if (parsed) courses.push(parsed)
  }
  return courses
}

export function parseCourseTable(html) {
  // 只解析课表内容容器，避开页面外围布局表格
  const container = html.match(/<span\s+id="ContentPlaceHolder1_LB_kb"[^>]*>([\s\S]*?)<\/span>/i)
  const inner = (container ? container[1] : html) || ''

  const periods = []
  const courses = []
  let segment = ''
  let segmentRemaining = 0

  for (const rowMatch of inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...rowMatch[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)]
    // 表头行/备注行等非课表行直接跳过（课表数据行：段首行 9 列，段内行 8 列）
    if (tds.length < 8) continue

    let idx = 0
    const firstAttrs = tds[0][1] || ''
    if (/rowspan/i.test(firstAttrs)) {
      // 段首行：上午/下午/晚上 标签占 index 0，节次格从 index 1 开始
      segment = cleanInline(tds[0][2]) || segment
      const span = Number((firstAttrs.match(/rowspan\s*=\s*['"]?(\d+)/i) || [])[1] || 1)
      segmentRemaining = span - 1
      idx = 1
    } else {
      // 段内行：没有段标签格，节次格就在 index 0
      if (segmentRemaining > 0) segmentRemaining--
      idx = 0
    }

    const periodMatch = cleanInline(tds[idx][2]).match(/(\d{1,2})\s+([\d:]{4,5})-([\d:]{4,5})/)
    if (!periodMatch) continue

    const number = Number(periodMatch[1])
    periods.push({ number, time: `${periodMatch[2]}-${periodMatch[3]}`, segment })
    idx++
    for (let day = 0; day < 7; day++) {
      const parsedList = parseCourseCell(tds[idx + day][2])
      for (const parsed of parsedList) {
        courses.push({ ...parsed, day, start: number, end: number })
      }
    }
  }

  // 1) 同一格（同 day/start/end）的同名同师同地课程：周次取并集（如 01-12 + 13-14 -> 01-14）
  const slotMerged = []
  for (const course of courses) {
    const prev = slotMerged.find(
      (p) =>
        p.day === course.day &&
        p.start === course.start &&
        p.end === course.end &&
        p.name === course.name &&
        p.teacher === course.teacher &&
        p.location === course.location,
    )
    if (prev) {
      prev.weeks = unionWeeks(prev.weeks, course.weeks)
    } else {
      slotMerged.push({ ...course })
    }
  }

  // 2) 按 星期 -> 节次 排序后合并相邻节次的同一门课（如第3、4节同一课程 -> start=3,end=4）。
  //    用“同一 day 内 end 恰好接上 start-1”的最近一条，而不是 merged 最后一条，
  //    避免同节次多门课时（如 3 节有课A+课B）漏合并。
  const sorted = [...slotMerged].sort((a, b) => a.day - b.day || a.start - b.start)
  const merged = []
  for (const course of sorted) {
    const prev = [...merged].reverse().find(
      (p) =>
        p.day === course.day &&
        p.name === course.name &&
        p.teacher === course.teacher &&
        p.location === course.location &&
        p.weeks === course.weeks &&
        p.end === course.start - 1,
    )
    if (prev) {
      prev.end = course.end
    } else {
      merged.push({ ...course })
    }
  }

  return { periods, courses: merged }
}
