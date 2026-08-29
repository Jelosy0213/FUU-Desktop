# 福UU（第三方）

![](https://cdn.jsdelivr.net/gh/Jelosy0213/mdImage/img/img1.png)

![](https://cdn.jsdelivr.net/gh/Jelosy0213/mdImage/img/img2.png)

福州大学教务系统第三方桌面客户端（Electron + Vue 3）。

## 功能特性

- **登录与验证码**：通过本地代理访问福州大学教务处，验证码本地模板识别，支持自动/静默重新登录
- **课表**：按周展示课程卡片，支持周切换、学期切换、课程卡片动效、迷你小窗模式
- **考试列表**：查询当前学期考试安排
- **个人信息**：查看学籍信息（学号/姓名/学院/专业等）
- **校历**：当前学期及起止日期
- **记住密码**：基于 Electron `safeStorage` 加密存储，不落明文
- **窗口记忆**：退出时处于小窗则下次启动直接打开小窗
- **更新检查**：通过 GitHub Releases 自动检查新版本，支持"不再提示 / 以后再说 / 立即更新（带下载进度）"
- **开源**：GPL-3.0

## 项目结构

```
├── electron/               # 主进程与预加载脚本
│   ├── main.cjs            # 主进程：本地代理/静态服务、窗口管理、更新下载
│   └── preload.cjs         # contextBridge 暴露的渲染层 API
├── server/                 # 本地服务
│   ├── fzu-proxy.mjs       # 教务处反向代理（端口 8788），维护教务会话
│   └── course-parser.mjs   # 课表/考试/个人页 HTML 解析
├── src/                    # 渲染进程（Vue）
│   ├── components/         # 组件（含 UpdateDialog 更新弹窗）
│   ├── views/              # 页面（登录/课表/迷你课表/忘记密码）
│   ├── stores/             # Pinia 状态（auth 等）
│   ├── utils/              # 工具（验证码识别、更新检查等）
│   └── scripts/            # 配套油猴脚本（验证码识别）
├── build/                  # electron-builder 打包资源（应用图标等）
└── public/                 # 静态资源（字体等）
```

## 环境要求

- Node.js `^22.18.0 || >=24.12.0`
- 如需打包 macOS 应用，需在 macOS 系统上执行（或使用 CI）

## 开发

```sh
npm install

# 纯前端开发（Vite + 本地代理，不带 Electron 窗口）
npm run dev

# 完整 Electron 开发（自动启动 Vite、代理与 Electron 窗口）
npm run dev:electron
```

开发模式端口：Vite `5173`、教务代理 `8788`、生产环境页面服务 `1302`。

## 构建打包

```sh
# 类型检查 + Vite 构建
npm run build

# 打包当前平台安装包（Windows: NSIS）
npm run build:electron

# 仅生成解包目录（快速验证）
npm run build:electron:dir
```

打包配置见 `package.json` 的 `build` 字段：Windows 生成 NSIS 安装包；macOS 生成 dmg/zip（含 `build/icon.png`，自动转换 .icns）。

## 测试与代码检查

```sh
npm run test:unit         # Vitest 单元测试
npm run test:e2e          # Playwright 端到端测试（首次需 npx playwright install）
npm run lint              # Oxlint + ESLint
npm run format            # oxfmt 格式化
```

## 更新检查配置

进入主页面会自动检查更新。当前通过 **jsDelivr CDN 上的版本清单**获取最新版本（避免 GitHub API 限流/网络不可达），配置项位于 [electron/main.cjs](electron/main.cjs) 顶部：

- `UPDATE_MANIFEST_URL`：版本清单地址，默认 `https://cdn.jsdelivr.net/gh/Jelosy0213/FUU-Desktop@latest/update.json`
- `UPDATE_DOWNLOAD_URL_TEMPLATE`：下载地址模板，`{version}` 会被替换为清单中的版本号

**维护方式**：在仓库根目录维护 `update.json`，发布新版时更新其中的版本号（并同步上传对应安装包到 GitHub Releases）：

```json
{
  "version": "0.2.3",
  "releaseNotes": "本次更新内容说明"
}
```

下载地址约定：`Setup-<版本号>.exe`（如 `Setup-0.2.3.exe`，上传到 `Win` 标签对应的 Release）。应用会自动比对版本号并提示更新（支持下载进度显示，下载完成后自动启动安装程序并退出）。

## 免责声明

本项目为第三方开源项目，与福州大学、west2官方无关，仅供个人学习与交流使用。请勿用于商业用途，使用过程中请遵守相关法律法规与校方规定。

## 许可证

[GPL-3.0-or-later](LICENSE) © 2026 Jelosy

反馈邮箱：3926315038@qq.com
