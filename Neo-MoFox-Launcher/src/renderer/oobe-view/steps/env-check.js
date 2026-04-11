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
          <div class="install-progress-header">
            <span class="material-symbols-rounded spinning">sync</span>
            <span id="install-progress-title">正在安装...</span>
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
    }
    .hidden {
      display: none !important;
    }
  `;
  container.appendChild(style);

  // 绑定事件
  const btnAutoInstall = document.getElementById('btn-auto-install');
  const btnRecheck = document.getElementById('btn-recheck');

  btnAutoInstall?.addEventListener('click', async () => {
    await autoInstallAll();
  });

  btnRecheck?.addEventListener('click', async () => {
    await runEnvCheck();
  });

  // 设置验证函数
  stepManager.setValidator('env-check', async () => {
    return envState.allPassed;
  });

  // 初始运行检测
  await runEnvCheck();
}

// ─── 运行环境检测 ─────────────────────────────────────────────────────

async function runEnvCheck() {
  if (envState.checking) return envState.allPassed;
  envState.checking = true;

  // 重置 UI
  resetCheckUI();

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

function resetCheckUI() {
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
  document.getElementById('install-progress')?.classList.add('hidden');
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

// ─── 自动安装所有缺失依赖 ──────────────────────────────────────────────

async function autoInstallAll() {
  if (envState.installing) return;
  envState.installing = true;

  document.getElementById('install-hint')?.classList.add('hidden');
  document.getElementById('install-progress')?.classList.remove('hidden');
  
  const progressBar = document.getElementById('install-progress-bar');
  const progressTitle = document.getElementById('install-progress-title');
  const installLog = document.getElementById('install-log');
  
  if (progressBar) progressBar.style.width = '0%';
  if (installLog) installLog.textContent = '';
  if (progressTitle) progressTitle.textContent = '正在准备安装...';

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
        installLog.textContent += data.message + '\n';
        installLog.scrollTop = installLog.scrollHeight;
      }
    }
  };

  window.mofoxAPI.onEnvInstallProgress(progressHandler);

  try {
    const installResult = await window.mofoxAPI.envInstallAllMissing(envState.results);

    if (progressBar) progressBar.style.width = '100%';
    if (progressTitle) {
      progressTitle.textContent = installResult.success ? '安装完成！' : '部分安装失败';
    }

    await new Promise(r => setTimeout(r, 2000));

    document.getElementById('install-progress')?.classList.add('hidden');
    await runEnvCheck();
  } catch (err) {
    console.error('自动安装失败:', err);
    if (progressTitle) progressTitle.textContent = '安装出错';
    if (installLog) installLog.textContent += `\n❌ 安装出错: ${err.message}\n`;
  } finally {
    envState.installing = false;
  }
}
