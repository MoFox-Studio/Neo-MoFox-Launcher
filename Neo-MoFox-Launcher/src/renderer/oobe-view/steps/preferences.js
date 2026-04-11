/**
 * OOBE 步骤 5: 首选项配置
 */

export async function renderPreferencesStep(container, stepManager) {
  // 从现有配置读取默认值
  const settings = await window.mofoxAPI.settingsRead();
  
  const config = {
    // 日志配置
    logging: {
      maxArchiveDays: settings.logging?.maxArchiveDays || 7,
      compressArchive: settings.logging?.compressArchive !== false // 默认 true
    },
    // WebUI 自动打开
    autoOpenNapcatWebUI: settings.autoOpenNapcatWebUI !== false, // 默认 true
    // 自动检查更新
    autoCheckUpdates: settings.autoCheckUpdates !== false, // 默认 true
    // 配置编辑器
    configEditor: {
      useBuiltIn: settings.configEditor?.useBuiltIn !== false // 默认 true
    }
  };

  container.innerHTML = `
    <div class="step-content">
      <div class="step-header">
        <h2 class="step-title">首选项配置</h2>
        <p class="step-description">
          自定义 Launcher 的行为和偏好设置。这些选项可在设置中随时调整。
        </p>
      </div>

      <div class="preferences-config">
        <!-- 日志设置 -->
        <div class="config-section">
          <div class="config-header">
            <div class="config-icon">
              <span class="material-symbols-rounded">description</span>
            </div>
            <div class="config-title-group">
              <h3 class="config-title">日志管理</h3>
              <p class="config-subtitle">配置日志保存天数与存储优化</p>
            </div>
          </div>
          
          <div class="form-field">
            <label class="form-label" style="display: block; margin-bottom: 4px; font-weight: 500; font-size: 14px; color: var(--md-sys-color-on-surface);">日志保存天数</label>
            <div class="oobe-slider-container">
              <input 
                type="range" 
                id="max-archive-days" 
                min="1" 
                max="30" 
                value="${config.logging.maxArchiveDays}"
                class="oobe-slider">
              <div class="slider-value"><span id="days-value">${config.logging.maxArchiveDays}</span> 天</div>
            </div>
            <p class="form-description" style="margin-top: 8px;">旧日志将在超过指定天数后自动删除</p>
          </div>

          <div class="form-field" style="margin-top: 16px;">
            <label class="checkbox-field">
              <input type="checkbox" id="compress-archive" ${config.logging.compressArchive ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--md-sys-color-primary);">
              <span class="checkbox-label" style="font-weight: 500; font-size: 14px; color: var(--md-sys-color-on-surface);">压缩归档日志</span>
            </label>
            <p class="form-description" style="margin-left: 42px;">启用后将自动压缩旧日志以节省空间</p>
          </div>
        </div>

        <!-- WebUI 设置 -->
        <div class="config-section">
          <div class="config-header">
            <div class="config-icon" style="background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container);">
              <span class="material-symbols-rounded">web</span>
            </div>
            <div class="config-title-group">
              <h3 class="config-title">WebUI 设置</h3>
              <p class="config-subtitle">管理 Web 界面的启动行为</p>
            </div>
          </div>
          
          <div class="form-field">
            <label class="checkbox-field">
              <span class="toggle-switch">
                <input type="checkbox" id="auto-open-webui" style="width:0;height:0;margin:0;padding:0;" ${config.autoOpenNapcatWebUI ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </span>
              <span style="font-weight: 500; font-size: 14px; color: var(--md-sys-color-on-surface);">自动打开 NapCat WebUI</span>
            </label>
            <p class="form-description" style="margin-left: 56px;">实例启动时自动在浏览器中打开管理界面</p>
          </div>
        </div>

        <!-- 更新设置 -->
        <div class="config-section">
          <div class="config-header">
            <div class="config-icon" style="background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container);">
              <span class="material-symbols-rounded">update</span>
            </div>
            <div class="config-title-group">
              <h3 class="config-title">自动更新设置</h3>
              <p class="config-subtitle">保持组件处于最新状态</p>
            </div>
          </div>
          
          <div class="form-field">
            <label class="checkbox-field">
              <span class="toggle-switch">
                <input type="checkbox" id="auto-check-updates" style="width:0;height:0;margin:0;padding:0;" ${config.autoCheckUpdates ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </span>
              <span style="font-weight: 500; font-size: 14px; color: var(--md-sys-color-on-surface);">启动时检查更新</span>
            </label>
            <p class="form-description" style="margin-left: 56px;">启动时自动检查 Launcher 和框架组件的更新</p>
          </div>
        </div>

        <!-- 配置编辑器设置 -->
        <div class="config-section">
          <div class="config-header">
            <div class="config-icon" style="background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);">
              <span class="material-symbols-rounded">code</span>
            </div>
            <div class="config-title-group">
              <h3 class="config-title">配置编辑器偏好</h3>
              <p class="config-subtitle">选择默认的配置文件编辑方式</p>
            </div>
          </div>
          
          <div class="form-field">
            <div class="radio-group" style="margin-left: -4px;">
              <label class="radio-option">
                <input type="radio" name="config-editor" value="builtin" style="width: 18px; height: 18px; accent-color: var(--md-sys-color-primary);" ${config.configEditor.useBuiltIn ? 'checked' : ''}>
                <span class="radio-label" style="font-weight: 500; font-size: 14px; color: var(--md-sys-color-on-surface);">使用内置编辑器</span>
              </label>
              <p class="form-description" style="margin-left: 38px; margin-top: -4px; margin-bottom: 8px;">推荐。提供语法高亮和实时验证功能</p>
              <label class="radio-option">
                <input type="radio" name="config-editor" value="external" style="width: 18px; height: 18px; accent-color: var(--md-sys-color-primary);" ${!config.configEditor.useBuiltIn ? 'checked' : ''}>
                <span class="radio-label" style="font-weight: 500; font-size: 14px; color: var(--md-sys-color-on-surface);">使用外部系统默认编辑器</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // 样式
  const style = document.createElement('style');
  style.textContent = `
    .preferences-config {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 24px;
    }
    .config-section {
      padding: 20px;
      background: var(--md-sys-color-surface-container, rgba(0,0,0,0.03));
      border: 1px solid var(--md-sys-color-outline-variant, rgba(0,0,0,0.08));
      border-radius: 16px;
      transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
    }
    .config-section:hover {
      background: var(--md-sys-color-surface-container-highest, rgba(0,0,0,0.06));
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      transform: translateY(-1px);
    }
    .config-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }
    .config-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--md-sys-color-primary-container);
      color: var(--md-sys-color-on-primary-container);
    }
    .config-icon .material-symbols-rounded {
      font-size: 24px;
    }
    .config-title-group {
      display: flex;
      flex-direction: column;
    }
    .config-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--md-sys-color-on-surface);
    }
    .config-subtitle {
      margin: 2px 0 0 0;
      font-size: 13px;
      color: var(--md-sys-color-on-surface-variant);
    }
    .form-field {
      margin-left: 60px;
    }
    .oobe-slider-container {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 12px;
    }
    .oobe-slider {
      flex: 1;
      -webkit-appearance: none;
      height: 6px;
      background: var(--md-sys-color-surface-variant);
      border-radius: 3px;
      outline: none;
    }
    .oobe-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--md-sys-color-primary);
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      transition: transform 0.1s;
    }
    .oobe-slider::-webkit-slider-thumb:hover {
      transform: scale(1.2);
    }
    .slider-value {
      font-size: 14px;
      font-weight: 600;
      color: var(--md-sys-color-primary);
      background: var(--md-sys-color-primary-container);
      padding: 4px 12px;
      border-radius: 12px;
      min-width: 48px;
      text-align: center;
    }
    .form-description {
      font-size: 13px;
      color: var(--md-sys-color-on-surface-variant);
      margin: 4px 0 0 0;
    }
    .checkbox-field {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      padding: 8px 12px;
      margin-left: -12px;
      border-radius: 8px;
      transition: background-color 0.2s;
    }
    .checkbox-field:hover {
      background: var(--md-sys-color-surface-variant);
    }
    .radio-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .radio-option {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      padding: 8px 12px;
      border-radius: 8px;
      transition: background-color 0.2s;
    }
    .radio-option:hover {
      background: var(--md-sys-color-surface-variant);
    }
  `;
  container.appendChild(style);

  // 获取元素
  const sliderDays = document.getElementById('max-archive-days');
  const daysValue = document.getElementById('days-value');
  const checkboxCompress = document.getElementById('compress-archive');
  const toggleWebUI = document.getElementById('auto-open-webui');
  const toggleUpdates = document.getElementById('auto-check-updates');
  const radioBuiltIn = document.querySelector('input[name="config-editor"][value="builtin"]');
  const radioExternal = document.querySelector('input[name="config-editor"][value="external"]');

  // 事件监听
  sliderDays?.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    daysValue.textContent = value;
    config.logging.maxArchiveDays = value;
    updateConfig();
  });

  checkboxCompress?.addEventListener('change', (e) => {
    config.logging.compressArchive = e.target.checked;
    updateConfig();
  });

  toggleWebUI?.addEventListener('change', (e) => {
    config.autoOpenNapcatWebUI = e.target.checked;
    updateConfig();
  });

  toggleUpdates?.addEventListener('change', (e) => {
    config.autoCheckUpdates = e.target.checked;
    updateConfig();
  });

  radioBuiltIn?.addEventListener('change', () => {
    config.configEditor.useBuiltIn = true;
    updateConfig();
  });

  radioExternal?.addEventListener('change', () => {
    config.configEditor.useBuiltIn = false;
    updateConfig();
  });

  // 更新配置到 stepManager
  function updateConfig() {
    stepManager.config.logging = config.logging;
    stepManager.config.autoOpenNapcatWebUI = config.autoOpenNapcatWebUI;
    stepManager.config.autoCheckUpdates = config.autoCheckUpdates;
    stepManager.config.configEditor = config.configEditor;
  }

  // 初始化配置
  updateConfig();
}
