/**
 * Install Wizard - 安装向导前端逻辑
 */

// ─── State ─────────────────────────────────────────────────────────────

const state = {
  currentPhase: 1,
  envCheckPassed: false,
  inputs: {
    instanceName: '',
    qqNumber: '',
    ownerQQNumber: '',
    apiKey: '',
    wsPort: 8095,
    channel: 'main',
    installDir: 'D:\\Neo-MoFox_Bots',
  },
  installing: false,
  installSuccess: false,
};

// ─── DOM Elements ──────────────────────────────────────────────────────

const el = {
  // Phases
  phase1: document.getElementById('phase-1'),
  phase2: document.getElementById('phase-2'),
  phase3: document.getElementById('phase-3'),
  
  // Step indicators
  stepItems: document.querySelectorAll('.step-item'),
  
  // Phase 1
  checkPython: document.getElementById('check-python'),
  checkUv: document.getElementById('check-uv'),
  checkGit: document.getElementById('check-git'),
  envCheckResult: document.getElementById('env-check-result'),
  btnCancel1: document.getElementById('btn-cancel-1'),
  btnRecheck: document.getElementById('btn-recheck'),
  btnNext1: document.getElementById('btn-next-1'),
  
  // Phase 2
  inputInstanceName: document.getElementById('input-instance-name'),
  inputQqNumber: document.getElementById('input-qq-number'),
  inputOwnerQq: document.getElementById('input-owner-qq'),
  inputApiKey: document.getElementById('input-api-key'),
  inputWsPort: document.getElementById('input-ws-port'),
  inputChannel: document.getElementById('input-channel'),
  inputInstallDir: document.getElementById('input-install-dir'),
  btnToggleApiKey: document.getElementById('btn-toggle-api-key'),
  btnBrowseDir: document.getElementById('btn-browse-dir'),
  validationErrors: document.getElementById('validation-errors'),
  btnBack2: document.getElementById('btn-back-2'),
  btnNext2: document.getElementById('btn-next-2'),
  
  // Phase 3
  progressFill: document.getElementById('progress-fill'),
  progressStep: document.getElementById('progress-step'),
  progressPercent: document.getElementById('progress-percent'),
  installSteps: document.getElementById('install-steps'),
  installLogContent: document.getElementById('install-log-content'),
  btnToggleLog: document.getElementById('btn-toggle-log'),
  installResult: document.getElementById('install-result'),
  btnRetry: document.getElementById('btn-retry'),
  btnCleanup: document.getElementById('btn-cleanup'),
  btnFinish: document.getElementById('btn-finish'),
};

// ─── Phase Navigation ──────────────────────────────────────────────────

function goToPhase(phase) {
  state.currentPhase = phase;
  
  // Hide all phases
  el.phase1.classList.add('hidden');
  el.phase2.classList.add('hidden');
  el.phase3.classList.add('hidden');
  
  // Show target phase
  if (phase === 1) el.phase1.classList.remove('hidden');
  if (phase === 2) el.phase2.classList.remove('hidden');
  if (phase === 3) el.phase3.classList.remove('hidden');
  
  // Update step indicators
  el.stepItems.forEach((item, index) => {
    const stepNum = index + 1;
    item.classList.remove('active', 'completed');
    if (stepNum < phase) {
      item.classList.add('completed');
    } else if (stepNum === phase) {
      item.classList.add('active');
    }
  });
}

// ─── Phase 1: Environment Check ────────────────────────────────────────

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
  } else {
    statusText.textContent = '等待中...';
  }
}

async function runEnvCheck() {
  el.btnRecheck.disabled = true;
  el.btnNext1.disabled = true;
  el.envCheckResult.classList.add('hidden');
  
  updateCheckItem('check-python', 'loading');
  updateCheckItem('check-uv', 'loading');
  updateCheckItem('check-git', 'loading');
  
  try {
    const result = await window.mofoxAPI.installEnvCheck();
    
    // Update Python
    if (result.checks.python.valid) {
      updateCheckItem('check-python', 'success', result.checks.python.version);
    } else {
      updateCheckItem('check-python', 'error', result.checks.python.version || '未安装');
    }
    
    // Update uv
    if (result.checks.uv.valid) {
      updateCheckItem('check-uv', 'success', result.checks.uv.version);
    } else {
      updateCheckItem('check-uv', 'error', '未安装');
    }
    
    // Update Git
    if (result.checks.git.valid) {
      updateCheckItem('check-git', 'success', result.checks.git.version);
    } else {
      updateCheckItem('check-git', 'error', '未安装');
    }
    
    // Show result
    el.envCheckResult.classList.remove('hidden');
    const successDiv = el.envCheckResult.querySelector('.result-success');
    const errorDiv = el.envCheckResult.querySelector('.result-error');
    
    if (result.passed) {
      successDiv.classList.remove('hidden');
      errorDiv.classList.add('hidden');
      state.envCheckPassed = true;
      el.btnNext1.disabled = false;
    } else {
      successDiv.classList.add('hidden');
      errorDiv.classList.remove('hidden');
      // 将换行符转换为 <br> 以正确显示多行错误
      const errorHtml = result.error.replace(/\n/g, '<br>');
      errorDiv.querySelector('.error-message').innerHTML = errorHtml;
      state.envCheckPassed = false;
    }
    
  } catch (error) {
    console.error('环境检测失败:', error);
    updateCheckItem('check-python', 'error', '检测失败');
    updateCheckItem('check-uv', 'error', '检测失败');
    updateCheckItem('check-git', 'error', '检测失败');
  }
  
  el.btnRecheck.disabled = false;
}

// ─── Phase 2: Input Collection ─────────────────────────────────────────

function collectInputs() {
  state.inputs = {
    instanceName: el.inputInstanceName.value.trim(),
    qqNumber: el.inputQqNumber.value.trim(),
    ownerQQNumber: el.inputOwnerQq.value.trim(),
    apiKey: el.inputApiKey.value.trim(),
    wsPort: parseInt(el.inputWsPort.value, 10) || 8095,
    channel: el.inputChannel.value,
    installDir: el.inputInstallDir.value.trim(),
  };
  return state.inputs;
}

function showValidationErrors(errors) {
  const errorList = el.validationErrors.querySelector('.error-list');
  errorList.innerHTML = '';
  
  errors.forEach(err => {
    const li = document.createElement('li');
    li.textContent = err.error;
    errorList.appendChild(li);
  });
  
  el.validationErrors.classList.remove('hidden');
}

function hideValidationErrors() {
  el.validationErrors.classList.add('hidden');
}

async function validateAndProceed() {
  hideValidationErrors();
  
  const inputs = collectInputs();
  
  try {
    const result = await window.mofoxAPI.installValidateInputs(inputs);
    
    if (!result.valid) {
      showValidationErrors(result.errors);
      return;
    }
    
    // Validation passed, go to phase 3
    goToPhase(3);
    startInstall();
    
  } catch (error) {
    console.error('校验失败:', error);
    showValidationErrors([{ error: '校验过程出错: ' + error.message }]);
  }
}

// ─── Phase 3: Installation ─────────────────────────────────────────────

function updateInstallStep(stepName, status) {
  const stepItem = el.installSteps.querySelector(`[data-step="${stepName}"]`);
  if (!stepItem) return;
  
  stepItem.classList.remove('active', 'completed', 'error');
  
  const icon = stepItem.querySelector('.step-icon');
  
  if (status === 'active') {
    stepItem.classList.add('active');
    icon.textContent = 'progress_activity';
  } else if (status === 'completed') {
    stepItem.classList.add('completed');
    icon.textContent = 'check_circle';
  } else if (status === 'error') {
    stepItem.classList.add('error');
    icon.textContent = 'cancel';
  } else {
    icon.textContent = 'pending';
  }
}

function updateProgress(percent, step) {
  el.progressFill.style.width = `${percent}%`;
  el.progressPercent.textContent = `${percent}%`;
  if (step) {
    el.progressStep.textContent = step;
  }
}

function appendLog(message) {
  el.installLogContent.textContent += message + '\n';
  el.installLogContent.scrollTop = el.installLogContent.scrollHeight;
}

function clearLog() {
  el.installLogContent.textContent = '';
}

async function startInstall() {
  state.installing = true;
  state.installSuccess = false;
  
  // Reset UI
  clearLog();
  el.installResult.classList.add('hidden');
  el.btnRetry.classList.add('hidden');
  el.btnCleanup.classList.add('hidden');
  el.btnFinish.classList.add('hidden');
  
  // Reset all steps
  const steps = ['clone', 'venv', 'deps', 'gen-config', 'write-core', 'write-model', 'napcat', 'register'];
  steps.forEach(step => updateInstallStep(step, 'pending'));
  
  // Set up progress listener
  const stepMap = {
    'clone': { name: '克隆仓库', progress: 10 },
    'venv': { name: '创建虚拟环境', progress: 20 },
    'deps': { name: '安装依赖', progress: 40 },
    'gen-config': { name: '生成配置', progress: 55 },
    'write-core': { name: '写入 core.toml', progress: 65 },
    'write-model': { name: '写入 model.toml', progress: 75 },
    'napcat': { name: '配置 NapCat', progress: 85 },
    'napcat-config': { name: '配置 NapCat', progress: 90 },
    'register': { name: '注册实例', progress: 95 },
    'complete': { name: '完成', progress: 100 },
    'error': { name: '错误', progress: 0 },
  };
  
  let currentStep = null;
  
  window.mofoxAPI.onInstallProgress((progress) => {
    const { step, percent, message, error } = progress;
    
    // Mark previous step as completed
    if (currentStep && currentStep !== step) {
      updateInstallStep(currentStep, 'completed');
    }
    
    // Update current step
    if (step !== 'complete' && step !== 'error') {
      currentStep = step;
      updateInstallStep(step, 'active');
    }
    
    // Update progress bar
    const stepInfo = stepMap[step] || { name: step, progress: 0 };
    const displayPercent = percent === 100 ? stepInfo.progress : Math.floor(stepInfo.progress * percent / 100);
    updateProgress(displayPercent, message || stepInfo.name);
    
    if (message) {
      appendLog(`[${step}] ${message}`);
    }
    
    if (error) {
      appendLog(`[ERROR] ${error}`);
    }
  });
  
  window.mofoxAPI.onInstallOutput((output) => {
    if (output && output.trim()) {
      appendLog(output);
    }
  });
  
  try {
    const result = await window.mofoxAPI.installRun(state.inputs);
    
    state.installing = false;
    state.installSuccess = true;
    
    // Mark all steps as completed
    steps.forEach(step => updateInstallStep(step, 'completed'));
    updateProgress(100, '安装完成');
    
    // Show success result
    el.installResult.classList.remove('hidden');
    el.installResult.querySelector('.result-success').classList.remove('hidden');
    el.installResult.querySelector('.result-error').classList.add('hidden');
    el.btnFinish.classList.remove('hidden');
    
  } catch (error) {
    console.error('安装失败:', error);
    
    state.installing = false;
    state.installSuccess = false;
    
    // Mark current step as error
    if (currentStep) {
      updateInstallStep(currentStep, 'error');
    }
    
    // Show error result
    el.installResult.classList.remove('hidden');
    el.installResult.querySelector('.result-success').classList.add('hidden');
    el.installResult.querySelector('.result-error').classList.remove('hidden');
    el.installResult.querySelector('.error-message').textContent = error.message;
    el.btnRetry.classList.remove('hidden');
    el.btnCleanup.classList.remove('hidden');
  }
}

async function cleanupAndRestart() {
  // TODO: Get instance ID from state
  const instanceId = `bot-${state.inputs.qqNumber}`;
  
  try {
    await window.mofoxAPI.installCleanup(instanceId);
    goToPhase(2);
  } catch (error) {
    console.error('清理失败:', error);
    appendLog(`[ERROR] 清理失败: ${error.message}`);
  }
}

// ─── Event Listeners ───────────────────────────────────────────────────

function bindEvents() {
  // Phase 1
  el.btnCancel1.addEventListener('click', () => {
    // 返回主界面
    window.location.href = '../index.html';
  });
  
  el.btnRecheck.addEventListener('click', runEnvCheck);
  
  el.btnNext1.addEventListener('click', () => {
    if (state.envCheckPassed) {
      goToPhase(2);
    }
  });
  
  // Phase 2
  el.btnToggleApiKey.addEventListener('click', () => {
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
  
  el.btnBrowseDir.addEventListener('click', async () => {
    const path = await window.mofoxAPI.selectProjectPath();
    if (path) {
      el.inputInstallDir.value = path;
    }
  });
  
  el.btnBack2.addEventListener('click', () => {
    goToPhase(1);
  });
  
  el.btnNext2.addEventListener('click', validateAndProceed);
  
  // Phase 3
  el.btnToggleLog.addEventListener('click', () => {
    el.installLogContent.classList.toggle('collapsed');
    const icon = el.btnToggleLog.querySelector('.material-symbols-rounded');
    icon.textContent = el.installLogContent.classList.contains('collapsed') ? 'expand_more' : 'expand_less';
  });
  
  el.btnRetry.addEventListener('click', startInstall);
  
  el.btnCleanup.addEventListener('click', cleanupAndRestart);
  
  el.btnFinish.addEventListener('click', () => {
    window.location.href = '../index.html';
  });
}

// ─── Initialize ────────────────────────────────────────────────────────

async function init() {
  bindEvents();
  
  // Load default install dir from state
  try {
    const globalState = await window.mofoxAPI.readState();
    if (globalState.defaultInstallDir) {
      el.inputInstallDir.value = globalState.defaultInstallDir;
      state.inputs.installDir = globalState.defaultInstallDir;
    }
  } catch (e) {
    console.warn('无法加载全局状态:', e);
  }
  
  // Start environment check
  goToPhase(1);
  runEnvCheck();
}

// Start
init();
