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
  
  // 🔍 自动检查所有实例的更新（非阻塞）
  // 延迟 2 秒执行，让界面优先完成渲染
  setTimeout(async () => {
    // 读取设置，检查是否启用自动更新检查
    const settings = await window.mofoxAPI.settingsRead();
    if (settings.autoCheckUpdates !== false) {
      performAutoUpdateCheck();
    } else {
      console.log('⏭️  已跳过自动更新检查（设置已禁用）');
    }
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
