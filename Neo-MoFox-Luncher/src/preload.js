const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mofoxAPI', {
  // 进程控制
  startMofox: () => ipcRenderer.invoke('start-mofox'),
  stopMofox: () => ipcRenderer.invoke('stop-mofox'),
  restartMofox: () => ipcRenderer.invoke('restart-mofox'),

  // 状态与信息
  getStatus: () => ipcRenderer.invoke('get-status'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getProjectInfo: () => ipcRenderer.invoke('get-project-info'),

  // 文件操作
  selectProjectPath: () => ipcRenderer.invoke('select-project-path'),
  openProjectFolder: () => ipcRenderer.invoke('open-project-folder'),
  openGithub: () => ipcRenderer.invoke('open-github'),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),

  // 窗口控制
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),

  // OOBE 向导
  oobeSelectPath: () => ipcRenderer.invoke('oobe-select-path'),
  oobeValidatePath: (targetPath) => ipcRenderer.invoke('oobe-validate-path', targetPath),
  oobeGetBranches: () => ipcRenderer.invoke('oobe-get-branches'),
  oobeClone: (targetPath, branch) => ipcRenderer.invoke('oobe-clone', targetPath, branch),
  oobeGetConfigFiles: (targetPath) => ipcRenderer.invoke('oobe-get-config-files', targetPath),
  oobeSaveConfig: (filePath, content) => ipcRenderer.invoke('oobe-save-config', filePath, content),
  oobeFinish: (instanceData) => ipcRenderer.invoke('oobe-finish', instanceData),

  // 环境检测
  envCheckPython: () => ipcRenderer.invoke('env-check-python'),
  envCheckUv: () => ipcRenderer.invoke('env-check-uv'),
  envCheckGit: () => ipcRenderer.invoke('env-check-git'),
  envCheckAll: () => ipcRenderer.invoke('env-check-all'),
  envCheckGetCached: () => ipcRenderer.invoke('env-check-get-cached'),
  envCheckClearCache: () => ipcRenderer.invoke('env-check-clear-cache'),

  // ─── 实例管理 ───────────────────────────────────────────────────────────
  getInstances: () => ipcRenderer.invoke('instances-get-all'),
  getInstance: (instanceId) => ipcRenderer.invoke('instances-get', instanceId),
  addInstance: (instance) => ipcRenderer.invoke('instances-add', instance),
  updateInstance: (instanceId, updates) => ipcRenderer.invoke('instances-update', instanceId, updates),
  deleteInstance: (instanceId) => ipcRenderer.invoke('instances-delete', instanceId),
  hasInstances: () => ipcRenderer.invoke('instances-has-any'),

  // ─── 全局状态 ───────────────────────────────────────────────────────────
  readState: () => ipcRenderer.invoke('state-read'),
  writeState: (patch) => ipcRenderer.invoke('state-write', patch),

  // ─── 安装向导 ───────────────────────────────────────────────────────────
  installShouldShow: () => ipcRenderer.invoke('install-should-show'),
  installEnvCheck: () => ipcRenderer.invoke('install-env-check'),
  installValidateInputs: (inputs) => ipcRenderer.invoke('install-validate-inputs', inputs),
  installCheckPort: (port) => ipcRenderer.invoke('install-check-port', port),
  installRun: (inputs) => ipcRenderer.invoke('install-run', inputs),
  installCleanup: (instanceId) => ipcRenderer.invoke('install-cleanup', instanceId),

  // 事件监听
  onLogOutput: (callback) => {
    ipcRenderer.on('log-output', (_event, data) => callback(data));
  },
  onStatusChanged: (callback) => {
    ipcRenderer.on('status-changed', (_event, data) => callback(data));
  },
  onCloneProgress: (callback) => {
    ipcRenderer.on('oobe-clone-progress', (_event, data) => callback(data));
  },
  onInstallProgress: (callback) => {
    ipcRenderer.on('install-progress', (_event, data) => callback(data));
  },
  onInstallOutput: (callback) => {
    ipcRenderer.on('install-output', (_event, data) => callback(data));
  },

  // ─── 用户设置 ───────────────────────────────────────────────────────────
  settingsRead: () => ipcRenderer.invoke('settings-read'),
  settingsWrite: (patch) => ipcRenderer.invoke('settings-write', patch),
  settingsReset: (key) => ipcRenderer.invoke('settings-reset', key),
  /** 同步读取设置，仅在 <head> 中应用主题时使用，避免 FOUC */
  settingsReadSync: () => ipcRenderer.sendSync('settings-read-sync'),
  openLogsDir: () => ipcRenderer.invoke('open-logs-dir'),
});
