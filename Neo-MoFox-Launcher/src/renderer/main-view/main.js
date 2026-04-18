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
} from './modules/instances.js';
import { initIconManager } from './modules/icon-manager.js';
import { performAutoUpdateCheck } from './modules/update-checker.js';

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
  
  // 加载实例列表
  await loadInstances();
  
  // 监听实例状态变化（多开实时更新）
  setupInstanceStatusListener();
  
  // 启动系统资源监控（CPU / 内存）
  startSystemMonitor();
  
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

// ─── Instance Actions ─────────────────────────────────────────────────

el.btnAddInstance?.addEventListener('click', () => {
  // 跳转到安装向导
  window.location.href = '../install-wizard/wizard.html';
});

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
  tab.addEventListener('click', (e) => {
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
