# 福UU（第三方）

![](https://cdn.jsdelivr.net/gh/Jelosy0213/mdImage/img/img1.png)

![](https://cdn.jsdelivr.net/gh/Jelosy0213/mdImage/img/img2.png)

福州大学教务系统第三方桌面客户端，基于 **Tauri 2 + Rust + Vue 3**。

> 本项目是非官方客户端，与福州大学无隶属或合作关系。

## 演示账号

123456/root

## 环境要求

- **Node.js** `^22.18.0 || >=24.12.0`
- **Rust** stable 与 MSVC C++ 构建工具（[Tauri 2 系统依赖](https://v2.tauri.app/start/prerequisites/)）
- **Windows 10/11**：需 WebView2 Runtime

## 开发

```sh
npm install
npm run dev
```

## 构建打包

```sh
npm run build
npm run tauri build
```

产物：

- 免安装可执行文件：`src-tauri/target/release/fzu_desktop.exe`（约 5 MB）
- 安装包：`src-tauri/target/release/bundle/nsis/福UU（第三方）_<版本>_x64-setup.exe`（约 2 MB）

更换图标：替换 `build/icon.png` 后执行 `npm run tauri icon build/icon.png`（输出到 `src-tauri/icons`）。

> [!TIP]
> 首次打包需要联网下载 NSIS 工具链到 `%LOCALAPPDATA%\tauri\NSIS`。
> 若报 `failed to bundle project: timeout: global`，说明下载超时，可手动下载
> [nsis-3.11.zip](https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip)
> 解压后把 `nsis-3.11/` 内的文件放入该目录，并补齐
> `Plugins\x86-unicode\additional\nsis_tauri_utils.dll`，再重新执行打包。

## 测试与代码检查

```sh
npm run test:unit     # 前端单元测试（Vitest）
npm run type-check    # 类型检查
npm run lint          # Oxlint + ESLint
npm run format        # oxfmt 格式化

# Rust 单元测试（在 src-tauri 目录下执行）
cd src-tauri
cargo test
```

## 项目结构

```
├── src-tauri/              # 桌面端（Rust）
│   ├── src/lib.rs          # 多窗口管理、凭据与启动标记、命令注册
│   ├── src/update.rs       # 更新清单检查
│   └── src/jw/             # 教务处相关
│       ├── client.rs       # HTTP 客户端与教务会话
│       ├── login.rs        # 登录与 SSO 跳转
│       ├── course.rs       # 课表 HTML 解析
│       ├── exam.rs         # 考表 HTML 解析
│       ├── profile.rs      # 个人信息页解析
│       ├── calendar.rs     # 教学周 / 校历解析
│       ├── demo.rs         # 演示账号数据
│       └── commands.rs     # 暴露给前端的 Tauri 命令
├── src/                    # 前端（Vue）
│   ├── api/fzu.ts          # 调用 Rust 命令的接口层
│   ├── types/fzu.ts        # 领域类型
│   ├── components/         # 组件（课表、设置、更新弹窗等）
│   ├── views/              # 路由页面（登录 / 课表 / 迷你课表 / 忘记密码）
│   ├── stores/             # Pinia 状态
│   ├── styles/             # 字体 / 令牌 / 重置 / 组件类分层样式
│   ├── utils/              # 请求策略、本地存储、验证码识别等
│   └── scripts/            # 配套油猴脚本
├── build/                  # 图标源文件
└── public/                 # 静态资源（窗口图标字体）
```

## 免责声明

本项目为第三方开源项目，与福州大学、west2 官方无关，仅供个人学习与交流使用。
请勿用于商业用途，使用过程中请遵守相关法律法规与校方规定。

## 许可证

[GPL-3.0-or-later](LICENSE) © 2026 Jelosy


