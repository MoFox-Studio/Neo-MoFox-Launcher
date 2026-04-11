/**
 * OOBE 步骤 4: 主题设置
 */

import * as ThemeModule from '../../theme.js';

let currentTheme = 'dark';
let currentAccentColor = '#367BF0';

export async function renderThemeStep(container, stepManager) {
  // 尝试从现有配置读取
  const settings = await window.mofoxAPI.settingsRead();
  currentTheme = settings.theme || 'dark';
  currentAccentColor = settings.accentColor || '#367BF0';

  container.innerHTML = `
    <div class="step-content">
      <div class="step-header">
        <h2 class="step-title">个性化主题</h2>
        <p class="step-description">
          选择您喜欢的界面风格，稍后可在设置中随时更改。
        </p>
      </div>

      <div class="theme-config" style="margin-top: 32px;">
        <!-- 主题模式 -->
        <div class="config-section">
          <h3 class="config-section-title">
            <span class="material-symbols-rounded">palette</span>
            主题模式
          </h3>
          <div class="theme-mode-group">
            <div class="theme-mode-option ${currentTheme === 'light' ? 'active' : ''}" data-theme="light">
              <span class="material-symbols-rounded">light_mode</span>
              <span>浅色</span>
            </div>
            <div class="theme-mode-option ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
              <span class="material-symbols-rounded">dark_mode</span>
              <span>深色</span>
            </div>
            <div class="theme-mode-option ${currentTheme === 'auto' ? 'active' : ''}" data-theme="auto">
              <span class="material-symbols-rounded">brightness_auto</span>
              <span>跟随系统</span>
            </div>
          </div>
        </div>

        <!-- 强调色 -->
        <div class="config-section" style="margin-top: 32px;">
          <h3 class="config-section-title">
            <span class="material-symbols-rounded">color_lens</span>
            强调色
          </h3>
          <div class="color-picker-group">
            <div class="color-preset ${currentAccentColor === '#367BF0' ? 'active' : ''}" data-color="#367BF0" style="background: #367BF0;"></div>
            <div class="color-preset ${currentAccentColor === '#2196F3' ? 'active' : ''}" data-color="#2196F3" style="background: #2196F3;"></div>
            <div class="color-preset ${currentAccentColor === '#9C27B0' ? 'active' : ''}" data-color="#9C27B0" style="background: #9C27B0;"></div>
            <div class="color-preset ${currentAccentColor === '#E91E63' ? 'active' : ''}" data-color="#E91E63" style="background: #E91E63;"></div>
            <div class="color-preset ${currentAccentColor === '#FF9800' ? 'active' : ''}" data-color="#FF9800" style="background: #FF9800;"></div>
            <div class="color-preset ${currentAccentColor === '#4CAF50' ? 'active' : ''}" data-color="#4CAF50" style="background: #4CAF50;"></div>
          </div>
          <div style="margin-top: 16px;">
            <label class="form-label">自定义颜色</label>
            <input type="color" id="custom-color" value="${currentAccentColor}" style="width: 100%; height: 48px; border: none; border-radius: 8px; cursor: pointer;">
          </div>
        </div>

        <div style="margin-top: 24px; padding: 12px 16px; background: var(--md-sys-color-surface-variant); border-radius: 8px; font-size: 13px;">
          <span class="material-symbols-rounded" style="vertical-align: middle; font-size: 16px;">info</span>
          主题设置将实时预览，并应用到整个 Launcher
        </div>
      </div>
    </div>
  `;

  //样式
  const style = document.createElement('style');
  style.textContent = `
    .theme-mode-group {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .theme-mode-option {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 16px;
      border-radius: 8px;
      background: var(--md-sys-color-surface-variant);
      cursor: pointer;
      transition: all 0.2s ease;
      border: 2px solid transparent;
    }
    .theme-mode-option:hover {
      background: var(--md-sys-color-surface-container-high);
    }
    .theme-mode-option.active {
      border-color: var(--md-sys-color-primary);
      background: rgba(var(--md-sys-color-primary-rgb), 0.1);
    }
    .theme-mode-option .material-symbols-rounded {
      font-size: 32px;
    }
    .color-picker-group {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 12px;
    }
    .color-preset {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 8px;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      border: 3px solid transparent;
    }
    .color-preset:hover {
      transform: scale(1.1);
    }
    .color-preset.active {
      border-color: white;
      box-shadow: 0 0 0 2px var(--md-sys-color-outline);
      transform: scale(1.15);
    }
  `;
  container.appendChild(style);

  // 主题模式选择
  document.querySelectorAll('.theme-mode-option').forEach(option => {
    option.addEventListener('click', async () => {
      document.querySelectorAll('.theme-mode-option').forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
      currentTheme = option.dataset.theme;
      await applyThemePreview();
    });
  });

  // 预设颜色选择
  document.querySelectorAll('.color-preset').forEach(preset => {
    preset.addEventListener('click', async () => {
      document.querySelectorAll('.color-preset').forEach(pre => pre.classList.remove('active'));
      preset.classList.add('active');
      currentAccentColor = preset.dataset.color;
      document.getElementById('custom-color').value = currentAccentColor;
      await applyThemePreview();
    });
  });

  // 自定义颜色
  document.getElementById('custom-color')?.addEventListener('change', async (e) => {
    currentAccentColor = e.target.value;
    document.querySelectorAll('.color-preset').forEach(pre => pre.classList.remove('active'));
    await applyThemePreview();
  });

  // 应用主题（实时预览）
  async function applyThemePreview() {
    try {
      await window.mofoxAPI.themeUpdate({
        theme: currentTheme,
        accentColor: currentAccentColor
      });
      ThemeModule.applyTheme({ theme: currentTheme, accentColor: currentAccentColor });
      
      // 更新 stepManager 的配置（确保 OOBE 完成时保存的是最新值）
      stepManager.config.theme = currentTheme;
      stepManager.config.accentColor = currentAccentColor;
      
      console.log('[Theme] 主题已更新:', currentTheme, currentAccentColor);
    } catch (error) {
      console.error('[Theme] 更新主题失败:', error);
    }
  }

  // 初始保存配置
  stepManager.config.theme = currentTheme;
  stepManager.config.accentColor = currentAccentColor;
}
