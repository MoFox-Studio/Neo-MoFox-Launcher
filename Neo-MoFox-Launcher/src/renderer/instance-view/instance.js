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
  napcatUptime: document.getElementById('napcatUptime')
};

// ─── 初始化 ───────────────────────────────────────────────────────────

async function init() {
  await loadInstanceData();
  setupEventListeners();
  setupIPCListeners();
  startStatsUpdate();
  
  // 初始化状态显示
  updateStatus(state.instanceStatus);

  // 检查是否需要自动启动
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('autoStart') === 'true') {
     console.log('自动启动标志位已设置，正在启动实例...');
     // 延迟一点点以确保UI加载完成
     setTimeout(() => {
        handleStartInstance();
     }, 500);
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
  // 返回按钮 - 只有停止状态才能返回
  el.btnBack.addEventListener('click', () => {
    if (state.instanceStatus === 'stopped' || state.instanceStatus === 'error') {
      window.location.href = '../main-view/index.html';
    } else {
      showError('请先停止实例再返回主界面');
    }
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

function handleSettings() {
  // TODO: 打开实例设置对话框
  console.log('打开设置');
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
  const isStopped = status === 'stopped';
  
  el.btnStart.disabled = !isStopped;
  el.btnStop.disabled = !isRunning;
  el.btnRestart.disabled = !isRunning;
  
  // 更新返回按钮状态和样式
  if (isStopped || status === 'error') {
    el.btnBack.disabled = false;
    el.btnBack.style.opacity = '1';
    el.btnBack.style.cursor = 'pointer';
    el.btnBack.title = '返回主界面';
  } else {
    el.btnBack.disabled = true;
    el.btnBack.style.opacity = '0.38';
    el.btnBack.style.cursor = 'not-allowed';
    el.btnBack.title = '运行中无法返回，请先停止实例';
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
