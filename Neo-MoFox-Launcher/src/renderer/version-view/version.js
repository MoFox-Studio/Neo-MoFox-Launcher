/**
 * version.js - 版本管理页面脚本
 */

// ─── 全局状态 ───────────────────────────────────────────────────────────
let instanceId = null;
let instanceName = '';
let currentVersionInfo = null;let hasUpdateAvailable = false;
// 自定义下拉框状态
let branchSelectValue = '';

// ─── DOM 元素 ───────────────────────────────────────────────────────────
const el = {
  // Header
  btnBack: document.getElementById('btnBack'),
  btnRefresh: document.getElementById('btnRefresh'),
  instanceName: document.getElementById('instanceName'),
  
  // MoFox
  mofoxBranch: document.getElementById('mofoxBranch'),
  mofoxVersion: document.getElementById('mofoxVersion'),
  mofoxCommit: document.getElementById('mofoxCommit'),
  mofoxCommitDate: document.getElementById('mofoxCommitDate'),
  branchSelectContainer: document.getElementById('branchSelectContainer'),
  btnSwitchBranch: document.getElementById('btnSwitchBranch'),
  mofoxUpdateStatus: document.getElementById('mofoxUpdateStatus'),
  btnUpdateMofox: document.getElementById('btnUpdateMofox'),
  mofoxCommitList: document.getElementById('mofoxCommitList'),
  
  // NapCat
  napcatVersion: document.getElementById('napcatVersion'),
  napcatPath: document.getElementById('napcatPath'),
  napcatVersionList: document.getElementById('napcatVersionList'),
  napcatCard: document.getElementById('napcatCard'),
  
  // Progress
  progressOverlay: document.getElementById('progressOverlay'),
  progressTitle: document.getElementById('progressTitle'),
  progressBar: document.getElementById('progressBar'),
  progressMessage: document.getElementById('progressMessage'),
};

// ═══ 自定义下拉框组件 ═════════════════════════════════════════════════════
class CustomSelect {
  constructor(container, onChange) {
    this.container = container;
    this.trigger = container.querySelector('.custom-select-trigger');
    this.optionsContainer = container.querySelector('.custom-select-options');
    this.selectedValueEl = container.querySelector('.selected-value');
    this.onChange = onChange;
    this.value = '';
    this.isOpen = false;
    
    this.init();
  }
  
  init() {
    // 点击触发器打开/关闭下拉
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    
    // 键盘支持
    this.trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
    
    // 点击外部关闭
    document.addEventListener('click', () => {
      this.close();
    });
    
    // 阻止选项容器的点击冒泡
    this.optionsContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
  
  open() {
    this.isOpen = true;
    this.container.classList.add('open');
    this.optionsContainer.classList.remove('hidden');
  }
  
  close() {
    this.isOpen = false;
    this.container.classList.remove('open');
    this.optionsContainer.classList.add('hidden');
  }
  
  setOptions(options) {
    // options: [{ value, label, selected? }]
    this.optionsContainer.innerHTML = '';
    
    options.forEach(opt => {
      const div = document.createElement('div');
      div.className = 'custom-option' + (opt.selected ? ' selected' : '');
      div.dataset.value = opt.value;
      div.textContent = opt.label;
      
      div.addEventListener('click', () => {
        this.selectOption(opt.value, opt.label);
      });
      
      this.optionsContainer.appendChild(div);
      
      if (opt.selected) {
        this.value = opt.value;
        this.selectedValueEl.textContent = opt.label;
      }
    });
  }
  
  selectOption(value, label) {
    this.value = value;
    this.selectedValueEl.textContent = label;
    
    // 更新选中状态
    this.optionsContainer.querySelectorAll('.custom-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === value);
    });
    
    this.close();
    
    if (this.onChange) {
      this.onChange(value);
    }
  }
  
  getValue() {
    return this.value;
  }
  
  setValue(value) {
    const option = this.optionsContainer.querySelector(`[data-value="${value}"]`);
    if (option) {
      this.selectOption(value, option.textContent);
    }
  }
}

// 下拉框实例
let branchSelect = null;

// ─── 初始化 ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // 解析 URL 参数
  const params = new URLSearchParams(window.location.search);
  instanceId = params.get('instanceId');
  instanceName = params.get('name') || '实例';
  
  if (!instanceId) {
    await window.customAlert('缺少实例 ID 参数', '错误');
    window.history.back();
    return;
  }
  
  el.instanceName.textContent = instanceName;
  
  // 绑定事件
  setupEventListeners();
  
  // 加载版本信息
  await loadVersionInfo();
  
  // 加载分支列表
  await loadBranches();
  
  // 加载 MoFox 提交历史
  await loadMofoxCommitHistory();
  
  // 加载 NapCat 版本列表
  await loadNapCatVersions();
  
  // 监听进度事件
  window.mofoxAPI.onVersionProgress((data) => {
    updateProgress(data.percent, data.message);
  });
});

// ─── 事件绑定 ───────────────────────────────────────────────────────────
function setupEventListeners() {
  // 返回按钮
  el.btnBack.addEventListener('click', () => {
    window.history.back();
  });
  
  // 刷新按钮
  el.btnRefresh.addEventListener('click', async () => {
    const icon = el.btnRefresh.querySelector('.material-symbols-rounded');
    if (icon) icon.classList.add('spinning');
    await loadVersionInfo();
    await loadBranches();
    await loadMofoxCommitHistory();
    await loadNapCatVersions();
    if (icon) icon.classList.remove('spinning');
  });
  
  // 初始化自定义分支下拉框
  branchSelect = new CustomSelect(el.branchSelectContainer, (value) => {
    branchSelectValue = value;
    const currentBranch = currentVersionInfo?.mofox?.branch;
    el.btnSwitchBranch.disabled = !value || value === currentBranch;
  });
  
  // 切换分支按钮
  el.btnSwitchBranch.addEventListener('click', handleSwitchBranch);
  
  // 更新 MoFox 按钮
  el.btnUpdateMofox.addEventListener('click', handleUpdateMofox);
}

// ─── 加载版本信息 ───────────────────────────────────────────────────────
async function loadVersionInfo() {
  try {
    currentVersionInfo = await window.mofoxAPI.versionGetInfo(instanceId);
    
    // 更新 MoFox 显示
    if (currentVersionInfo.mofox) {
      const { branch, commit, version } = currentVersionInfo.mofox;
      
      // 分支
      const branchNameEl = el.mofoxBranch?.querySelector('.branch-name');
      if (branchNameEl) branchNameEl.textContent = branch || '未知';
      
      // 版本
      if (el.mofoxVersion) el.mofoxVersion.textContent = version || '未知';
      
      // Commit
      if (commit && el.mofoxCommit) {
        const codeEl = el.mofoxCommit.querySelector('code');
        const msgEl = el.mofoxCommit.querySelector('.commit-msg');
        if (codeEl) codeEl.textContent = commit.hash || '--';
        if (msgEl) msgEl.textContent = commit.message || '--';
        if (el.mofoxCommitDate) el.mofoxCommitDate.textContent = formatDate(commit.date) || '--';
      }
    }
    
    // 更新 NapCat 显示
    if (currentVersionInfo.napcat) {
      const { version, dir } = currentVersionInfo.napcat;
      
      const versionEl = el.napcatVersion?.querySelector('span:last-child');
      if (versionEl) {
        versionEl.textContent = version || '未安装';
      }
      
      if (el.napcatPath) {
        el.napcatPath.textContent = dir || '--';
        el.napcatPath.title = dir || '';
      }
      
      // 如果有 napcat 路径，显示 NapCat 卡片；否则保持隐藏
      if (el.napcatCard) {
        el.napcatCard.style.display = dir ? '' : 'none';
      }
    }
    
    // 检查 MoFox 更新
    await checkMofoxUpdate();
    
  } catch (error) {
    console.error('加载版本信息失败:', error);
    window.showToast?.(`加载版本信息失败: ${error.message}`, 'error');
  }
}

// ─── 加载分支列表 ───────────────────────────────────────────────────────
async function loadBranches() {
  try {
    const branches = await window.mofoxAPI.versionGetBranches();
    const currentBranch = currentVersionInfo?.mofox?.branch;
    
    // 构建选项数组
    const options = [
      { value: '', label: '选择分支...', selected: !branchSelectValue }
    ];
    
    branches.forEach(branch => {
      options.push({
        value: branch.name,
        label: `${branch.name}${branch.commit ? ` (${branch.commit})` : ''}`,
        selected: branch.name === branchSelectValue
      });
    });
    
    // 更新自定义下拉框
    branchSelect.setOptions(options);
    
    // 更新按钮状态
    el.btnSwitchBranch.disabled = !branchSelectValue || branchSelectValue === currentBranch;
    
  } catch (error) {
    console.error('加载分支列表失败:', error);
  }
}

// ─── 加载 NapCat 版本列表 ───────────────────────────────────────────────
async function loadNapCatVersions() {
  try {
    const releases = await window.mofoxAPI.versionGetNapCatReleases();
    const currentVersion = currentVersionInfo?.napcat?.version;
    
    // 更新版本列表
    el.napcatVersionList.innerHTML = '';
    
    if (releases.length === 0) {
      el.napcatVersionList.innerHTML = `
        <div class="version-list-loading">
          <span>暂无可用版本</span>
        </div>
      `;
      return;
    }
    
    releases.forEach(release => {
      const isCurrent = release.version === currentVersion;
      const item = document.createElement('div');
      item.className = `version-item${isCurrent ? ' current' : ''}`;
      item.innerHTML = `
        <div class="version-item-info">
          <span class="version-item-tag">
            ${release.version}
            ${release.prerelease ? '<span class="prerelease">预发布</span>' : ''}
          </span>
          <span class="version-item-date">${formatDate(release.publishedAt)}</span>
        </div>
        <button class="version-item-btn${isCurrent ? ' current' : ''}" 
                data-version="${release.version}"
                ${isCurrent ? 'disabled' : ''}>
          ${isCurrent ? '当前版本' : '安装'}
        </button>
      `;
      
      // 绑定安装按钮事件
      if (!isCurrent) {
        const btn = item.querySelector('.version-item-btn');
        btn.addEventListener('click', () => installNapCatVersion(release.version));
      }
      
      el.napcatVersionList.appendChild(item);
    });
    
  } catch (error) {
    console.error('加载 NapCat 版本列表失败:', error);
    el.napcatVersionList.innerHTML = `
      <div class="version-list-loading">
        <span style="color: var(--error);">加载失败: ${error.message}</span>
      </div>
    `;
  }
}

// ─── 加载 MoFox 提交历史 ───────────────────────────────────────────────
async function loadMofoxCommitHistory() {
  try {
    const commits = await window.mofoxAPI.versionGetMofoxCommitHistory(instanceId, 20);
    
    el.mofoxCommitList.innerHTML = '';
    
    if (commits.length === 0) {
      el.mofoxCommitList.innerHTML = `
        <div class="version-list-loading">
          <span>暂无提交记录</span>
        </div>
      `;
      return;
    }
    
    commits.forEach(commit => {
      const item = document.createElement('div');
      item.className = `version-item${commit.isCurrent ? ' current' : ''}`;
      item.innerHTML = `
        <div class="version-item-info">
          <span class="version-item-tag">
            <code class="commit-hash-small">${commit.hash}</code>
            ${commit.isCurrent ? '<span class="current-badge">当前</span>' : ''}
          </span>
          <span class="commit-message-text">${escapeHtml(commit.message)}</span>
          <span class="version-item-date">${formatDate(commit.date)}</span>
        </div>
        <button class="version-item-btn${commit.isCurrent ? ' current' : ''}" 
                data-hash="${commit.hash}"
                ${commit.isCurrent ? 'disabled' : ''}>
          ${commit.isCurrent ? '当前版本' : '回退'}
        </button>
      `;
      
      // 绑定回退按钮事件
      if (!commit.isCurrent) {
        const btn = item.querySelector('.version-item-btn');
        btn.addEventListener('click', () => checkoutMofoxCommit(commit.hash, commit.message));
      }
      
      el.mofoxCommitList.appendChild(item);
    });
    
  } catch (error) {
    console.error('加载 MoFox 提交历史失败:', error);
    el.mofoxCommitList.innerHTML = `
      <div class="version-list-loading">
        <span style="color: var(--error);">加载失败: ${error.message}</span>
      </div>
    `;
  }
}

// ─── 回退到指定 MoFox 版本 ───────────────────────────────────────────────
async function checkoutMofoxCommit(hash, message) {
  const confirmed = await window.customConfirm(
    `确定要回退到此版本吗？\n\n${hash}: ${message}\n\n这将暂存本地更改并切换到该提交。`,
    '回退版本'
  );
  
  if (!confirmed) return;
  
  showProgress(`回退到 ${hash}...`, 0);
  
  try {
    await window.mofoxAPI.versionCheckoutCommit(instanceId, hash);
    hideProgress();
    window.showToast?.(`已回退到 ${hash}`, 'success');
    await loadVersionInfo();
    await loadMofoxCommitHistory();
  } catch (error) {
    hideProgress();
    await window.customAlert(`回退失败: ${error.message}`, '错误');
  }
}

// ─── 检查 MoFox 更新 ─────────────────────────────────────────────────────
async function checkMofoxUpdate() {
  try {
    const result = await window.mofoxAPI.versionCheckMofoxUpdate(instanceId);
    
    if (result.hasUpdate) {
      hasUpdateAvailable = true;
      el.mofoxUpdateStatus.className = 'update-status-row has-update';
      el.mofoxUpdateStatus.innerHTML = `
        <span class="material-symbols-rounded">update</span>
        <span class="status-text">有 ${result.behindCount} 个新提交可更新</span>
      `;
      // 有更新时启用按钮，显示"立即更新"
      el.btnUpdateMofox.disabled = false;
      el.btnUpdateMofox.innerHTML = `
        <span class="material-symbols-rounded">download</span>
        <span>立即更新</span>
      `;
    } else {
      hasUpdateAvailable = false;
      el.mofoxUpdateStatus.className = 'update-status-row up-to-date';
      el.mofoxUpdateStatus.innerHTML = `
        <span class="material-symbols-rounded">check_circle</span>
        <span class="status-text">已是最新版本</span>
      `;
      // 已是最新，显示"检查更新"
      el.btnUpdateMofox.disabled = false;
      el.btnUpdateMofox.innerHTML = `
        <span class="material-symbols-rounded">refresh</span>
        <span>检查更新</span>
      `;
    }
  } catch (error) {
    el.mofoxUpdateStatus.className = 'update-status-row';
    el.mofoxUpdateStatus.innerHTML = `
      <span class="material-symbols-rounded">error</span>
      <span class="status-text">检查更新失败</span>
    `;
    el.btnUpdateMofox.disabled = false;
    el.btnUpdateMofox.innerHTML = `
      <span class="material-symbols-rounded">refresh</span>
      <span>重新检查</span>
    `;
  }
}

// ─── 切换分支处理 ───────────────────────────────────────────────────────
async function handleSwitchBranch() {
  const targetBranch = branchSelectValue;
  if (!targetBranch) return;
  
  const confirmed = await window.customConfirm(
    `确定要切换到 "${targetBranch}" 分支吗？\n\n这将暂存本地更改并拉取最新代码。`,
    '切换分支'
  );
  
  if (!confirmed) return;
  
  showProgress('切换分支中...', 0);
  
  try {
    await window.mofoxAPI.versionSwitchBranch(instanceId, targetBranch);
    hideProgress();
    window.showToast?.(`已切换到 ${targetBranch} 分支`, 'success');
    await loadVersionInfo();
  } catch (error) {
    hideProgress();
    await window.customAlert(`切换分支失败: ${error.message}`, '错误');
  }
}

// ─── 更新 MoFox 处理 ────────────────────────────────────────────────────
async function handleUpdateMofox() {
  // 如果没有可用更新，只检查更新
  if (!hasUpdateAvailable) {
    await checkMofoxUpdate();
    return;
  }
  
  const confirmed = await window.customConfirm(
    '确定要更新 Neo-MoFox 吗？\n\n这将拉取最新代码并同步依赖。建议先停止实例。',
    '更新确认'
  );
  
  if (!confirmed) return;
  
  showProgress('更新 Neo-MoFox...', 0);
  
  try {
    await window.mofoxAPI.versionUpdateMofox(instanceId);
    hideProgress();
    window.showToast?.('Neo-MoFox 更新完成', 'success');
    await loadVersionInfo();
  } catch (error) {
    hideProgress();
    await window.customAlert(`更新失败: ${error.message}`, '错误');
  }
}

// ─── 安装指定 NapCat 版本 ───────────────────────────────────────────────
async function installNapCatVersion(version) {
  showProgress(`安装 NapCat ${version}...`, 0);
  
  try {
    await window.mofoxAPI.versionUpdateNapcat(instanceId, version);
    hideProgress();
    window.showToast?.(`NapCat 已更新到 ${version}`, 'success');
    await loadVersionInfo();
    await loadNapCatVersions();
  } catch (error) {
    hideProgress();
    await window.customAlert(`安装失败: ${error.message}`, '错误');
  }
}

// ─── 进度显示控制 ───────────────────────────────────────────────────────
function showProgress(title, percent = 0, message = '请稍候...') {
  el.progressOverlay.classList.remove('hidden');
  el.progressTitle.textContent = title;
  el.progressBar.style.width = `${percent}%`;
  el.progressMessage.textContent = message;
}

function updateProgress(percent, message) {
  el.progressBar.style.width = `${percent}%`;
  if (message) {
    el.progressMessage.textContent = message;
  }
}

function hideProgress() {
  el.progressOverlay.classList.add('hidden');
}

// ─── 工具函数 ───────────────────────────────────────────────────────────
function formatDate(dateString) {
  if (!dateString) return '--';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
