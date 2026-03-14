// ═══ Toast 消息提示组件 ═══

/**
 * 显示 Toast 提示消息
 * @param {string} message - 要显示的消息内容
 * @param {string} type - 消息类型: 'info' | 'success' | 'warning' | 'error'
 * @param {number} duration - 显示时长（毫秒），默认 3000，设为 0 则不自动关闭
 * @param {Object} options - 额外选项
 * @param {string} options.actionText - 动作按钮文本
 * @param {Function} options.onAction - 动作按钮点击回调
 * @param {boolean} options.dismissible - 是否可手动关闭（默认 true）
 */
function showToast(message, type = 'info', duration = 3000, options = {}) {
  // 创建 toast 元素
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // 确定图标
  const icons = {
    info: 'info',
    success: 'check_circle',
    warning: 'warning',
    error: 'error'
  };
  
  const icon = icons[type] || 'info';
  
  // 转义 HTML 以防止 XSS
  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };
  
  // 构建 HTML
  let html = `
    <span class="material-symbols-rounded toast-icon">${icon}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;
  
  // 添加动作按钮
  if (options.actionText && options.onAction) {
    html += `<button class="toast-action">${escapeHtml(options.actionText)}</button>`;
  }
  
  // 添加关闭按钮（如果可关闭）
  if (options.dismissible !== false) {
    html += `<button class="toast-close" aria-label="关闭"><span class="material-symbols-rounded">close</span></button>`;
  }
  
  toast.innerHTML = html;
  
  // 绑定动作按钮事件
  if (options.actionText && options.onAction) {
    const actionBtn = toast.querySelector('.toast-action');
    actionBtn.addEventListener('click', () => {
      options.onAction();
      dismissToast(toast);
    });
  }
  
  // 绑定关闭按钮事件
  if (options.dismissible !== false) {
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => dismissToast(toast));
  }
  
  // 添加到页面
  document.body.appendChild(toast);
  
  // 显示动画
  requestAnimationFrame(() => {
    setTimeout(() => toast.classList.add('show'), 10);
  });
  
  // 自动隐藏（如果设置了 duration > 0）
  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }
  
  return toast;
}

/**
 * 关闭 Toast
 * @param {HTMLElement} toast - Toast 元素
 */
function dismissToast(toast) {
  if (!toast || !toast.parentElement) return;
  toast.classList.remove('show');
  setTimeout(() => toast.remove(), 300);
}

/**
 * 显示信息提示
 * @param {string} message - 消息内容
 * @param {number} duration - 显示时长
 * @param {Object} options - 额外选项
 */
function showInfo(message, duration = 3000, options = {}) {
  return showToast(message, 'info', duration, options);
}

/**
 * 显示成功提示
 * @param {string} message - 消息内容
 * @param {number} duration - 显示时长
 * @param {Object} options - 额外选项
 */
function showSuccess(message, duration = 3000, options = {}) {
  return showToast(message, 'success', duration, options);
}

/**
 * 显示警告提示
 * @param {string} message - 消息内容
 * @param {number} duration - 显示时长
 * @param {Object} options - 额外选项
 */
function showWarning(message, duration = 3000, options = {}) {
  return showToast(message, 'warning', duration, options);
}

/**
 * 显示错误提示
 * @param {string} message - 消息内容
 * @param {number} duration - 显示时长
 * @param {Object} options - 额外选项
 */
function showError(message, duration = 3000, options = {}) {
  return showToast(message, 'error', duration, options);
}

// 导出函数（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showToast,
    dismissToast,
    showInfo,
    showSuccess,
    showWarning,
    showError
  };
}
