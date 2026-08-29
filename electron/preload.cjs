/*
 * Copyright (C) 2026 Jelosy
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  loginSuccess: (username) => ipcRenderer.send('auth:login-success', username),
  logout: (explicit) => ipcRenderer.send('auth:logout', Boolean(explicit)),
  credentials: {
    get: () => ipcRenderer.invoke('credentials:get'),
    set: (data) => ipcRenderer.invoke('credentials:set', data),
    clear: () => ipcRenderer.invoke('credentials:clear'),
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  onMaximized: (callback) => ipcRenderer.on('window:maximized', (_event, maximized) => callback(maximized)),
  close: () => ipcRenderer.send('window:close'),
  enterMini: () => ipcRenderer.send('window:enter-mini'),
  exitMini: () => ipcRenderer.send('window:exit-mini'),
  showLogin: () => ipcRenderer.send('window:show-login'),
  setExplicitLogout: (enabled) => ipcRenderer.send('auth:set-explicit-logout', Boolean(enabled)),
  setWindowMemory: (enabled) => ipcRenderer.send('settings:set-window-memory', Boolean(enabled)),
  openForgotPassword: () => ipcRenderer.send('window:open-forgot'),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: (url) => ipcRenderer.send('update:download', url),
  onUpdateProgress: (callback) => ipcRenderer.on('update:download-progress', (_event, data) => callback(data)),
  onUpdateDone: (callback) => ipcRenderer.on('update:download-done', (_event, data) => callback(data)),
})
