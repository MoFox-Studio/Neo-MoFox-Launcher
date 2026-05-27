import { el } from './modules/elements.js';
import { updateQuotes } from './modules/quotes.js';
import { applyGreeting } from './modules/greetings.js';
import { initTheme } from '../theme.js';
import { startSystemMonitor } from './modules/system-monitor.js';
import {
  loadInstances,
  createNewInstance,
  saveInstance,
  deleteInstance,
  setupInstanceStatusListener,
  state as instanceState,
} from './modules/instances.js';
import { initIconManager } from './modules/icon-manager.js';
import { performAutoUpdateCheck } from './modules/update-checker.js';
import { 
  initExportTab, 
  onExportTabOpened,
  updateExportProgress,
  addExportOutput,
  onExportComplete 
} from './modules/export-tab.js';

// ─── Initialization ───────────────────────────────────────────────────

async function init() {
  // 检查 API 是否可用
  if (!window.mofoxAPI) {
    console.error('mofoxAPI is not available!');
    await window.customAlert('窗口 API 未加载，请重启应用', '错误');
    return;
  }

  // 应用主题（第一时间执行，避免闪烁）
  await initTheme();

  // 🎉 应用节日/时段问候语
  applyGreeting();

  // 更新名言
  updateQuotes();
  
  // 初始化图标管理器
  initIconManager();
  
  // 初始化导出选项卡
  initExportTab();
  
  // 加载实例列表
  await loadInstances();
  
  // 监听实例状态变化（多开实时更新）
  setupInstanceStatusListener();
  
  // 启动系统资源监控（CPU / 内存）
  startSystemMonitor();
  
  // 🔍 检测平台并显示 Linux NapCat 提示
  checkAndShowLinuxNotice();
  
  // 🔍 自动检查更新（非阻塞）
  // 延迟 2 秒执行，让界面优先完成渲染
  setTimeout(async () => {
    const settings = await window.mofoxAPI.settingsRead();
    performAutoUpdateCheck({
      checkInstances: settings.autoCheckUpdates !== false,
      checkLauncher: settings.autoCheckLauncherUpdates !== false,
    });
  }, 2000);
  
  // 每30秒更新一次名言
  setInterval(updateQuotes, 30000);
}

init();

// ─── Linux NapCat Notice ──────────────────────────────────────────────

/**
 * 检测平台并显示 Linux NapCat 安装提示
 */
async function checkAndShowLinuxNotice() {
  try {
    // 获取平台信息
    const platformInfo = await window.mofoxAPI.getPlatformInfo();
    
    // 检查是否为 Linux 系统
    if (platformInfo && platformInfo.platform === 'linux') {
      // 检查用户是否已经关闭过提示（使用 localStorage）
      const dismissed = localStorage.getItem('dismissedLinuxNapCatNotice') === 'true';
      if (dismissed) {
        console.log('Linux NapCat 提示已被用户关闭');
        return;
      }
      
      // 显示提示
      const noticeElement = document.getElementById('linux-napcat-notice');
      if (noticeElement) {
        noticeElement.style.display = 'block';
        
        // 绑定关闭按钮事件
        const dismissButton = document.getElementById('dismiss-linux-notice');
        if (dismissButton) {
          dismissButton.addEventListener('click', () => {
            // 保存用户关闭状态到 localStorage
            localStorage.setItem('dismissedLinuxNapCatNotice', 'true');
            noticeElement.style.display = 'none';
          });
        }
        
        // 绑定链接点击事件
        const noticeLink = noticeElement.querySelector('.notice-link');
        if (noticeLink) {
          noticeLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.mofoxAPI.openExternal(noticeLink.href);
          });
        }
      }
    }
  } catch (error) {
    console.error('检测平台失败:', error);
  }
}

// ─── Instance Actions ─────────────────────────────────────────────────

el.btnAddInstance?.addEventListener('click', () => {
  // 显示选择对话框：从头安装 或 从整合包导入
  showAddInstanceDialog();
});

// 显示新增实例选择对话框
function showAddInstanceDialog() {
  const container = document.createElement('div');
  container.className = 'dialog-container';
  container.innerHTML = `
    <div class="dialog-backdrop"></div>
    <div class="dialog-card add-instance-dialog">
      <div class="add-instance-header">
        <div class="add-instance-header-icon">
          <span class="material-symbols-rounded">add_circle</span>
        </div>
        <div class="add-instance-header-text">
          <h3 class="dialog-title">新建实例</h3>
          <p class="add-instance-subtitle">选择一种方式来创建你的 Neo-MoFox 实例</p>
        </div>
      </div>
      <div class="add-instance-divider"></div>
      <div class="add-instance-options">
        <div class="install-option-card" data-option="fresh">
          <div class="option-icon">
            <span class="material-symbols-rounded">rocket_launch</span>
          </div>
          <div class="option-content">
            <h4 class="option-title">全新安装</h4>
            <p class="option-description">从零开始配置，完全掌控每一个细节</p>
          </div>
          <span class="material-symbols-rounded option-arrow">chevron_right</span>
        </div>
        <div class="install-option-card" data-option="import">
          <div class="option-icon option-icon--secondary">
            <span class="material-symbols-rounded">inventory_2</span>
          </div>
          <div class="option-content">
            <h4 class="option-title">导入整合包</h4>
            <p class="option-description">一键部署预配置实例，含插件与数据</p>
          </div>
          <span class="material-symbols-rounded option-arrow">chevron_right</span>
        </div>
        <div class="install-option-card" data-option="manual">
          <div class="option-icon option-icon--tertiary">
            <span class="material-symbols-rounded">build</span>
          </div>
          <div class="option-content">
            <h4 class="option-title">手动添加</h4>
            <p class="option-description">填写路径快速添加已有实例（实验性）</p>
          </div>
          <span class="material-symbols-rounded option-arrow">chevron_right</span>
        </div>
      </div>
      <div class="add-instance-footer">
        <button class="add-instance-cancel dialog-cancel" type="button">取消</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(container);
  
  // 添加样式（如果还没有）
  if (!document.getElementById('install-option-styles')) {
    const style = document.createElement('style');
    style.id = 'install-option-styles';
    style.textContent = `
      .add-instance-dialog {
        max-width: 480px;
        width: 90vw;
        border-radius: 16px;
        border: 1px solid var(--md-sys-color-outline-variant, rgba(0,0,0,0.08));
        box-shadow:
          rgba(0,0,0,0.01) 0px 1px 3px,
          rgba(0,0,0,0.02) 0px 3px 7px,
          rgba(0,0,0,0.02) 0px 7px 15px,
          rgba(0,0,0,0.04) 0px 14px 28px,
          rgba(0,0,0,0.05) 0px 23px 52px;
      }
      .add-instance-header {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 28px 28px 20px;
      }
      .add-instance-header-icon {
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--md-sys-color-primary-container, #e3f2fd);
        border-radius: 12px;
        flex-shrink: 0;
      }
      .add-instance-header-icon .material-symbols-rounded {
        font-size: 24px;
        color: var(--md-sys-color-primary, #0075de);
      }
      .add-instance-header-text {
        flex: 1;
      }
      .add-instance-header-text .dialog-title {
        font-size: 1.25rem;
        font-weight: 700;
        letter-spacing: -0.25px;
        margin-bottom: 4px;
      }
      .add-instance-subtitle {
        font-size: 0.875rem;
        color: var(--md-sys-color-on-surface-variant, #615d59);
        margin: 0;
        line-height: 1.4;
      }
      .add-instance-divider {
        height: 1px;
        background: var(--md-sys-color-outline-variant, rgba(0,0,0,0.08));
        margin: 0 28px;
      }
      .add-instance-options {
        display: grid;
        gap: 12px;
        padding: 20px 28px;
      }
      .install-option-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 20px;
        background: var(--md-sys-color-surface-container, rgba(0,0,0,0.03));
        border: 1px solid var(--md-sys-color-outline-variant, rgba(0,0,0,0.06));
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .install-option-card:hover {
        background: var(--md-sys-color-primary-container, #e3f2fd);
        border-color: var(--md-sys-color-primary, #0075de);
        box-shadow: 0 2px 8px rgba(0, 117, 222, 0.08);
        transform: translateY(-1px);
      }
      .install-option-card:active {
        transform: scale(0.98);
        transition-duration: 0.1s;
      }
      .option-icon {
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--md-sys-color-primary-container, #e3f2fd);
        border-radius: 10px;
        flex-shrink: 0;
        transition: all 0.2s ease;
      }
      .install-option-card:hover .option-icon {
        background: var(--md-sys-color-primary, #0075de);
      }
      .option-icon .material-symbols-rounded {
        font-size: 24px;
        color: var(--md-sys-color-primary, #0075de);
        transition: color 0.2s ease;
      }
      .install-option-card:hover .option-icon .material-symbols-rounded {
        color: var(--md-sys-color-on-primary, #ffffff);
      }
      .option-icon--secondary {
        background: var(--md-sys-color-tertiary-container, #f3e8fd);
      }
      .option-icon--secondary .material-symbols-rounded {
        color: var(--md-sys-color-tertiary, #7c4dff);
      }
      .install-option-card:hover .option-icon--secondary {
        background: var(--md-sys-color-tertiary, #7c4dff);
      }
      .install-option-card:hover .option-icon--secondary .material-symbols-rounded {
        color: var(--md-sys-color-on-tertiary, #ffffff);
      }
      .option-icon--tertiary {
        background: rgba(var(--md-sys-color-tertiary-rgb, 124, 77, 255), 0.12);
      }
      .option-icon--tertiary .material-symbols-rounded {
        color: var(--md-sys-color-tertiary, #7c4dff);
      }
      .install-option-card:hover .option-icon--tertiary {
        background: var(--md-sys-color-tertiary, #7c4dff);
      }
      .install-option-card:hover .option-icon--tertiary .material-symbols-rounded {
        color: var(--md-sys-color-on-tertiary, #ffffff);
      }
      .option-content {
        flex: 1;
        min-width: 0;
      }
      .option-title {
        font-size: 15px;
        font-weight: 600;
        margin-bottom: 3px;
        color: var(--md-sys-color-on-surface);
        letter-spacing: -0.01em;
      }
      .option-description {
        font-size: 13px;
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.4;
        margin: 0;
      }
      .option-arrow {
        font-size: 18px;
        color: var(--md-sys-color-on-surface-variant);
        flex-shrink: 0;
        opacity: 0.5;
        transition: all 0.2s ease;
      }
      .install-option-card:hover .option-arrow {
        opacity: 1;
        color: var(--md-sys-color-primary, #0075de);
        transform: translateX(2px);
      }
      .add-instance-footer {
        display: flex;
        justify-content: flex-end;
        padding: 12px 28px 24px;
      }
      .add-instance-cancel {
        padding: 8px 20px;
        border: none;
        background: transparent;
        color: var(--md-sys-color-on-surface-variant, #615d59);
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .add-instance-cancel:hover {
        background: var(--md-sys-color-surface-container, rgba(0,0,0,0.04));
        color: var(--md-sys-color-on-surface);
      }
      .add-instance-cancel:active {
        transform: scale(0.96);
      }
    `;
    document.head.appendChild(style);
  }
  
  // 事件处理
  const handleClose = () => {
    container.style.opacity = '0';
    container.querySelector('.add-instance-dialog').style.transform = 'scale(0.96) translateY(8px)';
    container.querySelector('.add-instance-dialog').style.opacity = '0';
    setTimeout(() => container.remove(), 200);
  };
  
  const handleSelectOption = (option) => {
    // 添加选中动画
    const selectedCard = container.querySelector(`[data-option="${option}"]`);
    if (selectedCard) {
      selectedCard.style.transform = 'scale(0.97)';
      selectedCard.style.opacity = '0.7';
    }
    setTimeout(() => {
      container.remove();
      if (option === 'fresh') {
        window.location.href = '../install-wizard/wizard.html';
      } else if (option === 'import') {
        window.location.href = '../import-wizard/import.html';
      } else if (option === 'manual') {
        openManualAddInstanceDialog();
      }
    }, 150);
  };
  
  // 绑定事件
  container.querySelector('.dialog-cancel').addEventListener('click', handleClose);
  container.querySelector('.dialog-backdrop').addEventListener('click', handleClose);
  
  container.querySelectorAll('.install-option-card').forEach(card => {
    card.addEventListener('click', () => {
      const option = card.dataset.option;
      handleSelectOption(option);
    });
  });
  
  // ESC 键关闭
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      handleClose();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}

// ─── 🧪 手动添加实例对话框 ────────────────────────────────────────────
function openManualAddInstanceDialog() {
  // 创建对话框容器
  const dialogOverlay = document.createElement('div');
  dialogOverlay.className = 'dialog-overlay';
  dialogOverlay.innerHTML = `
    <div class="dialog-backdrop" id="manual-instance-backdrop"></div>
    <div class="dialog-card manual-instance-dialog">
      <div class="dialog-header">
        <h3 class="dialog-title">
          <span class="material-symbols-rounded">science</span>
          手动添加实例 (实验性)
        </h3>
        <button class="dialog-close-btn" id="manual-instance-close">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="dialog-content manual-instance-content">
        <div class="form-warning">
          <span class="material-symbols-rounded">info</span>
          <span>填写实例路径信息即可添加，其他配置项将使用默认值。</span>
        </div>
        
        <div class="form-group">
          <label class="form-label">
            <span class="material-symbols-rounded">label</span>
            显示名称
          </label>
          <input type="text" class="form-input" id="instance-display-name" placeholder="例如: 我的机器人">
          <span class="form-hint">实例的显示名称（可选）</span>
        </div>

        <div class="form-group">
          <label class="form-label">
            <span class="material-symbols-rounded">folder</span>
            Neo-MoFox 目录 *
          </label>
          <div class="path-input-group">
            <input type="text" class="form-input" id="instance-neomofox-dir" placeholder="例如: D:\\Bots\\MyBot\\neo-mofox" required>
            <button class="md3-btn md3-btn-tonal" id="browse-neomofox-dir">
              <span class="material-symbols-rounded">folder_open</span>
            </button>
          </div>
          <span class="form-hint">Neo-MoFox 项目的根目录（将自动检测 Git 分支作为频道）</span>
        </div>

        <div class="form-group">
          <label class="form-label">
            <span class="material-symbols-rounded">folder</span>
            NapCat 目录
          </label>
          <div class="path-input-group">
            <input type="text" class="form-input" id="instance-napcat-dir" placeholder="例如: D:\\Bots\\MyBot\\napcat">
            <button class="md3-btn md3-btn-tonal" id="browse-napcat-dir">
              <span class="material-symbols-rounded">folder_open</span>
            </button>
          </div>
          <span class="form-hint">NapCat 目录（可选）</span>
        </div>

        <div class="form-group">
          <label class="form-label">
            <span class="material-symbols-rounded">tag</span>
            NapCat 版本
          </label>
          <input type="text" class="form-input" id="instance-napcat-version" placeholder="例如: 1.0.0">
          <span class="form-hint">NapCat 版本号（可选）</span>
        </div>

        <div class="form-group">
          <label class="form-label">
            <span class="material-symbols-rounded">description</span>
            备注
          </label>
          <textarea class="form-input" id="instance-description" rows="2" placeholder="关于此实例的补充说明..."></textarea>
        </div>

      </div>
      <div class="dialog-actions">
        <button class="md3-btn md3-btn-text" id="manual-instance-cancel">
          <span>取消</span>
        </button>
        <button class="md3-btn md3-btn-filled" id="manual-instance-confirm">
          <span class="material-symbols-rounded">add_circle</span>
          <span>添加实例</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dialogOverlay);

  // 添加对话框样式（如果还没有）
  if (!document.getElementById('manual-instance-styles')) {
    const style = document.createElement('style');
    style.id = 'manual-instance-styles';
    style.textContent = `
      .dialog-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .manual-instance-dialog {
        width: 90%;
        max-width: 680px;
        max-height: 85vh;
        background: var(--md-sys-color-surface-container);
        border-radius: 24px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
        display: flex;
        flex-direction: column;
        z-index: 10001;
        animation: dialogSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        overflow: hidden;
      }
      @keyframes dialogSlideIn {
        from { opacity: 0; transform: scale(0.9) translateY(20px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      .manual-instance-dialog .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid var(--md-sys-color-outline-variant);
        background: var(--md-sys-color-surface-container-high);
      }
      .manual-instance-dialog .dialog-title {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 1.25rem;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
        margin: 0;
      }
      .manual-instance-dialog .dialog-title .material-symbols-rounded {
        font-size: 24px;
        color: var(--md-sys-color-tertiary);
      }
      .dialog-close-btn {
        width: 40px;
        height: 40px;
        border: none;
        background: transparent;
        color: var(--md-sys-color-on-surface-variant);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.2s, color 0.2s;
      }
      .dialog-close-btn:hover {
        background: var(--md-sys-color-surface-container-highest);
        color: var(--md-sys-color-on-surface);
      }
      .manual-instance-dialog .manual-instance-content {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
      }
      .manual-instance-dialog .dialog-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        padding: 16px 24px;
        border-top: 1px solid var(--md-sys-color-outline-variant);
        background: var(--md-sys-color-surface-container-high);
      }
      .form-warning {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 16px;
        background: rgba(var(--md-sys-color-tertiary-rgb), 0.1);
        border-left: 4px solid var(--md-sys-color-tertiary);
        border-radius: 8px;
        margin-bottom: 24px;
        font-size: 0.875rem;
        line-height: 1.5;
        color: var(--md-sys-color-on-surface);
      }
      .form-warning .material-symbols-rounded {
        font-size: 20px;
        color: var(--md-sys-color-tertiary);
        flex-shrink: 0;
        margin-top: 2px;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;
      }
      .form-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
      }
      .form-label .material-symbols-rounded {
        font-size: 18px;
        color: var(--md-sys-color-primary);
      }
      .form-input {
        padding: 12px 16px;
        border: 1px solid var(--md-sys-color-outline);
        border-radius: 8px;
        background: var(--md-sys-color-surface);
        color: var(--md-sys-color-on-surface);
        font-size: 0.875rem;
        font-family: inherit;
        transition: border-color 0.2s, box-shadow 0.2s;
        outline: none;
      }
      .form-input:focus {
        border-color: var(--md-sys-color-primary);
        box-shadow: 0 0 0 2px rgba(var(--md-sys-color-primary-rgb), 0.2);
      }
      .form-input::placeholder {
        color: var(--md-sys-color-on-surface-variant);
        opacity: 0.6;
      }
      textarea.form-input {
        resize: vertical;
        min-height: 60px;
        font-family: inherit;
      }
      .form-hint {
        font-size: 0.75rem;
        color: var(--md-sys-color-on-surface-variant);
        margin-top: -4px;
      }
      .path-input-group {
        display: flex;
        gap: 8px;
      }
      .path-input-group .form-input {
        flex: 1;
      }
      .path-input-group .md3-btn {
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);
  }

  // 获取元素
  const backdrop = dialogOverlay.querySelector('#manual-instance-backdrop');
  const closeBtn = dialogOverlay.querySelector('#manual-instance-close');
  const cancelBtn = dialogOverlay.querySelector('#manual-instance-cancel');
  const confirmBtn = dialogOverlay.querySelector('#manual-instance-confirm');

  const displayNameInput = dialogOverlay.querySelector('#instance-display-name');
  const neomofoxDirInput = dialogOverlay.querySelector('#instance-neomofox-dir');
  const napcatDirInput = dialogOverlay.querySelector('#instance-napcat-dir');
  const napcatVersionInput = dialogOverlay.querySelector('#instance-napcat-version');
  const descInput = dialogOverlay.querySelector('#instance-description');

  const browseNeomofoxDirBtn = dialogOverlay.querySelector('#browse-neomofox-dir');
  const browseNapcatDirBtn = dialogOverlay.querySelector('#browse-napcat-dir');

  // Linux 下禁用 NapCat 相关字段
  (async () => {
    try {
      const platformInfo = await window.mofoxAPI.getPlatformInfo();
      if (platformInfo && platformInfo.platform === 'linux') {
        napcatDirInput.disabled = true;
        napcatDirInput.placeholder = 'Linux 系统不支持此选项';
        browseNapcatDirBtn.disabled = true;
        const napcatDirGroup = napcatDirInput.closest('.form-group');
        if (napcatDirGroup) {
          napcatDirGroup.style.opacity = '0.5';
          const hint = napcatDirGroup.querySelector('.form-hint');
          if (hint) hint.textContent = 'Linux 系统下无需配置 NapCat 目录';
        }

        napcatVersionInput.disabled = true;
        napcatVersionInput.placeholder = 'Linux 系统不支持此选项';
        const napcatVersionGroup = napcatVersionInput.closest('.form-group');
        if (napcatVersionGroup) {
          napcatVersionGroup.style.opacity = '0.5';
          const hint = napcatVersionGroup.querySelector('.form-hint');
          if (hint) hint.textContent = 'Linux 系统下无需配置 NapCat 版本';
        }
      }
    } catch (e) {
      console.warn('[main] 获取平台信息失败', e);
    }
  })();

  // 关闭对话框
  const closeDialog = () => {
    dialogOverlay.remove();
  };

  backdrop.addEventListener('click', closeDialog);
  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);

  // 浏览 Neo-MoFox 目录
  browseNeomofoxDirBtn.addEventListener('click', async () => {
    const currentPath = neomofoxDirInput.value.trim();
    const selected = await window.mofoxAPI.selectDirectory({
      title: '选择 Neo-MoFox 项目目录',
      defaultPath: currentPath || undefined,
    });
    if (selected) {
      neomofoxDirInput.value = selected;
    }
  });

  // 浏览 NapCat 目录
  browseNapcatDirBtn.addEventListener('click', async () => {
    const currentPath = napcatDirInput.value.trim();
    const selected = await window.mofoxAPI.selectDirectory({
      title: '选择 NapCat 目录',
      defaultPath: currentPath || undefined,
    });
    if (selected) napcatDirInput.value = selected;
  });

  // 确认添加
  confirmBtn.addEventListener('click', async () => {
    const neomofoxDir = neomofoxDirInput.value.trim();

    // 验证必填字段
    if (!neomofoxDir) {
      await window.customAlert('请填写 Neo-MoFox 目录路径', '信息不完整');
      return;
    }

    // 在保存前检测 Git 信息
    const gitInfo = await window.mofoxAPI.getGitInfo(neomofoxDir);
    if (!gitInfo.success) {
      const confirmed = await window.customConfirm(
        `无法获取 Git 信息：${gitInfo.error || '未知错误'}\n\n这可能导致实例频道设置为默认值 'dev'。\n\n是否继续添加？`,
        'Git 信息获取失败'
      );
      if (!confirmed) return;
    }

    // 构建实例配置
    const instanceConfig = {
      qqNumber: '114514',
      ownerQQNumber: '114514',
      apiKey: '114514',
      wsPort: 8080,
      neomofoxDir,
      napcatDir: napcatDirInput.value.trim() || null,
      napcatVersion: napcatVersionInput.value.trim() || null,
      displayName: displayNameInput.value.trim() || null,
      description: descInput.value.trim() || null,
    };

    try {
      const result = await window.mofoxAPI.manualAddInstance(instanceConfig);

      if (result.success) {
        const channelInfo = result.channel ? `\n频道: ${result.channel}` : '';
        await window.customAlert(
          `实例已成功添加！\n\n实例 ID: ${result.instanceId}${channelInfo}\n\n实例列表将自动刷新。`,
          '添加成功'
        );
        closeDialog();
        // 刷新实例列表
        await loadInstances();
      } else {
        await window.customAlert(
          result.error || '添加实例失败，请检查配置信息',
          '添加失败'
        );
      }
    } catch (e) {
      console.error('[main] 手动添加实例失败', e);
      await window.customAlert('添加实例时发生错误，请查看日志', '错误');
    }
  });

  // 聚焦到第一个输入框
  setTimeout(() => displayNameInput.focus(), 100);
}

// 环境管理和设置导航已移至悬浮底栏组件 (floating-nav.js)

// ─── Edit Instance Modal ──────────────────────────────────────────────

el.btnCloseEditModal.addEventListener('click', () => {
  el.editInstanceModal.classList.add('hidden');
});

el.btnCancelEdit.addEventListener('click', () => {
  el.editInstanceModal.classList.add('hidden');
});

el.btnSaveInstance.addEventListener('click', saveInstance);

el.btnDeleteInstance.addEventListener('click', deleteInstance);

// 点击模态框背景关闭
el.editInstanceModal.addEventListener('click', (e) => {
  if (e.target === el.editInstanceModal) {
    el.editInstanceModal.classList.add('hidden');
  }
});

// 编辑实例模态框 - 选项卡切换逻辑
document.querySelectorAll('#edit-instance-sidebar .sidebar-tab').forEach(tab => {
  tab.addEventListener('click', async (e) => {
    // 切换 Tab active 状态
    document.querySelectorAll('#edit-instance-sidebar .sidebar-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // 切换内容区域
    const targetId = 'tab-' + tab.dataset.tab;
    document.querySelectorAll('#edit-instance-content .tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });
    
    const targetPane = document.getElementById(targetId);
    if (targetPane) {
      targetPane.classList.add('active');
    }
    
    // 如果是导出选项卡，加载插件列表
    if (tab.dataset.tab === 'export') {
      const instanceId = instanceState.currentEditingInstance;
      if (instanceId) {
        await onExportTabOpened(instanceId);
      }
    }
  });
});

// ─── 🧲 Ctrl+Shift+M 开发者致谢面板彩蛋 ─────────────────────────────────

function initCreditsPanel() {
  const overlay = document.getElementById('credits-overlay');
  if (!overlay) return;

  // 填充运行环境信息
  const runtimeEl = document.getElementById('credits-runtime');
  if (runtimeEl) {
    const platform = navigator.platform || 'Unknown';
    const lang = navigator.language || 'Unknown';
    runtimeEl.textContent = `${platform} · ${lang}`;
  }

  // 填充当前时间作为「会话开始时间」
  const buildTimeEl = document.getElementById('credits-build-time');
  if (buildTimeEl) {
    buildTimeEl.textContent = new Date().toLocaleString('zh-CN');
  }

  function toggleCredits() {
    overlay.classList.toggle('hidden');
  }

  // Ctrl+Shift+M 触发
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      toggleCredits();
    }
    // Esc 关闭
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      overlay.classList.add('hidden');
    }
  });

  // 点击遮罩层关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.add('hidden');
    }
  });
}

initCreditsPanel();
