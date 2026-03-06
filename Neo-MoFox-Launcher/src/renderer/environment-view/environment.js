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

  const currentPlatform = environmentData.system?.platform || 'win32';
  const toolsHTML = recommendedTools
    .filter(tool => !tool.platforms || tool.platforms.includes(currentPlatform))
    .map(tool => {
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

  const dashboardHTML = `
    <div class="system-dashboard">
      <!-- 1. System Overview (Full Width) -->
      <div class="sys-overview-card">
        <div style="display:flex; align-items:center;">
            <div class="sys-overview-icon">
                <span class="material-symbols-rounded" style="font-size: 32px;">computer</span>
            </div>
            <div class="sys-overview-section">
                <div class="sys-overview-label">操作系统</div>
                <div class="sys-overview-val-large">${osName}</div>
            </div>
        </div>
        
        <div style="display:flex; gap: 48px;">
            <div class="sys-overview-section">
                <div class="sys-overview-label">版本号</div>
                <div class="sys-overview-val-mono">${osVersion}</div>
            </div>
            <div class="sys-overview-section">
                <div class="sys-overview-label">架构</div>
                <div class="sys-overview-val-mono">${osArch}</div>
            </div>
            <div class="sys-overview-section">
                <div class="sys-overview-label">主机名</div>
                <div class="sys-overview-val-mono">${hostname}</div>
            </div>
        </div>
      </div>

      <!-- 2. Processor -->
      <div class="sys-card sys-card-cpu">
        <div class="sys-card-header">
           <div class="sys-card-icon"><span class="material-symbols-rounded">memory</span></div>
           <div class="sys-card-title">处理器</div>
        </div>
        <div class="sys-card-content">
            <div class="sys-big-text-right">${cpuModel}</div>
            <div class="sys-detail-row">
                <span class="sys-label">核心规格</span>
                <span class="sys-value-mono">${cpuCores} 物理核 / ${cpuLogical} 逻辑核</span>
            </div>
             <div class="sys-detail-row">
                <span class="sys-label">基准频率</span>
                <span class="sys-value-mono">${cpuSpeed}</span>
            </div>
        </div>
      </div>

      <!-- 3. Memory -->
      <div class="sys-card sys-card-mem">
        <div class="sys-card-header">
           <div class="sys-card-icon"><span class="material-symbols-rounded">memory_alt</span></div>
           <div class="sys-card-title">内存资源</div>
        </div>
        <div class="sys-card-content">
             <div class="sys-detail-row" style="border:none;">
                 <span class="sys-label">总量</span>
                 <span class="sys-big-text-stat">${totalMem}</span>
             </div>
             
             <div class="sys-detail-row" style="border:none; margin-bottom:0; padding-bottom:0; justify-content: flex-start; gap: 8px; margin-top: auto;">
                 <span class="sys-label">使用情况</span>
                 <span style="flex:1"></span>
                 <span class="sys-value-mono">${memUsage}%</span>
             </div>
             <div class="mem-progress">
                <div class="mem-progress-bar" style="width: ${memUsage}%"></div>
             </div>
             <div class="sys-detail-row" style="border:none; padding-top:0;">
                <span style="flex:1"></span>
                <span class="sys-value-mono" style="font-size: 11px; opacity: 0.7;">${usedMem} 已用 / ${freeMem} 可用</span>
             </div>
        </div>
      </div>

      <!-- 4. GPU -->
      <div class="sys-card sys-card-gpu">
         <div class="sys-card-header">
           <div class="sys-card-icon"><span class="material-symbols-rounded">videocam</span></div>
           <div class="sys-card-title">显卡</div>
        </div>
        <div class="sys-card-content">
            ${gpus.length > 0 ? `
              <div class="sys-value" style="font-size: 14px; margin-bottom: 8px;">${gpus[0].name}</div>
              <div style="flex:1; border-bottom: 1px dashed var(--md-sys-color-outline-variant); margin-bottom: 8px;"></div>
              <div class="sys-detail-row" style="border:none;">
                  <span class="sys-label">显存</span>
                  <span class="sys-value-mono">${gpus[0].vram}</span>
              </div>
            ` : '<div class="sys-value">未检测到显卡</div>'}
        </div>
      </div>

      <!-- 5. Storage -->
      <div class="sys-card sys-card-storage">
         <div class="sys-card-header">
           <div class="sys-card-icon"><span class="material-symbols-rounded">hard_drive</span></div>
           <div class="sys-card-title">存储设备</div>
        </div>
        <div class="storage-list">
             ${disks.length > 0 ? disks.map(d => `
                <div class="storage-item">
                    <span class="sys-value" style="font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 120px;" title="${d.model}">${d.model}</span>
                    <span class="sys-value-mono" style="font-size:11px;">${d.size}</span>
                </div>
             `).join('') : '<div>未检测到硬盘</div>'}
        </div>
      </div>

      <!-- 6. Motherboard/Other -->
       <div class="sys-card sys-card-mobo">
         <div class="sys-card-header">
           <div class="sys-card-icon"><span class="material-symbols-rounded">developer_board</span></div>
           <div class="sys-card-title">主板/其他</div>
        </div>
        <div class="sys-card-content">
             <div class="sys-detail-row">
                <span class="sys-label">主板型号</span>
             </div>
             <div class="sys-value" style="text-align:right; margin-bottom: 12px; font-size: 12px;">${motherboard}</div>
             
             <div class="sys-detail-row">
                <span class="sys-label">运行时长</span>
                <span class="sys-value-mono">${uptime}</span>
             </div>
        </div>
      </div>

      <!-- 7. Display -->
       <div class="sys-card sys-card-display">
         <div class="sys-card-header">
           <div class="sys-card-icon"><span class="material-symbols-rounded">monitor</span></div>
           <div class="sys-card-title">显示器</div>
        </div>
        <div class="sys-card-content">
             ${monitors.length > 0 ? monitors.map(m => `
                 <div class="sys-detail-row">
                    <span class="sys-value">${m.name}</span>
                    <span class="sys-value-mono">${m.resolution} @ ${m.refreshRate || '?Hz'}</span>
                 </div>
             `).join('') : '<div>未检测到显示器</div>'}
        </div>
      </div>

      <!-- 8. Key Paths -->
       <div class="sys-card sys-card-paths">
         <div class="sys-card-header">
           <div class="sys-card-icon"><span class="material-symbols-rounded">folder</span></div>
           <div class="sys-card-title">关键路径</div>
        </div>
        <div class="sys-card-content">
            <div class="sys-detail-row">
                <span class="sys-label">用户目录</span>
                <span class="sys-value-mono" style="font-size: 11px; max-width: 150px; overflow:hidden; text-overflow:ellipsis;" title="${system.homeDir}">${truncatePath(system.homeDir)}</span>
            </div>
             <div class="sys-detail-row">
                <span class="sys-label">临时目录</span>
                <span class="sys-value-mono" style="font-size: 11px; max-width: 150px; overflow:hidden; text-overflow:ellipsis;" title="${system.tmpDir}">${truncatePath(system.tmpDir)}</span>
            </div>
        </div>
      </div>
    </div>
  `;

  elements.systemInfo.innerHTML = dashboardHTML;
}

// ─── 工具函数 ────────────────────────────────────────────────
function truncatePath(path, maxLength = 30) {
  if (path.length <= maxLength) return path;
  return '...' + path.slice(-maxLength);
}

// ─── 启动应用 ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
