// ═══════════════════════════════════════════════════════════════
// 环境管理视图 - 主逻辑
// ═══════════════════════════════════════════════════════════════

// ─── 状态管理 ────────────────────────────────────────────────
let environmentData = null;
let detailedSystemInfo = null;
let recommendedTools = null;
let recommendedExtensions = null;
let extensionCategories = null;
let installedExtensions = [];

// ─── DOM 元素 ────────────────────────────────────────────────
const elements = {
  // Tabs
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  extensionsTab: document.getElementById('extensionsTab'),
  
  // Tools
  toolsGrid: document.getElementById('toolsGrid'),
  
  // Extensions
  vscodeNotFound: document.getElementById('vscodeNotFound'),
  vscodeInfo: document.getElementById('vscodeInfo'),
  vscodeVersion: document.getElementById('vscodeVersion'),
  vscodePath: document.getElementById('vscodePath'),
  extensionsContainer: document.getElementById('extensionsContainer'),
  btnDownloadVSCode: document.getElementById('btnDownloadVSCode'),
  
  // System
  systemInfo: document.getElementById('systemInfo'),
  
  // Actions
  btnBack: document.getElementById('btnBack'),
  btnRefresh: document.getElementById('btnRefresh'),
};

// ─── 初始化 ──────────────────────────────────────────────────
async function init() {
  setupEventListeners();
  await loadEnvironmentData();
}

// ─── 事件监听 ────────────────────────────────────────────────
function setupEventListeners() {
  // Tab 切换
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      switchTab(targetTab);
    });
  });

  // 返回按钮
  elements.btnBack.addEventListener('click', () => {
    window.location.href = '../main-view/index.html';
  });

  // 刷新按钮
  elements.btnRefresh.addEventListener('click', async () => {
    await loadEnvironmentData();
    window.showToast('环境信息已刷新', 'success');
  });

  // 下载 VS Code 按钮
  elements.btnDownloadVSCode.addEventListener('click', () => {
    window.mofoxAPI.openExternal('https://code.visualstudio.com/');
  });
}

// ─── Tab 切换 ────────────────────────────────────────────────
function switchTab(tabName) {
  // 更新按钮状态
  elements.tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // 更新内容面板
  elements.tabPanes.forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabName}`);
  });
}

// ─── 加载环境数据 ────────────────────────────────────────────
async function loadEnvironmentData() {
  try {
    // 获取推荐工具和扩展数据
    const [tools, extensions, categories] = await Promise.all([
      window.mofoxAPI.envGetRecommendedTools(),
      window.mofoxAPI.envGetRecommendedExtensions(),
      window.mofoxAPI.envGetExtensionCategories()
    ]);

    recommendedTools = tools;
    recommendedExtensions = extensions;
    extensionCategories = categories;

    // 执行完整环境检测
    environmentData = await window.mofoxAPI.envPerformFullCheck();
    installedExtensions = environmentData.extensions || [];

    // 渲染工具和扩展（不等待硬件查询）
    renderTools();
    renderVSCodeInfo();
    renderExtensions();

    // 异步获取详细硬件信息并渲染系统信息
    renderSystemInfo(); // 先渲染基础信息
    window.mofoxAPI.envGetDetailedSystemInfo().then(info => {
      detailedSystemInfo = info;
      renderSystemInfo(); // 用详细硬件数据重新渲染
    }).catch(err => {
      console.warn('详细硬件信息获取失败:', err);
    });

  } catch (error) {
    console.error('加载环境数据失败:', error);
    window.showToast('加载环境数据失败', 'error');
  }
}

// ─── 渲染开发工具 ────────────────────────────────────────────
function renderTools() {
  if (!recommendedTools || !environmentData) {
    elements.toolsGrid.innerHTML = '<div class="loading-state"><span class="material-symbols-rounded spinning">progress_activity</span><p>加载中...</p></div>';
    return;
  }

  const toolsHTML = recommendedTools.map(tool => {
    const detected = environmentData.tools[tool.id];
    const isInstalled = detected?.installed || false;
    const version = detected?.version || null;

    return `
      <div class="tool-item">
        <div class="tool-item-icon">
          <span class="material-symbols-rounded">${tool.icon}</span>
        </div>
        <div class="tool-item-content">
          <div class="tool-item-title">
            <h3 class="tool-item-name">${tool.name}</h3>
            ${tool.required ? '<span class="tool-required-badge"><span class="material-symbols-rounded">priority_high</span>必需</span>' : ''}
          </div>
          <p class="tool-item-description">${tool.description}</p>
          ${isInstalled && version ? `<div class="tool-version"><span class="material-symbols-rounded">sell</span>${version}</div>` : ''}
        </div>
        <div class="tool-item-actions">
          <div class="tool-status ${isInstalled ? 'installed' : 'not-installed'}">
            <span class="material-symbols-rounded">${isInstalled ? 'check_circle' : 'cancel'}</span>
            <span>${isInstalled ? '已安装' : '未安装'}</span>
          </div>
          ${!isInstalled ? `
            <button class="md3-btn md3-btn-filled download-tool-btn" data-url="${tool.downloadUrl}">
              <span class="material-symbols-rounded">download</span>
              <span>下载安装</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  elements.toolsGrid.innerHTML = toolsHTML;

  // 事件委托：处理下载按钮点击
  elements.toolsGrid.querySelectorAll('.download-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      if (url) window.mofoxAPI.openExternal(url);
    });
  });
}

// ─── 渲染 VS Code 信息 ───────────────────────────────────────
function renderVSCodeInfo() {
  if (!environmentData) return;

  const vscodeInstalled = environmentData.vscode?.installed || false;

  if (vscodeInstalled) {
    // 显示扩展标签页
    elements.extensionsTab.style.display = 'flex';

    // 显示 VS Code 信息
    elements.vscodeInfo.style.display = 'flex';
    elements.vscodeNotFound.style.display = 'none';
    elements.vscodeVersion.textContent = environmentData.vscode.version || '--';
    elements.vscodePath.textContent = environmentData.vscode.path || '未知路径';
  } else {
    // 隐藏扩展标签页
    elements.extensionsTab.style.display = 'none';

    // 显示未安装提示
    elements.vscodeInfo.style.display = 'none';
    elements.vscodeNotFound.style.display = 'block';
  }
}

// ─── 渲染 VS Code 扩展 ───────────────────────────────────────
function renderExtensions() {
  if (!environmentData?.vscode?.installed) {
    return;
  }

  if (!recommendedExtensions || !extensionCategories) {
    elements.extensionsContainer.innerHTML = '<div class="loading-state"><span class="material-symbols-rounded spinning">progress_activity</span><p>加载扩展列表...</p></div>';
    return;
  }

  // 按分类组织扩展
  const extensionsByCategory = {};
  recommendedExtensions.forEach(ext => {
    if (!extensionsByCategory[ext.category]) {
      extensionsByCategory[ext.category] = [];
    }
    extensionsByCategory[ext.category].push(ext);
  });

  // 渲染每个分类
  const categoriesHTML = Object.entries(extensionsByCategory).map(([categoryId, extensions]) => {
    const category = extensionCategories[categoryId];
    if (!category) return '';

    const extensionsHTML = extensions.map(ext => {
      const isInstalled = installedExtensions.some(installed => installed.id === ext.id);
      
      return `
        <div class="extension-item">
          <div class="extension-icon-wrapper">${ext.icon}</div>
          <div class="extension-info">
            <div class="extension-name-row">
              <h4 class="extension-name">${ext.name}</h4>
              <span class="extension-publisher">by ${ext.publisher}</span>
              ${ext.required ? '<span class="extension-required"><span class="material-symbols-rounded" style="font-size: 10px;">star</span>推荐</span>' : ''}
            </div>
            <p class="extension-description">${ext.description}</p>
          </div>
          ${isInstalled ? `
            <div class="extension-status-badge installed">
              <span class="material-symbols-rounded">check_circle</span>
              <span>已安装</span>
            </div>
          ` : `
            <div class="extension-actions">
              <button class="md3-btn md3-btn-filled install-extension-btn" data-url="${ext.marketplaceUrl}">
                <span class="material-symbols-rounded">add</span>
                <span>安装</span>
              </button>
            </div>
          `}
        </div>
      `;
    }).join('');

    return `
      <div class="extension-category">
        <div class="category-header">
          <div class="category-icon">
            <span class="material-symbols-rounded">${category.icon}</span>
          </div>
          <h3 class="category-title">${category.name}</h3>
          <span class="category-count">${extensions.length} 个扩展</span>
        </div>
        <div class="extensions-list">
          ${extensionsHTML}
        </div>
      </div>
    `;
  }).join('');

  elements.extensionsContainer.innerHTML = categoriesHTML;

  // 事件委托：处理安装扩展按钮点击
  elements.extensionsContainer.querySelectorAll('.install-extension-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      if (url) window.mofoxAPI.openExternal(url);
    });
  });
}

// ─── 渲染系统信息 ────────────────────────────────────────────
function renderSystemInfo() {
  if (!environmentData) {
    elements.systemInfo.innerHTML = '<div class="loading-state"><span class="material-symbols-rounded spinning">progress_activity</span><p>加载系统信息...</p></div>';
    return;
  }

  const system = environmentData.system;
  const hw = detailedSystemInfo || null; // 可能还没加载完

  // ── 操作系统信息 ──
  const osName = hw?.osName || system.type;
  const osVersion = hw?.osVersion || system.release;
  const osArch = hw?.arch || system.arch;
  const hostname = hw?.hostname || system.hostname;
  const uptime = hw?.uptime || '';

  // ── CPU ──
  const cpuModel = hw?.cpuModel || '检测中...';
  const cpuCores = hw?.cpuCores || '?';
  const cpuLogical = hw?.cpuLogical || '?';
  const cpuSpeed = hw?.cpuSpeed || '';

  // ── 内存 ──
  const totalMem = hw?.totalMem || '检测中...';
  const usedMem = hw?.usedMem || '?';
  const freeMem = hw?.freeMem || '?';
  const memUsage = hw?.memUsage || 0;

  // ── GPU ──
  const gpus = hw?.gpus || [];
  // ── 主板 ──
  const motherboard = hw?.motherboard || '检测中...';
  // ── 硬盘 ──
  const disks = hw?.disks || [];
  // ── 显示器 ──
  const monitors = hw?.monitors || [];
  // ── 内存条 ──
  const ramSticks = hw?.ramSticks || [];

  const systemInfoHTML = `
    <!-- 操作系统 -->
    <div class="system-info-card">
      <div class="system-info-header">
        <div class="system-info-icon">
          <span class="material-symbols-rounded">computer</span>
        </div>
        <h3 class="system-info-title">操作系统</h3>
      </div>
      <div class="system-info-items">
        <div class="system-info-item">
          <span class="info-label">系统</span>
          <span class="info-value">${osName}</span>
        </div>
        <div class="system-info-item">
          <span class="info-label">版本</span>
          <span class="info-value-mono">${osVersion}</span>
        </div>
        <div class="system-info-item">
          <span class="info-label">架构</span>
          <span class="info-value-mono">${osArch}</span>
        </div>
        <div class="system-info-item">
          <span class="info-label">主机名</span>
          <span class="info-value-mono">${hostname}</span>
        </div>
        ${uptime ? `
        <div class="system-info-item">
          <span class="info-label">运行时间</span>
          <span class="info-value">${uptime}</span>
        </div>` : ''}
      </div>
    </div>

    <!-- CPU -->
    <div class="system-info-card">
      <div class="system-info-header">
        <div class="system-info-icon">
          <span class="material-symbols-rounded">memory</span>
        </div>
        <h3 class="system-info-title">处理器</h3>
      </div>
      <div class="system-info-items">
        <div class="system-info-item">
          <span class="info-label">型号</span>
          <span class="info-value">${cpuModel}</span>
        </div>
        <div class="system-info-item">
          <span class="info-label">核心数</span>
          <span class="info-value-mono">${cpuCores} 核 / ${cpuLogical} 线程</span>
        </div>
        ${cpuSpeed ? `
        <div class="system-info-item">
          <span class="info-label">频率</span>
          <span class="info-value-mono">${cpuSpeed}</span>
        </div>` : ''}
      </div>
    </div>

    <!-- 内存 -->
    <div class="system-info-card">
      <div class="system-info-header">
        <div class="system-info-icon">
          <span class="material-symbols-rounded">memory_alt</span>
        </div>
        <h3 class="system-info-title">内存</h3>
      </div>
      <div class="system-info-items">
        <div class="system-info-item">
          <span class="info-label">总计</span>
          <span class="info-value-mono">${totalMem}</span>
        </div>
        <div class="system-info-item">
          <span class="info-label">已用 / 可用</span>
          <span class="info-value-mono">${usedMem} / ${freeMem}</span>
        </div>
        <div class="system-info-item">
          <span class="info-label">使用率</span>
          <span class="info-value-mono">
            <span class="mem-usage-bar"><span class="mem-usage-fill" style="width: ${memUsage}%"></span></span>
            ${memUsage}%
          </span>
        </div>
        ${ramSticks.length > 0 ? ramSticks.map((r, i) => `
        <div class="system-info-item">
          <span class="info-label">插槽 ${i + 1}</span>
          <span class="info-value">${r.manufacturer} ${r.size}${r.type ? ' ' + r.type : ''} @ ${r.speed}</span>
        </div>`).join('') : ''}
      </div>
    </div>

    <!-- GPU -->
    <div class="system-info-card">
      <div class="system-info-header">
        <div class="system-info-icon">
          <span class="material-symbols-rounded">videocam</span>
        </div>
        <h3 class="system-info-title">显卡</h3>
      </div>
      <div class="system-info-items">
        ${gpus.length > 0 ? gpus.map((g, i) => `
        <div class="system-info-item">
          <span class="info-label">GPU ${gpus.length > 1 ? i + 1 : ''}</span>
          <span class="info-value">${g.name}</span>
        </div>
        <div class="system-info-item">
          <span class="info-label">显存</span>
          <span class="info-value-mono">${g.vram}</span>
        </div>
        <div class="system-info-item">
          <span class="info-label">驱动</span>
          <span class="info-value-mono">${g.driver}</span>
        </div>
        `).join('') : `
        <div class="system-info-item">
          <span class="info-label">状态</span>
          <span class="info-value">${hw ? '未检测到' : '检测中...'}</span>
        </div>`}
      </div>
    </div>

    <!-- 主板 -->
    <div class="system-info-card">
      <div class="system-info-header">
        <div class="system-info-icon">
          <span class="material-symbols-rounded">developer_board</span>
        </div>
        <h3 class="system-info-title">主板</h3>
      </div>
      <div class="system-info-items">
        <div class="system-info-item">
          <span class="info-label">型号</span>
          <span class="info-value">${motherboard}</span>
        </div>
      </div>
    </div>

    <!-- 硬盘 -->
    <div class="system-info-card">
      <div class="system-info-header">
        <div class="system-info-icon">
          <span class="material-symbols-rounded">hard_drive</span>
        </div>
        <h3 class="system-info-title">硬盘</h3>
      </div>
      <div class="system-info-items">
        ${disks.length > 0 ? disks.map(d => `
        <div class="system-info-item">
          <span class="info-label">${d.model}</span>
          <span class="info-value-mono">${d.size} (${d.interface})</span>
        </div>
        `).join('') : `
        <div class="system-info-item">
          <span class="info-label">状态</span>
          <span class="info-value">${hw ? '未检测到' : '检测中...'}</span>
        </div>`}
      </div>
    </div>

    ${monitors.length > 0 ? `
    <!-- 显示器 -->
    <div class="system-info-card">
      <div class="system-info-header">
        <div class="system-info-icon">
          <span class="material-symbols-rounded">monitor</span>
        </div>
        <h3 class="system-info-title">显示器</h3>
      </div>
      <div class="system-info-items">
        ${monitors.map((m, i) => `
        <div class="system-info-item">
          <span class="info-label">显示器 ${monitors.length > 1 ? i + 1 : ''}</span>
          <span class="info-value">${m.name}${m.size ? ' (' + m.size + ')' : ''}${m.resolution ? ' ' + m.resolution : ''}${m.connection ? ' [' + m.connection + ']' : ''}</span>
        </div>
        `).join('')}
      </div>
    </div>` : ''}

    <!-- 系统路径 -->
    <div class="system-info-card">
      <div class="system-info-header">
        <div class="system-info-icon">
          <span class="material-symbols-rounded">folder</span>
        </div>
        <h3 class="system-info-title">系统路径</h3>
      </div>
      <div class="system-info-items">
        <div class="system-info-item">
          <span class="info-label">用户目录</span>
          <span class="info-value-mono" title="${system.homeDir}">${truncatePath(system.homeDir)}</span>
        </div>
        <div class="system-info-item">
          <span class="info-label">临时目录</span>
          <span class="info-value-mono" title="${system.tmpDir}">${truncatePath(system.tmpDir)}</span>
        </div>
      </div>
    </div>

    <!-- 已安装工具 -->
    <div class="system-info-card">
      <div class="system-info-header">
        <div class="system-info-icon">
          <span class="material-symbols-rounded">build</span>
        </div>
        <h3 class="system-info-title">已安装工具</h3>
      </div>
      <div class="system-info-items">
        ${Object.entries(environmentData.tools).map(([name, info]) => `
          <div class="system-info-item">
            <span class="info-label">${name}</span>
            <span class="info-value-mono">${info.installed ? (info.version || '已安装') : '未安装'}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  elements.systemInfo.innerHTML = systemInfoHTML;
}

// ─── 工具函数 ────────────────────────────────────────────────
function truncatePath(path, maxLength = 30) {
  if (path.length <= maxLength) return path;
  return '...' + path.slice(-maxLength);
}

// ─── 启动应用 ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
