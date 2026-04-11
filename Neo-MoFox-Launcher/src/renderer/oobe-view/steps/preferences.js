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
        <div class="settings-card">
          <div class="settings-card-header">
            <span class="material-symbols-rounded">description</span>
            <div>
              <div class="card-title">日志管理</div>
              <div class="card-desc">配置日志保存天数与存储优化</div>
            </div>
          </div>
          
          <div class="form-field">
            <label class="form-label">日志保存天数</label>
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
            <p class="card-desc" style="margin-top: 8px;">旧日志将在超过指定天数后自动删除</p>
          </div>

          <div class="form-field" style="margin-top: 16px;">
            <label class="switch-row">
              <input type="checkbox" class="settings-switch" id="compress-archive" ${config.logging.compressArchive ? 'checked' : ''}>
              <span class="switch-label">压缩归档日志</span>
            </label>
            <p class="card-desc" style="margin-top: 4px;">启用后将自动压缩旧日志以节省空间</p>
          </div>
        </div>

        <!-- WebUI 设置 -->
        <div class="settings-card">
          <div class="settings-card-header">
            <span class="material-symbols-rounded">web</span>
            <div>
              <div class="card-title">WebUI 设置</div>
              <div class="card-desc">管理 Web 界面的启动行为</div>
            </div>
          </div>
          
          <div class="form-field">
            <label class="switch-row">
              <input type="checkbox" class="settings-switch" id="auto-open-webui" ${config.autoOpenNapcatWebUI ? 'checked' : ''}>
              <span class="switch-label">自动打开 NapCat WebUI</span>
            </label>
            <p class="card-desc" style="margin-top: 4px;">实例启动时自动在浏览器中打开管理界面</p>
          </div>
        </div>

        <!-- 更新设置 -->
        <div class="settings-card">
          <div class="settings-card-header">
            <span class="material-symbols-rounded">update</span>
            <div>
              <div class="card-title">自动更新设置</div>
              <div class="card-desc">保持组件处于最新状态</div>
            </div>
          </div>
          
          <div class="form-field">
            <label class="switch-row">
              <input type="checkbox" class="settings-switch" id="auto-check-updates" ${config.autoCheckUpdates ? 'checked' : ''}>
              <span class="switch-label">启动时检查更新</span>
            </label>
            <p class="card-desc" style="margin-top: 4px;">启动时自动检查 Launcher 和框架组件的更新</p>
          </div>
        </div>

        <!-- 配置编辑器设置 -->
        <div class="settings-card">
          <div class="settings-card-header">
            <span class="material-symbols-rounded">edit_note</span>
            <div>
              <div class="card-title">配置编辑器偏好</div>
              <div class="card-desc">选择默认的配置文件编辑方式</div>
            </div>
          </div>
          
          <div class="editor-options">
            <button class="editor-option" data-editor="builtin" id="editor-builtin">
              <span class="material-symbols-rounded editor-icon">code</span>
              <div class="editor-info">
                <span class="editor-label">内置编辑器</span>
                <span class="editor-desc">Launcher 内置的轻量级编辑器</span>
              </div>
              <span class="material-symbols-rounded editor-check">check_circle</span>
            </button>
            <button class="editor-option" data-editor="system" id="editor-system">
              <span class="material-symbols-rounded editor-icon">open_in_new</span>
              <div class="editor-info">
                <span class="editor-label">系统编辑器</span>
                <span class="editor-desc">使用系统默认的文本编辑器</span>
              </div>
              <span class="material-symbols-rounded editor-check">check_circle</span>
            </button>
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
      gap: 20px;
      margin-top: 24px;
    }
    
    /* 导入设置卡片样式 */
    .settings-card {
      background: var(--md-sys-color-surface-container-low);
      border: 1px solid rgba(var(--md-sys-color-on-surface-rgb, 0 0 0), 0.05);
      border-radius: 16px;
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }
    
    .settings-card:hover {
      border-color: rgba(var(--md-sys-color-on-surface-rgb, 0 0 0), 0.1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    
    .settings-card-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }
    
    .settings-card-header > .material-symbols-rounded {
      font-size: 22px;
      color: var(--md-sys-color-primary);
      margin-top: 2px;
      flex-shrink: 0;
    }
    
    .settings-card-header > div {
      flex: 1;
      min-width: 0;
    }
    
    .card-title {
      font-size: 1rem;
      font-weight: 500;
      color: var(--md-sys-color-on-surface);
      margin-bottom: 2px;
    }
    
    .card-desc {
      font-size: 0.813rem;
      color: var(--md-sys-color-on-surface-variant);
      line-height: 1.4;
    }
    
    .form-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .form-label {
      display: block;
      margin-bottom: 4px;
      font-weight: 500;
      font-size: 14px;
      color: var(--md-sys-color-on-surface);
    }
    
    /* 滑块样式 */
    .oobe-slider-container {
      display: flex;
      align-items: center;
      gap: 16px;
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
      min-width: 60px;
      text-align: center;
    }
    
    /* Switch 样式 */
    .switch-row {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      user-select: none;
    }
    
    .settings-switch {
      position: relative;
      appearance: none;
      width: 48px;
      height: 28px;
      background: var(--md-sys-color-surface-variant);
      border: 2px solid var(--md-sys-color-outline);
      border-radius: 14px;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
      outline: none;
      flex-shrink: 0;
    }
    
    .settings-switch::before {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      background: var(--md-sys-color-on-surface-variant);
      border-radius: 50%;
      transition: transform 0.2s, background 0.2s;
    }
    
    .settings-switch:checked {
      background: var(--md-sys-color-primary);
      border-color: var(--md-sys-color-primary);
    }
    
    .settings-switch:checked::before {
      transform: translateX(20px);
      background: var(--md-sys-color-on-primary);
    }
    
    .settings-switch:focus {
      box-shadow: 0 0 0 2px var(--md-sys-color-primary-container);
    }
    
    .switch-label {
      font-size: 0.9rem;
      color: var(--md-sys-color-on-surface);
    }
    
    /* Editor Options 样式 */
    .editor-options {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .editor-option {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 18px;
      border: 2px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      background: var(--md-sys-color-surface-container);
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s, transform 0.15s, box-shadow 0.2s;
      position: relative;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
      text-align: left;
    }
    
    .editor-option:hover {
      border-color: rgba(var(--md-sys-color-primary-rgb, 103 80 164), 0.5);
      background: var(--md-sys-color-surface-container-high);
      transform: translateX(2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    
    .editor-option.selected {
      border-color: var(--md-sys-color-primary);
      background: rgba(var(--md-sys-color-primary-container-rgb, 234 221 255), 0.2);
    }
    
    .editor-icon {
      font-size: 24px;
      color: var(--md-sys-color-on-surface-variant);
      transition: color 0.2s;
      flex-shrink: 0;
    }
    
    .editor-option.selected .editor-icon {
      color: var(--md-sys-color-primary);
    }
    
    .editor-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .editor-label {
      font-size: 0.938rem;
      font-weight: 500;
      color: var(--md-sys-color-on-surface);
      line-height: 1.3;
    }
    
    .editor-desc {
      font-size: 0.75rem;
      color: var(--md-sys-color-on-surface-variant);
      line-height: 1.3;
    }
    
    .editor-check {
      font-size: 20px;
      color: var(--md-sys-color-primary);
      opacity: 0;
      transition: opacity 0.2s, transform 0.2s;
      flex-shrink: 0;
    }
    
    .editor-option.selected .editor-check {
      opacity: 1;
      transform: scale(1.1);
    }
  `;
  container.appendChild(style);

  // 获取元素
  const sliderDays = document.getElementById('max-archive-days');
  const daysValue = document.getElementById('days-value');
  const checkboxCompress = document.getElementById('compress-archive');
  const toggleWebUI = document.getElementById('auto-open-webui');
  const toggleUpdates = document.getElementById('auto-check-updates');
  const editorBuiltIn = document.getElementById('editor-builtin');
  const editorSystem = document.getElementById('editor-system');

  // 初始化编辑器选项状态
  if (config.configEditor.useBuiltIn) {
    editorBuiltIn?.classList.add('selected');
  } else {
    editorSystem?.classList.add('selected');
  }

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

  editorBuiltIn?.addEventListener('click', () => {
    editorBuiltIn.classList.add('selected');
    editorSystem?.classList.remove('selected');
    config.configEditor.useBuiltIn = true;
    updateConfig();
  });

  editorSystem?.addEventListener('click', () => {
    editorSystem.classList.add('selected');
    editorBuiltIn?.classList.remove('selected');
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
