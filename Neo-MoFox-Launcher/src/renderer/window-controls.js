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
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.mofoxAPI.windowClose();
    });
  }
});