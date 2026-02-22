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
    installDir: '',
    installNapcat: true, // 是否安装 NapCat
  },
  installing: false,
  installSuccess: false,
  resumeFromStep: null, // 续装起点步骤名，null 表示全新安装
  napcatAlreadyInstalled: false, // Linux 下系统已安装 NapCat
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
  inputInstallNapcat: document.getElementById('input-install-napcat'),
  btnToggleApiKey: document.getElementById('btn-toggle-api-key'),
  btnBrowseDir: document.getElementById('btn-browse-dir'),
  validationErrors: document.getElementById('validation-errors'),
  btnBack2: document.getElementById('btn-back-2'),
  btnResetForm: document.getElementById('btn-reset-form'),
  btnNext2: document.getElementById('btn-next-2'),
  
  // Phase 3
  progressFill: document.getElementById('progress-fill'),
  progressStep: document.getElementById('progress-step'),
  progressPercent: document.getElementById('progress-percent'),
  installSteps: document.getElementById('install-steps'),
  installLogContent: document.getElementById('install-log-content'),
  btnToggleLog: document.getElementById('btn-toggle-log'),
  btnFullscreenLog: document.getElementById('btn-fullscreen-log'),
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
  if (phase === 2) {
    el.phase2.classList.remove('hidden');
    // 检测系统是否已安装 NapCat（Linux）
    checkNapcatInstalled();
    // 在下一帧设置焦点，确保 DOM 已完成渲染
    requestAnimationFrame(() => {
      el.inputInstanceName.focus();
    });
  }
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

// ─── NapCat 已安装检测 ─────────────────────────────────────────────────

/**
 * 检测系统上是否已安装 NapCat（仅 Linux 有效）。
 * 如果已安装，自动取消勾选并禁用安装选项，显示已安装提示。
 */
async function checkNapcatInstalled() {
  try {
    const result = await window.mofoxAPI.installCheckNapcatInstalled();
    const hintEl = el.inputInstallNapcat.closest('.form-group').querySelector('.form-hint');
    if (result && result.installed) {
      // 已安装：禁用复选框并取消勾选
      el.inputInstallNapcat.checked = false;
      el.inputInstallNapcat.disabled = true;
      state.inputs.installNapcat = false;
      state.napcatAlreadyInstalled = true;
      if (hintEl) {
        hintEl.textContent = `✅ NapCat 已安装在系统中 (QQ ${result.qqVersion || '未知版本'})，无需重复安装`;
        hintEl.style.color = 'var(--md-sys-color-primary, #6750a4)';
      }
    } else {
      // 未安装：恢复正常状态
      el.inputInstallNapcat.disabled = false;
      state.napcatAlreadyInstalled = false;
      if (hintEl) {
        hintEl.textContent = '取消勾选则只安装 Neo-MoFox 核心，不安装 NapCat（适用于已有 NapCat 或使用其他适配器的情况）';
        hintEl.style.color = '';
      }
    }
  } catch (e) {
    console.warn('检测 NapCat 安装状态失败:', e);
  }
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
      // 保存检测到的 python 命令
      state.pythonCmd = result.checks.python.cmd;
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
  const installNapcat = el.inputInstallNapcat.checked;
  
  // 根据是否安装 NapCat 构建安装步骤列表
  const baseSteps = ['clone', 'venv', 'deps', 'gen-config', 'write-core', 'write-model'];
  const napcatSteps = ['napcat', 'napcat-config'];
  const finalSteps = ['register'];
  
  // 如果 NapCat 已在系统上安装（Linux），仍然保留 napcat + napcat-config 步骤
  // 后端 installNapCat() 会检测到已安装并跳过下载，但 napcat-config 会正常写入实例配置
  const needNapcatSteps = installNapcat || state.napcatAlreadyInstalled;
  
  const installSteps = needNapcatSteps
    ? [...baseSteps, ...napcatSteps, ...finalSteps]
    : [...baseSteps, ...finalSteps];
  
  state.inputs = {
    instanceName: el.inputInstanceName.value.trim(),
    qqNumber: el.inputQqNumber.value.trim(),
    ownerQQNumber: el.inputOwnerQq.value.trim(),
    apiKey: el.inputApiKey.value.trim(),
    wsPort: parseInt(el.inputWsPort.value, 10) || 8095,
    channel: el.inputChannel.value,
    installDir: el.inputInstallDir.value.trim(),
    installNapcat: needNapcatSteps,
    installSteps: installSteps, // 传递给后端的步骤配置
    pythonCmd: state.pythonCmd, // 传递检测到的 python 命令
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

function resetFormInputs() {
  // Clear all form inputs
  el.inputInstanceName.value = '';
  el.inputQqNumber.value = '';
  el.inputOwnerQq.value = '';
  el.inputApiKey.value = '';
  el.inputWsPort.value = '8095';
  el.inputChannel.value = 'main';
  el.inputInstallNapcat.checked = !state.napcatAlreadyInstalled;
  
  // Reset custom select display
  const selectedChannel = document.getElementById('selected-channel');
  if (selectedChannel) {
    selectedChannel.textContent = '稳定版 (main)';
  }
  
  // Update custom select active class
  const optionsChannel = document.getElementById('options-channel');
  if (optionsChannel) {
    optionsChannel.querySelectorAll('div').forEach(item => {
      item.classList.remove('same-as-selected');
      if (item.getAttribute('data-value') === 'main') {
        item.classList.add('same-as-selected');
      }
    });
  }
  
  // Reset state
  state.inputs = {
    instanceName: '',
    qqNumber: '',
    ownerQQNumber: '',
    apiKey: '',
    wsPort: 8095,
    channel: 'main',
    installDir: el.inputInstallDir.value.trim(),
    installNapcat: true,
  };
  
  // 强制重绘表单，确保焦点能正常工作
  requestAnimationFrame(() => {
    // 触发重排
    void el.phase2.offsetHeight;
    // 设置焦点到第一个输入框
    el.inputQqNumber.click();
  });
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
  console.log('[DEBUG] === startInstall 开始 ===');
  console.log('[DEBUG] state.installing:', state.installing);
  console.log('[DEBUG] state.installSuccess:', state.installSuccess);
  
  state.installing = true;
  state.installSuccess = false;
  
  // Reset UI
  console.log('[DEBUG] 重置 UI，隐藏所有按钮和结果');
  clearLog();
  el.installResult.classList.add('hidden');
  el.installResult.querySelector('.result-success').classList.add('hidden');
  el.installResult.querySelector('.result-error').classList.add('hidden');
  el.btnRetry.classList.add('hidden');
  el.btnCleanup.classList.add('hidden');
  el.btnFinish.classList.add('hidden');
  console.log('[DEBUG] 按钮状态 - 重试:', !el.btnRetry.classList.contains('hidden'), '清理:', !el.btnCleanup.classList.contains('hidden'), '完成:', !el.btnFinish.classList.contains('hidden'));
  
  // 根据 installSteps 配置显示/隐藏步骤
  const configuredSteps = state.inputs.installSteps || [];
  const allSteps = ['clone', 'venv', 'deps', 'gen-config', 'write-core', 'write-model', 'napcat', 'napcat-config', 'register'];
  
  allSteps.forEach(step => {
    const stepItem = el.installSteps.querySelector(`[data-step="${step}"]`);
    if (stepItem) {
      if (configuredSteps.includes(step)) {
        stepItem.classList.remove('hidden');
        updateInstallStep(step, 'pending');
      } else {
        stepItem.classList.add('hidden');
      }
    }
  });
  
  // 续装模式：预先将已完成的步骤标记为 completed
  if (state.resumeFromStep && configuredSteps.includes(state.resumeFromStep)) {
    const startIdx = configuredSteps.indexOf(state.resumeFromStep);
    configuredSteps.slice(0, startIdx).forEach(step => updateInstallStep(step, 'completed'));
  }
  
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
  const completedSteps = new Set(); // 记录已完成的步骤
  
  window.mofoxAPI.onInstallProgress((progress) => {
    const { step, percent, message, error } = progress;
    console.log('[DEBUG] 进度更新 -', { step, percent, message, error });
    
    // 忽略已完成步骤的更新（防止步骤倒退）
    if (completedSteps.has(step) && step !== 'error') {
      console.log('[DEBUG] 忽略已完成步骤:', step);
      if (message) {
        appendLog(`[${step}] ${message}`);
      }
      return;
    }
    
    // Mark previous step as completed
    if (currentStep && currentStep !== step) {
      updateInstallStep(currentStep, 'completed');
      completedSteps.add(currentStep);
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
    console.log('[DEBUG] 开始调用 installRun API');
    const result = await window.mofoxAPI.installRun(state.inputs);
    console.log('[DEBUG] installRun API 返回成功:', result);
    
    state.installing = false;
    state.installSuccess = true;
    console.log('[DEBUG] 设置状态 - installing: false, installSuccess: true');
    
    // Mark current step as completed (if any)
    if (currentStep) {
      console.log('[DEBUG] 标记当前步骤为完成:', currentStep);
      updateInstallStep(currentStep, 'completed');
    }
    
    // Mark all steps as completed
    console.log('[DEBUG] 标记所有步骤为完成');
    configuredSteps.forEach(step => updateInstallStep(step, 'completed'));
    updateProgress(100, '安装完成');
    
    // Show success result
    console.log('[DEBUG] 显示成功结果');
    el.installResult.classList.remove('hidden');
    el.installResult.querySelector('.result-success').classList.remove('hidden');
    el.installResult.querySelector('.result-error').classList.add('hidden');
    
    // 收起安装步骤和日志
    console.log('[DEBUG] 收起安装步骤和日志');
    el.installSteps.classList.add('collapsed');
    if (!el.installLogContent.classList.contains('collapsed')) {
      el.installLogContent.classList.add('collapsed');
      const icon = el.btnToggleLog.querySelector('.material-symbols-rounded');
      icon.textContent = 'expand_more';
    }
    
    // 只显示完成按钮，隐藏其他按钮
    console.log('[DEBUG] 设置按钮状态：只显示完成按钮');
    el.btnFinish.classList.remove('hidden');
    el.btnRetry.classList.add('hidden');
    el.btnCleanup.classList.add('hidden');
    console.log('[DEBUG] 最终按钮状态 - 重试:', !el.btnRetry.classList.contains('hidden'), '清理:', !el.btnCleanup.classList.contains('hidden'), '完成:', !el.btnFinish.classList.contains('hidden'));
    
  } catch (error) {
    console.error('[DEBUG] 安装失败，捕获错误:', error);
    
    state.installing = false;
    state.installSuccess = false;
    console.log('[DEBUG] 设置状态 - installing: false, installSuccess: false');
    
    // Mark current step as error
    if (currentStep) {
      console.log('[DEBUG] 标记当前步骤为错误:', currentStep);
      updateInstallStep(currentStep, 'error');
    }
    
    // 简化错误消息
    let errorMsg = error.message || '未知错误';
    console.log('[DEBUG] 原始错误消息:', errorMsg);
    
    // 提取主要错误信息（去除冗长的技术细节）
    if (errorMsg.includes('Error:')) {
      // 提取第一个 Error: 后面的主要信息
      const match = errorMsg.match(/Error:\s*([^错标]+)/);
      if (match && match[1]) {
        errorMsg = match[1].trim();
        console.log('[DEBUG] 简化后的错误消息:', errorMsg);
      }
    }
    
    // 限制错误消息长度
    if (errorMsg.length > 150) {
      errorMsg = errorMsg.substring(0, 150) + '...';
      console.log('[DEBUG] 截断后的错误消息:', errorMsg);
    }
    
    // Show error result
    console.log('[DEBUG] 显示错误结果');
    el.installResult.classList.remove('hidden');
    el.installResult.querySelector('.result-success').classList.add('hidden');
    el.installResult.querySelector('.result-error').classList.remove('hidden');
    el.installResult.querySelector('.error-message').textContent = errorMsg;
    
    // 只显示重试和清理按钮，确保完成按钮隐藏
    console.log('[DEBUG] 设置按钮状态：显示重试和清理，隐藏完成');
    el.btnRetry.classList.remove('hidden');
    el.btnCleanup.classList.remove('hidden');
    el.btnFinish.classList.add('hidden');
    console.log('[DEBUG] 最终按钮状态 - 重试:', !el.btnRetry.classList.contains('hidden'), '清理:', !el.btnCleanup.classList.contains('hidden'), '完成:', !el.btnFinish.classList.contains('hidden'));
  }
  
  console.log('[DEBUG] === startInstall 结束 ===');
}

async function cleanupAndRestart() {
  console.log('[DEBUG] === cleanupAndRestart 开始 ===');
  const instanceId = `bot-${state.inputs.qqNumber}`;
  
  appendLog('[INFO] 开始清理安装文件...');
  console.log('[DEBUG] 清理实例 ID:', instanceId);
  
  try {
    await window.mofoxAPI.installCleanup(instanceId);
    appendLog('[INFO] 清理完成，准备重新安装...');
    console.log('[DEBUG] 清理成功');
    
    // 隐藏结果和按钮
    console.log('[DEBUG] 隐藏所有按钮和结果');
    el.installResult.classList.add('hidden');
    el.btnRetry.classList.add('hidden');
    el.btnCleanup.classList.add('hidden');
    el.btnFinish.classList.add('hidden');
    console.log('[DEBUG] 按钮状态 - 重试:', !el.btnRetry.classList.contains('hidden'), '清理:', !el.btnCleanup.classList.contains('hidden'), '完成:', !el.btnFinish.classList.contains('hidden'));
    
    // 重新开始安装（使用已有的配置）
    console.log('[DEBUG] 500ms 后重新调用 startInstall');
    setTimeout(() => {
      startInstall();
    }, 500);
    
  } catch (error) {
    console.error('[DEBUG] 清理失败:', error);
    appendLog(`[ERROR] 清理失败: ${error.message}`);
    
    // 显示错误结果
    console.log('[DEBUG] 显示清理错误结果');
    el.installResult.classList.remove('hidden');
    el.installResult.querySelector('.result-success').classList.add('hidden');
    el.installResult.querySelector('.result-error').classList.remove('hidden');
    el.installResult.querySelector('.error-message').textContent = '清理失败: ' + error.message;
    console.log('[DEBUG] 按钮状态（清理失败后） - 重试:', !el.btnRetry.classList.contains('hidden'), '清理:', !el.btnCleanup.classList.contains('hidden'), '完成:', !el.btnFinish.classList.contains('hidden'));
  }
  
  console.log('[DEBUG] === cleanupAndRestart 结束 ===');
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

  // Custom Select Logic
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
      item.addEventListener('click', (e) => {
        const val = item.getAttribute('data-value');
        // Update hidden input
        input.value = val;
        // Update display text
        selected.textContent = item.textContent;
        // Update active class
        items.querySelectorAll('div').forEach(i => i.classList.remove('same-as-selected'));
        item.classList.add('same-as-selected');
        // Close dropdown
        items.classList.add('select-hide');
        selected.classList.remove('select-arrow-active');
      });
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!customSelect.contains(e.target)) {
        items.classList.add('select-hide');
        selected.classList.remove('select-arrow-active');
      }
    });
  }
  
  el.btnBack2.addEventListener('click', () => {
    goToPhase(1);
  });
  
  el.btnResetForm.addEventListener('click', async () => {
    if (await window.customConfirm('确定要清空所有表单内容吗？', '确认重置')) {
      resetFormInputs();
      hideValidationErrors();
    }
  });
  
  el.btnNext2.addEventListener('click', validateAndProceed);
  
  // Phase 3
  el.btnToggleLog.addEventListener('click', () => {
    el.installLogContent.classList.toggle('collapsed');
    const icon = el.btnToggleLog.querySelector('.material-symbols-rounded');
    icon.textContent = el.installLogContent.classList.contains('collapsed') ? 'expand_more' : 'expand_less';
  });

  el.btnFullscreenLog.addEventListener('click', () => {
    const logContainer = el.installLogContent.closest('.install-log');
    logContainer.classList.toggle('fullscreen');
    const icon = el.btnFullscreenLog.querySelector('.material-symbols-rounded');
    icon.textContent = logContainer.classList.contains('fullscreen') ? 'fullscreen_exit' : 'fullscreen';
    
    // 如果全屏时日志是折叠的，自动展开
    if (logContainer.classList.contains('fullscreen') && el.installLogContent.classList.contains('collapsed')) {
      el.installLogContent.classList.remove('collapsed');
      const toggleIcon = el.btnToggleLog.querySelector('.material-symbols-rounded');
      toggleIcon.textContent = 'expand_less';
    }
  });
  
  el.btnRetry.addEventListener('click', () => {
    console.log('[DEBUG] 点击重试按钮');
    startInstall();
  });
  
  el.btnCleanup.addEventListener('click', () => {
    console.log('[DEBUG] 点击清理按钮');
    cleanupAndRestart();
  });
  
  el.btnFinish.addEventListener('click', () => {
    console.log('[DEBUG] 点击完成按钮，返回主界面');
    window.location.href = '../index.html';
  });
}

// ─── Initialize ────────────────────────────────────────────────────────

async function init() {
  bindEvents();
  
  // 从设置中读取默认安装路径
  const settings = await window.mofoxAPI.settingsRead();
  if (settings && settings.defaultInstallDir) {
    el.inputInstallDir.value = settings.defaultInstallDir;
  }
  
  // Reset form inputs to ensure clean state
  resetFormInputs();
  
  // 检测是否为"继续安装"模式（从实例卡片跳转过来）
  const urlParams = new URLSearchParams(window.location.search);
  const resumeInstanceId = urlParams.get('instanceId');
  const isResume = urlParams.get('resume') === '1';
  
  if (isResume && resumeInstanceId) {
    // 继续安装模式：加载已有实例数据预填表单，直接进入第 2 步
    try {
      const instance = await window.mofoxAPI.getInstance(resumeInstanceId);
      if (instance) {
        console.log('[Resume] 加载实例数据:', instance);
        
        // 推导安装目录：neomofoxDir = <installDir>/<instanceId>/neo-mofox
        let installDir = '';
        if (instance.neomofoxDir) {
          const parts = instance.neomofoxDir.replace(/[/\\]+$/, '').split(/[/\\]/);
          installDir = parts.slice(0, -2).join('\\');
        }
        
        // 将实例数据直接写入 state.inputs，跳过表单填写
        // 从实例的 installSteps 判断是否包含 NapCat
        const hasNapcat = instance.installSteps && 
          (instance.installSteps.includes('napcat') || instance.installSteps.includes('napcat-config'));
        
        state.inputs = {
          instanceName: instance.displayName || '',
          qqNumber: instance.qqNumber || '',
          ownerQQNumber: instance.ownerQQNumber || '',
          apiKey: instance.apiKey || '',
          wsPort: instance.wsPort || 8095,
          channel: instance.channel || 'main',
          installDir: installDir,
          installNapcat: hasNapcat !== false, // 默认 true，除非明确不包含
          installSteps: instance.installSteps, // 直接使用保存的步骤配置
        };
        
        // 保存续装起点，供 startInstall() 预标记已完成步骤
        const stepOrder = ['clone', 'venv', 'deps', 'gen-config', 'write-core', 'write-model', 'napcat', 'napcat-config', 'register'];
        const savedStep = instance.installProgress?.step;
        if (savedStep && stepOrder.includes(savedStep)) {
          state.resumeFromStep = savedStep;
        }
        
        // 直接跳到第 3 步开始安装，无需用户任何操作
        goToPhase(3);
        startInstall();
        return;
      }
    } catch (e) {
      console.warn('[Resume] 无法加载实例数据，回退到正常流程:', e);
    }
  }
  
  // Start environment check
  goToPhase(1);
  runEnvCheck();
}

// Start
init();
