const state = {
  currentStep: 1,
  totalSteps: 10,
  envCheckPassed: false,
  licenseLoaded: false,
  licenseAgreed: false,
  resumeMode: false, // 是否为续装模式
  resumeInstanceId: null, // 续装的实例 ID
  inputs: {
    instanceName: '',
    qqNumber: '',
    qqNickname: '',
    ownerQQNumber: '',
    apiKey: '',
    wsPort: 8095,
    channel: 'main',
    installDir: '',
    installNapcat: true,
    installWebui: true,
    webuiApiKey: '',
  },
  installing: false,
  pythonCmd: null,
};

// ─── URL 参数解析 ────────────────────────────────────────────────────────────

/**
 * 解析 URL 参数
 */
function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    instanceId: params.get('instanceId'),
    resume: params.get('resume') === '1',
  };
}

/**
 * 加载待续装的实例数据
 */
async function loadResumeInstance(instanceId) {
  try {
    const instances = await window.mofoxAPI.getInstances();
    const instance = instances.find(i => i.id === instanceId);
    
    if (!instance) {
      throw new Error('实例不存在');
    }
    
    if (instance.installCompleted) {
      throw new Error('实例安装已完成');
    }
    
    // 恢复配置信息到 state.inputs
    state.inputs = {
      instanceName: instance.displayName || '',
      qqNumber: instance.qqNumber || '',
      qqNickname: instance.qqNickname || '',
      ownerQQNumber: instance.ownerQQNumber || '',
      apiKey: instance.apiKey || '',
      wsPort: instance.wsPort || 8095,
      channel: instance.channel || 'main',
      installDir: instance.neomofoxDir ? instance.neomofoxDir.replace(/[\\\/]neo-mofox$/, '').replace(/[\\\/][^\\\/]+$/, '') : '',
      installNapcat: instance.installSteps ? instance.installSteps.includes('napcat') : true,
      installWebui: instance.installSteps ? instance.installSteps.includes('webui') : true,      webuiApiKey: instance.webuiApiKey || '',    };
    
    state.resumeMode = true;
    state.resumeInstanceId = instanceId;
    
    return instance;
  } catch (error) {
    console.error('加载续装实例失败:', error);
    throw error;
  }
}

const el = {
  steps: document.querySelectorAll('.wizard-step'),
  stepItems: document.querySelectorAll('.step-item'),
  btnBack: document.getElementById('btn-back'),
  btnNext: document.getElementById('btn-next'),
  btnCancel: document.getElementById('btn-cancel'),
  btnRetry: document.getElementById('btn-retry'),
  btnCleanup: document.getElementById('btn-cleanup'),
  btnFinish: document.getElementById('btn-finish'),
  
  checkPython: document.getElementById('check-python'),
  checkUv: document.getElementById('check-uv'),
  checkGit: document.getElementById('check-git'),
  envCheckResult: document.getElementById('env-check-result'),
  
  // License elements
  licenseTabs: document.querySelectorAll('.license-tab'),
  licenseLoading: document.getElementById('license-loading'),
  licenseError: document.getElementById('license-error'),
  licenseContentEula: document.getElementById('license-content-eula'),
  licenseContentPrivacy: document.getElementById('license-content-privacy'),
  btnReloadLicense: document.getElementById('btn-reload-license'),
  inputAgreeLicense: document.getElementById('input-agree-license'),
  
  inputInstanceName: document.getElementById('input-instance-name'),
  inputQqNumber: document.getElementById('input-qq-number'),
  inputQqNickname: document.getElementById('input-qq-nickname'),
  inputOwnerQq: document.getElementById('input-owner-qq'),
  inputApiKey: document.getElementById('input-api-key'),
  btnToggleApiKey: document.getElementById('btn-toggle-api-key'),
  btnGetApiKey: document.getElementById('btn-get-api-key'),
  inputWsPort: document.getElementById('input-ws-port'),
  inputChannel: document.getElementById('input-channel'),
  inputWebuiApiKey: document.getElementById('input-webui-api-key'),
  btnToggleWebuiKey: document.getElementById('btn-toggle-webui-key'),
  btnGenerateApiKey: document.getElementById('btn-generate-api-key'),
  strengthFill: document.getElementById('strength-fill'),
  strengthText: document.getElementById('strength-text'),
  inputInstallNapcat: document.getElementById('input-install-napcat'),
  inputInstallWebui: document.getElementById('input-install-webui'),
  inputInstallDir: document.getElementById('input-install-dir'),
  btnBrowseDir: document.getElementById('btn-browse-dir'),
  validationErrors: document.getElementById('validation-errors'),
  
  progressFill: document.getElementById('progress-fill'),
  progressStep: document.getElementById('progress-step'),
  progressPercent: document.getElementById('progress-percent'),
  installLogContent: document.getElementById('install-log-content'),
  btnToggleLog: document.getElementById('btn-toggle-log'),
  installResult: document.getElementById('install-result'),
};

/**
 * 评估密码强度
 * @param {string} password 
 * @returns {{score: number, level: 'weak'|'medium'|'strong'|'none', text: string}}
 */
function evaluatePasswordStrength(password) {
  if (!password) return { score: 0, level: 'none', text: '未输入' };
  
  let score = 0;
  
  // 长度评分（最高 40 分）
  if (password.length >= 8) score += 10;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;
  if (password.length >= 20) score += 10;
  
  // 字符类型评分（每种 15 分）
  if (/[a-z]/.test(password)) score += 15;  // 小写字母
  if (/[A-Z]/.test(password)) score += 15;  // 大写字母
  if (/[0-9]/.test(password)) score += 15;  // 数字
  if (/[^a-zA-Z0-9]/.test(password)) score += 15; // 特殊字符
  
  // 确定强度级别
  let level, text;
  if (score < 40) {
    level = 'weak';
    text = '弱 - 不推荐使用';
  } else if (score < 70) {
    level = 'medium';
    text = '中等 - 建议使用随机生成';
  } else {
    level = 'strong';
    text = '强';
  }
  
  return { score, level, text };
}

/**
 * 生成安全的随机密钥（单密钥）
 * @param {number} length 密钥长度（默认 32）
 * @returns {string}
 */
function generateSecureApiKey(length = 32) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  return Array.from(array, byte => charset[byte % charset.length]).join('');
}

function goToStep(step) {
  state.currentStep = step;
  
  el.steps.forEach((s, i) => {
    s.classList.toggle('hidden', i + 1 !== step);
  });
  
  el.stepItems.forEach((item, i) => {
    const stepNum = i + 1;
    item.classList.remove('active', 'completed');
    if (stepNum < step) item.classList.add('completed');
    else if (stepNum === step) item.classList.add('active');
  });
  
  el.btnBack.classList.toggle('hidden', step === 1 || step === 10);
  el.btnNext.classList.toggle('hidden', step === 10);
  el.btnCancel.classList.toggle('hidden', step !== 1);
  
  if (step === 2 && !state.licenseLoaded) {
    loadLicenseAgreements();
  }
  
  if (step === 9) {
    updateSummary();
  }
  
  if (step === 10) {
    startCarousel();
    startInstall();
  }
}

function showFieldError(input, message) {
  const group = input.closest('.form-group');
  if (!group) return;
  
  group.classList.add('error');
  const hint = group.querySelector('.form-hint');
  if (hint) {
    hint.dataset.originalText = hint.dataset.originalText || hint.textContent;
    hint.textContent = message;
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
  }
}

function clearAllErrors() {
  document.querySelectorAll('.form-group.error').forEach(group => {
    group.classList.remove('error');
    const hint = group.querySelector('.form-hint');
    if (hint && hint.dataset.originalText) {
      hint.textContent = hint.dataset.originalText;
    }
  });
}

function showLicenseError() {
  const agreement = document.querySelector('.license-agreement');
  if (agreement) {
    agreement.classList.add('error');
    // 滚动到同意框位置
    agreement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearLicenseError() {
  const agreement = document.querySelector('.license-agreement');
  if (agreement) {
    agreement.classList.remove('error');
  }
}

async function goNext() {
  clearAllErrors();
  clearLicenseError();
  
  // 步骤 1: 环境检测
  if (state.currentStep === 1 && !state.envCheckPassed) return;
  
  // 步骤 2: 许可协议
  if (state.currentStep === 2) {
    if (!state.licenseLoaded) {
      // 协议还未加载完成，不做处理，让用户等待
      return;
    }
    if (!el.inputAgreeLicense.checked) {
      showLicenseError();
      return;
    }
    state.licenseAgreed = true;
  }
  
  // 步骤 3: 实例名称
  if (state.currentStep === 3) {
    const name = el.inputInstanceName.value.trim();
    if (!name) {
      showFieldError(el.inputInstanceName, '❌ 请输入实例名称');
      return;
    }
    
    // 检查实例名称是否已存在
    try {
      const instances = await window.mofoxAPI.getInstances();
      const exists = instances.some(inst => inst.name === name);
      if (exists) {
        showFieldError(el.inputInstanceName, '❌ 该实例名称已存在，请使用其他名称');
        return;
      }
    } catch (error) {
      console.error('检查实例名称失败:', error);
      // 如果检查失败，允许继续但记录错误
    }
  }
  
  // 步骤 4: 账号配置
  if (state.currentStep === 4) {
    const qqNumber = el.inputQqNumber.value.trim();
    const qqNickname = el.inputQqNickname.value.trim();
    const ownerQq = el.inputOwnerQq.value.trim();
    
    if (!qqNumber || !/^\d{5,12}$/.test(qqNumber)) {
      showFieldError(el.inputQqNumber, '❌ 请输入正确的 Bot QQ 号（5-12 位数字）');
      return;
    }
    if (!qqNickname) {
      showFieldError(el.inputQqNickname, '❌ 请输入 Bot QQ 昵称');
      return;
    }
    if (!ownerQq || !/^\d{5,12}$/.test(ownerQq)) {
      showFieldError(el.inputOwnerQq, '❌ 请输入正确的主人 QQ 号（5-12 位数字）');
      return;
    }
  }
  
  // 步骤 5: 模型配置
  if (state.currentStep === 5) {
    const apiKey = el.inputApiKey.value.trim();
    if (!apiKey) {
      showFieldError(el.inputApiKey, '❌ 请输入 API Key');
      return;
    }
  }
  
  // 步骤 6: 网络配置（端口验证 + WebUI API 密钥）
  if (state.currentStep === 6) {
    const port = parseInt(el.inputWsPort.value, 10);
    if (!port || port < 1024 || port > 65535) {
      showFieldError(el.inputWsPort, '❌ 请输入有效的端口号（1024-65535）');
      return;
    }
    
    // 验证 WebUI API 密钥
    const apiKey = el.inputWebuiApiKey.value.trim();
    
    if (!apiKey) {
      showFieldError(el.inputWebuiApiKey, '❌ 请输入 API 密钥或点击随机生成');
      return;
    }
    
    if (apiKey.length < 8) {
      showFieldError(el.inputWebuiApiKey, '❌ 密钥长度至少为 8 位');
      return;
    }
    
    const strength = evaluatePasswordStrength(apiKey);
    if (strength.level === 'weak') {
      // 弱密码警告但允许继续
      const confirmed = await window.customConfirm(
        '当前密钥强度较弱，建议使用“随机生成”功能。是否继续？',
        '密钥强度警告'
      );
      if (!confirmed) return;
    }
    
    state.inputs.webuiApiKey = apiKey;
  }
  
  // 步骤 7: 组件选择（无需验证）
  
  // 步骤 8: 安装位置
  if (state.currentStep === 8) {
    const dir = el.inputInstallDir.value.trim();
    if (!dir) {
      showFieldError(el.inputInstallDir, '❌ 请选择安装目录');
      return;
    }
  }
  
  // 步骤 9: 确认摘要（最终验证）
  if (state.currentStep === 9) {
    if (!validateInputs()) return;
  }
  
  if (state.currentStep < state.totalSteps) {
    goToStep(state.currentStep + 1);
  }
}

function goBack() {
  if (state.currentStep > 1 && state.currentStep !== 10) {
    goToStep(state.currentStep - 1);
  }
}

function updateCheckItem(itemId, status, version = '') {
  const item = document.getElementById(itemId);
  if (!item) return;
  
  const loading = item.querySelector('.loading');
  const success = item.querySelector('.success');
  const error = item.querySelector('.error');
  const statusText = item.querySelector('.status-text');
  
  loading.classList.add('hidden');
  success.classList.add('hidden');
  error.classList.add('hidden');
  
  if (status === 'loading') {
    loading.classList.remove('hidden');
    statusText.textContent = '检测中...';
  } else if (status === 'success') {
    success.classList.remove('hidden');
    statusText.textContent = version ? `v${version}` : '已安装';
  } else if (status === 'error') {
    error.classList.remove('hidden');
    statusText.textContent = version || '未安装';
  }
}

async function runEnvCheck() {
  try {
    const result = await window.mofoxAPI.installEnvCheck();
    
    if (result.checks.python.valid) {
      updateCheckItem('check-python', 'success', result.checks.python.version);
      state.pythonCmd = result.checks.python.cmd;
    } else {
      updateCheckItem('check-python', 'error');
    }
    
    if (result.checks.uv.valid) {
      updateCheckItem('check-uv', 'success', result.checks.uv.version);
    } else {
      updateCheckItem('check-uv', 'error');
    }
    
    if (result.checks.git.valid) {
      updateCheckItem('check-git', 'success', result.checks.git.version);
    } else {
      updateCheckItem('check-git', 'error');
    }
    
    el.envCheckResult.classList.remove('hidden');
    const successDiv = el.envCheckResult.querySelector('.result-success');
    const errorDiv = el.envCheckResult.querySelector('.result-error');
    
    if (result.passed) {
      successDiv.classList.remove('hidden');
      errorDiv.classList.add('hidden');
      state.envCheckPassed = true;
    } else {
      successDiv.classList.add('hidden');
      errorDiv.classList.remove('hidden');
      errorDiv.querySelector('.error-message').innerHTML = result.error.replace(/\n/g, '<br>');
      state.envCheckPassed = false;
    }
  } catch (error) {
    console.error('环境检测失败:', error);
  }
}

// License agreements loading and rendering
async function loadLicenseAgreements() {
  const EULA_URL = 'https://raw.githubusercontent.com/MoFox-Studio/Neo-MoFox/refs/heads/dev/eula.md';
  const PRIVACY_URL = 'https://raw.githubusercontent.com/MoFox-Studio/Neo-MoFox/refs/heads/dev/PRIVACY.md';
  
  el.licenseLoading.classList.remove('hidden');
  el.licenseError.classList.add('hidden');
  el.licenseContentEula.classList.add('hidden');
  el.licenseContentPrivacy.classList.add('hidden');
  
  try {
    const [eulaResponse, privacyResponse] = await Promise.all([
      fetch(EULA_URL),
      fetch(PRIVACY_URL)
    ]);
    
    if (!eulaResponse.ok || !privacyResponse.ok) {
      throw new Error('加载许可协议失败');
    }
    
    const eulaText = await eulaResponse.text();
    const privacyText = await privacyResponse.text();
    
    // Use marked.js to render markdown
    if (typeof marked !== 'undefined') {
      el.licenseContentEula.innerHTML = marked.parse(eulaText);
      el.licenseContentPrivacy.innerHTML = marked.parse(privacyText);
    } else {
      // Fallback to plain text
      el.licenseContentEula.innerHTML = `<pre>${eulaText}</pre>`;
      el.licenseContentPrivacy.innerHTML = `<pre>${privacyText}</pre>`;
    }
    
    el.licenseLoading.classList.add('hidden');
    el.licenseContentEula.classList.remove('hidden');
    state.licenseLoaded = true;
    
  } catch (error) {
    console.error('加载许可协议失败:', error);
    el.licenseLoading.classList.add('hidden');
    el.licenseError.classList.remove('hidden');
    state.licenseLoaded = false;
  }
}

function switchLicenseTab(tabName) {
  el.licenseTabs.forEach(tab => {
    const isActive = tab.getAttribute('data-tab') === tabName;
    tab.classList.toggle('active', isActive);
  });
  
  if (tabName === 'eula') {
    el.licenseContentEula.classList.remove('hidden');
    el.licenseContentPrivacy.classList.add('hidden');
  } else if (tabName === 'privacy') {
    el.licenseContentEula.classList.add('hidden');
    el.licenseContentPrivacy.classList.remove('hidden');
  }
}


function collectInputs() {
  state.inputs = {
    instanceName: el.inputInstanceName.value.trim(),
    qqNumber: el.inputQqNumber.value.trim(),
    qqNickname: el.inputQqNickname.value.trim(),
    ownerQQNumber: el.inputOwnerQq.value.trim(),
    apiKey: el.inputApiKey.value.trim(),
    wsPort: parseInt(el.inputWsPort.value, 10) || 8095,
    channel: el.inputChannel.value,
    installDir: el.inputInstallDir.value.trim(),
    installNapcat: el.inputInstallNapcat.checked,
    installWebui: el.inputInstallWebui.checked,
    webuiApiKey: el.inputWebuiApiKey.value.trim(),
  };
  
  // 基础安装步骤（始终执行）
  const baseSteps = [
    'clone',
    'venv',
    'deps',
    'gen-config',
    'write-core',
    'write-model',
    'write-webui-key',
    'write-adapter',
  ];
  
  const installSteps = [...baseSteps];
  
  // 如果选择安装 NapCat，添加相关步骤
  if (state.inputs.installNapcat) {
    installSteps.push('napcat', 'napcat-config');
  }
  
  // 如果选择安装 WebUI，添加相关步骤
  if (state.inputs.installWebui) {
    installSteps.push('webui');
  }
  
  // 始终包含 register 步骤
  installSteps.push('register');
  
  state.inputs.installSteps = installSteps;
  
  return state.inputs;
}

function updateSummary() {
  collectInputs();
  
  // 实例名称
  document.getElementById('summary-instance-name').textContent = state.inputs.instanceName || '(未设置)';
  
  // 账号配置
  document.getElementById('summary-qq-number').textContent = state.inputs.qqNumber || '(未设置)';
  document.getElementById('summary-qq-nickname').textContent = state.inputs.qqNickname || '(未设置)';
  document.getElementById('summary-owner-qq').textContent = state.inputs.ownerQQNumber || '(未设置)';
  
  // 网络配置
  document.getElementById('summary-ws-port').textContent = state.inputs.wsPort;
  document.getElementById('summary-channel').textContent = state.inputs.channel === 'main' ? '稳定版 (main)' : '开发版 (dev)';
  
  // WebUI API 密钥 - 脱敏显示
  const apiKey = state.inputs.webuiApiKey || '(未设置)';
  document.getElementById('summary-webui-api-key').textContent = 
    apiKey === '(未设置)' ? apiKey : '•'.repeat(Math.min(apiKey.length, 16));
  
  // 安装选项
  document.getElementById('summary-install-napcat').textContent = state.inputs.installNapcat ? '是' : '否';
  document.getElementById('summary-install-webui').textContent = state.inputs.installWebui ? '是' : '否';
  
  // 安装目录 - 智能截断长路径
  const installDirEl = document.getElementById('summary-install-dir');
  const installDir = state.inputs.installDir || '(未设置)';
  installDirEl.textContent = installDir;
  installDirEl.title = installDir; // 悬停显示完整路径
}

// 编辑指定步骤
function editSection(step) {
  goToStep(step);
}

function validateInputs() {
  const errors = [];
  
  if (!state.inputs.instanceName) errors.push('实例名称不能为空');
  if (!state.inputs.qqNumber || !/^\d{5,12}$/.test(state.inputs.qqNumber)) errors.push('Bot QQ 号格式错误');
  if (!state.inputs.qqNickname) errors.push('Bot QQ 昵称不能为空');
  if (!state.inputs.ownerQQNumber || !/^\d{5,12}$/.test(state.inputs.ownerQQNumber)) errors.push('主人 QQ 号格式错误');
  if (!state.inputs.apiKey) errors.push('API Key 不能为空');
  if (!state.inputs.installDir) errors.push('安装目录不能为空');
  
  if (errors.length > 0) {
    const errorList = el.validationErrors.querySelector('.error-list');
    errorList.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
    el.validationErrors.classList.remove('hidden');
    return false;
  }
  
  el.validationErrors.classList.add('hidden');
  return true;
}

let carouselInterval = null;
let currentCarouselIndex = 0;

function startCarousel() {
  const items = document.querySelectorAll('.carousel-item');
  if (carouselInterval) clearInterval(carouselInterval);
  
  carouselInterval = setInterval(() => {
    items[currentCarouselIndex].classList.remove('active');
    currentCarouselIndex = (currentCarouselIndex + 1) % items.length;
    items[currentCarouselIndex].classList.add('active');
  }, 4000);
}

function updateProgress(percent, step) {
  el.progressFill.style.width = `${percent}%`;
  el.progressPercent.textContent = `${percent}%`;
  if (step) el.progressStep.textContent = step;
}

function appendLog(message) {
  el.installLogContent.textContent += message + '\n';
  el.installLogContent.scrollTop = el.installLogContent.scrollHeight;
}

async function startInstall() {
  state.installing = true;
  
  const stepMap = {
    'clone': {name: '克隆仓库', progress: 10},
    'venv': {name: '创建虚拟环境', progress: 20},
    'deps': {name: '安装依赖', progress: 40},
    'gen-config': {name: '生成配置', progress: 60},
    'write-core': {name: '写入 core.toml', progress: 70},
    'write-model': {name: '写入 model.toml', progress: 75},
    'write-webui-key': {name: '写入 WebUI 密钥', progress: 78},
    'write-adapter': {name: '写入适配器配置', progress: 82},
    'napcat': {name: '配置 NapCat', progress: 87},
    'webui': {name: '安装 WebUI', progress: 92},
    'register': {name: '注册实例', progress: 96},
  };
  
  window.mofoxAPI.onInstallProgress((progress) => {
    const {step, percent, message} = progress;
    const stepInfo = stepMap[step] || {name: step, progress: 0};
    updateProgress(stepInfo.progress, message || stepInfo.name);
    if (message) appendLog(`[${step}] ${message}`);
  });
  
  window.mofoxAPI.onInstallOutput((output) => {
    if (output && output.trim()) appendLog(output);
  });
  
  try {
    await window.mofoxAPI.installRun(state.inputs);
    
    updateProgress(100, '安装完成');
    
    el.installResult.classList.remove('hidden');
    el.installResult.querySelector('.result-success').classList.remove('hidden');
    el.installResult.querySelector('.result-error').classList.add('hidden');
    
    el.btnFinish.classList.remove('hidden');
    el.btnRetry.classList.add('hidden');
    el.btnCleanup.classList.add('hidden');
    
    if (carouselInterval) clearInterval(carouselInterval);
    
  } catch (error) {
    console.error('安装失败:', error);
    
    el.installResult.classList.remove('hidden');
    el.installResult.querySelector('.result-success').classList.add('hidden');
    el.installResult.querySelector('.result-error').classList.remove('hidden');
    el.installResult.querySelector('.error-message').textContent = error.message || '未知错误';
    
    el.btnRetry.classList.remove('hidden');
    el.btnCleanup.classList.remove('hidden');
    el.btnFinish.classList.add('hidden');
  }
  
  state.installing = false;
}

async function cleanupAndRestart() {
  const instanceId = `bot-${state.inputs.qqNumber}`;
  appendLog('[INFO] 开始清理安装文件...');
  
  try {
    await window.mofoxAPI.installCleanup(instanceId);
    appendLog('[INFO] 清理完成，准备重新安装...');
    
    el.installResult.classList.add('hidden');
    el.btnRetry.classList.add('hidden');
    el.btnCleanup.classList.add('hidden');
    
    setTimeout(() => startInstall(), 500);
  } catch (error) {
    console.error('清理失败:', error);
    appendLog(`[ERROR] 清理失败: ${error.message}`);
  }
}

/**
 * 智能处理回车键事件
 * - 单个输入框：直接进入下一步
 * - 多个输入框：切换到下一个输入框，最后一个时进入下一步
 */
function handleEnterKey(currentInput, event) {
  // 阻止默认表单提交行为
  event.preventDefault();
  
  // 获取当前步骤的表单
  const currentStep = document.getElementById(`step-${state.currentStep}`);
  if (!currentStep) return;
  
  // 查找当前步骤中所有可聚焦的输入框（排除checkbox和hidden）
  const focusableInputs = Array.from(
    currentStep.querySelectorAll('input:not([type="checkbox"]):not([type="hidden"]), select')
  ).filter(input => {
    // 确保元素可见且未禁用
    return !input.disabled && 
           input.offsetParent !== null && 
           input.type !== 'checkbox' &&
           input.type !== 'hidden';
  });
  
  // 如果只有一个输入框，直接进入下一步
  if (focusableInputs.length <= 1) {
    goNext();
    return;
  }
  
  // 找到当前输入框的索引
  const currentIndex = focusableInputs.indexOf(currentInput);
  
  // 如果是最后一个输入框，进入下一步
  if (currentIndex === focusableInputs.length - 1) {
    goNext();
  } else if (currentIndex >= 0 && currentIndex < focusableInputs.length - 1) {
    // 否则，聚焦到下一个输入框
    focusableInputs[currentIndex + 1].focus();
  }
}

function bindEvents() {
  // 阻止所有表单的默认提交行为
  document.querySelectorAll('.config-form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      return false;
    });
  });
  
  // 为所有输入框添加智能回车键处理
  document.querySelectorAll('.config-form input:not([type="checkbox"]):not([type="hidden"]), .config-form select').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.keyCode === 13) {
        handleEnterKey(input, e);
      }
    });
  });
  
  // 全局回车键监听：当焦点不在输入框上时也能按回车进入下一步
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'SELECT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'BUTTON' ||
        activeElement.classList.contains('md3-btn')
      );
      
      // 如果焦点不在输入控件上，且不在步骤1（环境检测）和步骤10（安装中），则触发下一步
      if (!isInputFocused && state.currentStep !== 1 && state.currentStep !== 10) {
        e.preventDefault();
        goNext();
      }
    }
  });
  
  // 清除输入框错误状态
  document.querySelectorAll('.form-group input, .form-group select').forEach(input => {
    input.addEventListener('input', () => clearFieldError(input));
    input.addEventListener('change', () => clearFieldError(input));
  });
  
  el.btnNext.addEventListener('click', goNext);
  el.btnBack.addEventListener('click', goBack);
  el.btnCancel.addEventListener('click', async () => {
    if (await window.customConfirm('确定要取消安装吗？', '取消安装')) {
      window.location.href = '../index.html';
    }
  });
  
  // License tab switching
  el.licenseTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      switchLicenseTab(tabName);
    });
  });
  
  // Reload license button
  el.btnReloadLicense?.addEventListener('click', () => {
    loadLicenseAgreements();
  });
  
  // Clear license error when checkbox is checked
  el.inputAgreeLicense?.addEventListener('change', () => {
    if (el.inputAgreeLicense.checked) {
      clearLicenseError();
    }
  });
  
  // LLM API Key 可见性切换
  el.btnToggleApiKey?.addEventListener('click', () => {
    const input = el.inputApiKey;
    const icon = el.btnToggleApiKey.querySelector('.material-symbols-rounded');
    if (input.type === 'password') {
      input.type = 'text';
      icon.textContent = 'visibility_off';
    } else {
      input.type = 'password';
      icon.textContent = 'visibility';
    }
  });
  
  el.btnGetApiKey?.addEventListener('click', () => {
    window.mofoxAPI.openExternal('https://cloud.siliconflow.cn/i/0ww8zcOn');
  });
  
  // WebUI API Key 实时强度更新
  el.inputWebuiApiKey?.addEventListener('input', () => {
    const password = el.inputWebuiApiKey.value;
    const result = evaluatePasswordStrength(password);
    
    // 更新进度条
    el.strengthFill.className = 'strength-fill';
    if (result.level !== 'none') {
      el.strengthFill.classList.add(result.level);
    }
    
    // 更新文本
    el.strengthText.textContent = result.text;
    el.strengthText.className = 'strength-text';
    if (result.level !== 'none') {
      el.strengthText.classList.add(result.level);
    }
    
    // 清除错误状态
    clearFieldError(el.inputWebuiApiKey);
  });
  
  // 随机生成 API Key
  el.btnGenerateApiKey?.addEventListener('click', async () => {
    const newKey = generateSecureApiKey(32);
    el.inputWebuiApiKey.value = newKey;
    
    // 手动触发 input 事件以更新强度显示
    el.inputWebuiApiKey.dispatchEvent(new Event('input'));
    
    // 复制到剪贴板
    try {
      await navigator.clipboard.writeText(newKey);
      showSuccess('密钥已生成并复制到剪贴板，请妥善保存！', 4000);
    } catch (error) {
      console.error('复制失败:', error);
      showWarning('密钥已生成，但无法自动复制。请手动复制保存！', 5000);
    }
    
    // 短暂显示明文以便用户确认
    if (el.inputWebuiApiKey.type === 'password') {
      const originalType = el.inputWebuiApiKey.type;
      el.inputWebuiApiKey.type = 'text';
      setTimeout(() => {
        el.inputWebuiApiKey.type = originalType;
      }, 2000);
    }
  });
  
  // WebUI API Key 密码可见性切换
  el.btnToggleWebuiKey?.addEventListener('click', () => {
    const input = el.inputWebuiApiKey;
    const icon = el.btnToggleWebuiKey.querySelector('.material-symbols-rounded');
    
    if (input.type === 'password') {
      input.type = 'text';
      icon.textContent = 'visibility_off';
    } else {
      input.type = 'password';
      icon.textContent = 'visibility';
    }
  });
  
  el.btnBrowseDir?.addEventListener('click', async () => {
    const path = await window.mofoxAPI.selectProjectPath();
    if (path) el.inputInstallDir.value = path;
  });
  
  const customSelect = document.getElementById('custom-select-channel');
  if (customSelect) {
    const selected = customSelect.querySelector('.select-selected');
    const items = customSelect.querySelector('.select-items');
    const input = customSelect.querySelector('input');
    
    selected.addEventListener('click', (e) => {
      e.stopPropagation();
      items.classList.toggle('select-hide');
      selected.classList.toggle('select-arrow-active');
    });
    
    items.querySelectorAll('div').forEach(item => {
      item.addEventListener('click', () => {
        const val = item.getAttribute('data-value');
        input.value = val;
        selected.textContent = item.textContent;
        items.querySelectorAll('div').forEach(i => i.classList.remove('same-as-selected'));
        item.classList.add('same-as-selected');
        items.classList.add('select-hide');
        selected.classList.remove('select-arrow-active');
      });
    });
    
    document.addEventListener('click', (e) => {
      if (!customSelect.contains(e.target)) {
        items.classList.add('select-hide');
        selected.classList.remove('select-arrow-active');
      }
    });
  }
  
  el.btnToggleLog?.addEventListener('click', () => {
    const log = el.installLogContent.closest('.install-log');
    log.classList.toggle('collapsed');
    const icon = el.btnToggleLog.querySelector('.material-symbols-rounded');
    icon.textContent = log.classList.contains('collapsed') ? 'expand_more' : 'expand_less';
  });
  
  el.btnRetry?.addEventListener('click', () => startInstall());
  el.btnCleanup?.addEventListener('click', () => cleanupAndRestart());
  el.btnFinish?.addEventListener('click', () => {
    window.location.href = '../index.html';
  });
}

async function init() {
  bindEvents();
  
  // 检查系统类型并根据情况禁用 NapCat
  try {
    const platformInfo = await window.mofoxAPI.getPlatformInfo();
    console.log('平台信息:', platformInfo);
    if (platformInfo && platformInfo.platform === 'linux') {
      const checkbox = document.getElementById('input-install-napcat');
      if (checkbox) {
        checkbox.checked = false;
        checkbox.disabled = true;
        const formGroup = checkbox.closest('.form-group');
        if (formGroup) {
          formGroup.style.opacity = '0.5';
          formGroup.style.pointerEvents = 'none';
          const textSpan = formGroup.querySelector('.checkbox-label');
          if (textSpan) {
            textSpan.textContent += ' (Linux 系统暂不支持通过本向导安装)';
          }
        }
      }
    }
  } catch (error) {
    console.error('获取系统信息失败:', error);
  }
  
  // 检查是否为续装模式
  const urlParams = parseUrlParams();
  
  if (urlParams.resume && urlParams.instanceId) {
    // 续装模式：直接跳到安装页面
    try {
      const instance = await loadResumeInstance(urlParams.instanceId);
      
      // 更新标题栏显示续装模式
      const titleBar = document.querySelector('.app-title');
      if (titleBar) {
        titleBar.textContent = `继续安装 - ${instance.displayName} - Neo-MoFox Launcher`;
      }
      
      appendLog(`[续装] 实例: ${instance.displayName}`);
      appendLog(`[续装] QQ: ${instance.qqNumber}`);
      
      if (instance.installProgress) {
        appendLog(`[续装] 上次中断于步骤: ${instance.installProgress.step}`);
        appendLog(`[续装] 将从该步骤继续执行安装流程...`);
      }
      
      appendLog(''); // 空行分隔
      
      // 标记环境检测已通过（续装时跳过）
      state.envCheckPassed = true;
      state.licenseAgreed = true;
      
      // 直接跳到安装步骤
      goToStep(10);
      
    } catch (error) {
      console.error('续装初始化失败:', error);
      await window.customAlert(
        `无法继续安装: ${error.message}\n\n将返回主界面。`,
        '错误'
      );
      window.location.href = '../index.html';
    }
  } else {
    // 正常模式：从第一步开始
    const settings = await window.mofoxAPI.settingsRead();
    if (settings?.defaultInstallDir) {
      el.inputInstallDir.value = settings.defaultInstallDir;
    }
    
    goToStep(1);
    runEnvCheck();
  }
}

init();
