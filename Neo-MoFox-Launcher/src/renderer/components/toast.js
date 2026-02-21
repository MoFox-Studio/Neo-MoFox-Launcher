// ═══ Toast 消息提示组件 ═══

/**
 * 显示 Toast 提示消息
 * @param {string} message - 要显示的消息内容
 * @param {string} type - 消息类型: 'info' | 'success' | 'warning' | 'error'
 * @param {number} duration - 显示时长（毫秒），默认 3000
 */
function showToast(message, type = 'info', duration = 3000) {
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
  
  toast.innerHTML = `
    <span class="material-symbols-rounded">${icon}</span>
    <span>${escapeHtml(message)}</span>
  `;
  
  // 添加到页面
  document.body.appendChild(toast);
  
  // 显示动画
  requestAnimationFrame(() => {
    setTimeout(() => toast.classList.add('show'), 10);
  });
  
  // 自动隐藏
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
  
  return toast;
}

/**
 * 显示信息提示
 * @param {string} message - 消息内容
 */
function showInfo(message, duration = 3000) {
  return showToast(message, 'info', duration);
}

/**
 * 显示成功提示
 * @param {string} message - 消息内容
 */
function showSuccess(message, duration = 3000) {
  return showToast(message, 'success', duration);
}

/**
 * 显示警告提示
 * @param {string} message - 消息内容
 */
function showWarning(message, duration = 3000) {
  return showToast(message, 'warning', duration);
}

/**
 * 显示错误提示
 * @param {string} message - 消息内容
 */
function showError(message, duration = 3000) {
  return showToast(message, 'error', duration);
}

// 导出函数（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showToast,
    showInfo,
    showSuccess,
    showWarning,
    showError
  };
}
