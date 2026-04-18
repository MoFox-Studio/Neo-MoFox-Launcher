/**
 * Import Wizard - 整合包导入向导
 * 负责整合包解析、用户配置、环境检测、安装执行等流程
 */

// ─── 状态管理 ────────────────────────────────────────────────────────

const state = {
  currentStep: 1,
  totalSteps: 5,
  
  // 整合包信息
  packPath: null,
  packManifest: null,
  
  // 环境检测
  envCheckPassed: false,
  pythonCmd: null,
  
  // 用户输入
  inputs: {
    instanceName: '',
    qqNumber: '',
    qqNickname: '',
    ownerQQNumber: '',
    apiKey: '',
    wsPort: 8095,
    webuiApiKey: '',
    installDir: '',
  },
  
  // 安装状态
  installing: false,
  installSteps: [],
};

// ─── DOM 元素引用 ──────────────────────────────────────────────────────

const el = {
  // 步骤容器
  steps: document.querySelectorAll('.wizard-step'),
  stepItems: document.querySelectorAll('.step-item'),
  
  // 导航按钮
  btnBack: document.getElementById('btn-back'),
  btnNext: document.getElementById('btn-next'),
  btnCancel: document.getElementById('btn-cancel'),
  btnRetry: document.getElementById('btn-retry'),
  btnFinish: document.getElementById('btn-finish'),
  
  // 步骤 1: 选择整合包
  btnSelectPack: document.getElementById('btn-select-pack'),
  packSelector: document.getElementById('pack-selector'),
  selectedPackInfo: document.getElementById('selected-pack-info'),
  packFilename: document.getElementById('pack-filename'),
  packInfoBody: document.getElementById('pack-info-body'),
  
  // 步骤 2: 环境检测
  checkPython: document.getElementById('check-python'),
  checkUv: document.getElementById('check-uv'),
  checkGit: document.getElementById('check-git'),
  envCheckResult: document.getElementById('env-check-result'),
  
  // 步骤 3: 用户配置
  inputInstanceName: document.getElementById('input-instance-name'),
  inputQqNumber: document.getElementById('input-qq-number'),
  inputQqNickname: document.getElementById('input-qq-nickname'),
  inputOwnerQq: document.getElementById('input-owner-qq'),
  inputApiKey: document.getElementById('input-api-key'),
  btnToggleApiKey: document.getElementById('btn-toggle-api-key'),
  btnGetApiKey: document.getElementById('btn-get-api-key'),
  inputWsPort: document.getElementById('input-ws-port'),
  inputWebuiApiKey: document.getElementById('input-webui-api-key'),
  btnToggleWebuiKey: document.getElementById('btn-toggle-webui-key'),
  btnGenerateWebuiKey: document.getElementById('btn-generate-webui-key'),
  passwordStrength: document.getElementById('password-strength'),
  strengthFill: document.getElementById('strength-fill'),
  strengthText: document.getElementById('strength-text'),
  inputInstallDir: document.getElementById('input-install-dir'),
  btnBrowseDir: document.getElementById('btn-browse-dir'),
  
  // 步骤 4: 安装确认
  summaryPackName: document.getElementById('summary-pack-name'),
  summaryPackVersion: document.getElementById('summary-pack-version'),
  summaryPackAuthor: document.getElementById('summary-pack-author'),
  summaryPackDescription: document.getElementById('summary-pack-description'),
  summaryContentList: document.getElementById('summary-content-list'),
  summaryInstanceName: document.getElementById('summary-instance-name'),
  summaryQqNumber: document.getElementById('summary-qq-number'),
  summaryQqNickname: document.getElementById('summary-qq-nickname'),
  summaryOwnerQq: document.getElementById('summary-owner-qq'),
  summaryWsPort: document.getElementById('summary-ws-port'),
  summaryInstallDir: document.getElementById('summary-install-dir'),
  summaryStepList: document.getElementById('summary-step-list'),
  
  // 步骤 5: 安装执行
  progressFill: document.getElementById('progress-fill'),
  progressStep: document.getElementById('progress-step'),
  progressPercent: document.getElementById('progress-percent'),
  installLogContent: document.getElementById('install-log-content'),
  btnToggleLog: document.getElementById('btn-toggle-log'),
  installResult: document.getElementById('install-result'),
  installSteps: document.getElementById('install-steps'),
};

// ─── 初始化 ────────────────────────────────────────────────────────────

async function init() {
  console.log('[ImportWizard] 导入向导初始化');
  
  // 绑定事件
  bindEvents();
  
  // 设置默认安装路径
  await setDefaultInstallDir();
  
  // 初始化步骤状态和按钮显示
  goToStep(1);
  
  console.log('[ImportWizard] 初始化完成');
}

// ─── 事件绑定 ──────────────────────────────────────────────────────────

function bindEvents() {
  // 导航按钮
  el.btnBack?.addEventListener('click', async () => await goBack());
  el.btnNext?.addEventListener('click', goNext);
  el.btnCancel?.addEventListener('click', async () => await handleCancel());
  el.btnRetry?.addEventListener('click', retryInstall);
  el.btnFinish?.addEventListener('click', finishAndClose);
  
  // 步骤 1: 选择整合包
  el.btnSelectPack?.addEventListener('click', selectPack);
  el.packSelector?.addEventListener('click', selectPack);
  
  // 步骤 3: 用户配置
  el.btnToggleApiKey?.addEventListener('click', () => togglePasswordVisibility(el.inputApiKey, el.btnToggleApiKey));
  el.btnGetApiKey?.addEventListener('click', () => window.open('https://cloud.siliconflow.cn/account/ak', '_blank'));
  el.btnToggleWebuiKey?.addEventListener('click', () => togglePasswordVisibility(el.inputWebuiApiKey, el.btnToggleWebuiKey));
  el.btnGenerateWebuiKey?.addEventListener('click', generateWebuiApiKey);
  el.inputWebuiApiKey?.addEventListener('input', evaluatePasswordStrength);
  el.btnBrowseDir?.addEventListener('click', browseInstallDir);
  
  // 回车键智能处理
  [el.inputInstanceName, el.inputQqNumber, el.inputQqNickname, el.inputOwnerQq, el.inputApiKey, el.inputWsPort, el.inputWebuiApiKey].forEach(input => {
    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleEnterKey(input, e);
      }
    });
  });
  
  // 输入框失焦清除错误
  [el.inputInstanceName, el.inputQqNumber, el.inputQqNickname, el.inputOwnerQq, el.inputApiKey, el.inputWsPort, el.inputWebuiApiKey, el.inputInstallDir].forEach(input => {
    input?.addEventListener('focus', () => clearFieldError(input));
  });
  
  // 步骤 5: 安装日志折叠
  el.btnToggleLog?.addEventListener('click', toggleLog);
  
  // 监听导入进度事件
  window.mofoxAPI.onImportProgress?.((data) => {
    console.log('[ImportWizard] 收到进度事件:', data);
    const { percent, message } = data || {};
    updateProgress(percent, message);
  });
  
  window.mofoxAPI.onImportOutput?.((message) => {
    console.log('[ImportWizard] 收到输出日志:', message);
    appendLog(message);
  });
  
  window.mofoxAPI.onImportStepChange?.((data) => {
    console.log('[ImportWizard] 收到步骤变化:', data);
    const { step, status } = data || {};
    updateStepIndicator(step, status);
  });
  
  window.mofoxAPI.onImportComplete?.((data) => {
    console.log('[ImportWizard] 收到完成事件:', data);
    const { success, instanceId, error } = data || {};
    onInstallComplete(success, instanceId, error);
  });
}

// ─── 步骤导航 ──────────────────────────────────────────────────────────

function goToStep(step) {
  if (step < 1 || step > state.totalSteps) return;
  
  state.currentStep = step;
  
  // 更新步骤显示
  el.steps.forEach((s, i) => {
    s.classList.toggle('hidden', i + 1 !== step);
  });
  
  // 更新侧边栏
  el.stepItems.forEach((item, i) => {
    item.classList.remove('active', 'completed');
    if (i + 1 < step) {
      item.classList.add('completed');
    } else if (i + 1 === step) {
      item.classList.add('active');
    }
  });
  
  // 更新按钮状态
  el.btnBack.classList.toggle('hidden', step === 1 || step === 5);
  el.btnNext.classList.toggle('hidden', step === 5);
  el.btnCancel.classList.toggle('hidden', step !== 1);
  
  // 步骤 2 自动运行环境检测
  if (step === 2 && !state.envCheckPassed) {
    runEnvCheck();
  }
  
  // 步骤 4 显示摘要
  if (step === 4) {
    updateSummary();
  }
  
  // 步骤 5 开始安装
  if (step === 5) {
    console.log('[ImportWizard] 进入步骤 5，准备开始导入');
    el.btnNext.classList.add('hidden');
    el.btnFinish.classList.add('hidden');
    // 确保步骤指示器可见
    if (el.installSteps) {
      el.installSteps.classList.remove('hidden');
      console.log('[ImportWizard] 步骤指示器已显示');
    } else {
      console.error('[ImportWizard] 步骤指示器元素未找到！');
    }
    // 稍微延迟启动导入，确保UI更新完成
    setTimeout(() => startImport(), 100);
  }
}

async function goNext() {
  clearAllErrors();
  
  // 步骤 1: 选择整合包
  if (state.currentStep === 1) {
    if (!state.packPath || !state.packManifest) {
      await showError('请先选择整合包文件');
      return;
    }
  }
  
  // 步骤 2: 环境检测
  if (state.currentStep === 2) {
    if (!state.envCheckPassed) {
      await showError('环境检测未通过，请先安装缺失的依赖');
      return;
    }
  }
  
  // 步骤 3: 用户配置
  if (state.currentStep === 3) {
    if (!validateInputs()) {
      return;
    }
    collectInputs();
  }
  
  goToStep(state.currentStep + 1);
}

async function goBack() {
  if (state.currentStep > 1) {
    goToStep(state.currentStep - 1);
  }
}

async function handleCancel() {
  const confirmed = await window.customDialog.confirm(
    '确定要取消导入并返回主界面吗？当前的导入进度将会丢失。',
    '取消导入'
  );
  
  if (confirmed) {
    window.location.href = '../main-view/index.html';
  }
}

// ─── 步骤 1: 选择整合包 ───────────────────────────────────────────────

async function selectPack() {
  try {
    const result = await window.mofoxAPI.selectIntegrationPack();
    
    if (result.success && result.filePath) {
      state.packPath = result.filePath;
      el.packFilename.textContent = result.fileName;
      el.selectedPackInfo.classList.remove('hidden');
      el.packSelector.style.display = 'none';
      
      // 显示加载状态
      el.packInfoBody.innerHTML = `
        <div class="info-loading spinning">
          <span class="material-symbols-rounded">progress_activity</span>
          <span>正在解析整合包...</span>
        </div>
      `;
      
      // 解析整合包
      await parsePack(result.filePath);
    }
  } catch (error) {
    console.error('[ImportWizard] 选择整合包失败:', error);
    await showError('选择整合包失败: ' + error.message);
  }
}

async function parsePack(packPath) {
  try {
    const result = await window.mofoxAPI.parseIntegrationPack(packPath);
    
    if (!result.success) {
      throw new Error(result.error || '解析失败');
    }
    
    state.packManifest = result.manifest;
    
    // 显示整合包信息
    displayPackInfo(result.manifest);
    
    // 自动填充实例名称
    if (el.inputInstanceName) {
      el.inputInstanceName.value = result.manifest.packName || '导入的实例';
      state.inputs.instanceName = el.inputInstanceName.value;
    }
    
  } catch (error) {
    console.error('[ImportWizard] 解析整合包失败:', error);
    el.packInfoBody.innerHTML = `
      <div class="info-loading">
        <span class="material-symbols-rounded" style="color: var(--md-sys-color-error);">error</span>
        <span style="color: var(--md-sys-color-error);">解析失败: ${error.message}</span>
      </div>
    `;
    state.packPath = null;
    state.packManifest = null;
  }
}

function displayPackInfo(manifest) {
  const content = manifest.content || {};
  
  el.packInfoBody.innerHTML = `
    <div class="pack-metadata">
      <span class="meta-label">版本</span>
      <span class="meta-value">${manifest.packVersion || 'N/A'}</span>
      
      <span class="meta-label">作者</span>
      <span class="meta-value">${manifest.author || '未知'}</span>
      
      <span class="meta-label">创建时间</span>
      <span class="meta-value">${manifest.createdAt ? new Date(manifest.createdAt).toLocaleString('zh-CN') : 'N/A'}</span>
      
      <span class="meta-label">描述</span>
      <span class="meta-value">${manifest.description || '无描述'}</span>
    </div>
    
    <div class="pack-content-list">
      <h4>包含内容</h4>
      ${generateContentItems(content)}
    </div>
  `;
}

function generateContentItems(content) {
  const items = [];
  
  if (content.neoMofox?.included) {
    items.push(`
      <div class="content-item">
        <span class="material-symbols-rounded">widgets</span>
        <div class="content-item-text">
          <div class="content-item-name">Neo-MoFox 主程序</div>
          <div class="content-item-detail">${content.neoMofox.version ? `版本: ${content.neoMofox.version}` : ''}</div>
        </div>
        <span class="content-item-badge">已内置</span>
      </div>
    `);
  }
  
  if (content.napcat?.included) {
    items.push(`
      <div class="content-item">
        <span class="material-symbols-rounded">chat</span>
        <div class="content-item-text">
          <div class="content-item-name">NapCat</div>
          <div class="content-item-detail">${content.napcat.version ? `版本: ${content.napcat.version}` : ''}</div>
        </div>
        <span class="content-item-badge">已内置</span>
      </div>
    `);
  } else if (content.napcat?.installOnImport) {
    items.push(`
      <div class="content-item">
        <span class="material-symbols-rounded">download</span>
        <div class="content-item-text">
          <div class="content-item-name">NapCat</div>
          <div class="content-item-detail">导入时自动下载安装</div>
        </div>
        <span class="content-item-badge" style="background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container);">自动安装</span>
      </div>
    `);
  }
  
  if (content.config?.included) {
    items.push(`
      <div class="content-item">
        <span class="material-symbols-rounded">settings</span>
        <div class="content-item-text">
          <div class="content-item-name">配置文件</div>
          <div class="content-item-detail">core.toml</div>
        </div>
        <span class="content-item-badge">已内置</span>
      </div>
    `);
  }
  
  if (content.plugins?.included && content.plugins.list?.length > 0) {
    items.push(`
      <div class="content-item">
        <span class="material-symbols-rounded">extension</span>
        <div class="content-item-text">
          <div class="content-item-name">插件</div>
          <div class="content-item-detail">${content.plugins.list.length} 个插件</div>
        </div>
        <span class="content-item-badge">已内置</span>
      </div>
    `);
  }
  
  if (content.data?.included) {
    items.push(`
      <div class="content-item">
        <span class="material-symbols-rounded">database</span>
        <div class="content-item-text">
          <div class="content-item-name">数据文件</div>
          <div class="content-item-detail">用户数据和配置</div>
        </div>
        <span class="content-item-badge">已内置</span>
      </div>
    `);
  }
  
  if (items.length === 0) {
    return '<p style="color: var(--md-sys-color-on-surface-variant); font-size: 14px;">此整合包不包含任何组件</p>';
  }
  
  return items.join('');
}

// ─── 步骤 2: 环境检测 ─────────────────────────────────────────────────

async function runEnvCheck() {
  try {
    // 使用后端现有的 envCheckAll API
    const result = await window.mofoxAPI.envCheckAll();
    
    // 适配后端返回格式: { passed, checks: { python, uv, git }, platform, platformLabel }
    updateCheckItem(el.checkPython, result.checks.python.valid, result.checks.python.version);
    updateCheckItem(el.checkUv, result.checks.uv.valid, result.checks.uv.version);
    updateCheckItem(el.checkGit, result.checks.git.valid, result.checks.git.version);
    
    state.envCheckPassed = result.passed;
    state.pythonCmd = result.checks.python.command;
    
    if (!result.passed) {
      el.envCheckResult.classList.remove('hidden');
      el.envCheckResult.innerHTML = `
        <div class="result-error">
          <span class="material-symbols-rounded">error</span>
          <p>环境检测未通过，请先安装缺失的依赖。</p>
        </div>
      `;
    } else {
      el.envCheckResult.classList.add('hidden');
    }
  } catch (error) {
    console.error('[ImportWizard] 环境检测失败:', error);
    await showError('环境检测失败: ' + error.message);
  }
}

function updateCheckItem(itemEl, passed, version = '') {
  if (!itemEl) return;
  
  const iconEl = itemEl.querySelector('.check-icon .material-symbols-rounded');
  const detailEl = itemEl.querySelector('.check-detail');
  
  iconEl.className = 'material-symbols-rounded';
  
  if (passed) {
    iconEl.classList.add('success');
    iconEl.textContent = 'check_circle';
    detailEl.textContent = version ? `已安装: ${version}` : '已安装';
    detailEl.style.color = 'var(--status-running)';
  } else {
    iconEl.classList.add('error');
    iconEl.textContent = 'cancel';
    detailEl.textContent = '未安装';
    detailEl.style.color = 'var(--md-sys-color-error)';
  }
}

// ─── 步骤 3: 用户配置 ─────────────────────────────────────────────────

async function setDefaultInstallDir() {
  try {
    // 从设置中读取默认安装路径（学习 install wizard 的方式）
    const settings = await window.mofoxAPI.settingsRead();
    if (settings?.defaultInstallDir) {
      el.inputInstallDir.value = settings.defaultInstallDir;
      state.inputs.installDir = settings.defaultInstallDir;
    }
  } catch (error) {
    console.error('[ImportWizard] 获取默认安装路径失败:', error);
  }
}

async function browseInstallDir() {
  try {
    // 使用和安装向导相同的 API
    const path = await window.mofoxAPI.selectProjectPath();
    if (path) {
      el.inputInstallDir.value = path;
      state.inputs.installDir = path;
    }
  } catch (error) {
    console.error('[ImportWizard] 选择目录失败:', error);
    await showError('选择目录失败: ' + error.message);
  }
}

function togglePasswordVisibility(input, button) {
  const icon = button.querySelector('.material-symbols-rounded');
  if (input.type === 'password') {
    input.type = 'text';
    icon.textContent = 'visibility_off';
  } else {
    input.type = 'password';
    icon.textContent = 'visibility';
  }
}

function generateWebuiApiKey() {
  const key = generateSecureApiKey(32);
  el.inputWebuiApiKey.value = key;
  evaluatePasswordStrength();
}

function generateSecureApiKey(length = 32) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => charset[byte % charset.length]).join('');
}

function evaluatePasswordStrength() {
  const password = el.inputWebuiApiKey.value;
  
  if (!password) {
    el.passwordStrength.classList.add('hidden');
    return;
  }
  
  el.passwordStrength.classList.remove('hidden');
  
  let score = 0;
  
  if (password.length >= 8) score += 10;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;
  if (password.length >= 20) score += 10;
  
  if (/[a-z]/.test(password)) score += 15;
  if (/[A-Z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 15;
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;
  
  let level, text;
  if (score < 40) {
    level = 'weak';
    text = '弱';
  } else if (score < 70) {
    level = 'medium';
    text = '中等';
  } else {
    level = 'strong';
    text = '强';
  }
  
  el.strengthFill.className = `strength-fill ${level}`;
  el.strengthFill.style.width = `${score}%`;
  el.strengthText.textContent = `密码强度: ${text}`;
}

function validateInputs() {
  let isValid = true;
  
  // 实例名称
  if (!el.inputInstanceName.value.trim()) {
    showFieldError(el.inputInstanceName, '请输入实例名称');
    isValid = false;
  }
  
  // Bot QQ 号
  const qqNumber = el.inputQqNumber.value.trim();
  if (!qqNumber) {
    showFieldError(el.inputQqNumber, '请输入 Bot QQ 号');
    isValid = false;
  } else if (!/^\d{5,12}$/.test(qqNumber)) {
    showFieldError(el.inputQqNumber, 'QQ 号必须为 5-12 位数字');
    isValid = false;
  }
  
  // Bot 昵称
  if (!el.inputQqNickname.value.trim()) {
    showFieldError(el.inputQqNickname, '请输入 Bot QQ 昵称');
    isValid = false;
  }
  
  // 管理员 QQ
  const ownerQq = el.inputOwnerQq.value.trim();
  if (!ownerQq) {
    showFieldError(el.inputOwnerQq, '请输入管理员 QQ 号');
    isValid = false;
  } else if (!/^\d{5,12}$/.test(ownerQq)) {
    showFieldError(el.inputOwnerQq, '管理员QQ 号必须为 5-12 位数字');
    isValid = false;
  }
  
  // API Key
  if (!el.inputApiKey.value.trim()) {
    showFieldError(el.inputApiKey, '请输入 SiliconFlow API Key');
    isValid = false;
  }
  
  // WebSocket 端口
  const wsPort = parseInt(el.inputWsPort.value);
  if (!wsPort || wsPort < 1024 || wsPort > 65535) {
    showFieldError(el.inputWsPort, '端口号必须在 1024-65535 之间');
    isValid = false;
  }
  
  // 安装路径
  if (!el.inputInstallDir.value.trim()) {
    showFieldError(el.inputInstallDir, '请选择安装路径');
    isValid = false;
  }
  
  return isValid;
}

function collectInputs() {
  state.inputs = {
    instanceName: el.inputInstanceName.value.trim(),
    qqNumber: el.inputQqNumber.value.trim(),
    qqNickname: el.inputQqNickname.value.trim(),
    ownerQQNumber: el.inputOwnerQq.value.trim(),
    apiKey: el.inputApiKey.value.trim(),
    wsPort: parseInt(el.inputWsPort.value),
    webuiApiKey: el.inputWebuiApiKey.value.trim() || generateSecureApiKey(32),
    installDir: el.inputInstallDir.value.trim(),
  };
}

// ─── 步骤 4: 安装确认 ─────────────────────────────────────────────────

function updateSummary() {
  const manifest = state.packManifest;
  const inputs = state.inputs;
  const content = manifest.content || {};
  
  // 整合包信息
  el.summaryPackName.textContent = manifest.packName || 'N/A';
  el.summaryPackVersion.textContent = manifest.packVersion || 'N/A';
  el.summaryPackAuthor.textContent = manifest.author || '未知';
  el.summaryPackDescription.textContent = manifest.description || '无描述';
  
  // 包含内容
  const contentTags = [];
  if (content.neoMofox?.included) contentTags.push('<div class="content-tag"><span class="material-symbols-rounded">widgets</span>Neo-MoFox</div>');
  if (content.napcat?.included) contentTags.push('<div class="content-tag"><span class="material-symbols-rounded">chat</span>NapCat</div>');
  if (content.config?.included) contentTags.push('<div class="content-tag"><span class="material-symbols-rounded">settings</span>配置文件</div>');
  if (content.plugins?.included) contentTags.push(`<div class="content-tag"><span class="material-symbols-rounded">extension</span>${content.plugins.list.length} 个插件</div>`);
  if (content.data?.included) contentTags.push('<div class="content-tag"><span class="material-symbols-rounded">database</span>数据文件</div>');
  
  el.summaryContentList.innerHTML = contentTags.join('') || '<p style="color: var(--md-sys-color-on-surface-variant);">无</p>';
  
  // 实例配置
  el.summaryInstanceName.textContent = inputs.instanceName;
  el.summaryQqNumber.textContent = inputs.qqNumber;
  el.summaryQqNickname.textContent = inputs.qqNickname;
  el.summaryOwnerQq.textContent = inputs.ownerQQNumber;
  el.summaryWsPort.textContent = inputs.wsPort;
  el.summaryInstallDir.innerHTML = `<code>${inputs.installDir}</code>`;
  
  // 安装步骤
  const steps = generateInstallSteps(content);
  state.installSteps = steps;
  
  el.summaryStepList.innerHTML = steps.map(step => `
    <div class="step-list-item">
      <span class="material-symbols-rounded">arrow_forward</span>
      <span>${getStepDescription(step)}</span>
    </div>
  `).join('');
}

function generateInstallSteps(content) {
  const steps = ['extract-pack'];
  
  if (!content.neoMofox?.included) {
    steps.push('clone');
  }
  
  steps.push('venv', 'deps', 'gen-config');
  
  if (!content.config?.included) {
    steps.push('write-core');
  }
  
  steps.push('write-model', 'write-adapter');
  
  if (!content.napcat?.included) {
    if (content.napcat?.installOnImport) {
      steps.push('napcat');
    }
  }
  
  steps.push('napcat-config', 'register');
  
  return steps;
}

function getStepDescription(step) {
  const descriptions = {
    'extract-pack': '解压整合包文件',
    'clone': '克隆 Neo-MoFox 仓库',
    'venv': '创建 Python 虚拟环境',
    'deps': '安装 Python 依赖',
    'gen-config': '生成配置文件',
    'write-core': '写入 core.toml',
    'write-model': '写入 model.toml',
    'write-adapter': '写入适配器配置',
    'napcat': '安装 NapCat',
    'napcat-config': '配置 NapCat',
    'register': '注册实例',
  };
  
  return descriptions[step] || step;
}

// ─── 步骤 5: 安装执行 ─────────────────────────────────────────────────

async function startImport() {
  if (state.installing) {
    console.warn('[ImportWizard] 导入已在进行中');
    return;
  }
  
  console.log('[ImportWizard] 开始导入整合包...');
  state.installing = true;
  
  try {
    el.btnBack.classList.add('hidden');
    el.btnCancel.classList.add('hidden');
    
    // 重置进度
    updateProgress(0, '准备导入...');
    
    console.log('[ImportWizard] 调用后端导入 API，参数:', {
      packPath: state.packPath,
      instanceName: state.inputs.instanceName,
      installDir: state.inputs.installDir,
    });
    
    const result = await window.mofoxAPI.importIntegrationPack({
      packPath: state.packPath,
      ...state.inputs,
      pythonCmd: state.pythonCmd,
    });
    
    console.log('[ImportWizard] 后端返回结果:', result);
    
    if (!result.success) {
      throw new Error(result.error || '导入失败');
    }
    
  } catch (error) {
    console.error('[ImportWizard] 导入失败:', error);
    onInstallComplete(false, null, error.message);
  }
}

function updateProgress(percent, message) {
  console.log('[ImportWizard] 更新进度:', { percent, message });
  
  // 确保 percent 是有效数字
  const validPercent = typeof percent === 'number' && !isNaN(percent) ? percent : 0;
  
  if (el.progressFill) {
    el.progressFill.style.width = `${validPercent}%`;
  }
  
  if (el.progressPercent) {
    el.progressPercent.textContent = `${Math.round(validPercent)}%`;
  }
  
  if (el.progressStep && message) {
    el.progressStep.textContent = message;
  }
}

function appendLog(message) {
  const logLine = document.createElement('div');
  logLine.textContent = message;
  el.installLogContent.appendChild(logLine);
  el.installLogContent.scrollTop = el.installLogContent.scrollHeight;
}

function toggleLog() {
  const icon = el.btnToggleLog.querySelector('.material-symbols-rounded');
  if (el.installLogContent.style.maxHeight === '0px') {
    el.installLogContent.style.maxHeight = '400px';
    icon.textContent = 'expand_less';
  } else {
    el.installLogContent.style.maxHeight = '0px';
    icon.textContent = 'expand_more';
  }
}

function updateStepIndicator(step, status) {
  console.log('[ImportWizard] 更新步骤指示器:', { step, status });
  
  if (!step) {
    console.warn('[ImportWizard] 步骤名称为空');
    return;
  }
  
  const stepEl = document.querySelector(`.install-step-item[data-step="${step}"]`);
  if (!stepEl) {
    console.warn(`[ImportWizard] 未找到步骤元素: ${step}`);
    return;
  }
  
  stepEl.classList.remove('running', 'completed', 'failed');
  
  const iconEl = stepEl.querySelector('.step-icon');
  if (!iconEl) {
    console.warn(`[ImportWizard] 未找到步骤图标元素: ${step}`);
    return;
  }
  
  if (status === 'running') {
    stepEl.classList.add('running');
    iconEl.textContent = 'progress_activity';
  } else if (status === 'completed') {
    stepEl.classList.add('completed');
    iconEl.textContent = 'check_circle';
  } else if (status === 'failed') {
    stepEl.classList.add('failed');
    iconEl.textContent = 'cancel';
  }
}

function onInstallComplete(success, instanceId, error) {
  console.log('[ImportWizard] 安装完成:', { success, instanceId, error });
  state.installing = false;
  
  // 不要隐藏步骤指示器，让用户看到完整的安装过程
  // el.installSteps.classList.add('hidden');
  
  if (success) {
    el.installResult.classList.remove('hidden');
    el.installResult.innerHTML = `
      <div class="result-icon">
        <span class="material-symbols-rounded" style="color: var(--status-running); font-size: 64px;">check_circle</span>
      </div>
      <div class="result-text">
        <h3>导入成功！</h3>
        <p>实例已成功创建，现在可以启动使用了。</p>
      </div>
    `;
    
    el.btnFinish.classList.remove('hidden');
  } else {
    el.installResult.classList.remove('hidden');
    el.installResult.innerHTML = `
      <div class="result-icon">
        <span class="material-symbols-rounded" style="color: var(--md-sys-color-error); font-size: 64px;">error</span>
      </div>
      <div class="result-text">
        <h3>导入失败</h3>
        <p>${error || '未知错误'}</p>
      </div>
    `;
    
    el.btnRetry.classList.remove('hidden');
    el.btnCancel.classList.remove('hidden');
  }
}

async function retryInstall() {
  // 重置状态
  state.installing = false;
  el.installResult.classList.add('hidden');
  el.btnRetry.classList.add('hidden');
  el.btnCancel.classList.add('hidden');
  el.installLogContent.innerHTML = '';
  el.progressFill.style.width = '0%';
  el.progressPercent.textContent = '0%';
  el.progressStep.textContent = '准备中...';
  
  // 重新开始安装
  await startImport();
}

function finishAndClose() {
  window.close();
}

// ─── 工具函数 ──────────────────────────────────────────────────────────

function showFieldError(input, message) {
  const group = input.closest('.form-group');
  if (!group) return;
  
  group.classList.add('error');
  const hint = group.querySelector('.form-hint');
  if (hint) {
    if (!hint.dataset.originalText) {
      hint.dataset.originalText = hint.textContent;
    }
    hint.textContent = message;
    hint.style.color = 'var(--md-sys-color-error)';
  }
  input.focus();
}

function clearFieldError(input) {
  const group = input.closest('.form-group');
  if (!group) return;
  
  group.classList.remove('error');
  const hint = group.querySelector('.form-hint');
  if (hint && hint.dataset.originalText) {
    hint.textContent = hint.dataset.originalText;
    hint.style.color = '';
  }
}

function clearAllErrors() {
  document.querySelectorAll('.form-group.error').forEach(group => {
    group.classList.remove('error');
    const hint = group.querySelector('.form-hint');
    if (hint && hint.dataset.originalText) {
      hint.textContent = hint.dataset.originalText;
      hint.style.color = '';
    }
  });
}

async function showError(message) {
  await window.customDialog.alert(message, '错误');
}

function handleEnterKey(currentInput, event) {
  event.preventDefault();
  
  const allInputs = [
    el.inputInstanceName,
    el.inputQqNumber,
    el.inputQqNickname,
    el.inputOwnerQq,
    el.inputApiKey,
    el.inputWsPort,
    el.inputWebuiApiKey,
  ].filter(Boolean);
  
  const currentIndex = allInputs.indexOf(currentInput);
  
  if (currentIndex === -1) {
    goNext();
    return;
  }
  
  if (currentIndex < allInputs.length - 1) {
    allInputs[currentIndex + 1].focus();
  } else {
    goNext();
  }
}

// ─── 启动 ──────────────────────────────────────────────────────────────

init();
