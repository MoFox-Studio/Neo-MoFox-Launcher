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

      <div class="preferences-config" style="margin-top: 32px;">
        <!-- 日志设置 -->
        <div class="config-section">
          <h3 class="config-section-title">
            <span class="material-symbols-rounded">description</span>
            日志管理
          </h3>
          
          <div class="form-field">
            <label class="form-label">日志保存天数: <span id="days-value">${config.logging.maxArchiveDays}</span> 天</label>
            <input 
              type="range" 
              id="max-archive-days" 
              min="1" 
              max="30" 
              value="${config.logging.maxArchiveDays}"
              class="oobe-slider">
            <p class="form-description">旧日志将在超过指定天数后自动删除</p>
          </div>

          <div class="form-field" style="margin-top: 16px;">
            <label class="checkbox-field" style="margin-left: -12px;">
              <input type="checkbox" id="compress-archive" ${config.logging.compressArchive ? 'checked' : ''}>
              <span class="checkbox-label">压缩归档日志</span>
            </label>
            <p class="form-description" style="margin-top: 0px;">启用后将自动压缩旧日志以节省空间</p>
          </div>
        </div>

        <!-- WebUI 设置 -->
        <div class="config-section" style="margin-top: 24px;">
          <h3 class="config-section-title">
            <span class="material-symbols-rounded">web</span>
            WebUI 设置
          </h3>
          
          <div class="form-field">
            <label class="checkbox-field" style="margin-left: -12px;">
              <span class="toggle-switch">
                <input type="checkbox" id="auto-open-webui" style="width:0;height:0;margin:0;padding:0;" ${config.autoOpenNapcatWebUI ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </span>
              <span>实例启动时自动打开 NapCat WebUI</span>
            </label>
            <p class="form-description" style="margin-top: 0px;">方便快速访问实例的 Web 管理界面</p>
          </div>
        </div>

        <!-- 更新设置 -->
        <div class="config-section" style="margin-top: 24px;">
          <h3 class="config-section-title">
            <span class="material-symbols-rounded">update</span>
            更新设置
          </h3>
          
          <div class="form-field">
            <label class="checkbox-field" style="margin-left: -12px;">
              <span class="toggle-switch">
                <input type="checkbox" id="auto-check-updates" style="width:0;height:0;margin:0;padding:0;" ${config.autoCheckUpdates ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </span>
              <span>自动检查更新</span>
            </label>
            <p class="form-description" style="margin-top: 0px;">启动时自动检查 Launcher、NapCat 等组件的更新</p>
          </div>
        </div>

        <!-- 配置编辑器设置 -->
        <div class="config-section" style="margin-top: 24px;">
          <h3 class="config-section-title">
            <span class="material-symbols-rounded">code</span>
            配置编辑器
          </h3>
          
          <div class="form-field">
            <div class="radio-group" style="margin-left: -12px;">
              <label class="radio-option">
                <input type="radio" name="config-editor" value="builtin" ${config.configEditor.useBuiltIn ? 'checked' : ''}>
                <span class="radio-label">使用内置编辑器</span>
              </label>
              <label class="radio-option">
                <input type="radio" name="config-editor" value="external" ${!config.configEditor.useBuiltIn ? 'checked' : ''}>
                <span class="radio-label">使用外部编辑器</span>
              </label>
            </div>
            <p class="form-description" style="margin-top: 12px;">内置编辑器提供语法高亮和实时验证</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // 样式
  const style = document.createElement('style');
  style.textContent = `
    .config-section {
      padding: 16px;
      background: var(--md-sys-color-surface-variant);
      border-radius: 12px;
    }
    .config-section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 500;
      color: var(--md-sys-color-on-surface);
    }
    .config-section-title .material-symbols-rounded {
      font-size: 20px;
      color: var(--md-sys-color-primary);
    }
    .radio-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
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
