import { el } from './modules/elements.js';
import { updateQuotes } from './modules/quotes.js';
import { initTheme } from '../theme.js';
import {
  loadInstances,
  createNewInstance,
  saveInstance,
  deleteInstance,
} from './modules/instances.js';

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

  // 更新名言
  updateQuotes();
  
  // 加载实例列表
  await loadInstances();
  
  // 每30秒更新一次名言
  setInterval(updateQuotes, 30000);
}

init();

// ─── Instance Actions ─────────────────────────────────────────────────

el.btnAddInstance?.addEventListener('click', () => {
  // 跳转到安装向导
  window.location.href = '../install-wizard/wizard.html';
});

// 环境管理 → 环境管理页
document.getElementById('btn-open-environment')
  ?.addEventListener('click', () => {
    window.location.href = '../environment-view/index.html';
  });

// 设置 → 设置页
(el.btnOpenSettings ?? document.getElementById('btn-open-settings'))
  ?.addEventListener('click', () => {
    window.location.href = '../settings-view/settings.html';
  });

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
