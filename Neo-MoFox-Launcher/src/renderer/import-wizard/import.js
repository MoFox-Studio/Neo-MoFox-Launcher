/**
 * Import Wizard - 整合包导入向导
 * 负责整合包解析、用户配置、环境检测、安装执行等流程
 */

// ─── 状态管理 ────────────────────────────────────────────────────────

const state = {
  currentStep: 1,
  totalSteps: 8,
  
  // 整合包信息
  packPath: null,
  packManifest: null,
  
  // 环境检测
  envCheckPassed: false,
  networkCheckPassed: false,
  pythonCmd: null,

  // 许可协议
  licenseLoaded: false,
  licenseAgreed: false,
  
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
    installNapcat: true,
    installPlatform: true,
    platform: '',
    installWebui: true,
  },
  
  // 安装状态
  installing: false,
  activeInstanceId: null,
  importAbortable: false,
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
  btnBackHome: document.getElementById('btn-back-home'),
  btnRetry: document.getElementById('btn-retry'),
  btnFinish: document.getElementById('btn-finish'),
  
  // 步骤 4: 选择整合包
  btnSelectPack: document.getElementById('btn-select-pack'),
  packSelector: document.getElementById('pack-selector'),
  selectedPackInfo: document.getElementById('selected-pack-info'),
  packFilename: document.getElementById('pack-filename'),
  packInfoBody: document.getElementById('pack-info-body'),
  
  // 步骤 1: 环境检测
  checkPython: document.getElementById('check-python'),
  checkUv: document.getElementById('check-uv'),
  checkGit: document.getElementById('check-git'),
  envCheckResult: document.getElementById('env-check-result'),
  
  // 步骤 3: 许可查看
  licenseTabs: document.querySelectorAll('.license-tab'),
  licenseLoading: document.getElementById('license-loading'),
  licenseError: document.getElementById('license-error'),
  licenseContentEula: document.getElementById('license-content-eula'),
  licenseContentPrivacy: document.getElementById('license-content-privacy'),
  btnReloadLicense: document.getElementById('btn-reload-license'),
  inputAgreeLicense: document.getElementById('input-agree-license'),

  // 步骤 5: 用户配置
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
  
  // 步骤 6: 组件配置
  checkInstallWebui: document.getElementById('check-install-webui'),
  checkInstallNapcat: document.getElementById('check-install-napcat'),
  cardNapcat: document.getElementById('card-napcat'),
  descNapcat: document.getElementById('desc-napcat'),
  selectInstallPlatform: document.getElementById('select-install-platform'),
  
  // 步骤 7: 安装确认
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
  
  // 步骤 8: 安装执行
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
  
  // 获取系统平台信息
  try {
    const platformInfo = await window.mofoxAPI.getPlatformInfo();
    state.isLinux = platformInfo.platform === 'linux';
  } catch (err) {
    console.error('[ImportWizard] 获取系统平台信息失败:', err);
    state.isLinux = false; // 降级处理
  }

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
  el.btnBackHome?.addEventListener('click', handleBackHome);
  el.btnRetry?.addEventListener('click', retryInstall);
  el.btnFinish?.addEventListener('click', finishAndClose);
  
  // 步骤 4: 选择整合包
  el.btnSelectPack?.addEventListener('click', selectPack);
  // 不绑定 packSelector，避免事件冒泡导致重复触发
  
  // 步骤 3: 许可查看
  el.licenseTabs?.forEach(tab => {
    tab.addEventListener('click', () => switchLicenseTab(tab.getAttribute('data-tab')));
  });
  el.btnReloadLicense?.addEventListener('click', loadLicenseAgreements);
  el.inputAgreeLicense?.addEventListener('change', () => {
    state.licenseAgreed = el.inputAgreeLicense.checked;
    clearLicenseError();
  });

  // 步骤 5: 用户配置
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
  
  // 输入时清除错误（而非聚焦时，保持错误提示可见）
  [el.inputInstanceName, el.inputQqNumber, el.inputQqNickname, el.inputOwnerQq, el.inputApiKey, el.inputWsPort, el.inputWebuiApiKey, el.inputInstallDir].forEach(input => {
    input?.addEventListener('input', () => clearFieldError(input));
  });
  
  // 步骤 8: 安装日志折叠
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
    const { step, status, instanceId } = data || {};
    if (instanceId) {
      state.activeInstanceId = instanceId;
    }
    if (step === 'install-step-executor' && status === 'running') {
      state.importAbortable = true;
      el.btnBackHome?.classList.remove('hidden');
    }
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
  el.btnBack.classList.toggle('hidden', step === 1 || step === 8);
  el.btnNext.classList.toggle('hidden', step === 8);
  el.btnCancel.classList.toggle('hidden', step !== 1);
  el.btnBackHome?.classList.add('hidden');
  
  // 步骤 1 自动运行环境检测，确保在所有导入操作前完成
  if (step === 1 && !state.envCheckPassed) {
    runEnvCheck();
  }

  // 步骤 2 自动运行网络检测
  if (step === 2 && !state.networkCheckPassed) {
    runNetworkCheck();
  }

  // 步骤 3 加载许可协议
  if (step === 3 && !state.licenseLoaded) {
    loadLicenseAgreements();
  }
  
  // 步骤 6 组件配置处理
  if (step === 6) {
    initComponentSelection();
  }

  // 步骤 7 显示摘要
  if (step === 7) {
    updateSummary();
  }
  
  // 步骤 8 开始安装
  if (step === 8) {
    console.log('[ImportWizard] 进入步骤 8，准备开始导入');
    el.btnNext.classList.add('hidden');
    el.btnFinish.classList.add('hidden');
    el.btnBackHome?.classList.add('hidden');
    state.activeInstanceId = null;
    state.importAbortable = false;
    
    // 初始化步骤指示器
    initializeStepIndicators();
    
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
  clearLicenseError();
  
  // 步骤 1: 环境检测
  if (state.currentStep === 1) {
    if (!state.envCheckPassed) {
      await showError('环境检测未通过，请先安装缺失的依赖');
      return;
    }
  }
  
  // 步骤 2: 网络检测
  if (state.currentStep === 2) {
    if (!state.networkCheckPassed) {
      await showError('网络检测未通过，请检查网络连接后重试');
      return;
    }
  }

  // 步骤 3: 许可查看
  if (state.currentStep === 3) {
    if (!state.licenseLoaded) {
      await showError('许可协议尚未加载完成，请稍候或重试加载');
      return;
    }
    if (!el.inputAgreeLicense?.checked) {
      showLicenseError();
      return;
    }
    state.licenseAgreed = true;
  }

  // 步骤 4: 选择整合包
  if (state.currentStep === 4) {
    if (!state.packPath || !state.packManifest) {
      await showError('请先选择整合包文件');
      return;
    }
  }
  
  // 步骤 5: 用户配置
  if (state.currentStep === 5) {
    if (!validateInputs()) {
      return;
    }
    
    // 检查实例是否已存在
    const instanceName = el.inputInstanceName.value.trim();
    try {
      const instances = await window.mofoxAPI.getInstances();
      const exists = instances.some(i => i.name === instanceName);
      if (exists) {
        showFieldError(el.inputInstanceName, '已存在同名实例，请更换实例名称');
        return;
      }
    } catch (err) {
      console.warn('[ImportWizard] 检查实例名称失败:', err);
    }
    
    collectInputs();
  }
  
  // 步骤 6: 组件配置
  if (state.currentStep === 6) {
    state.inputs.installWebui = el.checkInstallWebui?.checked ?? true;
    state.inputs.installNapcat = el.checkInstallNapcat?.checked ?? true;
    state.inputs.installPlatform = state.inputs.installNapcat;
    state.inputs.platform = el.selectInstallPlatform?.value || state.packManifest?.content?.platform?.id || '';
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

// ─── 步骤 4: 选择整合包 ───────────────────────────────────────────────

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
        <div class="info-loading">
          <span class="material-symbols-rounded spinning">progress_activity</span>
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
  
  const platformContent = content.platform || content.napcat;
  const platformName = platformContent?.displayName || platformContent?.name || platformContent?.id || '平台';
  if (platformContent?.included) {
    if (state.isLinux) {
      items.push(`
        <div class="content-item" style="opacity: 0.5;">
          <span class="material-symbols-rounded">extension</span>
          <div class="content-item-text">
            <div class="content-item-name">${platformName} (Linux 不支持)</div>
            <div class="content-item-detail">${platformContent.version ? `版本: ${platformContent.version}` : ''}</div>
          </div>
          <span class="content-item-badge" style="background: var(--md-sys-color-surface-container-highest); color: var(--md-sys-color-outline);">忽略安装</span>
        </div>
      `);
    } else {
      items.push(`
        <div class="content-item">
          <span class="material-symbols-rounded">extension</span>
          <div class="content-item-text">
            <div class="content-item-name">${platformName}</div>
            <div class="content-item-detail">${platformContent.version ? `版本: ${platformContent.version}` : ''}</div>
          </div>
          <span class="content-item-badge">已内置</span>
        </div>
      `);
    }
  } else if (platformContent?.installOnImport && !state.isLinux) {
    items.push(`
      <div class="content-item">
        <span class="material-symbols-rounded">download</span>
        <div class="content-item-text">
          <div class="content-item-name">平台</div>
          <div class="content-item-detail">导入时可选择平台自动下载安装</div>
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


// ─── 步骤 3: 许可查看 ─────────────────────────────────────────────────

function showLicenseError() {
  const agreement = document.querySelector('.license-agreement');
  if (agreement) {
    agreement.classList.add('error');
    agreement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearLicenseError() {
  const agreement = document.querySelector('.license-agreement');
  if (agreement) {
    agreement.classList.remove('error');
  }
}

// License agreements loading and rendering
async function loadLicenseAgreements() {
  el.licenseLoading.classList.remove('hidden');
  el.licenseError.classList.add('hidden');
  el.licenseContentEula.classList.add('hidden');
  el.licenseContentPrivacy.classList.add('hidden');
  
  try {
    // 从镜像服务获取许可证 URL 列表
    const { eulaUrls, privacyUrls } = await window.mofoxAPI.mirrorGetLicenseUrls();

    // 尝试从 URL 列表中获取内容（依次尝试直到成功）
    const fetchFromUrls = async (urls) => {
      let lastError = null;
      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (response.ok) return await response.text();
          lastError = new Error(`HTTP ${response.status}`);
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError || new Error('所有 URL 均不可达');
    };

    const [eulaText, privacyText] = await Promise.all([
      fetchFromUrls(eulaUrls),
      fetchFromUrls(privacyUrls),
    ]);
    
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

// ─── 步骤 2: 网络检测 ─────────────────────────────────────────────────

async function runNetworkCheck() {
  const checkItem = document.getElementById('check-network');
  const resultContainer = document.getElementById('network-check-result');
  const mirrorResults = document.getElementById('mirror-results');
  const mirrorList = document.getElementById('mirror-list');
  
  if (!checkItem) return;
  
  // 重置为加载状态
  const loadingIcon = checkItem.querySelector('.loading');
  const successIcon = checkItem.querySelector('.success');
  const errorIcon = checkItem.querySelector('.error');
  const statusText = checkItem.querySelector('.status-text');
  
  loadingIcon?.classList.remove('hidden');
  successIcon?.classList.add('hidden');
  errorIcon?.classList.add('hidden');
  if (statusText) statusText.textContent = '检测中...';
  
  resultContainer?.classList.add('hidden');
  mirrorResults?.classList.add('hidden');
  
  try {
    const result = await window.mofoxAPI.mirrorCheckConnectivity();
    
    // 隐藏加载图标
    loadingIcon?.classList.add('hidden');
    
    // 显示镜像源检测结果列表
    if (mirrorList && result.results) {
      mirrorList.innerHTML = result.results.map(item => {
        const statusIcon = item.reachable ? 'check_circle' : 'cancel';
        const statusClass = item.reachable ? 'success' : 'error';
        const latencyText = item.cached ? '(缓存)' : (item.latency !== null ? `${item.latency}ms` : '超时');
        const bestBadge = (result.bestMirror && item.name === result.bestMirror.name) ? '<span class="best-badge">最佳</span>' : '';
        
        return `
          <div class="mirror-item ${statusClass}">
            <span class="material-symbols-rounded ${statusClass}">${statusIcon}</span>
            <span class="mirror-name">${item.name} ${bestBadge}</span>
            <span class="mirror-latency">${latencyText}</span>
          </div>
        `;
      }).join('');
      mirrorResults?.classList.remove('hidden');
    }
    
    // 更新检测结果
    if (result.reachable) {
      successIcon?.classList.remove('hidden');
      if (statusText) statusText.textContent = result.bestMirror?.name || '已连接';
      state.networkCheckPassed = true;
      
      resultContainer?.classList.remove('hidden');
      const successDiv = resultContainer?.querySelector('.result-success');
      const errorDiv = resultContainer?.querySelector('.result-error');
      successDiv?.classList.remove('hidden');
      errorDiv?.classList.add('hidden');
      
      const resultText = successDiv?.querySelector('.network-result-text');
      if (resultText && result.bestMirror) {
        resultText.textContent = `网络检测通过，已选择最佳镜像源: ${result.bestMirror.name}`;
      }
    } else {
      errorIcon?.classList.remove('hidden');
      if (statusText) statusText.textContent = '不可达';
      state.networkCheckPassed = false;
      
      resultContainer?.classList.remove('hidden');
      const successDiv = resultContainer?.querySelector('.result-success');
      const errorDiv = resultContainer?.querySelector('.result-error');
      successDiv?.classList.add('hidden');
      errorDiv?.classList.remove('hidden');
    }
  } catch (error) {
    console.error('[ImportWizard] 网络检测失败:', error);
    loadingIcon?.classList.add('hidden');
    errorIcon?.classList.remove('hidden');
    if (statusText) statusText.textContent = '检测失败';
    state.networkCheckPassed = false;
    
    resultContainer?.classList.remove('hidden');
    const successDiv = resultContainer?.querySelector('.result-success');
    const errorDiv = resultContainer?.querySelector('.result-error');
    successDiv?.classList.add('hidden');
    errorDiv?.classList.remove('hidden');
    const errorMsg = errorDiv?.querySelector('.error-message');
    if (errorMsg) errorMsg.textContent = `网络检测失败: ${error.message}`;
  }
}

// ─── 步骤 1: 环境检测 ─────────────────────────────────────────────────

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

// ─── 步骤 5: 用户配置 ─────────────────────────────────────────────────

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

async function generateWebuiApiKey() {
  const key = generateSecureApiKey(32);
  el.inputWebuiApiKey.value = key;
  evaluatePasswordStrength();
  
  // 复制到剪贴板
  try {
    await navigator.clipboard.writeText(key);
    showSuccess('密钥已生成并复制到剪贴板，请妥善保存！', 4000);
  } catch (error) {
    console.error('复制失败:', error);
    showWarning('密钥已生成，但无法自动复制。请手动复制保存！', 5000);
  }
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
  // 一次只显示一个错误，按顺序验证
  
  // 1. 实例名称
  if (!el.inputInstanceName.value.trim()) {
    showFieldError(el.inputInstanceName, '请输入实例名称');
    return false;
  }
  
  // 2. Bot QQ 号
  const qqNumber = el.inputQqNumber.value.trim();
  if (!qqNumber) {
    showFieldError(el.inputQqNumber, '请输入 Bot QQ 号');
    return false;
  }
  if (!/^\d{5,12}$/.test(qqNumber)) {
    showFieldError(el.inputQqNumber, 'QQ 号必须为 5-12 位数字');
    return false;
  }
  
  // 3. Bot 昵称
  if (!el.inputQqNickname.value.trim()) {
    showFieldError(el.inputQqNickname, '请输入 Bot QQ 昵称');
    return false;
  }
  
  // 4. 管理员 QQ
  const ownerQq = el.inputOwnerQq.value.trim();
  if (!ownerQq) {
    showFieldError(el.inputOwnerQq, '请输入管理员 QQ 号');
    return false;
  }
  if (!/^\d{5,12}$/.test(ownerQq)) {
    showFieldError(el.inputOwnerQq, '管理员 QQ 号必须为 5-12 位数字');
    return false;
  }
  
  // 5. API Key
  if (!el.inputApiKey.value.trim()) {
    showFieldError(el.inputApiKey, '请输入 SiliconFlow API Key');
    return false;
  }
  
  // 6. WebSocket 端口
  const wsPort = parseInt(el.inputWsPort.value);
  if (!wsPort || wsPort < 1024 || wsPort > 65535) {
    showFieldError(el.inputWsPort, '端口号必须在 1024-65535 之间');
    return false;
  }
  
  // 7. 安装路径
  if (!el.inputInstallDir.value.trim()) {
    showFieldError(el.inputInstallDir, '请选择安装路径');
    return false;
  }
  
  return true;
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

// ─── 步骤 6: 组件配置 ─────────────────────────────────────────────────

async function initComponentSelection() {
  if (!state.packManifest) return;
  const content = state.packManifest.content || {};
  const platformContent = content.platform || content.napcat;

  if (!platformContent?.included && !platformContent?.installOnImport) {
    el.cardNapcat.style.display = 'none';
    return;
  }

  el.cardNapcat.style.display = '';
  if (state.isLinux) {
    el.cardNapcat.style.opacity = '0.5';
    el.checkInstallNapcat.disabled = true;
    el.checkInstallNapcat.checked = false;
    el.descNapcat.textContent = 'Linux 不支持自动安装平台';
    if (el.selectInstallPlatform) el.selectInstallPlatform.style.display = 'none';
    return;
  }

  el.cardNapcat.style.opacity = '1';
  el.checkInstallNapcat.disabled = false;
  el.checkInstallNapcat.checked = true;

  if (platformContent.included) {
    const platformName = platformContent.displayName || platformContent.name || platformContent.id || '平台';
    el.descNapcat.textContent = `整合包内置 ${platformName}，可选择是否安装。`;
    if (el.selectInstallPlatform) el.selectInstallPlatform.style.display = 'none';
    state.inputs.platform = platformContent.id || '';
    return;
  }

  el.descNapcat.textContent = '整合包提供导入时自动下载，可选择要安装的平台。';
  await loadImportPlatforms(platformContent.id);
}


/**
 * 加载导入时可安装平台列表。
 * @param {string} preferredPlatformId 整合包建议的平台 ID
 * @returns {Promise<void>}
 */
async function loadImportPlatforms(preferredPlatformId) {
  const select = el.selectInstallPlatform;
  if (!select) return;

  try {
    const platforms = await window.mofoxAPI.installGetPlatforms?.() || [];
    const installable = platforms.filter(platform => platform.available);
    select.style.display = 'block';
    select.disabled = installable.length === 0;
    select.innerHTML = installable.length > 0
      ? installable.map(platform => `<option value="${platform.id}">${platform.displayName || platform.name}</option>`).join('')
      : '<option value="">当前系统没有可安装平台</option>';

    const preferred = installable.find(platform => platform.id === preferredPlatformId);
    select.value = preferred?.id || installable[0]?.id || '';
    state.inputs.platform = select.value;
    select.onchange = () => { state.inputs.platform = select.value; };
  } catch (error) {
    console.error('[ImportWizard] 加载平台列表失败:', error);
    select.style.display = 'block';
    select.disabled = true;
    select.innerHTML = '<option value="">平台列表加载失败</option>';
  }
}

// ─── 步骤 7: 安装确认 ─────────────────────────────────────────────────

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
  
  const platformContent = content.platform || content.napcat;
  const platformName = platformContent?.displayName || platformContent?.name || platformContent?.id || inputs.platform || '平台';
  if (platformContent?.included) {
    if (state.isLinux) {
      contentTags.push(`<div class="content-tag" style="opacity: 0.5;"><span class="material-symbols-rounded">extension</span>${platformName} (已忽略)</div>`);
    } else {
      contentTags.push(`<div class="content-tag"><span class="material-symbols-rounded">extension</span>${platformName}</div>`);
    }
  } else if (platformContent?.installOnImport && !state.isLinux) {
    if (inputs.installNapcat) {
      contentTags.push(`<div class="content-tag" style="background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container);"><span class="material-symbols-rounded">download</span>自动安装 ${inputs.platform || '平台'}</div>`);
    } else {
      contentTags.push('<div class="content-tag" style="opacity: 0.5;"><span class="material-symbols-rounded">extension</span>平台 (已忽略)</div>');
    }
  }

  if (inputs.installWebui) {
    contentTags.push('<div class="content-tag" style="background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);"><span class="material-symbols-rounded">dashboard</span>WebUI</div>');
  }

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
  
  const platformContent = content.platform || content.napcat;
  if (!state.isLinux) {
    if (!platformContent?.included) {
      if (platformContent?.installOnImport && state.inputs.installNapcat) {
        steps.push('platform-install');
      }
    }
    if (platformContent?.included || (platformContent?.installOnImport && state.inputs.installNapcat)) {
      steps.push('platform-config');
    }
  }

  if (state.inputs.installWebui) {
    steps.push('webui');
  }
  
  steps.push('register');
  
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
    'platform-install': '安装平台',
    'platform-config': '配置平台',
    'napcat': '安装平台',
    'napcat-config': '配置平台',
    'webui': '安装 WebUI',
    'register': '注册实例',
  };
  
  return descriptions[step] || step;
}

function initializeStepIndicators() {
  if (!el.installSteps) {
    console.error('[ImportWizard] 步骤指示器容器未找到');
    return;
  }
  
  console.log('[ImportWizard] 初始化步骤指示器，步骤列表:', state.installSteps);
  
  // 清空现有内容
  el.installSteps.innerHTML = '';
  
  // 为每个安装步骤创建指示器元素
  state.installSteps.forEach(step => {
    const stepItem = document.createElement('div');
    stepItem.className = 'install-step-item';
    stepItem.setAttribute('data-step', step);
    
    stepItem.innerHTML = `
      <span class="material-symbols-rounded step-icon">radio_button_unchecked</span>
      <span class="step-text">${getStepDescription(step)}</span>
    `;
    
    el.installSteps.appendChild(stepItem);
  });
  
  console.log('[ImportWizard] 步骤指示器初始化完成，共', state.installSteps.length, '个步骤');
}

// ─── 步骤 8: 安装执行 ─────────────────────────────────────────────────

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
    if (result.instanceId) {
      state.activeInstanceId = result.instanceId;
    }
    
    if (!result.success) {
      if (result.aborted) {
        return;
      }
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
    el.progressPercent.textContent = '';
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

  if (step === 'instance-registered' || step === 'install-step-executor') {
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
  state.importAbortable = false;
  el.btnBackHome?.classList.add('hidden');
  if (instanceId) {
    state.activeInstanceId = instanceId;
  }
  
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
  if (el.progressFill) el.progressFill.style.width = '0%';
  el.progressPercent.textContent = '0%';
  if (el.progressStep) el.progressStep.textContent = '准备中...';
  
  // 重新开始安装
  await startImport();
}

async function handleBackHome() {
  if (!state.importAbortable) {
    await showError('当前正在解压或复制整合包文件，暂不能中止；安装步骤开始后才允许返回主界面');
    return;
  }

  const choice = await window.customDialog.choice(
    '整合包导入的安装步骤正在进行中，请选择返回方式：\n\n• 直接返回：停止后续安装步骤并保留已复制的文件与未完成实例\n• 清理后返回：停止后续安装步骤，删除已安装目录和实例注册信息后返回',
    '返回主界面',
    [
      { label: '直接返回', value: 'stop', variant: 'text' },
      { label: '清理后返回', value: 'cleanup', variant: 'tonal' },
    ]
  );

  if (choice === null) return;

  try {
    const result = await window.mofoxAPI.importAbort?.();
    if (result && result.success === false) {
      await showError(result.error || '当前阶段暂不能中止导入');
      return;
    }
    appendLog('[INFO] 已请求中止整合包导入');
  } catch (error) {
    console.error('[ImportWizard] 中止导入失败:', error);
    appendLog(`[ERROR] 中止导入失败: ${error.message}`);
    return;
  }

  if (choice === 'cleanup') {
    const instanceId = state.activeInstanceId;
    if (instanceId) {
      appendLog('[INFO] 正在清理导入文件...');
      try {
        await window.mofoxAPI.installCleanup(instanceId);
        appendLog('[INFO] 清理完成');
      } catch (error) {
        console.error('[ImportWizard] 清理导入文件失败:', error);
        appendLog(`[ERROR] 清理失败: ${error.message}`);
      }
    } else {
      appendLog('[WARN] 未获取到实例 ID，跳过自动清理');
    }
  }

  window.location.href = '../index.html';
}

function finishAndClose() {
  window.location.href = '../index.html';
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
  
  // 只在输入框不是当前焦点时才聚焦
  if (document.activeElement !== input) {
    input.focus();
  }
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
