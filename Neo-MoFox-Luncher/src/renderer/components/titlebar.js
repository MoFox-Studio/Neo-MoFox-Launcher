/**
 * Custom Titlebar Component
 * 可复用的自定义窗口标题栏
 */

class CustomTitlebar {
  constructor() {
    this.initElements();
    this.attachEventListeners();
  }

  /**
   * 初始化 DOM 元素
   */
  initElements() {
    this.btnMinimize = document.getElementById('btn-minimize');
    this.btnMaximize = document.getElementById('btn-maximize');
    this.btnClose = document.getElementById('btn-close');
  }

  /**
   * 绑定事件监听器
   */
  attachEventListeners() {
    // 最小化按钮
    this.btnMinimize?.addEventListener('click', () => {
      console.log('Minimize clicked');
      window.mofoxAPI?.windowMinimize();
    });

    // 最大化/还原按钮
    this.btnMaximize?.addEventListener('click', () => {
      console.log('Maximize clicked');
      window.mofoxAPI?.windowMaximize();
    });

    // 关闭按钮
    this.btnClose?.addEventListener('click', () => {
      console.log('Close clicked');
      window.mofoxAPI?.windowClose();
    });
  }
}

// ─── 自动初始化 ──────────────────────────────────────────────────────

// DOM 加载完成后自动初始化标题栏
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new CustomTitlebar();
  });
} else {
  new CustomTitlebar();
}

// 导出供外部使用（可选）
window.CustomTitlebar = CustomTitlebar;
