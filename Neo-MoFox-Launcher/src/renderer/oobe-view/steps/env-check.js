/**
 * OOBE 步骤 2: 环境检测
 * 迁移自 main-view/modules/oobe.js
 */

const envState = {
  checking: false,
  installing: false,
  results: {
    python: null,
    uv: null,
    git: null,
  },
  allPassed: false,
};

export async function renderEnvCheckStep(container, stepManager) {
  container.innerHTML = `
    <div class="step-content">
      <div class="step-header">
        <h2 class="step-title">环境检测</h2>
        <p class="step-description">
          检测系统环境依赖项，确保 Neo-MoFox 可以正常运行。
        </p>
      </div>

      <!-- sudo 密码输入对话框 -->
      <div class="sudo-password-overlay hidden" id="sudo-password-overlay">
        <div class="sudo-password-dialog">
          <div class="sudo-dialog-header">
            <span class="material-symbols-rounded" style="font-size: 32px; color: var(--md-sys-color-warning);">lock</span>
            <h3>需要管理员权限</h3>
          </div>
          <div id="sudo-error-message" class="sudo-error-message hidden">
            <span class="material-symbols-rounded">error</span>
            <span id="sudo-error-text">密码错误</span>
          </div>
          <p class="sudo-hint">请输入您的系统密码以继续安装依赖项</p>
          <div class="sudo-input-group">
            <input 
              type="password" 
              id="sudo-password-input" 
              class="sudo-password-input" 
              placeholder="输入密码"
              autocomplete="off"
            />
            <button 
              type="button" 
              id="btn-toggle-password" 
              class="sudo-toggle-password"
              title="显示密码"
            >
              <span class="material-symbols-rounded">visibility_off</span>
            </button>
          </div>
          <div class="sudo-button-group">
            <button id="btn-sudo-cancel" class="oobe-btn secondary">
              <span class="material-symbols-rounded">close</span>
              <span>取消</span>
            </button>
            <button id="btn-sudo-confirm" class="oobe-btn primary" disabled>
              <span class="material-symbols-rounded" id="sudo-confirm-icon">check</span>
              <span id="sudo-confirm-text">确认</span>
            </button>
          </div>
        </div>
      </div>

      <div class="env-check-container" style="margin-top: 32px;">
        <!-- Python 检测 -->
        <div class="check-item" id="check-python">
          <div class="check-icon">
            <span class="material-symbols-rounded spinning">sync</span>
          </div>
          <div class="check-info">
            <div class="check-name">Python 3.11+</div>
            <div class="check-status" id="check-python-status">检测中...</div>
          </div>
          <div class="check-result" id="check-python-result"></div>
        </div>

        <!-- uv 检测 -->
        <div class="check-item" id="check-uv" style="margin-top: 16px;">
          <div class="check-icon">
            <span class="material-symbols-rounded spinning">sync</span>
          </div>
          <div class="check-info">
            <div class="check-name">uv (Python 包管理器)</div>
            <div class="check-status" id="check-uv-status">检测中...</div>
          </div>
          <div class="check-result" id="check-uv-result"></div>
        </div>

        <!-- Git 检测 -->
        <div class="check-item" id="check-git" style="margin-top: 16px;">
          <div class="check-icon">
            <span class="material-symbols-rounded spinning">sync</span>
          </div>
          <div class="check-info">
            <div class="check-name">Git</div>
            <div class="check-status" id="check-git-status">检测中...</div>
          </div>
          <div class="check-result" id="check-git-result"></div>
        </div>

        <!-- 检测摘要 -->
        <div class="env-check-summary hidden" id="env-check-summary" style="margin-top: 24px;">
          <div class="summary-icon" id="summary-icon"></div>
          <div class="summary-content">
            <div class="summary-title" id="summary-title"></div>
            <div class="summary-desc" id="summary-desc"></div>
          </div>
        </div>

        <!-- 一键安装按钮 -->
        <div id="install-hint" class="hidden" style="margin-top: 24px;">
          <button id="btn-auto-install" class="oobe-btn primary" style="width: 100%;">
            <span class="material-symbols-rounded">download</span>
            <span>一键安装缺失依赖</span>
          </button>
        </div>

        <!-- 安装进度 -->
        <div id="install-progress" class="hidden" style="margin-top: 24px;">
          <div class="install-progress-header" style="justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="material-symbols-rounded spinning" id="install-progress-icon">sync</span>
              <span id="install-progress-title">正在安装...</span>
            </div>
            <button id="btn-copy-log" class="oobe-btn secondary" style="padding: 4px 12px; min-height: 28px; line-height: 1;" title="复制日志到剪贴板">
              <span class="material-symbols-rounded" style="font-size: 16px;">content_copy</span>
              <span>复制</span>
            </button>
          </div>
          <div class="install-progress-bar-container">
            <div class="install-progress-bar" id="install-progress-bar"></div>
          </div>
          <pre class="install-log" id="install-log"></pre>
        </div>

        <!-- 重新检测按钮 -->
        <button id="btn-recheck" class="oobe-btn secondary hidden" style="margin-top: 16px; width: 100%;">
          <span class="material-symbols-rounded">refresh</span>
          <span>重新检测</span>
        </button>
      </div>
    </div>
  `;

  // 样式
  const style = document.createElement('style');
  style.textContent = `
    /* sudo 密码对话框样式 */
    .sudo-password-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .sudo-password-dialog {
      background: var(--md-sys-color-surface-container-high);
      border-radius: 16px;
      padding: 24px;
      width: 420px;
      max-width: 90vw;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      animation: slideUp 0.3s ease;
    }
    @keyframes slideUp {
      from { 
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .sudo-dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .sudo-dialog-header h3 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--md-sys-color-on-surface);
    }
    .sudo-error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: rgba(var(--md-sys-color-error-rgb), 0.1);
      border: 1px solid rgba(var(--md-sys-color-error-rgb), 0.3);
      border-radius: 8px;
      color: var(--md-sys-color-error);
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 12px;
    }
    .sudo-error-message .material-symbols-rounded {
      font-size: 20px;
    }
    .sudo-hint {
      color: var(--md-sys-color-on-surface-variant);
      font-size: 14px;
      margin: 0 0 16px 0;
    }
    .sudo-input-group {
      position: relative;
      margin-bottom: 20px;
    }
    input.sudo-password-input {
      width: 100%;
      padding: 12px 40px 12px 12px;
      border: 2px solid var(--md-sys-color-outline-variant);
      border-radius: 8px;
      background: var(--md-sys-color-surface);
      color: var(--md-sys-color-on-surface);
      font-size: 14px;
      font-family: monospace;
      transition: border-color 0.2s ease;
      box-sizing: border-box;
    }
    input.sudo-password-input:focus {
      outline: none;
      border-color: var(--md-sys-color-primary);
      box-shadow: none;
    }
    input.sudo-password-input:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .sudo-input-icon {
      position: absolute;
      right: 52px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--md-sys-color-on-surface-variant);
      font-size: 20px;
      pointer-events: none;
    }
    .sudo-toggle-password {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.2s ease;
      color: var(--md-sys-color-on-surface-variant);
    }
    .sudo-toggle-password:hover {
      background: rgba(var(--md-sys-color-on-surface-rgb), 0.08);
    }
    .sudo-toggle-password:active {
      background: rgba(var(--md-sys-color-on-surface-rgb), 0.12);
    }
    .sudo-toggle-password .material-symbols-rounded {
      font-size: 20px;
    }
    .sudo-button-group {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    .sudo-button-group .oobe-btn {
      min-width: 100px;
    }
    
    /* 环境检测样式 */
    .check-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      border-radius: 8px;
      background: var(--md-sys-color-surface-variant);
      transition: background-color 0.2s ease;
    }
    .check-item.passed {
      background: rgba(var(--md-sys-color-primary-rgb), 0.1);
    }
    .check-item.failed {
      background: rgba(var(--md-sys-color-error-rgb), 0.1);
    }
    .check-icon {
      font-size: 32px;
    }
    .check-icon .spinning {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .check-info {
      flex: 1;
    }
    .check-name {
      font-weight: 500;
      font-size: 15px;
      color: var(--md-sys-color-on-surface);
    }
    .check-status {
      font-size: 13px;
      color: var(--md-sys-color-on-surface-variant);
      margin-top: 4px;
    }
    .check-result .material-symbols-rounded {
      font-size: 28px;
    }
    .text-success {
      color: var(--md-sys-color-primary);
    }
    .text-error {
      color: var(--md-sys-color-error);
    }
    .env-check-summary {
      display: flex;
      gap: 16px;
      padding: 12px 16px;
      border-radius: 8px;
      background: var(--md-sys-color-surface-container-high);
      border: 1px solid var(--md-sys-color-outline-variant);
      margin-top: 16px;
      align-items: center;
    }
    .env-check-summary.success-summary {
      background: rgba(var(--md-sys-color-primary-rgb, 103, 80, 164), 0.08);
      border-color: rgba(var(--md-sys-color-primary-rgb, 103, 80, 164), 0.2);
    }
    .env-check-summary.error-summary {
      background: rgba(var(--md-sys-color-error-rgb, 179, 38, 30), 0.08);
      border-color: rgba(var(--md-sys-color-error-rgb, 179, 38, 30), 0.2);
    }
    .summary-icon .material-symbols-rounded {
      font-size: 28px;
    }
    .summary-title {
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 2px;
    }
    .summary-desc {
      font-size: 13px;
      color: var(--md-sys-color-on-surface-variant);
    }
    .install-progress-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      margin-bottom: 12px;
    }
    .install-progress-bar-container {
      width: 100%;
      height: 8px;
      background: var(--md-sys-color-surface-variant);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
    }
    .install-progress-bar {
      height: 100%;
      background: var(--md-sys-color-primary);
      transition: width 0.3s ease;
      width: 0%;
    }
    .install-log {
      max-height: 200px;
      overflow-y: auto;
      padding: 12px;
      background: var(--md-sys-color-surface-container);
      border-radius: 8px;
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
      margin: 0;
      user-select: text;
      -webkit-user-select: text;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .hidden {
      display: none !important;
    }
  `;
  container.appendChild(style);

  // 绑定事件
  const btnAutoInstall = document.getElementById('btn-auto-install');
  const btnRecheck = document.getElementById('btn-recheck');
  const sudoPasswordInput = document.getElementById('sudo-password-input');
  const btnSudoConfirm = document.getElementById('btn-sudo-confirm');
  const btnSudoCancel = document.getElementById('btn-sudo-cancel');
  const btnTogglePassword = document.getElementById('btn-toggle-password');
  const btnCopyLog = document.getElementById('btn-copy-log');

  btnCopyLog?.addEventListener('click', async () => {
    const installLog = document.getElementById('install-log');
    if (installLog && installLog.textContent) {
      try {
        await navigator.clipboard.writeText(installLog.textContent);
        const icon = btnCopyLog.querySelector('.material-symbols-rounded');
        const text = btnCopyLog.querySelector('span:not(.material-symbols-rounded)');
        if (icon) icon.textContent = 'check';
        if (text) text.textContent = '已复制';
        setTimeout(() => {
          if (icon) icon.textContent = 'content_copy';
          if (text) text.textContent = '复制';
        }, 2000);
      } catch (err) {
        console.error('复制日志失败:', err);
      }
    }
  });

  btnAutoInstall?.addEventListener('click', async () => {
    await autoInstallAll();
  });

  btnRecheck?.addEventListener('click', async () => {
    await runEnvCheck();
  });

  // sudo 密码输入框事件
  sudoPasswordInput?.addEventListener('input', () => {
    if (btnSudoConfirm) {
      btnSudoConfirm.disabled = !sudoPasswordInput.value;
    }
  });

  sudoPasswordInput?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' && sudoPasswordInput.value) {
      btnSudoConfirm?.click();
    }
  });

  // sudo 确认按钮
  btnSudoConfirm?.addEventListener('click', async () => {
    await handleSudoPasswordConfirm();
  });

  // sudo 取消按钮
  btnSudoCancel?.addEventListener('click', () => {
    hideSudoPasswordDialog();
    envState.installing = false;
    if (!document.getElementById('install-log')?.textContent) {
      document.getElementById('install-progress')?.classList.add('hidden');
    }
    document.getElementById('install-hint')?.classList.remove('hidden');
  });

  // 显示/隐藏密码按钮
  btnTogglePassword?.addEventListener('click', () => {
    const input = document.getElementById('sudo-password-input');
    const icon = btnTogglePassword.querySelector('.material-symbols-rounded');
    
    if (input.type === 'password') {
      input.type = 'text';
      icon.textContent = 'visibility';
      btnTogglePassword.title = '隐藏密码';
    } else {
      input.type = 'password';
      icon.textContent = 'visibility_off';
      btnTogglePassword.title = '显示密码';
    }
  });

  // 设置验证函数
  stepManager.setValidator('env-check', async () => {
    return envState.allPassed;
  });

  // 初始运行检测
  await runEnvCheck();
}

// ─── 运行环境检测 ─────────────────────────────────────────────────────

async function runEnvCheck(keepInstallProgress = false) {
  if (envState.checking) return envState.allPassed;
  envState.checking = true;

  // 重置 UI
  resetCheckUI(keepInstallProgress);

  try {
    const result = await window.mofoxAPI.envCheckAll();
    
    updateCheckItem('python', result.checks.python);
    updateCheckItem('uv', result.checks.uv);
    updateCheckItem('git', result.checks.git);
    
    envState.results = result.checks;
    envState.allPassed = result.passed;
    
    showSummary(result.passed, result.checks);
    
    if (!result.passed) {
      document.getElementById('install-hint')?.classList.remove('hidden');
      document.getElementById('btn-recheck')?.classList.remove('hidden');
    }
    
    return result.passed;
  } catch (error) {
    console.error('环境检测失败:', error);
    showSummary(false, null, error.message);
    return false;
  } finally {
    envState.checking = false;
  }
}

function resetCheckUI(keepInstallProgress = false) {
  ['python', 'uv', 'git'].forEach(name => {
    const item = document.getElementById(`check-${name}`);
    const icon = item?.querySelector('.check-icon .material-symbols-rounded');
    const status = document.getElementById(`check-${name}-status`);
    const result = document.getElementById(`check-${name}-result`);
    
    if (icon) {
      icon.textContent = 'sync';
      icon.classList.add('spinning');
    }
    if (item) {
      item.classList.remove('passed', 'failed');
    }
    if (status) status.textContent = '检测中...';
    if (result) result.innerHTML = '';
  });
  
  document.getElementById('env-check-summary')?.classList.add('hidden');
  document.getElementById('install-hint')?.classList.add('hidden');
  if (!keepInstallProgress) {
    document.getElementById('install-progress')?.classList.add('hidden');
  }
  document.getElementById('btn-recheck')?.classList.add('hidden');
}

function updateCheckItem(name, checkResult) {
  const item = document.getElementById(`check-${name}`);
  const icon = item?.querySelector('.check-icon .material-symbols-rounded');
  const status = document.getElementById(`check-${name}-status`);
  const result = document.getElementById(`check-${name}-result`);
  
  if (!item || !icon || !status) return;
  
  icon.classList.remove('spinning');
  
  if (checkResult.valid) {
    icon.textContent = 'check_circle';
    item.classList.add('passed');
    item.classList.remove('failed');
    status.textContent = `已安装: ${checkResult.version || '是'}`;
    if (result) {
      result.innerHTML = '<span class="material-symbols-rounded text-success">verified</span>';
    }
  } else {
    icon.textContent = 'cancel';
    item.classList.add('failed');
    item.classList.remove('passed');
    
    if (checkResult.installed) {
      status.textContent = `版本不符: ${checkResult.version} (需要 ${checkResult.requirement})`;
    } else {
      status.textContent = '未安装';
    }
    
    if (result) {
      result.innerHTML = '<span class="material-symbols-rounded text-error">error</span>';
    }
  }
}

function showSummary(passed, checks, errorMessage = null) {
  const summary = document.getElementById('env-check-summary');
  const icon = document.getElementById('summary-icon');
  const title = document.getElementById('summary-title');
  const desc = document.getElementById('summary-desc');
  
  if (!summary) return;
  summary.classList.remove('hidden');
  
  if (errorMessage) {
    summary.className = 'env-check-summary error-summary';
    icon.innerHTML = '<span class="material-symbols-rounded text-error">error</span>';
    title.textContent = '检测失败';
    desc.textContent = errorMessage;
    return;
  }
  
  if (passed) {
    summary.className = 'env-check-summary success-summary';
    icon.innerHTML = '<span class="material-symbols-rounded text-success">check_circle</span>';
    title.textContent = '环境检测通过';
    desc.textContent = '所有依赖项均已正确安装。';
  } else {
    summary.className = 'env-check-summary error-summary';
    icon.innerHTML = '<span class="material-symbols-rounded" style="color: var(--md-sys-color-warning)">warning</span>';
    title.textContent = '缺少依赖项';
    desc.textContent = '可点击下方「一键安装」自动安装所有缺失依赖。';
  }
}

// ─── sudo 密码对话框管理 ──────────────────────────────────────────────

let sudoRetryCount = 0;
const MAX_SUDO_RETRIES = 3;

function showSudoPasswordDialog() {
  const overlay = document.getElementById('sudo-password-overlay');
  const input = document.getElementById('sudo-password-input');
  const errorMessage = document.getElementById('sudo-error-message');
  
  if (overlay) overlay.classList.remove('hidden');
  if (input) {
    input.value = '';
    input.disabled = false;
    input.focus();
  }
  if (errorMessage) errorMessage.classList.add('hidden');
  
  const btnConfirm = document.getElementById('btn-sudo-confirm');
  const btnCancel = document.getElementById('btn-sudo-cancel');
  const confirmIcon = document.getElementById('sudo-confirm-icon');
  const confirmText = document.getElementById('sudo-confirm-text');
  
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnCancel) btnCancel.disabled = false;
  if (confirmIcon) {
    confirmIcon.textContent = 'check';
    confirmIcon.classList.remove('spinning');
  }
  if (confirmText) confirmText.textContent = '确认';
}

function hideSudoPasswordDialog() {
  const overlay = document.getElementById('sudo-password-overlay');
  const input = document.getElementById('sudo-password-input');
  
  if (overlay) overlay.classList.add('hidden');
  if (input) input.value = '';
  
  sudoRetryCount = 0;
}

function showSudoError(message) {
  const errorMessage = document.getElementById('sudo-error-message');
  const errorText = document.getElementById('sudo-error-text');
  
  if (errorMessage) errorMessage.classList.remove('hidden');
  if (errorText) errorText.textContent = message;
}

async function handleSudoPasswordConfirm() {
  const input = document.getElementById('sudo-password-input');
  const btnConfirm = document.getElementById('btn-sudo-confirm');
  const btnCancel = document.getElementById('btn-sudo-cancel');
  const confirmIcon = document.getElementById('sudo-confirm-icon');
  const confirmText = document.getElementById('sudo-confirm-text');
  
  if (!input || !input.value) return;
  
  const password = input.value;
  
  // 禁用输入和按钮
  if (input) input.disabled = true;
  if (btnConfirm) btnConfirm.disabled = true;
  if (btnCancel) btnCancel.disabled = true;
  
  // 显示验证中状态
  if (confirmIcon) confirmIcon.textContent = 'sync';
  if (confirmText) confirmText.textContent = '验证中...';
  if (confirmIcon) confirmIcon.classList.add('spinning');
  
  try {
    // 调用后端验证密码
    const result = await window.mofoxAPI.sudoValidatePassword(password);
    
    if (result.valid) {
      // 密码正确，设置到后端
      await window.mofoxAPI.sudoSetPassword(password);
      
      // 隐藏对话框
      hideSudoPasswordDialog();
      
      // 继续安装
      await performInstall();
      
    } else {
      // 密码错误
      sudoRetryCount++;
      
      if (sudoRetryCount >= MAX_SUDO_RETRIES) {
        // 达到最大重试次数
        showSudoError(`密码错误次数过多 (${MAX_SUDO_RETRIES}/${MAX_SUDO_RETRIES})，请稍后重试`);
        
        setTimeout(() => {
          hideSudoPasswordDialog();
          envState.installing = false;
          if (!document.getElementById('install-log')?.textContent) {
            document.getElementById('install-progress')?.classList.add('hidden');
          }
          document.getElementById('install-hint')?.classList.remove('hidden');
        }, 2000);
        
      } else {
        // 允许重试
        showSudoError(`密码错误 (${sudoRetryCount}/${MAX_SUDO_RETRIES})，请重新输入`);
        
        // 恢复输入状态
        if (input) {
          input.value = '';
          input.disabled = false;
          input.focus();
        }
        if (confirmIcon) confirmIcon.textContent = 'check';
        if (confirmText) confirmText.textContent = '确认';
        if (confirmIcon) confirmIcon.classList.remove('spinning');
        if (btnCancel) btnCancel.disabled = false;
      }
    }
    
  } catch (error) {
    console.error('验证 sudo 密码失败:', error);
    showSudoError('验证失败: ' + error.message);
    
    // 恢复输入状态
    if (input) {
      input.disabled = false;
      input.focus();
    }
    if (confirmIcon) confirmIcon.textContent = 'check';
    if (confirmText) confirmText.textContent = '确认';
    if (confirmIcon) confirmIcon.classList.remove('spinning');
    if (btnCancel) btnCancel.disabled = false;
  }
}

// ─── 自动安装所有缺失依赖 ──────────────────────────────────────────────

async function autoInstallAll() {
  if (envState.installing) return;
  envState.installing = true;

  try {
    // 1. 检查是否是 Linux 系统且需要 sudo 密码
    const platformInfo = await window.mofoxAPI.getPlatformInfo();
    const isLinux = platformInfo.platform === 'linux';
    
    if (isLinux) {
      // 检查是否已有密码
      const { hasPassword } = await window.mofoxAPI.sudoHasPassword();
      
      if (!hasPassword) {
        // 显示密码输入对话框
        showSudoPasswordDialog();
        // 等待密码验证完成后，会自动调用 performInstall()
        return;
      }
    }
    
    // 2. 如果不需要密码或已有密码，直接安装
    await performInstall();
    
  } catch (error) {
    console.error('准备安装失败:', error);
    envState.installing = false;
  }
}

async function performInstall() {
  // 显示安装进度界面
  document.getElementById('install-hint')?.classList.add('hidden');
  document.getElementById('install-progress')?.classList.remove('hidden');
  
  const progressBar = document.getElementById('install-progress-bar');
  const progressTitle = document.getElementById('install-progress-title');
  const progressIcon = document.getElementById('install-progress-icon');
  const installLog = document.getElementById('install-log');
  
  if (progressBar) progressBar.style.width = '0%';
  if (installLog) installLog.textContent = '';
  if (progressTitle) progressTitle.textContent = '正在准备安装...';
  if (progressIcon) {
    progressIcon.textContent = 'sync';
    progressIcon.classList.add('spinning');
    progressIcon.style.color = '';
  }

  // 监听安装进度
  const progressHandler = (data) => {
    if (data.type === 'status' || data.type === 'installing') {
      if (progressTitle) {
        progressTitle.textContent = data.message || `正在安装 ${data.depName}...`;
      }
    }
    if (data.type === 'download' && data.percent != null) {
      if (progressBar) {
        progressBar.style.width = `${data.percent}%`;
      }
    }
    if (data.type === 'log' && data.message) {
      if (installLog) {
        installLog.textContent += data.message;
        installLog.scrollTop = installLog.scrollHeight;
      }
    }
  };

  window.mofoxAPI.onEnvInstallProgress(progressHandler);

  try {
    const installResult = await window.mofoxAPI.envInstallAllMissing(envState.results);

    if (progressBar) progressBar.style.width = '100%';
    const progressIcon = document.getElementById('install-progress-icon');
    if (progressIcon) {
      progressIcon.classList.remove('spinning');
      progressIcon.textContent = installResult.success ? 'check_circle' : 'error';
      progressIcon.style.color = installResult.success ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-error)';
    }

    if (progressTitle) {
      progressTitle.textContent = installResult.success ? '安装完成！' : '部分安装失败';
    }
    
    if (!installResult.success) {
      if (installLog) installLog.textContent += `\n⚠️ 安装未完全成功，请查看上方日志或手动安装。\n`;
      // 不需要重启，直接重新检测环境
      await runEnvCheck(true);
    } else {
      if (installLog) installLog.textContent += `\n✨ 所有依赖项已安装完成。\n`;
      
      // 如果需要重启，弹出对话框询问
      if (installResult.needRestart) {
        if (installLog) {
          installLog.textContent += `\n⚠️ 依赖安装完成后需要重新启动系统才能生效。\n`;
        }
        
        // 等待一下让用户看到完成消息
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 弹出对话框询问是否重启电脑
        const shouldRestart = await window.customDialog.confirm(
          '依赖项已成功安装。\n\n为了让系统环境变量生效（如 PATH），需要重新启动电脑。\n\n是否现在重启？',
          '需要重新启动电脑'
        );
        
        if (shouldRestart) {
          // 用户选择重启电脑
          try {
            await window.mofoxAPI.appRestart();
            // 重启命令已发送，关闭应用
            await window.customDialog.alert('系统将在 10 秒后重启。\n\n请保存其他应用中的工作。', '即将重启');
          } catch (err) {
            console.error('重启失败:', err);
            await window.customDialog.alert('重启失败: ' + err.message + '\n\n请手动重启电脑以使环境变量生效。', '错误');
            // 重启失败，还是重新检测一下
            await runEnvCheck(true);
          }
        } else {
          // 用户选择稍后重启，重新检测环境
          await runEnvCheck(true);
        }
      } else {
        // 不需要重启，直接重新检测环境
        await runEnvCheck(true);
      }
    }
    
  } catch (err) {
    console.error('自动安装失败:', err);
    if (progressTitle) progressTitle.textContent = '安装出错';
    if (installLog) installLog.textContent += `\n❌ 安装出错: ${err.message}\n`;
    
    const progressIcon = document.getElementById('install-progress-icon');
    if (progressIcon) {
      progressIcon.classList.remove('spinning');
      progressIcon.textContent = 'error';
      progressIcon.style.color = 'var(--md-sys-color-error)';
    }

    // 重新检测环境，并保留进度和日志显示
    await runEnvCheck(true);
  } finally {
    envState.installing = false;
    
    // 清除 sudo 密码
    try {
      await window.mofoxAPI.sudoClearPassword();
    } catch (err) {
      console.warn('清除 sudo 密码失败:', err);
    }
  }
}
