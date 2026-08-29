/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
// 验证码自动识别：教务登录验证码为 50x10 的二位数加法算式（如 "12+34"），
// 通过模板匹配识别四个 6x10 的数字区域，答案即两数之和。
// 识别逻辑移植自 scripts/script.user.js，模板与比较方式保持一致。

// 数字模板（0-8）：0 为笔画（前景），255 为空白。
// 注意：模板仅覆盖 0-8，识别存在一定误差，调用方应配合重试。
const DIGIT_TEMPLATES: Record<number, number[][]> = {
  0: [
    [255, 0, 0, 0, 0, 255],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 0, 0, 255, 0],
    [0, 255, 0, 0, 255, 0],
    [0, 255, 0, 0, 255, 0],
    [0, 255, 0, 0, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [255, 0, 0, 0, 0, 255],
  ],
  1: [
    [255, 255, 0, 255, 255, 255],
    [0, 0, 0, 255, 255, 255],
    [255, 255, 0, 255, 255, 255],
    [255, 255, 0, 255, 255, 255],
    [255, 255, 0, 255, 255, 255],
    [255, 255, 0, 255, 255, 255],
    [255, 255, 0, 255, 255, 255],
    [255, 255, 0, 255, 255, 255],
    [255, 255, 0, 255, 255, 255],
    [0, 0, 0, 0, 0, 255],
  ],
  2: [
    [255, 0, 0, 0, 0, 255],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [255, 255, 255, 255, 255, 0],
    [255, 255, 255, 255, 0, 255],
    [255, 255, 255, 0, 255, 255],
    [255, 255, 0, 255, 255, 255],
    [255, 0, 255, 255, 255, 255],
    [0, 255, 255, 255, 255, 0],
    [0, 0, 0, 0, 0, 0],
  ],
  3: [
    [255, 0, 0, 0, 0, 255],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [255, 255, 255, 255, 0, 255],
    [255, 255, 0, 0, 255, 255],
    [255, 255, 255, 255, 0, 255],
    [255, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [255, 0, 0, 0, 0, 255],
  ],
  4: [
    [255, 255, 255, 0, 255, 255],
    [255, 255, 255, 0, 255, 255],
    [255, 255, 0, 0, 255, 255],
    [255, 0, 255, 0, 255, 255],
    [0, 255, 255, 0, 255, 255],
    [0, 255, 255, 0, 255, 255],
    [0, 0, 0, 0, 0, 0],
    [255, 255, 255, 0, 255, 255],
    [255, 255, 255, 0, 255, 255],
    [255, 255, 0, 0, 0, 0],
  ],
  5: [
    [0, 0, 0, 0, 0, 0],
    [0, 255, 255, 255, 255, 255],
    [0, 255, 255, 255, 255, 255],
    [0, 255, 0, 0, 0, 255],
    [0, 0, 255, 255, 255, 0],
    [255, 255, 255, 255, 255, 0],
    [255, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [255, 0, 0, 0, 0, 255],
  ],
  6: [
    [255, 255, 0, 0, 0, 255],
    [255, 0, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 255],
    [0, 255, 255, 255, 255, 255],
    [0, 255, 0, 0, 0, 255],
    [0, 0, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [255, 0, 0, 0, 0, 255],
  ],
  7: [
    [0, 0, 0, 0, 0, 0],
    [0, 255, 255, 255, 0, 255],
    [0, 255, 255, 255, 0, 255],
    [255, 255, 255, 0, 255, 255],
    [255, 255, 255, 0, 255, 255],
    [255, 255, 0, 255, 255, 255],
    [255, 255, 0, 255, 255, 255],
    [255, 255, 0, 255, 255, 255],
    [255, 255, 0, 255, 255, 255],
    [255, 255, 0, 255, 255, 255],
  ],
  8: [
    [255, 0, 0, 0, 0, 255],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [255, 0, 0, 0, 0, 255],
    [255, 0, 255, 255, 0, 255],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [0, 255, 255, 255, 255, 0],
    [255, 0, 0, 0, 0, 255],
  ],
}

// 取图像指定区域的二值化矩阵：灰度 < 128 记为 0（前景），否则 1（背景）
function toBinaryRegion(
  imageData: ImageData,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): number[][] {
  const { data } = imageData
  const region: number[][] = []
  for (let y = 0; y < height; y++) {
    const row: number[] = []
    for (let x = 0; x < width; x++) {
      const idx = ((offsetY + y) * imageData.width + (offsetX + x)) * 4
      const gray = 0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!
      row.push(gray < 128 ? 0 : 1)
    }
    region.push(row)
  }
  return region
}

// 相似度：逐像素相等计数 / 总像素数（模板背景为 255，与二值化的 1 不相等，
// 因此实际统计的是前景(0)重合率，与脚本行为一致）
function similarity(a: number[][], b: number[][]): number {
  if (!a || !b || a.length !== b.length) return 0
  const rows = a.length
  const cols = a[0]?.length ?? 0
  if (cols === 0 || cols !== b[0]?.length) return 0
  let same = 0
  for (let y = 0; y < rows; y++) {
    const rowA = a[y]!
    const rowB = b[y]!
    for (let x = 0; x < cols; x++) {
      if (rowA[x] === rowB[x]) same++
    }
  }
  return same / (rows * cols)
}

// 识别单个 6x10 数字区域（offsetX 为该区域左上角 x 坐标）
function recognizeDigit(imageData: ImageData, offsetX: number): number | null {
  const region = toBinaryRegion(imageData, offsetX, 0, 6, 10)
  let best: number | null = null
  let maxSim = -1
  for (let digit = 0; digit <= 8; digit++) {
    const sim = similarity(region, DIGIT_TEMPLATES[digit]!)
    if (sim > maxSim) {
      maxSim = sim
      best = digit
    }
  }
  return best
}

// 从完整验证码的 ImageData 中识别出算式答案（字符串），失败返回 null
export function recognizeMathCaptcha(imageData: ImageData): string | null {
  // 四个数字区域：两位数 + 两位数（中间为加号）
  const digits = [2, 12, 32, 42].map((x) => recognizeDigit(imageData, x))
  if (digits.some((d) => d === null)) return null
  const [d0, d1, d2, d3] = digits as [number, number, number, number]
  const answer = d0 * 10 + d1 + (d2 * 10 + d3)
  return String(answer)
}

// 从 <img> 元素提取像素并识别答案（图片需同源，避免 canvas 被污染）
export async function recognizeCaptchaFromImage(img: HTMLImageElement): Promise<string | null> {
  try {
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    if (!width || !height) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, width, height)
    return recognizeMathCaptcha(ctx.getImageData(0, 0, width, height))
  } catch {
    return null
  }
}

// 直接通过 URL 拉取验证码并识别（无需可见 <img>，用于会话过期的静默重新登录）
export async function recognizeCaptchaFromUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return null
    const blob = await response.blob()
    const bitmap = await createImageBitmap(blob)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0)
      return recognizeMathCaptcha(ctx.getImageData(0, 0, bitmap.width, bitmap.height))
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}

// 等待 <img> 的 src 更新为 targetSrc 且完成加载；超时返回 false。
// targetSrc 形如 "/api/captcha?t=..."，img.src 为绝对地址，用 endsWith 匹配。
export async function waitForCaptchaImage(
  img: HTMLImageElement | null,
  targetSrc: string,
  timeout = 8000,
): Promise<boolean> {
  if (!img) return false
  const deadline = Date.now() + timeout
  while (!img.src.endsWith(targetSrc) || !(img.complete && img.naturalWidth > 0)) {
    if (Date.now() > deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return true
}
