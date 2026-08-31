/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { parseCourseTable } from './course-parser.mjs'
import {
  DEMO_ACCOUNT,
  DEMO_PASSWORD,
  DEMO_TERM,
  DEMO_TERMS,
  demoCalendar,
  demoCaptchaSvg,
  demoCourses,
  demoExams,
  demoLocateDate,
  demoPeriods,
  demoProfile,
} from './demo-data.mjs'

const PORT = Number(process.env.FZU_PROXY_PORT || 8788)
const TARGET_ORIGIN = 'https://jwcjwxt2.fzu.edu.cn:82'
const COURSE_ORIGIN = 'https://jwcjwxt2.fzu.edu.cn:81'
const LOGIN_PAGE = `${TARGET_ORIGIN}/login.htm`
const COURSE_PATH = '/student/xkjg/wdkb/kb_xs.aspx'
const EXAM_PATH = '/student/xkjg/examination/exam_list.aspx'
// 学历信息页：学号/姓名/学院/年级等个人字段（xmpy_cszt.aspx）
const PROFILE_PATH = '/student/hdxx/xmpy_cszt.aspx'
const FALLBACK_COURSE_URL = `${COURSE_ORIGIN}${COURSE_PATH}`
const DEFAULT_COURSE_URL = process.env.FZU_COURSE_URL || FALLBACK_COURSE_URL
const EXAM_URL = `${COURSE_ORIGIN}${EXAM_PATH}`
const PROFILE_URL = `${COURSE_ORIGIN}${PROFILE_PATH}`
// 教务处"当前教学周"接口：返回 JS 变量 week/xn/xq（当前周/学年/学期）
const LOCATE_DATE_URL = `${TARGET_ORIGIN}/week.asp`
// 教务处"校历"接口：返回当前学期 + 各学期起止日期
const SCHOOL_CALENDAR_URL = `${TARGET_ORIGIN}/xl.asp`
// 更新清单默认地址（与 electron/main.cjs 保持一致；主进程会显式传入 url，这里仅作兜底）
// 注意：用显式分支名 @develop，不能用 @latest（jsDelivr 会缓存 @latest 的解析结果约 12 小时）
const UPDATE_MANIFEST_URL =
  process.env.FZU_UPDATE_MANIFEST_URL || 'https://cdn.jsdelivr.net/gh/Jelosy0213/FUU-Desktop@develop/update.json'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
const sessions = new Map()

function sessionId() {
  return crypto.randomBytes(24).toString('hex')
}

function getSession(req, res) {
  const incoming = req.headers.cookie?.match(/(?:^|; )fzu_proxy_session=([^;]+)/)?.[1]
  const id = incoming && sessions.has(incoming) ? incoming : sessionId()
  if (!sessions.has(id)) sessions.set(id, { cookies: new Map(), initialized: false, courseId: '', demo: false })
  res.setHeader('Set-Cookie', `fzu_proxy_session=${id}; Path=/; HttpOnly; SameSite=Lax`)
  return sessions.get(id)
}

// 解析查询参数（account 等），失败返回空对象
function parseQuery(url) {
  try {
    return Object.fromEntries(new URL(url, 'http://localhost').searchParams)
  } catch {
    return {}
  }
}

// 是否演示账号：数据接口以请求携带的 account 为准（会话标记兜底），
// 这样应用重启后代理内存会话清空时，演示数据仍可直接返回，无需网络
function isDemoSession(session, account) {
  return Boolean(session.demo) || (account !== undefined && account === DEMO_ACCOUNT)
}

function requestTarget(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = /^https?:\/\//i.test(path) ? new URL(path) : new URL(path, TARGET_ORIGIN)
    const client = url.protocol === 'https:' ? https : http
    const request = client.request(
      url,
      {
        method: options.method || 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept:
            options.accept ||
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Connection: 'keep-alive',
          ...options.headers,
        },
        rejectUnauthorized: true,
        timeout: options.timeout || 0,
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () =>
          resolve({
            status: response.statusCode || 500,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        )
      },
    )
    request.on('error', reject)
    request.on('timeout', () => {
      request.destroy(new Error(`请求超时（${(options.timeout || 0) / 1000} 秒）`))
    })
    if (options.body) request.write(options.body)
    request.end()
  })
}

function applyCookies(session, response) {
  const names = []
  for (const value of response.headers['set-cookie'] || []) {
    const pair = value.split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator > 0) {
      const name = pair.slice(0, separator)
      session.cookies.set(name, pair.slice(separator + 1))
      names.push(name)
    }
  }
  return names
}

function cookieHeader(session) {
  return [...session.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}

function cookieNames(session) {
  return [...session.cookies.keys()]
}

function responseSnippet(buffer) {
  return buffer.toString('utf8').replace(/\s+/g, ' ').slice(0, 500)
}

function logStep(label, payload) {
  console.log(`[${new Date().toISOString()}] ${label}`, payload)
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body)
}

// 解析 week.asp 返回的 JS 脚本：var week = "12"; //... var xn = "2026"; //... var xq = "01";
function parseLocateDate(text) {
  const match = text.match(/var week = "([0-9]+)";\s*[\s\S]*?var xn = "([0-9]{4})";\s*[\s\S]*?var xq = "([0-9]{2})";/)
  if (!match) return null
  return { week: Number(match[1]), year: match[2], term: match[3] }
}

// 解析 xl.asp 校历：option value 编码学期起止日期，形如 2024012024082620250117
//  [0:6] 学期ID [6:14] 开始日期 [14:22] 结束日期
//  注意：option 的 value 可能不带引号（value=2024012024082620250117）
function parseSchoolCalendar(text) {
  const optionValues = [...text.matchAll(/<option[^>]*value\s*=\s*['"]?(\d{22})['"]?[^>]*>/gi)].map((m) => m[1])
  const terms = optionValues.map((raw) => ({
    term: raw.slice(0, 6),
    startDate: `${raw.slice(6, 10)}-${raw.slice(10, 12)}-${raw.slice(12, 14)}`,
    endDate: `${raw.slice(14, 18)}-${raw.slice(18, 20)}-${raw.slice(20, 22)}`,
  }))
  // 当前学期：优先匹配"当前学期：202601"文本（页面为 GB2312 时中文会乱码匹配不上），
  // 兜底取第一个 option 的学期（xl.asp 首个 option 即当前学期）
  const currentTerm = text.match(/当前学期[：:]\s*(\d{6})/)?.[1] || optionValues[0]?.slice(0, 6) || ''
  return { currentTerm, terms }
}

// 提取 ASP.NET 页面的 hidden input 值（如 __VIEWSTATE / __EVENTVALIDATION）
function extractHiddenInput(text, name) {
  return (
    text.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`))?.[1] ||
    text.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`))?.[1] ||
    ''
  )
}

function cleanHtmlText(value) {
  return value
    .replace(/<br\s*\/?>(\s*)/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseExamSchedule(value) {
  const text = cleanHtmlText(value)
  const dateMatch = text.match(/\d{4}[年]?(\d{1,2})[月](\d{1,2})日|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/)
  const timeMatch = text.match(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/)
  if (!dateMatch) return { date: '', time: '', location: '' }
  const dateText = dateMatch[0]
  const normalizedDate = dateText.replace(/[年月]/g, '-').replace(/日/g, '')
  const dateParts = normalizedDate.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (!dateParts) return { date: '', time: '', location: '' }
  const date = `${dateParts[1]}-${String(dateParts[2]).padStart(2, '0')}-${String(dateParts[3]).padStart(2, '0')}`
  const time = timeMatch?.[0].replace(/\s+/g, '') || ''
  const location = text
    .replace(dateText, '')
    .replace(timeMatch?.[0] || '', '')
    .trim()
  return { date, time, location }
}

function parseExamList(html) {
  const table = html.match(/<table\s+id=["']ContentPlaceHolder1_DataList_xxk["'][^>]*>([\s\S]*?)<\/table>/i)?.[1] || ''
  const rows = [...table.matchAll(/<tr\b[^>]*style=["'][^"']*height:30px[\s\S]*?["'][^>]*>([\s\S]*?)<\/tr>/gi)]
  const exams = []
  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cleanHtmlText(m[1]))
    if (cells.length < 5 || /课程名称/.test(cells[0] || '')) continue
    const schedule = parseExamSchedule(cells[3] || '')
    if (!schedule.date) continue
    exams.push({
      name: cells[0] || '未命名考试',
      date: schedule.date,
      time: schedule.time,
      location: schedule.location,
      seat: cells[4] || '',
      type: '',
      teacher: cells[2] || '',
      raw: cells,
    })
  }
  return exams
}

// 解析学历信息页（xmpy_cszt.aspx）的各字段：span id 形如 ContentPlaceHolder1_LB_xh，
// 返回中文键映射，如 { 学号: '852302111', 姓名: '江立烨', 学院名称: '先进制造学院', 年级: '2023' }
function parseProfileInfo(html) {
  const fieldIds = {
    xh: '学号',
    xm: '姓名',
    xb: '性别',
    csrq: '出生日期',
    mz: '民族',
    zzmm: '政治面貌',
    nj: '年级',
    xymc: '学院名称',
    zymc: '专业名称',
    xz: '学制',
    pycc: '培养层次',
    rxny: '入学日期',
  }
  const profile = {}
  for (const [id, label] of Object.entries(fieldIds)) {
    const value =
      html.match(new RegExp(`id="ContentPlaceHolder1_LB_${id}"[^>]*>([\\s\\S]*?)<\\/span>`, 'i'))?.[1] || ''
    if (value) profile[label] = cleanHtmlText(value)
  }
  return profile
}

function normalizeMaybeEncodedUrl(value) {
  let normalized = value.replace(/&amp;/g, '&').replace(/^['"`]|['"`]$/g, '').trim()
  try {
    normalized = decodeURIComponent(normalized)
  } catch {}
  return normalized.startsWith('http') ? normalized : `https://jwcjwxt2.fzu.edu.cn/${normalized.replace(/^\/+/, '')}`
}

function findSsoLoginUrl(text, location) {
  const source = [location, text].filter(Boolean).join('\n')
  const match = source.match(/https?:\/\/jwcjwxt2\.fzu\.edu\.cn\/ssoLogin\.asp[^'"<>\s]+|ssoLogin\.asp[^'"<>\s]+/i)
  return match ? normalizeMaybeEncodedUrl(match[0]) : ''
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function ensureSessionInitialized(session) {
  if (session.initialized) return
  const result = await requestTarget('/login.htm', {
    headers: {
      Cookie: cookieHeader(session),
      Referer: LOGIN_PAGE,
    },
  })
  applyCookies(session, result)
  session.initialized = true
  logStep('session:init', {
    status: result.status,
    contentType: result.headers['content-type'],
    bodyBytes: result.body.length,
    cookieNames: cookieNames(session),
  })
}

async function ensureCourseSessionInitialized(session) {
  if (session.courseInitialized) return
  const result = await requestTarget(COURSE_ORIGIN, {
    headers: {
      Cookie: cookieHeader(session),
      Referer: TARGET_ORIGIN,
      'Upgrade-Insecure-Requests': '1',
    },
  })
  applyCookies(session, result)
  session.courseInitialized = true
  logStep('course-session:init', {
    status: result.status,
    location: result.headers.location,
    contentType: result.headers['content-type'],
    bodyBytes: result.body.length,
    cookieNames: cookieNames(session),
    snippet: responseSnippet(result.body),
  })
}

async function completeLearunSso(session, ssoUrl) {
  if (!ssoUrl) {
    logStep('sso:skip', { reason: '未在登录响应中找到 ssoLogin.asp' })
    return false
  }
  const loginPage = await requestTarget(ssoUrl, {
    headers: {
      Cookie: cookieHeader(session),
      Referer: LOGIN_PAGE,
    },
  })
  const loginCookieNames = applyCookies(session, loginPage)
  const parsed = new URL(ssoUrl)
  const token = parsed.searchParams.get('token')
  const homeId = parsed.searchParams.get('id') || ''
  session.homeId = homeId
  const homeUrl = `https://jwcjwxt2.fzu.edu.cn/Home/index?id=${encodeURIComponent(homeId)}&hosturl=${encodeURIComponent(COURSE_ORIGIN)}&ssologin=`
  const homeResult = await requestTarget(homeUrl, {
    headers: {
      Cookie: cookieHeader(session),
      Referer: ssoUrl,
      'Upgrade-Insecure-Requests': '1',
    },
  })
  const homeCookieNames = applyCookies(session, homeResult)
  const rawReturnUrl = parsed.searchParams.get('returnurl') ? decodeURIComponent(parsed.searchParams.get('returnurl')) : ''
  let returnUrl = rawReturnUrl
  if (returnUrl) {
    const callbackUrl = new URL(returnUrl)
    for (const name of ['id', 'num', 'hosturl', 'ssourl', 'ssologin']) {
      const value = parsed.searchParams.get(name)
      if (value !== null) callbackUrl.searchParams.set(name, value)
    }
    returnUrl = callbackUrl.toString()
  }
  if (!token) {
    logStep('sso:skip', { reason: 'ssoLogin.asp 缺少 token', url: ssoUrl })
    return false
  }
  const body = new URLSearchParams({ token }).toString()
  const result = await requestTarget('https://jwcjwxt2.fzu.edu.cn/Sfrz/SSOLogin', {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(session),
      Origin: 'https://jwcjwxt2.fzu.edu.cn',
      Referer: ssoUrl,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(body),
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  })
  applyCookies(session, result)
  const text = result.body.toString('utf8')
  let payload
  try {
    payload = JSON.parse(text)
  } catch {}
  const success = payload?.code === 200 || payload?.code === 0 || payload?.success === true
  let returnResult = null
  let returnCookieNames = []
  let redirectResult = null
  let redirectCookieNames = []
  let returnLocation = ''
  if (success && returnUrl) {
    returnResult = await requestTarget(returnUrl, {
      headers: {
        Cookie: cookieHeader(session),
        Host: 'jwcjwxt2.fzu.edu.cn:81',
        Origin: 'https://jwcjwxt2.fzu.edu.cn',
        Referer: ssoUrl,
        'Upgrade-Insecure-Requests': '1',
      },
    })
    returnCookieNames = applyCookies(session, returnResult)
    returnLocation = returnResult.headers.location ? normalizeMaybeEncodedUrl(returnResult.headers.location) : ''
    if (returnLocation) {
      const redirectedHomeId = new URL(returnLocation).searchParams.get('id') || ''
      if (redirectedHomeId) {
        session.homeId = redirectedHomeId
      }
      redirectResult = await requestTarget(returnLocation, {
        headers: {
          Cookie: cookieHeader(session),
          Host: 'jwcjwxt2.fzu.edu.cn',
          Referer: returnUrl,
          'Upgrade-Insecure-Requests': '1',
        },
      })
      redirectCookieNames = applyCookies(session, redirectResult)
    }
  }
  logStep('sso:done', {
    status: result.status,
    contentType: result.headers['content-type'],
    bodyBytes: result.body.length,
    success,
    payloadCode: payload?.code,
    loginCookieNames,
    homeCookieNames,
    returnCookieNames,
    redirectCookieNames,
    returnUrl: returnUrl || undefined,
    returnStatus: returnResult?.status,
    returnLocation: returnLocation || undefined,
    redirectStatus: redirectResult?.status,
    redirectLocation: redirectResult?.headers?.location,
    returnSnippet: returnResult ? responseSnippet(returnResult.body) : undefined,
    redirectSnippet: redirectResult ? responseSnippet(redirectResult.body) : undefined,
    cookieNames: cookieNames(session),
  })
  return success
}

async function visitModule(session, account, moduleName, moduleUrl) {
  const homeId = session.homeId || account
  const body = new URLSearchParams({
    moduleName,
    moduleUrl,
  }).toString()
  const result = await requestTarget('https://jwcjwxt2.fzu.edu.cn/Home/VisitModule', {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(session),
      Origin: 'https://jwcjwxt2.fzu.edu.cn',
      Referer: `https://jwcjwxt2.fzu.edu.cn/Home/index?id=${homeId}&hosturl=${encodeURIComponent(COURSE_ORIGIN)}&ssologin=`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(body),
      'X-Requested-With': 'XMLHttpRequest',
      account,
    },
    body,
  })
  applyCookies(session, result)
  logStep('course-visit:done', {
    status: result.status,
    location: result.headers.location,
    contentType: result.headers['content-type'],
    bodyBytes: result.body.length,
    cookieNames: cookieNames(session),
    snippet: responseSnippet(result.body),
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const session = getSession(req, res)
  try {
    if (req.method === 'GET' && req.url?.startsWith('/api/captcha')) {
      const { account } = parseQuery(req.url)
      if (account === DEMO_ACCOUNT) {
        // 演示账号：无需真实验证码，直接返回占位图
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' })
        res.end(demoCaptchaSvg())
        return
      }
      await ensureSessionInitialized(session)
      logStep('captcha:start', { cookieNames: cookieNames(session) })
      const result = await requestTarget(`/plus/verifycode.asp?n=${Math.random()}`, {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        headers: {
          Cookie: cookieHeader(session),
          Referer: LOGIN_PAGE,
        },
      })
      applyCookies(session, result)
      logStep('captcha:done', {
        status: result.status,
        contentType: result.headers['content-type'],
        bodyBytes: result.body.length,
        cookieNames: cookieNames(session),
        snippet: String(result.headers['content-type']).includes('text/html')
          ? responseSnippet(result.body)
          : undefined,
      })
      res.writeHead(result.status, {
        'Content-Type': result.headers['content-type'] || 'image/gif',
        'Cache-Control': 'no-store',
      })
      res.end(result.body)
      return
    }

    if (req.method === 'POST' && req.url === '/api/login') {
      const input = JSON.parse(await readBody(req))
      // 演示账号：密码匹配即登录成功，无需真实教务会话与验证码
      if (input.username?.trim() === DEMO_ACCOUNT && input.password === DEMO_PASSWORD) {
        session.demo = true
        logStep('demo:login', { username: input.username })
        sendJson(res, 200, { success: true, message: '登录成功（演示数据）' })
        return
      }
      await ensureSessionInitialized(session)
      if (!input.username || !input.password || !input.verifyCode) {
        sendJson(res, 400, { success: false, message: '请填写账号、密码和验证码' })
        return
      }
      const fullPasswordMd5 = crypto.createHash('md5').update(input.password).digest('hex')
      const password = fullPasswordMd5.slice(8, 24)
      const form = new URLSearchParams({
        muser: input.username,
        passwd: password,
        Verifycode: input.verifyCode,
      }).toString()
      logStep('login:start', {
        usernameLength: String(input.username).length,
        verifyCodeLength: String(input.verifyCode).length,
        passwordHashLength: password.length,
        cookieNames: cookieNames(session),
      })
      const result = await requestTarget('/logincheck.asp', {
        method: 'POST',
        headers: {
          Cookie: cookieHeader(session),
          Origin: TARGET_ORIGIN,
          Referer: LOGIN_PAGE,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(form),
        },
        body: form,
      })
      applyCookies(session, result)
      const text = result.body.toString('utf8')
      const snippet = responseSnippet(result.body)
      const ssoUrl = findSsoLoginUrl(text, result.headers.location)
      const alertMessage = text.match(/alert\(['"]([^'"]+)['"]\)/)?.[1]
      const failed = /验证码|密码|用户名|登录失败|错误|失败/.test(text)
      if (!failed && ssoUrl) {
        await completeLearunSso(session, ssoUrl)
      }
      logStep('login:done', {
        status: result.status,
        location: result.headers.location,
        contentType: result.headers['content-type'],
        bodyBytes: result.body.length,
        failed,
        ssoUrl: ssoUrl || undefined,
        cookieNames: cookieNames(session),
        snippet,
      })
      sendJson(res, failed ? 401 : 200, {
        success: !failed,
        message: failed ? alertMessage || '登录失败，请检查账号、密码或验证码' : '登录成功',
        status: result.status,
        location: result.headers.location,
        snippet,
      })
      return
    }

    if (req.method === 'POST' && req.url === '/api/course-page') {
      const input = JSON.parse(await readBody(req) || '{}')
      const account = String(input.account || '').trim()
      if (isDemoSession(session, account)) {
        const requestedTerm = String(input.term || '').trim() || DEMO_TERM
        logStep('demo:course-page', { account, term: requestedTerm })
        sendJson(res, 200, {
          success: true,
          message: '课表获取成功（演示数据）',
          title: '我的课表（演示）',
          semester: requestedTerm,
          terms: DEMO_TERMS,
          periods: demoPeriods(),
          courses: demoCourses(requestedTerm),
          snippet: '',
          htmlLength: 0,
        })
        return
      }
      const homeId = session.homeId || account
      const targetUrl = input.url || (homeId ? `${COURSE_ORIGIN}${COURSE_PATH}?id=${encodeURIComponent(homeId)}` : DEFAULT_COURSE_URL)
      let parsedTarget
      try {
        parsedTarget = new URL(targetUrl)
      } catch {
        sendJson(res, 400, { success: false, message: '课表地址格式不正确' })
        return
      }
      const allowedHost = parsedTarget.hostname === 'jwcjwxt2.fzu.edu.cn' && parsedTarget.port === '81'
      const allowedPath = parsedTarget.pathname === '/student/xkjg/wdkb/kb_xs.aspx'
      if (!allowedHost || !allowedPath) {
        sendJson(res, 400, { success: false, message: '课表地址不在允许范围内' })
        return
      }
      await ensureCourseSessionInitialized(session)
      if (account) {
        await visitModule(session, account, '我的课表', targetUrl)
      }
      logStep('course:start', {
        url: targetUrl,
        account,
        homeId,
        cookieNames: cookieNames(session),
      })
      const result = await requestTarget(targetUrl, {
        headers: {
          Cookie: cookieHeader(session),
          Origin: 'https://jwcjwxt2.fzu.edu.cn',
          Referer: `https://jwcjwxt2.fzu.edu.cn/Home/index?id=${homeId}&hosturl=${encodeURIComponent(COURSE_ORIGIN)}&ssologin=`,
          'Sec-Fetch-Dest': 'iframe',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-site',
          'Upgrade-Insecure-Requests': '1',
        },
      })
      applyCookies(session, result)
      let text = result.body.toString('utf8')
      let semester = text.match(/<option\s+selected="selected"\s+value="(\d+)"/i)?.[1] || ''

      // 切换学期：课表页是 ASP.NET postback，需携带 __VIEWSTATE / __EVENTVALIDATION 提交学期选择
      const requestedTerm = String(input.term || '').trim()
      if (requestedTerm && requestedTerm !== semester) {
        const viewState = extractHiddenInput(text, '__VIEWSTATE')
        const eventValidation = extractHiddenInput(text, '__EVENTVALIDATION')
        if (viewState && eventValidation) {
          logStep('course:change-term', { from: semester, to: requestedTerm })
          const form = new URLSearchParams({
            'ctl00$ContentPlaceHolder1$DDL_xnxq': requestedTerm,
            'ctl00$ContentPlaceHolder1$BT_submit': '确定',
            __VIEWSTATE: viewState,
            __EVENTVALIDATION: eventValidation,
          }).toString()
          const termResult = await requestTarget(targetUrl, {
            method: 'POST',
            headers: {
              Cookie: cookieHeader(session),
              Origin: COURSE_ORIGIN,
              Referer: targetUrl,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(form),
            },
            body: form,
          })
          applyCookies(session, termResult)
          text = termResult.body.toString('utf8')
          semester = text.match(/<option\s+selected="selected"\s+value="(\d+)"/i)?.[1] || requestedTerm
        }
      }

      const title =
        text.match(/<span\s+id="LB_bt"[^>]*>([\s\S]*?)<\/span>/i)?.[1]?.trim() || '我的课表'
      const snippet = responseSnippet(Buffer.from(text))
      const { periods, courses } = parseCourseTable(text)
      // 课表页内置的可选学期列表（DDL_xnxq 的 option），无需依赖校历接口
      const terms = [...text.matchAll(/<option[^>]*value="(\d{6})"[^>]*>/gi)].map((m) => m[1])
      const redirectedToLogin = /login\.htm|用户登录|Verifycode|passWord|error\.asp\?id=300|Object moved|无当前登录用户|jwch\.fzu\.edu\.cn/i.test(text)
      logStep('course:done', {
        status: result.status,
        location: result.headers.location,
        contentType: result.headers['content-type'],
        bodyBytes: result.body.length,
        redirectedToLogin,
        title,
        semester,
        terms: terms.length,
        periods: periods.length,
        courses: courses.length,
        cookieNames: cookieNames(session),
        snippet,
      })
      sendJson(res, redirectedToLogin ? 401 : 200, {
        success: !redirectedToLogin,
        message: redirectedToLogin ? '课表页要求重新登录或 Cookie 不完整' : '课表获取成功',
        status: result.status,
        title,
        semester,
        terms,
        periods,
        courses,
        snippet,
        htmlLength: text.length,
      })
      return
    }

    // 个人信息：学历信息模块（xmpy_cszt.aspx），返回学号/姓名/学院/年级等字段。
    // 与课表/考表一致：先 VisitModule 激活模块会话，再直取模块页。
    if (req.method === 'POST' && req.url === '/api/profile') {
      const input = JSON.parse(await readBody(req) || '{}')
      const account = String(input.account || '').trim()
      if (isDemoSession(session, account)) {
        logStep('demo:profile', { account })
        sendJson(res, 200, {
          success: true,
          message: '个人信息获取成功（演示数据）',
          profile: demoProfile(),
          snippet: '',
          htmlLength: 0,
        })
        return
      }
      const homeId = session.homeId || account
      const targetUrl = homeId ? `${COURSE_ORIGIN}${PROFILE_PATH}?id=${encodeURIComponent(homeId)}` : PROFILE_URL
      await ensureCourseSessionInitialized(session)
      if (account) await visitModule(session, account, '学历信息', targetUrl)
      const result = await requestTarget(targetUrl, {
        headers: {
          Cookie: cookieHeader(session),
          Origin: 'https://jwcjwxt2.fzu.edu.cn',
          Referer: `https://jwcjwxt2.fzu.edu.cn/Home/index?id=${homeId}&hosturl=${encodeURIComponent(COURSE_ORIGIN)}&ssologin=`,
          'Sec-Fetch-Dest': 'iframe',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-site',
          'Upgrade-Insecure-Requests': '1',
        },
      })
      applyCookies(session, result)
      const text = result.body.toString('utf8')
      const profile = parseProfileInfo(text)
      const redirectedToLogin = /login\.htm|用户登录|Verifycode|passWord|error\.asp\?id=300|Object moved|无当前登录用户|jwch\.fzu\.edu\.cn/i.test(text)
      const snippet = responseSnippet(result.body)
      logStep('profile:done', {
        status: result.status,
        redirectedToLogin,
        fields: Object.keys(profile).length,
        cookieNames: cookieNames(session),
        snippet,
      })
      sendJson(res, redirectedToLogin ? 401 : 200, {
        success: !redirectedToLogin,
        message: redirectedToLogin ? '个人信息页要求重新登录或 Cookie 不完整' : '个人信息获取成功',
        profile,
        snippet,
        htmlLength: text.length,
      })
      return
    }

    // 会话保活 + 过期检测：轻量访问主站 week.asp 与课表站根路径，
    // 保持教务会话活跃（若教务处为滑动过期策略），同时判断会话是否已失效。
    if (req.method === 'POST' && req.url === '/api/exam-list') {
      const input = JSON.parse(await readBody(req) || '{}')
      const account = String(input.account || '').trim()
      if (isDemoSession(session, account)) {
        const requestedTerm = String(input.term || '').trim() || DEMO_TERM
        logStep('demo:exam-list', { account, term: requestedTerm })
        sendJson(res, 200, {
          success: true,
          message: '考试信息获取成功（演示数据）',
          title: '我的考表（演示）',
          exams: demoExams(requestedTerm),
          snippet: '',
          htmlLength: 0,
        })
        return
      }
      const homeId = session.homeId || account
      const targetUrl = input.url || (homeId ? `${COURSE_ORIGIN}${EXAM_PATH}?id=${encodeURIComponent(homeId)}` : EXAM_URL)
      await ensureCourseSessionInitialized(session)
      if (account) await visitModule(session, account, '我的考表', targetUrl)
      const result = await requestTarget(targetUrl, {
        headers: {
          Cookie: cookieHeader(session),
          Origin: 'https://jwcjwxt2.fzu.edu.cn',
          Referer: `https://jwcjwxt2.fzu.edu.cn/Home/index?id=${session.homeId || account}&hosturl=${encodeURIComponent(COURSE_ORIGIN)}&ssologin=`,
          'Sec-Fetch-Dest': 'iframe',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-site',
          'Upgrade-Insecure-Requests': '1',
        },
      })
      applyCookies(session, result)
      let text = result.body.toString('utf8')
      let semester = text.match(/<option\s+selected="selected"\s+value="(\d+)"/i)?.[1] || ''

      const requestedTerm = String(input.term || '').trim()
      if (requestedTerm && requestedTerm !== semester) {
        const viewState = extractHiddenInput(text, '__VIEWSTATE')
        const eventValidation = extractHiddenInput(text, '__EVENTVALIDATION')
        if (viewState && eventValidation) {
          logStep('exam:change-term', { from: semester, to: requestedTerm })
          const form = new URLSearchParams({
            'ctl00$ContentPlaceHolder1$DDL_xnxq': requestedTerm,
            'ctl00$ContentPlaceHolder1$BT_submit': '确定',
            __VIEWSTATE: viewState,
            __EVENTVALIDATION: eventValidation,
          }).toString()
          const termResult = await requestTarget(targetUrl, {
            method: 'POST',
            headers: {
              Cookie: cookieHeader(session),
              Origin: COURSE_ORIGIN,
              Referer: targetUrl,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(form),
            },
            body: form,
          })
          applyCookies(session, termResult)
          text = termResult.body.toString('utf8')
          semester = text.match(/<option\s+selected="selected"\s+value="(\d+)"/i)?.[1] || requestedTerm
        }
      }

      const exams = parseExamList(text)
      const terms = [...text.matchAll(/<option[^>]*value="(\d{6})"[^>]*>/gi)].map((m) => m[1])
      const redirectedToLogin = /login\.htm|用户登录|Verifycode|passWord|error\.asp\?id=300|Object moved|无当前登录用户|jwch\.fzu\.edu\.cn/i.test(text)
      const snippet = responseSnippet(Buffer.from(text))
      logStep('exam:done', { status: result.status, semester, terms: terms.length, exams: exams.length, redirectedToLogin, cookieNames: cookieNames(session), snippet })
      sendJson(res, redirectedToLogin ? 401 : 200, {
        success: !redirectedToLogin,
        message: redirectedToLogin ? '考试页面要求重新登录或 Cookie 不完整' : '考试信息获取成功',
        title: '我的考表',
        exams,
        snippet,
        htmlLength: text.length,
      })
      return
    }

    if (req.method === 'GET' && req.url === '/api/keep-alive') {
      await ensureSessionInitialized(session)
      const weekResult = await requestTarget(LOCATE_DATE_URL, {
        headers: {
          Cookie: cookieHeader(session),
          Referer: LOGIN_PAGE,
        },
      })
      applyCookies(session, weekResult)
      const weekText = weekResult.body.toString('utf8')
      const located = parseLocateDate(weekText)
      const redirectedToLogin = /login\.htm|用户登录|Verifycode|passWord|error\.asp\?id=300|Object moved|无当前登录用户/i.test(weekText)
      const expired = !located && redirectedToLogin
      // 保活课表站（:81）会话：访问其根路径，收集可能续期的 cookie
      const coursePing = await requestTarget(COURSE_ORIGIN, {
        headers: {
          Cookie: cookieHeader(session),
          Referer: TARGET_ORIGIN,
          'Upgrade-Insecure-Requests': '1',
        },
      })
      applyCookies(session, coursePing)
      logStep('keep-alive:done', {
        expired,
        week: located?.week,
        courseStatus: coursePing.status,
        cookieNames: cookieNames(session),
      })
      sendJson(res, 200, { success: true, expired })
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/locate-date')) {
      const { account } = parseQuery(req.url)
      if (isDemoSession(session, account)) {
        const located = demoLocateDate()
        logStep('demo:locate-date', { account, located })
        sendJson(res, 200, {
          success: true,
          message: '当前周数获取成功（演示数据）',
          week: located.week,
          year: located.year,
          term: located.term,
          semester: located.semester,
        })
        return
      }
      await ensureSessionInitialized(session)
      logStep('locate-date:start', { cookieNames: cookieNames(session) })
      const result = await requestTarget(LOCATE_DATE_URL, {
        headers: {
          Cookie: cookieHeader(session),
          Referer: LOGIN_PAGE,
        },
      })
      applyCookies(session, result)
      const text = result.body.toString('utf8')
      const located = parseLocateDate(text)
      logStep('locate-date:done', {
        status: result.status,
        contentType: result.headers['content-type'],
        bodyBytes: result.body.length,
        located,
        snippet: responseSnippet(result.body),
      })
      if (!located) {
        sendJson(res, 502, { success: false, message: '未能从教务处解析当前周数' })
        return
      }
      sendJson(res, 200, {
        success: true,
        message: '当前周数获取成功',
        week: located.week,
        year: located.year,
        term: located.term,
        semester: `${located.year}${located.term}`,
      })
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/school-calendar')) {
      const { account } = parseQuery(req.url)
      if (isDemoSession(session, account)) {
        const calendar = demoCalendar()
        logStep('demo:school-calendar', { account, currentTerm: calendar.currentTerm })
        sendJson(res, 200, {
          success: true,
          message: '校历获取成功（演示数据）',
          currentTerm: calendar.currentTerm,
          terms: calendar.terms,
        })
        return
      }
      await ensureSessionInitialized(session)
      logStep('school-calendar:start', { cookieNames: cookieNames(session) })
      const result = await requestTarget(SCHOOL_CALENDAR_URL, {
        headers: {
          Cookie: cookieHeader(session),
          Referer: LOGIN_PAGE,
        },
      })
      applyCookies(session, result)
      const text = result.body.toString('utf8')
      const calendar = parseSchoolCalendar(text)
      logStep('school-calendar:done', {
        status: result.status,
        contentType: result.headers['content-type'],
        bodyBytes: result.body.length,
        currentTerm: calendar.currentTerm,
        terms: calendar.terms.length,
      })
      if (calendar.terms.length === 0) {
        sendJson(res, 502, { success: false, message: '未能从教务处解析校历' })
        return
      }
      sendJson(res, 200, {
        success: true,
        message: '校历获取成功',
        currentTerm: calendar.currentTerm,
        terms: calendar.terms,
      })
      return
    }

    // 更新清单：主进程经本地代理拉取远程清单，代理侧输出请求状态/响应/解析结果的详细日志，
    // 便于排查"检查更新没反应/总提示已最新"等问题（可选 url 参数覆盖清单地址，便于测试）
    if (req.method === 'GET' && req.url?.startsWith('/api/update-manifest')) {
      const { url: requestedUrl } = parseQuery(req.url)
      const manifestUrl = requestedUrl || UPDATE_MANIFEST_URL
      logStep('update-manifest:start', { url: manifestUrl })
      let result
      try {
        result = await requestTarget(manifestUrl, {
          accept: 'application/json, text/plain, */*',
          timeout: 15000,
        })
      } catch (error) {
        logStep('update-manifest:error', {
          message: error instanceof Error ? error.message : '请求失败',
          code: error instanceof Error ? error.code : undefined,
          cause: error instanceof Error && error.cause ? String(error.cause) : undefined,
          url: manifestUrl,
        })
        sendJson(res, 502, {
          success: false,
          message: error instanceof Error ? error.message : '更新清单请求失败',
          url: manifestUrl,
          code: error instanceof Error ? error.code : undefined,
        })
        return
      }
      const text = result.body.toString('utf8')
      let parsed = null
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = null
      }
      const ok = result.status >= 200 && result.status < 300 && parsed && typeof parsed.version === 'string'
      logStep('update-manifest:done', {
        status: result.status,
        contentType: result.headers['content-type'],
        location: result.headers.location || undefined,
        bodyBytes: result.body.length,
        snippet: text.replace(/\s+/g, ' ').slice(0, 300),
        version: parsed?.version || '',
        hasReleaseNotes: Boolean(parsed?.releaseNotes),
      })
      sendJson(res, ok ? 200 : 502, {
        success: ok,
        message: ok ? '更新清单获取成功' : '更新清单获取失败或格式异常',
        url: manifestUrl,
        status: result.status,
        version: parsed?.version || '',
        releaseNotes: parsed?.releaseNotes || '',
        raw: text.slice(0, 2000),
      })
      return
    }

    sendJson(res, 404, { success: false, message: 'Not found' })
  } catch (error) {
    sendJson(res, 502, { success: false, message: error instanceof Error ? error.message : '代理请求失败' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`FZU local proxy listening on http://127.0.0.1:${PORT}`)
})

// 导出 server 供 Electron 主进程处理端口占用等异常
export { server }
