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
    <div class="dialog-card md3-dialog" style="max-width: 600px;">
      <div class="dialog-header">
        <h3 class="dialog-title">选择安装方式</h3>
      </div>
      <div class="dialog-content">
        <p class="dialog-message" style="margin-bottom: 24px; color: var(--md-sys-color-on-surface-variant);">
          请选择您希望的实例创建方式：
        </p>
        <div style="display: grid; gap: 16px;">
          <div class="install-option-card" data-option="fresh">
            <div class="option-icon">
              <span class="material-symbols-rounded">construction</span>
            </div>
            <div class="option-content">
              <h4 class="option-title">从头安装</h4>
              <p class="option-description">完整配置一个全新的 Neo-MoFox 实例，适合首次使用或需要自定义配置的用户</p>
            </div>
            <span class="material-symbols-rounded option-arrow">arrow_forward_ios</span>
          </div>
          <div class="install-option-card" data-option="import">
            <div class="option-icon">
              <span class="material-symbols-rounded">package_2</span>
            </div>
            <div class="option-content">
              <h4 class="option-title">从整合包导入</h4>
              <p class="option-description">快速部署预配置的实例，包含插件、配置和数据</p>
            </div>
            <span class="material-symbols-rounded option-arrow">arrow_forward_ios</span>
          </div>
        </div>
      </div>
      <div class="dialog-actions">
        <button class="btn-text dialog-cancel" type="button">取消</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(container);
  
  // 添加样式（如果还没有）
  if (!document.getElementById('install-option-styles')) {
    const style = document.createElement('style');
    style.id = 'install-option-styles';
    style.textContent = `
      .install-option-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 20px;
        background: var(--md-sys-color-surface-variant);
        border: 2px solid transparent;
        border-radius: 16px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .install-option-card:hover {
        background: var(--md-sys-color-surface);
        border-color: var (--md-sys-color-primary);
        transform: translateX(4px);
      }
      .option-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--md-sys-color-primary-container);
        border-radius: 12px;
        flex-shrink: 0;
      }
      .option-icon .material-symbols-rounded {
        font-size: 28px;
        color: var(--md-sys-color-primary);
      }
      .option-content {
        flex: 1;
      }
      .option-title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 4px;
        color: var(--md-sys-color-on-surface);
      }
      .option-description {
        font-size: 13px;
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.4;
      }
      .option-arrow {
        font-size: 20px;
        color: var(--md-sys-color-on-surface-variant);
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);
  }
  
  // 事件处理
  const handleClose = () => {
    container.remove();
  };
  
  const handleSelectOption = (option) => {
    container.remove();
    if (option === 'fresh') {
      window.location.href = '../install-wizard/wizard.html';
    } else if (option === 'import') {
      window.location.href = '../import-wizard/import.html';
    }
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
