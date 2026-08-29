/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
const { app, BrowserWindow, ipcMain, safeStorage, screen, net, session } = require('electron')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || ''
const PROXY_PORT = Number(process.env.FZU_PROXY_PORT || 8788)

// ===== 更新检查配置 =====
// 更新清单接口地址：应返回 JSON，格式见 fetchUpdateManifest 中的 UpdateManifest。
// TODO: 更新地址待提供，配置后自动检查更新即可生效
const UPDATE_MANIFEST_URL = ''

/** @typedef {{ version: string, downloadUrl: string, releaseNotes?: string }} UpdateManifest */

// 简单语义化版本比较：1 表示 a 更新，-1 表示 b 更新，0 表示相同
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

// 用 Electron net 拉取更新清单（走系统网络栈，无 CORS 限制）
async function fetchUpdateManifest(url) {
  const response = await net.fetch(url, { method: 'GET' })
  if (!response.ok) throw new Error(`更新服务响应异常（HTTP ${response.status}）`)
  return /** @type {UpdateManifest} */ (await response.json())
}

// 检查更新：未配置地址或请求失败时不打扰用户，返回 ok:false 由渲染层决定是否提示
ipcMain.handle('update:check', async () => {
  if (!UPDATE_MANIFEST_URL) return { ok: false, hasUpdate: false, error: '更新服务暂未配置' }
  try {
    const manifest = await fetchUpdateManifest(UPDATE_MANIFEST_URL)
    const current = app.getVersion()
    const hasUpdate = compareVersions(manifest.version, current) > 0
    return {
      ok: true,
      hasUpdate,
      currentVersion: current,
      version: manifest.version,
      downloadUrl: manifest.downloadUrl,
      releaseNotes: manifest.releaseNotes || '',
    }
  } catch (error) {
    console.error('[main] 检查更新失败：', error)
    return { ok: false, hasUpdate: false, error: error instanceof Error ? error.message : '检查更新失败' }
  }
})

// 开始下载更新包：由发起方窗口的 session 触发 will-download，进度/完成事件回传该窗口
ipcMain.on('update:download', (event, url) => {
  if (!url || typeof url !== 'string') return
  event.sender.downloadURL(url)
})

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

// 启动本地代理服务：fzu-proxy.mjs 在模块加载时即开始监听 PROXY_PORT。
// 端口被占用时复用现有服务（例如开发模式下 dev:proxy 已先行启动）。
async function startProxy() {
  try {
    const { server } = await import(pathToFileURL(path.join(__dirname, '../server/fzu-proxy.mjs')).href)
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`[main] 本地代理端口 ${PROXY_PORT} 已被占用，复用现有服务`)
      } else {
        console.error('[main] 本地代理异常：', error)
      }
    })
    console.log(`[main] 本地代理服务已就绪（端口 ${PROXY_PORT}）`)
  } catch (error) {
    console.error('[main] 本地代理启动失败：', error)
  }
}

// 生产模式：用本地 HTTP 服务承载 dist 静态资源，并把 /api/* 转发到本地代理，
// 保证前端相对路径请求（/api/login 等）与 Cookie 会话在打包后依然可用。
// 端口固定（默认 1302）：localStorage 按 origin（host:port）隔离，随机端口会导致每次启动
// 登录态/缓存全部丢失（表现为"又要重新登录"），固定端口可让 origin 稳定、数据持久。
const APP_SERVER_PORT = Number(process.env.FZU_APP_SERVER_PORT || 1302)
function startAppServer() {
  const distDir = path.join(__dirname, '../dist')
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')

    if (url.pathname.startsWith('/api/')) {
      const proxyReq = http.request(
        {
          host: '127.0.0.1',
          port: PROXY_PORT,
          path: req.url,
          method: req.method,
          headers: req.headers,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
          proxyRes.pipe(res)
        },
      )
      proxyReq.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ success: false, message: '本地代理服务不可用，请稍后重试' }))
      })
      req.pipe(proxyReq)
      return
    }

    let filePath = path.resolve(distDir, '.' + decodeURIComponent(url.pathname))
    if (!filePath.startsWith(distDir)) filePath = path.join(distDir, 'index.html')
    fs.stat(filePath, (statErr, stat) => {
      if (statErr || !stat.isFile()) filePath = path.join(distDir, 'index.html')
      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Not found')
          return
        }
        res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' })
        res.end(data)
      })
    })
  })
  // 端口被占用时在基础端口附近顺延，尽量保持 origin 稳定
  return new Promise((resolve) => {
    const tryListen = (port) => {
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE' && port < APP_SERVER_PORT + 10) {
          tryListen(port + 1)
        } else {
          console.error('[main] 应用服务启动失败：', error)
        }
      })
      server.listen(port, '127.0.0.1', () => {
        server.removeAllListeners('error')
        resolve(server)
      })
    }
    tryListen(APP_SERVER_PORT)
  })
}

const preloadPath = path.join(__dirname, 'preload.cjs')
let loginWindow = null
let mainWindow = null
let miniWindow = null
let forgotWindow = null
let appUrl = ''

function windowOptions(width, height, extra = {}) {
  return {
    width,
    height,
    title: 'FZUHelper',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f7fb',
    // 运行时窗口图标（任务栏/标题栏），随 electron/ 目录一起打包
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    ...extra,
  }
}

function createLoginWindow(url) {
  loginWindow = new BrowserWindow(windowOptions(320, 540, {
    resizable: false,
    maximizable: false,
    minimizable: true,
    show: false,
  }))
  loginWindow.loadURL(`${url}/`)
  loginWindow.once('ready-to-show', () => loginWindow?.show())
  loginWindow.on('closed', () => { loginWindow = null })
  return loginWindow
}

function createMainWindow(url, username = '') {
  mainWindow = new BrowserWindow(windowOptions(1000, 700, {
    minWidth: 990,
    minHeight: 670,
    show: false,
  }))
  const sessionQuery = username ? `?session=${encodeURIComponent(username)}` : ''
  mainWindow.loadURL(`${url}/schedule${sessionQuery}`)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('maximize', () => notifyMaximized(mainWindow))
  mainWindow.on('unmaximize', () => notifyMaximized(mainWindow))
  mainWindow.on('closed', () => { mainWindow = null })
  return mainWindow
}

function showMainWindow(username) {
  if (!mainWindow) createMainWindow(appUrl, username)
  else mainWindow.show()
  loginWindow?.close()
}

const MINI_WINDOW_WIDTH = 400
const MINI_WINDOW_HEIGHT = 500

// 迷你课表小窗口：固定 400x500，不可缩放/最大化
function createMiniWindow(url, position = null) {
  miniWindow = new BrowserWindow(windowOptions(MINI_WINDOW_WIDTH, MINI_WINDOW_HEIGHT, {
    resizable: false,
    maximizable: false,
    minimizable: true,
    show: false,
  }))
  if (position) miniWindow.setPosition(position.x, position.y, false)
  miniWindow.loadURL(`${url}/mini`)
  miniWindow.once('ready-to-show', () => miniWindow?.show())
  miniWindow.on('closed', () => { miniWindow = null })
  return miniWindow
}

// 小窗贴合大窗右上角：小窗右上角与大窗右上角对齐
function miniWindowPositionAt(bounds) {
  return {
    x: bounds.x + bounds.width - MINI_WINDOW_WIDTH,
    y: bounds.y,
  }
}

// 主屏幕右上角（工作区）：迷你窗口从迷你模式重启时默认停靠的位置
function screenTopRightPosition(width, height) {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: workArea.x + workArea.width - width - 50,
    y: workArea.y + 50,
  }
}

// 进入迷你模式：隐藏主窗口，显示小窗口（生成在大窗右上角），并记录上次窗口模式
function enterMiniWindow() {
  if (!mainWindow) return
  const position = miniWindowPositionAt(mainWindow.getBounds())
  if (!miniWindow) createMiniWindow(appUrl, position) // ready-to-show 后自动显示
  else miniWindow.setPosition(position.x, position.y, false)
  mainWindow.hide()
  writeWindowMode('mini')
}

// 退出迷你模式：显示主窗口（若尚未创建则新建，如从迷你窗重启的场景），关闭小窗口，并记录上次窗口模式
function exitMiniWindow() {
  if (!mainWindow) createMainWindow(appUrl)
  else mainWindow.show()
  miniWindow?.close()
  writeWindowMode('main')
}

function createForgotWindow(url) {
  const base = windowOptions(1080, 760, {
    resizable: true,
    show: false,
  })
  forgotWindow = new BrowserWindow({
    ...base,
    webPreferences: { ...base.webPreferences, webviewTag: true },
  })
  forgotWindow.loadURL(`${url}/forgot-password`)
  forgotWindow.once('ready-to-show', () => forgotWindow?.show())
  forgotWindow.on('maximize', () => notifyMaximized(forgotWindow))
  forgotWindow.on('unmaximize', () => notifyMaximized(forgotWindow))
  forgotWindow.on('closed', () => { forgotWindow = null })
  return forgotWindow
}

function openForgotWindow() {
  if (!forgotWindow) createForgotWindow(appUrl)
  else forgotWindow.show()
}

function showLoginWindow() {
  if (!loginWindow) createLoginWindow(appUrl)
  else loginWindow.show()
  mainWindow?.close()
  miniWindow?.close()
}

// 登录成功：清除"主动退出"标记，恢复下次启动的自动登录；随后切换到主窗口
ipcMain.on('auth:login-success', (event, username) => {
  writeExplicitLogoutFlag(false)
  showMainWindow(username)
})
// 退出登录：仅"主动退出"（用户点击退出登录/切换账号）写入标记，下次启动不再自动登录；
// 会话失效导致的清理（explicit=false）不写标记，下次启动仍可尝试自动登录
ipcMain.on('auth:logout', (_event, explicit) => {
  if (explicit) writeExplicitLogoutFlag(true)
  showLoginWindow()
})

// 记住密码：通过 safeStorage 加密后落盘到用户数据目录，避免明文存储。
const credentialsFilePath = () => path.join(app.getPath('userData'), 'fzu-credentials.json')

function writeCredentialsFile(payload) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(credentialsFilePath(), JSON.stringify(payload), { mode: 0o600 })
    return true
  } catch (error) {
    console.error('[main] 凭据写入失败：', error)
    return false
  }
}

function readCredentialsFile() {
  try {
    return JSON.parse(fs.readFileSync(credentialsFilePath(), 'utf8'))
  } catch {
    return null
  }
}

ipcMain.handle('credentials:get', () => {
  const data = readCredentialsFile()
  if (!data || !safeStorage.isEncryptionAvailable()) return null
  try {
    return {
      username: safeStorage.decryptString(Buffer.from(data.username, 'base64')),
      password: safeStorage.decryptString(Buffer.from(data.password, 'base64')),
    }
  } catch {
    return null
  }
})

ipcMain.handle('credentials:set', (_event, { username, password }) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false
    return writeCredentialsFile({
      username: safeStorage.encryptString(username).toString('base64'),
      password: safeStorage.encryptString(password).toString('base64'),
    })
  } catch (error) {
    console.error('[main] 凭据加密失败：', error)
    return false
  }
})

ipcMain.handle('credentials:clear', () => {
  try {
    fs.rmSync(credentialsFilePath(), { force: true })
    return true
  } catch (error) {
    console.error('[main] 凭据清除失败：', error)
    return false
  }
})

// 主动退出登录标记：由主进程持久化，用于启动时决定直接打开主窗口（自动登录）还是登录窗（手动输入验证码）
const explicitLogoutFilePath = () => path.join(app.getPath('userData'), 'fzu-explicit-logout')

function readExplicitLogoutFlag() {
  try {
    return fs.readFileSync(explicitLogoutFilePath(), 'utf8') === '1'
  } catch {
    return false
  }
}

function writeExplicitLogoutFlag(enabled) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(explicitLogoutFilePath(), enabled ? '1' : '0')
    return true
  } catch (error) {
    console.error('[main] 主动退出标记写入失败：', error)
    return false
  }
}

ipcMain.on('auth:set-explicit-logout', (_event, enabled) => {
  writeExplicitLogoutFlag(Boolean(enabled))
})

// 启动时记忆窗口：开关状态与上次窗口模式均由主进程持久化
const windowMemoryFilePath = () => path.join(app.getPath('userData'), 'fzu-window-memory')
const windowModeFilePath = () => path.join(app.getPath('userData'), 'fzu-window-mode')

// 开关默认开启；文件缺失视为开启
function readWindowMemoryFlag() {
  try {
    return fs.readFileSync(windowMemoryFilePath(), 'utf8') !== '0'
  } catch {
    return true
  }
}

function writeWindowMemoryFlag(enabled) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(windowMemoryFilePath(), enabled ? '1' : '0')
    return true
  } catch (error) {
    console.error('[main] 窗口记忆开关写入失败：', error)
    return false
  }
}

// 上次窗口模式：'mini' | 'main'（默认 main）
function readWindowMode() {
  try {
    return fs.readFileSync(windowModeFilePath(), 'utf8') === 'mini' ? 'mini' : 'main'
  } catch {
    return 'main'
  }
}

function writeWindowMode(mode) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(windowModeFilePath(), mode === 'mini' ? 'mini' : 'main')
    return true
  } catch (error) {
    console.error('[main] 窗口模式写入失败：', error)
    return false
  }
}

ipcMain.on('settings:set-window-memory', (_event, enabled) => {
  writeWindowMemoryFlag(Boolean(enabled))
})

// 启动时能否直接自动登录：已保存加密凭据 且 非主动退出登录。
// 能则直接打开主窗口，由主页面后台识别验证码登录；否则打开登录窗手动输入
function canAutoLoginAtStartup() {
  if (readExplicitLogoutFlag()) return false
  try {
    const data = JSON.parse(fs.readFileSync(credentialsFilePath(), 'utf8'))
    return Boolean(data?.username && data?.password) && safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
function notifyMaximized(win) {
  win?.webContents.send('window:maximized', win.isMaximized())
}

ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
  notifyMaximized(win)
})
ipcMain.on('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  // 关闭迷你窗口 = 退出应用（此时主窗口处于隐藏状态，一并关闭）
  if (win === miniWindow) {
    mainWindow?.close()
    miniWindow?.close()
    return
  }
  win?.close()
})
ipcMain.on('window:enter-mini', enterMiniWindow)
ipcMain.on('window:exit-mini', exitMiniWindow)
ipcMain.on('window:open-forgot', openForgotWindow)
// 窗口内发现未登录（如迷你/主窗口内会话失效）时，切换到登录小窗
ipcMain.on('window:show-login', showLoginWindow)

app.whenReady().then(async () => {
  await startProxy()

  // 更新包下载：保存到系统"下载"目录，向发起窗口回传下载进度与完成状态
  session.defaultSession.on('will-download', (event, item, webContents) => {
    const filename = item.getFilename() || 'fzu-update'
    item.setSavePath(path.join(app.getPath('downloads'), filename))
    item.on('updated', (_e, state) => {
      if (state === 'interrupted') return
      const total = item.getTotalBytes()
      const received = item.getReceivedBytes()
      const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0
      webContents.send('update:download-progress', { percent })
    })
    item.once('done', (_e, state) => {
      webContents.send('update:download-done', {
        status: state === 'completed' ? 'completed' : 'failed',
        path: item.getSavePath(),
      })
    })
  })

  if (DEV_SERVER_URL) {
    appUrl = DEV_SERVER_URL
  } else {
    const server = await startAppServer()
    const { port } = server.address()
    console.log(`[main] 应用页面已启动：http://127.0.0.1:${port}`)
    appUrl = `http://127.0.0.1:${port}`
  }

  // 有已保存凭据且非主动退出时直接打开窗口：缓存课表即时展示，后台自动识别验证码登录；
  // 开启"启动时记忆窗口"且上次处于小窗时，直接打开小窗（停靠屏幕右上角）；否则打开主窗口
  if (canAutoLoginAtStartup()) {
    if (readWindowMemoryFlag() && readWindowMode() === 'mini') {
      createMiniWindow(appUrl, screenTopRightPosition(MINI_WINDOW_WIDTH, MINI_WINDOW_HEIGHT))
    } else createMainWindow(appUrl)
  } else {
    createLoginWindow(appUrl)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (canAutoLoginAtStartup()) {
        if (readWindowMemoryFlag() && readWindowMode() === 'mini') {
          createMiniWindow(appUrl, screenTopRightPosition(MINI_WINDOW_WIDTH, MINI_WINDOW_HEIGHT))
        } else createMainWindow(appUrl)
      } else {
        createLoginWindow(appUrl)
      }
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
