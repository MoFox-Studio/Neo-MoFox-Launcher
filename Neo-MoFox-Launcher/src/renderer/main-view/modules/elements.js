// ─── DOM Elements for Main View ──────────────────────────────────────
export const el = {
  // Window Controls
  btnMinimize: document.getElementById('btn-minimize'),
  btnMaximize: document.getElementById('btn-maximize'),
  btnClose: document.getElementById('btn-close'),

  // Quote
  quoteText: document.getElementById('quote-text'),
  quoteAuthor: document.getElementById('quote-author'),

  // Instances
  instanceCount: document.getElementById('instance-count'),
  instancesGrid: document.getElementById('instances-grid'),
  btnAddInstance: document.getElementById('btn-add-instance'),
  btnOpenSettings: document.getElementById('btn-open-settings'),

  // Edit Instance Modal
  editInstanceModal: document.getElementById('edit-instance-modal'),
  editModalTitle: document.getElementById('edit-modal-title'),
  editInstanceName: document.getElementById('edit-instance-name'),
  editInstanceDesc: document.getElementById('edit-instance-desc'),
  btnCloseEditModal: document.getElementById('btn-close-edit-modal'),
  btnCancelEdit: document.getElementById('btn-cancel-edit'),
  btnDeleteInstance: document.getElementById('btn-delete-instance'),
  btnSaveInstance: document.getElementById('btn-save-instance'),

  // OOBE 环境检测
  oobeOverlay: document.getElementById('oobe-overlay'),
  envCheckList: document.getElementById('env-check-list'),
  
  // 检测项
  checkPython: document.getElementById('check-python'),
  checkPythonStatus: document.getElementById('check-python-status'),
  checkPythonResult: document.getElementById('check-python-result'),
  
  checkUv: document.getElementById('check-uv'),
  checkUvStatus: document.getElementById('check-uv-status'),
  checkUvResult: document.getElementById('check-uv-result'),
  
  checkGit: document.getElementById('check-git'),
  checkGitStatus: document.getElementById('check-git-status'),
  checkGitResult: document.getElementById('check-git-result'),
  
  // 检测结果
  envCheckSummary: document.getElementById('env-check-summary'),
  summaryIcon: document.getElementById('summary-icon'),
  summaryTitle: document.getElementById('summary-title'),
  summaryDesc: document.getElementById('summary-desc'),
  
  // 安装提示
  envInstallHints: document.getElementById('env-install-hints'),
  installHintsList: document.getElementById('install-hints-list'),
  
  // 自动安装进度
  envInstallProgress: document.getElementById('env-install-progress'),
  installProgressTitle: document.getElementById('install-progress-title'),
  installProgressBar: document.getElementById('install-progress-bar'),
  installProgressLog: document.getElementById('install-progress-log'),
  
  // 按钮
  oobeBtnRecheck: document.getElementById('oobe-btn-recheck'),
  oobeBtnAutoInstall: document.getElementById('oobe-btn-auto-install'),
  oobeBtnContinue: document.getElementById('oobe-btn-continue'),
};

// 调试：检查关键元素是否存在
console.log('Window control buttons:', {
  minimize: !!el.btnMinimize,
  maximize: !!el.btnMaximize,
  close: !!el.btnClose,
});
