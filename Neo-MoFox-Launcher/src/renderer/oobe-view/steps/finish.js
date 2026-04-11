/**
 * OOBE 步骤 6: 完成
 */

export async function renderFinishStep(container, stepManager) {
  // 获取配置总结
  const config = stepManager.config;

  // 生成配置摘要项
  const summaryItems = [
    {
      icon: 'folder',
      label: '安装路径',
      value: config.defaultInstallDir || 'D:\\Neo-MoFox_Bots'
    },
    {
      icon: 'palette',
      label: '主题模式',
      value: getThemeLabel(config.theme)
    },
    {
      icon: 'description',
      label: '日志保留',
      value: `${config.logging?.maxArchiveDays || 7} 天${config.logging?.compressArchive ? '（压缩）' : ''}`
    },
    {
      icon: 'web',
      label: 'WebUI 自动打开',
      value: config.autoOpenNapcatWebUI !== false ? '已启用' : '已禁用'
    },
    {
      icon: 'update',
      label: '自动检查更新',
      value: config.autoCheckUpdates !== false ? '已启用' : '已禁用'
    },
    {
      icon: 'code',
      label: '配置编辑器',
      value: config.configEditor?.useBuiltIn !== false ? '内置编辑器' : '外部编辑器'
    }
  ];

  container.innerHTML = `
    <div class="step-content finish-content">
      <div class="finish-header">
        <div class="success-icon" id="success-icon">
          <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
            <circle class="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
            <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
          </svg>
        </div>
        
        <h2 class="step-title" style="text-align: center; margin-top: 24px;">设置完成!</h2>
        <p class="step-description" style="text-align: center;">
          您的 Neo-MoFox Launcher 已准备就绪。以下是您的配置摘要:
        </p>
      </div>

      <div class="config-summary" style="margin-top: 32px;">
        ${summaryItems.map(item => `
          <div class="summary-item">
            <span class="material-symbols-rounded summary-icon">${item.icon}</span>
            <div class="summary-content">
              <div class="summary-label">${item.label}</div>
              <div class="summary-value">${item.value}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="finish-tips" style="margin-top: 32px;">
        <div class="tip-box">
          <span class="material-symbols-rounded">tips_and_updates</span>
          <div>
            <strong>小提示:</strong> 所有这些设置都可以稍后在 Launcher 的设置页面中修改。
          </div>
        </div>
        
        <div class="tip-box" style="margin-top: 12px;">
          <span class="material-symbols-rounded">rocket_launch</span>
          <div>
            <strong>下一步:</strong> 点击"开始使用"进入主界面，创建您的第一个 MoFox 实例！
          </div>
        </div>
      </div>
    </div>
  `;

  // 样式
  const style = document.createElement('style');
  style.textContent = `
    .finish-content {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .finish-header {
      width: 100%;
    }
    .success-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto;
      animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .checkmark {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      stroke-width: 2;
      stroke: var(--md-sys-color-primary);
      stroke-miterlimit: 10;
    }
    .checkmark-circle {
      stroke-dasharray: 166;
      stroke-dashoffset: 166;
      animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
    }
    .checkmark-check {
      transform-origin: 50% 50%;
      stroke-dasharray: 48;
      stroke-dashoffset: 48;
      animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.4s forwards;
    }
    @keyframes stroke {
      100% {
        stroke-dashoffset: 0;
      }
    }
    @keyframes scaleIn {
      0% {
        transform: scale(0);
        opacity: 0;
      }
      100% {
        transform: scale(1);
        opacity: 1;
      }
    }
    .config-summary {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .summary-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      background: var(--md-sys-color-surface-variant);
      border-radius: 8px;
      transition: background 0.2s ease;
    }
    .summary-item:hover {
      background: var(--md-sys-color-surface-container-high);
    }
    .summary-icon {
      font-size: 24px;
      color: var(--md-sys-color-primary);
    }
    .summary-content {
      flex: 1;
    }
    .summary-label {
      font-size: 13px;
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 2px;
    }
    .summary-value {
      font-size: 15px;
      font-weight: 500;
      color: var(--md-sys-color-on-surface);
    }
    .finish-tips {
      width: 100%;
    }
    .tip-box {
      display: flex;
      gap: 12px;
      padding: 12px 16px;
      background: rgba(var(--md-sys-color-primary-rgb), 0.08);
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.6;
    }
    .tip-box .material-symbols-rounded {
      font-size: 20px;
      color: var(--md-sys-color-primary);
      margin-top: 2px;
    }
  `;
  container.appendChild(style);

  // 触发动画
  setTimeout(() => {
    document.getElementById('success-icon')?.classList.add('animated');
  }, 100);
}

// 辅助函数: 获取主题模式标签
function getThemeLabel(theme) {
  const labels = {
    'light': '浅色',
    'dark': '深色',
    'auto': '跟随系统'
  };
  return labels[theme] || '深色';
}
