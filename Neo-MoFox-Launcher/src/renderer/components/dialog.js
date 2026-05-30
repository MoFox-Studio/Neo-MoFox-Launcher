/**
 * Custom Dialog System - MD3 Style
 * 替代原生对话框，避免 Electron 中的焦点丢失问题
 */

class CustomDialog {
  constructor() {
    this.container = null;
    this._initialized = false;
  }

  _ensureInit() {
    if (this._initialized) return;
    if (!document.body) return;
    
    // 创建对话框容器
    this.container = document.createElement('div');
    this.container.id = 'custom-dialog-container';
    this.container.className = 'dialog-container hidden';
    document.body.appendChild(this.container);
    this._initialized = true;
  }

  /**
   * 显示确认对话框 (替代 window.confirm)
   */
  confirm(message, title = '确认') {
    return new Promise((resolve) => {
      this._ensureInit();
      this.container.innerHTML = `
        <div class="dialog-backdrop"></div>
        <div class="dialog-card md3-dialog">
          <div class="dialog-header">
            <h3 class="dialog-title">${this._escapeHtml(title)}</h3>
          </div>
          <div class="dialog-content">
            <p class="dialog-message">${this._escapeHtml(message)}</p>
          </div>
          <div class="dialog-actions">
            <button class="btn-text dialog-cancel" type="button">
              取消
            </button>
            <button class="btn-text dialog-confirm" type="button">
              确定
            </button>
          </div>
        </div>
      `;

      this.container.classList.remove('hidden');
      
      // 聚焦到确定按钮
      setTimeout(() => {
        const confirmBtn = this.container.querySelector('.dialog-confirm');
        confirmBtn?.focus();
      }, 100);

      const handleConfirm = () => {
        this.hide();
        resolve(true);
      };

      const handleCancel = () => {
        this.hide();
        resolve(false);
      };

      // 绑定按钮事件
      this.container.querySelector('.dialog-confirm').addEventListener('click', handleConfirm);
      this.container.querySelector('.dialog-cancel').addEventListener('click', handleCancel);
      
      // ESC 键取消
      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          handleCancel();
          document.removeEventListener('keydown', handleEsc);
        }
      };
      document.addEventListener('keydown', handleEsc);

      // 点击背景关闭
      this.container.querySelector('.dialog-backdrop').addEventListener('click', handleCancel);
    });
  }

  /**
   * 显示提示对话框 (替代 window.alert)
   */
  alert(message, title = '提示') {
    return new Promise((resolve) => {
      this._ensureInit();
      this.container.innerHTML = `
        <div class="dialog-backdrop"></div>
        <div class="dialog-card md3-dialog">
          <div class="dialog-header">
            <h3 class="dialog-title">${this._escapeHtml(title)}</h3>
          </div>
          <div class="dialog-content">
            <p class="dialog-message">${this._escapeHtml(message)}</p>
          </div>
          <div class="dialog-actions">
            <button class="btn-text dialog-confirm" type="button">
              确定
            </button>
          </div>
        </div>
      `;

      this.container.classList.remove('hidden');
      
      // 聚焦到确定按钮
      setTimeout(() => {
        const confirmBtn = this.container.querySelector('.dialog-confirm');
        confirmBtn?.focus();
      }, 100);

      const handleConfirm = () => {
        this.hide();
        resolve(true);
      };

      // 绑定按钮事件
      this.container.querySelector('.dialog-confirm').addEventListener('click', handleConfirm);
      
      // ESC 键或 Enter 键关闭
      const handleKey = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') {
          handleConfirm();
          document.removeEventListener('keydown', handleKey);
        }
      };
      document.addEventListener('keydown', handleKey);

      // 点击背景关闭
      this.container.querySelector('.dialog-backdrop').addEventListener('click', handleConfirm);
    });
  }

  /**
   * 显示多选项对话框
   * @param {string} message - 提示信息
   * @param {string} title - 标题
   * @param {Array<{label: string, value: string, variant?: string}>} options - 选项列表
   *   variant: 'filled' | 'tonal' | 'text'（默认 'text'）
   * @returns {Promise<string|null>} 用户选择的 value，取消返回 null
   */
  choice(message, title = '请选择', options = []) {
    return new Promise((resolve) => {
      this._ensureInit();

      const buttonsHtml = options.map(opt => {
        const cls = opt.variant === 'filled' ? 'btn-filled'
          : opt.variant === 'tonal' ? 'btn-tonal'
          : 'btn-text';
        return `<button class="${cls} dialog-choice-btn" type="button" data-value="${this._escapeHtml(opt.value)}">${this._escapeHtml(opt.label)}</button>`;
      }).join('\n');

      this.container.innerHTML = `
        <div class="dialog-backdrop"></div>
        <div class="dialog-card md3-dialog">
          <div class="dialog-header">
            <h3 class="dialog-title">${this._escapeHtml(title)}</h3>
          </div>
          <div class="dialog-content">
            <p class="dialog-message">${this._escapeHtml(message)}</p>
          </div>
          <div class="dialog-actions">
            <button class="btn-text dialog-cancel" type="button">取消</button>
            ${buttonsHtml}
          </div>
        </div>
      `;

      this.container.classList.remove('hidden');

      const handleCancel = () => {
        this.hide();
        resolve(null);
      };

      // 绑定选项按钮
      this.container.querySelectorAll('.dialog-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const value = btn.getAttribute('data-value');
          this.hide();
          resolve(value);
        });
      });

      // 取消按钮
      this.container.querySelector('.dialog-cancel').addEventListener('click', handleCancel);

      // ESC 键取消
      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          handleCancel();
          document.removeEventListener('keydown', handleEsc);
        }
      };
      document.addEventListener('keydown', handleEsc);

      // 点击背景关闭
      this.container.querySelector('.dialog-backdrop').addEventListener('click', handleCancel);
    });
  }

  hide() {
    this.container.classList.add('hidden');
    // 延迟清空内容，等待动画完成
    setTimeout(() => {
      this.container.innerHTML = '';
    }, 300);
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// ─── 全局实例 ──────────────────────────────────────────────────────────

const customDialog = new CustomDialog();

// 覆盖原生方法（可选）
window.customConfirm = (message, title) => customDialog.confirm(message, title);
window.customAlert = (message, title) => customDialog.alert(message, title);

// 导出
window.customDialog = customDialog;
