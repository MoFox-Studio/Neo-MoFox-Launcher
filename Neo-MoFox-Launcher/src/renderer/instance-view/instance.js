// ═══ Instance View - Main Entry Point ═══

// ─── 状态管理 ─────────────────────────────────────────────────────────

const state = {
  currentTab: 'mofox',
  autoScroll: true,
  searchQuery: '',
  instanceId: '',
  instanceName: '',
  instanceStatus: 'stopped',
  hasNapcat: true, // 是否安装了 NapCat，默认 true，从实例数据中加载
  logs: {
    mofox: [],
    napcat: []
  },
  stats: {
    mofox: {
      uptime: 0
    },
    napcat: {
      uptime: 0
    }
  }
};

// ─── DOM 元素引用 ─────────────────────────────────────────────────────

const el = {
  // 顶部控制
  btnBack: document.getElementById('btnBack'),
  btnSettings: document.getElementById('btnSettings'),
  btnStart: document.getElementById('btnStart'),
  btnStop: document.getElementById('btnStop'),
  btnRestart: document.getElementById('btnRestart'),
  instanceTitle: document.getElementById('instanceTitle'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),

  // 标签页
  tabButtons: document.querySelectorAll('.tab-button'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  
  // 日志计数
  mofoxLogCount: document.getElementById('mofoxLogCount'),
  napcatLogCount: document.getElementById('napcatLogCount'),

  // 工具栏
  btnSearch: document.getElementById('btnSearch'),
  btnCopyLogs: document.getElementById('btnCopyLogs'),
  btnAutoScroll: document.getElementById('btnAutoScroll'),
  btnClearLogs: document.getElementById('btnClearLogs'),
  btnExportLogs: document.getElementById('btnExportLogs'),

  // 搜索
  searchBar: document.getElementById('searchBar'),
  searchInput: document.getElementById('searchInput'),
  btnCloseSearch: document.getElementById('btnCloseSearch'),

  // 日志内容
  mofoxLogs: document.getElementById('mofoxLogs'),
  napcatLogs: document.getElementById('napcatLogs'),

  // 统计信息
  mofoxUptime: document.getElementById('mofoxUptime'),
  napcatUptime: document.getElementById('napcatUptime'),

  // 系统资源监控
  instCpuBar: document.getElementById('inst-cpu-bar'),
  instCpuVal: document.getElementById('inst-cpu-val'),
  instMemBar: document.getElementById('inst-mem-bar'),
  instMemVal: document.getElementById('inst-mem-val'),
  instMemDetail: document.getElementById('inst-mem-detail'),
  // NapCat 标签页副本（共享同一套系统数据）
  instCpuBarNc: document.querySelector('.inst-cpu-bar-nc'),
  instCpuValNc: document.querySelector('.inst-cpu-val-nc'),
  instMemBarNc: document.querySelector('.inst-mem-bar-nc'),
  instMemValNc: document.querySelector('.inst-mem-val-nc'),
  instMemDetailNc: document.querySelector('.inst-mem-detail-nc'),

  // 设置对话框
  settingsDialog: document.getElementById('settingsDialog'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  btnOpenNapcat: document.getElementById('btnOpenNapcat')
};

// ─── 初始化 ───────────────────────────────────────────────────────────

async function init() {
  await loadInstanceData();
  setupEventListeners();
  setupIPCListeners();
  setupNavigationGuard();
  startStatsUpdate();
  
  // 初始化自动滚动按钮状态（默认开启）
  if (state.autoScroll) {
    el.btnAutoScroll.classList.add('active');
  }
  
  // 从主进程加载实例的真实运行状态（而不是默认 stopped）
  try {
    if (state.instanceId && window.mofoxAPI?.getInstanceStatus) {
      const realStatus = await window.mofoxAPI.getInstanceStatus(state.instanceId);
      if (realStatus && realStatus !== 'stopped') {
        console.log(`[Instance] 实例已在运行，状态: ${realStatus}`);
        updateStatus(realStatus);
        
        // 如果实例已在运行，加载运行时统计信息
        if (realStatus === 'running') {
          const stats = await window.mofoxAPI.getInstanceStats(state.instanceId);
          if (stats) updateStats(stats);
        }
      } else {
        updateStatus('stopped');
      }
    } else {
      updateStatus(state.instanceStatus);
    }
  } catch (e) {
    console.warn('[Instance] 无法加载实例状态:', e);
    updateStatus(state.instanceStatus);
  }

  // 加载历史日志（即使实例在后台启动，也能看到之前的日志）
  await loadHistoryLogs();

  // 检查是否需要自动启动
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('autoStart') === 'true') {
    // 只有在实例完全停止时才自动启动
    if (state.instanceStatus === 'stopped') {
      console.log('自动启动标志位已设置，正在启动实例...');
      // 延迟一点点以确保UI加载完成
      setTimeout(() => {
        handleStart();
      }, 500);
    } else {
      console.log(`实例已在运行 (${state.instanceStatus})，跳过自动启动`);
    }
  }
}

// ─── 加载实例数据 ─────────────────────────────────────────────────────

async function loadInstanceData() {
  // 从 URL 参数获取实例信息
  const urlParams = new URLSearchParams(window.location.search);
  const instanceId = urlParams.get('instanceId');
  const instanceName = urlParams.get('name');
  
  if (!instanceId) {
    console.error('缺少实例ID参数');
    state.instanceName = instanceName || '未知实例';
  } else {
    state.instanceId = instanceId;
    state.instanceName = instanceName || '实例 ' + instanceId;
  }
  
  el.instanceTitle.textContent = state.instanceName;
  
  // 从主进程加载实例详细配置，检测是否安装了 NapCat
  try {
    if (window.mofoxAPI?.getInstance) {
      const instanceData = await window.mofoxAPI.getInstance(state.instanceId);
      if (instanceData) {
        // 通过 napcatDir 是否存在判断是否安装了 NapCat（更简单直接）
        state.hasNapcat = !!(instanceData.napcatDir);
        
        console.log('[Instance] 实例数据:', instanceData);
        console.log('[Instance] NapCat 路径:', instanceData.napcatDir);
        console.log('[Instance] 是否安装 NapCat:', state.hasNapcat);
        
        // 如果没有 NapCat，隐藏相关 UI
        if (!state.hasNapcat) {
          hideNapcatUI();
        }
      }
    }
  } catch (error) {
    console.warn('[Instance] 无法加载实例数据:', error);
    // 默认保持 hasNapcat = true 以兼容旧数据
  }
}

// ─── 加载历史日志 ─────────────────────────────────────────────────────

async function loadHistoryLogs() {
  if (!state.instanceId) {
    console.warn('[Instance] 无法加载历史日志: 缺少实例ID');
    return;
  }
  
  try {
    if (window.mofoxAPI?.getInstanceLogs) {
      console.log('[Instance] 正在加载历史日志...');
      const historyLogs = await window.mofoxAPI.getInstanceLogs(state.instanceId);
      
      if (historyLogs) {
        // 加载 MoFox 日志
        if (Array.isArray(historyLogs.mofox)) {
          state.logs.mofox = historyLogs.mofox;
          el.mofoxLogCount.textContent = state.logs.mofox.length;
          console.log(`[Instance] 已加载 ${state.logs.mofox.length} 条 MoFox 日志`);
        }
        
        // 加载 NapCat 日志（如果安装了）
        if (state.hasNapcat && Array.isArray(historyLogs.napcat)) {
          state.logs.napcat = historyLogs.napcat;
          el.napcatLogCount.textContent = state.logs.napcat.length;
          console.log(`[Instance] 已加载 ${state.logs.napcat.length} 条 NapCat 日志`);
        }
        
        // 渲染当前标签页的日志
        renderLogs();
      }
    }
  } catch (error) {
    console.warn('[Instance] 加载历史日志失败:', error);
  }
}

// ─── 隐藏 NapCat UI ──────────────────────────────────────

function hideNapcatUI() {
  // 隐藏 NapCat 标签页
  const napcatTab = document.querySelector('.tab-button[data-tab="napcat"]');
  if (napcatTab) {
    napcatTab.style.display = 'none';
  }
  
  // 如果当前在 napcat 标签，切换到 mofox
  if (state.currentTab === 'napcat') {
    switchTab('mofox');
  }
  
  console.log('[Instance] 已隐藏 NapCat UI');
}

// ─── 隐藏 NapCat UI ──────────────────────────────────────────────────

function hideNapcatUI() {
  // 隐藏 NapCat 标签页
  const napcatTab = document.querySelector('.tab-button[data-tab="napcat"]');
  if (napcatTab) {
    napcatTab.style.display = 'none';
  }
  
  // 如果当前在 napcat 标签，切换到 mofox
  if (state.currentTab === 'napcat') {
    switchTab('mofox');
  }
  
  console.log('[Instance] 已隐藏 NapCat UI');
}

// ─── 事件监听器 ───────────────────────────────────────────────────────

function setupEventListeners() {
  // 返回按钮 - 多开模式下始终允许返回，实例在后台继续运行
  el.btnBack.addEventListener('click', () => {
    navigateToMain();
  });

  // 控制按钮
  el.btnStart.addEventListener('click', handleStart);
  el.btnStop.addEventListener('click', handleStop);
  el.btnRestart.addEventListener('click', handleRestart);
  el.btnSettings.addEventListener('click', handleSettings);

  // 标签页切换
  el.tabButtons.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 搜索
  el.btnSearch.addEventListener('click', () => {
    el.searchBar.classList.remove('hidden');
    el.searchInput.focus();
  });

  el.btnCloseSearch.addEventListener('click', () => {
    el.searchBar.classList.add('hidden');
    state.searchQuery = '';
    el.searchInput.value = '';
    renderLogs();
  });

  el.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    renderLogs();
  });

  // 复制日志
  el.btnCopyLogs.addEventListener('click', handleCopyLogs);

  // 自动滚动
  el.btnAutoScroll.addEventListener('click', () => {
    state.autoScroll = !state.autoScroll;
    el.btnAutoScroll.classList.toggle('active', state.autoScroll);
    if (state.autoScroll) {
      scrollToBottom();
    }
  });

  // 清空日志
  el.btnClearLogs.addEventListener('click', handleClearLogs);

  // 导出日志
  el.btnExportLogs.addEventListener('click', handleExportLogs);

  // 设置对话框
  el.btnCloseSettings.addEventListener('click', closeSettings);
  el.settingsDialog.querySelector('.settings-overlay').addEventListener('click', closeSettings);
  
  // 设置项点击
  document.querySelectorAll('.settings-item').forEach(item => {
    item.addEventListener('click', () => handleSettingsAction(item.dataset.action));
  });
}

// ─── IPC 监听器 ───────────────────────────────────────────────────────

function setupIPCListeners() {
  // 监听状态变化
  window.mofoxAPI?.onInstanceStatusChange?.((data) => {
    if (data.instanceId === state.instanceId) {
      updateStatus(data.status);
    }
  });

  // 监听实例日志
  window.mofoxAPI?.onInstanceLog?.((data) => {
    if (data.instanceId === state.instanceId) {
      const log = data.log;
      addLog(log.type, log);
    }
  });

  // 监听统计信息更新
  window.mofoxAPI?.onInstanceStatsUpdate?.((data) => {
    if (data.instanceId === state.instanceId) {
      updateStats(data.stats);
    }
  });
}

// ─── 标签页切换 ───────────────────────────────────────────────────────

function switchTab(tabName) {
  state.currentTab = tabName;
  
  // 更新标签按钮
  el.tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // 更新标签内容
  el.tabPanes.forEach(pane => {
    pane.classList.toggle('active', pane.dataset.tab === tabName);
  });
  
  // 渲染当前标签的日志
  renderLogs();
}

// ─── 控制操作 ─────────────────────────────────────────────────────────

async function handleStart() {
  try {
    updateStatus('starting');
    
    const result = await window.mofoxAPI.startInstance(state.instanceId);
    
    if (!result.success) {
      throw new Error(result.error || '未知错误');
    }
  } catch (error) {
    console.error('启动失败:', error);
    addLog('mofox', { level: 'error', message: '启动失败: ' + error.message });
    updateStatus('error');
    showError('启动失败: ' + error.message);
  }
}

async function handleStop() {
  try {
    updateStatus('stopping');
    
    const result = await window.mofoxAPI.stopInstance(state.instanceId);
    
    if (!result.success) {
      throw new Error(result.error || '未知错误');
    }
  } catch (error) {
    console.error('停止失败:', error);
    addLog('mofox', { level: 'error', message: '停止失败: ' + error.message });
    updateStatus('error');
    showError('停止失败: ' + error.message);
  }
}

async function handleRestart() {
  try {
    updateStatus('restarting');
    
    const result = await window.mofoxAPI.restartInstance(state.instanceId);
    
    if (!result.success) {
      throw new Error(result.error || '未知错误');
    }
  } catch (error) {
    console.error('重启失败:', error);
    addLog('mofox', { level: 'error', message: '重启失败: ' + error.message });
    updateStatus('error');
    showError('重启失败: ' + error.message);
  }
}

async function handleSettings() {
  // 打开设置对话框
  el.settingsDialog.classList.remove('hidden');
  
  // 根据是否安装了 NapCat 显示/隐藏 NapCat 按钮
  if (!state.hasNapcat && el.btnOpenNapcat) {
    el.btnOpenNapcat.style.display = 'none';
  }
}

function closeSettings() {
  el.settingsDialog.classList.add('hidden');
}

async function handleSettingsAction(action) {
  if (!state.instanceId) {
    showError('实例信息丢失');
    return;
  }

  try {
    switch (action) {
      case 'open-project':
        await openFolder('project');
        break;
      case 'open-config-folder':
        await openFolder('config');
        break;
      case 'open-data-folder':
        await openFolder('data');
        break;
      case 'open-logs-folder':
        await openFolder('logs');
        break;
      case 'open-plugins-folder':
        await openFolder('plugins');
        break;
      case 'open-napcat':
        await openFolder('napcat');
        break;
      case 'open-core-config':
        await openFile('core-config');
        break;
      case 'open-model-config':
        await openFile('model-config');
        break;
      case 'delete-database':
        await handleDeleteDatabase();
        break;
      case 'delete-logs':
        await handleDeleteInstanceLogs();
        break;
      default:
        showWarning('未知操作: ' + action);
    }
  } catch (error) {
    console.error('操作失败:', error);
    showError('操作失败: ' + error.message);
  }
}

async function openFolder(folderType) {
  const result = await window.mofoxAPI.openInstanceFolder(state.instanceId, folderType);
  
  if (result.success) {
    showSuccess('已打开文件夹');
  } else {
    showError(result.error || '打开文件夹失败');
  }
}

async function openFile(fileType) {
  const result = await window.mofoxAPI.openInstanceFile(state.instanceId, fileType);
  
  if (result.success) {
    showSuccess('已打开文件');
  } else {
    showError(result.error || '打开文件失败');
  }
}

async function handleDeleteDatabase() {
  // 先检查实例是否在运行
  if (state.instanceStatus === 'running') {
    showError('请先停止实例再删除数据库');
    return;
  }
  
  // 确认对话框
  const confirmed = await customConfirm(
    '确定要删除数据库吗？\n\n' +
    '这将清空所有数据，包括：\n' +
    '• 聊天记录\n' +
    '• 用户数据\n' +
    '• 插件数据\n\n' +
    '此操作不可恢复！',
    '删除数据库'
  );
  
  if (!confirmed) {
    return;
  }
  
  const result = await window.mofoxAPI.deleteInstanceDatabase(state.instanceId);
  
  if (result.success) {
    showSuccess(result.message || '数据库已删除');
    closeSettings();
  } else {
    showError(result.error || '删除数据库失败');
  }
}

async function handleDeleteInstanceLogs() {
  // 确认对话框
  const confirmed = await customConfirm(
    '确定要清空日志文件吗？\n\n' +
    '这将删除所有历史日志文件，但不会影响当前运行的日志显示。\n\n' +
    '此操作不可恢复！',
    '清空日志文件'
  );
  
  if (!confirmed) {
    return;
  }
  
  const result = await window.mofoxAPI.deleteInstanceLogs(state.instanceId);
  
  if (result.success) {
    showSuccess(result.message || '日志文件已清空');
    closeSettings();
  } else {
    showError(result.error || '清空日志失败');
  }
}

// ─── 状态更新 ─────────────────────────────────────────────────────────

function updateStatus(status) {
  state.instanceStatus = status;
  
  // 更新状态点和文本
  el.statusDot.className = 'status-dot ' + status;
  
  const statusTexts = {
    'stopped': '未运行',
    'starting': '启动中...',
    'running': '运行中',
    'stopping': '停止中...',
    'restarting': '重启中...',
    'error': '错误'
  };
  
  el.statusText.textContent = statusTexts[status] || status;

  // 更新按钮状态
  const isRunning = status === 'running';
  const isStopped = status === 'stopped'; // 只有真正停止时才是 stopped
  const isTransitioning = status === 'starting' || status === 'stopping' || status === 'restarting';
  const isError = status === 'error';
  
  // 启动按钮：只有在完全停止时才能启动
  el.btnStart.disabled = !isStopped;
  
  // 停止按钮：在运行、错误、或转换状态时都可以停止（用于强制停止异常进程）
  el.btnStop.disabled = !(isRunning || isError || status === 'restarting' || status === 'starting');
  
  // 重启按钮：只在正常运行时可用
  el.btnRestart.disabled = !isRunning;
  
  // 更新返回按钮 - 多开模式下始终可用
  el.btnBack.disabled = false;
  el.btnBack.style.opacity = '1';
  el.btnBack.style.cursor = 'pointer';
  if (isStopped) {
    el.btnBack.title = '返回主界面';
  } else {
    el.btnBack.title = '返回主界面（实例将在后台继续运行）';
  }
}

// ─── 日志管理 ─────────────────────────────────────────────────────────

function addLog(type, logData) {
  const log = {
    timestamp: logData.timestamp || new Date().toISOString(),
    level: logData.level || 'info',
    message: logData.message || '',
    ...logData
  };

  state.logs[type].push(log);
  
  // 更新日志计数
  if (type === 'mofox') {
    el.mofoxLogCount.textContent = state.logs.mofox.length;
  } else {
    el.napcatLogCount.textContent = state.logs.napcat.length;
  }

  // 如果当前标签是这个类型，重新渲染
  if (state.currentTab === type) {
    renderLogs();
  }
}

function renderLogs() {
  const type = state.currentTab;
  const container = type === 'mofox' ? el.mofoxLogs : el.napcatLogs;
  const logs = state.logs[type];

  // 过滤日志
  let filteredLogs = logs;

  // 搜索过滤
  if (state.searchQuery) {
    filteredLogs = filteredLogs.filter(log =>
      log.message.toLowerCase().includes(state.searchQuery)
    );
  }

  // 如果没有日志，显示空状态
  if (filteredLogs.length === 0) {
    container.innerHTML = `
      <div class="log-empty">
        <span class="material-symbols-rounded">inbox</span>
        <p>${state.searchQuery ? '没有匹配的日志' : '暂无日志'}</p>
      </div>
    `;
    return;
  }

  // 渲染日志 - 终端风格
  container.innerHTML = filteredLogs.map(log => {
    // 先 escape HTML，然后解析 ANSI 代码
    let message = escapeHtml(log.message);
    message = parseAnsi(message);
    
    // 高亮搜索词
    if (state.searchQuery) {
      const regex = new RegExp(`(${escapeRegex(state.searchQuery)})`, 'gi');
      message = message.replace(regex, '<span class="highlight">$1</span>');
    }

    // 纯文本输出，移除级别颜色
    return `<div class="log-entry">${message}</div>`;
  }).join('');

  // 自动滚动到底部
  if (state.autoScroll) {
    scrollToBottom();
  }
}

function scrollToBottom() {
  const container = state.currentTab === 'mofox' ? el.mofoxLogs : el.napcatLogs;
  container.scrollTop = container.scrollHeight;
}

async function handleCopyLogs() {
  const type = state.currentTab;
  const logs = state.logs[type];
  
  if (logs.length === 0) {
    showError('没有可复制的日志');
    return;
  }

  try {
    // 将日志转换为纯文本
    const logText = logs.map(log => log.message).join('\n');
    
    // 复制到剪贴板
    await navigator.clipboard.writeText(logText);
    
    showSuccess(`已复制 ${logs.length} 条日志到剪贴板`);
  } catch (error) {
    console.error('复制失败:', error);
    
    // 如果 clipboard API 失败，尝试使用旧方法
    try {
      const logText = logs.map(log => log.message).join('\n');
      const textarea = document.createElement('textarea');
      textarea.value = logText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      
      showSuccess(`已复制 ${logs.length} 条日志到剪贴板`);
    } catch (fallbackError) {
      console.error('备用复制方法也失败:', fallbackError);
      showError('复制失败: ' + (error.message || '未知错误'));
    }
  }
}

function handleClearLogs() {
  const type = state.currentTab;
  state.logs[type] = [];
  
  // 更新日志计数
  if (type === 'mofox') {
    el.mofoxLogCount.textContent = '0';
  } else {
    el.napcatLogCount.textContent = '0';
  }
  
  renderLogs();
  
  // 通知主进程清空日志
  window.mofoxAPI?.clearInstanceLogs?.(state.instanceId, type);
}

async function handleExportLogs() {
  const type = state.currentTab;
  const logs = state.logs[type];
  
  if (logs.length === 0) {
    showError('没有可导出的日志');
    return;
  }

  try {
    const filePath = await window.mofoxAPI?.exportInstanceLogs?.(
      state.instanceId,
      type,
      logs
    );
    
    if (filePath) {
      showSuccess('日志已导出到: ' + filePath);
    }
  } catch (error) {
    console.error('导出失败:', error);
    showError('导出失败: ' + error.message);
  }
}

// ─── 统计信息更新 ─────────────────────────────────────────────────────

function updateStats(stats) {
  if (stats.mofox) {
    state.stats.mofox = stats.mofox;
    el.mofoxUptime.textContent = formatUptime(stats.mofox.uptime);
  }

  // 只在安装了 NapCat 时更新其统计信息
  if (state.hasNapcat && stats.napcat) {
    state.stats.napcat = stats.napcat;
    el.napcatUptime.textContent = formatUptime(stats.napcat.uptime);
  }
}

function startStatsUpdate() {
  // 每秒更新一次运行时间
  setInterval(() => {
    if (state.instanceStatus === 'running') {
      state.stats.mofox.uptime += 1;
      el.mofoxUptime.textContent = formatUptime(state.stats.mofox.uptime);
      
      // 只在安装了 NapCat 时更新
      if (state.hasNapcat) {
        state.stats.napcat.uptime += 1;
        el.napcatUptime.textContent = formatUptime(state.stats.napcat.uptime);
      }
    }
  }, 1000);

  // 每 2 秒轮询系统 CPU / 内存使用率
  refreshResourceUsage(); // 立即执行一次
  setInterval(refreshResourceUsage, 2000);
}

async function refreshResourceUsage() {
  try {
    const data = await window.mofoxAPI.getResourceUsage();
    if (!data) return;
    applyResourceBar(el.instCpuBar, el.instCpuVal, data.cpuPercent);
    applyResourceBar(el.instMemBar, el.instMemVal, data.memPercent);
    if (el.instMemDetail) {
      el.instMemDetail.textContent = `${data.memUsedGB}/${data.memTotalGB} GB`;
    }
    // 同步到 NapCat 标签页副本
    applyResourceBar(el.instCpuBarNc, el.instCpuValNc, data.cpuPercent);
    applyResourceBar(el.instMemBarNc, el.instMemValNc, data.memPercent);
    if (el.instMemDetailNc) {
      el.instMemDetailNc.textContent = `${data.memUsedGB}/${data.memTotalGB} GB`;
    }
  } catch (e) {
    // 静默失败，不影响日志界面
  }
}

function applyResourceBar(barEl, valEl, percent) {
  if (!barEl || !valEl) return;
  const p = Math.max(0, Math.min(100, percent));
  barEl.style.width = p + '%';
  barEl.classList.remove('level-mid', 'level-high');
  if (p >= 85) barEl.classList.add('level-high');
  else if (p >= 60) barEl.classList.add('level-mid');
  valEl.textContent = p + '%';
}

// ─── 工具函数 ─────────────────────────────────────────────────────────

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(num) {
  return String(num).padStart(2, '0');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── ANSI 代码解析 - 移除控制码，保留颜色格式化 ───────────────────────
function parseAnsi(text) {
  let result = text;
  
  // 1. 先移除所有光标移动和清屏控制码（这些在HTML中无意义）
  // 移除光标移动: ESC[nA, ESC[nB, ESC[nC, ESC[nD, ESC[nE, ESC[nF, ESC[nG
  result = result.replace(/(?:\x1b|\u001b)\[\d*[ABCDEFG]/g, '');
  // 移除光标位置: ESC[n;mH 或 ESC[n;mf
  result = result.replace(/(?:\x1b|\u001b)\[\d*;?\d*[Hf]/g, '');
  // 移除清屏/清行: ESC[nJ, ESC[nK
  result = result.replace(/(?:\x1b|\u001b)\[\d*[JK]/g, '');
  // 移除保存/恢复光标: ESC[s, ESC[u
  result = result.replace(/(?:\x1b|\u001b)\[[su]/g, '');
  // 移除显示/隐藏光标: ESC[?25h, ESC[?25l
  result = result.replace(/(?:\x1b|\u001b)\[\?\d+[hl]/g, '');
  // 移除滚动区域设置: ESC[n;mr
  result = result.replace(/(?:\x1b|\u001b)\[\d*;?\d*r/g, '');
  
  // 2. 使用 parseAnsiOld 来处理颜色代码，转换为HTML样式
  result = parseAnsiOld(result);
  
  return result;
}

// ─── 旧的ANSI颜色解析（已弃用，改为完全移除ANSI） ───────────────────────
function parseAnsiOld(text) {
  // ANSI 转 HTML 颜色映射
  const ansiColors = {
    '30': '#000000',   // 黑色
    '31': '#ff7b72',   // 红色
    '32': '#56d364',   // 绿色
    '33': '#f0883e',   // 黄色
    '34': '#58a6ff',   // 蓝色
    '35': '#db61a2',   // 紫色
    '36': '#76e3ea',   // 青色
    '37': '#c9d1d9',   // 白色
    '90': '#6e7681',   // 明黑
    '91': '#ff7b72',   // 明红
    '92': '#56d364',   // 明绿
    '93': '#ffa657',   // 明黄
    '94': '#79c0ff',   // 明蓝
    '95': '#d2a8ff',   // 明紫
    '96': '#76e3ea',   // 明青
    '97': '#f0f6fc'    // 明白
  };
  
  // 替换 ANSI escape 序列
  let result = text;
  
  // 处理真实的 ESC 字符 (\x1b 或 \u001b)
  // 以及可能被转义的字符串形式
  const ansiPattern = /(?:\x1b|\u001b)\[(\d+)(?:;(\d+))?(?:;(\d+))?m/g;
  
  result = result.replace(ansiPattern, (match, code1, code2, code3) => {
    const codes = [code1];
    if (code2) codes.push(code2);
    if (code3) codes.push(code3);
    
    // 0 = 重置
    if (codes.includes('0') || codes.includes('00')) {
      return '</span>';
    }
    
    // 1 = 加粗, 2 = 暗淡, 3 = 斜体, 4 = 下划线  
    if (codes.includes('1')) return '<span style="font-weight: bold;">';
    if (codes.includes('2')) return '<span style="opacity: 0.6;">';
    if (codes.includes('3')) return '<span style="font-style: italic;">';
    if (codes.includes('4')) return '<span style="text-decoration: underline;">';
    
    // 38;5;XXX = 256色模式
    if (codes[0] === '38' && codes[1] === '5' && codes[2]) {
      const colorCode = parseInt(codes[2]);
      if (!isNaN(colorCode)) {
        const color = ansi256ToRgb(colorCode);
        return `<span style="color: ${color};">`;
      }
    }
    
    // 30-37, 90-97 前景色
    for (const code of codes) {
      if (ansiColors[code]) {
        return `<span style="color: ${ansiColors[code]};">`;
      }
    }
    
    return '';
  });
  
  // 替换 \x1b[0m, \x1b[XXm 简写格式
  result = result.replace(/\[0m/g, '</span>');
  result = result.replace(/\[(\d+)m/g, (match, code) => {
    if (code === '0') return '</span>';
    if (ansiColors[code]) {
      return `<span style="color: ${ansiColors[code]};">`;
    }
    return '';
  });
  
  return result;
}

// ANSI 256 色 -> RGB
function ansi256ToRgb(code) {
  if (code < 16) {
    // 基本 16 色
    const colors = [
      '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
      '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'
    ];
    return colors[code] || '#c9d1d9';
  } else if (code < 232) {
    // 216 色 (6x6x6 立方体)
    const n = code - 16;
    const r = Math.floor(n / 36);
    const g = Math.floor((n % 36) / 6);
    const b = n % 6;
    const toHex = (c) => {
      const val = c === 0 ? 0 : 55 + c * 40;
      return val.toString(16).padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } else {
    // 24 级灰度
    const gray = 8 + (code - 232) * 10;
    const hex = gray.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }
}

// ─── 导航控制 ─────────────────────────────────────────────────────────

let isNavigatingAway = false;

function navigateToMain() {
  isNavigatingAway = true;
  window.location.href = '../main-view/index.html';
}

function setupNavigationGuard() {
  // 多开模式：实例在后台运行，允许自由导航
  // 仅在用户通过非正常方式（如鼠标侧键）导航时给予提示
  window.addEventListener('popstate', (e) => {
    // 推回当前状态以防止页面跳转到未知地址
    // 然后用正常方式导航回主页
    history.pushState(null, '', window.location.href);
    navigateToMain();
  });

  // 初始推入一个状态，让 popstate 能被触发
  history.pushState(null, '', window.location.href);
}

// ─── 使用 Toast 组件显示消息 ──────────────────────────────────────────

// Toast 组件函数已在 toast.js 中定义，这里直接使用
// showError, showSuccess, showInfo, showWarning 已全局可用

// ─── 模拟数据（开发测试用） ────────────────────────────────────────────

function addMockLogs() {
  // 模拟一些测试日志
  const mockLogs = [
    { level: 'info', message: 'MoFox 核心已启动' },
    { level: 'info', message: '正在加载插件系统...' },
    { level: 'warning', message: '警告: 某个插件版本过旧' },
    { level: 'info', message: '已加载 5 个插件' },
    { level: 'error', message: '错误: 连接到数据库失败' }
  ];

  mockLogs.forEach((log, index) => {
    setTimeout(() => {
      addLog('mofox', log);
      addLog('napcat', { ...log, message: '[Napcat] ' + log.message });
    }, index * 1000);
  });
}

// ─── 页面加载完成后初始化 ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  init();
  });
