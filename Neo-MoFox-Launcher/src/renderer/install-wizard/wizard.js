const state = {
  currentStep: 1,
  totalSteps: 9,
  envCheckPassed: false,
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
  },
  installing: false,
  pythonCmd: null,
};

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
  
  inputInstanceName: document.getElementById('input-instance-name'),
  inputQqNumber: document.getElementById('input-qq-number'),
  inputQqNickname: document.getElementById('input-qq-nickname'),
  inputOwnerQq: document.getElementById('input-owner-qq'),
  inputApiKey: document.getElementById('input-api-key'),
  btnToggleApiKey: document.getElementById('btn-toggle-api-key'),
  btnGetApiKey: document.getElementById('btn-get-api-key'),
  inputWsPort: document.getElementById('input-ws-port'),
  inputChannel: document.getElementById('input-channel'),
  inputInstallNapcat: document.getElementById('input-install-napcat'),
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
  
  el.btnBack.classList.toggle('hidden', step === 1 || step === 9);
  el.btnNext.classList.toggle('hidden', step === 9);
  el.btnCancel.classList.toggle('hidden', step !== 1);
  
  if (step === 8) {
    updateSummary();
  }
  
  if (step === 9) {
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

async function goNext() {
  clearAllErrors();
  
  // 步骤 1: 环境检测
  if (state.currentStep === 1 && !state.envCheckPassed) return;
  
  // 步骤 2: 实例名称
  if (state.currentStep === 2) {
    const name = el.inputInstanceName.value.trim();
    if (!name) {
      showFieldError(el.inputInstanceName, '❌ 请输入实例名称');
      return;
    }
    
    // 检查实例名称是否已存在
    try {
      const instances = await window.mofoxAPI.instanceList();
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
  
  // 步骤 3: 账号配置
  if (state.currentStep === 3) {
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
  
  // 步骤 4: 模型配置
  if (state.currentStep === 4) {
    const apiKey = el.inputApiKey.value.trim();
    if (!apiKey) {
      showFieldError(el.inputApiKey, '❌ 请输入 API Key');
      return;
    }
  }
  
  // 步骤 5: 网络配置（端口验证）
  if (state.currentStep === 5) {
    const port = parseInt(el.inputWsPort.value, 10);
    if (!port || port < 1024 || port > 65535) {
      showFieldError(el.inputWsPort, '❌ 请输入有效的端口号（1024-65535）');
      return;
    }
  }
  
  // 步骤 6: 组件选择（无需验证）
  
  // 步骤 7: 安装位置
  if (state.currentStep === 7) {
    const dir = el.inputInstallDir.value.trim();
    if (!dir) {
      showFieldError(el.inputInstallDir, '❌ 请选择安装目录');
      return;
    }
  }
  
  // 步骤 8: 确认摘要（最终验证）
  if (state.currentStep === 8) {
    if (!validateInputs()) return;
  }
  
  if (state.currentStep < state.totalSteps) {
    goToStep(state.currentStep + 1);
  }
}

function goBack() {
  if (state.currentStep > 1 && state.currentStep !== 9) {
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
    pythonCmd: state.pythonCmd,
  };
  return state.inputs;
}

function updateSummary() {
  collectInputs();
  document.getElementById('summary-instance-name').textContent = state.inputs.instanceName;
  document.getElementById('summary-qq-number').textContent = state.inputs.qqNumber;
  document.getElementById('summary-qq-nickname').textContent = state.inputs.qqNickname;
  document.getElementById('summary-owner-qq').textContent = state.inputs.ownerQQNumber;
  document.getElementById('summary-ws-port').textContent = state.inputs.wsPort;
  document.getElementById('summary-channel').textContent = state.inputs.channel === 'main' ? '稳定版 (main)' : '开发版 (dev)';
  document.getElementById('summary-install-napcat').textContent = state.inputs.installNapcat ? '是' : '否';
  document.getElementById('summary-install-dir').textContent = state.inputs.installDir;
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
    'write-adapter': {name: '写入适配器配置', progress: 80},
    'napcat': {name: '配置 NapCat', progress: 90},
    'register': {name: '注册实例', progress: 95},
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

function bindEvents() {
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
  
  const settings = await window.mofoxAPI.settingsRead();
  if (settings?.defaultInstallDir) {
    el.inputInstallDir.value = settings.defaultInstallDir;
  }
  
  goToStep(1);
  runEnvCheck();
}

init();
