// ═══ Instance View - xterm.js Terminal-Driven Edition ═══
//
// 设计原则：
//   1. 子进程统一通过 node-pty 启动，输出原样 ANSI 字节流。
//   2. 渲染端用 xterm.js 当作真终端，主进程把 PTY chunk 直接 term.write 即可。
//   3. 渲染端不再维护"日志数组"、不再做 ANSI -> HTML 解析、也不再做虚拟化窗口。
//   4. 历史回放：进入页面时主动拉一次 ring buffer，把原始字节再 write 一遍。

// ─── 状态 ─────────────────────────────────────────────────────────────
const state = {
  currentTab: 'mofox',
  autoScroll: true,
  instanceId: '',
  instanceName: '',
  instanceStatus: 'stopped',
  mofoxStatus: 'stopped',
  platformStatus: 'stopped',
  hasPlatform: true,
  platformName: '平台',
  stats: {
    mofox: { uptime: 0 },
    platform: { uptime: 0 },
  },
  // 搜索框开启状态
  searchOpen: false,
};

// 终端实例集合：每个 source(mofox/platform) 对应一个独立 xterm.Terminal
//   { term, fit, search, serialize, container, attached, scrolledUp }
const terminals = {
  mofox: null,
  platform: null,
};

// ─── DOM ──────────────────────────────────────────────────────────────
const el = {
  btnBack: document.getElementById('btnBack'),
  btnSettings: document.getElementById('btnSettings'),
  btnStart: document.getElementById('btnStart'),
  btnStop: document.getElementById('btnStop'),
  btnRestart: document.getElementById('btnRestart'),

  btnStartMofox: document.getElementById('btnStartMofox'),
  btnStopMofox: document.getElementById('btnStopMofox'),
  btnRestartMofox: document.getElementById('btnRestartMofox'),
  btnStartPlatform: document.getElementById('btnStartPlatform'),
  btnStopPlatform: document.getElementById('btnStopPlatform'),
  btnRestartPlatform: document.getElementById('btnRestartPlatform'),

  instanceTitle: document.getElementById('instanceTitle'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),

  tabButtons: document.querySelectorAll('.tab-button'),
  tabPanes: document.querySelectorAll('.tab-pane'),

  // 工具栏
  btnSearch: document.getElementById('btnSearch'),
  btnCopyLogs: document.getElementById('btnCopyLogs'),
  btnAutoScroll: document.getElementById('btnAutoScroll'),
  btnClearLogs: document.getElementById('btnClearLogs'),
  btnExportLogs: document.getElementById('btnExportLogs'),

  searchBar: document.getElementById('searchBar'),
  searchInput: document.getElementById('searchInput'),
  btnCloseSearch: document.getElementById('btnCloseSearch'),

  // 终端容器
  mofoxTerminal: document.getElementById('mofoxTerminal'),
  platformTerminal: document.getElementById('platformTerminal'),

  mofoxUptime: document.getElementById('mofoxUptime'),
  platformUptime: document.getElementById('platformUptime'),

  // 计数（这一版用做"行数"提示，可视情况隐藏）
  mofoxLogCount: document.getElementById('mofoxLogCount'),
  platformLogCount: document.getElementById('platformLogCount'),

  // 系统资源
  instCpuBar: document.getElementById('inst-cpu-bar'),
  instCpuVal: document.getElementById('inst-cpu-val'),
  instMemBar: document.getElementById('inst-mem-bar'),
  instMemVal: document.getElementById('inst-mem-val'),
  instMemDetail: document.getElementById('inst-mem-detail'),
  instCpuBarPlatform: document.querySelector('.inst-cpu-bar-platform'),
  instCpuValPlatform: document.querySelector('.inst-cpu-val-platform'),
  instMemBarPlatform: document.querySelector('.inst-mem-bar-platform'),
  instMemValPlatform: document.querySelector('.inst-mem-val-platform'),
  instMemDetailPlatform: document.querySelector('.inst-mem-detail-platform'),

  settingsDialog: document.getElementById('settingsDialog'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  btnOpenPlatform: document.getElementById('btnOpenPlatform'),
  platformTabLabel: document.querySelector('.tab-button[data-tab="platform"] .tab-label'),
};

// ─── xterm 主题：跟暗色面板一致 ───────────────────────────────────────
const TERMINAL_THEME = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  cursor: '#c9d1d9',
  cursorAccent: '#0d1117',
  selectionBackground: 'rgba(88, 166, 255, 0.35)',
  black: '#484f58',
  red: '#ff7b72',
  green: '#56d364',
  yellow: '#e3b341',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#7ee787',
  brightYellow: '#f0883e',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#76e3ea',
  brightWhite: '#f0f6fc',
};

// ─── 终端构造 ─────────────────────────────────────────────────────────
function createTerminal(source, container) {
  // xterm 的 UMD bundle 把构造函数挂在 window.Terminal / window.FitAddon 上
  const term = new window.Terminal({
    fontFamily: '"JetBrains Mono", "Cascadia Code", "Consolas", "Noto Sans Mono CJK SC", monospace',
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: false,
    cursorStyle: 'bar',
    convertEol: true,
    scrollback: 10000,
    allowTransparency: false,
    theme: TERMINAL_THEME,
    // 让 xterm 不主动接管渲染前的物理粘贴
    allowProposedApi: true,
    // OSC 8 超链接（\x1b]8;;url\x1b\\...）走系统浏览器，避免 xterm 内置
    // OscLinkProvider 调 window.open() 触发 "Opening link blocked..." 警告。
    linkHandler: {
      activate: (_event, uri) => {
        if (uri) window.mofoxAPI?.openExternal?.(uri);
      },
      allowNonHttpProtocols: false,
    },
  });

  const fit = new window.FitAddon.FitAddon();
  const search = new window.SearchAddon.SearchAddon();
  const serialize = new window.SerializeAddon.SerializeAddon();
  // 拦截链接点击，强制走系统浏览器；即使 mofoxAPI 不可用也只是不响应，
  // 不会回退到 xterm 默认的 window.open 行为（自定义 handler 已替换默认实现）。
  const webLinks = new window.WebLinksAddon.WebLinksAddon((_event, uri) => {
    if (!uri) return;
    window.mofoxAPI?.openExternal?.(uri);
  });

  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(serialize);
  term.loadAddon(webLinks);

  term.open(container);

  // 自动 fit 到容器尺寸，并把列/行同步给后端 PTY
  const safeFit = () => {
    try { fit.fit(); } catch (_) { /* 容器尚未可见时会失败，忽略 */ }
  };
  requestAnimationFrame(safeFit);

  // 推送终端尺寸到后端（节流）
  let resizeTimer = null;
  term.onResize(({ cols, rows }) => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      window.mofoxAPI?.resizeInstancePty?.(state.instanceId, source, cols, rows);
    }, 80);
  });

  // 用户在终端内键入：转发到 PTY，让 Loguru/读 stdin 的程序能交互
  term.onData((data) => {
    window.mofoxAPI?.writeInstancePty?.(state.instanceId, source, data);
  });

  // 监测用户是否手动滚动到了上面，停止自动跟随
  const viewport = container.querySelector('.xterm-viewport');
  if (viewport) {
    viewport.addEventListener('scroll', () => {
      const atBottom = Math.abs(
        viewport.scrollTop + viewport.clientHeight - viewport.scrollHeight
      ) < 4;
      const entry = terminals[source];
      if (!entry) return;
      entry.scrolledUp = !atBottom;
      // 自动滚动按钮跟着同步状态
      if (state.currentTab === source) {
        state.autoScroll = atBottom;
        el.btnAutoScroll.classList.toggle('active', state.autoScroll);
      }
    }, { passive: true });
  }

  return { term, fit, search, serialize, container, scrolledUp: false };
}

function ensureTerminal(source) {
  if (terminals[source]) return terminals[source];
  const container = source === 'mofox' ? el.mofoxTerminal : el.platformTerminal;
  if (!container) return null;
  terminals[source] = createTerminal(source, container);
  return terminals[source];
}

function writeToTerminal(source, data) {
  const entry = ensureTerminal(source);
  if (!entry || !data) return;
  entry.term.write(data);

  // 行数计数（粗略指标，等于终端缓冲区已用行）
  const totalRows = entry.term.buffer.active.length;
  const countEl = source === 'mofox' ? el.mofoxLogCount : el.platformLogCount;
  if (countEl) countEl.textContent = String(totalRows);

  // 自动滚动跟随：如果用户正停在底部，则保持在底部
  if (state.autoScroll && state.currentTab === source && !entry.scrolledUp) {
    entry.term.scrollToBottom();
  }
}

// ─── 初始化流程 ────────────────────────────────────────────────────────
async function init() {
  await loadInstanceData();
  setupEventListeners();
  setupIPCListeners();
  setupNavigationGuard();
  startStatsUpdate();

  // 初始化两个终端实例并先把当前的 ring buffer 灌进去（历史回放）
  ensureTerminal('mofox');
  if (state.hasPlatform) ensureTerminal('platform');
  await replayPtyBuffers();

  // 自动滚动按钮默认开启
  el.btnAutoScroll.classList.toggle('active', state.autoScroll);

  // 加载真实运行状态
  try {
    if (state.instanceId && window.mofoxAPI?.getSeparatedStatus) {
      const sep = await window.mofoxAPI.getSeparatedStatus(state.instanceId);
      if (sep) {
        state.mofoxStatus = sep.mofox || 'stopped';
        state.platformStatus = sep.platform || 'stopped';
        updateSeparatedButtonStates();
        if (state.mofoxStatus === 'running' || state.platformStatus === 'running') {
          const stats = await window.mofoxAPI.getInstanceStats(state.instanceId);
          if (stats) updateStats(stats);
        }
      }
    } else if (state.instanceId && window.mofoxAPI?.getInstanceStatus) {
      const realStatus = await window.mofoxAPI.getInstanceStatus(state.instanceId);
      updateStatus(realStatus || 'stopped');
    } else {
      updateStatus(state.instanceStatus);
    }
  } catch (e) {
    console.warn('[Instance] 无法加载实例状态:', e);
    updateStatus(state.instanceStatus);
  }

  // 自动启动开关
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('autoStart') === 'true' && state.instanceStatus === 'stopped') {
    setTimeout(() => handleStart(), 500);
  }

  // 窗口尺寸变化时重新 fit
  window.addEventListener('resize', () => {
    Object.values(terminals).forEach((entry) => {
      if (entry) {
        try { entry.fit.fit(); } catch (_) { /* ignore */ }
      }
    });
  });
}

async function loadInstanceData() {
  const urlParams = new URLSearchParams(window.location.search);
  state.instanceId = urlParams.get('instanceId') || '';
  state.instanceName = urlParams.get('name') || (state.instanceId ? '实例 ' + state.instanceId : '未知实例');
  el.instanceTitle.textContent = state.instanceName;

  try {
    if (window.mofoxAPI?.getInstance) {
      const instanceData = await window.mofoxAPI.getInstance(state.instanceId);
      if (instanceData) {
        state.hasPlatform = !!(instanceData.platformDir && instanceData.platform);
        state.platformName = instanceData.platformDisplayName || instanceData.platformName || instanceData.platform || '平台';
        updatePlatformLabels();
        if (!state.hasPlatform) hidePlatformUI();
      }
    }
  } catch (error) {
    console.warn('[Instance] 无法加载实例数据:', error);
  }
}

async function replayPtyBuffers() {
  if (!state.instanceId || !window.mofoxAPI?.getInstancePtyBuffer) return;
  try {
    const buffers = await window.mofoxAPI.getInstancePtyBuffer(state.instanceId);
    if (!buffers) return;
    if (buffers.mofox) writeToTerminal('mofox', buffers.mofox);
    if (state.hasPlatform && buffers.platform) writeToTerminal('platform', buffers.platform);
  } catch (error) {
    console.warn('[Instance] 加载 PTY 历史 buffer 失败:', error);
  }
}

function hidePlatformUI() {
  const platformTab = document.querySelector('.tab-button[data-tab="platform"]');
  if (platformTab) platformTab.style.display = 'none';
  if (state.currentTab === 'platform') switchTab('mofox');
}

function updatePlatformLabels() {
  const platformName = state.platformName || '平台';
  if (el.platformTabLabel) el.platformTabLabel.textContent = platformName;
  if (el.btnStartPlatform) el.btnStartPlatform.title = `启动 ${platformName} 适配器`;
  if (el.btnStopPlatform) el.btnStopPlatform.title = `停止 ${platformName} 适配器`;
  if (el.btnRestartPlatform) el.btnRestartPlatform.title = `重启 ${platformName} 适配器`;
  if (el.btnOpenPlatform) {
    const titleEl = el.btnOpenPlatform.querySelector('.item-title');
    const descEl = el.btnOpenPlatform.querySelector('.item-desc');
    if (titleEl) titleEl.textContent = `打开 ${platformName} 目录`;
    if (descEl) descEl.textContent = `${platformName} 安装目录`;
  }
}

// ─── 事件 & IPC ───────────────────────────────────────────────────────
function setupEventListeners() {
  el.btnBack.addEventListener('click', navigateToMain);

  el.btnStart.addEventListener('click', handleStart);
  el.btnStop.addEventListener('click', handleStop);
  el.btnRestart.addEventListener('click', handleRestart);
  el.btnSettings.addEventListener('click', handleSettings);

  el.btnStartMofox?.addEventListener('click', handleStartMofox);
  el.btnStopMofox?.addEventListener('click', handleStopMofox);
  el.btnRestartMofox?.addEventListener('click', handleRestartMofox);

  el.btnStartPlatform?.addEventListener('click', handleStartPlatform);
  el.btnStopPlatform?.addEventListener('click', handleStopPlatform);
  el.btnRestartPlatform?.addEventListener('click', handleRestartPlatform);

  el.tabButtons.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // 工具栏
  el.btnSearch.addEventListener('click', toggleSearch);
  el.btnCloseSearch.addEventListener('click', () => toggleSearch(false));
  el.searchInput.addEventListener('input', (e) => {
    runSearch(e.target.value);
  });
  el.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const entry = currentTerminal();
      if (!entry) return;
      if (e.shiftKey) entry.search.findPrevious(el.searchInput.value);
      else entry.search.findNext(el.searchInput.value);
    } else if (e.key === 'Escape') {
      toggleSearch(false);
    }
  });

  el.btnCopyLogs.addEventListener('click', handleCopyLogs);
  el.btnClearLogs.addEventListener('click', handleClearLogs);
  el.btnExportLogs.addEventListener('click', handleExportLogs);
  el.btnAutoScroll.addEventListener('click', () => {
    state.autoScroll = !state.autoScroll;
    el.btnAutoScroll.classList.toggle('active', state.autoScroll);
    if (state.autoScroll) {
      const entry = currentTerminal();
      if (entry) {
        entry.scrolledUp = false;
        entry.term.scrollToBottom();
      }
    }
  });

  // 设置对话框
  el.btnCloseSettings.addEventListener('click', closeSettings);
  el.settingsDialog.querySelector('.settings-overlay').addEventListener('click', closeSettings);
  document.querySelectorAll('.settings-item').forEach((item) => {
    item.addEventListener('click', () => handleSettingsAction(item.dataset.action));
  });
}

function setupIPCListeners() {
  // 状态变化（支持分离状态）
  window.mofoxAPI?.onInstanceStatusChange?.((data) => {
    if (data.instanceId !== state.instanceId) return;
    if (data.mofoxStatus !== undefined) state.mofoxStatus = data.mofoxStatus;
    if (data.platformStatus !== undefined) state.platformStatus = data.platformStatus;
    if (data.mofoxStatus !== undefined || data.platformStatus !== undefined) {
      updateSeparatedButtonStates();
    } else {
      updateStatus(data.status);
    }
  });

  // PTY 数据流：直接喂给对应终端
  window.mofoxAPI?.onInstancePtyData?.((data) => {
    if (data.instanceId !== state.instanceId) return;
    writeToTerminal(data.type, data.data);
  });

  // 资源/uptime 推送（如果主进程有的话）
  window.mofoxAPI?.onInstanceStatsUpdate?.((data) => {
    if (data.instanceId === state.instanceId) updateStats(data.stats);
  });
}

// ─── 标签页切换 ───────────────────────────────────────────────────────
function switchTab(tabName) {
  state.currentTab = tabName;
  el.tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  el.tabPanes.forEach((pane) => pane.classList.toggle('active', pane.dataset.tab === tabName));

  // 切到新标签时，等浏览器布局完再 fit 一次
  const entry = ensureTerminal(tabName);
  if (entry) {
    requestAnimationFrame(() => {
      try { entry.fit.fit(); } catch (_) { /* ignore */ }
      if (state.autoScroll) entry.term.scrollToBottom();
    });
  }
}

function currentTerminal() {
  return terminals[state.currentTab];
}

// ─── 一键控制 / 分离控制 ──────────────────────────────────────────────
async function handleStart() {
  try {
    updateStatus('starting');
    const result = await window.mofoxAPI.startInstance(state.instanceId);
    if (!result.success) throw new Error(result.error || '未知错误');
  } catch (error) {
    console.error('启动失败:', error);
    updateStatus('error');
    showError('启动失败: ' + error.message);
  }
}

async function handleStop() {
  if (state.instanceStatus === 'stopped') return;
  try {
    updateStatus('stopping');
    const result = await window.mofoxAPI.stopInstance(state.instanceId);
    if (!result.success) throw new Error(result.error || '未知错误');
    updateStatus('stopped');
  } catch (error) {
    console.error('停止失败:', error);
    updateStatus('error');
    showError('停止失败: ' + error.message);
  }
}

async function handleRestart() {
  try {
    updateStatus('restarting');
    const result = await window.mofoxAPI.restartInstance(state.instanceId);
    if (!result.success) throw new Error(result.error || '未知错误');
  } catch (error) {
    console.error('重启失败:', error);
    updateStatus('error');
    showError('重启失败: ' + error.message);
  }
}

async function handleStartMofox() {
  try {
    updateMofoxStatus('starting');
    const result = await window.mofoxAPI.startMoFoxOnly(state.instanceId);
    if (!result.success) throw new Error(result.error || '未知错误');
  } catch (error) {
    updateMofoxStatus('error');
    showError('启动 MoFox 失败: ' + error.message);
  }
}

async function handleStopMofox() {
  if (state.mofoxStatus === 'stopped') return;
  try {
    updateMofoxStatus('stopping');
    const result = await window.mofoxAPI.stopMoFoxOnly(state.instanceId);
    if (!result.success) throw new Error(result.error || '未知错误');
    updateMofoxStatus('stopped');
  } catch (error) {
    updateMofoxStatus('error');
    showError('停止 MoFox 失败: ' + error.message);
  }
}

async function handleRestartMofox() {
  try {
    updateMofoxStatus('restarting');
    const result = await window.mofoxAPI.restartMoFoxOnly(state.instanceId);
    if (!result.success) throw new Error(result.error || '未知错误');
  } catch (error) {
    updateMofoxStatus('error');
    showError('重启 MoFox 失败: ' + error.message);
  }
}

async function handleStartPlatform() {
  try {
    updatePlatformStatus('starting');
    const result = await window.mofoxAPI.startPlatformOnly(state.instanceId);
    if (!result.success) throw new Error(result.error || '未知错误');
  } catch (error) {
    updatePlatformStatus('error');
    showError(`启动 ${state.platformName} 适配器失败: ${error.message}`);
  }
}

async function handleStopPlatform() {
  if (state.platformStatus === 'stopped') return;
  try {
    updatePlatformStatus('stopping');
    const result = await window.mofoxAPI.stopPlatformOnly(state.instanceId);
    if (!result.success) throw new Error(result.error || '未知错误');
    updatePlatformStatus('stopped');
  } catch (error) {
    updatePlatformStatus('error');
    showError(`停止 ${state.platformName} 适配器失败: ${error.message}`);
  }
}

async function handleRestartPlatform() {
  try {
    updatePlatformStatus('restarting');
    const result = await window.mofoxAPI.restartPlatformOnly(state.instanceId);
    if (!result.success) throw new Error(result.error || '未知错误');
  } catch (error) {
    updatePlatformStatus('error');
    showError(`重启 ${state.platformName} 适配器失败: ${error.message}`);
  }
}

// ─── 设置对话框 ───────────────────────────────────────────────────────
function handleSettings() {
  el.settingsDialog.classList.remove('hidden');
  if (!state.hasPlatform && el.btnOpenPlatform) el.btnOpenPlatform.style.display = 'none';
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
      case 'open-project':       await openFolder('project'); break;
      case 'open-config-folder': await openFolder('config'); break;
      case 'open-data-folder':   await openFolder('data'); break;
      case 'open-logs-folder':   await openFolder('logs'); break;
      case 'open-plugins-folder':await openFolder('plugins'); break;
      case 'open-platform':      await openFolder('platform'); break;
      case 'open-core-config':   await openFile('core-config'); break;
      case 'open-model-config':  await openFile('model-config'); break;
      case 'delete-database':    await handleDeleteDatabase(); break;
      case 'delete-logs':        await handleDeleteInstanceLogs(); break;
      default:                   showWarning('未知操作: ' + action);
    }
  } catch (error) {
    showError('操作失败: ' + error.message);
  }
}

async function openFolder(folderType) {
  const result = await window.mofoxAPI.openInstanceFolder(state.instanceId, folderType);
  if (result.success) showSuccess('已打开文件夹');
  else showError(result.error || '打开文件夹失败');
}

async function openFile(fileType) {
  const result = await window.mofoxAPI.configEditorOpen(state.instanceId, fileType);
  if (result.success) {
    const mode = result.mode === 'builtin' ? '内置编辑器' : '系统编辑器';
    showSuccess(`已使用${mode}打开文件`);
  } else {
    showError(result.error || '打开文件失败');
  }
}

async function handleDeleteDatabase() {
  if (state.instanceStatus === 'running') {
    showError('请先停止实例再删除数据库');
    return;
  }
  const confirmed = await customConfirm(
    '确定要删除数据库吗？\n\n这将清空所有数据，包括：\n• 聊天记录\n• 用户数据\n• 插件数据\n\n此操作不可恢复！',
    '删除数据库'
  );
  if (!confirmed) return;
  const result = await window.mofoxAPI.deleteInstanceDatabase(state.instanceId);
  if (result.success) {
    showSuccess(result.message || '数据库已删除');
    closeSettings();
  } else {
    showError(result.error || '删除数据库失败');
  }
}

async function handleDeleteInstanceLogs() {
  const confirmed = await customConfirm(
    '确定要清空日志文件吗？\n\n这将删除所有历史日志文件，但不会影响当前运行的日志显示。\n\n此操作不可恢复！',
    '清空日志文件'
  );
  if (!confirmed) return;
  const result = await window.mofoxAPI.deleteInstanceLogs(state.instanceId);
  if (result.success) {
    showSuccess(result.message || '日志文件已清空');
    closeSettings();
  } else {
    showError(result.error || '清空日志失败');
  }
}

// ─── 状态显示 ─────────────────────────────────────────────────────────
function updateStatus(status) {
  state.instanceStatus = status;
  el.statusDot.className = 'status-dot ' + status;
  const statusTexts = {
    stopped: '未运行', starting: '启动中...', running: '运行中',
    stopping: '停止中...', restarting: '重启中...', error: '错误',
  };
  el.statusText.textContent = statusTexts[status] || status;

  const isRunning = status === 'running';
  const isStopped = status === 'stopped';
  el.btnStart.disabled = !isStopped;
  el.btnStop.disabled = !isRunning && status !== 'error';
  el.btnRestart.disabled = !isRunning;

  el.btnBack.disabled = false;
  el.btnBack.style.opacity = '1';
  el.btnBack.style.cursor = 'pointer';
  el.btnBack.title = isStopped ? '返回主界面' : '返回主界面（实例将在后台继续运行）';
}

function updateMofoxStatus(status) { state.mofoxStatus = status; updateSeparatedButtonStates(); }
function updatePlatformStatus(status) { state.platformStatus = status; updateSeparatedButtonStates(); }

function updateSeparatedButtonStates() {
  const mofoxRunning = state.mofoxStatus === 'running';
  const mofoxStopped = state.mofoxStatus === 'stopped';
  if (el.btnStartMofox)   el.btnStartMofox.disabled = !mofoxStopped;
  if (el.btnStopMofox)    el.btnStopMofox.disabled = !mofoxRunning && state.mofoxStatus !== 'error';
  if (el.btnRestartMofox) el.btnRestartMofox.disabled = !mofoxRunning && state.mofoxStatus !== 'error';

  const platformRunning = state.platformStatus === 'running';
  const platformStopped = state.platformStatus === 'stopped';
  if (el.btnStartPlatform)   el.btnStartPlatform.disabled = !state.hasPlatform || !platformStopped;
  if (el.btnStopPlatform)    el.btnStopPlatform.disabled = !state.hasPlatform || (!platformRunning && state.platformStatus !== 'error');
  if (el.btnRestartPlatform) el.btnRestartPlatform.disabled = !state.hasPlatform || (!platformRunning && state.platformStatus !== 'error');

  const priority = { starting: 6, restarting: 5, running: 4, stopping: 3, error: 2, stopped: 1 };
  const overall = (priority[state.mofoxStatus] || 0) >= (priority[state.platformStatus] || 0)
    ? state.mofoxStatus
    : state.platformStatus;
  updateStatus(overall);
}

// ─── 工具栏行为 ───────────────────────────────────────────────────────
function toggleSearch(force) {
  const wantOpen = typeof force === 'boolean' ? force : !state.searchOpen;
  state.searchOpen = wantOpen;
  el.searchBar.classList.toggle('hidden', !wantOpen);
  if (wantOpen) {
    el.searchInput.focus();
    el.searchInput.select();
  } else {
    el.searchInput.value = '';
    runSearch('');
  }
}

function runSearch(query) {
  const entry = currentTerminal();
  if (!entry) return;
  if (!query) {
    try { entry.search.clearDecorations(); } catch (_) { /* 旧版本可能没有 */ }
    return;
  }
  entry.search.findNext(query, {
    decorations: {
      matchBackground: '#2d4f7c',
      activeMatchBackground: '#f0883e',
      matchOverviewRuler: '#2d4f7c',
      activeMatchColorOverviewRuler: '#f0883e',
    },
  });
}

async function handleCopyLogs() {
  const entry = currentTerminal();
  if (!entry) return;
  let text = entry.term.getSelection();
  if (!text) {
    // 没有选中时，复制整个终端缓冲区
    try {
      text = entry.serialize.serialize({ excludeAltBuffer: true });
      // serialize 含 ANSI，复制成纯文本会更友好。这里折中：保留可读纯文本。
      text = stripAnsiClient(text);
    } catch (_) {
      text = '';
    }
  }
  if (!text) {
    showError('没有可复制的内容');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showSuccess('已复制到剪贴板');
  } catch (error) {
    showError('复制失败: ' + (error?.message || '未知错误'));
  }
}

function handleClearLogs() {
  const entry = currentTerminal();
  if (!entry) return;
  entry.term.reset();
  // 通知主进程清空 ring buffer，下次刷新页面也不会再回放
  window.mofoxAPI?.clearInstancePty?.(state.instanceId, state.currentTab);
  const countEl = state.currentTab === 'mofox' ? el.mofoxLogCount : el.platformLogCount;
  if (countEl) countEl.textContent = '0';
}

async function handleExportLogs() {
  try {
    const filePath = await window.mofoxAPI?.exportInstanceLogs?.(state.instanceId, state.currentTab);
    if (filePath) showSuccess('日志已导出到: ' + filePath);
  } catch (error) {
    showError('导出失败: ' + (error?.message || error));
  }
}

// 客户端轻量 ANSI strip：只在复制路径里用，不参与渲染
function stripAnsiClient(text) {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

// ─── 资源 / Uptime ────────────────────────────────────────────────────
function updateStats(stats) {
  if (stats?.mofox) {
    state.stats.mofox = stats.mofox;
    el.mofoxUptime.textContent = formatUptime(stats.mofox.uptime);
  }
  if (state.hasPlatform && stats?.platform) {
    const platformStats = stats.platform;
    state.stats.platform = platformStats;
    el.platformUptime.textContent = formatUptime(platformStats.uptime);
  }
}

function startStatsUpdate() {
  setInterval(() => {
    if (state.mofoxStatus === 'running') {
      state.stats.mofox.uptime += 1;
      el.mofoxUptime.textContent = formatUptime(state.stats.mofox.uptime);
    }
    if (state.hasPlatform && state.platformStatus === 'running') {
      state.stats.platform.uptime += 1;
      el.platformUptime.textContent = formatUptime(state.stats.platform.uptime);
    }
  }, 1000);

  refreshResourceUsage();
  setInterval(refreshResourceUsage, 2000);
}

async function refreshResourceUsage() {
  try {
    const data = await window.mofoxAPI.getResourceUsage();
    if (!data) return;
    applyResourceBar(el.instCpuBar, el.instCpuVal, data.cpuPercent);
    applyResourceBar(el.instMemBar, el.instMemVal, data.memPercent);
    if (el.instMemDetail) el.instMemDetail.textContent = `${data.memUsedGB}/${data.memTotalGB} GB`;
    applyResourceBar(el.instCpuBarPlatform, el.instCpuValPlatform, data.cpuPercent);
    applyResourceBar(el.instMemBarPlatform, el.instMemValPlatform, data.memPercent);
    if (el.instMemDetailPlatform) el.instMemDetailPlatform.textContent = `${data.memUsedGB}/${data.memTotalGB} GB`;
  } catch (_) {
    /* 静默 */
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

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(num) { return String(num).padStart(2, '0'); }

// ─── 导航守护 ─────────────────────────────────────────────────────────
function navigateToMain() {
  window.location.href = '../main-view/index.html';
}

function setupNavigationGuard() {
  window.addEventListener('popstate', () => {
    history.pushState(null, '', window.location.href);
    navigateToMain();
  });
  history.pushState(null, '', window.location.href);
}

// ─── 启动 ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  init();
});
