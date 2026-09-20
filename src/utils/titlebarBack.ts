/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { readonly, ref } from 'vue'

// 顶栏左上角返回按钮的桥接层。
//
// 按钮渲染在 App.vue 的标题栏里，而"当前能否返回"由页面组件（如课表内的设置页）决定，
// 两者隔着 RouterView，不适合传 props。这里用一个极小的共享状态：
// 页面进入二级视图时注册返回动作，回到顶层时注销；App.vue 据此启用按钮。
const backAction = ref<(() => void) | null>(null)

/** 当前页面注册的返回动作（只读，供按钮判断可用状态） */
export const titlebarBackAction = readonly(backAction)

/** 注册返回动作；传 null 表示当前处于顶层，没有可返回的上一级 */
export function setTitlebarBack(action: (() => void) | null) {
  backAction.value = action
}

export function triggerTitlebarBack() {
  backAction.value?.()
}
