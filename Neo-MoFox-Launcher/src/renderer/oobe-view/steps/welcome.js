/**
 * OOBE 步骤 1: 欢迎页
 */

export async function renderWelcomeStep(container, stepManager) {
  container.innerHTML = `
    <div class="step-content">
      <div class="step-header">
        <h2 class="step-title">欢迎使用 Neo-MoFox Launcher</h2>
        <p class="step-description">
          感谢您选择 Neo-MoFox！这是一个强大的 QQ 机器人管理工具，让您轻松管理多个机器人实例。
        </p>
      </div>

      <div class="welcome-content" style="margin-top: 48px;">
        <div class="feature-list">
          <div class="feature-item">
            <span class="material-symbols-rounded" style="color: var(--md-sys-color-primary); font-size: 32px;">rocket_launch</span>
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 500;">快速部署</h3>
              <p style="margin: 0; font-size: 14px; color: var(--md-sys-color-on-surface-variant);">
                一键创建和管理多个机器人实例
              </p>
            </div>
          </div>

          <div class="feature-item" style="margin-top: 24px;">
            <span class="material-symbols-rounded" style="color: var(--md-sys-color-secondary); font-size: 32px;">monitoring</span>
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 500;">实时监控</h3>
              <p style="margin: 0; font-size: 14px; color: var(--md-sys-color-on-surface-variant);">
                监控实例状态、日志和性能指标
              </p>
            </div>
          </div>

          <div class="feature-item" style="margin-top: 24px;">
            <span class="material-symbols-rounded" style="color: var(--md-sys-color-tertiary); font-size: 32px;">extension</span>
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 500;">插件生态</h3>
              <p style="margin: 0; font-size: 14px; color: var(--md-sys-color-on-surface-variant);">
                支持丰富的插件扩展功能
              </p>
            </div>
          </div>
        </div>

        <div style="margin-top: 48px; padding: 16px; background: var(--md-sys-color-surface-variant); border-radius: 12px;">
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: var(--md-sys-color-on-surface-variant);">
            <span class="material-symbols-rounded" style="vertical-align: middle; font-size: 18px;">info</span>
            接下来，我们将引导您完成环境配置和基础设置，整个过程大约需要 <strong>3-5 分钟</strong>。
          </p>
        </div>
      </div>
    </div>
  `;

  // 特征项样式
  const style = document.createElement('style');
  style.textContent = `
    .feature-item {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
  `;
  container.appendChild(style);

  // 欢迎步骤无需验证，直接允许前进
  return true;
}
