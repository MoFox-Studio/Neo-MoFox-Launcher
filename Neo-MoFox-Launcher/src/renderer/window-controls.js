document.addEventListener('DOMContentLoaded', () => {
  const minBtn = document.getElementById('min-btn');
  const maxBtn = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');

  if (minBtn) {
    minBtn.addEventListener('click', () => {
      window.mofoxAPI.windowMinimize();
    });
  }

  if (maxBtn) {
    maxBtn.addEventListener('click', () => {
      window.mofoxAPI.windowMaximize();
    });

    // 监听窗口最大化状态变化，更新按钮图标
    window.mofoxAPI.onWindowMaximizeChanged((isMaximized) => {
      const icon = maxBtn.querySelector('.material-symbols-rounded');
      if (icon) {
        if (isMaximized) {
          icon.textContent = 'fullscreen_exit'; // 还原图标
          maxBtn.title = '还原';
        } else {
          icon.textContent = 'crop_square'; // 最大化图标
          maxBtn.title = '最大化';
        }
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.mofoxAPI.windowClose();
    });
  }
});