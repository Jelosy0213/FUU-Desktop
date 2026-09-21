/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// 版本号一键对齐：npm run bump 0.6.0
//
// 版本号被三套工具各自要求，没法天然收敛成一处，这个脚本负责一次改齐，
// 避免发版时漏改某一处：
//   src-tauri/tauri.conf.json         实际生效值（安装包版本 + 更新检查用的 package_info）
//   src-tauri/Cargo.toml              Cargo 语法必填，必须与上面一致
//   src-tauri/Cargo.lock              同一版本要跟着改，否则 --locked 构建会失败
//   package.json / package-lock.json  npm 元数据
//   update.json                       发布清单（远端旧版本据此判断有没有新版本）
// 前端显示的版本不在这里——它由 vite 在构建时读 tauri.conf.json 注入（见 vite.config.ts）
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const abs = (relative) => fileURLToPath(new URL(relative, root))

const next = process.argv[2]
// 与 Tauri 的要求一致：必须是合法 semver（写成 "0.6" 会让 tauri build 直接报错）
if (!next || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(next)) {
  console.error('用法：npm run bump <version>，例如 npm run bump 0.6.0')
  process.exit(1)
}

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

// 手写配置文件只替换顶层 version 那一行的值，其余排版原样保留。
// 不要用 JSON 往返：它会把 ["nsis"] 这类紧凑数组展开，产生一堆无意义 diff
const replaceTopLevelVersion = (file) => {
  const content = readFileSync(abs(file), 'utf8')
  const pattern = /^(\s*"version"\s*:\s*)"[^"]*"/m
  if (!pattern.test(content)) {
    fail(`没在 ${file} 里找到顶层 version 字段`)
  }
  return content.replace(pattern, `$1"${next}"`)
}

// Cargo.toml 只改 [package] 段里的 version：依赖项也写着 version = "..."，
// 不能拿正则全局替换
const bumpCargoToml = (file) => {
  let section = ''
  let replaced = false
  const lines = readFileSync(abs(file), 'utf8')
    .split('\n')
    .map((line) => {
      const header = line.match(/^\s*\[([^\]]+)\]/)
      if (header) {
        section = header[1]
        return line
      }
      if (section === 'package' && !replaced && /^version\s*=/.test(line)) {
        replaced = true
        return `version = "${next}"`
      }
      return line
    })
  if (!replaced) {
    fail(`没在 ${file} 的 [package] 段里找到 version`)
  }
  return lines.join('\n')
}

// Cargo.lock 里 fzu_desktop 那条也要跟上：cargo 下次构建虽然会自动改，
// 但发版前提交一份过期 lock 会让 --locked 构建失败
const bumpCargoLock = (file) => {
  const lines = readFileSync(abs(file), 'utf8').split('\n')
  const packageIndex = lines.findIndex((line) => line.trim() === 'name = "fzu_desktop"')
  if (packageIndex === -1) {
    fail(`没在 ${file} 里找到 fzu_desktop 条目`)
  }
  const versionIndex = lines.findIndex((line, i) => i > packageIndex && /^version\s*=/.test(line))
  if (versionIndex === -1) {
    fail(`没在 ${file} 的 fzu_desktop 条目里找到 version`)
  }
  lines[versionIndex] = `version = "${next}"`
  return lines.join('\n')
}

// package-lock.json 由 npm 生成、格式固定，按结构改即可：只有根级与 packages[""] 两处。
// 同样不能全局替换 version —— 依赖项里也有恰好等于旧版本号的包（json-schema-traverse 等）
const bumpLockfile = (file) => {
  const lock = JSON.parse(readFileSync(abs(file), 'utf8'))
  lock.version = next
  if (lock.packages?.['']) {
    lock.packages[''].version = next
  }
  return `${JSON.stringify(lock, null, 2)}\n`
}

// 先把每个文件的最终内容都算出来，确认哪一步都不会失败，再统一落盘
const outputs = new Map()
for (const file of ['src-tauri/tauri.conf.json', 'update.json', 'package.json']) {
  outputs.set(file, replaceTopLevelVersion(file))
}
outputs.set('src-tauri/Cargo.toml', bumpCargoToml('src-tauri/Cargo.toml'))
outputs.set('src-tauri/Cargo.lock', bumpCargoLock('src-tauri/Cargo.lock'))
outputs.set('package-lock.json', bumpLockfile('package-lock.json'))

for (const [file, content] of outputs) {
  writeFileSync(abs(file), content)
}

console.log(`版本号已更新为 ${next}：`)
for (const file of outputs.keys()) {
  console.log(`  - ${file}`)
}
console.log('')
console.log('仍需人工处理：')
console.log('  1. update.json 的 releaseNotes 写明本次更新内容')
console.log(`  2. GitHub Release 的 tag 用 ${next}，安装包重命名为 Setup-${next}.exe`)
