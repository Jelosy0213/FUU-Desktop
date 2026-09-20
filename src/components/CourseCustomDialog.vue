/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
<script setup lang="ts">
import { computed, reactive } from 'vue'

const props = defineProps<{ x: number; y: number }>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

// 占位表单：暂不落地保存，仅收集输入
const form = reactive({
  name: '',
  teacher: '',
  location: '',
  startWeek: '',
  endWeek: '',
  color: '#2563eb',
  note: '',
})

// 弹窗尺寸（用于靠近窗口边缘时自动翻转/收拢，避免超出可视区域）
const DIALOG_W = 300
const DIALOG_H = 470

const panelStyle = computed(() => {
  const pad = 14
  let left = props.x + pad
  let top = props.y + pad
  if (left + DIALOG_W > window.innerWidth - 8) left = props.x - pad - DIALOG_W
  if (top + DIALOG_H > window.innerHeight - 8) top = props.y - pad - DIALOG_H
  left = Math.max(8, Math.min(left, window.innerWidth - DIALOG_W - 8))
  top = Math.max(8, Math.min(top, window.innerHeight - DIALOG_H - 8))
  return { left: `${left}px`, top: `${top}px` }
})

// 课程名称为必填项，未填写时禁用确定按钮
const canConfirm = computed(() => form.name.trim().length > 0)

function handleConfirm() {
  if (!canConfirm.value) return
  emit('confirm')
}
</script>

<template>
  <div class="course-custom-dialog" role="dialog" aria-modal="false" aria-label="自定义课程" :style="panelStyle">
    <div class="dialog-header">
      <h2>自定义课程</h2>
      <button class="dialog-close" type="button" title="关闭" aria-label="关闭" @click="emit('close')"></button>
    </div>

    <form class="dialog-form" @submit.prevent="handleConfirm">
      <label class="field">
        <span class="field-label">课程名称<span class="required" aria-hidden="true">*</span></span>
        <input v-model="form.name" type="text" placeholder="请输入课程名称" autocomplete="off" />
      </label>

      <label class="field">
        <span class="field-label">任课教师名称</span>
        <input v-model="form.teacher" type="text" placeholder="选填" autocomplete="off" />
      </label>

      <label class="field">
        <span class="field-label">教室名称</span>
        <input v-model="form.location" type="text" placeholder="选填" autocomplete="off" />
      </label>

      <div class="field">
        <span class="field-label">持续时间</span>
        <div class="week-range">
          <input v-model="form.startWeek" type="number" min="1" inputmode="numeric" placeholder="起始" />
          <span class="week-range-sep" aria-hidden="true">周 -</span>
          <input v-model="form.endWeek" type="number" min="1" inputmode="numeric" placeholder="结束" />
          <span class="week-range-unit" aria-hidden="true">周</span>
        </div>
      </div>

      <label class="field">
        <span class="field-label">颜色</span>
        <div class="color-input">
          <span class="color-swatch" aria-hidden="true" :style="{ background: form.color }"></span>
          <input v-model="form.color" type="text" placeholder="#2563eb" autocomplete="off" />
        </div>
      </label>

      <label class="field">
        <span class="field-label">备注</span>
        <textarea v-model="form.note" rows="2" placeholder="输入个人备注（选填）"></textarea>
      </label>

      <div class="dialog-actions">
        <button class="dialog-btn btn-cancel" type="button" @click="emit('close')">取消</button>
        <button class="dialog-btn btn-confirm" type="submit" :disabled="!canConfirm">确定</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.course-custom-dialog {
  position: fixed;
  z-index: 120;
  width: 300px;
  max-width: calc(100vw - 16px);
  padding: 16px;
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  background: var(--ui-surface-solid);
  box-shadow: var(--ui-shadow-dialog);
  box-sizing: border-box;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dialog-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--ui-ink);
}

/* 复用应用顶栏「关闭」字体符号（Segoe Fluent Icons 的 ChromeClose） */
.dialog-close {
  flex: none;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.dialog-close::before {
  font-family: 'SegoeIcons';
  content: '\e8bb';
  font-size: 10px;
  line-height: 1;
}

.dialog-close:hover {
  background: var(--ui-danger);
  color: var(--ui-on-accent);
}

.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-ink-secondary);
}

.required {
  margin-left: 2px;
  color: var(--ui-danger-text);
}

.field input,
.field textarea {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--ui-border-input);
  border-radius: 9px;
  background: var(--ui-surface-solid);
  color: var(--ui-ink);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.field textarea {
  resize: vertical;
  line-height: 1.5;
}

.field input:focus,
.field textarea:focus {
  border-color: var(--ui-primary);
  box-shadow: 0 0 0 3px var(--ui-focus-ring-soft);
}

.week-range {
  display: flex;
  align-items: center;
  gap: 6px;
}

.week-range input {
  width: 64px;
  text-align: center;
}

.week-range input::-webkit-outer-spin-button,
.week-range input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.week-range-sep,
.week-range-unit {
  font-size: 12px;
  color: var(--ui-muted);
  white-space: nowrap;
}

.color-input {
  position: relative;
}

.color-input input {
  padding-left: 34px;
}

.color-swatch {
  position: absolute;
  top: 50%;
  left: 10px;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  border: 1px solid var(--ui-border-soft);
  border-radius: 5px;
  background: var(--ui-primary);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.dialog-btn {
  min-width: 76px;
  padding: 8px 16px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.btn-cancel {
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-solid);
  color: var(--ui-muted);
}

.btn-cancel:hover {
  background: var(--ui-chrome-bg);
  color: var(--ui-ink);
}

.btn-confirm {
  border: 1px solid var(--ui-primary);
  background: var(--ui-primary);
  color: var(--ui-on-accent);
}

.btn-confirm:hover:not(:disabled) {
  background: var(--ui-primary-strong);
}

.dialog-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
