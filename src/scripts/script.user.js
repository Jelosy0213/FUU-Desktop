// ==UserScript==
// @name         我的小学数学非常好
// @namespace    https://www.fzu.edu.cn/
// @version      0.3
// @description  自动识别fzu教务处的验证码(本地)并填充
// @author       柠檬味氨水, Cai
// @match        https://jwcjwxt2.fzu.edu.cn:82/login.htm
// @grant        GM_xmlhttpRequest
// @updateURL    https://github.com/ACaiCat/mastering-primary-math/raw/refs/heads/main/script.user.js
// @downloadURL  https://github.com/ACaiCat/mastering-primary-math/raw/refs/heads/main/script.user.js
// ==/UserScript==
/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

(function () {
    'use strict';

    // 数字模板（0-8）
    const captureTemplate = {
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
    };

    // 计算灰度,二值化处理图像
    function preprocessImage(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const binary = [];
        for (let y = 0; y < height; y++) {
            const row = [];
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                // 灰度化（转为0-255的灰度值）
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                // 二值化（转为0或1）
                // 128是阈值，可以根据实际情况调整
                const binaryValue = gray < 128 ? 0 : 1;
                row.push(binaryValue);
            }
            binary.push(row);
        }
    return binary;
    }

    // 相似度计算函数
    function compare(array1, array2) {
        if (!array1 || !array2 || array1.length !== array2.length || array1[0].length !== array2[0].length) {
            return 0;
        }
        const rows = array1.length;
        const cols = array1[0].length;
        let same = 0;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (array1[y][x] === array2[y][x]) same++;
            }
        }
        return same / (rows * cols);
    }

    // 识别单个数字（6x10 图像）
    function recognizeSingleDigit(imageData) {
        // imageData 是 ImageData 对象（来自 canvas）
        const data = imageData.data;
        const width = imageData.width; // 应为 6
        const height = imageData.height; // 应为 10


        // 与模板比对
        let bestMatch = 0;
        let maxSim = -1;
        for (let digit = 0; digit <= 8; digit++) {
            const sim = compare( preprocessImage(imageData), captureTemplate[digit]);
            if (sim > maxSim) {
                maxSim = sim;
                bestMatch = digit;
            }
        }
        return bestMatch;
    }

    // 主识别函数：解析整个验证码图
    function recognizeCaptcha(imgElement) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = imgElement;

            // 验证码图尺寸应为 50x10（根据裁剪坐标推断）
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            // 裁剪四个数字区域（x, y, w=6, h=10）
            const regions = [
                { x: 2, y: 0 },
                { x: 12, y: 0 },
                { x: 32, y: 0 },
                { x: 42, y: 0 }
            ];

            const digits = regions.map(region => {
                const digitCanvas = document.createElement('canvas');
                digitCanvas.width = 6;
                digitCanvas.height = 10;
                const digitCtx = digitCanvas.getContext('2d');
                digitCtx.drawImage(canvas, region.x, region.y, 6, 10, 0, 0, 6, 10);
                const imageData = digitCtx.getImageData(0, 0, 6, 10);
                return recognizeSingleDigit(imageData);
            });
            console.log('🤔 识别结果:',digits );
            const num1 = digits[0] * 10 + digits[1];
            const num2 = digits[2] * 10 + digits[3];
            resolve(num1 + num2);
        });
    }

    // 主流程
    async function processCaptcha() {
        try {
            const result = await recognizeCaptcha(captchaImage);
            captchaInput.value = result.toString();
            console.log('✅ 本地识别成功，结果:', result);
        } catch (e) {
            console.error('❌ 识别失败:', e);
        }
    }

    const captchaImage = document.getElementById('yzm_pic');
    const captchaInput = document.getElementById('Verifycode');

    if (captchaImage && captchaInput) {
        // 等待图片加载完成
        if (captchaImage.complete && captchaImage.naturalHeight !== 0) {
            processCaptcha();
        } else {
            captchaImage.onload = processCaptcha;
        }

        // 监听验证码刷新
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                    captchaImage.onload = processCaptcha;
                }
            });
        });

        observer.observe(captchaImage, {
        attributes: true,
        attributeFilter: ['src']
        });

    } else {
        console.error('❌ 未找到验证码元素');
    }


})();