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
  getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),
  getProjectInfo: () => ipcRenderer.invoke('get-project-info'),

  // 文件操作
  selectProjectPath: () => ipcRenderer.invoke('select-project-path'),
  openProjectFolder: () => ipcRenderer.invoke('open-project-folder'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
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

  // 环境依赖自动安装
  envInstallDep: (depName) => ipcRenderer.invoke('env-install-dep', depName),
  envInstallAllMissing: (checks) => ipcRenderer.invoke('env-install-all-missing', checks),

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

  // ─── 实例进程控制 ───────────────────────────────────────────────────────────
  startInstance: (instanceId) => ipcRenderer.invoke('instance-start', instanceId),
  stopInstance: (instanceId) => ipcRenderer.invoke('instance-stop', instanceId),
  restartInstance: (instanceId) => ipcRenderer.invoke('instance-restart', instanceId),
  getInstanceStatus: (instanceId) => ipcRenderer.invoke('instance-status', instanceId),
  getAllInstanceStatuses: () => ipcRenderer.invoke('instance-status-all'),
  getInstanceStats: (instanceId) => ipcRenderer.invoke('instance-stats', instanceId),
  clearInstanceLogs: (instanceId, type) => ipcRenderer.invoke('instance-clear-logs', instanceId, type),
  exportInstanceLogs: (instanceId, type, logs) => ipcRenderer.invoke('instance-export-logs', instanceId, type, logs),

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
  onEnvInstallProgress: (callback) => {
    ipcRenderer.on('env-install-progress', (_event, data) => callback(data));
  },
  onInstallProgress: (callback) => {
    ipcRenderer.on('install-progress', (_event, data) => callback(data));
  },
  onInstallOutput: (callback) => {
    ipcRenderer.on('install-output', (_event, data) => callback(data));
  },
  onInstanceStatusChange: (callback) => {
    ipcRenderer.on('instance-status-change', (_event, data) => callback(data));
  },
  onInstanceLog: (callback) => {
    ipcRenderer.on('instance-log', (_event, data) => callback(data));
  },
  onInstanceStatsUpdate: (callback) => {
    ipcRenderer.on('instance-stats-update', (_event, data) => callback(data));
  },
  onWindowMaximizeChanged: (callback) => {
    ipcRenderer.on('window-maximize-changed', (_event, isMaximized) => callback(isMaximized));
  },

  // ─── 用户设置 ───────────────────────────────────────────────────────────
  settingsRead: () => ipcRenderer.invoke('settings-read'),
  settingsWrite: (patch) => ipcRenderer.invoke('settings-write', patch),
  settingsReset: (key) => ipcRenderer.invoke('settings-reset', key),
  /** 同步读取设置，仅在 <head> 中应用主题时使用，避免 FOUC */
  settingsReadSync: () => ipcRenderer.sendSync('settings-read-sync'),
  openLogsDir: () => ipcRenderer.invoke('open-logs-dir'),

  // ─── 实例文件管理 ───────────────────────────────────────────────────────────
  openInstanceFolder: (instanceId, folderType) => ipcRenderer.invoke('instance-open-folder', instanceId, folderType),
  openInstanceFile: (instanceId, fileType) => ipcRenderer.invoke('instance-open-file', instanceId, fileType),
  getInstancePaths: (instanceId) => ipcRenderer.invoke('instance-get-paths', instanceId),
  deleteInstanceDatabase: (instanceId) => ipcRenderer.invoke('instance-delete-database', instanceId),
  deleteInstanceLogs: (instanceId) => ipcRenderer.invoke('instance-delete-logs', instanceId),

  // ─── 版本管理 ───────────────────────────────────────────────────────────────
  versionGetInfo: (instanceId) => ipcRenderer.invoke('version-get-info', instanceId),
  versionGetBranches: () => ipcRenderer.invoke('version-get-branches'),
  versionGetNapCatReleases: (limit) => ipcRenderer.invoke('version-get-napcat-releases', limit),
  versionCheckMofoxUpdate: (instanceId) => ipcRenderer.invoke('version-check-mofox-update', instanceId),
  versionSwitchBranch: (instanceId, branch) => ipcRenderer.invoke('version-switch-branch', instanceId, branch),
  versionUpdateMofox: (instanceId) => ipcRenderer.invoke('version-update-mofox', instanceId),
  versionUpdateNapcat: (instanceId, version) => ipcRenderer.invoke('version-update-napcat', instanceId, version),
  versionGetMofoxCommitHistory: (instanceId, limit) => ipcRenderer.invoke('version-get-mofox-commit-history', instanceId, limit),
  versionCheckoutCommit: (instanceId, commitHash) => ipcRenderer.invoke('version-checkout-commit', instanceId, commitHash),
  onVersionProgress: (callback) => {
    ipcRenderer.on('version-progress', (_event, data) => callback(data));
  },
});
